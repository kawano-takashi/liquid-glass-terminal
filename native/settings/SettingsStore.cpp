#include "settings/SettingsStore.h"

#include <shlobj.h>

#include <chrono>
#include <cmath>
#include <fstream>
#include <limits>
#include <set>
#include <sstream>
#include <stdexcept>

#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Data.Json.h>
#include <winrt/base.h>

#include "settings/BackgroundColor.h"

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

bool ConstrainedInteger(const JsonObject& object, std::wstring_view name,
                        protocol::NumericConstraint constraint, std::uint32_t& value) {
  const auto key = winrt::hstring(name);
  if (!object.HasKey(key) || object.GetNamedValue(key).ValueType() != JsonValueType::Number) {
    return false;
  }
  const double number = object.GetNamedNumber(key);
  if (!std::isfinite(number) || number != std::floor(number) || number < constraint.minimum ||
      number > constraint.maximum) {
    return false;
  }
  value = static_cast<std::uint32_t>(number);
  return protocol::IsValid(value, constraint);
}

bool Integer(const JsonObject& object, std::wstring_view name, int& value) {
  const auto key = winrt::hstring(name);
  if (!object.HasKey(key) || object.GetNamedValue(key).ValueType() != JsonValueType::Number) {
    return false;
  }
  const double number = object.GetNamedNumber(key);
  if (!std::isfinite(number) || number != std::floor(number) ||
      number < std::numeric_limits<int>::min() || number > std::numeric_limits<int>::max()) {
    return false;
  }
  value = static_cast<int>(number);
  return true;
}

std::wstring ReadText(const std::filesystem::path& path) {
  std::wifstream input(path);
  input.imbue(std::locale(""));
  std::wstringstream buffer;
  buffer << input.rdbuf();
  return buffer.str();
}

std::optional<Settings> ParseSettingsJson(std::wstring_view json,
                                          std::uint32_t schemaVersion,
                                          bool includesBackgroundColor) {
  try {
    const auto root = JsonObject::Parse(json);
    const auto expectedKeys = includesBackgroundColor
                                  ? std::set<std::wstring>{L"schemaVersion", L"locale",
                                                           L"backgroundColor", L"glass",
                                                           L"foreground", L"animations", L"uiScale"}
                                  : std::set<std::wstring>{L"schemaVersion", L"locale", L"glass",
                                                           L"foreground", L"animations", L"uiScale"};
    if (!ExactKeys(root, expectedKeys) ||
        root.GetNamedValue(L"schemaVersion").ValueType() != JsonValueType::Number ||
        root.GetNamedNumber(L"schemaVersion") != schemaVersion ||
        root.GetNamedValue(L"glass").ValueType() != JsonValueType::Object) {
      return std::nullopt;
    }
    const auto glass = root.GetNamedObject(L"glass");
    if (!ExactKeys(glass, {L"enabled", L"blurDips"})) return std::nullopt;

    Settings result;
    const auto locale = protocol::ParseLocale(root.GetNamedString(L"locale"));
    const auto foreground = protocol::ParseForeground(root.GetNamedString(L"foreground"));
    if (!locale || !foreground || !Boolean(glass, L"enabled", result.glass.enabled) ||
        !Boolean(root, L"animations", result.animations)) {
      return std::nullopt;
    }
    if (includesBackgroundColor) {
      if (root.GetNamedValue(L"backgroundColor").ValueType() != JsonValueType::String) {
        return std::nullopt;
      }
      const std::wstring color(root.GetNamedString(L"backgroundColor"));
      if (!IsValidBackgroundColor(color)) return std::nullopt;
      result.backgroundColor = NormalizeBackgroundColor(color);
    }
    if (!ConstrainedInteger(glass, L"blurDips", protocol::kBlurDipsConstraint,
                            result.glass.blurDips) ||
        !ConstrainedInteger(root, L"uiScale", protocol::kUiScaleConstraint, result.uiScale)) {
      return std::nullopt;
    }
    result.locale = *locale;
    result.foreground = *foreground;
    return protocol::IsValid(result) ? std::optional<Settings>(result) : std::nullopt;
  } catch (...) {
    return std::nullopt;
  }
}

}  // namespace

std::wstring_view ToString(GlassPreset value) noexcept {
  return protocol::ToString(value);
}

std::wstring_view ToString(Foreground value) noexcept {
  return protocol::ToString(value);
}

std::wstring_view ToString(Locale value) noexcept {
  return protocol::ToString(value);
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
  const auto path = dataDirectory_ / L"settings-v7.json";
  if (std::filesystem::exists(path)) {
    const auto parsed = Parse(ReadText(path));
    if (parsed) {
      current_ = *parsed;
    } else {
      IsolateInvalid(path);
      current_ = {};
    }
    return;
  }

  const auto legacyPath = dataDirectory_ / L"settings-v6.json";
  if (!std::filesystem::exists(legacyPath)) return;
  try {
    const auto parsed = ParseSettingsJson(ReadText(legacyPath), 6, false);
    if (!parsed) throw std::runtime_error("invalid settings");
    if (!AtomicWrite(path, Serialize(*parsed))) throw std::runtime_error("migration failed");
    current_ = *parsed;
  } catch (...) {
    IsolateInvalid(legacyPath);
    current_ = {};
  }
}

bool SettingsStore::Save(const Settings& value) {
  if (!protocol::IsValid(value)) return false;
  Settings normalized = value;
  normalized.backgroundColor = NormalizeBackgroundColor(value.backgroundColor);
  if (!AtomicWrite(dataDirectory_ / L"settings-v7.json", Serialize(normalized))) return false;
  current_ = normalized;
  preview_.reset();
  previewTransaction_.clear();
  return true;
}

void SettingsStore::BeginPreview(std::wstring transactionId) {
  previewTransaction_ = std::move(transactionId);
  preview_ = current_;
}

bool SettingsStore::Preview(std::wstring_view transactionId, const Settings& value) {
  if (transactionId != previewTransaction_ || !protocol::IsValid(value)) return false;
  preview_ = value;
  preview_->backgroundColor = NormalizeBackgroundColor(value.backgroundColor);
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
  const auto path = dataDirectory_ / L"window-state-v2.json";
  if (!std::filesystem::exists(path)) return {};
  try {
    const auto object = JsonObject::Parse(ReadText(path));
    if (!ExactKeys(object, {L"schemaVersion", L"x", L"y", L"width", L"height", L"maximized"}) ||
        object.GetNamedValue(L"schemaVersion").ValueType() != JsonValueType::Number ||
        object.GetNamedNumber(L"schemaVersion") != protocol::kWindowStateSchemaVersion ||
        object.GetNamedValue(L"maximized").ValueType() != JsonValueType::Boolean) {
      throw std::runtime_error("invalid window state");
    }
    WindowState state;
    if (!Integer(object, L"x", state.x) || !Integer(object, L"y", state.y) ||
        !Integer(object, L"width", state.width) || !Integer(object, L"height", state.height) ||
        state.width < protocol::kMinimumWindowWidth ||
        state.height < protocol::kMinimumWindowHeight ||
        state.width > protocol::kMaximumWindowExtent ||
        state.height > protocol::kMaximumWindowExtent) {
      throw std::runtime_error("invalid window state");
    }
    state.maximized = object.GetNamedBoolean(L"maximized");
    return state;
  } catch (...) {
    IsolateInvalid(path);
    return {};
  }
}

bool SettingsStore::SaveWindowState(const WindowState& state) const {
  if (state.width < protocol::kMinimumWindowWidth ||
      state.height < protocol::kMinimumWindowHeight ||
      state.width > protocol::kMaximumWindowExtent ||
      state.height > protocol::kMaximumWindowExtent) {
    return false;
  }
  JsonObject object;
  object.Insert(L"schemaVersion", winrt::Windows::Data::Json::JsonValue::CreateNumberValue(
                                      protocol::kWindowStateSchemaVersion));
  object.Insert(L"x", winrt::Windows::Data::Json::JsonValue::CreateNumberValue(state.x));
  object.Insert(L"y", winrt::Windows::Data::Json::JsonValue::CreateNumberValue(state.y));
  object.Insert(L"width", winrt::Windows::Data::Json::JsonValue::CreateNumberValue(state.width));
  object.Insert(L"height", winrt::Windows::Data::Json::JsonValue::CreateNumberValue(state.height));
  object.Insert(L"maximized", winrt::Windows::Data::Json::JsonValue::CreateBooleanValue(state.maximized));
  return AtomicWrite(dataDirectory_ / L"window-state-v2.json",
                     std::wstring(object.Stringify()));
}

std::wstring SettingsStore::Serialize(const Settings& value) {
  Settings normalized = value;
  normalized.backgroundColor = NormalizeBackgroundColor(value.backgroundColor);
  JsonObject glass;
  glass.Insert(L"enabled", winrt::Windows::Data::Json::JsonValue::CreateBooleanValue(normalized.glass.enabled));
  glass.Insert(L"blurDips", winrt::Windows::Data::Json::JsonValue::CreateNumberValue(normalized.glass.blurDips));
  JsonObject root;
  root.Insert(L"schemaVersion", winrt::Windows::Data::Json::JsonValue::CreateNumberValue(
                                     protocol::kSettingsSchemaVersion));
  root.Insert(L"locale", winrt::Windows::Data::Json::JsonValue::CreateStringValue(
                               protocol::ToString(normalized.locale)));
  root.Insert(L"backgroundColor", winrt::Windows::Data::Json::JsonValue::CreateStringValue(
                                      normalized.backgroundColor));
  root.Insert(L"glass", glass);
  root.Insert(L"foreground", winrt::Windows::Data::Json::JsonValue::CreateStringValue(
                                   protocol::ToString(normalized.foreground)));
  root.Insert(L"animations", winrt::Windows::Data::Json::JsonValue::CreateBooleanValue(normalized.animations));
  root.Insert(L"uiScale", winrt::Windows::Data::Json::JsonValue::CreateNumberValue(normalized.uiScale));
  return std::wstring(root.Stringify());
}

std::optional<Settings> SettingsStore::Parse(std::wstring_view json) {
  return ParseSettingsJson(json, protocol::kSettingsSchemaVersion, true);
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
