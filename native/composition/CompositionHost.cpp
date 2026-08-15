#include "composition/CompositionHost.h"

#include "composition/Effects.h"
#include "composition/GlassMaterial.h"

#include <DispatcherQueue.h>
#include <Windows.UI.Composition.Interop.h>
#include <dwmapi.h>

#include <algorithm>
#include <stdexcept>

#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Graphics.Effects.h>
#include <winrt/Windows.UI.h>
#include <winrt/base.h>

namespace lgt::composition {
namespace {

namespace ui = winrt::Windows::UI;
namespace wc = winrt::Windows::UI::Composition;
namespace desktop = winrt::Windows::UI::Composition::Desktop;
namespace effectsAbi = ABI::Windows::Graphics::Effects;
namespace desktopAbi = ABI::Windows::UI::Composition::Desktop;

void ClearShapes(const wc::CompositionShapeCollection& shapes) {
  while (shapes.Size() != 0) shapes.RemoveAtEnd();
}

ui::Color Color(std::uint32_t rgb, float opacity) {
  const auto alpha = static_cast<std::uint8_t>(
      std::clamp(opacity, 0.0F, 1.0F) * 255.0F + 0.5F);
  return {alpha, static_cast<std::uint8_t>((rgb >> 16) & 0xFF),
          static_cast<std::uint8_t>((rgb >> 8) & 0xFF), static_cast<std::uint8_t>(rgb & 0xFF)};
}

std::uint32_t RgbFromColorRef(COLORREF value) {
  return (static_cast<std::uint32_t>(GetRValue(value)) << 16) |
         (static_cast<std::uint32_t>(GetGValue(value)) << 8) |
         static_cast<std::uint32_t>(GetBValue(value));
}

std::uint32_t ForegroundColor(const settings::Settings& settings,
                               const platform::PolicySnapshot& policy) {
  if (policy.highContrast) return RgbFromColorRef(GetSysColor(COLOR_WINDOWTEXT));
  constexpr std::uint32_t preferredLight = 0xF5F5F5;
  constexpr std::uint32_t preferredDark = 0x202124;
  if (settings.foreground == settings::Foreground::Light) return preferredLight;
  if (settings.foreground == settings::Foreground::Dark) return preferredDark;
  return RgbFromColorRef(GetSysColor(COLOR_WINDOWTEXT));
}

}  // namespace

CompositionHost::~CompositionHost() { Reset(); }

bool CompositionHost::Initialize(HWND window) {
  Reset();
  window_ = window;
  try {
    EnsureDispatcherQueue();
    ConfigureDwm(false, true);
    compositor_ = wc::Compositor();
    const auto interop = compositor_.as<desktopAbi::ICompositorDesktopInterop>();
    winrt::check_hresult(interop->CreateDesktopWindowTarget(
        window_, false,
        reinterpret_cast<desktopAbi::IDesktopWindowTarget**>(winrt::put_abi(target_))));
    RefreshCapabilities();
    CreateVisualTree();
    target_.Root(root_);
    state_ = AppearanceState::Glass;
    stateReason_.clear();
    return true;
  } catch (...) {
    Reset();
    window_ = window;
    state_ = AppearanceState::Safe;
    stateReason_ = L"composition-initialization-failed";
    return false;
  }
}

void CompositionHost::Reset() noexcept {
  try {
    if (target_) target_.Root(nullptr);
    if (capabilities_ && capabilitiesChangedToken_.value != 0) {
      capabilities_.Changed(capabilitiesChangedToken_);
    }
  } catch (...) {
  }
  capabilitiesChangedToken_ = {};
  capabilities_ = nullptr;
  ReleaseGlassBlurBrush();
  solidBrush_ = nullptr;
  titlebarLayer_ = nullptr;
  overlayRoot_ = nullptr;
  webRoot_ = nullptr;
  borderLayer_ = nullptr;
  blurLayer_ = nullptr;
  solidLayer_ = nullptr;
  root_ = nullptr;
  target_ = nullptr;
  compositor_ = nullptr;
  dispatcher_ = nullptr;
  if (coreMessaging_) {
    FreeLibrary(coreMessaging_);
    coreMessaging_ = nullptr;
  }
  if (window_ && IsWindow(window_)) {
    const BOOL disabled = FALSE;
    const DWM_SYSTEMBACKDROP_TYPE backdrop = DWMSBT_NONE;
    const DWM_WINDOW_CORNER_PREFERENCE corner = DWMWCP_DEFAULT;
    const COLORREF border = DWMWA_COLOR_DEFAULT;
    const MARGINS margins{};
    DwmExtendFrameIntoClientArea(window_, &margins);
    DwmSetWindowAttribute(window_, DWMWA_USE_HOSTBACKDROPBRUSH, &disabled, sizeof(disabled));
    DwmSetWindowAttribute(window_, DWMWA_SYSTEMBACKDROP_TYPE, &backdrop, sizeof(backdrop));
    DwmSetWindowAttribute(window_, DWMWA_WINDOW_CORNER_PREFERENCE, &corner, sizeof(corner));
    DwmSetWindowAttribute(window_, DWMWA_BORDER_COLOR, &border, sizeof(border));
  }
  dwmConfigured_ = false;
  window_ = nullptr;
}

bool CompositionHost::Rebuild() {
  const HWND window = window_;
  const auto settings = settings_;
  const auto policy = policy_;
  const auto width = width_;
  const auto height = height_;
  const auto dpi = dpi_;
  const auto zoom = webZoom_;
  if (!Initialize(window)) return false;
  Resize(width, height, dpi, zoom);
  SetAppearance(settings, policy);
  return state_ != AppearanceState::Safe;
}

void CompositionHost::EnsureDispatcherQueue() {
  if (winrt::Windows::System::DispatcherQueue::GetForCurrentThread()) return;
  coreMessaging_ = LoadLibraryExW(L"CoreMessaging.dll", nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
  if (!coreMessaging_) winrt::throw_last_error();
  using CreateDispatcherQueueControllerFn = HRESULT(WINAPI*)(
      DispatcherQueueOptions, ABI::Windows::System::IDispatcherQueueController**);
  const auto createController = reinterpret_cast<CreateDispatcherQueueControllerFn>(
      GetProcAddress(coreMessaging_, "CreateDispatcherQueueController"));
  if (!createController) throw std::runtime_error("CreateDispatcherQueueController unavailable");
  const DispatcherQueueOptions options{sizeof(options), DQTYPE_THREAD_CURRENT, DQTAT_COM_NONE};
  winrt::check_hresult(createController(
      options, reinterpret_cast<ABI::Windows::System::IDispatcherQueueController**>(
                   winrt::put_abi(dispatcher_))));
}

void CompositionHost::ConfigureDwm(bool useHostBackdrop, bool force) {
  if (dwmConfigured_ && !force) return;
  const BOOL hostBackdrop = useHostBackdrop ? TRUE : FALSE;
  const DWM_SYSTEMBACKDROP_TYPE backdrop = DWMSBT_NONE;
  const DWM_WINDOW_CORNER_PREFERENCE corner = DWMWCP_ROUND;
  const COLORREF border = DWMWA_COLOR_NONE;
  const MARGINS margins = useHostBackdrop ? MARGINS{-1, -1, -1, -1} : MARGINS{};
  winrt::check_hresult(DwmExtendFrameIntoClientArea(window_, &margins));
  winrt::check_hresult(DwmSetWindowAttribute(window_, DWMWA_USE_HOSTBACKDROPBRUSH,
                                             &hostBackdrop, sizeof(hostBackdrop)));
  winrt::check_hresult(DwmSetWindowAttribute(window_, DWMWA_SYSTEMBACKDROP_TYPE, &backdrop,
                                             sizeof(backdrop)));
  winrt::check_hresult(DwmSetWindowAttribute(window_, DWMWA_WINDOW_CORNER_PREFERENCE, &corner,
                                             sizeof(corner)));
  DwmSetWindowAttribute(window_, DWMWA_BORDER_COLOR, &border, sizeof(border));
  dwmConfigured_ = true;
}

void CompositionHost::RefreshCapabilities() {
  try {
    if (!capabilities_) {
      capabilities_ = wc::CompositionCapabilities::GetForCurrentView();
      const HWND window = window_;
      capabilitiesChangedToken_ = capabilities_.Changed([window](const auto&, const auto&) {
        if (window && IsWindow(window)) {
          PostMessageW(window, platform::kSystemPolicyChangedMessage, 0, 0);
        }
      });
    }
    effectsSupported_ = capabilities_.AreEffectsSupported();
    effectsFast_ = capabilities_.AreEffectsFast();
  } catch (...) {
    effectsSupported_ = false;
    effectsFast_ = false;
  }
}

void CompositionHost::CreateVisualTree() {
  root_ = compositor_.CreateContainerVisual();
  root_.RelativeSizeAdjustment({1.0F, 1.0F});
  solidLayer_ = compositor_.CreateSpriteVisual();
  blurLayer_ = compositor_.CreateSpriteVisual();
  borderLayer_ = compositor_.CreateShapeVisual();
  webRoot_ = compositor_.CreateContainerVisual();
  overlayRoot_ = compositor_.CreateContainerVisual();
  titlebarLayer_ = compositor_.CreateShapeVisual();
  for (const auto& layer : {solidLayer_, blurLayer_}) {
    layer.RelativeSizeAdjustment({1.0F, 1.0F});
  }
  webRoot_.RelativeSizeAdjustment({1.0F, 1.0F});
  overlayRoot_.RelativeSizeAdjustment({1.0F, 1.0F});
  root_.Children().InsertAtTop(solidLayer_);
  root_.Children().InsertAtTop(blurLayer_);
  root_.Children().InsertAtTop(borderLayer_);
  root_.Children().InsertAtTop(webRoot_);
  overlayRoot_.Children().InsertAtTop(titlebarLayer_);
  root_.Children().InsertAtTop(overlayRoot_);
  solidBrush_ = compositor_.CreateColorBrush();
  solidLayer_.Brush(solidBrush_);
  blurLayer_.Opacity(1.0F);
  blurLayer_.IsVisible(false);
  borderLayer_.Opacity(0.0F);
}

void CompositionHost::EnsureGlassBlurBrush(std::uint32_t blurDips) {
  blurDips = std::clamp(blurDips, protocol::kBlurDipsConstraint.minimum,
                        protocol::kBlurDipsConstraint.maximum);
  if (!backdropBrush_) backdropBrush_ = compositor_.CreateHostBackdropBrush();
  if (!blurBrush_) {
    const auto blurredSource = wc::CompositionEffectSourceParameter(L"blurredBackdrop");
    auto blur = Microsoft::WRL::Make<effects::GaussianBlurEffect>();
    if (!blur) throw std::bad_alloc();
    Microsoft::WRL::Wrappers::HStringReference blurName{L"Blur"};
    winrt::check_hresult(blur->put_Name(blurName.Get()));
    blur->BlurAmount(static_cast<float>(blurDips));
    winrt::check_hresult(blur->SetSource(
        reinterpret_cast<effectsAbi::IGraphicsEffectSource*>(winrt::get_abi(blurredSource))));

    Microsoft::WRL::ComPtr<effectsAbi::IGraphicsEffect> graphAbi;
    winrt::check_hresult(blur.As(&graphAbi));
    winrt::Windows::Graphics::Effects::IGraphicsEffect graph{nullptr};
    winrt::copy_from_abi(graph, graphAbi.Get());
    blurBrush_ = compositor_.CreateEffectFactory(graph, {L"Blur.BlurAmount"}).CreateBrush();
    blurBrush_.SetSourceParameter(L"blurredBackdrop", backdropBrush_);
    blurDips_ = blurDips;
  } else if (blurDips_ != blurDips) {
    blurBrush_.Properties().InsertScalar(L"Blur.BlurAmount", static_cast<float>(blurDips));
    blurDips_ = blurDips;
  }
  blurLayer_.Brush(blurBrush_);
}

void CompositionHost::ReleaseGlassBlurBrush() noexcept {
  try {
    if (blurLayer_) blurLayer_.Brush(nullptr);
  } catch (...) {
  }
  blurBrush_ = nullptr;
  backdropBrush_ = nullptr;
  blurDips_ = 0;
}

void CompositionHost::Resize(UINT width, UINT height, UINT dpi, double webZoom) {
  try {
    width_ = width;
    height_ = height;
    dpi_ = dpi == 0 ? 96 : dpi;
    webZoom_ = std::clamp(webZoom, 0.8, 2.0);
    const winrt::Windows::Foundation::Numerics::float2 size{static_cast<float>(width_),
                                                            static_cast<float>(height_)};
    for (const auto& layer : {borderLayer_, titlebarLayer_}) {
      if (layer) layer.Size(size);
    }
    RebuildShapes();
    RebuildTitleBar();
  } catch (const winrt::hresult_error& error) {
    MarkFailure(L"resize", error.code());
  } catch (...) {
    MarkFailure(L"resize", E_FAIL);
  }
}

void CompositionHost::RebuildShapes() noexcept {
  if (!compositor_ || !borderLayer_) return;
  try {
    RebuildShapesCore();
    shapeStage_ = L"idle";
  } catch (const winrt::hresult_error& error) {
    MarkFailure(L"shape-" + std::wstring(shapeStage_), error.code());
  } catch (...) {
    MarkFailure(L"shape-" + std::wstring(shapeStage_), E_FAIL);
  }
}

void CompositionHost::MarkFailure(std::wstring_view stage, HRESULT error) noexcept {
  wchar_t code[16]{};
  swprintf_s(code, L"0x%08X", static_cast<unsigned int>(error));
  state_ = AppearanceState::Safe;
  stateReason_ = L"composition-" + std::wstring(stage) + L"-" + code;
  try {
    ConfigureDwm(false, true);
  } catch (...) {
  }
  try {
    if (solidLayer_) solidLayer_.IsVisible(true);
    if (blurLayer_) blurLayer_.IsVisible(false);
    if (borderLayer_) borderLayer_.IsVisible(false);
  } catch (...) {
  }
  ReleaseGlassBlurBrush();
  if (window_ && (error == DXGI_ERROR_DEVICE_REMOVED || error == DXGI_ERROR_DEVICE_RESET ||
                  error == DXGI_ERROR_DEVICE_HUNG || error == D2DERR_RECREATE_TARGET)) {
    PostMessageW(window_, kCompositionDeviceLostMessage, 0, 0);
  }
}

void CompositionHost::RebuildShapesCore() {
  shapeStage_ = L"clear";
  ClearShapes(borderLayer_.Shapes());
  const bool glass = state_ == AppearanceState::Glass;
  const std::uint32_t fallbackColor = RgbFromColorRef(GetSysColor(COLOR_WINDOW));
  solidBrush_.Color(Color(fallbackColor, 1.0F));
  solidLayer_.IsVisible(!glass);
  blurLayer_.Opacity(1.0F);
  blurLayer_.IsVisible(glass && blurBrush_ != nullptr);
  borderLayer_.IsVisible(!policy_.highContrast && glass);

  const float scale = static_cast<float>(dpi_) / 96.0F;
  if (glass && width_ > 1 && height_ > 1) {
    auto outerGeometry = compositor_.CreateRectangleGeometry();
    outerGeometry.Offset({0.5F * scale, 0.5F * scale});
    outerGeometry.Size({std::max(0.0F, static_cast<float>(width_) - scale),
                        std::max(0.0F, static_cast<float>(height_) - scale)});
    auto outer = compositor_.CreateSpriteShape(outerGeometry);
    outer.StrokeBrush(compositor_.CreateColorBrush(
        ui::Color{static_cast<std::uint8_t>(active_ ? 77 : 46), 255, 255, 255}));
    outer.StrokeThickness(std::max(1.0F, scale));
    borderLayer_.Shapes().Append(outer);
  }

  borderLayer_.Opacity(glass ? (active_ ? 1.0F : 0.72F) : 0.0F);
}

void CompositionHost::RebuildTitleBar() {
  if (!titlebarLayer_) return;
  ClearShapes(titlebarLayer_.Shapes());
  titlebarLayer_.IsVisible(!fullscreen_);
  if (fullscreen_) return;
  const float scale = static_cast<float>(dpi_) / 96.0F;
  const float controlWidth = static_cast<float>(window::kCaptionButtonWidthDip) * scale;
  const float titleHeight = static_cast<float>(window::kTitlebarHeightDip) * scale;
  const float right = static_cast<float>(width_);
  const std::uint32_t textColor = ForegroundColor(settings_, policy_);
  auto glyphBrush = compositor_.CreateColorBrush(Color(textColor, active_ ? 0.86F : 0.55F));

  auto centerFor = [&](window::CaptionButton button) {
    switch (button) {
      case window::CaptionButton::Minimize: return right - controlWidth * 2.5F;
      case window::CaptionButton::Maximize: return right - controlWidth * 1.5F;
      case window::CaptionButton::Close: return right - controlWidth * 0.5F;
      case window::CaptionButton::None: return right;
    }
    return right;
  };
  auto appendFeedback = [&](window::CaptionButton button) {
    if (button == window::CaptionButton::None || hoveredCaptionButton_ != button) return;
    auto geometry = compositor_.CreateRectangleGeometry();
    geometry.Offset({centerFor(button) - controlWidth * 0.5F, 0.0F});
    geometry.Size({controlWidth, titleHeight});
    auto shape = compositor_.CreateSpriteShape(geometry);
    const bool pressed = pressedCaptionButton_ == button;
    const auto color = button == window::CaptionButton::Close
                           ? ui::Color{static_cast<std::uint8_t>(pressed ? 128 : 88), 196, 43, 54}
                           : ui::Color{static_cast<std::uint8_t>(pressed ? 38 : 24), 32, 33, 36};
    shape.FillBrush(compositor_.CreateColorBrush(color));
    titlebarLayer_.Shapes().Append(shape);
  };
  appendFeedback(window::CaptionButton::Minimize);
  appendFeedback(window::CaptionButton::Maximize);
  appendFeedback(window::CaptionButton::Close);

  auto line = [&](float x1, float y1, float x2, float y2) {
    auto geometry = compositor_.CreateLineGeometry();
    geometry.Start({x1, y1});
    geometry.End({x2, y2});
    auto shape = compositor_.CreateSpriteShape(geometry);
    shape.StrokeBrush(glyphBrush);
    shape.StrokeThickness(std::max(1.0F, scale));
    titlebarLayer_.Shapes().Append(shape);
  };
  const float centerY = titleHeight * 0.5F;
  const float minCenter = centerFor(window::CaptionButton::Minimize);
  line(minCenter - 5.0F * scale, centerY + 3.0F * scale,
       minCenter + 5.0F * scale, centerY + 3.0F * scale);
  const float maxCenter = centerFor(window::CaptionButton::Maximize);
  const float half = 5.0F * scale;
  if (maximized_) {
    line(maxCenter - 3.0F * scale, centerY - 5.0F * scale,
         maxCenter + 5.0F * scale, centerY - 5.0F * scale);
    line(maxCenter + 5.0F * scale, centerY - 5.0F * scale,
         maxCenter + 5.0F * scale, centerY + 3.0F * scale);
    line(maxCenter - 5.0F * scale, centerY - 3.0F * scale,
         maxCenter + 3.0F * scale, centerY - 3.0F * scale);
    line(maxCenter - 5.0F * scale, centerY - 3.0F * scale,
         maxCenter - 5.0F * scale, centerY + 5.0F * scale);
    line(maxCenter - 5.0F * scale, centerY + 5.0F * scale,
         maxCenter + 3.0F * scale, centerY + 5.0F * scale);
    line(maxCenter + 3.0F * scale, centerY + 5.0F * scale,
         maxCenter + 3.0F * scale, centerY - 3.0F * scale);
  } else {
    line(maxCenter - half, centerY - half, maxCenter + half, centerY - half);
    line(maxCenter + half, centerY - half, maxCenter + half, centerY + half);
    line(maxCenter + half, centerY + half, maxCenter - half, centerY + half);
    line(maxCenter - half, centerY + half, maxCenter - half, centerY - half);
  }
  const float closeCenter = centerFor(window::CaptionButton::Close);
  line(closeCenter - half, centerY - half, closeCenter + half, centerY + half);
  line(closeCenter + half, centerY - half, closeCenter - half, centerY + half);
}

void CompositionHost::SetAppearance(const settings::Settings& settings,
                                    const platform::PolicySnapshot& policy) {
  try {
    settings_ = settings;
    policy_ = policy;
    RefreshCapabilities();
    const bool requestedGlass = settings.glass.enabled && policy.AllowsGlass();
    const bool effectsAvailable = CanRenderGlassBlur(effectsSupported_, effectsFast_);
    bool glassReady = requestedGlass && effectsAvailable;

    if (glassReady) {
      try {
        EnsureGlassBlurBrush(settings.glass.blurDips);
        ConfigureDwm(true, true);
        state_ = AppearanceState::Glass;
        stateReason_.clear();
      } catch (...) {
        glassReady = false;
        ReleaseGlassBlurBrush();
        stateReason_ = L"glass-effects-failed";
      }
    }
    if (!glassReady) {
      state_ = AppearanceState::Solid;
      if (!settings.glass.enabled) stateReason_ = L"user-disabled";
      else if (!policy.AllowsGlass()) stateReason_ = policy.Reason();
      else if (!effectsSupported_) stateReason_ = L"effects-unsupported";
      else if (!effectsFast_) stateReason_ = L"effects-slow";
      else if (stateReason_.empty()) stateReason_ = L"glass-effects-failed";
      ReleaseGlassBlurBrush();
      ConfigureDwm(false, true);
    }
    RebuildShapes();
    RebuildTitleBar();
  } catch (const winrt::hresult_error& error) {
    MarkFailure(L"appearance", error.code());
  } catch (...) {
    MarkFailure(L"appearance", E_FAIL);
  }
}

void CompositionHost::RefreshDwm() {
  try {
    ConfigureDwm(state_ == AppearanceState::Glass, true);
  } catch (const winrt::hresult_error& error) {
    MarkFailure(L"dwm", error.code());
  } catch (...) {
    MarkFailure(L"dwm", E_FAIL);
  }
}

void CompositionHost::SetActive(bool active) {
  try {
    active_ = active;
    RebuildShapes();
    RebuildTitleBar();
  } catch (const winrt::hresult_error& error) {
    MarkFailure(L"activation", error.code());
  } catch (...) {
    MarkFailure(L"activation", E_FAIL);
  }
}

void CompositionHost::SetFullscreen(bool fullscreen) {
  if (fullscreen_ == fullscreen) return;
  fullscreen_ = fullscreen;
  RebuildTitleBar();
}

void CompositionHost::SetCaptionState(window::CaptionButton hovered,
                                      window::CaptionButton pressed, bool maximized) {
  if (hoveredCaptionButton_ == hovered && pressedCaptionButton_ == pressed &&
      maximized_ == maximized) {
    return;
  }
  hoveredCaptionButton_ = hovered;
  pressedCaptionButton_ = pressed;
  maximized_ = maximized;
  RebuildTitleBar();
}

wc::ContainerVisual CompositionHost::WebRoot() const noexcept { return webRoot_; }

AppearanceState CompositionHost::State() const noexcept { return state_; }

std::wstring CompositionHost::StateReason() const { return stateReason_; }

}  // namespace lgt::composition
