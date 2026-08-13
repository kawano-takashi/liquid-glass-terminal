#include <napi.h>

#include "effects.h"

#include <windows.h>

#include <DispatcherQueue.h>
#include <Windows.UI.Composition.Interop.h>
#include <d3d11.h>
#include <dwmapi.h>
#include <dxgi1_2.h>
#include <roapi.h>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>

#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.Effects.h>
#include <winrt/Windows.System.h>
#include <winrt/Windows.UI.Composition.Desktop.h>
#include <winrt/Windows.UI.Composition.h>
#include <winrt/Windows.UI.ViewManagement.h>
#include <winrt/Windows.UI.h>
#include <winrt/base.h>

namespace {

namespace composition = winrt::Windows::UI::Composition;
namespace compositionDesktop = winrt::Windows::UI::Composition::Desktop;
namespace compositionInterop = ABI::Windows::UI::Composition::Desktop;
namespace effectsAbi = ABI::Windows::Graphics::Effects;
namespace viewManagement = winrt::Windows::UI::ViewManagement;

constexpr auto kUseHostBackdropBrush = static_cast<DWMWINDOWATTRIBUTE>(17);
constexpr auto kWindowCornerPreference = static_cast<DWMWINDOWATTRIBUTE>(33);
constexpr auto kBorderColor = static_cast<DWMWINDOWATTRIBUTE>(34);
constexpr auto kSystemBackdropType = static_cast<DWMWINDOWATTRIBUTE>(38);
constexpr int kBackdropNone = 1;
constexpr int kCornerDefault = 0;
constexpr int kCornerSmall = 3;
constexpr COLORREF kColorDefault = 0xFFFFFFFF;
constexpr COLORREF kColorNone = 0xFFFFFFFE;
constexpr float kFrostBlurAmountMax = 24.0f;
constexpr float kFrostBlurAmountProbe = 6.0f;

enum class NativeState { Active, PolicyDisabled, CapabilityLost };

struct AppearanceOptions {
  bool policyEnabled;
  std::uint8_t glassOpacity;
  float frostBlurAmount;
};

struct StateCallback {
  Napi::ThreadSafeFunction function;
  std::atomic_bool active{true};
};

struct Session {
  HWND window = nullptr;
  HMODULE coreMessaging = nullptr;
  bool uninitializeWinRt = false;
  winrt::Windows::System::DispatcherQueueController dispatcher{nullptr};
  bool effectsSupported = false;
  bool effectsFast = false;
  viewManagement::UISettings uiSettings{nullptr};
  composition::Compositor compositor{nullptr};
  compositionDesktop::DesktopWindowTarget target{nullptr};
  composition::ContainerVisual root{nullptr};
  composition::SpriteVisual backdropVisual{nullptr};
  composition::SpriteVisual tintVisual{nullptr};
  composition::CompositionEffectBrush effectBrush{nullptr};
  composition::CompositionColorBrush tintBrush{nullptr};
  AppearanceOptions appearance{true, 25, 6};
  winrt::event_token advancedEffectsChangedToken{};
  bool hasAdvancedEffectsChangedToken = false;
  std::shared_ptr<StateCallback> stateCallback;

  ~Session() { Reset(); }

  void Reset() noexcept {
    if (uiSettings && hasAdvancedEffectsChangedToken) {
      try {
        uiSettings.AdvancedEffectsEnabledChanged(advancedEffectsChangedToken);
      } catch (...) {
      }
      hasAdvancedEffectsChangedToken = false;
    }
    if (stateCallback) {
      stateCallback->active.store(false);
      stateCallback->function.Release();
      stateCallback.reset();
    }
    if (target) {
      try {
        target.Root(nullptr);
      } catch (...) {
      }
    }
    tintBrush = nullptr;
    effectBrush = nullptr;
    tintVisual = nullptr;
    backdropVisual = nullptr;
    root = nullptr;
    target = nullptr;
    compositor = nullptr;
    uiSettings = nullptr;
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

const char* StateName(NativeState state) {
  switch (state) {
    case NativeState::Active:
      return "active";
    case NativeState::PolicyDisabled:
      return "policy-disabled";
    case NativeState::CapabilityLost:
      return "capability-lost";
  }
  return "capability-lost";
}

Napi::Value StateValue(Napi::Env env, NativeState state) {
  return Napi::String::New(env, StateName(state));
}

void InitializeWinRt(Session& session) {
  const HRESULT result = RoInitialize(RO_INIT_SINGLETHREADED);
  if (SUCCEEDED(result)) session.uninitializeWinRt = true;
  if (FAILED(result) && result != RPC_E_CHANGED_MODE) winrt::check_hresult(result);
}

void EnsureDispatcherQueue(Session& session) {
  if (winrt::Windows::System::DispatcherQueue::GetForCurrentThread()) return;

  session.coreMessaging =
      LoadLibraryExW(L"CoreMessaging.dll", nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
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
      options, reinterpret_cast<ABI::Windows::System::IDispatcherQueueController**>(
                   winrt::put_abi(session.dispatcher))));
}

struct CapabilitySnapshot {
  bool supported = false;
  bool fast = false;
};

CapabilitySnapshot QueryCapabilities() {
  CapabilitySnapshot snapshot;
  BOOL compositionEnabled = FALSE;
  snapshot.supported =
      SUCCEEDED(DwmIsCompositionEnabled(&compositionEnabled)) && compositionEnabled != FALSE;
  if (!snapshot.supported) return snapshot;

  Microsoft::WRL::ComPtr<ID3D11Device> device;
  Microsoft::WRL::ComPtr<ID3D11DeviceContext> context;
  D3D_FEATURE_LEVEL featureLevel{};
  const HRESULT created = D3D11CreateDevice(
      nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0,
      D3D11_SDK_VERSION, &device, &featureLevel, &context);
  if (FAILED(created) || featureLevel < D3D_FEATURE_LEVEL_11_0) return snapshot;

  Microsoft::WRL::ComPtr<IDXGIDevice> dxgiDevice;
  Microsoft::WRL::ComPtr<IDXGIAdapter> baseAdapter;
  Microsoft::WRL::ComPtr<IDXGIAdapter1> adapter;
  DXGI_ADAPTER_DESC1 description{};
  snapshot.fast = SUCCEEDED(device.As(&dxgiDevice)) &&
                  SUCCEEDED(dxgiDevice->GetAdapter(&baseAdapter)) &&
                  SUCCEEDED(baseAdapter.As(&adapter)) &&
                  SUCCEEDED(adapter->GetDesc1(&description)) &&
                  (description.Flags & DXGI_ADAPTER_FLAG_SOFTWARE) == 0;
  return snapshot;
}

composition::Compositor CreateCompositor() {
  try {
    return composition::Compositor();
  } catch (const winrt::hresult_error& error) {
    throw std::runtime_error("Windows.UI.Composition initialization failed: " +
                             winrt::to_string(error.message()));
  }
}

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

AppearanceOptions ReadOptions(const Napi::Value& value) {
  if (!value.IsObject()) throw std::invalid_argument("Expected backdrop options");
  const auto options = value.As<Napi::Object>();
  const auto policyEnabled = options.Get("policyEnabled");
  const auto glassOpacity = options.Get("glassOpacity");
  const auto frostBlurAmount = options.Get("frostBlurAmount");
  if (!policyEnabled.IsBoolean() || !glassOpacity.IsNumber() || !frostBlurAmount.IsNumber()) {
    throw std::invalid_argument("Expected complete backdrop options");
  }
  const double opacity = glassOpacity.As<Napi::Number>().DoubleValue();
  const double blurAmount = frostBlurAmount.As<Napi::Number>().DoubleValue();
  if (!std::isfinite(opacity) || std::floor(opacity) != opacity || opacity < 0.0 ||
      opacity > 100.0 || static_cast<int>(opacity) % 5 != 0) {
    throw std::invalid_argument("Glass opacity must be an integer from 0 to 100 in steps of 5");
  }
  if (!std::isfinite(blurAmount) || blurAmount < 0.0 || blurAmount > kFrostBlurAmountMax) {
    throw std::invalid_argument("Frost blur amount must be between 0 and 24 DIPs");
  }
  return AppearanceOptions{policyEnabled.As<Napi::Boolean>().Value(),
                           static_cast<std::uint8_t>(opacity),
                           static_cast<float>(blurAmount)};
}

composition::CompositionEffectFactory CreateFrostFactory(
    const composition::Compositor& compositor, float initialBlurAmount) {
  auto blur = Microsoft::WRL::Make<lgt::effects::GaussianBlurEffect>();
  auto saturation = Microsoft::WRL::Make<lgt::effects::SaturationEffect>();
  if (!blur || !saturation) throw std::bad_alloc();

  Microsoft::WRL::Wrappers::HStringReference blurName{L"Blur"};
  Microsoft::WRL::Wrappers::HStringReference saturationName{L"Saturation"};
  winrt::check_hresult(blur->put_Name(blurName.Get()));
  winrt::check_hresult(saturation->put_Name(saturationName.Get()));
  blur->BlurAmount(initialBlurAmount);

  const composition::CompositionEffectSourceParameter sourceParameter{L"backdrop"};
  winrt::check_hresult(blur->SetSource(
      reinterpret_cast<effectsAbi::IGraphicsEffectSource*>(winrt::get_abi(sourceParameter))));
  Microsoft::WRL::ComPtr<effectsAbi::IGraphicsEffectSource> blurSource;
  winrt::check_hresult(blur.As(&blurSource));
  winrt::check_hresult(saturation->SetSource(blurSource.Get()));

  Microsoft::WRL::ComPtr<effectsAbi::IGraphicsEffect> graphAbi;
  winrt::check_hresult(saturation.As(&graphAbi));
  winrt::Windows::Graphics::Effects::IGraphicsEffect graph{nullptr};
  winrt::copy_from_abi(graph, graphAbi.Get());

  auto animatableProperties = winrt::single_threaded_vector<winrt::hstring>();
  animatableProperties.Append(L"Blur.BlurAmount");
  return compositor.CreateEffectFactory(graph, animatableProperties);
}

bool EffectsSupported(const Session& session) {
  return session.effectsSupported;
}

bool EffectsFast(const Session& session) {
  return session.effectsFast;
}

void RefreshCapabilities(Session& session) {
  const auto snapshot = QueryCapabilities();
  session.effectsSupported = snapshot.supported;
  session.effectsFast = snapshot.fast;
}

bool EnergySaverEnabled() {
  SYSTEM_POWER_STATUS status{};
  return GetSystemPowerStatus(&status) && status.SystemStatusFlag != 0;
}

bool RemoteSessionActive() { return GetSystemMetrics(SM_REMOTESESSION) != 0; }

NativeState ResolveState(const Session& session) {
  if (!EffectsSupported(session) || !EffectsFast(session)) {
    return NativeState::CapabilityLost;
  }
  const bool advancedEffects =
      session.uiSettings ? session.uiSettings.AdvancedEffectsEnabled() : false;
  if (!session.appearance.policyEnabled || !advancedEffects || EnergySaverEnabled() ||
      RemoteSessionActive()) {
    return NativeState::PolicyDisabled;
  }
  return NativeState::Active;
}

NativeState ConfigureAppearance(Session& session) {
  const NativeState state = ResolveState(session);
  const bool active = state == NativeState::Active;
  const bool renderBackdrop = active && session.appearance.glassOpacity < 100;
  session.backdropVisual.IsVisible(renderBackdrop);
  session.tintVisual.Opacity(
      active ? static_cast<float>(session.appearance.glassOpacity) / 100.0f : 1.0f);
  session.tintBrush.Color(winrt::Windows::UI::Color{255, 24, 24, 24});
  session.effectBrush.Properties().InsertScalar(
      L"Blur.BlurAmount", session.appearance.frostBlurAmount);
  return state;
}

void QueueState(const std::shared_ptr<StateCallback>& callback, NativeState state) {
  if (!callback || !callback->active.load()) return;
  auto* value = new std::string(StateName(state));
  const auto status = callback->function.NonBlockingCall(
      value, [](Napi::Env env, Napi::Function function, std::string* nextState) {
        function.Call({Napi::String::New(env, *nextState)});
        delete nextState;
      });
  if (status != napi_ok) delete value;
}

void ConfigureDwm(HWND window) {
  const BOOL enabled = TRUE;
  const int backdrop = kBackdropNone;
  const int corner = kCornerSmall;
  const COLORREF border = kColorNone;
  winrt::check_hresult(DwmSetWindowAttribute(
      window, kUseHostBackdropBrush, &enabled, sizeof(enabled)));
  winrt::check_hresult(DwmSetWindowAttribute(
      window, kSystemBackdropType, &backdrop, sizeof(backdrop)));
  winrt::check_hresult(DwmSetWindowAttribute(
      window, kWindowCornerPreference, &corner, sizeof(corner)));
  winrt::check_hresult(
      DwmSetWindowAttribute(window, kBorderColor, &border, sizeof(border)));
  const MARGINS margins{-1, -1, -1, -1};
  winrt::check_hresult(DwmExtendFrameIntoClientArea(window, &margins));
}

std::optional<NativeState> Attach(
    Napi::Env env, HWND window, const AppearanceOptions& options,
    const Napi::Function& stateCallback) {
  if (g_session && g_session->window == window) {
    g_session->appearance = options;
    RefreshCapabilities(*g_session);
    return ConfigureAppearance(*g_session);
  }
  g_session.reset();

  auto session = std::make_unique<Session>();
  session->window = window;
  session->appearance = options;
  InitializeWinRt(*session);
  RefreshCapabilities(*session);
  EnsureDispatcherQueue(*session);
  if (!EffectsSupported(*session) || !EffectsFast(*session)) return std::nullopt;

  ConfigureDwm(window);
  session->compositor = CreateCompositor();
  const auto factory =
      CreateFrostFactory(session->compositor, session->appearance.frostBlurAmount);
  session->effectBrush = factory.CreateBrush();
  session->effectBrush.SetSourceParameter(
      L"backdrop", session->compositor.CreateHostBackdropBrush());
  session->tintBrush = session->compositor.CreateColorBrush();

  session->backdropVisual = session->compositor.CreateSpriteVisual();
  session->backdropVisual.RelativeSizeAdjustment({1.0f, 1.0f});
  session->backdropVisual.Brush(session->effectBrush);
  session->tintVisual = session->compositor.CreateSpriteVisual();
  session->tintVisual.RelativeSizeAdjustment({1.0f, 1.0f});
  session->tintVisual.Brush(session->tintBrush);
  session->root = session->compositor.CreateContainerVisual();
  session->root.RelativeSizeAdjustment({1.0f, 1.0f});
  session->root.Children().InsertAtBottom(session->backdropVisual);
  session->root.Children().InsertAtTop(session->tintVisual);

  const auto interop = session->compositor.as<compositionInterop::ICompositorDesktopInterop>();
  winrt::check_hresult(interop->CreateDesktopWindowTarget(
      window, false, reinterpret_cast<compositionInterop::IDesktopWindowTarget**>(
                         winrt::put_abi(session->target))));
  session->target.Root(session->root);
  session->uiSettings = viewManagement::UISettings();

  session->stateCallback = std::make_shared<StateCallback>();
  session->stateCallback->function =
      Napi::ThreadSafeFunction::New(env, stateCallback, "frosted-backdrop-state", 8, 1);
  session->stateCallback->function.Unref(env);

  const auto callback = session->stateCallback;
  session->advancedEffectsChangedToken = session->uiSettings.AdvancedEffectsEnabledChanged(
      [callback](const viewManagement::UISettings& sender,
                 const winrt::Windows::Foundation::IInspectable&) {
        try {
          QueueState(callback, sender.AdvancedEffectsEnabled() ? NativeState::Active
                                                               : NativeState::PolicyDisabled);
        } catch (...) {
          QueueState(callback, NativeState::CapabilityLost);
        }
      });
  session->hasAdvancedEffectsChangedToken = true;

  const NativeState state = ConfigureAppearance(*session);
  g_session = std::move(session);
  return state;
}

Napi::Value Probe(const Napi::CallbackInfo& info) {
  const auto env = info.Env();
  try {
    Session probe;
    InitializeWinRt(probe);
    RefreshCapabilities(probe);
    EnsureDispatcherQueue(probe);
    const bool supported = EffectsSupported(probe);
    const bool fast = supported && EffectsFast(probe);
    if (supported) {
      probe.compositor = CreateCompositor();
      static_cast<void>(CreateFrostFactory(probe.compositor, kFrostBlurAmountProbe));
    }
    const auto result = Napi::Object::New(env);
    result.Set("supported", Napi::Boolean::New(env, supported));
    result.Set("fast", Napi::Boolean::New(env, fast));
    return result;
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
      throw std::invalid_argument("Expected handle, backdrop options, and state callback");
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
    if (!g_session || info.Length() < 1) return Napi::Boolean::New(env, false);
    g_session->appearance = ReadOptions(info[0]);
    RefreshCapabilities(*g_session);
    ConfigureDwm(g_session->window);
    return StateValue(env, ConfigureAppearance(*g_session));
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
}

Napi::Object Initialize(Napi::Env env, Napi::Object exports) {
  napi_add_env_cleanup_hook(env, Cleanup, nullptr);
  exports.Set("probe", Napi::Function::New(env, Probe));
  exports.Set("attach", Napi::Function::New(env, AttachWindow));
  exports.Set("update", Napi::Function::New(env, Update));
  exports.Set("detach", Napi::Function::New(env, Detach));
  return exports;
}

}  // namespace

NODE_API_MODULE(windows_glass, Initialize)
