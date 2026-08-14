#pragma once

#include <string>

namespace lgt::platform {

struct PolicySnapshot {
  bool transparency = true;
  bool highContrast = false;
  bool remoteSession = false;
  bool energySaver = false;
  bool animations = true;
  bool screenReader = false;

  [[nodiscard]] bool AllowsGlass() const noexcept;
  [[nodiscard]] bool ReducedMotion() const noexcept;
  [[nodiscard]] std::wstring Reason() const;
};

[[nodiscard]] PolicySnapshot QuerySystemPolicy() noexcept;

}  // namespace lgt::platform
