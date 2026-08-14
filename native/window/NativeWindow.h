#pragma once

#include <windows.h>

#include <functional>
#include <optional>

#include "settings/SettingsStore.h"

namespace lgt::window {

class NativeWindow final {
 public:
  using MessageHandler = std::function<std::optional<LRESULT>(UINT, WPARAM, LPARAM)>;

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

  [[nodiscard]] HWND Handle() const noexcept;
  [[nodiscard]] UINT Dpi() const noexcept;
  [[nodiscard]] bool CompositionMode() const noexcept;
  [[nodiscard]] bool Fullscreen() const noexcept;
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
  UINT dpi_ = 96;
  bool compositionMode_ = true;
  bool suppressQuit_ = false;
  bool fullscreen_ = false;
  WINDOWPLACEMENT savedPlacement_{sizeof(savedPlacement_)};
  LONG_PTR savedStyle_ = 0;
};

}  // namespace lgt::window
