#include <napi.h>

#include <windows.h>

#include <DispatcherQueue.h>
#include <Windows.UI.Composition.Interop.h>
#include <dwmapi.h>
#include <roapi.h>

#include <cstdint>
#include <cstring>
#include <algorithm>
#include <atomic>
#include <cmath>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>

#include <winrt/Microsoft.UI.Composition.SystemBackdrops.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.System.h>
#include <winrt/Windows.UI.h>
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
constexpr auto kWindowCornerPreference = static_cast<DWMWINDOWATTRIBUTE>(33);
constexpr auto kBorderColor = static_cast<DWMWINDOWATTRIBUTE>(34);
constexpr auto kSystemBackdropType = static_cast<DWMWINDOWATTRIBUTE>(38);
constexpr int kBackdropNone = 1;
constexpr int kBackdropTransientWindow = 3;
constexpr int kCornerDefault = 0;
constexpr int kCornerSmall = 3;
constexpr COLORREF kColorDefault = 0xFFFFFFFF;
constexpr COLORREF kColorNone = 0xFFFFFFFE;

struct AppearanceOptions {
  backdrops::SystemBackdropTheme theme;
  bool highContrast;
  float tintOpacity;
  float luminosityOpacity;
  std::uint8_t neutralTone;
};

struct AcrylicStateCallback {
  Napi::ThreadSafeFunction function;
  std::atomic_bool active{true};
};

struct Session {
  HWND window = nullptr;
  HMODULE coreMessaging = nullptr;
  bool uninitializeWinRt = false;
  winrt::Windows::System::DispatcherQueueController dispatcher{nullptr};
  composition::Compositor compositor{nullptr};
  desktop::DesktopWindowTarget target{nullptr};
  backdrops::SystemBackdropConfiguration configuration{nullptr};
  backdrops::DesktopAcrylicController acrylic{nullptr};
  winrt::event_token stateChangedToken{};
  bool hasStateChangedToken = false;
  std::shared_ptr<AcrylicStateCallback> stateCallback;

  ~Session() { Reset(); }

  void Reset() noexcept {
    if (acrylic && hasStateChangedToken) {
      try {
        acrylic.StateChanged(stateChangedToken);
      } catch (...) {
      }
      hasStateChangedToken = false;
    }
    if (stateCallback) {
      stateCallback->active.store(false);
      stateCallback->function.Release();
      stateCallback.reset();
    }
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
      const int corner = kCornerDefault;
      const COLORREF border = kColorDefault;
      const MARGINS margins{0, 0, 0, 0};
      DwmSetWindowAttribute(window, kUseHostBackdropBrush, &disabled, sizeof(disabled));
      DwmSetWindowAttribute(window, kSystemBackdropType, &backdrop, sizeof(backdrop));
      DwmSetWindowAttribute(window, kWindowCornerPreference, &corner, sizeof(corner));
      DwmSetWindowAttribute(window, kBorderColor, &border, sizeof(border));
      DwmExtendFrameIntoClientArea(window, &margins);
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

AppearanceOptions ReadOptions(const Napi::Value& value) {
  if (!value.IsObject()) {
    throw std::invalid_argument("Expected appearance options");
  }
  const auto options = value.As<Napi::Object>();
  const auto highContrast = options.Get("highContrast");
  const auto tintOpacity = options.Get("tintOpacity");
  const auto luminosityOpacity = options.Get("luminosityOpacity");
  const auto neutralTone = options.Get("neutralTone");
  if (!highContrast.IsBoolean() || !tintOpacity.IsNumber() ||
      !luminosityOpacity.IsNumber() || !neutralTone.IsNumber()) {
    throw std::invalid_argument("Expected complete Acrylic appearance options");
  }
  const double opacity = tintOpacity.As<Napi::Number>().DoubleValue();
  const double luminosity = luminosityOpacity.As<Napi::Number>().DoubleValue();
  const double tone = neutralTone.As<Napi::Number>().DoubleValue();
  if (!std::isfinite(opacity) || opacity < 0.0 || opacity > 0.50) {
    throw std::invalid_argument("Tint opacity must be between 0.0 and 0.50");
  }
  if (!std::isfinite(luminosity) || luminosity < 0.0 || luminosity > 1.0 ||
      !std::isfinite(tone) || std::floor(tone) != tone || tone < 0.0 || tone > 255.0) {
    throw std::invalid_argument("Invalid Acrylic luminosity or neutral tone");
  }
  return AppearanceOptions{ReadTheme(options.Get("theme")),
                           highContrast.As<Napi::Boolean>().Value(),
                           static_cast<float>(opacity),
                           static_cast<float>(luminosity),
                           static_cast<std::uint8_t>(tone)};
}

const char* StateName(backdrops::SystemBackdropState state) {
  switch (state) {
    case backdrops::SystemBackdropState::Active:
      return "active";
    case backdrops::SystemBackdropState::Fallback:
      return "fallback";
    case backdrops::SystemBackdropState::HighContrast:
      return "high-contrast";
  }
  return "fallback";
}

Napi::Value StateValue(Napi::Env env, backdrops::SystemBackdropState state) {
  return Napi::String::New(env, StateName(state));
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

void ConfigureAppearance(Session& session, const AppearanceOptions& options) {
  session.configuration.Theme(options.theme);
  // Keeping this true deliberately preserves Acrylic for an unfocused terminal.
  session.configuration.IsInputActive(true);
  session.configuration.IsHighContrast(options.highContrast);
  const auto color = winrt::Windows::UI::Color{
      255, options.neutralTone, options.neutralTone, options.neutralTone};
  session.acrylic.TintColor(color);
  session.acrylic.FallbackColor(color);
  session.acrylic.TintOpacity(options.tintOpacity);
  session.acrylic.LuminosityOpacity(options.luminosityOpacity);
}

std::optional<backdrops::SystemBackdropState> Attach(
    Napi::Env env, HWND window, const AppearanceOptions& options,
    const Napi::Function& stateCallback) {
  if (g_session && g_session->window == window) {
    ConfigureAppearance(*g_session, options);
    return g_session->acrylic.State();
  }
  g_session.reset();

  auto session = std::make_unique<Session>();
  session->window = window;
  InitializeWinRt(*session);
  LoadRuntime();
  EnsureDispatcherQueue(*session);
  if (!backdrops::DesktopAcrylicController::IsSupported()) return std::nullopt;

  const BOOL enabled = TRUE;
  // The DWM transient backdrop supplies the fixed system frost. The controller
  // layered onto the same host backdrop supplies the adjustable neutral tint.
  const int backdrop = kBackdropTransientWindow;
  const int corner = kCornerSmall;
  const COLORREF border = kColorNone;
  winrt::check_hresult(DwmSetWindowAttribute(
      window, kUseHostBackdropBrush, &enabled, sizeof(enabled)));
  winrt::check_hresult(DwmSetWindowAttribute(
      window, kSystemBackdropType, &backdrop, sizeof(backdrop)));
  winrt::check_hresult(DwmSetWindowAttribute(
      window, kWindowCornerPreference, &corner, sizeof(corner)));
  winrt::check_hresult(DwmSetWindowAttribute(
      window, kBorderColor, &border, sizeof(border)));
  const MARGINS margins{-1, -1, -1, -1};
  winrt::check_hresult(DwmExtendFrameIntoClientArea(window, &margins));

  session->compositor = composition::Compositor();
  const auto interop = session->compositor.as<abi::ICompositorDesktopInterop>();
  winrt::check_hresult(interop->CreateDesktopWindowTarget(
      window, false,
      reinterpret_cast<abi::IDesktopWindowTarget**>(winrt::put_abi(session->target))));
  session->target.Root(session->compositor.CreateContainerVisual());

  session->configuration = backdrops::SystemBackdropConfiguration();
  session->acrylic = backdrops::DesktopAcrylicController();
  session->acrylic.Kind(backdrops::DesktopAcrylicKind::Base);
  ConfigureAppearance(*session, options);
  session->acrylic.SetSystemBackdropConfiguration(session->configuration);
  if (!session->acrylic.SetTarget(
          winrt::Microsoft::UI::WindowId{reinterpret_cast<std::uint64_t>(window)},
          session->target)) {
    return std::nullopt;
  }
  // SetTarget can refresh non-client attributes. Apply the final backdrop first,
  // then suppress its rim so the resizable HWND remains visually borderless.
  winrt::check_hresult(DwmSetWindowAttribute(
      window, kSystemBackdropType, &backdrop, sizeof(backdrop)));
  winrt::check_hresult(DwmSetWindowAttribute(
      window, kWindowCornerPreference, &corner, sizeof(corner)));
  winrt::check_hresult(DwmSetWindowAttribute(
      window, kBorderColor, &border, sizeof(border)));

  session->stateCallback = std::make_shared<AcrylicStateCallback>();
  session->stateCallback->function = Napi::ThreadSafeFunction::New(
      env, stateCallback, "windows-glass-state", 8, 1);
  session->stateCallback->function.Unref(env);
  const auto callbackState = session->stateCallback;
  session->stateChangedToken = session->acrylic.StateChanged(
      [callbackState](const backdrops::ISystemBackdropControllerWithTargets& sender,
                      const winrt::Windows::Foundation::IInspectable&) {
        if (!callbackState->active.load()) return;
        auto* state = new std::string(StateName(sender.State()));
        const auto status = callbackState->function.NonBlockingCall(
            state, [](Napi::Env callbackEnv, Napi::Function callback,
                      std::string* value) {
              callback.Call({Napi::String::New(callbackEnv, *value)});
              delete value;
            });
        if (status != napi_ok) delete state;
      });
  session->hasStateChangedToken = true;

  const auto state = session->acrylic.State();
  g_session = std::move(session);
  return state;
}

Napi::Value IsSupported(const Napi::CallbackInfo& info) {
  const auto env = info.Env();
  try {
    Session probe;
    InitializeWinRt(probe);
    LoadRuntime();
    return Napi::Boolean::New(env, backdrops::DesktopAcrylicController::IsSupported());
  } catch (const winrt::hresult_error& error) {
    Napi::Error::New(env, winrt::to_string(error.message())).ThrowAsJavaScriptException();
  } catch (const std::exception& error) {
    Napi::Error::New(env, error.what()).ThrowAsJavaScriptException();
  }
  return env.Undefined();
}

Napi::Value AttachWindow(const Napi::CallbackInfo& info) {
  const auto env = info.Env();
  try {
    if (info.Length() < 3 || !info[2].IsFunction()) {
      throw std::invalid_argument("Expected handle, appearance options, and state callback");
    }
    const auto state = Attach(env, ReadWindowHandle(info[0]), ReadOptions(info[1]),
                              info[2].As<Napi::Function>());
    return state ? StateValue(env, *state) : Napi::Boolean::New(env, false);
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
    if (!g_session || info.Length() < 1) {
      return Napi::Boolean::New(env, false);
    }
    ConfigureAppearance(*g_session, ReadOptions(info[0]));
    return StateValue(env, g_session->acrylic.State());
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
