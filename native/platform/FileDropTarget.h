#pragma once

#include <windows.h>
#include <oleidl.h>
#include <wrl.h>

#include <filesystem>
#include <functional>
#include <optional>
#include <string>

namespace lgt::platform {

enum class ShellKind { PowerShell, CommandPrompt };

class FileDropTarget final
    : public Microsoft::WRL::RuntimeClass<Microsoft::WRL::RuntimeClassFlags<Microsoft::WRL::ClassicCom>,
                                          IDropTarget> {
 public:
  using DropCallback = std::function<void(std::wstring)>;

  FileDropTarget(ShellKind shell, DropCallback callback);

  void SetShell(ShellKind shell) noexcept;
  static std::optional<std::wstring> Quote(const std::filesystem::path& path, ShellKind shell);

  HRESULT STDMETHODCALLTYPE DragEnter(IDataObject* data, DWORD keyState, POINTL point,
                                      DWORD* effect) override;
  HRESULT STDMETHODCALLTYPE DragOver(DWORD keyState, POINTL point, DWORD* effect) override;
  HRESULT STDMETHODCALLTYPE DragLeave() override;
  HRESULT STDMETHODCALLTYPE Drop(IDataObject* data, DWORD keyState, POINTL point,
                                 DWORD* effect) override;

 private:
  static std::optional<std::filesystem::path> SinglePath(IDataObject* data);

  ShellKind shell_;
  DropCallback callback_;
  bool acceptable_ = false;
};

}  // namespace lgt::platform
