#pragma once

#include <windows.h>
#include <unknwn.h>
#include <wrl.h>

#include <filesystem>
#include <functional>
#include <cstdint>
#include <optional>
#include <string>

#include <WebView2.h>

#include <winrt/Windows.UI.Composition.h>

#include "webview/WebViewInputRouter.h"

namespace lgt::webview {

class WebViewHost final {
 public:
  using ReadyCallback = std::function<void(HRESULT)>;
  using ProcessFailedCallback = std::function<void(COREWEBVIEW2_PROCESS_FAILED_KIND)>;

  WebViewHost() = default;
  ~WebViewHost();

  WebViewHost(const WebViewHost&) = delete;
  WebViewHost& operator=(const WebViewHost&) = delete;

  HRESULT Initialize(HWND parent, bool compositionMode,
                     const winrt::Windows::UI::Composition::ContainerVisual& visualRoot,
                     std::filesystem::path userDataDirectory, ReadyCallback ready,
                     ProcessFailedCallback processFailed);
  void Close() noexcept;
  void Resize(RECT bounds, UINT dpi, double zoomFactor);
  void NotifyParentPositionChanged();
  void SetOpaqueBackground(std::uint32_t tint);
  void SetTransparentBackground();
  void SetVisible(bool visible);

  [[nodiscard]] std::optional<LRESULT> HandleWindowMessage(UINT message, WPARAM wParam,
                                                            LPARAM lParam);
  [[nodiscard]] ICoreWebView2* Core() const noexcept;
  [[nodiscard]] ICoreWebView2Environment* Environment() const noexcept;
  [[nodiscard]] bool Ready() const noexcept;
  [[nodiscard]] bool CompositionMode() const noexcept;
  [[nodiscard]] double ZoomFactor() const noexcept;
  [[nodiscard]] const std::filesystem::path& WebRoot() const noexcept;

  HRESULT PostJson(std::wstring_view json) const;
  HRESULT PostSharedBuffer(ICoreWebView2SharedBuffer* buffer,
                           COREWEBVIEW2_SHARED_BUFFER_ACCESS access,
                           std::wstring_view additionalData) const;

 private:
  HRESULT CreateController(std::uint64_t generation);
  HRESULT ConfigureController(ICoreWebView2Controller* controller,
                              ICoreWebView2CompositionController* compositionController);
  HRESULT ConfigureSecurity();
  void RegisterEvents();
  std::filesystem::path ResolveWebRoot() const;
  bool ValidateRuntime() const;
  bool TestMode() const noexcept;

  HWND parent_ = nullptr;
  bool compositionMode_ = true;
  bool ready_ = false;
  std::uint64_t generation_ = 0;
  RECT bounds_{};
  UINT dpi_ = 96;
  double zoomFactor_ = 1.0;
  std::filesystem::path userDataDirectory_;
  std::filesystem::path webRoot_;
  ReadyCallback readyCallback_;
  ProcessFailedCallback processFailedCallback_;
  winrt::Windows::UI::Composition::ContainerVisual visualRoot_{nullptr};
  Microsoft::WRL::ComPtr<ICoreWebView2Environment> environment_;
  Microsoft::WRL::ComPtr<ICoreWebView2Controller> controller_;
  Microsoft::WRL::ComPtr<ICoreWebView2CompositionController> compositionController_;
  Microsoft::WRL::ComPtr<ICoreWebView2> core_;
  WebViewInputRouter inputRouter_;
};

}  // namespace lgt::webview
