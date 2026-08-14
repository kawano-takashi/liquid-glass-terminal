#include "webview/WebViewHost.h"

#include <WebView2EnvironmentOptions.h>
#include <wil/com.h>

#include <algorithm>
#include <cwchar>
#include <system_error>

namespace lgt::webview {
namespace {

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;

constexpr wchar_t kMinimumRuntime[] = L"150.0.4078.44";
constexpr wchar_t kHostName[] = L"app.liquid-glass-terminal.invalid";
constexpr wchar_t kAppUrl[] = L"https://app.liquid-glass-terminal.invalid/index.html";
constexpr wchar_t kOriginPrefix[] = L"https://app.liquid-glass-terminal.invalid/";

std::filesystem::path ModuleDirectory() {
  std::wstring buffer(32768, L'\0');
  const DWORD length = GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
  if (length == 0 || length >= buffer.size()) return std::filesystem::current_path();
  buffer.resize(length);
  return std::filesystem::path(buffer).parent_path();
}

bool StartsWith(std::wstring_view value, std::wstring_view prefix) {
  return value.size() >= prefix.size() && value.substr(0, prefix.size()) == prefix;
}

}  // namespace

WebViewHost::~WebViewHost() { Close(); }

HRESULT WebViewHost::Initialize(
    HWND parent, bool compositionMode,
    const winrt::Windows::UI::Composition::ContainerVisual& visualRoot,
    std::filesystem::path userDataDirectory, ReadyCallback ready,
    ProcessFailedCallback processFailed) {
  Close();
  parent_ = parent;
  compositionMode_ = compositionMode;
  visualRoot_ = visualRoot;
  userDataDirectory_ = std::move(userDataDirectory);
  readyCallback_ = std::move(ready);
  processFailedCallback_ = std::move(processFailed);
  const std::uint64_t generation = ++generation_;
  webRoot_ = ResolveWebRoot();
  if (!ValidateRuntime()) return HRESULT_FROM_WIN32(ERROR_OLD_WIN_VERSION);
  if (!std::filesystem::is_regular_file(webRoot_ / L"index.html")) {
    return HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND);
  }
  std::error_code error;
  std::filesystem::create_directories(userDataDirectory_, error);

  auto options = Microsoft::WRL::Make<CoreWebView2EnvironmentOptions>();
  if (!options) return E_OUTOFMEMORY;
  if (TestMode()) {
    wchar_t port[16]{};
    GetEnvironmentVariableW(L"LGT_E2E_REMOTE_DEBUGGING_PORT", port, ARRAYSIZE(port));
    std::wstring arguments = L"--remote-debugging-port=";
    arguments += port;
    arguments += L" --remote-debugging-address=127.0.0.1";
    arguments += L" --remote-allow-origins=http://127.0.0.1:";
    arguments += port;
    options->put_AdditionalBrowserArguments(arguments.c_str());
  }
  return CreateCoreWebView2EnvironmentWithOptions(
      nullptr, userDataDirectory_.c_str(), options.Get(),
      Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
          [this, generation](HRESULT result,
                             ICoreWebView2Environment* environment) -> HRESULT {
            if (generation != generation_) return S_OK;
            if (FAILED(result) || !environment) {
              if (readyCallback_) readyCallback_(FAILED(result) ? result : E_FAIL);
              return S_OK;
            }
            environment_ = environment;
            const HRESULT controllerResult = CreateController(generation);
            if (FAILED(controllerResult) && readyCallback_) readyCallback_(controllerResult);
            return S_OK;
          })
          .Get());
}

HRESULT WebViewHost::CreateController(std::uint64_t generation) {
  if (!environment_) return E_UNEXPECTED;
  if (compositionMode_) {
    ComPtr<ICoreWebView2Environment3> environment3;
    RETURN_IF_FAILED(environment_.As(&environment3));
    return environment3->CreateCoreWebView2CompositionController(
        parent_,
        Callback<ICoreWebView2CreateCoreWebView2CompositionControllerCompletedHandler>(
            [this, generation](HRESULT result,
                               ICoreWebView2CompositionController* controller) -> HRESULT {
              if (generation != generation_) return S_OK;
              if (FAILED(result) || !controller) {
                if (readyCallback_) readyCallback_(FAILED(result) ? result : E_FAIL);
                return S_OK;
              }
              compositionController_ = controller;
              ComPtr<ICoreWebView2Controller> base;
              const HRESULT query = controller->QueryInterface(IID_PPV_ARGS(&base));
              const HRESULT configured = SUCCEEDED(query)
                                             ? ConfigureController(base.Get(), controller)
                                             : query;
              if (readyCallback_) readyCallback_(configured);
              return S_OK;
            })
            .Get());
  }
  return environment_->CreateCoreWebView2Controller(
      parent_, Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                   [this, generation](HRESULT result,
                                      ICoreWebView2Controller* controller) -> HRESULT {
                     if (generation != generation_) return S_OK;
                     const HRESULT configured =
                         SUCCEEDED(result) && controller
                             ? ConfigureController(controller, nullptr)
                             : (FAILED(result) ? result : E_FAIL);
                     if (readyCallback_) readyCallback_(configured);
                     return S_OK;
                   })
                   .Get());
}

HRESULT WebViewHost::ConfigureController(
    ICoreWebView2Controller* controller,
    ICoreWebView2CompositionController* compositionController) {
  controller_ = controller;
  if (compositionController) {
    compositionController_ = compositionController;
    auto target = visualRoot_.as<::IUnknown>();
    RETURN_IF_FAILED(compositionController_->put_RootVisualTarget(target.get()));
  }
  RETURN_IF_FAILED(controller_->get_CoreWebView2(&core_));
  ComPtr<ICoreWebView2Controller2> controller2;
  if (SUCCEEDED(controller_.As(&controller2))) {
    const COREWEBVIEW2_COLOR transparent{0, 0, 0, 0};
    RETURN_IF_FAILED(controller2->put_DefaultBackgroundColor(transparent));
  }
  ComPtr<ICoreWebView2Controller4> controller4;
  if (SUCCEEDED(controller_.As(&controller4))) controller4->put_AllowExternalDrop(FALSE);
  inputRouter_.Attach(parent_, environment_.Get(), controller_.Get(), compositionController_.Get());
  RETURN_IF_FAILED(ConfigureSecurity());
  RegisterEvents();
  Resize(bounds_, dpi_, zoomFactor_);
  RETURN_IF_FAILED(core_->Navigate(kAppUrl));
  ready_ = true;
  return S_OK;
}

HRESULT WebViewHost::ConfigureSecurity() {
  ComPtr<ICoreWebView2Settings> settings;
  RETURN_IF_FAILED(core_->get_Settings(&settings));
  settings->put_IsScriptEnabled(TRUE);
  settings->put_IsWebMessageEnabled(TRUE);
  settings->put_IsStatusBarEnabled(FALSE);
  settings->put_AreDevToolsEnabled(TestMode() ? TRUE : FALSE);
  settings->put_AreDefaultContextMenusEnabled(FALSE);
  settings->put_AreHostObjectsAllowed(FALSE);
  settings->put_IsZoomControlEnabled(FALSE);
  settings->put_IsBuiltInErrorPageEnabled(FALSE);
  ComPtr<ICoreWebView2Settings3> settings3;
  if (SUCCEEDED(settings.As(&settings3))) settings3->put_AreBrowserAcceleratorKeysEnabled(FALSE);

  ComPtr<ICoreWebView2_3> core3;
  RETURN_IF_FAILED(core_.As(&core3));
  RETURN_IF_FAILED(core3->SetVirtualHostNameToFolderMapping(
      kHostName, webRoot_.c_str(), COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_DENY_CORS));
  return S_OK;
}

void WebViewHost::RegisterEvents() {
  const std::uint64_t generation = generation_;
  EventRegistrationToken token{};
  core_->add_NavigationStarting(
      Callback<ICoreWebView2NavigationStartingEventHandler>(
          [](ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs* arguments) -> HRESULT {
            wil::unique_cotaskmem_string uri;
            if (FAILED(arguments->get_Uri(&uri)) || !uri || wcscmp(uri.get(), kAppUrl) != 0) {
              arguments->put_Cancel(TRUE);
            }
            return S_OK;
          })
          .Get(),
      &token);
  core_->add_NewWindowRequested(
      Callback<ICoreWebView2NewWindowRequestedEventHandler>(
          [](ICoreWebView2*, ICoreWebView2NewWindowRequestedEventArgs* arguments) -> HRESULT {
            arguments->put_Handled(TRUE);
            return S_OK;
          })
          .Get(),
      &token);
  core_->add_PermissionRequested(
      Callback<ICoreWebView2PermissionRequestedEventHandler>(
          [](ICoreWebView2*, ICoreWebView2PermissionRequestedEventArgs* arguments) -> HRESULT {
            arguments->put_State(COREWEBVIEW2_PERMISSION_STATE_DENY);
            return S_OK;
          })
          .Get(),
      &token);
  core_->add_ProcessFailed(
      Callback<ICoreWebView2ProcessFailedEventHandler>(
          [this, generation](ICoreWebView2*,
                             ICoreWebView2ProcessFailedEventArgs* arguments) -> HRESULT {
            if (generation != generation_) return S_OK;
            COREWEBVIEW2_PROCESS_FAILED_KIND kind{};
            arguments->get_ProcessFailedKind(&kind);
            if (processFailedCallback_) processFailedCallback_(kind);
            return S_OK;
          })
          .Get(),
      &token);
  ComPtr<ICoreWebView2_4> core4;
  if (SUCCEEDED(core_.As(&core4))) {
    core4->add_DownloadStarting(
        Callback<ICoreWebView2DownloadStartingEventHandler>(
            [](ICoreWebView2*, ICoreWebView2DownloadStartingEventArgs* arguments) -> HRESULT {
              arguments->put_Cancel(TRUE);
              return S_OK;
            })
            .Get(),
        &token);
  }
  core_->AddWebResourceRequestedFilter(L"*", COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
  core_->add_WebResourceRequested(
      Callback<ICoreWebView2WebResourceRequestedEventHandler>(
          [this, generation](ICoreWebView2*,
                             ICoreWebView2WebResourceRequestedEventArgs* arguments) -> HRESULT {
            if (generation != generation_) return S_OK;
            ComPtr<ICoreWebView2WebResourceRequest> request;
            if (FAILED(arguments->get_Request(&request))) return S_OK;
            wil::unique_cotaskmem_string uri;
            if (SUCCEEDED(request->get_Uri(&uri)) && uri &&
                StartsWith(uri.get(), kOriginPrefix)) {
              return S_OK;
            }
            ComPtr<ICoreWebView2WebResourceResponse> response;
            if (SUCCEEDED(environment_->CreateWebResourceResponse(
                    nullptr, 403, L"Forbidden", L"Content-Type: text/plain\r\n", &response))) {
              arguments->put_Response(response.Get());
            }
            return S_OK;
          })
          .Get(),
      &token);
}

void WebViewHost::Close() noexcept {
  ++generation_;
  ready_ = false;
  inputRouter_.Detach();
  try {
    if (compositionController_) compositionController_->put_RootVisualTarget(nullptr);
    if (controller_) controller_->Close();
  } catch (...) {
  }
  core_.Reset();
  compositionController_.Reset();
  controller_.Reset();
  environment_.Reset();
  visualRoot_ = nullptr;
}

void WebViewHost::Resize(RECT bounds, UINT dpi, double zoomFactor) {
  bounds_ = bounds;
  dpi_ = dpi == 0 ? 96 : dpi;
  zoomFactor_ = std::clamp(zoomFactor, 0.8, 2.0);
  inputRouter_.SetBounds(bounds_);
  if (!controller_) return;
  ComPtr<ICoreWebView2Controller3> controller3;
  if (SUCCEEDED(controller_.As(&controller3))) {
    controller3->put_ShouldDetectMonitorScaleChanges(FALSE);
    controller3->put_RasterizationScale(static_cast<double>(dpi_) / 96.0);
  }
  controller_->put_Bounds(bounds_);
  controller_->put_ZoomFactor(zoomFactor_);
  controller_->NotifyParentWindowPositionChanged();
}

void WebViewHost::NotifyParentPositionChanged() {
  if (controller_) controller_->NotifyParentWindowPositionChanged();
}

void WebViewHost::SetOpaqueBackground(std::uint32_t tint) {
  ComPtr<ICoreWebView2Controller2> controller2;
  if (FAILED(controller_.As(&controller2))) return;
  const COREWEBVIEW2_COLOR color{255, static_cast<BYTE>((tint >> 16) & 0xFF),
                                 static_cast<BYTE>((tint >> 8) & 0xFF),
                                 static_cast<BYTE>(tint & 0xFF)};
  controller2->put_DefaultBackgroundColor(color);
}

void WebViewHost::SetTransparentBackground() {
  ComPtr<ICoreWebView2Controller2> controller2;
  if (FAILED(controller_.As(&controller2))) return;
  const COREWEBVIEW2_COLOR transparent{0, 0, 0, 0};
  controller2->put_DefaultBackgroundColor(transparent);
}

void WebViewHost::SetVisible(bool visible) {
  if (controller_) controller_->put_IsVisible(visible ? TRUE : FALSE);
}

std::optional<LRESULT> WebViewHost::HandleWindowMessage(UINT message, WPARAM wParam,
                                                        LPARAM lParam) {
  return inputRouter_.Handle(message, wParam, lParam);
}

ICoreWebView2* WebViewHost::Core() const noexcept { return core_.Get(); }
ICoreWebView2Environment* WebViewHost::Environment() const noexcept { return environment_.Get(); }
bool WebViewHost::Ready() const noexcept { return ready_; }
bool WebViewHost::CompositionMode() const noexcept { return compositionMode_; }
double WebViewHost::ZoomFactor() const noexcept { return zoomFactor_; }
const std::filesystem::path& WebViewHost::WebRoot() const noexcept { return webRoot_; }

HRESULT WebViewHost::PostJson(std::wstring_view json) const {
  if (!core_) return E_UNEXPECTED;
  return core_->PostWebMessageAsJson(std::wstring(json).c_str());
}

HRESULT WebViewHost::PostSharedBuffer(ICoreWebView2SharedBuffer* buffer,
                                      COREWEBVIEW2_SHARED_BUFFER_ACCESS access,
                                      std::wstring_view additionalData) const {
  if (!core_ || !buffer) return E_INVALIDARG;
  ComPtr<ICoreWebView2_17> core17;
  RETURN_IF_FAILED(core_.As(&core17));
  return core17->PostSharedBufferToScript(buffer, access, std::wstring(additionalData).c_str());
}

std::filesystem::path WebViewHost::ResolveWebRoot() const {
  const auto packaged = ModuleDirectory() / L"web";
  if (std::filesystem::is_regular_file(packaged / L"index.html")) return packaged;
  return std::filesystem::weakly_canonical(std::filesystem::current_path() / L"build" / L"web");
}

bool WebViewHost::ValidateRuntime() const {
  wil::unique_cotaskmem_string version;
  if (FAILED(GetAvailableCoreWebView2BrowserVersionString(nullptr, &version)) || !version) return false;
  int comparison = 0;
  return SUCCEEDED(CompareBrowserVersions(version.get(), kMinimumRuntime, &comparison)) &&
         comparison >= 0;
}

bool WebViewHost::TestMode() const noexcept {
#if defined(LGT_E2E_BUILD)
  wchar_t value[16]{};
  const DWORD length = GetEnvironmentVariableW(L"LGT_E2E_REMOTE_DEBUGGING_PORT", value,
                                                ARRAYSIZE(value));
  if (length == 0 || length >= ARRAYSIZE(value)) return false;
  if (!std::all_of(value, value + length,
                   [](wchar_t character) { return character >= L'0' && character <= L'9'; })) {
    return false;
  }
  wchar_t* end = nullptr;
  const unsigned long port = wcstoul(value, &end, 10);
  return end == value + length && port >= 1 && port <= 65535;
#else
  return false;
#endif
}

}  // namespace lgt::webview
