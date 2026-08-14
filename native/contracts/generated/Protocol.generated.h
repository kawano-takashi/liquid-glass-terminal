// Generated from contracts/protocol.idl.json. Do not edit.
#pragma once

#include <array>
#include <cstdint>
#include <string_view>

namespace lgt::protocol {
inline constexpr std::uint32_t kVersion = 1;
inline constexpr std::wstring_view kAppOrigin = L"https://app.liquid-glass-terminal.invalid/";
inline constexpr std::size_t kMaxGlassRegions = 32;
inline constexpr std::size_t kTerminalChunkBytes = 65536;
inline constexpr std::size_t kTerminalPauseBytes = 262144;
inline constexpr std::size_t kTerminalResumeBytes = 65536;
inline constexpr std::size_t kMaxClipboardBytes = 1048576;

inline constexpr std::array<std::wstring_view, 10> kWebToNativeTypes{L"bridge.ready", L"terminal.resize", L"terminal.input.commit", L"terminal.output.ack", L"glass.layout.set", L"settings.preview", L"settings.apply", L"settings.cancel", L"clipboard.read", L"clipboard.write"};
inline constexpr std::array<std::wstring_view, 12> kNativeToWebTypes{L"bridge.accepted", L"capabilities.changed", L"terminal.buffer.attach", L"terminal.input.ack", L"terminal.output.ready", L"terminal.recovered", L"settings.snapshot", L"settings.result", L"appearance.changed", L"clipboard.result", L"drop.path", L"app.notice"};
inline constexpr std::array<std::wstring_view, 22> kAllTypes{L"bridge.ready", L"terminal.resize", L"terminal.input.commit", L"terminal.output.ack", L"glass.layout.set", L"settings.preview", L"settings.apply", L"settings.cancel", L"clipboard.read", L"clipboard.write", L"bridge.accepted", L"capabilities.changed", L"terminal.buffer.attach", L"terminal.input.ack", L"terminal.output.ready", L"terminal.recovered", L"settings.snapshot", L"settings.result", L"appearance.changed", L"clipboard.result", L"drop.path", L"app.notice"};

constexpr bool Contains(const auto& values, std::wstring_view value) noexcept {
  for (const auto candidate : values) if (candidate == value) return true;
  return false;
}
constexpr bool IsWebToNative(std::wstring_view value) noexcept { return Contains(kWebToNativeTypes, value); }
constexpr bool IsNativeToWeb(std::wstring_view value) noexcept { return Contains(kNativeToWebTypes, value); }
}  // namespace lgt::protocol
