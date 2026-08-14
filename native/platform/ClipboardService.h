#pragma once

#include <windows.h>

#include <optional>
#include <string>
#include <string_view>

namespace lgt::platform {

class ClipboardService final {
 public:
  explicit ClipboardService(HWND owner) : owner_(owner) {}

  [[nodiscard]] std::optional<std::wstring> ReadText() const;
  bool WriteText(std::wstring_view text) const;
  [[nodiscard]] static bool WithinLimit(std::wstring_view text) noexcept;

 private:
  HWND owner_ = nullptr;
};

}  // namespace lgt::platform
