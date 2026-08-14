#include "webview/WebViewBridge.h"

#include <wil/com.h>

#include <cmath>
#include <set>

#include <winrt/Windows.Data.Json.h>

#include "contracts/generated/Protocol.generated.h"

namespace lgt::webview {
namespace {

using winrt::Windows::Data::Json::JsonArray;
using winrt::Windows::Data::Json::JsonObject;
using winrt::Windows::Data::Json::JsonValue;
using winrt::Windows::Data::Json::JsonValueType;

constexpr wchar_t kSource[] = L"https://app.liquid-glass-terminal.invalid/index.html";

bool ExactKeys(const JsonObject& object, const std::set<std::wstring>& required,
               const std::set<std::wstring>& optional = {}) {
  for (const auto& key : required) {
    if (!object.HasKey(key)) return false;
  }
  if (object.Size() < required.size() || object.Size() > required.size() + optional.size()) {
    return false;
  }
  for (const auto& pair : object) {
    const std::wstring key(pair.Key());
    if (!required.contains(key) && !optional.contains(key)) return false;
  }
  return true;
}

bool AsciiId(std::wstring_view value) {
  if (value.empty() || value.size() > 64) return false;
  for (const wchar_t character : value) {
    if (!((character >= L'a' && character <= L'z') ||
          (character >= L'A' && character <= L'Z') ||
          (character >= L'0' && character <= L'9') || character == L'.' ||
          character == L'_' || character == L'-')) {
      return false;
    }
  }
  return true;
}

bool FiniteNumber(const JsonObject& object, std::wstring_view name, double minimum,
                  double maximum, double& result) {
  const auto key = winrt::hstring(name);
  if (!object.HasKey(key) || object.GetNamedValue(key).ValueType() != JsonValueType::Number) {
    return false;
  }
  result = object.GetNamedNumber(key);
  return std::isfinite(result) && result >= minimum && result <= maximum;
}

bool Integer(const JsonObject& object, std::wstring_view name, std::uint32_t minimum,
             std::uint32_t maximum, std::uint32_t& result) {
  double number = 0;
  if (!FiniteNumber(object, name, minimum, maximum, number) || number != std::floor(number)) {
    return false;
  }
  result = static_cast<std::uint32_t>(number);
  return true;
}

JsonObject SettingsJson(const settings::Settings& settings) {
  JsonObject glass;
  glass.Insert(L"enabled", JsonValue::CreateBooleanValue(settings.glassEnabled));
  glass.Insert(L"preset", JsonValue::CreateStringValue(settings::ToString(settings.preset)));
  wchar_t tint[8]{};
  swprintf_s(tint, L"#%06X", settings.tint & 0xFFFFFFU);
  glass.Insert(L"tint", JsonValue::CreateStringValue(tint));
  JsonObject result;
  result.Insert(L"locale", JsonValue::CreateStringValue(settings::ToString(settings.locale)));
  result.Insert(L"glass", glass);
  result.Insert(L"foreground",
                JsonValue::CreateStringValue(settings::ToString(settings.foreground)));
  result.Insert(L"animations", JsonValue::CreateBooleanValue(settings.animations));
  result.Insert(L"uiScale", JsonValue::CreateNumberValue(settings.uiScale));
  return result;
}

std::optional<std::uint32_t> Tint(std::wstring_view text) {
  if (text.size() != 7 || text[0] != L'#') return std::nullopt;
  std::uint32_t result = 0;
  for (const wchar_t character : text.substr(1)) {
    result <<= 4;
    if (character >= L'0' && character <= L'9') result |= character - L'0';
    else if (character >= L'a' && character <= L'f') result |= character - L'a' + 10;
    else if (character >= L'A' && character <= L'F') result |= character - L'A' + 10;
    else return std::nullopt;
  }
  return result;
}

}  // namespace

WebViewBridge::WebViewBridge(settings::SettingsStore& settingsStore,
                             composition::CompositionHost& compositionHost,
                             terminal::ConPtySession& terminal,
                             terminal::SharedBufferTransport& transport,
                             platform::ClipboardService& clipboard,
                             SettingsChangedCallback settingsChanged)
    : settingsStore_(settingsStore),
      compositionHost_(compositionHost),
      terminal_(terminal),
      transport_(transport),
      clipboard_(clipboard),
      settingsChanged_(std::move(settingsChanged)) {}

WebViewBridge::~WebViewBridge() { Detach(); }

bool WebViewBridge::Attach(WebViewHost& host, const platform::PolicySnapshot& policy) {
  Detach();
  if (!host.Core()) return false;
  host_ = &host;
  policy_ = policy;
  const HRESULT result = host.Core()->add_WebMessageReceived(
      Microsoft::WRL::Callback<ICoreWebView2WebMessageReceivedEventHandler>(
          [this](ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs* arguments) {
            return OnMessage(arguments);
          })
          .Get(),
      &messageToken_);
  tokenRegistered_ = SUCCEEDED(result);
  return tokenRegistered_;
}

void WebViewBridge::Detach() noexcept {
  if (host_ && host_->Core() && tokenRegistered_) {
    host_->Core()->remove_WebMessageReceived(messageToken_);
  }
  tokenRegistered_ = false;
  handshake_ = false;
  sharedBuffers_ = false;
  if (!settingsTransaction_.empty()) {
    try {
      if (settingsStore_.Cancel(settingsTransaction_)) {
        settingsChanged_(settingsStore_.Effective());
      }
    } catch (...) {
    }
    settingsTransaction_.clear();
  }
  host_ = nullptr;
}

HRESULT WebViewBridge::OnMessage(ICoreWebView2WebMessageReceivedEventArgs* arguments) {
  try {
    wil::unique_cotaskmem_string source;
    wil::unique_cotaskmem_string message;
    if (FAILED(arguments->get_Source(&source)) || !source || wcscmp(source.get(), kSource) != 0 ||
        FAILED(arguments->get_WebMessageAsJson(&message)) || !message ||
        wcslen(message.get()) > protocol::kMaxClipboardBytes * 2) {
      return E_ACCESSDENIED;
    }
    const auto envelope = JsonObject::Parse(message.get());
    if (!Dispatch(envelope)) PostNotice(L"warning", L"bridge.invalid-message");
  } catch (...) {
    PostNotice(L"warning", L"bridge.invalid-message");
  }
  return S_OK;
}

bool WebViewBridge::Dispatch(const JsonObject& envelope) {
  if (!ExactKeys(envelope, {L"v", L"type", L"payload"}, {L"id"}) ||
      envelope.GetNamedValue(L"v").ValueType() != JsonValueType::Number ||
      envelope.GetNamedNumber(L"v") != protocol::kVersion ||
      envelope.GetNamedValue(L"type").ValueType() != JsonValueType::String ||
      envelope.GetNamedValue(L"payload").ValueType() != JsonValueType::Object) {
    return false;
  }
  if (envelope.HasKey(L"id") &&
      (envelope.GetNamedValue(L"id").ValueType() != JsonValueType::String ||
       !AsciiId(envelope.GetNamedString(L"id")))) {
    return false;
  }
  const std::wstring type(envelope.GetNamedString(L"type"));
  if (!protocol::IsWebToNative(type)) return false;
  const auto payload = envelope.GetNamedObject(L"payload");
  if (type == L"bridge.ready") return HandleBridgeReady(payload);
  if (!handshake_) return false;
  if (type == L"terminal.resize") return HandleResize(payload);
  if (type == L"terminal.input.commit" || type == L"terminal.output.ack") {
    return HandleBufferCommit(type, payload);
  }
  if (type == L"glass.layout.set") return HandleGlassLayout(payload);
  if (type.starts_with(L"settings.")) return HandleSettings(type, payload);
  if (type.starts_with(L"clipboard.")) return HandleClipboard(type, payload);
  return false;
}

bool WebViewBridge::HandleBridgeReady(const JsonObject& payload) {
  if (!ExactKeys(payload, {L"locale", L"devicePixelRatio"}) ||
      payload.GetNamedValue(L"locale").ValueType() != JsonValueType::String) {
    return false;
  }
  double ratio = 0;
  if (!FiniteNumber(payload, L"devicePixelRatio", 0.5, 8.0, ratio) ||
      payload.GetNamedString(L"locale").size() > 32) {
    return false;
  }
  if (handshake_) {
    PostAccepted(sharedBuffers_);
    PostAppearance();
    return true;
  }
  handshake_ = true;
  sharedBuffers_ = transport_.Attach(*host_, [this](std::span<const std::byte> input) {
    terminal_.Write(input);
  });
  PostAccepted(sharedBuffers_);
  PostAppearance();
  if (sharedBuffers_) EnsureTerminalStarted();
  else PostNotice(L"error", L"terminal.transport.failed");
  return true;
}

bool WebViewBridge::HandleResize(const JsonObject& payload) {
  if (!ExactKeys(payload, {L"cols", L"rows"})) return false;
  std::uint32_t columns = 0;
  std::uint32_t rows = 0;
  if (!Integer(payload, L"cols", 2, 500, columns) || !Integer(payload, L"rows", 1, 300, rows)) {
    return false;
  }
  columns_ = static_cast<short>(columns);
  rows_ = static_cast<short>(rows);
  if (terminal_.Running()) terminal_.Resize(columns_, rows_);
  else EnsureTerminalStarted();
  return true;
}

bool WebViewBridge::HandleBufferCommit(std::wstring_view type, const JsonObject& payload) {
  if (!ExactKeys(payload, {L"buffer", L"generation", L"sequence", L"length"})) return false;
  terminal::BufferCommit commit;
  const std::uint32_t maximumBuffer = type == L"terminal.input.commit" ? 1 : 3;
  if (!Integer(payload, L"buffer", 0, maximumBuffer, commit.buffer) ||
      !Integer(payload, L"generation", 0, UINT32_MAX, commit.generation) ||
      !Integer(payload, L"sequence", 0, UINT32_MAX, commit.sequence) ||
      !Integer(payload, L"length", 0, protocol::kTerminalChunkBytes, commit.length)) {
    return false;
  }
  if (type == L"terminal.input.commit") {
    if (!transport_.CommitInput(commit)) return false;
    JsonObject acknowledgement;
    acknowledgement.Insert(L"buffer", JsonValue::CreateNumberValue(commit.buffer));
    acknowledgement.Insert(L"generation", JsonValue::CreateNumberValue(commit.generation));
    acknowledgement.Insert(L"sequence", JsonValue::CreateNumberValue(commit.sequence));
    acknowledgement.Insert(L"length", JsonValue::CreateNumberValue(commit.length));
    return SUCCEEDED(Post(L"terminal.input.ack", acknowledgement));
  }
  return transport_.AcknowledgeOutput(commit);
}

bool WebViewBridge::HandleGlassLayout(const JsonObject& payload) {
  if (!ExactKeys(payload, {L"revision", L"regions"}) ||
      payload.GetNamedValue(L"regions").ValueType() != JsonValueType::Array) return false;
  std::uint32_t revision = 0;
  if (!Integer(payload, L"revision", 0, UINT32_MAX, revision)) {
    return false;
  }
  if (revision <= layoutRevision_) return true;
  const auto regionsJson = payload.GetNamedArray(L"regions");
  if (regionsJson.Size() > protocol::kMaxGlassRegions) return false;
  std::set<std::wstring> ids;
  std::vector<composition::GlassRegion> regions;
  for (const auto& value : regionsJson) {
    if (value.ValueType() != JsonValueType::Object) return false;
    const auto object = value.GetObject();
    if (!ExactKeys(object, {L"id", L"x", L"y", L"width", L"height", L"radii", L"role"}) ||
        object.GetNamedValue(L"id").ValueType() != JsonValueType::String ||
        object.GetNamedValue(L"role").ValueType() != JsonValueType::String ||
        object.GetNamedValue(L"radii").ValueType() != JsonValueType::Array) return false;
    composition::GlassRegion region;
    region.id = object.GetNamedString(L"id");
    if (!AsciiId(region.id) || !ids.insert(region.id).second) return false;
    double x = 0, y = 0, width = 0, height = 0;
    if (!FiniteNumber(object, L"x", -100000, 100000, x) ||
        !FiniteNumber(object, L"y", -100000, 100000, y) ||
        !FiniteNumber(object, L"width", 0, 100000, width) ||
        !FiniteNumber(object, L"height", 0, 100000, height)) return false;
    region.x = static_cast<float>(x);
    region.y = static_cast<float>(y);
    region.width = static_cast<float>(width);
    region.height = static_cast<float>(height);
    const auto radii = object.GetNamedArray(L"radii");
    if (radii.Size() != 4) return false;
    for (std::uint32_t index = 0; index < 4; ++index) {
      if (radii.GetAt(index).ValueType() != JsonValueType::Number) return false;
      const double radius = radii.GetNumberAt(index);
      if (!std::isfinite(radius) || radius < 0 || radius > 512) return false;
      region.radii[index] = static_cast<float>(radius);
    }
    const std::wstring role(object.GetNamedString(L"role"));
    if (role == L"terminal") region.role = composition::GlassRole::Terminal;
    else if (role == L"overlay") region.role = composition::GlassRole::Overlay;
    else if (role == L"decorative") region.role = composition::GlassRole::Decorative;
    else return false;
    regions.push_back(std::move(region));
  }
  layoutRevision_ = revision;
  compositionHost_.SetRegions(regions);
  if (host_ && host_->CompositionMode() &&
      compositionHost_.State() == composition::AppearanceState::Safe) {
    PostNotice(L"error", L"composition.update.failed");
    PostAppearance();
  }
  return true;
}

bool WebViewBridge::ParseSettingsPatch(const JsonObject& object,
                                       settings::Settings& value) const {
  if (!ExactKeys(object, {}, {L"locale", L"glass", L"foreground", L"animations", L"uiScale"}) ||
      object.Size() == 0) return false;
  if (object.HasKey(L"locale")) {
    if (object.GetNamedValue(L"locale").ValueType() != JsonValueType::String) return false;
    const std::wstring locale(object.GetNamedString(L"locale"));
    if (locale == L"system") value.locale = settings::Locale::System;
    else if (locale == L"en") value.locale = settings::Locale::English;
    else if (locale == L"ja") value.locale = settings::Locale::Japanese;
    else return false;
  }
  if (object.HasKey(L"glass")) {
    if (object.GetNamedValue(L"glass").ValueType() != JsonValueType::Object) return false;
    const auto glass = object.GetNamedObject(L"glass");
    if (!ExactKeys(glass, {}, {L"enabled", L"preset", L"tint"}) || glass.Size() == 0) return false;
    if (glass.HasKey(L"enabled")) {
      if (glass.GetNamedValue(L"enabled").ValueType() != JsonValueType::Boolean) return false;
      value.glassEnabled = glass.GetNamedBoolean(L"enabled");
    }
    if (glass.HasKey(L"preset")) {
      if (glass.GetNamedValue(L"preset").ValueType() != JsonValueType::String) return false;
      const std::wstring preset(glass.GetNamedString(L"preset"));
      if (preset == L"clear") value.preset = settings::GlassPreset::Clear;
      else if (preset == L"regular") value.preset = settings::GlassPreset::Regular;
      else if (preset == L"dense") value.preset = settings::GlassPreset::Dense;
      else return false;
    }
    if (glass.HasKey(L"tint")) {
      if (glass.GetNamedValue(L"tint").ValueType() != JsonValueType::String) return false;
      const auto tint = Tint(glass.GetNamedString(L"tint"));
      if (!tint) return false;
      value.tint = *tint;
    }
  }
  if (object.HasKey(L"foreground")) {
    if (object.GetNamedValue(L"foreground").ValueType() != JsonValueType::String) return false;
    const std::wstring foreground(object.GetNamedString(L"foreground"));
    if (foreground == L"auto") value.foreground = settings::Foreground::Auto;
    else if (foreground == L"light") value.foreground = settings::Foreground::Light;
    else if (foreground == L"dark") value.foreground = settings::Foreground::Dark;
    else return false;
  }
  if (object.HasKey(L"animations")) {
    if (object.GetNamedValue(L"animations").ValueType() != JsonValueType::Boolean) return false;
    value.animations = object.GetNamedBoolean(L"animations");
  }
  if (object.HasKey(L"uiScale")) {
    std::uint32_t scale = 0;
    if (!Integer(object, L"uiScale", 80, 200, scale) || scale % 10 != 0) return false;
    value.uiScale = static_cast<int>(scale);
  }
  return true;
}

bool WebViewBridge::HandleSettings(std::wstring_view type, const JsonObject& payload) {
  const bool cancel = type == L"settings.cancel";
  if (!ExactKeys(payload, cancel ? std::set<std::wstring>{L"transactionId"}
                                 : std::set<std::wstring>{L"transactionId", L"patch"}) ||
      payload.GetNamedValue(L"transactionId").ValueType() != JsonValueType::String) return false;
  const std::wstring transaction(payload.GetNamedString(L"transactionId"));
  if (!AsciiId(transaction)) return false;
  if (cancel) {
    if (transaction != settingsTransaction_) {
      PostSettingsResult(transaction, false, L"settings.transaction.invalid");
      return true;
    }
    const bool result = settingsStore_.Cancel(transaction);
    if (result) {
      settingsTransaction_.clear();
      settingsChanged_(settingsStore_.Effective());
    }
    PostSettingsResult(transaction, result, result ? L"" : L"settings.transaction.invalid");
    return true;
  }
  if (settingsTransaction_.empty()) {
    settingsStore_.BeginPreview(transaction);
    settingsTransaction_ = transaction;
    PostSettingsSnapshot(transaction);
  } else if (transaction != settingsTransaction_) {
    PostSettingsResult(transaction, false, L"settings.transaction.invalid");
    return true;
  }
  if (payload.GetNamedValue(L"patch").ValueType() != JsonValueType::Object) return false;
  settings::Settings value = settingsStore_.Effective();
  if (!ParseSettingsPatch(payload.GetNamedObject(L"patch"), value)) {
    PostSettingsResult(transaction, false, L"settings.patch.invalid");
    return true;
  }
  if (type == L"settings.preview") {
    const bool result = settingsStore_.Preview(transaction, value);
    if (result) settingsChanged_(value);
    PostSettingsResult(transaction, result,
                       result ? L"" : L"settings.transaction.invalid");
    return true;
  }
  const bool result = settingsStore_.Apply(transaction, value);
  if (result) {
    settingsTransaction_.clear();
    settingsChanged_(value);
  } else {
    settingsTransaction_.clear();
    settingsChanged_(settingsStore_.Effective());
  }
  PostSettingsResult(transaction, result, result ? L"" : L"settings.save.failed");
  return true;
}

bool WebViewBridge::HandleClipboard(std::wstring_view type, const JsonObject& payload) {
  const bool read = type == L"clipboard.read";
  if (!ExactKeys(payload, read ? std::set<std::wstring>{L"requestId"}
                              : std::set<std::wstring>{L"requestId", L"text"}) ||
      payload.GetNamedValue(L"requestId").ValueType() != JsonValueType::String) return false;
  const std::wstring request(payload.GetNamedString(L"requestId"));
  if (!AsciiId(request)) return false;
  if (read) {
    const auto value = clipboard_.ReadText();
    PostClipboardResult(request, value.has_value(), value.value_or(L""),
                        value ? L"" : L"clipboard.read.failed");
    return true;
  }
  if (payload.GetNamedValue(L"text").ValueType() != JsonValueType::String) return false;
  const std::wstring text(payload.GetNamedString(L"text"));
  if (!platform::ClipboardService::WithinLimit(text)) return false;
  const bool result = clipboard_.WriteText(text);
  PostClipboardResult(request, result, L"", result ? L"" : L"clipboard.write.failed");
  return true;
}

void WebViewBridge::EnsureTerminalStarted() {
  if (!handshake_ || columns_ < 2 || rows_ < 1 || terminal_.Running()) return;
  if (!terminal_.Start(columns_, rows_, [this](std::span<const std::byte> output) {
        return transport_.PublishOutput(output);
      })) {
    PostNotice(L"error", L"terminal.start.failed");
  }
}

void WebViewBridge::PostAccepted(bool sharedBuffers) {
  JsonObject capabilities;
  capabilities.Insert(L"glass", JsonValue::CreateBooleanValue(host_->CompositionMode()));
  capabilities.Insert(L"sharedBuffers", JsonValue::CreateBooleanValue(sharedBuffers));
  capabilities.Insert(L"reducedMotion", JsonValue::CreateBooleanValue(policy_.ReducedMotion()));
  capabilities.Insert(L"screenReader", JsonValue::CreateBooleanValue(policy_.screenReader));
  capabilities.Insert(L"highContrast", JsonValue::CreateBooleanValue(policy_.highContrast));
  JsonObject payload;
  payload.Insert(L"sessionId", JsonValue::CreateStringValue(L"terminal-1"));
  payload.Insert(L"settings", SettingsJson(settingsStore_.Effective()));
  payload.Insert(L"capabilities", capabilities);
  Post(L"bridge.accepted", payload);
}

void WebViewBridge::PostCapabilities() {
  if (!host_ || !handshake_) return;
  JsonObject payload;
  payload.Insert(L"glass", JsonValue::CreateBooleanValue(host_->CompositionMode()));
  payload.Insert(L"sharedBuffers", JsonValue::CreateBooleanValue(sharedBuffers_));
  payload.Insert(L"reducedMotion", JsonValue::CreateBooleanValue(policy_.ReducedMotion()));
  payload.Insert(L"screenReader", JsonValue::CreateBooleanValue(policy_.screenReader));
  payload.Insert(L"highContrast", JsonValue::CreateBooleanValue(policy_.highContrast));
  Post(L"capabilities.changed", payload);
}

void WebViewBridge::PostSettingsSnapshot(std::wstring_view transactionId) {
  JsonObject payload;
  payload.Insert(L"transactionId", JsonValue::CreateStringValue(transactionId));
  payload.Insert(L"settings", SettingsJson(settingsStore_.Current()));
  Post(L"settings.snapshot", payload);
}

void WebViewBridge::PostSettingsResult(std::wstring_view transactionId, bool success,
                                       std::wstring_view error) {
  JsonObject payload;
  payload.Insert(L"transactionId", JsonValue::CreateStringValue(transactionId));
  payload.Insert(L"ok", JsonValue::CreateBooleanValue(success));
  if (!error.empty()) payload.Insert(L"error", JsonValue::CreateStringValue(error));
  Post(L"settings.result", payload);
}

void WebViewBridge::PostClipboardResult(std::wstring_view requestId, bool success,
                                        std::wstring_view text, std::wstring_view error) {
  JsonObject payload;
  payload.Insert(L"requestId", JsonValue::CreateStringValue(requestId));
  payload.Insert(L"ok", JsonValue::CreateBooleanValue(success));
  if (success && !text.empty()) payload.Insert(L"text", JsonValue::CreateStringValue(text));
  if (!error.empty()) payload.Insert(L"error", JsonValue::CreateStringValue(error));
  Post(L"clipboard.result", payload);
}

void WebViewBridge::UpdatePolicy(const platform::PolicySnapshot& policy) {
  policy_ = policy;
  PostCapabilities();
  PostAppearance();
}

void WebViewBridge::PostAppearance() {
  if (!host_ || !handshake_) return;
  JsonObject payload;
  std::wstring_view state = L"safe";
  if (compositionHost_.State() == composition::AppearanceState::Glass) state = L"glass";
  else if (compositionHost_.State() == composition::AppearanceState::Solid) state = L"solid";
  payload.Insert(L"state", JsonValue::CreateStringValue(state));
  const auto reason = compositionHost_.StateReason();
  if (!reason.empty()) payload.Insert(L"reason", JsonValue::CreateStringValue(reason));
  Post(L"appearance.changed", payload);
}

void WebViewBridge::PostDroppedPath(std::wstring_view quotedPath) {
  JsonObject payload;
  payload.Insert(L"path", JsonValue::CreateStringValue(quotedPath));
  Post(L"drop.path", payload);
}

void WebViewBridge::PostNotice(std::wstring_view level, std::wstring_view message) {
  if (!host_) return;
  JsonObject payload;
  payload.Insert(L"level", JsonValue::CreateStringValue(level));
  payload.Insert(L"message", JsonValue::CreateStringValue(message));
  Post(L"app.notice", payload);
}

HRESULT WebViewBridge::Post(std::wstring_view type, const JsonObject& payload) const {
  if (!host_) return E_UNEXPECTED;
  JsonObject envelope;
  envelope.Insert(L"v", JsonValue::CreateNumberValue(protocol::kVersion));
  envelope.Insert(L"type", JsonValue::CreateStringValue(type));
  envelope.Insert(L"payload", payload);
  return host_->PostJson(envelope.Stringify());
}

}  // namespace lgt::webview
