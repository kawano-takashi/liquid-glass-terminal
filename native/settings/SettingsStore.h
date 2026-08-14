#pragma once

#include <windows.h>

#include <cstdint>
#include <filesystem>
#include <optional>
#include <string>

namespace lgt::settings {

enum class GlassPreset { Clear, Regular, Dense };
enum class Foreground { Auto, Light, Dark };
enum class Locale { System, English, Japanese };

struct Settings {
  Locale locale = Locale::System;
  bool glassEnabled = true;
  GlassPreset preset = GlassPreset::Regular;
  std::uint32_t tint = 0x181818;
  Foreground foreground = Foreground::Auto;
  bool animations = true;
  int uiScale = 100;

  auto operator<=>(const Settings&) const = default;
};

struct WindowState {
  int x = 0;
  int y = 0;
  int width = 1100;
  int height = 720;
  bool maximized = false;
};

class SettingsStore final {
 public:
  SettingsStore();
  explicit SettingsStore(std::filesystem::path dataDirectory);

  [[nodiscard]] const std::filesystem::path& DataDirectory() const noexcept;
  [[nodiscard]] std::filesystem::path WebViewDataDirectory() const;
  [[nodiscard]] const Settings& Current() const noexcept;
  [[nodiscard]] Settings Effective() const noexcept;

  void Load();
  bool Save(const Settings& value);
  void BeginPreview(std::wstring transactionId);
  bool Preview(std::wstring_view transactionId, const Settings& value);
  bool Apply(std::wstring_view transactionId, const Settings& value);
  bool Cancel(std::wstring_view transactionId);

  [[nodiscard]] WindowState LoadWindowState() const;
  bool SaveWindowState(const WindowState& state) const;

  [[nodiscard]] static std::wstring Serialize(const Settings& value);
  [[nodiscard]] static std::optional<Settings> Parse(std::wstring_view json);

 private:
  void IsolateInvalid(const std::filesystem::path& path) const;
  static bool AtomicWrite(const std::filesystem::path& path, std::wstring_view contents);

  std::filesystem::path dataDirectory_;
  Settings current_{};
  std::optional<Settings> preview_;
  std::wstring previewTransaction_;
};

[[nodiscard]] std::wstring_view ToString(GlassPreset value) noexcept;
[[nodiscard]] std::wstring_view ToString(Foreground value) noexcept;
[[nodiscard]] std::wstring_view ToString(Locale value) noexcept;

}  // namespace lgt::settings
