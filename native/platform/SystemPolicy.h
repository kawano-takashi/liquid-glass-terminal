#pragma once

#include <windows.h>

#include <string>

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.UI.ViewManagement.h>

namespace lgt::platform {

inline constexpr UINT kSystemPolicyChangedMessage = WM_APP + 0x36;

struct PolicySnapshot {
  bool transparency = true;
  bool advancedEffects = true;
  bool highContrast = false;
  bool remoteSession = false;
  bool energySaver = false;
  bool animations = true;
  bool screenReader = false;

  [[nodiscard]] bool AllowsGlass() const noexcept;
  [[nodiscard]] bool ReducedMotion() const noexcept;
  [[nodiscard]] std::wstring Reason() const;
};

class SystemPolicyMonitor final {
 public:
  SystemPolicyMonitor() = default;
  ~SystemPolicyMonitor();

  SystemPolicyMonitor(const SystemPolicyMonitor&) = delete;
  SystemPolicyMonitor& operator=(const SystemPolicyMonitor&) = delete;

  void Start(HWND window) noexcept;
  void Reset() noexcept;

 private:
  HWND window_ = nullptr;
  bool sessionNotificationRegistered_ = false;
  winrt::Windows::UI::ViewManagement::UISettings settings_{nullptr};
  winrt::event_token advancedEffectsToken_{};
  winrt::event_token colorValuesToken_{};
};

[[nodiscard]] PolicySnapshot QuerySystemPolicy() noexcept;

}  // namespace lgt::platform
