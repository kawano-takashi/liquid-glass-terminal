#pragma once

#include <windows.h>

#include <functional>
#include <optional>

#include "settings/SettingsStore.h"
#include "window/WindowMetrics.h"

namespace lgt::window {

inline constexpr UINT kWindowStateChangedMessage = WM_APP + 0x34;
inline constexpr UINT kWindowChromeChangedMessage = WM_APP + 0x35;

class NativeWindow final {
 public:
  using MessageHandler = std::function<std::optional<LRESULT>(UINT, WPARAM, LPARAM)>;
  using WebHitTestHandler = std::function<std::optional<LRESULT>(POINT)>;

  NativeWindow(HINSTANCE instance, MessageHandler handler);
  ~NativeWindow();

  NativeWindow(const NativeWindow&) = delete;
  NativeWindow& operator=(const NativeWindow&) = delete;

  bool Create(const settings::WindowState& state, bool compositionMode);
  void Show(int command);
  void DestroyForRecreate();
  void ToggleFullscreen();
  void ExitFullscreen();
  void ShowSystemMenu(POINT screenPoint);
  void SetWebHitTestHandler(WebHitTestHandler handler);

  [[nodiscard]] HWND Handle() const noexcept;
  [[nodiscard]] UINT Dpi() const noexcept;
  [[nodiscard]] bool CompositionMode() const noexcept;
  [[nodiscard]] bool Fullscreen() const noexcept;
  [[nodiscard]] bool Active() const noexcept;
  [[nodiscard]] CaptionButton HoveredCaptionButton() const noexcept;
  [[nodiscard]] CaptionButton PressedCaptionButton() const noexcept;
  [[nodiscard]] settings::WindowState CaptureState() const;
  [[nodiscard]] RECT WebViewBounds() const;

 private:
  static LRESULT CALLBACK WindowProcedure(HWND window, UINT message, WPARAM wParam,
                                          LPARAM lParam);
  LRESULT HandleMessage(UINT message, WPARAM wParam, LPARAM lParam);
  LRESULT HitTest(POINT screenPoint) const;
  void HandleNonClientAction(WPARAM hit);
  void UpdateDpi(UINT dpi);
  RECT InitialBounds(const settings::WindowState& state) const;

  HINSTANCE instance_ = nullptr;
  HWND window_ = nullptr;
  MessageHandler handler_;
  WebHitTestHandler webHitTestHandler_;
  UINT dpi_ = 96;
  bool compositionMode_ = true;
  bool suppressQuit_ = false;
  bool fullscreen_ = false;
  bool active_ = true;
  CaptionButton hoveredCaptionButton_ = CaptionButton::None;
  CaptionButton pressedCaptionButton_ = CaptionButton::None;
  WINDOWPLACEMENT savedPlacement_{sizeof(savedPlacement_)};
  LONG_PTR savedStyle_ = 0;
};

}  // namespace lgt::window
