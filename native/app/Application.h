#pragma once

#include <windows.h>

#include <chrono>
#include <deque>
#include <memory>
#include <optional>

#include <wrl.h>

#include "composition/CompositionHost.h"
#include "diagnostics/Logger.h"
#include "platform/ClipboardService.h"
#include "platform/FileDropTarget.h"
#include "platform/SystemPolicy.h"
#include "settings/SettingsStore.h"
#include "terminal/ConPtySession.h"
#include "terminal/SharedBufferTransport.h"
#include "webview/WebViewBridge.h"
#include "webview/WebViewHost.h"
#include "window/NativeWindow.h"

namespace lgt::app {

class Application final {
 public:
  explicit Application(HINSTANCE instance);
  ~Application();

  int Run(int showCommand);

 private:
  bool HostSupported() const;
  bool CreateWindowAndGraphics();
  void InitializeWindowServices();
  HRESULT InitializeWebView();
  void OnWebViewReady(HRESULT result);
  void OnWebViewProcessFailed(COREWEBVIEW2_PROCESS_FAILED_KIND kind);
  void RecoverWebView();
  void RecoverGraphics();
  void UpdateLayout();
  void UpdatePolicy();
  void UpdateWindowState();
  void ApplySettings(const settings::Settings& settings);
  void SyncCompositionFailure(composition::AppearanceState previousState);
  void RegisterDropTarget();
  void RevokeDropTarget() noexcept;
  std::optional<LRESULT> OnWindowMessage(UINT message, WPARAM wParam, LPARAM lParam);

  HINSTANCE instance_ = nullptr;
  settings::SettingsStore settingsStore_;
  diagnostics::Logger logger_;
  std::unique_ptr<window::NativeWindow> window_;
  composition::CompositionHost composition_;
  webview::WebViewHost webView_;
  std::unique_ptr<platform::ClipboardService> clipboard_;
  std::unique_ptr<terminal::ConPtySession> terminal_;
  std::unique_ptr<terminal::SharedBufferTransport> transport_;
  std::unique_ptr<webview::WebViewBridge> bridge_;
  Microsoft::WRL::ComPtr<platform::FileDropTarget> dropTarget_;
  platform::PolicySnapshot policy_{};
  platform::SystemPolicyMonitor policyMonitor_;
  std::deque<std::chrono::steady_clock::time_point> webViewFailures_;
  bool dropRegistered_ = false;
  bool compositionMode_ = true;
  bool recoveringGraphics_ = false;
  bool initializingWebView_ = false;
  int webViewInitializationAttempts_ = 0;
};

}  // namespace lgt::app
