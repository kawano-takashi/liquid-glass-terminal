#pragma once

#include <windows.h>
#include <unknwn.h>
#include <wrl.h>

#include <array>
#include <atomic>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <deque>
#include <functional>
#include <mutex>
#include <span>
#include <vector>

#include <WebView2.h>

#include "webview/WebViewHost.h"

namespace lgt::terminal {

inline constexpr UINT kOutputAvailableMessage = WM_APP + 0x32;

struct BufferCommit {
  std::uint32_t buffer = 0;
  std::uint32_t generation = 0;
  std::uint32_t sequence = 0;
  std::uint32_t length = 0;
};

class SharedBufferTransport final {
 public:
  using InputCallback = std::function<void(std::span<const std::byte>)>;

  explicit SharedBufferTransport(HWND notificationWindow);
  ~SharedBufferTransport();

  bool Attach(webview::WebViewHost& host, InputCallback input);
  void SetNotificationWindow(HWND notificationWindow) noexcept;
  void PauseForRecovery();
  void Close() noexcept;
  bool PublishOutput(std::span<const std::byte> bytes);
  void DrainOutput();
  bool AcknowledgeOutput(const BufferCommit& commit);
  bool CommitInput(const BufferCommit& commit);

  [[nodiscard]] std::size_t BufferedBytes() const noexcept;
  [[nodiscard]] std::uint32_t Generation() const noexcept;

 private:
  struct SharedSlot {
    Microsoft::WRL::ComPtr<ICoreWebView2SharedBuffer> buffer;
    BYTE* bytes = nullptr;
    bool inFlight = false;
    BufferCommit commit{};
  };

  void ReleaseBuffers() noexcept;
  bool CreateAndAttachBuffers();
  std::wstring AttachmentJson(std::wstring_view direction, std::size_t index) const;
  static std::wstring CommitJson(std::wstring_view type, const BufferCommit& commit);

  std::atomic<HWND> notificationWindow_{nullptr};
  webview::WebViewHost* host_ = nullptr;
  InputCallback inputCallback_;
  Microsoft::WRL::ComPtr<ICoreWebView2Environment12> environment_;
  std::array<SharedSlot, 4> output_{};
  std::array<SharedSlot, 2> input_{};
  mutable std::mutex mutex_;
  std::condition_variable capacityChanged_;
  std::deque<std::vector<std::byte>> outputQueue_;
  std::size_t bufferedBytes_ = 0;
  std::size_t droppedBytes_ = 0;
  std::uint32_t generation_ = 1;
  std::uint32_t outputSequence_ = 1;
  std::uint32_t inputSequence_ = 0;
  bool attached_ = false;
  bool recovering_ = false;
  bool closing_ = false;
};

}  // namespace lgt::terminal
