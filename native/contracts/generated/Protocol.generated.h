// Generated from contracts/protocol.idl.json. Do not edit.
#pragma once

#include <array>
#include <compare>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

namespace lgt::protocol {
inline constexpr std::uint32_t kVersion = 7;
inline constexpr std::uint32_t kSettingsSchemaVersion = 7;
inline constexpr std::uint32_t kWindowStateSchemaVersion = 2;
inline constexpr std::wstring_view kAppOrigin = L"https://app.liquid-glass-terminal.invalid/";
inline constexpr std::uint32_t kTitlebarHeightDip = 56;
inline constexpr std::uint32_t kCaptionButtonWidthDip = 46;
inline constexpr std::size_t kTerminalChunkBytes = 65536;
inline constexpr std::size_t kTerminalPauseBytes = 262144;
inline constexpr std::size_t kTerminalResumeBytes = 65536;
inline constexpr std::size_t kMaxClipboardBytes = 1048576;
enum class GlassPreset { Clear, Regular, Dense };
enum class SettingsOperation { Preview, Apply, Cancel };
enum class Foreground { Auto, Light, Dark };
enum class Locale { System, English, Japanese };

constexpr std::wstring_view ToString(GlassPreset value) noexcept {
  switch (value) {
    case GlassPreset::Clear: return L"clear";
    case GlassPreset::Regular: return L"regular";
    case GlassPreset::Dense: return L"dense";
  }
  return {};
}

constexpr std::wstring_view ToString(SettingsOperation value) noexcept {
  switch (value) {
    case SettingsOperation::Preview: return L"preview";
    case SettingsOperation::Apply: return L"apply";
    case SettingsOperation::Cancel: return L"cancel";
  }
  return {};
}

constexpr std::wstring_view ToString(Foreground value) noexcept {
  switch (value) {
    case Foreground::Auto: return L"auto";
    case Foreground::Light: return L"light";
    case Foreground::Dark: return L"dark";
  }
  return {};
}

constexpr std::wstring_view ToString(Locale value) noexcept {
  switch (value) {
    case Locale::System: return L"system";
    case Locale::English: return L"en";
    case Locale::Japanese: return L"ja";
  }
  return {};
}

constexpr std::optional<GlassPreset> ParseGlassPreset(std::wstring_view value) noexcept {
  if (value == L"clear") return GlassPreset::Clear;
  if (value == L"regular") return GlassPreset::Regular;
  if (value == L"dense") return GlassPreset::Dense;
  return std::nullopt;
}

constexpr std::optional<SettingsOperation> ParseSettingsOperation(std::wstring_view value) noexcept {
  if (value == L"preview") return SettingsOperation::Preview;
  if (value == L"apply") return SettingsOperation::Apply;
  if (value == L"cancel") return SettingsOperation::Cancel;
  return std::nullopt;
}

constexpr std::optional<Foreground> ParseForeground(std::wstring_view value) noexcept {
  if (value == L"auto") return Foreground::Auto;
  if (value == L"light") return Foreground::Light;
  if (value == L"dark") return Foreground::Dark;
  return std::nullopt;
}

constexpr std::optional<Locale> ParseLocale(std::wstring_view value) noexcept {
  if (value == L"system") return Locale::System;
  if (value == L"en") return Locale::English;
  if (value == L"ja") return Locale::Japanese;
  return std::nullopt;
}

struct NumericConstraint { std::uint32_t minimum; std::uint32_t maximum; std::uint32_t step; };
inline constexpr NumericConstraint kBlurDipsConstraint{0, 74, 1};
inline constexpr NumericConstraint kUiScaleConstraint{80, 200, 10};

inline constexpr std::array<std::wstring_view, 6> kSettingsKeys{L"locale", L"backgroundColor", L"glass", L"foreground", L"animations", L"uiScale"};
inline constexpr std::array<std::wstring_view, 2> kGlassSettingKeys{L"enabled", L"blurDips"};
inline constexpr std::array<std::wstring_view, 1> kGlassValueKeys{L"blurDips"};
struct GlassValues {
  std::uint32_t blurDips;
  auto operator<=>(const GlassValues&) const = default;
};

struct GlassSettings {
  bool enabled = true;
  std::uint32_t blurDips = 30;
  auto operator<=>(const GlassSettings&) const = default;
};

inline constexpr GlassValues kClearGlassPreset{0};
inline constexpr GlassValues kRegularGlassPreset{30};
inline constexpr GlassValues kDenseGlassPreset{55};

struct GlassPresetDefinition { GlassPreset name; GlassValues values; };
inline constexpr std::array<GlassPresetDefinition, 3> kGlassPresets{{
    {GlassPreset::Clear, kClearGlassPreset},
    {GlassPreset::Regular, kRegularGlassPreset},
    {GlassPreset::Dense, kDenseGlassPreset}
}};

struct Settings {
  Locale locale = Locale::System;
  std::wstring backgroundColor = L"";
  GlassSettings glass{};
  Foreground foreground = Foreground::Auto;
  bool animations = true;
  std::uint32_t uiScale = 100;
  auto operator<=>(const Settings&) const = default;
};

inline constexpr Settings kDefaultSettings{};

struct WindowRuntimeState {
  bool maximized = false;
  bool fullscreen = false;
  bool active = true;
  auto operator<=>(const WindowRuntimeState&) const = default;
};

struct PersistedWindowState {
  int x = 0;
  int y = 0;
  int width = 1120;
  int height = 840;
  bool maximized = false;
  auto operator<=>(const PersistedWindowState&) const = default;
};
inline constexpr PersistedWindowState kDefaultPersistedWindowState{};
inline constexpr int kMinimumWindowWidth = 480;
inline constexpr int kMinimumWindowHeight = 320;
inline constexpr int kMaximumWindowExtent = 16384;

constexpr bool IsValid(std::uint32_t value, NumericConstraint constraint) noexcept { return value >= constraint.minimum && value <= constraint.maximum && (value - constraint.minimum) % constraint.step == 0; }
constexpr bool IsValid(const GlassValues& value) noexcept { return IsValid(value.blurDips, kBlurDipsConstraint); }
constexpr bool IsValid(const GlassSettings& value) noexcept { return IsValid(GlassValues{value.blurDips}); }
constexpr bool IsValid(Locale value) noexcept { return !ToString(value).empty(); }
constexpr bool IsValid(Foreground value) noexcept { return !ToString(value).empty(); }
constexpr bool IsValidStringField(std::wstring_view name, std::wstring_view value) noexcept {
  if (name != L"backgroundColor") return false;
  if (value.empty()) return true;
  if (value.size() != 7 || value.front() != L'#') return false;
  for (std::size_t index = 1; index < value.size(); ++index) {
    const wchar_t character = value[index];
    if (!((character >= L'0' && character <= L'9') || (character >= L'A' && character <= L'F') || (character >= L'a' && character <= L'f'))) return false;
  }
  return true;
}
inline bool IsValid(const Settings& value) noexcept { return IsValid(value.locale) && IsValidStringField(L"backgroundColor", value.backgroundColor) && IsValid(value.glass) && IsValid(value.foreground) && IsValid(value.uiScale, kUiScaleConstraint); }

inline constexpr std::array<std::wstring_view, 9> kWebToNativeTypes{L"bridge.ready", L"terminal.resize", L"terminal.input.commit", L"terminal.output.ack", L"settings.preview", L"settings.apply", L"settings.cancel", L"clipboard.read", L"clipboard.write"};
inline constexpr std::array<std::wstring_view, 13> kNativeToWebTypes{L"bridge.accepted", L"capabilities.changed", L"terminal.buffer.attach", L"terminal.input.ack", L"terminal.output.ready", L"terminal.recovered", L"settings.snapshot", L"settings.result", L"appearance.changed", L"window.state.changed", L"clipboard.result", L"drop.path", L"app.notice"};
inline constexpr std::array<std::wstring_view, 22> kAllTypes{L"bridge.ready", L"terminal.resize", L"terminal.input.commit", L"terminal.output.ack", L"settings.preview", L"settings.apply", L"settings.cancel", L"clipboard.read", L"clipboard.write", L"bridge.accepted", L"capabilities.changed", L"terminal.buffer.attach", L"terminal.input.ack", L"terminal.output.ready", L"terminal.recovered", L"settings.snapshot", L"settings.result", L"appearance.changed", L"window.state.changed", L"clipboard.result", L"drop.path", L"app.notice"};

constexpr bool Contains(const auto& values, std::wstring_view value) noexcept {
  for (const auto candidate : values) if (candidate == value) return true;
  return false;
}
constexpr bool IsWebToNative(std::wstring_view value) noexcept { return Contains(kWebToNativeTypes, value); }
constexpr bool IsNativeToWeb(std::wstring_view value) noexcept { return Contains(kNativeToWebTypes, value); }
}  // namespace lgt::protocol
