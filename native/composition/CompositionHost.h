#pragma once

#include <windows.h>

#include <array>
#include <cstdint>
#include <span>
#include <string>
#include <string_view>
#include <vector>

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.System.h>
#include <winrt/Windows.UI.Composition.Desktop.h>
#include <winrt/Windows.UI.Composition.h>

#include <d2d1_1.h>
#include <wrl.h>

#include "platform/SystemPolicy.h"
#include "settings/SettingsStore.h"

namespace lgt::composition {

inline constexpr UINT kCompositionDeviceLostMessage = WM_APP + 0x33;

enum class GlassRole { Terminal, Overlay, Decorative };
enum class AppearanceState { Glass, Solid, Safe };

struct GlassRegion {
  std::wstring id;
  float x = 0;
  float y = 0;
  float width = 0;
  float height = 0;
  std::array<float, 4> radii{};
  GlassRole role = GlassRole::Terminal;
};

class CompositionHost final {
 public:
  CompositionHost() = default;
  ~CompositionHost();

  CompositionHost(const CompositionHost&) = delete;
  CompositionHost& operator=(const CompositionHost&) = delete;

  bool Initialize(HWND window);
  void Reset() noexcept;
  bool Rebuild();
  void Resize(UINT width, UINT height, UINT dpi, double webZoom);
  void SetRegions(std::span<const GlassRegion> regions);
  void SetAppearance(const settings::Settings& settings,
                     const platform::PolicySnapshot& policy);
  void SetActive(bool active);

  [[nodiscard]] winrt::Windows::UI::Composition::ContainerVisual WebRoot() const noexcept;
  [[nodiscard]] AppearanceState State() const noexcept;
  [[nodiscard]] std::wstring StateReason() const;

 private:
  void EnsureDispatcherQueue();
  void ConfigureDwm();
  void CreateVisualTree();
  void CreateEffectBrush();
  void CreateNoiseBrush();
  void RebuildShapes() noexcept;
  void RebuildShapesCore();
  void RebuildTitleBar();
  void MarkFailure(std::wstring_view stage, HRESULT error) noexcept;
  winrt::Windows::UI::Composition::CompositionGeometry CreateRegionGeometry(
      const GlassRegion& region);
  winrt::Windows::UI::Composition::CompositionGeometry CreateRegionsGeometry(
      std::span<const GlassRegion> regions);
  winrt::Windows::UI::Color TintColor(float opacity) const noexcept;
  void AnimateOpacity(const winrt::Windows::UI::Composition::Visual& visual, float value,
                      int milliseconds);

  HWND window_ = nullptr;
  HMODULE coreMessaging_ = nullptr;
  UINT width_ = 0;
  UINT height_ = 0;
  UINT dpi_ = 96;
  double webZoom_ = 1.0;
  bool active_ = true;
  AppearanceState state_ = AppearanceState::Safe;
  std::wstring stateReason_ = L"not-initialized";
  std::wstring_view shapeStage_ = L"idle";
  settings::Settings settings_{};
  platform::PolicySnapshot policy_{};
  std::vector<GlassRegion> regions_;

  winrt::Windows::System::DispatcherQueueController dispatcher_{nullptr};
  winrt::Windows::UI::Composition::Compositor compositor_{nullptr};
  winrt::Windows::UI::Composition::Desktop::DesktopWindowTarget target_{nullptr};
  winrt::Windows::UI::Composition::ContainerVisual root_{nullptr};
  winrt::Windows::UI::Composition::SpriteVisual solidLayer_{nullptr};
  winrt::Windows::UI::Composition::ShapeVisual shadowLayer_{nullptr};
  winrt::Windows::UI::Composition::ContainerVisual glassLayer_{nullptr};
  winrt::Windows::UI::Composition::ContainerVisual tintLayer_{nullptr};
  winrt::Windows::UI::Composition::ContainerVisual noiseLayer_{nullptr};
  winrt::Windows::UI::Composition::ShapeVisual borderLayer_{nullptr};
  winrt::Windows::UI::Composition::ContainerVisual webRoot_{nullptr};
  winrt::Windows::UI::Composition::ContainerVisual overlayRoot_{nullptr};
  winrt::Windows::UI::Composition::ShapeVisual titlebarLayer_{nullptr};
  winrt::Windows::UI::Composition::CompositionEffectBrush glassBrush_{nullptr};
  winrt::Windows::UI::Composition::CompositionColorBrush tintBrush_{nullptr};
  winrt::Windows::UI::Composition::CompositionColorBrush solidBrush_{nullptr};
  winrt::Windows::UI::Composition::CompositionBrush noiseBrush_{nullptr};
  winrt::Windows::UI::Composition::CompositionColorBrush borderBrush_{nullptr};
  winrt::Windows::UI::Composition::CompositionColorBrush highlightBrush_{nullptr};
  winrt::Windows::UI::Composition::CompositionGraphicsDevice graphicsDevice_{nullptr};
  winrt::event_token graphicsDeviceReplacedToken_{};
  Microsoft::WRL::ComPtr<ID2D1Factory1> d2dFactory_;
};

}  // namespace lgt::composition
