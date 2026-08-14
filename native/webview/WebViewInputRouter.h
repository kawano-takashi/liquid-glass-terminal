#pragma once

#include <windows.h>
#include <unknwn.h>
#include <wrl.h>

#include <optional>

#include <WebView2.h>

namespace lgt::webview {

class WebViewInputRouter final {
 public:
  void Attach(HWND window, ICoreWebView2Environment* environment,
              ICoreWebView2Controller* controller,
              ICoreWebView2CompositionController* compositionController);
  void Detach() noexcept;
  void SetBounds(RECT bounds) noexcept;

  [[nodiscard]] std::optional<LRESULT> Handle(UINT message, WPARAM wParam, LPARAM lParam);

 private:
  HRESULT SendMouse(UINT message, WPARAM wParam, LPARAM lParam);
  HRESULT SendPointer(UINT message, WPARAM wParam);
  COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS MouseKeys(WPARAM wParam) const noexcept;
  POINT MousePoint(UINT message, LPARAM lParam) const noexcept;
  void UpdateCursor() const noexcept;

  HWND window_ = nullptr;
  RECT bounds_{};
  bool trackingMouse_ = false;
  Microsoft::WRL::ComPtr<ICoreWebView2Environment3> environment_;
  Microsoft::WRL::ComPtr<ICoreWebView2Controller> controller_;
  Microsoft::WRL::ComPtr<ICoreWebView2CompositionController> compositionController_;
};

}  // namespace lgt::webview
