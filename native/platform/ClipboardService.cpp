#include "platform/ClipboardService.h"

#include "contracts/generated/Protocol.generated.h"

#include <memory>

namespace lgt::platform {
namespace {

class ClipboardGuard {
 public:
  explicit ClipboardGuard(HWND owner) : open_(OpenClipboard(owner) != FALSE) {}
  ~ClipboardGuard() {
    if (open_) CloseClipboard();
  }
  [[nodiscard]] bool Open() const noexcept { return open_; }

 private:
  bool open_;
};

}  // namespace

bool ClipboardService::WithinLimit(std::wstring_view text) noexcept {
  if (text.size() > protocol::kMaxClipboardBytes) return false;
  const int bytes = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, text.data(),
                                        static_cast<int>(text.size()), nullptr, 0, nullptr, nullptr);
  return (text.empty() || bytes > 0) &&
         static_cast<std::size_t>(bytes) <= protocol::kMaxClipboardBytes;
}

std::optional<std::wstring> ClipboardService::ReadText() const {
  ClipboardGuard guard(owner_);
  if (!guard.Open()) return std::nullopt;
  HANDLE handle = GetClipboardData(CF_UNICODETEXT);
  if (!handle) return std::wstring{};
  const auto* text = static_cast<const wchar_t*>(GlobalLock(handle));
  if (!text) return std::nullopt;
  const std::size_t capacity = GlobalSize(handle) / sizeof(wchar_t);
  const std::size_t length = wcsnlen_s(text, capacity);
  if (length == capacity) {
    GlobalUnlock(handle);
    return std::nullopt;
  }
  std::wstring result(text, length);
  GlobalUnlock(handle);
  if (!WithinLimit(result)) return std::nullopt;
  return result;
}

bool ClipboardService::WriteText(std::wstring_view text) const {
  if (!WithinLimit(text)) return false;
  ClipboardGuard guard(owner_);
  if (!guard.Open() || !EmptyClipboard()) return false;
  const SIZE_T bytes = (text.size() + 1) * sizeof(wchar_t);
  HGLOBAL memory = GlobalAlloc(GMEM_MOVEABLE, bytes);
  if (!memory) return false;
  void* target = GlobalLock(memory);
  if (!target) {
    GlobalFree(memory);
    return false;
  }
  memcpy(target, text.data(), text.size() * sizeof(wchar_t));
  static_cast<wchar_t*>(target)[text.size()] = L'\0';
  GlobalUnlock(memory);
  if (!SetClipboardData(CF_UNICODETEXT, memory)) {
    GlobalFree(memory);
    return false;
  }
  return true;
}

}  // namespace lgt::platform
