#pragma once

#include <windows.h>
#include <unknwn.h>
#include <wrl.h>

#include <functional>
#include <string>

#include <WebView2.h>

#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Data.Json.h>

#include "composition/CompositionHost.h"
#include "platform/ClipboardService.h"
#include "platform/SystemPolicy.h"
#include "settings/SettingsStore.h"
#include "terminal/ConPtySession.h"
#include "terminal/SharedBufferTransport.h"
#include "webview/WebViewHost.h"

namespace lgt::webview {

class WebViewBridge final {
 public:
  using SettingsChangedCallback = std::function<void(const settings::Settings&)>;

  WebViewBridge(settings::SettingsStore& settingsStore,
                composition::CompositionHost& compositionHost,
                terminal::ConPtySession& terminal,
                terminal::SharedBufferTransport& transport,
                platform::ClipboardService& clipboard,
                SettingsChangedCallback settingsChanged);
  ~WebViewBridge();

  bool Attach(WebViewHost& host, const platform::PolicySnapshot& policy);
  void Detach() noexcept;
  void UpdatePolicy(const platform::PolicySnapshot& policy);
  void PostAppearance();
  void PostDroppedPath(std::wstring_view quotedPath);
  void PostNotice(std::wstring_view level, std::wstring_view message);

 private:
  HRESULT OnMessage(ICoreWebView2WebMessageReceivedEventArgs* arguments);
  bool Dispatch(const winrt::Windows::Data::Json::JsonObject& envelope);
  bool HandleBridgeReady(const winrt::Windows::Data::Json::JsonObject& payload);
  bool HandleResize(const winrt::Windows::Data::Json::JsonObject& payload);
  bool HandleBufferCommit(std::wstring_view type,
                          const winrt::Windows::Data::Json::JsonObject& payload);
  bool HandleGlassLayout(const winrt::Windows::Data::Json::JsonObject& payload);
  bool HandleSettings(std::wstring_view type,
                      const winrt::Windows::Data::Json::JsonObject& payload);
  bool HandleClipboard(std::wstring_view type,
                       const winrt::Windows::Data::Json::JsonObject& payload);
  bool ParseSettingsPatch(const winrt::Windows::Data::Json::JsonObject& object,
                          settings::Settings& value) const;
  void EnsureTerminalStarted();
  void PostAccepted(bool sharedBuffers);
  void PostCapabilities();
  void PostSettingsSnapshot(std::wstring_view transactionId);
  void PostSettingsResult(std::wstring_view transactionId, bool success,
                          std::wstring_view error = {});
  void PostClipboardResult(std::wstring_view requestId, bool success,
                           std::wstring_view text = {}, std::wstring_view error = {});
  HRESULT Post(std::wstring_view type,
               const winrt::Windows::Data::Json::JsonObject& payload) const;

  settings::SettingsStore& settingsStore_;
  composition::CompositionHost& compositionHost_;
  terminal::ConPtySession& terminal_;
  terminal::SharedBufferTransport& transport_;
  platform::ClipboardService& clipboard_;
  SettingsChangedCallback settingsChanged_;
  WebViewHost* host_ = nullptr;
  platform::PolicySnapshot policy_{};
  EventRegistrationToken messageToken_{};
  bool tokenRegistered_ = false;
  bool handshake_ = false;
  bool sharedBuffers_ = false;
  short columns_ = 0;
  short rows_ = 0;
  std::uint32_t layoutRevision_ = 0;
  std::wstring settingsTransaction_;
};

}  // namespace lgt::webview
