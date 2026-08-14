#include <windows.h>

#include <chrono>
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

namespace {

int failures = 0;

void Expect(bool condition, std::string_view message) {
  if (condition) return;
  ++failures;
  std::cerr << "FAIL: " << message << '\n';
}

void TestSettings() {
  using namespace lgt::settings;
  Settings source;
  source.locale = Locale::Japanese;
  source.glassEnabled = false;
  source.preset = GlassPreset::Dense;
  source.tint = 0xABCDEF;
  source.foreground = Foreground::Dark;
  source.animations = false;
  source.uiScale = 140;
  const auto parsed = SettingsStore::Parse(SettingsStore::Serialize(source));
  Expect(parsed == source, "settings must round-trip exactly");
  Expect(!SettingsStore::Parse(
             LR"({"schemaVersion":1,"locale":"en","glass":{"enabled":true,"preset":"regular","tint":"#181818"},"foreground":"auto","animations":true,"uiScale":105})"),
         "settings must reject a scale outside the ten-percent step");
  Expect(!SettingsStore::Parse(
             LR"({"schemaVersion":1,"locale":"en","glass":{"enabled":true,"preset":"regular","tint":"#181818"},"foreground":"auto","animations":true,"uiScale":100,"extra":true})"),
         "settings must reject unknown fields");
  Expect(!SettingsStore::Parse(LR"({"schemaVersion":2})"),
         "settings must reject unknown schemas");

  const auto testDirectory = std::filesystem::temp_directory_path() /
                             (L"lgt-settings-test-" + std::to_wstring(GetCurrentProcessId()));
  std::error_code error;
  std::filesystem::remove_all(testDirectory, error);
  std::filesystem::create_directories(testDirectory, error);
  Expect(!error, "settings test directory must be created");
  if (!error) {
    SettingsStore persisted(testDirectory);
    Expect(persisted.Save(source), "settings must save atomically");
    SettingsStore reloaded(testDirectory);
    reloaded.Load();
    Expect(reloaded.Current() == source, "saved settings must reload exactly");

    const auto blocker = testDirectory / L"not-a-directory";
    std::ofstream(blocker).put('x');
    SettingsStore unwritable(blocker / L"child");
    Settings changed = unwritable.Current();
    changed.preset = GlassPreset::Dense;
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
  using lgt::settings::GlassPreset;
  Expect(&Material(GlassPreset::Clear) == &kClearMaterial, "clear material lookup");
  Expect(&Material(GlassPreset::Regular) == &kRegularMaterial, "regular material lookup");
  Expect(&Material(GlassPreset::Dense) == &kDenseMaterial, "dense material lookup");
  Expect(kClearMaterial.blurRadius < kRegularMaterial.blurRadius &&
             kRegularMaterial.blurRadius < kDenseMaterial.blurRadius,
         "blur presets must remain ordered");
  Expect(kClearMaterial.noiseOpacity < kRegularMaterial.noiseOpacity &&
             kRegularMaterial.noiseOpacity < kDenseMaterial.noiseOpacity,
         "noise presets must remain ordered");
  Expect(kClearMaterial.tintOpacity >= 0.62F &&
             kClearMaterial.tintOpacity < kRegularMaterial.tintOpacity &&
             kRegularMaterial.tintOpacity < kDenseMaterial.tintOpacity,
         "every material must retain readable tint coverage and remain ordered");
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
  TestClipboardLimits();
  TestDropQuoting();
  wchar_t nativeTests[8]{};
  if (GetEnvironmentVariableW(L"LGT_NATIVE_TESTS", nativeTests, ARRAYSIZE(nativeTests)) > 0) {
    TestConPty();
  }
  if (failures == 0) std::cout << "Native core tests passed.\n";
  return failures == 0 ? EXIT_SUCCESS : EXIT_FAILURE;
}
