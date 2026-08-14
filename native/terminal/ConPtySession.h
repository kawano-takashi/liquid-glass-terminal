#pragma once

#include <windows.h>

#include <atomic>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <deque>
#include <filesystem>
#include <functional>
#include <mutex>
#include <span>
#include <thread>
#include <vector>

#include "platform/FileDropTarget.h"

namespace lgt::terminal {

inline constexpr UINT kTerminalExitedMessage = WM_APP + 0x31;

class ConPtySession final {
 public:
  using OutputCallback = std::function<bool(std::span<const std::byte>)>;

  explicit ConPtySession(HWND notificationWindow);
  ~ConPtySession();

  ConPtySession(const ConPtySession&) = delete;
  ConPtySession& operator=(const ConPtySession&) = delete;

  bool Start(short columns, short rows, OutputCallback output);
  void SetNotificationWindow(HWND notificationWindow) noexcept;
  void Resize(short columns, short rows) noexcept;
  bool Write(std::span<const std::byte> bytes);
  void Close() noexcept;

  [[nodiscard]] bool Running() const noexcept;
  [[nodiscard]] platform::ShellKind Shell() const noexcept;
  [[nodiscard]] const std::filesystem::path& Executable() const noexcept;

 private:
  struct ShellSelection {
    std::filesystem::path executable;
    std::wstring arguments;
    platform::ShellKind kind;
  };

  static std::optional<ShellSelection> SelectShell();
  static std::filesystem::path InitialDirectory();
  void ReadLoop(std::stop_token stop);
  void WriteLoop(std::stop_token stop);
  void WaitLoop(std::stop_token stop);

  std::atomic<HWND> notificationWindow_{nullptr};
  HPCON pseudoConsole_ = nullptr;
  HANDLE inputWrite_ = nullptr;
  HANDLE outputRead_ = nullptr;
  HANDLE process_ = nullptr;
  HANDLE processThread_ = nullptr;
  HANDLE job_ = nullptr;
  std::filesystem::path executable_;
  platform::ShellKind shellKind_ = platform::ShellKind::PowerShell;
  OutputCallback outputCallback_;
  std::jthread reader_;
  std::jthread writer_;
  std::jthread waiter_;
  mutable std::mutex mutex_;
  std::condition_variable_any inputReady_;
  std::deque<std::vector<std::byte>> inputQueue_;
  bool closing_ = false;
};

}  // namespace lgt::terminal
