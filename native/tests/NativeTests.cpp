#include <windows.h>

#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <mutex>
#include <span>
#include <string>

#include <winrt/base.h>

#include "composition/GlassMaterial.h"
#include "platform/ClipboardService.h"
#include "platform/FileDropTarget.h"
#include "settings/SettingsStore.h"
#include "terminal/ConPtySession.h"
#include "window/WindowMetrics.h"

namespace {

int failures = 0;

void Expect(bool condition, std::string_view message) {
  if (condition) return;
  ++failures;
  std::cerr << "FAIL: " << message << '\n';
}

void WriteText(const std::filesystem::path& path, std::string_view contents) {
  std::ofstream output(path, std::ios::trunc);
  output << contents;
}

bool HasInvalidCopy(const std::filesystem::path& path) {
  const auto prefix = path.filename().wstring() + L".invalid-";
  for (const auto& entry : std::filesystem::directory_iterator(path.parent_path())) {
    const auto name = entry.path().filename().wstring();
    if (name.starts_with(prefix)) return true;
  }
  return false;
}

void TestSettings() {
  using namespace lgt::settings;
  Settings source;
  source.locale = Locale::Japanese;
  source.glass.enabled = false;
  source.glass.frostThickness = 12;
  source.glass.opacity = 50;
  source.glass.tone = 72;
  source.glass.grain = 36;
  source.foreground = Foreground::Dark;
  source.animations = false;
  source.uiScale = 140;
  const auto parsed = SettingsStore::Parse(SettingsStore::Serialize(source));
  Expect(parsed == source, "settings must round-trip exactly");
  Expect(!SettingsStore::Parse(
             LR"({"schemaVersion":2,"locale":"en","glass":{"enabled":true,"frostThickness":10,"opacity":35,"tone":92,"grain":0},"foreground":"auto","animations":true,"uiScale":105})"),
         "settings must reject a scale outside the ten-percent step");
  Expect(!SettingsStore::Parse(
             LR"({"schemaVersion":2,"locale":"en","glass":{"enabled":true,"frostThickness":10,"opacity":35,"tone":92,"grain":0},"foreground":"auto","animations":true,"uiScale":100,"extra":true})"),
         "settings must reject unknown fields");
  Expect(!SettingsStore::Parse(LR"({"schemaVersion":1})"),
         "settings must reject unknown schemas");
  Expect(lgt::protocol::ParseSettingsOperation(L"preview") ==
             lgt::protocol::SettingsOperation::Preview &&
             lgt::protocol::ToString(lgt::protocol::SettingsOperation::Apply) == L"apply" &&
             !lgt::protocol::ParseSettingsOperation(L"save"),
         "settings result operations must use the generated exact enum");

  const auto testDirectory = std::filesystem::temp_directory_path() /
                             (L"lgt-settings-test-" + std::to_wstring(GetCurrentProcessId()));
  std::error_code error;
  std::filesystem::remove_all(testDirectory, error);
  std::filesystem::create_directories(testDirectory, error);
  Expect(!error, "settings test directory must be created");
  if (!error) {
    const auto legacyDirectory = testDirectory / L"legacy";
    std::filesystem::create_directories(legacyDirectory, error);
    WriteText(legacyDirectory / L"settings-v1.json", R"({"schemaVersion":1})");
    WriteText(legacyDirectory / L"window-state-v1.json", R"({"schemaVersion":1})");
    SettingsStore legacy(legacyDirectory);
    legacy.Load();
    Expect(legacy.Current() == Settings{}, "v1 settings must be ignored");
    Expect(legacy.LoadWindowState() == WindowState{}, "v1 window state must be ignored");
    Expect(std::filesystem::exists(legacyDirectory / L"settings-v1.json") &&
               std::filesystem::exists(legacyDirectory / L"window-state-v1.json"),
           "ignored v1 persistence files must remain untouched");

    const auto persistedDirectory = testDirectory / L"persisted";
    std::filesystem::create_directories(persistedDirectory, error);
    SettingsStore persisted(persistedDirectory);
    Expect(persisted.Save(source), "settings must save atomically");
    SettingsStore reloaded(persistedDirectory);
    reloaded.Load();
    Expect(reloaded.Current() == source, "saved settings must reload exactly");

    Expect(reloaded.LoadWindowState() == WindowState{},
           "missing v2 window state must use the generated default");
    WindowState windowState;
    windowState.x = 120;
    windowState.y = 80;
    windowState.width = 1280;
    windowState.height = 960;
    windowState.maximized = true;
    Expect(reloaded.SaveWindowState(windowState), "window state v2 must save atomically");
    SettingsStore windowReloaded(persistedDirectory);
    Expect(windowReloaded.LoadWindowState() == windowState,
           "window state v2 must round-trip exactly");

    const auto invalidSettingsDirectory = testDirectory / L"invalid-settings";
    std::filesystem::create_directories(invalidSettingsDirectory, error);
    const auto invalidSettingsPath = invalidSettingsDirectory / L"settings-v2.json";
    WriteText(invalidSettingsPath, R"({"schemaVersion":1})");
    SettingsStore invalidSettings(invalidSettingsDirectory);
    invalidSettings.Load();
    Expect(invalidSettings.Current() == Settings{} &&
               !std::filesystem::exists(invalidSettingsPath) &&
               HasInvalidCopy(invalidSettingsPath),
           "invalid settings v2 must be isolated and reset to defaults");

    const auto invalidWindowDirectory = testDirectory / L"invalid-window";
    std::filesystem::create_directories(invalidWindowDirectory, error);
    const auto invalidWindowPath = invalidWindowDirectory / L"window-state-v2.json";
    WriteText(invalidWindowPath, R"({"schemaVersion":1})");
    SettingsStore invalidWindow(invalidWindowDirectory);
    Expect(invalidWindow.LoadWindowState() == WindowState{} &&
               !std::filesystem::exists(invalidWindowPath) &&
               HasInvalidCopy(invalidWindowPath),
           "invalid window state v2 must be isolated and reset to defaults");

    const auto transactionDirectory = testDirectory / L"transactions";
    std::filesystem::create_directories(transactionDirectory, error);
    SettingsStore transactions(transactionDirectory);
    Settings preview = transactions.Current();
    preview.glass.opacity = 50;
    transactions.BeginPreview(L"transaction-preview");
    Expect(transactions.Preview(L"transaction-preview", preview),
           "valid settings preview must be accepted");
    Settings invalidPreview = preview;
    invalidPreview.glass.opacity = 33;
    Expect(!transactions.Preview(L"transaction-preview", invalidPreview) &&
               transactions.Effective() == preview &&
               transactions.Cancel(L"transaction-preview") &&
               transactions.Effective() == transactions.Current(),
           "invalid preview must preserve its transaction until cancel rolls it back");

    transactions.BeginPreview(L"transaction-apply");
    Expect(transactions.Preview(L"transaction-apply", preview),
           "apply regression preview must be accepted");
    Expect(!transactions.Apply(L"transaction-apply", invalidPreview) &&
               transactions.Effective() == transactions.Current() &&
               !transactions.Cancel(L"transaction-apply"),
           "invalid apply must roll back and clear its settings transaction");

    const auto blocker = testDirectory / L"not-a-directory";
    std::ofstream(blocker).put('x');
    SettingsStore unwritable(blocker / L"child");
    Settings changed = unwritable.Current();
    changed.glass.opacity = 50;
    unwritable.BeginPreview(L"transaction-1");
    Expect(unwritable.Preview(L"transaction-1", changed), "settings preview must begin");
    Expect(!unwritable.Apply(L"transaction-1", changed), "failed settings writes must report failure");
    Expect(unwritable.Effective() == unwritable.Current(),
           "failed settings writes must roll back their preview");
  }
  std::filesystem::remove_all(testDirectory, error);
}

void TestMaterials() {
  using namespace lgt::composition;
  for (std::size_t index = 0; index < lgt::protocol::kFrostBlurDips.size(); ++index) {
    Expect(FrostBlurDips(static_cast<std::uint32_t>(index)) ==
               lgt::protocol::kFrostBlurDips[index],
           "every frost thickness must use its generated blur value");
    if (index == 0) continue;
    Expect(lgt::protocol::kFrostBlurDips[index - 1] <= lgt::protocol::kFrostBlurDips[index],
           "frost blur steps must remain ordered");
  }
  Expect(FrostBlurDips(0) == 0.0F && FrostBlurDips(10) == 30.0F &&
             FrostBlurDips(13) == 74.0F,
         "frost thickness must use the generated COSMIC-inspired table");
  Expect(ToneRgb(0) == 0x000000 && ToneRgb(92) == 0xEBEBEB &&
             ToneRgb(100) == 0xFFFFFF,
         "tone conversion must be deterministic grayscale");
  for (std::uint32_t tone = 0; tone <= 100; ++tone) {
    const auto channel = (tone * 255U + 50U) / 100U;
    Expect(ToneChannel(tone) == channel &&
               ToneRgb(tone) == ((channel << 16U) | (channel << 8U) | channel),
           "every tone must use the exact generated grayscale formula");
  }
  Expect(MaterialOpacity(0) == 0.0F && MaterialOpacity(100) == 1.0F &&
             OverlayOpacity(0) == 0.0F && OverlayOpacity(100) == 1.0F &&
             OverlayAdditionalOpacity(0) == 0.0F && OverlayAdditionalOpacity(100) == 0.0F,
         "zero opacity must remove every material contribution");
  Expect(std::abs(MaterialOpacity(35) - 0.35F) < 0.0001F &&
             std::abs(OverlayOpacity(35) - 0.413F) < 0.0001F,
         "overlay opacity must add eighteen percent proportionally");
  Expect(std::abs((1.0F - MaterialOpacity(35)) *
                      (1.0F - OverlayAdditionalOpacity(35)) -
                  (1.0F - OverlayOpacity(35))) < 0.0001F,
         "overlay tint must compose to the proportional target opacity");
  Expect(GrainOpacity(0) == 0.0F &&
             std::abs(GrainOpacity(100) - kMaximumGrainOpacity) < 0.0001F,
         "grain must map linearly to three percent alpha");
  Expect(MaterialGrainOpacity(100, 0) == 0.0F &&
             std::abs(MaterialGrainOpacity(100, 35) - kMaximumGrainOpacity * 0.35F) <
                 0.0001F &&
             std::abs(MaterialGrainOpacity(100, 100) - kMaximumGrainOpacity) < 0.0001F,
         "grain contribution must follow material opacity");
  Expect(!NeedsGrainSurface(0, 35) && !NeedsGrainSurface(1, 0) &&
             NeedsGrainSurface(1, 5) && NeedsGrainSurface(100, 100),
         "zero material or grain opacity must skip lazy noise allocation");
  Expect(!NeedsExtendedDwmFrame(true, 0) && NeedsExtendedDwmFrame(true, 5) &&
             NeedsExtendedDwmFrame(true, 100) && NeedsExtendedDwmFrame(false, 0),
         "only zero-opacity Glass must remove the extended DWM frame");
}

void TestWindowMetrics() {
  using namespace lgt::window;
  const RECT client{0, 0, 1200, 900};
  for (const UINT dpi : {96U, 120U, 144U, 192U}) {
    const int control = DipPixels(kCaptionButtonWidthDip, dpi);
    const int chrome = DipPixels(kTitlebarHeightDip, dpi);
    Expect(CaptionButtonAtPoint({client.right - 1, chrome / 2}, client, dpi, false) ==
               CaptionButton::Close,
           "rightmost caption button must be close at every DPI");
    Expect(CaptionButtonAtPoint({client.right - control - 1, chrome / 2}, client, dpi,
                                false) == CaptionButton::Maximize,
           "middle caption button must be maximize at every DPI");
    Expect(CaptionButtonAtPoint({client.right - control * 2 - 1, chrome / 2}, client, dpi,
                                false) == CaptionButton::Minimize,
           "left caption button must be minimize at every DPI");
    Expect(CaptionButtonAtPoint({client.right - 1, chrome / 2}, client, dpi, true) ==
               CaptionButton::None,
           "fullscreen must remove native caption hit targets");
  }
  const RECT webBounds{17, 29, 1117, 829};
  const POINT local = ClientPointToWebView({117, 229}, webBounds);
  Expect(local.x == 100 && local.y == 200,
         "native client points must only subtract the WebView origin");
  Expect(std::abs(CssPixelsToClient(40.0F, 144, 1.5) - 90.0F) < 0.01F,
         "CSS geometry must apply DPI and WebView zoom exactly once");
}

void TestClipboardLimits() {
  using lgt::platform::ClipboardService;
  Expect(ClipboardService::WithinLimit(L""), "empty clipboard text is valid");
  Expect(ClipboardService::WithinLimit(L"日本語"), "UTF-8 clipboard text is valid");
  const std::wstring invalid(1, static_cast<wchar_t>(0xD800));
  Expect(!ClipboardService::WithinLimit(invalid), "invalid UTF-16 must be rejected");
  Expect(!ClipboardService::WithinLimit(std::wstring(1'048'577, L'a')),
         "clipboard text above one MiB must be rejected");
}

void TestDropQuoting() {
  wchar_t directory[MAX_PATH]{};
  const DWORD length = GetTempPathW(ARRAYSIZE(directory), directory);
  Expect(length > 0 && length < ARRAYSIZE(directory), "temporary directory is available");
  if (length == 0 || length >= ARRAYSIZE(directory)) return;
  const auto quotedPath = std::filesystem::path(directory) / L"lgt-'quote.txt";
  const auto percentPath = std::filesystem::path(directory) / L"lgt-%unsafe.txt";
  for (const auto& path : {quotedPath, percentPath}) {
    HANDLE file = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS,
                              FILE_ATTRIBUTE_TEMPORARY, nullptr);
    if (file != INVALID_HANDLE_VALUE) CloseHandle(file);
  }
  const auto powershell =
      lgt::platform::FileDropTarget::Quote(quotedPath, lgt::platform::ShellKind::PowerShell);
  Expect(powershell && powershell->find(L"''") != std::wstring::npos,
         "PowerShell paths must double single quotes");
  Expect(!lgt::platform::FileDropTarget::Quote(percentPath,
                                               lgt::platform::ShellKind::CommandPrompt),
         "cmd paths with expansion markers must be rejected");
  DeleteFileW(quotedPath.c_str());
  DeleteFileW(percentPath.c_str());
}

void TestConPty() {
  std::mutex mutex;
  std::condition_variable ready;
  std::string output;
  lgt::terminal::ConPtySession session(nullptr);
  const bool started = session.Start(80, 24, [&](std::span<const std::byte> bytes) {
    {
      std::scoped_lock lock(mutex);
      output.append(reinterpret_cast<const char*>(bytes.data()), bytes.size());
    }
    ready.notify_all();
    return true;
  });
  Expect(started, "ConPTY must start a trusted system shell");
  if (!started) return;
  {
    std::unique_lock lock(mutex);
    ready.wait_for(lock, std::chrono::seconds(5), [&] {
      return output.find("> ") != std::string::npos;
    });
  }
  constexpr std::string_view command = "echo __LGT_CONPTY_OK__\rexit\r";
  const auto bytes = std::span(reinterpret_cast<const std::byte*>(command.data()), command.size());
  Expect(session.Write(bytes), "ConPTY input write must be accepted");
  {
    std::unique_lock lock(mutex);
    ready.wait_for(lock, std::chrono::seconds(8), [&] {
      const auto first = output.find("__LGT_CONPTY_OK__");
      return first != std::string::npos &&
             output.find("__LGT_CONPTY_OK__", first + 1) != std::string::npos;
    });
    const auto first = output.find("__LGT_CONPTY_OK__");
    const bool complete = first != std::string::npos &&
                          output.find("__LGT_CONPTY_OK__", first + 1) != std::string::npos;
    if (!complete) std::cerr << "ConPTY output: " << output << '\n';
    Expect(complete, "ConPTY must echo input and return shell output");
  }
  session.Close();
}

}  // namespace

int main() {
  winrt::init_apartment(winrt::apartment_type::single_threaded);
  TestSettings();
  TestMaterials();
  TestWindowMetrics();
  TestClipboardLimits();
  TestDropQuoting();
  wchar_t nativeTests[8]{};
  if (GetEnvironmentVariableW(L"LGT_NATIVE_TESTS", nativeTests, ARRAYSIZE(nativeTests)) > 0) {
    TestConPty();
  }
  if (failures == 0) std::cout << "Native core tests passed.\n";
  return failures == 0 ? EXIT_SUCCESS : EXIT_FAILURE;
}
