#include "platform/FileDropTarget.h"

#include <shellapi.h>

namespace lgt::platform {

FileDropTarget::FileDropTarget(ShellKind shell, DropCallback callback)
    : shell_(shell), callback_(std::move(callback)) {}

void FileDropTarget::SetShell(ShellKind shell) noexcept { shell_ = shell; }

std::optional<std::wstring> FileDropTarget::Quote(const std::filesystem::path& path,
                                                  ShellKind shell) {
  std::error_code error;
  if (!std::filesystem::exists(path, error)) return std::nullopt;
  std::wstring rawPath = path.wstring();
  if (rawPath.empty() || rawPath.size() > 32768) return std::nullopt;
  if (shell == ShellKind::PowerShell) {
    std::wstring quoted = L"'";
    for (const wchar_t character : rawPath) {
      quoted += character;
      if (character == L'\'') quoted += L'\'';
    }
    quoted += L'\'';
    return quoted;
  }
  if (rawPath.find_first_of(L"%!") != std::wstring::npos) return std::nullopt;
  return L"\"" + rawPath + L"\"";
}

std::optional<std::filesystem::path> FileDropTarget::SinglePath(IDataObject* data) {
  if (!data) return std::nullopt;
  FORMATETC format{CF_HDROP, nullptr, DVASPECT_CONTENT, -1, TYMED_HGLOBAL};
  STGMEDIUM medium{};
  if (FAILED(data->GetData(&format, &medium))) return std::nullopt;
  const auto drop = static_cast<HDROP>(GlobalLock(medium.hGlobal));
  std::optional<std::filesystem::path> result;
  if (drop && DragQueryFileW(drop, 0xFFFFFFFF, nullptr, 0) == 1) {
    const UINT length = DragQueryFileW(drop, 0, nullptr, 0);
    std::wstring path(length + 1, L'\0');
    if (DragQueryFileW(drop, 0, path.data(), length + 1) == length) {
      path.resize(length);
      result = std::filesystem::path(path);
    }
  }
  if (drop) GlobalUnlock(medium.hGlobal);
  ReleaseStgMedium(&medium);
  return result;
}

HRESULT FileDropTarget::DragEnter(IDataObject* data, DWORD, POINTL, DWORD* effect) {
  acceptable_ = SinglePath(data).has_value();
  if (effect) *effect = acceptable_ ? DROPEFFECT_COPY : DROPEFFECT_NONE;
  return S_OK;
}

HRESULT FileDropTarget::DragOver(DWORD, POINTL, DWORD* effect) {
  if (effect) *effect = acceptable_ ? DROPEFFECT_COPY : DROPEFFECT_NONE;
  return S_OK;
}

HRESULT FileDropTarget::DragLeave() {
  acceptable_ = false;
  return S_OK;
}

HRESULT FileDropTarget::Drop(IDataObject* data, DWORD, POINTL, DWORD* effect) {
  const auto path = SinglePath(data);
  const auto quoted = path ? Quote(*path, shell_) : std::nullopt;
  acceptable_ = false;
  if (effect) *effect = quoted ? DROPEFFECT_COPY : DROPEFFECT_NONE;
  if (quoted && callback_) callback_(*quoted);
  return S_OK;
}

}  // namespace lgt::platform
