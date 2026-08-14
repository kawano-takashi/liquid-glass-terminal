#include "app/Application.h"

#include "composition/GlassMaterial.h"

#include <shellapi.h>
#include <winternl.h>

#include <algorithm>
#include <string>

namespace lgt::app {
namespace {

constexpr DWORD kMinimumWindowsBuild = 26100;

DWORD WindowsBuild() {
  using RtlGetVersionFn = LONG(WINAPI*)(PRTL_OSVERSIONINFOW);
  const auto module = GetModuleHandleW(L"ntdll.dll");
  const auto function = reinterpret_cast<RtlGetVersionFn>(GetProcAddress(module, "RtlGetVersion"));
  RTL_OSVERSIONINFOW version{sizeof(version)};
  return function && function(&version) == 0 ? version.dwBuildNumber : 0;
}

bool ClientEdition() {
  wchar_t value[64]{};
  DWORD bytes = sizeof(value);
  if (RegGetValueW(HKEY_LOCAL_MACHINE, L"SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion",
                   L"InstallationType", RRF_RT_REG_SZ, nullptr, value, &bytes) != ERROR_SUCCESS) {
    return false;
  }
  return _wcsicmp(value, L"Client") == 0;
}

std::uint32_t RgbFromColorRef(COLORREF value) {
  return (static_cast<std::uint32_t>(GetRValue(value)) << 16) |
         (static_cast<std::uint32_t>(GetGValue(value)) << 8) |
         static_cast<std::uint32_t>(GetBValue(value));
}

#if defined(LGT_E2E_BUILD)
bool ForceCompositionFailureForE2E() noexcept {
  wchar_t value[2]{};
  return GetEnvironmentVariableW(L"LGT_E2E_FORCE_COMPOSITION_FAILURE", value,
                                 ARRAYSIZE(value)) == 1 &&
         value[0] == L'1';
}
#endif

}  // namespace

Application::Application(HINSTANCE instance)
    : instance_(instance), logger_(settingsStore_.DataDirectory()) {}

Application::~Application() {
  policyMonitor_.Reset();
  RevokeDropTarget();
  if (terminal_) terminal_->Close();
  if (transport_) transport_->Close();
  bridge_.reset();
  webView_.Close();
  composition_.Reset();
}

int Application::Run(int showCommand) {
  if (!HostSupported()) {
    MessageBoxW(nullptr,
                L"Liquid Glass Terminal 0.3.0 requires Windows 11 24H2 (build 26100) or later on an x64 client edition.",
                L"Liquid Glass Terminal", MB_OK | MB_ICONERROR);
    return 2;
  }
  settingsStore_.Load();
  policy_ = platform::QuerySystemPolicy();
  if (!CreateWindowAndGraphics()) return 3;
  InitializeWindowServices();
  UpdateLayout();
  const HRESULT webResult = InitializeWebView();
  if (FAILED(webResult)) OnWebViewReady(webResult);
  window_->Show(showCommand);

  MSG message{};
  while (GetMessageW(&message, nullptr, 0, 0) > 0) {
    TranslateMessage(&message);
    DispatchMessageW(&message);
  }
  return static_cast<int>(message.wParam);
}

bool Application::HostSupported() const {
#if !defined(_M_X64)
  return false;
#else
  return WindowsBuild() >= kMinimumWindowsBuild && ClientEdition();
#endif
}

bool Application::CreateWindowAndGraphics() {
  window_ = std::make_unique<window::NativeWindow>(
      instance_, [this](UINT message, WPARAM wParam, LPARAM lParam) {
        return OnWindowMessage(message, wParam, lParam);
      });
  const auto state = settingsStore_.LoadWindowState();
  if (!window_->Create(state, true)) return false;
  compositionMode_ = false;
#if defined(LGT_E2E_BUILD)
  const bool forceCompositionFailure = ForceCompositionFailureForE2E();
#else
  constexpr bool forceCompositionFailure = false;
#endif
  if (!forceCompositionFailure) {
    for (int attempt = 0; attempt < 2; ++attempt) {
      if (composition_.Initialize(window_->Handle())) {
        compositionMode_ = true;
        break;
      }
      logger_.Write(diagnostics::Level::Warning, L"composition.initialize.retry", attempt + 1);
    }
#if defined(LGT_E2E_BUILD)
  } else {
    logger_.Write(diagnostics::Level::Warning, L"composition.initialize.forced-failure");
#endif
  }
  if (!compositionMode_) {
    const auto fallbackState = window_->CaptureState();
    window_->DestroyForRecreate();
    if (!window_->Create(fallbackState, false)) return false;
    logger_.Write(diagnostics::Level::Error, L"composition.initialize.safe-mode");
  } else {
    composition_.SetAppearance(settingsStore_.Current(), policy_);
  }
  return true;
}

void Application::InitializeWindowServices() {
  const HWND handle = window_->Handle();
  policyMonitor_.Start(handle);
  window_->SetWebHitTestHandler(
      [this](POINT point) { return webView_.NonClientHitTest(point); });
  clipboard_ = std::make_unique<platform::ClipboardService>(handle);
  if (terminal_) terminal_->SetNotificationWindow(handle);
  else terminal_ = std::make_unique<terminal::ConPtySession>(handle);
  if (transport_) transport_->SetNotificationWindow(handle);
  else transport_ = std::make_unique<terminal::SharedBufferTransport>(handle);
  bridge_ = std::make_unique<webview::WebViewBridge>(
      settingsStore_, composition_, *terminal_, *transport_, *clipboard_,
      [this](const settings::Settings& value) { ApplySettings(value); });
  UpdateWindowState();
}

HRESULT Application::InitializeWebView() {
  if (initializingWebView_) return E_PENDING;
  initializingWebView_ = true;
  ++webViewInitializationAttempts_;
  UpdateLayout();
  const auto& settings = settingsStore_.Effective();
  const bool opaque = !compositionMode_ ||
                      composition_.State() != composition::AppearanceState::Glass;
  if (opaque) {
    const std::uint32_t background = policy_.highContrast
                                         ? RgbFromColorRef(GetSysColor(COLOR_WINDOW))
                                         : composition::ToneRgb(settings.glass.tone);
    webView_.SetOpaqueBackground(background);
  } else {
    webView_.SetTransparentBackground();
  }
  return webView_.Initialize(
      window_->Handle(), compositionMode_, composition_.WebRoot(),
      settingsStore_.WebViewDataDirectory(),
      [this](HRESULT result) { OnWebViewReady(result); },
      [this](COREWEBVIEW2_PROCESS_FAILED_KIND kind) { OnWebViewProcessFailed(kind); });
}

void Application::OnWebViewReady(HRESULT result) {
  initializingWebView_ = false;
  if (FAILED(result)) {
    logger_.Write(diagnostics::Level::Error, L"webview.initialize.failed", result);
    if (result == HRESULT_FROM_WIN32(ERROR_OLD_WIN_VERSION)) {
      MessageBoxW(window_->Handle(),
                  L"Microsoft Edge WebView2 Runtime 150.0.4078.44 or later is required. This application does not download runtimes.",
                  L"Liquid Glass Terminal", MB_OK | MB_ICONERROR);
      PostMessageW(window_->Handle(), WM_CLOSE, 0, 0);
      return;
    }
    if (compositionMode_ && webViewInitializationAttempts_ < 2) {
      const auto state = window_->CaptureState();
      webView_.Close();
      composition_.Reset();
      RevokeDropTarget();
      window_->DestroyForRecreate();
      if (!window_->Create(state, false)) {
        PostQuitMessage(4);
        return;
      }
      compositionMode_ = false;
      InitializeWindowServices();
      UpdateLayout();
      InitializeWebView();
      window_->Show(SW_SHOW);
      return;
    }
    const int choice = MessageBoxW(window_->Handle(),
                                   L"The WebView2 user interface could not be started. Retry?",
                                   L"Liquid Glass Terminal", MB_RETRYCANCEL | MB_ICONERROR);
    if (choice == IDRETRY) {
      webView_.Close();
      InitializeWebView();
    } else {
      PostMessageW(window_->Handle(), WM_CLOSE, 0, 0);
    }
    return;
  }
  webViewInitializationAttempts_ = 0;
  UpdateLayout();
  ApplySettings(settingsStore_.Effective());
  bridge_->Attach(webView_, policy_);
  RegisterDropTarget();
  logger_.Write(diagnostics::Level::Info, L"webview.ready");
}

void Application::OnWebViewProcessFailed(COREWEBVIEW2_PROCESS_FAILED_KIND kind) {
  logger_.Write(diagnostics::Level::Warning, L"webview.process.failed", kind);
  const auto now = std::chrono::steady_clock::now();
  webViewFailures_.push_back(now);
  while (!webViewFailures_.empty() && now - webViewFailures_.front() > std::chrono::seconds(60)) {
    webViewFailures_.pop_front();
  }
  if (transport_) transport_->PauseForRecovery();
  if (bridge_) bridge_->Detach();
  webView_.Close();
  if (webViewFailures_.size() <= 3) {
    RecoverWebView();
    return;
  }
  const int choice = MessageBoxW(window_->Handle(),
                                 L"The WebView2 interface stopped repeatedly. The terminal process is paused. Retry the interface or quit?",
                                 L"Liquid Glass Terminal", MB_RETRYCANCEL | MB_ICONERROR);
  if (choice == IDRETRY) {
    webViewFailures_.clear();
    RecoverWebView();
  } else {
    PostMessageW(window_->Handle(), WM_CLOSE, 0, 0);
  }
}

void Application::RecoverWebView() {
  initializingWebView_ = false;
  InitializeWebView();
}

void Application::RecoverGraphics() {
  if (recoveringGraphics_ || !compositionMode_ || !window_) return;
  recoveringGraphics_ = true;
  logger_.Write(diagnostics::Level::Warning, L"composition.device-replaced");
  RevokeDropTarget();
  if (bridge_) bridge_->Detach();
  if (transport_) transport_->PauseForRecovery();
  webView_.Close();
  initializingWebView_ = false;

  if (composition_.Rebuild()) {
    UpdateLayout();
    const HRESULT result = InitializeWebView();
    if (FAILED(result)) OnWebViewReady(result);
    recoveringGraphics_ = false;
    return;
  }

  logger_.Write(diagnostics::Level::Error, L"composition.recovery.safe-mode");
  const auto state = window_->CaptureState();
  bridge_.reset();
  clipboard_.reset();
  composition_.Reset();
  window_->DestroyForRecreate();
  if (!window_->Create(state, false)) {
    recoveringGraphics_ = false;
    PostQuitMessage(5);
    return;
  }
  compositionMode_ = false;
  InitializeWindowServices();
  UpdateLayout();
  const HRESULT result = InitializeWebView();
  if (FAILED(result)) OnWebViewReady(result);
  window_->Show(SW_SHOW);
  recoveringGraphics_ = false;
}

void Application::UpdateLayout() {
  if (!window_) return;
  RECT client{};
  GetClientRect(window_->Handle(), &client);
  const UINT width = static_cast<UINT>(std::max(0L, client.right - client.left));
  const UINT height = static_cast<UINT>(std::max(0L, client.bottom - client.top));
  const double zoom = static_cast<double>(settingsStore_.Effective().uiScale) / 100.0;
  if (compositionMode_) {
    const auto previous = composition_.State();
    composition_.Resize(width, height, window_->Dpi(), zoom);
    SyncCompositionFailure(previous);
  }
  webView_.Resize(window_->WebViewBounds(), window_->Dpi(), zoom);
}

void Application::UpdatePolicy() {
  policy_ = platform::QuerySystemPolicy();
  ApplySettings(settingsStore_.Effective());
  if (bridge_) bridge_->UpdatePolicy(policy_);
}

void Application::UpdateWindowState() {
  if (!window_) return;
  const bool maximized = IsZoomed(window_->Handle()) != FALSE;
  composition_.SetFullscreen(window_->Fullscreen());
  composition_.SetCaptionState(window_->HoveredCaptionButton(),
                               window_->PressedCaptionButton(), maximized);
  if (bridge_) {
    bridge_->UpdateWindowState(maximized, window_->Fullscreen(), window_->Active());
  }
}

void Application::ApplySettings(const settings::Settings& settings) {
  if (compositionMode_) composition_.SetAppearance(settings, policy_);
  const bool opaque = !compositionMode_ || composition_.State() != composition::AppearanceState::Glass;
  if (opaque) {
    const std::uint32_t background =
        policy_.highContrast ? RgbFromColorRef(GetSysColor(COLOR_WINDOW))
                             : composition::ToneRgb(settings.glass.tone);
    webView_.SetOpaqueBackground(background);
  }
  else webView_.SetTransparentBackground();
  UpdateLayout();
  if (dropTarget_ && terminal_) dropTarget_->SetShell(terminal_->Shell());
  if (bridge_) bridge_->PostAppearance();
}

void Application::SyncCompositionFailure(composition::AppearanceState previousState) {
  if (!compositionMode_ || previousState == composition::AppearanceState::Safe ||
      composition_.State() != composition::AppearanceState::Safe) {
    return;
  }
  const auto& settings = settingsStore_.Effective();
  const std::uint32_t background =
      policy_.highContrast ? RgbFromColorRef(GetSysColor(COLOR_WINDOW))
                           : composition::ToneRgb(settings.glass.tone);
  webView_.SetOpaqueBackground(background);
  logger_.Write(diagnostics::Level::Error, L"composition.update.safe-mode");
  if (bridge_) {
    bridge_->PostNotice(L"error", L"composition.update.failed");
    bridge_->PostAppearance();
  }
}

void Application::RegisterDropTarget() {
  if (dropRegistered_) return;
  dropTarget_ = Microsoft::WRL::Make<platform::FileDropTarget>(
      terminal_ ? terminal_->Shell() : platform::ShellKind::PowerShell,
      [this](std::wstring value) {
        if (bridge_) bridge_->PostDroppedPath(value);
      });
  if (dropTarget_ && SUCCEEDED(RegisterDragDrop(window_->Handle(), dropTarget_.Get()))) {
    dropRegistered_ = true;
  }
}

void Application::RevokeDropTarget() noexcept {
  if (dropRegistered_ && window_ && window_->Handle()) RevokeDragDrop(window_->Handle());
  dropRegistered_ = false;
  dropTarget_.Reset();
}

std::optional<LRESULT> Application::OnWindowMessage(UINT message, WPARAM wParam,
                                                     LPARAM lParam) {
  switch (message) {
    case WM_SIZE:
      webView_.SetVisible(wParam != SIZE_MINIMIZED);
      UpdateLayout();
      UpdateWindowState();
      break;
    case WM_MOVE:
      webView_.NotifyParentPositionChanged();
      break;
    case WM_ACTIVATE:
      if (compositionMode_) {
        const auto previous = composition_.State();
        composition_.SetActive(LOWORD(wParam) != WA_INACTIVE);
        SyncCompositionFailure(previous);
      }
      UpdateWindowState();
      break;
    case WM_SETTINGCHANGE:
    case WM_THEMECHANGED:
    case WM_DWMCOMPOSITIONCHANGED:
    case WM_POWERBROADCAST:
    case WM_WTSSESSION_CHANGE:
      UpdatePolicy();
      break;
    case platform::kSystemPolicyChangedMessage:
      UpdatePolicy();
      return 0;
    case window::kWindowStateChangedMessage:
    case window::kWindowChromeChangedMessage:
      UpdateLayout();
      UpdateWindowState();
      return 0;
    case terminal::kOutputAvailableMessage:
      if (transport_) transport_->DrainOutput();
      return 0;
    case composition::kCompositionDeviceLostMessage:
      RecoverGraphics();
      return 0;
    case terminal::kTerminalExitedMessage:
      PostMessageW(window_->Handle(), WM_CLOSE, 0, 0);
      return 0;
    case WM_CLOSE:
      if (window_ && !window_->Fullscreen()) settingsStore_.SaveWindowState(window_->CaptureState());
      RevokeDropTarget();
      if (terminal_) terminal_->Close();
      if (transport_) transport_->Close();
      break;
  }
  if (auto input = webView_.HandleWindowMessage(message, wParam, lParam)) return input;
  return std::nullopt;
}

}  // namespace lgt::app
