#pragma once

#include <windows.h>

#include <cstdint>
#include <string>
#include <string_view>

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.System.h>
#include <winrt/Windows.UI.Composition.Desktop.h>
#include <winrt/Windows.UI.Composition.h>

#include "platform/SystemPolicy.h"
#include "settings/SettingsStore.h"
#include "window/WindowMetrics.h"

namespace lgt::composition {

inline constexpr UINT kCompositionDeviceLostMessage = WM_APP + 0x33;

enum class AppearanceState { Glass, Solid, Safe };

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
  void SetAppearance(const settings::Settings& settings,
                     const platform::PolicySnapshot& policy);
  void SetActive(bool active);
  void SetFullscreen(bool fullscreen);
  void SetCaptionState(window::CaptionButton hovered, window::CaptionButton pressed,
                       bool maximized);
  void RefreshDwm();

  [[nodiscard]] winrt::Windows::UI::Composition::ContainerVisual WebRoot() const noexcept;
  [[nodiscard]] AppearanceState State() const noexcept;
  [[nodiscard]] std::wstring StateReason() const;

 private:
  void EnsureDispatcherQueue();
  void ConfigureDwm(bool useHostBackdrop, bool force = false);
  void CreateVisualTree();
  void RefreshCapabilities();
  void EnsureGlassBlurBrush(std::uint32_t blurDips);
  void ReleaseGlassBlurBrush() noexcept;
  void RebuildShapes() noexcept;
  void RebuildShapesCore();
  void RebuildTitleBar();
  void MarkFailure(std::wstring_view stage, HRESULT error) noexcept;

  HWND window_ = nullptr;
  HMODULE coreMessaging_ = nullptr;
  UINT width_ = 0;
  UINT height_ = 0;
  UINT dpi_ = 96;
  double webZoom_ = 1.0;
  bool active_ = true;
  bool fullscreen_ = false;
  bool effectsSupported_ = true;
  bool effectsFast_ = true;
  bool dwmConfigured_ = false;
  bool maximized_ = false;
  window::CaptionButton hoveredCaptionButton_ = window::CaptionButton::None;
  window::CaptionButton pressedCaptionButton_ = window::CaptionButton::None;
  AppearanceState state_ = AppearanceState::Safe;
  std::wstring stateReason_ = L"not-initialized";
  std::wstring_view shapeStage_ = L"idle";
  settings::Settings settings_{};
  platform::PolicySnapshot policy_{};
  winrt::Windows::System::DispatcherQueueController dispatcher_{nullptr};
  winrt::Windows::UI::Composition::Compositor compositor_{nullptr};
  winrt::Windows::UI::Composition::Desktop::DesktopWindowTarget target_{nullptr};
  winrt::Windows::UI::Composition::CompositionCapabilities capabilities_{nullptr};
  winrt::event_token capabilitiesChangedToken_{};
  winrt::Windows::UI::Composition::ContainerVisual root_{nullptr};
  winrt::Windows::UI::Composition::SpriteVisual solidLayer_{nullptr};
  winrt::Windows::UI::Composition::SpriteVisual blurLayer_{nullptr};
  winrt::Windows::UI::Composition::ShapeVisual borderLayer_{nullptr};
  winrt::Windows::UI::Composition::ContainerVisual webRoot_{nullptr};
  winrt::Windows::UI::Composition::ContainerVisual overlayRoot_{nullptr};
  winrt::Windows::UI::Composition::ShapeVisual titlebarLayer_{nullptr};
  winrt::Windows::UI::Composition::CompositionColorBrush solidBrush_{nullptr};
  winrt::Windows::UI::Composition::CompositionBackdropBrush backdropBrush_{nullptr};
  winrt::Windows::UI::Composition::CompositionEffectBrush blurBrush_{nullptr};
  std::uint32_t blurDips_ = 0;
};

}  // namespace lgt::composition
