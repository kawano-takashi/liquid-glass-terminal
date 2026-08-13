#include <napi.h>

#include <windows.h>

#include <DispatcherQueue.h>
#include <Windows.UI.Composition.Interop.h>
#include <dwmapi.h>
#include <roapi.h>

#include <cstdint>
#include <cstring>
#include <memory>
#include <stdexcept>
#include <string>

#include <winrt/Microsoft.UI.Composition.SystemBackdrops.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.System.h>
#include <winrt/Windows.UI.Composition.Desktop.h>
#include <winrt/Windows.UI.Composition.h>
#include <winrt/base.h>

namespace {

namespace abi = ABI::Windows::UI::Composition::Desktop;
namespace backdrops = winrt::Microsoft::UI::Composition::SystemBackdrops;
namespace composition = winrt::Windows::UI::Composition;
namespace desktop = winrt::Windows::UI::Composition::Desktop;

// These documented Windows 11 attributes are kept numeric so the addon can still be
// compiled by VS installations whose bundled Windows SDK predates their enum names.
constexpr auto kUseHostBackdropBrush = static_cast<DWMWINDOWATTRIBUTE>(17);
constexpr auto kSystemBackdropType = static_cast<DWMWINDOWATTRIBUTE>(38);
constexpr int kBackdropNone = 1;

struct Session {
  HWND window = nullptr;
  HMODULE coreMessaging = nullptr;
  bool uninitializeWinRt = false;
  winrt::Windows::System::DispatcherQueueController dispatcher{nullptr};
  composition::Compositor compositor{nullptr};
  desktop::DesktopWindowTarget target{nullptr};
  backdrops::SystemBackdropConfiguration configuration{nullptr};
  backdrops::DesktopAcrylicController acrylic{nullptr};

  ~Session() { Reset(); }

  void Reset() noexcept {
    try {
      if (acrylic) acrylic.Close();
    } catch (...) {
    }
    acrylic = nullptr;
    configuration = nullptr;
    if (target) {
      try {
        target.Root(nullptr);
      } catch (...) {
      }
    }
    target = nullptr;
    compositor = nullptr;
    dispatcher = nullptr;

    if (window && IsWindow(window)) {
      const BOOL disabled = FALSE;
      const int backdrop = kBackdropNone;
      DwmSetWindowAttribute(window, kUseHostBackdropBrush, &disabled, sizeof(disabled));
      DwmSetWindowAttribute(window, kSystemBackdropType, &backdrop, sizeof(backdrop));
    }
    window = nullptr;

    if (uninitializeWinRt) {
      RoUninitialize();
      uninitializeWinRt = false;
    }
    if (coreMessaging) {
      FreeLibrary(coreMessaging);
      coreMessaging = nullptr;
    }
  }
};

std::unique_ptr<Session> g_session;
HMODULE g_runtime = nullptr;

HWND ReadWindowHandle(const Napi::Value& value) {
  if (!value.IsBuffer()) throw std::invalid_argument("Expected an Electron native window handle");
  const auto buffer = value.As<Napi::Buffer<std::uint8_t>>();
  if (buffer.Length() < sizeof(HWND)) throw std::invalid_argument("Invalid native window handle");

  HWND window = nullptr;
  std::memcpy(&window, buffer.Data(), sizeof(window));
  DWORD processId = 0;
  GetWindowThreadProcessId(window, &processId);
  if (!window || !IsWindow(window) || processId != GetCurrentProcessId() ||
      GetAncestor(window, GA_ROOT) != window) {
    throw std::invalid_argument("Native window handle does not belong to this process");
  }
  return window;
}

backdrops::SystemBackdropTheme ReadTheme(const Napi::Value& value) {
  if (!value.IsString()) throw std::invalid_argument("Expected a light or dark theme");
  const auto theme = value.As<Napi::String>().Utf8Value();
  if (theme == "dark") return backdrops::SystemBackdropTheme::Dark;
  if (theme == "light") return backdrops::SystemBackdropTheme::Light;
  throw std::invalid_argument("Expected a light or dark theme");
}

void InitializeWinRt(Session& session) {
  const HRESULT result = RoInitialize(RO_INIT_SINGLETHREADED);
  if (SUCCEEDED(result)) session.uninitializeWinRt = true;
  if (FAILED(result) && result != RPC_E_CHANGED_MODE) winrt::check_hresult(result);
}

void LoadRuntime() {
  if (g_runtime) return;
  g_runtime = LoadLibraryExW(
      L"Microsoft.WindowsAppRuntime.dll", nullptr,
      LOAD_LIBRARY_SEARCH_APPLICATION_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
  if (!g_runtime) {
    throw std::runtime_error(
        "The bundled Microsoft.WindowsAppRuntime.dll could not be loaded");
  }
}

void EnsureDispatcherQueue(Session& session) {
  if (winrt::Windows::System::DispatcherQueue::GetForCurrentThread()) return;

  session.coreMessaging = LoadLibraryExW(
      L"CoreMessaging.dll", nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
  if (!session.coreMessaging) winrt::throw_last_error();
  using CreateDispatcherQueueControllerFn = HRESULT(WINAPI*)(
      DispatcherQueueOptions, ABI::Windows::System::IDispatcherQueueController**);
  const auto createController = reinterpret_cast<CreateDispatcherQueueControllerFn>(
      GetProcAddress(session.coreMessaging, "CreateDispatcherQueueController"));
  if (!createController) {
    throw std::runtime_error("CreateDispatcherQueueController is unavailable");
  }

  const DispatcherQueueOptions options{
      sizeof(DispatcherQueueOptions), DQTYPE_THREAD_CURRENT, DQTAT_COM_NONE};
  winrt::check_hresult(createController(
      options,
      reinterpret_cast<ABI::Windows::System::IDispatcherQueueController**>(
          winrt::put_abi(session.dispatcher))));
}

void ConfigureTheme(Session& session, backdrops::SystemBackdropTheme theme,
                    bool highContrast) {
  session.configuration.Theme(theme);
  // Keeping this true deliberately preserves Acrylic for an unfocused terminal.
  session.configuration.IsInputActive(true);
  session.configuration.IsHighContrast(highContrast);
}

bool Attach(HWND window, backdrops::SystemBackdropTheme theme, bool highContrast) {
  if (g_session && g_session->window == window) {
    ConfigureTheme(*g_session, theme, highContrast);
    return true;
  }
  g_session.reset();

  auto session = std::make_unique<Session>();
  session->window = window;
  InitializeWinRt(*session);
  LoadRuntime();
  EnsureDispatcherQueue(*session);
  if (!backdrops::DesktopAcrylicController::IsSupported()) return false;

  const BOOL enabled = TRUE;
  const int backdrop = kBackdropNone;
  winrt::check_hresult(DwmSetWindowAttribute(
      window, kUseHostBackdropBrush, &enabled, sizeof(enabled)));
  winrt::check_hresult(DwmSetWindowAttribute(
      window, kSystemBackdropType, &backdrop, sizeof(backdrop)));
  const MARGINS margins{-1, -1, -1, -1};
  winrt::check_hresult(DwmExtendFrameIntoClientArea(window, &margins));

  session->compositor = composition::Compositor();
  const auto interop = session->compositor.as<abi::ICompositorDesktopInterop>();
  winrt::check_hresult(interop->CreateDesktopWindowTarget(
      window, false,
      reinterpret_cast<abi::IDesktopWindowTarget**>(winrt::put_abi(session->target))));
  session->target.Root(session->compositor.CreateContainerVisual());

  session->configuration = backdrops::SystemBackdropConfiguration();
  ConfigureTheme(*session, theme, highContrast);
  session->acrylic = backdrops::DesktopAcrylicController();
  session->acrylic.Kind(backdrops::DesktopAcrylicKind::Base);
  session->acrylic.SetSystemBackdropConfiguration(session->configuration);
  if (!session->acrylic.SetTarget(
          winrt::Microsoft::UI::WindowId{reinterpret_cast<std::uint64_t>(window)},
          session->target)) {
    return false;
  }

  g_session = std::move(session);
  return true;
}

Napi::Value IsSupported(const Napi::CallbackInfo& info) {
  const auto env = info.Env();
  try {
    Session probe;
    InitializeWinRt(probe);
    LoadRuntime();
    return Napi::Boolean::New(env, backdrops::DesktopAcrylicController::IsSupported());
  } catch (...) {
    return Napi::Boolean::New(env, false);
  }
}

Napi::Value AttachWindow(const Napi::CallbackInfo& info) {
  const auto env = info.Env();
  try {
    if (info.Length() < 3 || !info[2].IsBoolean()) {
      throw std::invalid_argument("Expected handle, theme, and high-contrast arguments");
    }
    return Napi::Boolean::New(
        env, Attach(ReadWindowHandle(info[0]), ReadTheme(info[1]),
                    info[2].As<Napi::Boolean>().Value()));
  } catch (const winrt::hresult_error& error) {
    Napi::Error::New(env, winrt::to_string(error.message())).ThrowAsJavaScriptException();
  } catch (const std::exception& error) {
    Napi::Error::New(env, error.what()).ThrowAsJavaScriptException();
  }
  return env.Undefined();
}

Napi::Value Update(const Napi::CallbackInfo& info) {
  const auto env = info.Env();
  try {
    if (!g_session || info.Length() < 2 || !info[1].IsBoolean()) {
      return Napi::Boolean::New(env, false);
    }
    ConfigureTheme(*g_session, ReadTheme(info[0]), info[1].As<Napi::Boolean>().Value());
    return Napi::Boolean::New(env, true);
  } catch (const winrt::hresult_error& error) {
    Napi::Error::New(env, winrt::to_string(error.message())).ThrowAsJavaScriptException();
  } catch (const std::exception& error) {
    Napi::Error::New(env, error.what()).ThrowAsJavaScriptException();
  }
  return env.Undefined();
}

Napi::Value Detach(const Napi::CallbackInfo& info) {
  g_session.reset();
  return info.Env().Undefined();
}

void Cleanup(void*) {
  g_session.reset();
  if (g_runtime) {
    FreeLibrary(g_runtime);
    g_runtime = nullptr;
  }
}

Napi::Object Initialize(Napi::Env env, Napi::Object exports) {
  napi_add_env_cleanup_hook(env, Cleanup, nullptr);
  exports.Set("isSupported", Napi::Function::New(env, IsSupported));
  exports.Set("attach", Napi::Function::New(env, AttachWindow));
  exports.Set("update", Napi::Function::New(env, Update));
  exports.Set("detach", Napi::Function::New(env, Detach));
  return exports;
}

}  // namespace

NODE_API_MODULE(windows_glass, Initialize)
