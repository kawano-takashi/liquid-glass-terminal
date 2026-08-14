#include "terminal/ConPtySession.h"

#include <shlobj.h>
#include <userenv.h>

#include <array>
#include <memory>
#include <string>

#include <winrt/base.h>

namespace lgt::terminal {
namespace {

bool RegularExecutable(const std::filesystem::path& path) {
  std::error_code error;
  return std::filesystem::is_regular_file(path, error) &&
         (GetFileAttributesW(path.c_str()) & FILE_ATTRIBUTE_REPARSE_POINT) == 0;
}

std::filesystem::path KnownFolder(REFKNOWNFOLDERID id) {
  PWSTR raw = nullptr;
  if (FAILED(SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, nullptr, &raw))) return {};
  std::filesystem::path result(raw);
  CoTaskMemFree(raw);
  return result;
}

void CloseHandleIf(HANDLE& handle) noexcept {
  if (handle) {
    CloseHandle(handle);
    handle = nullptr;
  }
}

}  // namespace

ConPtySession::ConPtySession(HWND notificationWindow) : notificationWindow_(notificationWindow) {}

ConPtySession::~ConPtySession() { Close(); }

void ConPtySession::SetNotificationWindow(HWND notificationWindow) noexcept {
  notificationWindow_.store(notificationWindow, std::memory_order_release);
}

std::optional<ConPtySession::ShellSelection> ConPtySession::SelectShell() {
  std::wstring windows(MAX_PATH, L'\0');
  const UINT length = GetWindowsDirectoryW(windows.data(), static_cast<UINT>(windows.size()));
  if (length == 0 || length >= windows.size()) return std::nullopt;
  windows.resize(length);
  const auto programFiles = KnownFolder(FOLDERID_ProgramFiles);
  const auto pwsh = programFiles / L"PowerShell" / L"7" / L"pwsh.exe";
  if (RegularExecutable(pwsh)) {
    return ShellSelection{pwsh, L"-NoLogo", platform::ShellKind::PowerShell};
  }
  const auto powershell = std::filesystem::path(windows) / L"System32" / L"WindowsPowerShell" /
                          L"v1.0" / L"powershell.exe";
  if (RegularExecutable(powershell)) {
    return ShellSelection{powershell, L"-NoLogo", platform::ShellKind::PowerShell};
  }
  const auto command = std::filesystem::path(windows) / L"System32" / L"cmd.exe";
  if (RegularExecutable(command)) {
    return ShellSelection{command, L"/d /v:off", platform::ShellKind::CommandPrompt};
  }
  return std::nullopt;
}

std::filesystem::path ConPtySession::InitialDirectory() {
  const auto profile = KnownFolder(FOLDERID_Profile);
  std::error_code error;
  if (std::filesystem::is_directory(profile, error)) return profile;
  wchar_t drive[16]{};
  const DWORD length = GetEnvironmentVariableW(L"SystemDrive", drive, ARRAYSIZE(drive));
  if (length > 0 && length < ARRAYSIZE(drive)) return std::wstring(drive) + L"\\";
  return L"C:\\";
}

bool ConPtySession::Start(short columns, short rows, OutputCallback output) {
  Close();
  const auto shell = SelectShell();
  if (!shell) return false;
  executable_ = shell->executable;
  shellKind_ = shell->kind;
  outputCallback_ = std::move(output);
  closing_ = false;

  HANDLE inputRead = nullptr;
  HANDLE outputWrite = nullptr;
  if (!CreatePipe(&inputRead, &inputWrite_, nullptr, 0) ||
      !CreatePipe(&outputRead_, &outputWrite, nullptr, 0)) {
    CloseHandleIf(inputRead);
    CloseHandleIf(outputWrite);
    Close();
    return false;
  }
  const COORD size{std::max<short>(2, columns), std::max<short>(1, rows)};
  HRESULT created = CreatePseudoConsole(size, inputRead, outputWrite, 0, &pseudoConsole_);
  if (FAILED(created)) {
    CloseHandleIf(inputRead);
    CloseHandleIf(outputWrite);
    Close();
    return false;
  }

  SIZE_T attributeBytes = 0;
  InitializeProcThreadAttributeList(nullptr, 1, 0, &attributeBytes);
  auto attributes = std::make_unique<std::byte[]>(attributeBytes);
  auto* list = reinterpret_cast<PPROC_THREAD_ATTRIBUTE_LIST>(attributes.get());
  if (!InitializeProcThreadAttributeList(list, 1, 0, &attributeBytes) ||
      !UpdateProcThreadAttribute(list, 0, PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,
                                 pseudoConsole_, sizeof(pseudoConsole_), nullptr, nullptr)) {
    DeleteProcThreadAttributeList(list);
    CloseHandleIf(inputRead);
    CloseHandleIf(outputWrite);
    Close();
    return false;
  }
  STARTUPINFOEXW startup{};
  startup.StartupInfo.cb = sizeof(startup);
  startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
  startup.StartupInfo.hStdInput = nullptr;
  startup.StartupInfo.hStdOutput = nullptr;
  startup.StartupInfo.hStdError = nullptr;
  startup.lpAttributeList = list;
  PROCESS_INFORMATION process{};
  std::wstring commandLine = L"\"" + shell->executable.wstring() + L"\" " + shell->arguments;
  const auto directory = InitialDirectory();
  const BOOL launched = CreateProcessW(
      shell->executable.c_str(), commandLine.data(), nullptr, nullptr, FALSE,
      EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT | CREATE_SUSPENDED, nullptr,
      directory.c_str(), &startup.StartupInfo, &process);
  DeleteProcThreadAttributeList(list);
  CloseHandleIf(inputRead);
  CloseHandleIf(outputWrite);
  if (!launched) {
    Close();
    return false;
  }
  process_ = process.hProcess;
  processThread_ = process.hThread;
  job_ = CreateJobObjectW(nullptr, nullptr);
  if (!job_) {
    TerminateProcess(process_, ERROR_NOT_ENOUGH_MEMORY);
    Close();
    return false;
  }
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if (!SetInformationJobObject(job_, JobObjectExtendedLimitInformation, &limits, sizeof(limits)) ||
      !AssignProcessToJobObject(job_, process_)) {
    TerminateProcess(process_, ERROR_ACCESS_DENIED);
    Close();
    return false;
  }
  if (ResumeThread(processThread_) == static_cast<DWORD>(-1)) {
    TerminateProcess(process_, GetLastError());
    Close();
    return false;
  }
  reader_ = std::jthread([this](std::stop_token stop) { ReadLoop(stop); });
  writer_ = std::jthread([this](std::stop_token stop) { WriteLoop(stop); });
  waiter_ = std::jthread([this](std::stop_token stop) { WaitLoop(stop); });
  return true;
}

void ConPtySession::Resize(short columns, short rows) noexcept {
  if (pseudoConsole_) ResizePseudoConsole(pseudoConsole_, {std::max<short>(2, columns),
                                                           std::max<short>(1, rows)});
}

bool ConPtySession::Write(std::span<const std::byte> bytes) {
  if (bytes.empty()) return true;
  std::scoped_lock lock(mutex_);
  if (closing_ || !inputWrite_) return false;
  inputQueue_.emplace_back(bytes.begin(), bytes.end());
  inputReady_.notify_one();
  return true;
}

void ConPtySession::ReadLoop(std::stop_token stop) {
  std::array<std::byte, 64 * 1024> buffer{};
  while (!stop.stop_requested()) {
    DWORD bytes = 0;
    if (!ReadFile(outputRead_, buffer.data(), static_cast<DWORD>(buffer.size()), &bytes, nullptr) ||
        bytes == 0) break;
    if (outputCallback_ && !outputCallback_(std::span(buffer.data(), bytes))) break;
  }
}

void ConPtySession::WriteLoop(std::stop_token stop) {
  while (!stop.stop_requested()) {
    std::vector<std::byte> value;
    {
      std::unique_lock lock(mutex_);
      inputReady_.wait(lock, stop, [this] { return closing_ || !inputQueue_.empty(); });
      if (closing_ || stop.stop_requested()) break;
      value = std::move(inputQueue_.front());
      inputQueue_.pop_front();
    }
    std::size_t offset = 0;
    while (offset < value.size() && !stop.stop_requested()) {
      DWORD written = 0;
      if (!WriteFile(inputWrite_, value.data() + offset,
                     static_cast<DWORD>(value.size() - offset), &written, nullptr) || written == 0) {
        return;
      }
      offset += written;
    }
  }
}

void ConPtySession::WaitLoop(std::stop_token stop) {
  while (!stop.stop_requested() && process_) {
    const DWORD wait = WaitForSingleObject(process_, 200);
    if (wait == WAIT_OBJECT_0) {
      DWORD exitCode = 0;
      GetExitCodeProcess(process_, &exitCode);
      PostMessageW(notificationWindow_.load(std::memory_order_acquire), kTerminalExitedMessage,
                   exitCode, 0);
      return;
    }
    if (wait == WAIT_FAILED) return;
  }
}

void ConPtySession::Close() noexcept {
  {
    std::scoped_lock lock(mutex_);
    closing_ = true;
    inputQueue_.clear();
  }
  inputReady_.notify_all();
  writer_.request_stop();
  reader_.request_stop();
  waiter_.request_stop();
  CloseHandleIf(inputWrite_);
  if (process_ && WaitForSingleObject(process_, 2000) != WAIT_OBJECT_0) {
    if (job_) CloseHandleIf(job_);
    else TerminateProcess(process_, ERROR_CANCELLED);
  }
  if (pseudoConsole_) {
    ClosePseudoConsole(pseudoConsole_);
    pseudoConsole_ = nullptr;
  }
  CloseHandleIf(outputRead_);
  reader_ = {};
  writer_ = {};
  waiter_ = {};
  CloseHandleIf(processThread_);
  CloseHandleIf(process_);
  CloseHandleIf(job_);
  outputCallback_ = {};
}

bool ConPtySession::Running() const noexcept {
  return process_ && WaitForSingleObject(process_, 0) == WAIT_TIMEOUT;
}

platform::ShellKind ConPtySession::Shell() const noexcept { return shellKind_; }

const std::filesystem::path& ConPtySession::Executable() const noexcept { return executable_; }

}  // namespace lgt::terminal
