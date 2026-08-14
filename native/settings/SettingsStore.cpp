#include "settings/SettingsStore.h"

#include <shlobj.h>

#include <chrono>
#include <fstream>
#include <iomanip>
#include <set>
#include <sstream>

#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Data.Json.h>
#include <winrt/base.h>

namespace lgt::settings {
namespace {

using winrt::Windows::Data::Json::JsonObject;
using winrt::Windows::Data::Json::JsonValueType;

std::filesystem::path ResolveDataDirectory() {
#if defined(LGT_E2E_BUILD)
  std::wstring overridePath(32768, L'\0');
  const DWORD overrideLength = GetEnvironmentVariableW(
      L"LGT_E2E_DATA_DIR", overridePath.data(), static_cast<DWORD>(overridePath.size()));
  if (overrideLength > 0 && overrideLength < overridePath.size()) {
    overridePath.resize(overrideLength);
    std::filesystem::path result = std::filesystem::absolute(overridePath);
    std::error_code error;
    std::filesystem::create_directories(result, error);
    if (!error) return result;
  }
#endif
  PWSTR raw = nullptr;
  winrt::check_hresult(SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_CREATE, nullptr, &raw));
  std::filesystem::path result(raw);
  CoTaskMemFree(raw);
  result /= L"Liquid Glass Terminal";
  std::error_code error;
  std::filesystem::create_directories(result, error);
  return result;
}

bool ExactKeys(const JsonObject& object, const std::set<std::wstring>& keys) {
  if (object.Size() != keys.size()) return false;
  for (const auto& pair : object) {
    if (!keys.contains(std::wstring(pair.Key()))) return false;
  }
  return true;
}

bool Boolean(const JsonObject& object, std::wstring_view name, bool& value) {
  const auto key = winrt::hstring(name);
  if (!object.HasKey(key) || object.GetNamedValue(key).ValueType() != JsonValueType::Boolean) return false;
  value = object.GetNamedBoolean(key);
  return true;
}

std::optional<std::uint32_t> ParseTint(std::wstring_view text) {
  if (text.size() != 7 || text.front() != L'#') return std::nullopt;
  std::uint32_t value = 0;
  for (const wchar_t character : text.substr(1)) {
    value <<= 4;
    if (character >= L'0' && character <= L'9') value |= character - L'0';
    else if (character >= L'a' && character <= L'f') value |= character - L'a' + 10;
    else if (character >= L'A' && character <= L'F') value |= character - L'A' + 10;
    else return std::nullopt;
  }
  return value;
}

std::wstring TintString(std::uint32_t tint) {
  std::wostringstream stream;
  stream << L'#' << std::uppercase << std::hex << std::setfill(L'0') << std::setw(6)
         << (tint & 0xFFFFFFU);
  return stream.str();
}

template <typename Enum>
std::optional<Enum> ParseEnum(std::wstring_view) = delete;

template <>
std::optional<GlassPreset> ParseEnum(std::wstring_view value) {
  if (value == L"clear") return GlassPreset::Clear;
  if (value == L"regular") return GlassPreset::Regular;
  if (value == L"dense") return GlassPreset::Dense;
  return std::nullopt;
}

template <>
std::optional<Foreground> ParseEnum(std::wstring_view value) {
  if (value == L"auto") return Foreground::Auto;
  if (value == L"light") return Foreground::Light;
  if (value == L"dark") return Foreground::Dark;
  return std::nullopt;
}

template <>
std::optional<Locale> ParseEnum(std::wstring_view value) {
  if (value == L"system") return Locale::System;
  if (value == L"en") return Locale::English;
  if (value == L"ja") return Locale::Japanese;
  return std::nullopt;
}

std::wstring ReadText(const std::filesystem::path& path) {
  std::wifstream input(path);
  input.imbue(std::locale(""));
  std::wstringstream buffer;
  buffer << input.rdbuf();
  return buffer.str();
}

}  // namespace

std::wstring_view ToString(GlassPreset value) noexcept {
  switch (value) {
    case GlassPreset::Clear: return L"clear";
    case GlassPreset::Regular: return L"regular";
    case GlassPreset::Dense: return L"dense";
  }
  return L"regular";
}

std::wstring_view ToString(Foreground value) noexcept {
  switch (value) {
    case Foreground::Auto: return L"auto";
    case Foreground::Light: return L"light";
    case Foreground::Dark: return L"dark";
  }
  return L"auto";
}

std::wstring_view ToString(Locale value) noexcept {
  switch (value) {
    case Locale::System: return L"system";
    case Locale::English: return L"en";
    case Locale::Japanese: return L"ja";
  }
  return L"system";
}

SettingsStore::SettingsStore() : SettingsStore(ResolveDataDirectory()) {}

SettingsStore::SettingsStore(std::filesystem::path dataDirectory)
    : dataDirectory_(std::move(dataDirectory)) {}

const std::filesystem::path& SettingsStore::DataDirectory() const noexcept { return dataDirectory_; }

std::filesystem::path SettingsStore::WebViewDataDirectory() const {
  return dataDirectory_ / L"WebView2";
}

const Settings& SettingsStore::Current() const noexcept { return current_; }

Settings SettingsStore::Effective() const noexcept { return preview_.value_or(current_); }

void SettingsStore::Load() {
  const auto path = dataDirectory_ / L"settings-v1.json";
  if (!std::filesystem::exists(path)) return;
  try {
    const auto parsed = Parse(ReadText(path));
    if (!parsed) throw std::runtime_error("invalid settings");
    current_ = *parsed;
  } catch (...) {
    IsolateInvalid(path);
    current_ = {};
  }
}

bool SettingsStore::Save(const Settings& value) {
  if (!AtomicWrite(dataDirectory_ / L"settings-v1.json", Serialize(value))) return false;
  current_ = value;
  preview_.reset();
  previewTransaction_.clear();
  return true;
}

void SettingsStore::BeginPreview(std::wstring transactionId) {
  previewTransaction_ = std::move(transactionId);
  preview_ = current_;
}

bool SettingsStore::Preview(std::wstring_view transactionId, const Settings& value) {
  if (transactionId != previewTransaction_) return false;
  preview_ = value;
  return true;
}

bool SettingsStore::Apply(std::wstring_view transactionId, const Settings& value) {
  if (transactionId != previewTransaction_) return false;
  if (Save(value)) return true;
  preview_.reset();
  previewTransaction_.clear();
  return false;
}

bool SettingsStore::Cancel(std::wstring_view transactionId) {
  if (transactionId != previewTransaction_) return false;
  preview_.reset();
  previewTransaction_.clear();
  return true;
}

WindowState SettingsStore::LoadWindowState() const {
  const auto path = dataDirectory_ / L"window-state-v1.json";
  if (!std::filesystem::exists(path)) return {};
  try {
    const auto object = JsonObject::Parse(ReadText(path));
    if (!ExactKeys(object, {L"x", L"y", L"width", L"height", L"maximized"})) return {};
    WindowState state{
        static_cast<int>(object.GetNamedNumber(L"x")),
        static_cast<int>(object.GetNamedNumber(L"y")),
        static_cast<int>(object.GetNamedNumber(L"width")),
        static_cast<int>(object.GetNamedNumber(L"height")),
        object.GetNamedBoolean(L"maximized")};
    if (state.width < 480 || state.height < 320 || state.width > 16384 || state.height > 16384) return {};
    return state;
  } catch (...) {
    IsolateInvalid(path);
    return {};
  }
}

bool SettingsStore::SaveWindowState(const WindowState& state) const {
  JsonObject object;
  object.Insert(L"x", winrt::Windows::Data::Json::JsonValue::CreateNumberValue(state.x));
  object.Insert(L"y", winrt::Windows::Data::Json::JsonValue::CreateNumberValue(state.y));
  object.Insert(L"width", winrt::Windows::Data::Json::JsonValue::CreateNumberValue(state.width));
  object.Insert(L"height", winrt::Windows::Data::Json::JsonValue::CreateNumberValue(state.height));
  object.Insert(L"maximized", winrt::Windows::Data::Json::JsonValue::CreateBooleanValue(state.maximized));
  return AtomicWrite(dataDirectory_ / L"window-state-v1.json",
                     std::wstring(object.Stringify()));
}

std::wstring SettingsStore::Serialize(const Settings& value) {
  JsonObject glass;
  glass.Insert(L"enabled", winrt::Windows::Data::Json::JsonValue::CreateBooleanValue(value.glassEnabled));
  glass.Insert(L"preset", winrt::Windows::Data::Json::JsonValue::CreateStringValue(ToString(value.preset)));
  glass.Insert(L"tint", winrt::Windows::Data::Json::JsonValue::CreateStringValue(TintString(value.tint)));
  JsonObject root;
  root.Insert(L"schemaVersion", winrt::Windows::Data::Json::JsonValue::CreateNumberValue(1));
  root.Insert(L"locale", winrt::Windows::Data::Json::JsonValue::CreateStringValue(ToString(value.locale)));
  root.Insert(L"glass", glass);
  root.Insert(L"foreground", winrt::Windows::Data::Json::JsonValue::CreateStringValue(ToString(value.foreground)));
  root.Insert(L"animations", winrt::Windows::Data::Json::JsonValue::CreateBooleanValue(value.animations));
  root.Insert(L"uiScale", winrt::Windows::Data::Json::JsonValue::CreateNumberValue(value.uiScale));
  return std::wstring(root.Stringify());
}

std::optional<Settings> SettingsStore::Parse(std::wstring_view json) {
  try {
    const auto root = JsonObject::Parse(json);
    if (!ExactKeys(root, {L"schemaVersion", L"locale", L"glass", L"foreground", L"animations", L"uiScale"}) ||
        root.GetNamedNumber(L"schemaVersion") != 1 ||
        root.GetNamedValue(L"glass").ValueType() != JsonValueType::Object) return std::nullopt;
    const auto glass = root.GetNamedObject(L"glass");
    if (!ExactKeys(glass, {L"enabled", L"preset", L"tint"})) return std::nullopt;
    Settings result;
    const auto locale = ParseEnum<Locale>(root.GetNamedString(L"locale"));
    const auto preset = ParseEnum<GlassPreset>(glass.GetNamedString(L"preset"));
    const auto tint = ParseTint(glass.GetNamedString(L"tint"));
    const auto foreground = ParseEnum<Foreground>(root.GetNamedString(L"foreground"));
    if (!locale || !preset || !tint || !foreground || !Boolean(glass, L"enabled", result.glassEnabled) ||
        !Boolean(root, L"animations", result.animations)) return std::nullopt;
    const double scale = root.GetNamedNumber(L"uiScale");
    if (scale < 80 || scale > 200 || static_cast<int>(scale) % 10 != 0 || scale != static_cast<int>(scale)) return std::nullopt;
    result.locale = *locale;
    result.preset = *preset;
    result.tint = *tint;
    result.foreground = *foreground;
    result.uiScale = static_cast<int>(scale);
    return result;
  } catch (...) {
    return std::nullopt;
  }
}

void SettingsStore::IsolateInvalid(const std::filesystem::path& path) const {
  const auto timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
                             std::chrono::system_clock::now().time_since_epoch())
                             .count();
  std::error_code error;
  std::filesystem::rename(path, path.wstring() + L".invalid-" + std::to_wstring(timestamp), error);
}

bool SettingsStore::AtomicWrite(const std::filesystem::path& path, std::wstring_view contents) {
  const auto temporary = path.wstring() + L".tmp";
  {
    std::wofstream output(temporary, std::ios::trunc);
    output.imbue(std::locale(""));
    if (!output) return false;
    output << contents;
    output.flush();
    if (!output) return false;
  }
  return MoveFileExW(temporary.c_str(), path.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) != FALSE;
}

}  // namespace lgt::settings
