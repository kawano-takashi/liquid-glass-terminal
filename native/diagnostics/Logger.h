#pragma once

#include <filesystem>
#include <mutex>
#include <string_view>

namespace lgt::diagnostics {

enum class Level { Info, Warning, Error };

class Logger final {
 public:
  explicit Logger(const std::filesystem::path& dataDirectory);

  void Write(Level level, std::wstring_view event, long code = 0) noexcept;

 private:
  void Rotate() noexcept;

  std::filesystem::path path_;
  std::mutex mutex_;
};

}  // namespace lgt::diagnostics
