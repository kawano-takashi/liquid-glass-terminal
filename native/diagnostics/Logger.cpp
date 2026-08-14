#include "diagnostics/Logger.h"

#include <windows.h>

#include <array>
#include <chrono>
#include <fstream>
#include <iomanip>
#include <sstream>

namespace lgt::diagnostics {
namespace {

constexpr std::uintmax_t kMaxLogBytes = 2U * 1024U * 1024U;
constexpr int kLogFiles = 5;

std::wstring_view Name(Level level) noexcept {
  switch (level) {
    case Level::Info:
      return L"info";
    case Level::Warning:
      return L"warning";
    case Level::Error:
      return L"error";
  }
  return L"unknown";
}

}  // namespace

Logger::Logger(const std::filesystem::path& dataDirectory) : path_(dataDirectory / L"logs" / L"app.log") {
  std::error_code error;
  std::filesystem::create_directories(path_.parent_path(), error);
  Rotate();
}

void Logger::Rotate() noexcept {
  std::error_code error;
  if (!std::filesystem::exists(path_, error) ||
      std::filesystem::file_size(path_, error) < kMaxLogBytes) {
    return;
  }
  std::filesystem::remove(path_.wstring() + L".5", error);
  for (int index = kLogFiles - 1; index >= 1; --index) {
    const auto source = path_.wstring() + L"." + std::to_wstring(index);
    const auto destination = path_.wstring() + L"." + std::to_wstring(index + 1);
    if (std::filesystem::exists(source, error)) std::filesystem::rename(source, destination, error);
  }
  std::filesystem::rename(path_, path_.wstring() + L".1", error);
}

void Logger::Write(Level level, std::wstring_view event, long code) noexcept {
  std::scoped_lock lock(mutex_);
  Rotate();
  SYSTEMTIME now{};
  GetSystemTime(&now);
  std::wofstream output(path_, std::ios::app);
  if (!output) return;
  output << std::setfill(L'0') << now.wYear << L'-' << std::setw(2) << now.wMonth << L'-'
         << std::setw(2) << now.wDay << L'T' << std::setw(2) << now.wHour << L':'
         << std::setw(2) << now.wMinute << L':' << std::setw(2) << now.wSecond << L'.'
         << std::setw(3) << now.wMilliseconds << L'Z' << L" level=" << Name(level)
         << L" event=" << event;
  if (code != 0) output << L" code=" << code;
  output << L'\n';
}

}  // namespace lgt::diagnostics
