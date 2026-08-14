#include "platform/SystemPolicy.h"

#include <windows.h>
#include <wtsapi32.h>

#include <winrt/base.h>

namespace {

bool AutomationClientsAreListening() noexcept {
  const HMODULE module = LoadLibraryExW(L"UIAutomationCore.dll", nullptr,
                                        LOAD_LIBRARY_SEARCH_SYSTEM32);
  if (!module) return false;
  using Query = BOOL(WINAPI*)();
  const auto query = reinterpret_cast<Query>(GetProcAddress(module, "UiaClientsAreListening"));
  const bool result = query && query() != FALSE;
  FreeLibrary(module);
  return result;
}

}  // namespace

namespace lgt::platform {

bool PolicySnapshot::AllowsGlass() const noexcept {
  return transparency && advancedEffects && !highContrast && !remoteSession && !energySaver;
}

bool PolicySnapshot::ReducedMotion() const noexcept { return !animations || screenReader; }

std::wstring PolicySnapshot::Reason() const {
  if (highContrast) return L"high-contrast";
  if (!transparency) return L"transparency-disabled";
  if (!advancedEffects) return L"advanced-effects-disabled";
  if (remoteSession) return L"remote-session";
  if (energySaver) return L"energy-saver";
  return {};
}

PolicySnapshot QuerySystemPolicy() noexcept {
  PolicySnapshot result;
  HIGHCONTRASTW contrast{sizeof(contrast)};
  if (SystemParametersInfoW(SPI_GETHIGHCONTRAST, sizeof(contrast), &contrast, 0)) {
    result.highContrast = (contrast.dwFlags & HCF_HIGHCONTRASTON) != 0;
  }
  BOOL animations = TRUE;
  if (SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION, 0, &animations, 0)) {
    result.animations = animations != FALSE;
  }
  DWORD transparency = 1;
  DWORD bytes = sizeof(transparency);
  RegGetValueW(HKEY_CURRENT_USER,
               L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
               L"EnableTransparency", RRF_RT_REG_DWORD, nullptr, &transparency, &bytes);
  BOOL disableOverlappedContent = FALSE;
  SystemParametersInfoW(SPI_GETDISABLEOVERLAPPEDCONTENT, 0, &disableOverlappedContent, 0);
  result.transparency = transparency != 0 && disableOverlappedContent == FALSE;
  try {
    result.advancedEffects =
        winrt::Windows::UI::ViewManagement::UISettings().AdvancedEffectsEnabled();
  } catch (...) {
    result.advancedEffects = false;
  }
  result.remoteSession = GetSystemMetrics(SM_REMOTESESSION) != 0;
  SYSTEM_POWER_STATUS power{};
  result.energySaver = GetSystemPowerStatus(&power) && power.SystemStatusFlag != 0;
  BOOL screenReader = FALSE;
  SystemParametersInfoW(SPI_GETSCREENREADER, 0, &screenReader, 0);
  result.screenReader = screenReader != FALSE || AutomationClientsAreListening();
  return result;
}

SystemPolicyMonitor::~SystemPolicyMonitor() { Reset(); }

void SystemPolicyMonitor::Start(HWND window) noexcept {
  Reset();
  window_ = window;
  sessionNotificationRegistered_ =
      WTSRegisterSessionNotification(window_, NOTIFY_FOR_THIS_SESSION) != FALSE;
  try {
    settings_ = winrt::Windows::UI::ViewManagement::UISettings();
    advancedEffectsToken_ = settings_.AdvancedEffectsEnabledChanged(
        [window](const auto&, const auto&) {
          if (window && IsWindow(window)) PostMessageW(window, kSystemPolicyChangedMessage, 0, 0);
        });
  } catch (...) {
    settings_ = nullptr;
    advancedEffectsToken_ = {};
  }
}

void SystemPolicyMonitor::Reset() noexcept {
  try {
    if (settings_ && advancedEffectsToken_.value != 0) {
      settings_.AdvancedEffectsEnabledChanged(advancedEffectsToken_);
    }
  } catch (...) {
  }
  advancedEffectsToken_ = {};
  settings_ = nullptr;
  if (sessionNotificationRegistered_ && window_) {
    WTSUnRegisterSessionNotification(window_);
  }
  sessionNotificationRegistered_ = false;
  window_ = nullptr;
}

}  // namespace lgt::platform
