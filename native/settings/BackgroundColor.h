#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

namespace lgt::settings {

[[nodiscard]] inline constexpr bool IsHexDigit(wchar_t value) noexcept {
  return (value >= L'0' && value <= L'9') || (value >= L'A' && value <= L'F') ||
         (value >= L'a' && value <= L'f');
}

[[nodiscard]] inline constexpr wchar_t UpperHexDigit(wchar_t value) noexcept {
  return value >= L'a' && value <= L'f' ? static_cast<wchar_t>(value - L'a' + L'A') : value;
}

[[nodiscard]] inline bool IsValidBackgroundColor(std::wstring_view value) noexcept {
  if (value.empty()) return true;
  if (value.size() != 7 || value.front() != L'#') return false;
  for (std::size_t index = 1; index < value.size(); ++index) {
    if (!IsHexDigit(value[index])) return false;
  }
  return true;
}

[[nodiscard]] inline std::wstring NormalizeBackgroundColor(std::wstring_view value) {
  if (!IsValidBackgroundColor(value) || value.empty()) return {};
  std::wstring normalized(value);
  for (std::size_t index = 1; index < normalized.size(); ++index) {
    normalized[index] = UpperHexDigit(normalized[index]);
  }
  return normalized;
}

[[nodiscard]] inline std::optional<std::uint32_t> BackgroundColorRgb(
    std::wstring_view value) noexcept {
  if (value.empty() || !IsValidBackgroundColor(value)) return std::nullopt;
  std::uint32_t result = 0;
  for (std::size_t index = 1; index < value.size(); ++index) {
    const wchar_t character = value[index];
    const std::uint32_t digit = character >= L'0' && character <= L'9'
                                    ? static_cast<std::uint32_t>(character - L'0')
                                : character >= L'A' && character <= L'F'
                                    ? static_cast<std::uint32_t>(character - L'A' + 10)
                                    : static_cast<std::uint32_t>(character - L'a' + 10);
    result = (result << 4) | digit;
  }
  return result;
}

}  // namespace lgt::settings
