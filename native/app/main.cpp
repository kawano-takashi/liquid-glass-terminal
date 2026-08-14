#include "app/Application.h"

#include <commctrl.h>
#include <ole2.h>
#include <windows.h>

#include <winrt/base.h>

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int showCommand) {
  SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX);
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  winrt::init_apartment(winrt::apartment_type::single_threaded);
  const HRESULT ole = OleInitialize(nullptr);
  INITCOMMONCONTROLSEX controls{sizeof(controls), ICC_STANDARD_CLASSES};
  InitCommonControlsEx(&controls);
  int result = 1;
  try {
    lgt::app::Application application(instance);
    result = application.Run(showCommand);
  } catch (const winrt::hresult_error& error) {
    MessageBoxW(nullptr, error.message().c_str(), L"Liquid Glass Terminal", MB_OK | MB_ICONERROR);
  } catch (...) {
    MessageBoxW(nullptr, L"Liquid Glass Terminal could not start.", L"Liquid Glass Terminal",
                MB_OK | MB_ICONERROR);
  }
  if (SUCCEEDED(ole)) OleUninitialize();
  return result;
}
