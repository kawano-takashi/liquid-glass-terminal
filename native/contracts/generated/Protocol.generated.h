// Generated from contracts/protocol.idl.json. Do not edit.
#pragma once

#include <array>
#include <compare>
#include <cstdint>
#include <optional>
#include <string_view>

namespace lgt::protocol {
inline constexpr std::uint32_t kVersion = 2;
inline constexpr std::uint32_t kSettingsSchemaVersion = 2;
inline constexpr std::uint32_t kWindowStateSchemaVersion = 2;
inline constexpr std::wstring_view kAppOrigin = L"https://app.liquid-glass-terminal.invalid/";
inline constexpr std::uint32_t kTitlebarHeightDip = 56;
inline constexpr std::uint32_t kCaptionButtonWidthDip = 46;
inline constexpr std::size_t kMaxGlassRegions = 32;
inline constexpr std::size_t kTerminalChunkBytes = 65536;
inline constexpr std::size_t kTerminalPauseBytes = 262144;
inline constexpr std::size_t kTerminalResumeBytes = 65536;
inline constexpr std::size_t kMaxClipboardBytes = 1048576;
inline constexpr float kGrainMaximumOpacity = 0.030F;

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
inline constexpr NumericConstraint kFrostThicknessConstraint{0, 13, 1};
inline constexpr NumericConstraint kOpacityConstraint{0, 100, 5};
inline constexpr NumericConstraint kToneConstraint{0, 100, 1};
inline constexpr NumericConstraint kGrainConstraint{0, 100, 1};
inline constexpr NumericConstraint kUiScaleConstraint{80, 200, 10};

inline constexpr std::array<std::wstring_view, 5> kSettingsKeys{L"locale", L"glass", L"foreground", L"animations", L"uiScale"};
inline constexpr std::array<std::wstring_view, 5> kGlassSettingKeys{L"enabled", L"frostThickness", L"opacity", L"tone", L"grain"};
inline constexpr std::array<std::wstring_view, 4> kGlassValueKeys{L"frostThickness", L"opacity", L"tone", L"grain"};
inline constexpr std::array<float, 14> kFrostBlurDips{0.0F, 2.0F, 3.0F, 4.0F, 5.0F, 6.0F, 9.0F, 12.0F, 16.0F, 22.0F, 30.0F, 41.0F, 55.0F, 74.0F};

struct GlassValues {
  std::uint32_t frostThickness;
  std::uint32_t opacity;
  std::uint32_t tone;
  std::uint32_t grain;
  auto operator<=>(const GlassValues&) const = default;
};

struct GlassSettings {
  bool enabled = true;
  std::uint32_t frostThickness = 10;
  std::uint32_t opacity = 35;
  std::uint32_t tone = 92;
  std::uint32_t grain = 0;
  auto operator<=>(const GlassSettings&) const = default;
};

inline constexpr GlassValues kClearGlassPreset{5, 20, 92, 0};
inline constexpr GlassValues kRegularGlassPreset{10, 35, 92, 0};
inline constexpr GlassValues kDenseGlassPreset{12, 50, 92, 0};

struct GlassPresetDefinition { GlassPreset name; GlassValues values; };
inline constexpr std::array<GlassPresetDefinition, 3> kGlassPresets{{
    {GlassPreset::Clear, kClearGlassPreset},
    {GlassPreset::Regular, kRegularGlassPreset},
    {GlassPreset::Dense, kDenseGlassPreset}
}};

struct Settings {
  Locale locale = Locale::System;
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
constexpr bool IsValid(const GlassValues& value) noexcept { return IsValid(value.frostThickness, kFrostThicknessConstraint) && IsValid(value.opacity, kOpacityConstraint) && IsValid(value.tone, kToneConstraint) && IsValid(value.grain, kGrainConstraint); }
constexpr bool IsValid(const GlassSettings& value) noexcept { return IsValid(GlassValues{value.frostThickness, value.opacity, value.tone, value.grain}); }
constexpr bool IsValid(Locale value) noexcept { return !ToString(value).empty(); }
constexpr bool IsValid(Foreground value) noexcept { return !ToString(value).empty(); }
constexpr bool IsValid(const Settings& value) noexcept { return IsValid(value.locale) && IsValid(value.glass) && IsValid(value.foreground) && IsValid(value.uiScale, kUiScaleConstraint); }
constexpr std::uint32_t ToneChannel(std::uint32_t tone) noexcept { return (tone * 255U + 50U) / 100U; }
constexpr std::uint32_t ToneRgb(std::uint32_t tone) noexcept { const auto channel = ToneChannel(tone); return (channel << 16U) | (channel << 8U) | channel; }
constexpr float FrostBlurDip(std::uint32_t frostThickness) noexcept { return frostThickness < kFrostBlurDips.size() ? kFrostBlurDips[frostThickness] : kFrostBlurDips[kDefaultSettings.glass.frostThickness]; }
constexpr float GrainOpacity(std::uint32_t grain) noexcept { return static_cast<float>(grain) / static_cast<float>(kGrainConstraint.maximum) * kGrainMaximumOpacity; }

inline constexpr std::array<std::wstring_view, 10> kWebToNativeTypes{L"bridge.ready", L"terminal.resize", L"terminal.input.commit", L"terminal.output.ack", L"glass.layout.set", L"settings.preview", L"settings.apply", L"settings.cancel", L"clipboard.read", L"clipboard.write"};
inline constexpr std::array<std::wstring_view, 13> kNativeToWebTypes{L"bridge.accepted", L"capabilities.changed", L"terminal.buffer.attach", L"terminal.input.ack", L"terminal.output.ready", L"terminal.recovered", L"settings.snapshot", L"settings.result", L"appearance.changed", L"window.state.changed", L"clipboard.result", L"drop.path", L"app.notice"};
inline constexpr std::array<std::wstring_view, 23> kAllTypes{L"bridge.ready", L"terminal.resize", L"terminal.input.commit", L"terminal.output.ack", L"glass.layout.set", L"settings.preview", L"settings.apply", L"settings.cancel", L"clipboard.read", L"clipboard.write", L"bridge.accepted", L"capabilities.changed", L"terminal.buffer.attach", L"terminal.input.ack", L"terminal.output.ready", L"terminal.recovered", L"settings.snapshot", L"settings.result", L"appearance.changed", L"window.state.changed", L"clipboard.result", L"drop.path", L"app.notice"};

constexpr bool Contains(const auto& values, std::wstring_view value) noexcept {
  for (const auto candidate : values) if (candidate == value) return true;
  return false;
}
constexpr bool IsWebToNative(std::wstring_view value) noexcept { return Contains(kWebToNativeTypes, value); }
constexpr bool IsNativeToWeb(std::wstring_view value) noexcept { return Contains(kNativeToWebTypes, value); }
}  // namespace lgt::protocol
