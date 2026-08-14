#include "terminal/SharedBufferTransport.h"

#include "contracts/generated/Protocol.generated.h"

#include <algorithm>
#include <cstring>
#include <sstream>

namespace lgt::terminal {

SharedBufferTransport::SharedBufferTransport(HWND notificationWindow)
    : notificationWindow_(notificationWindow) {}

SharedBufferTransport::~SharedBufferTransport() { Close(); }

void SharedBufferTransport::SetNotificationWindow(HWND notificationWindow) noexcept {
  notificationWindow_.store(notificationWindow, std::memory_order_release);
}

bool SharedBufferTransport::Attach(webview::WebViewHost& host, InputCallback input) {
  std::scoped_lock lock(mutex_);
  host_ = &host;
  inputCallback_ = std::move(input);
  environment_.Reset();
  if (!host.Environment() || FAILED(host.Environment()->QueryInterface(IID_PPV_ARGS(&environment_)))) {
    return false;
  }
  ReleaseBuffers();
  if (!CreateAndAttachBuffers()) {
    ReleaseBuffers();
    return false;
  }
  attached_ = true;
  if (recovering_) {
    std::wostringstream json;
    json << L"{\"v\":1,\"type\":\"terminal.recovered\",\"payload\":{\"generation\":"
         << generation_ << L",\"droppedBytes\":" << droppedBytes_ << L"}}";
    host_->PostJson(json.str());
    recovering_ = false;
    droppedBytes_ = 0;
  }
  PostMessageW(notificationWindow_.load(std::memory_order_acquire), kOutputAvailableMessage, 0, 0);
  return true;
}

void SharedBufferTransport::PauseForRecovery() {
  std::scoped_lock lock(mutex_);
  attached_ = false;
  host_ = nullptr;
  for (auto& slot : output_) {
    if (slot.inFlight) {
      droppedBytes_ += slot.commit.length;
      bufferedBytes_ = bufferedBytes_ >= slot.commit.length
                           ? bufferedBytes_ - slot.commit.length
                           : 0;
      slot.inFlight = false;
    }
  }
  ReleaseBuffers();
  ++generation_;
  if (generation_ == 0) generation_ = 1;
  inputSequence_ = 0;
  recovering_ = true;
  capacityChanged_.notify_all();
}

void SharedBufferTransport::Close() noexcept {
  {
    std::scoped_lock lock(mutex_);
    closing_ = true;
    attached_ = false;
    host_ = nullptr;
    inputCallback_ = {};
    outputQueue_.clear();
    bufferedBytes_ = 0;
    ReleaseBuffers();
    environment_.Reset();
  }
  capacityChanged_.notify_all();
}

bool SharedBufferTransport::CreateAndAttachBuffers() {
  if (!environment_ || !host_) return false;
  auto create = [&](SharedSlot& slot, std::wstring_view direction, std::size_t index,
                    COREWEBVIEW2_SHARED_BUFFER_ACCESS access) {
    if (FAILED(environment_->CreateSharedBuffer(protocol::kTerminalChunkBytes, &slot.buffer)) ||
        FAILED(slot.buffer->get_Buffer(&slot.bytes))) {
      return false;
    }
    return SUCCEEDED(host_->PostSharedBuffer(slot.buffer.Get(), access,
                                              AttachmentJson(direction, index)));
  };
  for (std::size_t index = 0; index < output_.size(); ++index) {
    if (!create(output_[index], L"output", index, COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_ONLY)) {
      return false;
    }
  }
  for (std::size_t index = 0; index < input_.size(); ++index) {
    if (!create(input_[index], L"input", index, COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_WRITE)) {
      return false;
    }
  }
  return true;
}

void SharedBufferTransport::ReleaseBuffers() noexcept {
  auto release = [](auto& slots) {
    for (auto& slot : slots) {
      if (slot.buffer) slot.buffer->Close();
      slot.buffer.Reset();
      slot.bytes = nullptr;
      slot.inFlight = false;
      slot.commit = {};
    }
  };
  release(output_);
  release(input_);
}

bool SharedBufferTransport::PublishOutput(std::span<const std::byte> bytes) {
  std::size_t offset = 0;
  while (offset < bytes.size()) {
    const std::size_t length = std::min(protocol::kTerminalChunkBytes, bytes.size() - offset);
    std::unique_lock lock(mutex_);
    capacityChanged_.wait(lock, [this, length] {
      return closing_ || bufferedBytes_ + length <= protocol::kTerminalPauseBytes;
    });
    if (closing_) return false;
    outputQueue_.emplace_back(bytes.begin() + static_cast<std::ptrdiff_t>(offset),
                              bytes.begin() + static_cast<std::ptrdiff_t>(offset + length));
    bufferedBytes_ += length;
    offset += length;
    lock.unlock();
    PostMessageW(notificationWindow_.load(std::memory_order_acquire), kOutputAvailableMessage, 0,
                 0);
  }
  return true;
}

void SharedBufferTransport::DrainOutput() {
  std::scoped_lock lock(mutex_);
  if (!attached_ || !host_) return;
  for (std::size_t index = 0; index < output_.size() && !outputQueue_.empty(); ++index) {
    auto& slot = output_[index];
    if (slot.inFlight || !slot.bytes) continue;
    auto chunk = std::move(outputQueue_.front());
    outputQueue_.pop_front();
    memcpy(slot.bytes, chunk.data(), chunk.size());
    slot.commit = {static_cast<std::uint32_t>(index), generation_, outputSequence_++,
                   static_cast<std::uint32_t>(chunk.size())};
    slot.inFlight = true;
    if (FAILED(host_->PostJson(CommitJson(L"terminal.output.ready", slot.commit)))) {
      slot.inFlight = false;
      slot.commit = {};
      outputQueue_.push_front(std::move(chunk));
      break;
    }
  }
}

bool SharedBufferTransport::AcknowledgeOutput(const BufferCommit& commit) {
  std::scoped_lock lock(mutex_);
  if (commit.buffer >= output_.size() || commit.generation != generation_) return false;
  auto& slot = output_[commit.buffer];
  if (!slot.inFlight || slot.commit.sequence != commit.sequence ||
      slot.commit.length != commit.length) {
    return false;
  }
  slot.inFlight = false;
  slot.commit = {};
  bufferedBytes_ = bufferedBytes_ >= commit.length ? bufferedBytes_ - commit.length : 0;
  if (bufferedBytes_ < protocol::kTerminalResumeBytes) capacityChanged_.notify_all();
  PostMessageW(notificationWindow_.load(std::memory_order_acquire), kOutputAvailableMessage, 0, 0);
  return true;
}

bool SharedBufferTransport::CommitInput(const BufferCommit& commit) {
  InputCallback callback;
  std::vector<std::byte> copy;
  {
    std::scoped_lock lock(mutex_);
    if (!attached_ || commit.buffer >= input_.size() || commit.generation != generation_ ||
        commit.sequence <= inputSequence_ || commit.length > protocol::kTerminalChunkBytes ||
        !input_[commit.buffer].bytes) {
      return false;
    }
    inputSequence_ = commit.sequence;
    const auto* begin = reinterpret_cast<const std::byte*>(input_[commit.buffer].bytes);
    copy.assign(begin, begin + commit.length);
    callback = inputCallback_;
  }
  if (callback) callback(copy);
  return true;
}

std::size_t SharedBufferTransport::BufferedBytes() const noexcept {
  std::scoped_lock lock(mutex_);
  return bufferedBytes_;
}

std::uint32_t SharedBufferTransport::Generation() const noexcept {
  std::scoped_lock lock(mutex_);
  return generation_;
}

std::wstring SharedBufferTransport::AttachmentJson(std::wstring_view direction,
                                                   std::size_t index) const {
  std::wostringstream json;
  json << L"{\"v\":1,\"type\":\"terminal.buffer.attach\",\"payload\":{\"direction\":\""
       << direction << L"\",\"buffer\":" << index << L",\"generation\":" << generation_
       << L",\"capacity\":" << protocol::kTerminalChunkBytes << L"}}";
  return json.str();
}

std::wstring SharedBufferTransport::CommitJson(std::wstring_view type,
                                               const BufferCommit& commit) {
  std::wostringstream json;
  json << L"{\"v\":1,\"type\":\"" << type << L"\",\"payload\":{\"buffer\":"
       << commit.buffer << L",\"generation\":" << commit.generation << L",\"sequence\":"
       << commit.sequence << L",\"length\":" << commit.length << L"}}";
  return json.str();
}

}  // namespace lgt::terminal
