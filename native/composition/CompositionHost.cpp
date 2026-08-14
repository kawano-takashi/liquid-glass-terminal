#include "composition/CompositionHost.h"

#include "composition/Effects.h"
#include "composition/GeometrySource.h"
#include "composition/GlassMaterial.h"

#include <DispatcherQueue.h>
#include <Windows.UI.Composition.Interop.h>
#include <d2d1_1helper.h>
#include <d3d11.h>
#include <dwmapi.h>
#include <dxgi1_2.h>

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <random>
#include <stdexcept>

#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Graphics.DirectX.h>
#include <winrt/Windows.Graphics.Effects.h>
#include <winrt/Windows.UI.h>
#include <winrt/base.h>

namespace lgt::composition {
namespace {

namespace ui = winrt::Windows::UI;
namespace wc = winrt::Windows::UI::Composition;
namespace desktop = winrt::Windows::UI::Composition::Desktop;
namespace effectsAbi = ABI::Windows::Graphics::Effects;
namespace compositionAbi = ABI::Windows::UI::Composition;
namespace desktopAbi = ABI::Windows::UI::Composition::Desktop;

constexpr UINT kNoiseTextureSize = 1024;

struct ScaledRegion {
  float x;
  float y;
  float width;
  float height;
  std::array<float, 4> radii;
};

float ClampRadius(float radius, float width, float height) {
  return std::clamp(radius, 0.0F, std::max(0.0F, std::min(width, height) * 0.5F));
}

ScaledRegion ScaleRegion(const GlassRegion& region, UINT dpi, double webZoom) {
  ScaledRegion scaled{
      window::CssPixelsToClient(region.x, dpi, webZoom),
      window::CssPixelsToClient(region.y, dpi, webZoom),
      window::CssPixelsToClient(region.width, dpi, webZoom),
      window::CssPixelsToClient(region.height, dpi, webZoom),
      region.radii,
  };
  for (float& radius : scaled.radii) {
    radius = window::CssPixelsToClient(radius, dpi, webZoom);
  }
  return scaled;
}

Microsoft::WRL::ComPtr<ID2D1PathGeometry> RoundedPath(
    ID2D1Factory1* factory, float x, float y, float width, float height,
    const std::array<float, 4>& rawRadii) {
  Microsoft::WRL::ComPtr<ID2D1PathGeometry> path;
  winrt::check_hresult(factory->CreatePathGeometry(&path));
  Microsoft::WRL::ComPtr<ID2D1GeometrySink> sink;
  winrt::check_hresult(path->Open(&sink));
  const float tl = ClampRadius(rawRadii[0], width, height);
  const float tr = ClampRadius(rawRadii[1], width, height);
  const float br = ClampRadius(rawRadii[2], width, height);
  const float bl = ClampRadius(rawRadii[3], width, height);
  constexpr float k = 0.552284749831F;
  sink->BeginFigure(D2D1::Point2F(x + tl, y), D2D1_FIGURE_BEGIN_FILLED);
  sink->AddLine(D2D1::Point2F(x + width - tr, y));
  if (tr > 0) {
    sink->AddBezier(D2D1::BezierSegment(D2D1::Point2F(x + width - tr + tr * k, y),
                                        D2D1::Point2F(x + width, y + tr - tr * k),
                                        D2D1::Point2F(x + width, y + tr)));
  }
  sink->AddLine(D2D1::Point2F(x + width, y + height - br));
  if (br > 0) {
    sink->AddBezier(D2D1::BezierSegment(D2D1::Point2F(x + width, y + height - br + br * k),
                                        D2D1::Point2F(x + width - br + br * k, y + height),
                                        D2D1::Point2F(x + width - br, y + height)));
  }
  sink->AddLine(D2D1::Point2F(x + bl, y + height));
  if (bl > 0) {
    sink->AddBezier(D2D1::BezierSegment(D2D1::Point2F(x + bl - bl * k, y + height),
                                        D2D1::Point2F(x, y + height - bl + bl * k),
                                        D2D1::Point2F(x, y + height - bl)));
  }
  sink->AddLine(D2D1::Point2F(x, y + tl));
  if (tl > 0) {
    sink->AddBezier(D2D1::BezierSegment(D2D1::Point2F(x, y + tl - tl * k),
                                        D2D1::Point2F(x + tl - tl * k, y),
                                        D2D1::Point2F(x + tl, y)));
  }
  sink->EndFigure(D2D1_FIGURE_END_CLOSED);
  winrt::check_hresult(sink->Close());
  return path;
}

wc::CompositionPath ToCompositionPath(const Microsoft::WRL::ComPtr<ID2D1Geometry>& geometry) {
  const auto source = Microsoft::WRL::Make<GeometrySource>(geometry);
  if (!source) throw std::bad_alloc();
  Microsoft::WRL::ComPtr<ABI::Windows::Graphics::IGeometrySource2D> abi;
  winrt::check_hresult(source.As(&abi));
  winrt::Windows::Graphics::IGeometrySource2D projected{nullptr};
  winrt::copy_from_abi(projected, abi.Get());
  return wc::CompositionPath(projected);
}

void ClearShapes(const wc::CompositionShapeCollection& shapes) {
  while (shapes.Size() != 0) shapes.RemoveAtEnd();
}

wc::SpriteVisual ClippedVisual(const wc::Compositor& compositor,
                               const wc::CompositionGeometry& geometry,
                               const wc::CompositionBrush& brush) {
  auto visual = compositor.CreateSpriteVisual();
  visual.RelativeSizeAdjustment({1.0F, 1.0F});
  visual.Brush(brush);
  visual.Clip(compositor.CreateGeometricClip(geometry));
  return visual;
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

double LinearChannel(std::uint8_t value) {
  const double normalized = static_cast<double>(value) / 255.0;
  return normalized <= 0.04045 ? normalized / 12.92
                                : std::pow((normalized + 0.055) / 1.055, 2.4);
}

double Luminance(std::uint32_t rgb) {
  return 0.2126 * LinearChannel(static_cast<std::uint8_t>((rgb >> 16) & 0xFF)) +
         0.7152 * LinearChannel(static_cast<std::uint8_t>((rgb >> 8) & 0xFF)) +
         0.0722 * LinearChannel(static_cast<std::uint8_t>(rgb & 0xFF));
}

double Contrast(std::uint32_t first, std::uint32_t second) {
  const double high = std::max(Luminance(first), Luminance(second));
  const double low = std::min(Luminance(first), Luminance(second));
  return (high + 0.05) / (low + 0.05);
}

std::uint32_t ForegroundColor(const settings::Settings& settings,
                               const platform::PolicySnapshot& policy) {
  if (policy.highContrast) return RgbFromColorRef(GetSysColor(COLOR_WINDOWTEXT));
  constexpr std::uint32_t preferredLight = 0xF5F5F5;
  constexpr std::uint32_t preferredDark = 0x202124;
  constexpr std::uint32_t absoluteLight = 0xFFFFFF;
  constexpr std::uint32_t absoluteDark = 0x000000;
  constexpr double minimumContrast = 4.5;
  const auto tone = ToneRgb(settings.glass.tone);
  const double lightRatio = Contrast(tone, preferredLight);
  const double darkRatio = Contrast(tone, preferredDark);
  const bool preferLight = settings.foreground == settings::Foreground::Light ||
                           (settings.foreground == settings::Foreground::Auto &&
                            lightRatio >= darkRatio);
  const auto first = preferLight ? preferredLight : preferredDark;
  const auto second = preferLight ? preferredDark : preferredLight;
  if (Contrast(tone, first) >= minimumContrast) return first;
  if (Contrast(tone, second) >= minimumContrast) return second;
  if (Contrast(tone, absoluteLight) >= Contrast(tone, absoluteDark)) {
    return absoluteLight;
  }
  return absoluteDark;
}

}  // namespace

CompositionHost::~CompositionHost() { Reset(); }

bool CompositionHost::Initialize(HWND window) {
  Reset();
  window_ = window;
  try {
    EnsureDispatcherQueue();
    ConfigureDwm(true);
    const D2D1_FACTORY_OPTIONS factoryOptions{};
    winrt::check_hresult(D2D1CreateFactory(
        D2D1_FACTORY_TYPE_SINGLE_THREADED, __uuidof(ID2D1Factory1), &factoryOptions,
        reinterpret_cast<void**>(d2dFactory_.ReleaseAndGetAddressOf())));
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
  ReleaseNoiseBrush();
  highlightBrush_ = nullptr;
  borderBrush_ = nullptr;
  solidBrush_ = nullptr;
  tintBrush_ = nullptr;
  glassBrush_ = nullptr;
  backdropBrush_ = nullptr;
  titlebarLayer_ = nullptr;
  overlayRoot_ = nullptr;
  webRoot_ = nullptr;
  borderLayer_ = nullptr;
  noiseLayer_ = nullptr;
  tintLayer_ = nullptr;
  glassLayer_ = nullptr;
  solidLayer_ = nullptr;
  root_ = nullptr;
  target_ = nullptr;
  compositor_ = nullptr;
  dispatcher_ = nullptr;
  d2dFactory_.Reset();
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
    DwmSetWindowAttribute(window_, DWMWA_USE_HOSTBACKDROPBRUSH, &disabled, sizeof(disabled));
    DwmSetWindowAttribute(window_, DWMWA_SYSTEMBACKDROP_TYPE, &backdrop, sizeof(backdrop));
    DwmSetWindowAttribute(window_, DWMWA_WINDOW_CORNER_PREFERENCE, &corner, sizeof(corner));
    DwmSetWindowAttribute(window_, DWMWA_BORDER_COLOR, &border, sizeof(border));
    DwmExtendFrameIntoClientArea(window_, &margins);
  }
  dwmFrameExtensionConfigured_ = false;
  dwmFrameExtended_ = false;
  window_ = nullptr;
}

bool CompositionHost::Rebuild() {
  const HWND window = window_;
  const auto regions = regions_;
  const auto settings = settings_;
  const auto policy = policy_;
  const auto width = width_;
  const auto height = height_;
  const auto dpi = dpi_;
  const auto zoom = webZoom_;
  if (!Initialize(window)) return false;
  Resize(width, height, dpi, zoom);
  SetAppearance(settings, policy);
  SetRegions(regions);
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

void CompositionHost::ConfigureDwm(bool extendedFrame) {
  const BOOL enabled = TRUE;
  const DWM_SYSTEMBACKDROP_TYPE backdrop = DWMSBT_NONE;
  const DWM_WINDOW_CORNER_PREFERENCE corner = DWMWCP_ROUND;
  const COLORREF border = DWMWA_COLOR_NONE;
  winrt::check_hresult(DwmSetWindowAttribute(window_, DWMWA_USE_HOSTBACKDROPBRUSH, &enabled,
                                             sizeof(enabled)));
  winrt::check_hresult(DwmSetWindowAttribute(window_, DWMWA_SYSTEMBACKDROP_TYPE, &backdrop,
                                             sizeof(backdrop)));
  winrt::check_hresult(DwmSetWindowAttribute(window_, DWMWA_WINDOW_CORNER_PREFERENCE, &corner,
                                             sizeof(corner)));
  DwmSetWindowAttribute(window_, DWMWA_BORDER_COLOR, &border, sizeof(border));
  dwmFrameExtensionConfigured_ = false;
  SetDwmFrameExtension(extendedFrame);
}

void CompositionHost::SetDwmFrameExtension(bool extended) {
  if (dwmFrameExtensionConfigured_ && dwmFrameExtended_ == extended) return;
  const MARGINS margins = extended ? MARGINS{-1, -1, -1, -1} : MARGINS{};
  winrt::check_hresult(DwmExtendFrameIntoClientArea(window_, &margins));
  dwmFrameExtended_ = extended;
  dwmFrameExtensionConfigured_ = true;
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
  glassLayer_ = compositor_.CreateSpriteVisual();
  tintLayer_ = compositor_.CreateContainerVisual();
  noiseLayer_ = compositor_.CreateContainerVisual();
  borderLayer_ = compositor_.CreateShapeVisual();
  webRoot_ = compositor_.CreateContainerVisual();
  overlayRoot_ = compositor_.CreateContainerVisual();
  titlebarLayer_ = compositor_.CreateShapeVisual();
  for (const auto& layer : {solidLayer_, glassLayer_}) {
    layer.RelativeSizeAdjustment({1.0F, 1.0F});
  }
  tintLayer_.RelativeSizeAdjustment({1.0F, 1.0F});
  noiseLayer_.RelativeSizeAdjustment({1.0F, 1.0F});
  webRoot_.RelativeSizeAdjustment({1.0F, 1.0F});
  overlayRoot_.RelativeSizeAdjustment({1.0F, 1.0F});
  root_.Children().InsertAtTop(solidLayer_);
  root_.Children().InsertAtTop(glassLayer_);
  root_.Children().InsertAtTop(tintLayer_);
  root_.Children().InsertAtTop(noiseLayer_);
  root_.Children().InsertAtTop(borderLayer_);
  root_.Children().InsertAtTop(webRoot_);
  overlayRoot_.Children().InsertAtTop(titlebarLayer_);
  root_.Children().InsertAtTop(overlayRoot_);
  tintBrush_ = compositor_.CreateColorBrush();
  solidBrush_ = compositor_.CreateColorBrush();
  solidLayer_.Brush(solidBrush_);
  borderBrush_ = compositor_.CreateColorBrush();
  highlightBrush_ = compositor_.CreateColorBrush();
}

void CompositionHost::EnsureBackdropBrush() {
  if (!backdropBrush_) backdropBrush_ = compositor_.CreateHostBackdropBrush();
}

void CompositionHost::EnsureEffectBrush() {
  EnsureBackdropBrush();
  if (glassBrush_) return;
  const auto source = wc::CompositionEffectSourceParameter(L"backdrop");
  auto blur = Microsoft::WRL::Make<effects::GaussianBlurEffect>();
  auto saturation = Microsoft::WRL::Make<effects::SaturationEffect>();
  if (!blur || !saturation) throw std::bad_alloc();
  Microsoft::WRL::Wrappers::HStringReference blurName{L"Blur"};
  Microsoft::WRL::Wrappers::HStringReference saturationName{L"Saturation"};
  winrt::check_hresult(blur->put_Name(blurName.Get()));
  winrt::check_hresult(saturation->put_Name(saturationName.Get()));
  blur->BlurAmount(FrostBlurDips(settings_.glass.frostThickness));
  saturation->Saturation(1.0F);
  winrt::check_hresult(blur->SetSource(
      reinterpret_cast<effectsAbi::IGraphicsEffectSource*>(winrt::get_abi(source))));
  winrt::check_hresult(saturation->SetSource(blur.Get()));
  Microsoft::WRL::ComPtr<effectsAbi::IGraphicsEffect> graphAbi;
  winrt::check_hresult(saturation.As(&graphAbi));
  winrt::Windows::Graphics::Effects::IGraphicsEffect graph{nullptr};
  winrt::copy_from_abi(graph, graphAbi.Get());
  auto properties = winrt::single_threaded_vector<winrt::hstring>();
  properties.Append(L"Blur.BlurAmount");
  properties.Append(L"Saturation.Saturation");
  const auto factory = compositor_.CreateEffectFactory(graph, properties);
  glassBrush_ = factory.CreateBrush();
  glassBrush_.SetSourceParameter(L"backdrop", backdropBrush_);
}

void CompositionHost::ReleaseBackdropResources() noexcept {
  try {
    if (glassLayer_) glassLayer_.Brush(nullptr);
  } catch (...) {
  }
  glassBrush_ = nullptr;
  backdropBrush_ = nullptr;
}

void CompositionHost::CreateNoiseBrush() {
  if (noiseBrush_) return;
  Microsoft::WRL::ComPtr<ID3D11Device> d3d;
  Microsoft::WRL::ComPtr<ID3D11DeviceContext> d3dContext;
  D3D_FEATURE_LEVEL level{};
  winrt::check_hresult(D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr,
                                         D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0,
                                         D3D11_SDK_VERSION, &d3d, &level, &d3dContext));
  Microsoft::WRL::ComPtr<IDXGIDevice> dxgi;
  winrt::check_hresult(d3d.As(&dxgi));
  Microsoft::WRL::ComPtr<ID2D1Device> d2dDevice;
  winrt::check_hresult(d2dFactory_->CreateDevice(dxgi.Get(), &d2dDevice));
  const auto compositorInterop = compositor_.as<compositionAbi::ICompositorInterop>();
  winrt::check_hresult(compositorInterop->CreateGraphicsDevice(
      d2dDevice.Get(), reinterpret_cast<compositionAbi::ICompositionGraphicsDevice**>(
                           winrt::put_abi(graphicsDevice_))));
  const HWND window = window_;
  graphicsDeviceReplacedToken_ = graphicsDevice_.RenderingDeviceReplaced(
      [window](const auto&, const auto&) {
        if (window && IsWindow(window)) PostMessageW(window, kCompositionDeviceLostMessage, 0, 0);
      });
  const auto surface = graphicsDevice_.CreateDrawingSurface(
      {static_cast<float>(kNoiseTextureSize), static_cast<float>(kNoiseTextureSize)},
      winrt::Windows::Graphics::DirectX::DirectXPixelFormat::B8G8R8A8UIntNormalized,
      winrt::Windows::Graphics::DirectX::DirectXAlphaMode::Premultiplied);
  const auto surfaceInterop = surface.as<compositionAbi::ICompositionDrawingSurfaceInterop>();
  Microsoft::WRL::ComPtr<ID2D1DeviceContext> context;
  POINT offset{};
  winrt::check_hresult(surfaceInterop->BeginDraw(nullptr, IID_PPV_ARGS(&context), &offset));
  std::vector<std::uint32_t> pixels(kNoiseTextureSize * kNoiseTextureSize);
  std::minstd_rand generator(0x4C4754U);
  for (auto& pixel : pixels) {
    const std::uint8_t value = static_cast<std::uint8_t>(104U + generator() % 48U);
    pixel = 0xFF000000U | (static_cast<std::uint32_t>(value) << 16) |
            (static_cast<std::uint32_t>(value) << 8) | value;
  }
  D2D1_BITMAP_PROPERTIES1 properties = D2D1::BitmapProperties1(
      D2D1_BITMAP_OPTIONS_NONE,
      D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED));
  Microsoft::WRL::ComPtr<ID2D1Bitmap1> bitmap;
  winrt::check_hresult(context->CreateBitmap(
      D2D1::SizeU(kNoiseTextureSize, kNoiseTextureSize), pixels.data(), kNoiseTextureSize * 4,
      properties, &bitmap));
  context->Clear(D2D1::ColorF(0, 0));
  context->DrawBitmap(bitmap.Get(), D2D1::RectF(0, 0, static_cast<float>(kNoiseTextureSize),
                                                static_cast<float>(kNoiseTextureSize)));
  winrt::check_hresult(surfaceInterop->EndDraw());
  auto brush = compositor_.CreateSurfaceBrush(surface);
  brush.Stretch(wc::CompositionStretch::Fill);
  noiseBrush_ = brush;
}

void CompositionHost::ReleaseNoiseBrush() noexcept {
  try {
    if (graphicsDevice_ && graphicsDeviceReplacedToken_.value != 0) {
      graphicsDevice_.RenderingDeviceReplaced(graphicsDeviceReplacedToken_);
    }
  } catch (...) {
  }
  graphicsDeviceReplacedToken_ = {};
  graphicsDevice_ = nullptr;
  noiseBrush_ = nullptr;
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

void CompositionHost::SetRegions(std::span<const GlassRegion> regions) {
  try {
    regions_.assign(regions.begin(), regions.end());
    if (regions_.size() > protocol::kMaxGlassRegions) {
      regions_.resize(protocol::kMaxGlassRegions);
    }
    RebuildShapes();
  } catch (...) {
    MarkFailure(L"regions", E_FAIL);
  }
}

wc::CompositionGeometry CompositionHost::CreateRegionGeometry(const GlassRegion& region) {
  const auto scaled = ScaleRegion(region, dpi_, webZoom_);
  const bool uniformRadius = std::all_of(
      scaled.radii.cbegin() + 1, scaled.radii.cend(), [first = scaled.radii.front()](float radius) {
        return std::abs(radius - first) < 0.01F;
      });
  if (uniformRadius) {
    auto geometry = compositor_.CreateRoundedRectangleGeometry();
    geometry.Offset({scaled.x, scaled.y});
    geometry.Size({scaled.width, scaled.height});
    const float radius = ClampRadius(scaled.radii.front(), scaled.width, scaled.height);
    geometry.CornerRadius({radius, radius});
    return geometry;
  }
  auto path = RoundedPath(d2dFactory_.Get(), scaled.x, scaled.y, scaled.width, scaled.height,
                          scaled.radii);
  return compositor_.CreatePathGeometry(ToCompositionPath(path));
}

wc::CompositionGeometry CompositionHost::CreateRegionsGeometry(
    std::span<const GlassRegion> regions) {
  if (regions.size() == 1) return CreateRegionGeometry(regions.front());
  std::vector<Microsoft::WRL::ComPtr<ID2D1Geometry>> geometries;
  geometries.reserve(regions.size());
  for (const auto& region : regions) {
    const auto scaled = ScaleRegion(region, dpi_, webZoom_);
    geometries.push_back(RoundedPath(d2dFactory_.Get(), scaled.x, scaled.y, scaled.width,
                                     scaled.height, scaled.radii));
  }
  std::vector<ID2D1Geometry*> sources;
  sources.reserve(geometries.size());
  for (const auto& geometry : geometries) sources.push_back(geometry.Get());
  Microsoft::WRL::ComPtr<ID2D1GeometryGroup> group;
  winrt::check_hresult(d2dFactory_->CreateGeometryGroup(
      D2D1_FILL_MODE_WINDING, sources.data(), static_cast<UINT32>(sources.size()), &group));
  return compositor_.CreatePathGeometry(ToCompositionPath(group));
}

void CompositionHost::RebuildShapes() noexcept {
  if (!compositor_ || !glassLayer_) return;
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
    SetDwmFrameExtension(true);
  } catch (...) {
  }
  try {
    if (solidLayer_) solidLayer_.IsVisible(true);
    if (glassLayer_) glassLayer_.IsVisible(false);
    if (tintLayer_) tintLayer_.IsVisible(false);
    if (noiseLayer_) noiseLayer_.IsVisible(false);
    if (borderLayer_) borderLayer_.IsVisible(false);
  } catch (...) {
  }
  if (window_ && (error == DXGI_ERROR_DEVICE_REMOVED || error == DXGI_ERROR_DEVICE_RESET ||
                  error == DXGI_ERROR_DEVICE_HUNG || error == D2DERR_RECREATE_TARGET)) {
    PostMessageW(window_, kCompositionDeviceLostMessage, 0, 0);
  }
}

void CompositionHost::RebuildShapesCore() {
  shapeStage_ = L"clear";
  tintLayer_.Children().RemoveAll();
  noiseLayer_.Children().RemoveAll();
  ClearShapes(borderLayer_.Shapes());
  const bool glass = state_ == AppearanceState::Glass;
  const float materialOpacity = MaterialOpacity(settings_.glass.opacity);
  const bool transparentGlass = glass && materialOpacity <= 0.0F;
  const std::uint32_t fallbackColor = policy_.highContrast
                                          ? RgbFromColorRef(GetSysColor(COLOR_WINDOW))
                                          : ToneRgb(settings_.glass.tone);
  solidBrush_.Color(Color(fallbackColor, 1.0F));
  solidLayer_.IsVisible(!glass);
  glassLayer_.Opacity(materialOpacity);
  glassLayer_.IsVisible(glass && materialOpacity > 0.0F && materialOpacity < 1.0F);
  tintLayer_.IsVisible(glass && materialOpacity > 0.0F);
  noiseLayer_.IsVisible(glass &&
                        NeedsGrainSurface(settings_.glass.grain, settings_.glass.opacity) &&
                        noiseBrush_ != nullptr);
  borderLayer_.IsVisible(!policy_.highContrast && !transparentGlass);

  if (glass && materialOpacity > 0.0F) {
    auto baseTint = compositor_.CreateSpriteVisual();
    baseTint.RelativeSizeAdjustment({1.0F, 1.0F});
    baseTint.Brush(compositor_.CreateColorBrush(
        Color(ToneRgb(settings_.glass.tone), materialOpacity)));
    tintLayer_.Children().InsertAtTop(baseTint);
    if (NeedsGrainSurface(settings_.glass.grain, settings_.glass.opacity) && noiseBrush_) {
      auto baseNoise = compositor_.CreateSpriteVisual();
      baseNoise.RelativeSizeAdjustment({1.0F, 1.0F});
      baseNoise.Brush(noiseBrush_);
      baseNoise.Opacity(
          MaterialGrainOpacity(settings_.glass.grain, settings_.glass.opacity));
      noiseLayer_.Children().InsertAtTop(baseNoise);
    }
  }

  const float scale = static_cast<float>(dpi_) / 96.0F;
  if (!transparentGlass && width_ > 1 && height_ > 1) {
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

  if (glass && materialOpacity > 0.0F) {
    for (const auto& region : regions_) {
      if (region.role == GlassRole::Terminal || region.width <= 0 || region.height <= 0) continue;
      const auto geometry = CreateRegionGeometry(region);
      auto overlayTint = compositor_.CreateColorBrush(
          Color(ToneRgb(settings_.glass.tone),
                OverlayAdditionalOpacity(settings_.glass.opacity)));
      tintLayer_.Children().InsertAtTop(ClippedVisual(compositor_, geometry, overlayTint));
      auto border = compositor_.CreateSpriteShape(CreateRegionGeometry(region));
      border.StrokeBrush(compositor_.CreateColorBrush(ui::Color{72, 255, 255, 255}));
      border.StrokeThickness(std::max(1.0F, scale));
      borderLayer_.Shapes().Append(border);
    }
  }
  const float borderOpacity = (active_ ? 1.0F : 0.72F) * (glass ? materialOpacity : 1.0F);
  if (transparentGlass) borderLayer_.Opacity(0.0F);
  else AnimateOpacity(borderLayer_, borderOpacity, 140);
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
    const bool glassAllowed = settings.glass.enabled && policy.AllowsGlass() &&
                              effectsSupported_ && effectsFast_;
    const bool extendedFrame = NeedsExtendedDwmFrame(glassAllowed, settings.glass.opacity);
    if (!extendedFrame) SetDwmFrameExtension(false);
    state_ = glassAllowed ? AppearanceState::Glass : AppearanceState::Solid;
    if (glassAllowed) {
      stateReason_.clear();
      const float materialOpacity = MaterialOpacity(settings.glass.opacity);
      glassLayer_.Opacity(materialOpacity);
      if (settings.glass.opacity <= protocol::kOpacityConstraint.minimum) {
        ReleaseBackdropResources();
      } else if (settings.glass.opacity >= protocol::kOpacityConstraint.maximum) {
        glassLayer_.Brush(nullptr);
      } else {
        if (settings.glass.frostThickness == 0) {
          EnsureBackdropBrush();
          glassLayer_.Brush(backdropBrush_);
        } else {
          EnsureEffectBrush();
          glassBrush_.Properties().InsertScalar(L"Blur.BlurAmount",
                                                 FrostBlurDips(settings.glass.frostThickness));
          glassBrush_.Properties().InsertScalar(L"Saturation.Saturation", 1.0F);
          glassLayer_.Brush(glassBrush_);
        }
      }
      if (NeedsGrainSurface(settings.glass.grain, settings.glass.opacity)) {
        CreateNoiseBrush();
      } else {
        ReleaseNoiseBrush();
      }
    } else {
      if (!settings.glass.enabled) stateReason_ = L"user-disabled";
      else if (!policy.AllowsGlass()) stateReason_ = policy.Reason();
      else if (!effectsSupported_) stateReason_ = L"effects-unsupported";
      else stateReason_ = L"effects-slow";
      ReleaseNoiseBrush();
    }
    RebuildShapes();
    RebuildTitleBar();
    SetDwmFrameExtension(
        NeedsExtendedDwmFrame(state_ == AppearanceState::Glass, settings.glass.opacity));
  } catch (const winrt::hresult_error& error) {
    MarkFailure(L"appearance", error.code());
  } catch (...) {
    MarkFailure(L"appearance", E_FAIL);
  }
}

void CompositionHost::RefreshDwm() {
  try {
    ConfigureDwm(
        NeedsExtendedDwmFrame(state_ == AppearanceState::Glass, settings_.glass.opacity));
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

ui::Color CompositionHost::TintColor(float opacity) const noexcept {
  return Color(ToneRgb(settings_.glass.tone), opacity);
}

void CompositionHost::AnimateOpacity(const wc::Visual& visual, float value, int milliseconds) {
  if (!visual) return;
  if (!settings_.animations || policy_.ReducedMotion()) {
    visual.Opacity(value);
    return;
  }
  auto animation = compositor_.CreateScalarKeyFrameAnimation();
  animation.InsertKeyFrame(1.0F, value);
  animation.Duration(std::chrono::milliseconds(milliseconds));
  visual.StartAnimation(L"Opacity", animation);
}

wc::ContainerVisual CompositionHost::WebRoot() const noexcept { return webRoot_; }

AppearanceState CompositionHost::State() const noexcept { return state_; }

std::wstring CompositionHost::StateReason() const { return stateReason_; }

}  // namespace lgt::composition
