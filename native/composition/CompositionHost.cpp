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

constexpr auto kUseHostBackdropBrush = static_cast<DWMWINDOWATTRIBUTE>(17);
constexpr auto kWindowCornerPreference = static_cast<DWMWINDOWATTRIBUTE>(33);
constexpr auto kBorderColor = static_cast<DWMWINDOWATTRIBUTE>(34);
constexpr auto kSystemBackdropType = static_cast<DWMWINDOWATTRIBUTE>(38);
constexpr int kBackdropNone = 1;
constexpr int kCornerSmall = 3;
constexpr COLORREF kColorNone = 0xFFFFFFFE;
constexpr float kTitlebarDip = 44.0F;
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
  const float dpiScale = static_cast<float>(dpi) / 96.0F;
  const float zoom = static_cast<float>(webZoom);
  ScaledRegion scaled{
      region.x * dpiScale * zoom,
      kTitlebarDip * dpiScale + (region.y - kTitlebarDip) * dpiScale * zoom,
      region.width * dpiScale * zoom,
      region.height * dpiScale * zoom,
      region.radii,
  };
  for (float& radius : scaled.radii) radius *= dpiScale * zoom;
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
  const auto alpha = static_cast<std::uint8_t>(std::clamp(opacity, 0.0F, 1.0F) * 255.0F);
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
  constexpr std::uint32_t light = 0xFFFFFF;
  constexpr std::uint32_t dark = 0x000000;
  constexpr double minimumContrast = 4.5;
  if (settings.foreground == settings::Foreground::Light) {
    return Contrast(settings.tint, light) >= minimumContrast ? light : dark;
  }
  if (settings.foreground == settings::Foreground::Dark) {
    return Contrast(settings.tint, dark) >= minimumContrast ? dark : light;
  }
  return Contrast(settings.tint, light) >= Contrast(settings.tint, dark) ? light : dark;
}

}  // namespace

CompositionHost::~CompositionHost() { Reset(); }

bool CompositionHost::Initialize(HWND window) {
  Reset();
  window_ = window;
  try {
    EnsureDispatcherQueue();
    ConfigureDwm();
    const D2D1_FACTORY_OPTIONS factoryOptions{};
    winrt::check_hresult(D2D1CreateFactory(
        D2D1_FACTORY_TYPE_SINGLE_THREADED, __uuidof(ID2D1Factory1), &factoryOptions,
        reinterpret_cast<void**>(d2dFactory_.ReleaseAndGetAddressOf())));
    compositor_ = wc::Compositor();
    const auto interop = compositor_.as<desktopAbi::ICompositorDesktopInterop>();
    winrt::check_hresult(interop->CreateDesktopWindowTarget(
        window_, false,
        reinterpret_cast<desktopAbi::IDesktopWindowTarget**>(winrt::put_abi(target_))));
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
    if (graphicsDevice_ && graphicsDeviceReplacedToken_.value != 0) {
      graphicsDevice_.RenderingDeviceReplaced(graphicsDeviceReplacedToken_);
    }
  } catch (...) {
  }
  graphicsDeviceReplacedToken_ = {};
  graphicsDevice_ = nullptr;
  highlightBrush_ = nullptr;
  borderBrush_ = nullptr;
  noiseBrush_ = nullptr;
  solidBrush_ = nullptr;
  tintBrush_ = nullptr;
  glassBrush_ = nullptr;
  titlebarLayer_ = nullptr;
  overlayRoot_ = nullptr;
  webRoot_ = nullptr;
  borderLayer_ = nullptr;
  noiseLayer_ = nullptr;
  tintLayer_ = nullptr;
  glassLayer_ = nullptr;
  shadowLayer_ = nullptr;
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
    const int backdrop = kBackdropNone;
    const int corner = 0;
    const COLORREF border = 0xFFFFFFFF;
    DwmSetWindowAttribute(window_, kUseHostBackdropBrush, &disabled, sizeof(disabled));
    DwmSetWindowAttribute(window_, kSystemBackdropType, &backdrop, sizeof(backdrop));
    DwmSetWindowAttribute(window_, kWindowCornerPreference, &corner, sizeof(corner));
    DwmSetWindowAttribute(window_, kBorderColor, &border, sizeof(border));
  }
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

void CompositionHost::ConfigureDwm() {
  const BOOL enabled = TRUE;
  const int backdrop = kBackdropNone;
  const int corner = kCornerSmall;
  const COLORREF border = kColorNone;
  winrt::check_hresult(
      DwmSetWindowAttribute(window_, kUseHostBackdropBrush, &enabled, sizeof(enabled)));
  winrt::check_hresult(
      DwmSetWindowAttribute(window_, kSystemBackdropType, &backdrop, sizeof(backdrop)));
  winrt::check_hresult(
      DwmSetWindowAttribute(window_, kWindowCornerPreference, &corner, sizeof(corner)));
  DwmSetWindowAttribute(window_, kBorderColor, &border, sizeof(border));
  const MARGINS margins{-1, -1, -1, -1};
  winrt::check_hresult(DwmExtendFrameIntoClientArea(window_, &margins));
}

void CompositionHost::CreateVisualTree() {
  root_ = compositor_.CreateContainerVisual();
  root_.RelativeSizeAdjustment({1.0F, 1.0F});
  solidLayer_ = compositor_.CreateSpriteVisual();
  solidLayer_.RelativeSizeAdjustment({1.0F, 1.0F});
  shadowLayer_ = compositor_.CreateShapeVisual();
  glassLayer_ = compositor_.CreateContainerVisual();
  tintLayer_ = compositor_.CreateContainerVisual();
  noiseLayer_ = compositor_.CreateContainerVisual();
  glassLayer_.RelativeSizeAdjustment({1.0F, 1.0F});
  tintLayer_.RelativeSizeAdjustment({1.0F, 1.0F});
  noiseLayer_.RelativeSizeAdjustment({1.0F, 1.0F});
  borderLayer_ = compositor_.CreateShapeVisual();
  webRoot_ = compositor_.CreateContainerVisual();
  overlayRoot_ = compositor_.CreateContainerVisual();
  titlebarLayer_ = compositor_.CreateShapeVisual();
  webRoot_.RelativeSizeAdjustment({1.0F, 1.0F});
  overlayRoot_.RelativeSizeAdjustment({1.0F, 1.0F});
  root_.Children().InsertAtTop(solidLayer_);
  root_.Children().InsertAtTop(shadowLayer_);
  root_.Children().InsertAtTop(glassLayer_);
  root_.Children().InsertAtTop(tintLayer_);
  root_.Children().InsertAtTop(noiseLayer_);
  root_.Children().InsertAtTop(borderLayer_);
  root_.Children().InsertAtTop(webRoot_);
  overlayRoot_.Children().InsertAtTop(titlebarLayer_);
  root_.Children().InsertAtTop(overlayRoot_);
  CreateEffectBrush();
  try {
    CreateNoiseBrush();
  } catch (...) {
    noiseBrush_ = compositor_.CreateColorBrush(ui::Color{0, 255, 255, 255});
  }
  tintBrush_ = compositor_.CreateColorBrush();
  solidBrush_ = compositor_.CreateColorBrush();
  solidLayer_.Brush(solidBrush_);
  borderBrush_ = compositor_.CreateColorBrush();
  highlightBrush_ = compositor_.CreateColorBrush();
}

void CompositionHost::CreateEffectBrush() {
  const auto& material = Material(settings_.preset);
  const auto source = wc::CompositionEffectSourceParameter(L"backdrop");
  auto blur = Microsoft::WRL::Make<effects::GaussianBlurEffect>();
  auto saturation = Microsoft::WRL::Make<effects::SaturationEffect>();
  if (!blur || !saturation) throw std::bad_alloc();
  Microsoft::WRL::Wrappers::HStringReference blurName{L"Blur"};
  Microsoft::WRL::Wrappers::HStringReference saturationName{L"Saturation"};
  winrt::check_hresult(blur->put_Name(blurName.Get()));
  winrt::check_hresult(saturation->put_Name(saturationName.Get()));
  blur->BlurAmount(material.blurRadius);
  saturation->Saturation(material.saturation);
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
  glassBrush_.SetSourceParameter(L"backdrop", compositor_.CreateHostBackdropBrush());
}

void CompositionHost::CreateNoiseBrush() {
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
  graphicsDeviceReplacedToken_ = graphicsDevice_.RenderingDeviceReplaced(
      [this](const auto&, const auto&) {
        if (window_) PostMessageW(window_, kCompositionDeviceLostMessage, 0, 0);
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

void CompositionHost::Resize(UINT width, UINT height, UINT dpi, double webZoom) {
  try {
    width_ = width;
    height_ = height;
    dpi_ = dpi == 0 ? 96 : dpi;
    webZoom_ = std::clamp(webZoom, 0.8, 2.0);
    const winrt::Windows::Foundation::Numerics::float2 size{static_cast<float>(width_),
                                                           static_cast<float>(height_)};
    for (const auto& layer : {shadowLayer_, borderLayer_, titlebarLayer_}) {
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
    if (regions_.size() > 32) regions_.resize(32);
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
    solidLayer_.IsVisible(true);
    shadowLayer_.IsVisible(false);
    glassLayer_.IsVisible(false);
    tintLayer_.IsVisible(false);
    noiseLayer_.IsVisible(false);
    borderLayer_.IsVisible(false);
  } catch (...) {
  }
  if (window_ && (error == DXGI_ERROR_DEVICE_REMOVED || error == DXGI_ERROR_DEVICE_RESET ||
                  error == DXGI_ERROR_DEVICE_HUNG || error == D2DERR_RECREATE_TARGET)) {
    PostMessageW(window_, kCompositionDeviceLostMessage, 0, 0);
  }
}

void CompositionHost::RebuildShapesCore() {
  shapeStage_ = L"clear";
  ClearShapes(shadowLayer_.Shapes());
  glassLayer_.Children().RemoveAll();
  tintLayer_.Children().RemoveAll();
  noiseLayer_.Children().RemoveAll();
  ClearShapes(borderLayer_.Shapes());
  const auto& selected = Material(settings_.preset);
  const bool glass = state_ == AppearanceState::Glass;
  const std::uint32_t fallbackColor =
      policy_.highContrast ? RgbFromColorRef(GetSysColor(COLOR_WINDOW)) : settings_.tint;
  shapeStage_ = L"visibility";
  solidBrush_.Color(Color(fallbackColor, 1.0F));
  solidLayer_.IsVisible(!glass);
  shadowLayer_.IsVisible(!policy_.highContrast);
  glassLayer_.IsVisible(glass);
  noiseLayer_.IsVisible(glass);
  std::vector<GlassRegion> visibleRegions;
  visibleRegions.reserve(regions_.size());
  for (const auto& region : regions_) {
    if (region.width > 0 && region.height > 0) visibleRegions.push_back(region);
  }
  if (!visibleRegions.empty()) {
    shapeStage_ = L"glass";
    glassLayer_.Children().InsertAtTop(
        ClippedVisual(compositor_, CreateRegionsGeometry(visibleRegions), glassBrush_));
    shapeStage_ = L"noise";
    noiseLayer_.Children().InsertAtTop(
        ClippedVisual(compositor_, CreateRegionsGeometry(visibleRegions), noiseBrush_));
  }
  for (const auto& region : visibleRegions) {
    shapeStage_ = L"shadow-geometry";
    const auto geometry = CreateRegionGeometry(region);
    const auto& decoration = region.role == GlassRole::Overlay ? kDenseMaterial : selected;
    shapeStage_ = L"shadow";
    auto shadow = compositor_.CreateSpriteShape(geometry);
    shadow.StrokeBrush(compositor_.CreateColorBrush(ui::Color{55, 0, 0, 0}));
    shadow.StrokeThickness(12.0F * static_cast<float>(dpi_) / 96.0F);
    shadowLayer_.Shapes().Append(shadow);
    const float fallbackTint = policy_.highContrast ? 0.0F : 0.045F;
    const auto tint = compositor_.CreateColorBrush(TintColor(
        glass ? decoration.tintOpacity + selected.luminosity : fallbackTint));
    shapeStage_ = L"tint";
    tintLayer_.Children().InsertAtTop(
        ClippedVisual(compositor_, CreateRegionGeometry(region), tint));
    shapeStage_ = L"border";
    auto border = compositor_.CreateSpriteShape(CreateRegionGeometry(region));
    const auto borderColor = policy_.highContrast
                                 ? Color(RgbFromColorRef(GetSysColor(COLOR_WINDOWTEXT)), 1.0F)
                                 : ui::Color{static_cast<std::uint8_t>(
                                                 decoration.borderOpacity * 255.0F),
                                             255, 255, 255};
    border.StrokeBrush(compositor_.CreateColorBrush(borderColor));
    border.StrokeThickness(1.0F * static_cast<float>(dpi_) / 96.0F);
    borderLayer_.Shapes().Append(border);
    shapeStage_ = L"highlight";
    auto highlight = compositor_.CreateSpriteShape(CreateRegionGeometry(region));
    highlight.StrokeBrush(compositor_.CreateColorBrush(ui::Color{
        static_cast<std::uint8_t>(decoration.highlightIntensity * 255.0F), 255, 255, 255}));
    highlight.StrokeThickness(0.5F * static_cast<float>(dpi_) / 96.0F);
    highlight.Offset({0.0F, -0.5F * static_cast<float>(dpi_) / 96.0F});
    borderLayer_.Shapes().Append(highlight);
  }
  shapeStage_ = L"animation";
  const float inactiveOpacity = active_ ? 1.0F : selected.inactiveOpacity;
  AnimateOpacity(tintLayer_, inactiveOpacity, 120);
  AnimateOpacity(noiseLayer_, selected.noiseOpacity * inactiveOpacity, 120);
  AnimateOpacity(borderLayer_, inactiveOpacity, 120);
}

void CompositionHost::RebuildTitleBar() {
  if (!titlebarLayer_) return;
  ClearShapes(titlebarLayer_.Shapes());
  const float scale = static_cast<float>(dpi_) / 96.0F;
  const float controlWidth = 46.0F * scale;
  const float titleHeight = kTitlebarDip * scale;
  const float right = static_cast<float>(width_);
  auto glyphBrush = compositor_.CreateColorBrush(Color(settings_.tint, 0.0F));
  const std::uint32_t textColor = ForegroundColor(settings_, policy_);
  glyphBrush.Color(Color(textColor, active_ ? 0.86F : 0.55F));

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
  const float minCenter = right - controlWidth * 2.5F;
  line(minCenter - 5.0F * scale, centerY + 3.0F * scale,
       minCenter + 5.0F * scale, centerY + 3.0F * scale);
  const float maxCenter = right - controlWidth * 1.5F;
  const float half = 5.0F * scale;
  line(maxCenter - half, centerY - half, maxCenter + half, centerY - half);
  line(maxCenter + half, centerY - half, maxCenter + half, centerY + half);
  line(maxCenter + half, centerY + half, maxCenter - half, centerY + half);
  line(maxCenter - half, centerY + half, maxCenter - half, centerY - half);
  const float closeCenter = right - controlWidth * 0.5F;
  line(closeCenter - half, centerY - half, closeCenter + half, centerY + half);
  line(closeCenter + half, centerY - half, closeCenter - half, centerY + half);
}

void CompositionHost::SetAppearance(const settings::Settings& settings,
                                    const platform::PolicySnapshot& policy) {
  try {
    settings_ = settings;
    policy_ = policy;
    const bool glassAllowed = settings.glassEnabled && policy.AllowsGlass();
    state_ = glassAllowed ? AppearanceState::Glass : AppearanceState::Solid;
    stateReason_ =
        glassAllowed ? L"" : (!settings.glassEnabled ? L"user-disabled" : policy.Reason());
    if (glassBrush_) {
      const auto& material = Material(settings.preset);
      glassBrush_.Properties().InsertScalar(L"Blur.BlurAmount", material.blurRadius);
      glassBrush_.Properties().InsertScalar(L"Saturation.Saturation", material.saturation);
    }
    RebuildShapes();
    RebuildTitleBar();
  } catch (const winrt::hresult_error& error) {
    MarkFailure(L"appearance", error.code());
  } catch (...) {
    MarkFailure(L"appearance", E_FAIL);
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

ui::Color CompositionHost::TintColor(float opacity) const noexcept {
  return Color(settings_.tint, opacity);
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
