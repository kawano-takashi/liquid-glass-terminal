#include "window/NativeWindow.h"

#include "resources/resource.h"

#include <dwmapi.h>
#include <shellscalingapi.h>
#include <windowsx.h>

#include <algorithm>

namespace lgt::window {
namespace {

constexpr wchar_t kWindowClass[] = L"LiquidGlassTerminal.NativeWindow.0.3";
constexpr wchar_t kWindowTitle[] = L"Liquid Glass Terminal";
constexpr int kTitlebarDip = 44;
constexpr int kControlWidthDip = 46;
constexpr int kMinimumWidthDip = 480;
constexpr int kMinimumHeightDip = 320;

int Pixels(int dips, UINT dpi) { return MulDiv(dips, static_cast<int>(dpi), 96); }

BOOL CALLBACK FindIntersectingMonitor(HMONITOR monitor, HDC, LPRECT candidate, LPARAM state) {
  MONITORINFO info{sizeof(info)};
  if (!GetMonitorInfoW(monitor, &info)) return TRUE;
  RECT intersection{};
  if (IntersectRect(&intersection, candidate, &info.rcWork)) {
    *reinterpret_cast<bool*>(state) = true;
    return FALSE;
  }
  return TRUE;
}

}  // namespace

NativeWindow::NativeWindow(HINSTANCE instance, MessageHandler handler)
    : instance_(instance), handler_(std::move(handler)) {}

NativeWindow::~NativeWindow() {
  if (window_) DestroyWindow(window_);
}

bool NativeWindow::Create(const settings::WindowState& state, bool compositionMode) {
  compositionMode_ = compositionMode;
  WNDCLASSEXW windowClass{sizeof(windowClass)};
  windowClass.style = CS_HREDRAW | CS_VREDRAW | CS_DBLCLKS;
  windowClass.lpfnWndProc = WindowProcedure;
  windowClass.hInstance = instance_;
  windowClass.hIcon = LoadIconW(instance_, MAKEINTRESOURCEW(IDI_APP_ICON));
  windowClass.hCursor = LoadCursorW(nullptr, IDC_ARROW);
  windowClass.lpszClassName = kWindowClass;
  windowClass.hIconSm = windowClass.hIcon;
  if (!RegisterClassExW(&windowClass) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) return false;

  const RECT bounds = InitialBounds(state);
  const DWORD extended = compositionMode ? WS_EX_NOREDIRECTIONBITMAP : 0;
  window_ = CreateWindowExW(extended, kWindowClass, kWindowTitle, WS_OVERLAPPEDWINDOW,
                            bounds.left, bounds.top, bounds.right - bounds.left,
                            bounds.bottom - bounds.top, nullptr, nullptr, instance_, this);
  if (!window_) return false;
  dpi_ = GetDpiForWindow(window_);
  if (state.maximized) ShowWindow(window_, SW_MAXIMIZE);
  return true;
}

void NativeWindow::Show(int command) {
  if (!window_) return;
  if (!IsZoomed(window_)) ShowWindow(window_, command);
  UpdateWindow(window_);
  SetForegroundWindow(window_);
}

void NativeWindow::DestroyForRecreate() {
  if (!window_) return;
  suppressQuit_ = true;
  DestroyWindow(window_);
  window_ = nullptr;
  suppressQuit_ = false;
}

HWND NativeWindow::Handle() const noexcept { return window_; }
UINT NativeWindow::Dpi() const noexcept { return dpi_; }
bool NativeWindow::CompositionMode() const noexcept { return compositionMode_; }
bool NativeWindow::Fullscreen() const noexcept { return fullscreen_; }

RECT NativeWindow::InitialBounds(const settings::WindowState& state) const {
  const UINT dpi = GetDpiForSystem();
  RECT result{state.x, state.y, state.x + Pixels(state.width, dpi),
              state.y + Pixels(state.height, dpi)};
  bool intersects = state.x != 0 || state.y != 0;
  if (intersects) {
    intersects = false;
    EnumDisplayMonitors(nullptr, &result, FindIntersectingMonitor,
                        reinterpret_cast<LPARAM>(&intersects));
  }
  if (!intersects) {
    MONITORINFO monitor{sizeof(monitor)};
    GetMonitorInfoW(MonitorFromPoint({0, 0}, MONITOR_DEFAULTTOPRIMARY), &monitor);
    const int width = Pixels(state.width, dpi);
    const int height = Pixels(state.height, dpi);
    result.left = monitor.rcWork.left + (monitor.rcWork.right - monitor.rcWork.left - width) / 2;
    result.top = monitor.rcWork.top + (monitor.rcWork.bottom - monitor.rcWork.top - height) / 2;
    result.right = result.left + width;
    result.bottom = result.top + height;
  }
  return result;
}

settings::WindowState NativeWindow::CaptureState() const {
  settings::WindowState state;
  if (!window_) return state;
  WINDOWPLACEMENT placement{sizeof(placement)};
  if (!GetWindowPlacement(window_, &placement)) return state;
  const RECT bounds = placement.rcNormalPosition;
  state.x = bounds.left;
  state.y = bounds.top;
  state.width = MulDiv(bounds.right - bounds.left, 96, static_cast<int>(dpi_));
  state.height = MulDiv(bounds.bottom - bounds.top, 96, static_cast<int>(dpi_));
  state.maximized = IsZoomed(window_) != FALSE;
  return state;
}

RECT NativeWindow::WebViewBounds() const {
  RECT bounds{};
  if (!window_) return bounds;
  GetClientRect(window_, &bounds);
  bounds.top += Pixels(kTitlebarDip, dpi_);
  return bounds;
}

void NativeWindow::ToggleFullscreen() {
  if (fullscreen_) {
    ExitFullscreen();
    return;
  }
  savedStyle_ = GetWindowLongPtrW(window_, GWL_STYLE);
  savedPlacement_.length = sizeof(savedPlacement_);
  GetWindowPlacement(window_, &savedPlacement_);
  MONITORINFO monitor{sizeof(monitor)};
  GetMonitorInfoW(MonitorFromWindow(window_, MONITOR_DEFAULTTONEAREST), &monitor);
  SetWindowLongPtrW(window_, GWL_STYLE, savedStyle_ & ~WS_OVERLAPPEDWINDOW);
  SetWindowPos(window_, HWND_TOP, monitor.rcMonitor.left, monitor.rcMonitor.top,
               monitor.rcMonitor.right - monitor.rcMonitor.left,
               monitor.rcMonitor.bottom - monitor.rcMonitor.top,
               SWP_FRAMECHANGED | SWP_NOOWNERZORDER);
  fullscreen_ = true;
}

void NativeWindow::ExitFullscreen() {
  if (!fullscreen_) return;
  SetWindowLongPtrW(window_, GWL_STYLE, savedStyle_);
  SetWindowPlacement(window_, &savedPlacement_);
  SetWindowPos(window_, nullptr, 0, 0, 0, 0,
               SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOOWNERZORDER);
  fullscreen_ = false;
}

void NativeWindow::ShowSystemMenu(POINT screenPoint) {
  HMENU menu = GetSystemMenu(window_, FALSE);
  if (!menu) return;
  const UINT command = TrackPopupMenu(menu, TPM_RETURNCMD | TPM_RIGHTBUTTON,
                                      screenPoint.x, screenPoint.y, 0, window_, nullptr);
  if (command) PostMessageW(window_, WM_SYSCOMMAND, command, 0);
}

LRESULT CALLBACK NativeWindow::WindowProcedure(HWND window, UINT message, WPARAM wParam,
                                                LPARAM lParam) {
  NativeWindow* self = nullptr;
  if (message == WM_NCCREATE) {
    const auto create = reinterpret_cast<CREATESTRUCTW*>(lParam);
    self = static_cast<NativeWindow*>(create->lpCreateParams);
    self->window_ = window;
    SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(self));
  } else {
    self = reinterpret_cast<NativeWindow*>(GetWindowLongPtrW(window, GWLP_USERDATA));
  }
  return self ? self->HandleMessage(message, wParam, lParam)
              : DefWindowProcW(window, message, wParam, lParam);
}

LRESULT NativeWindow::HandleMessage(UINT message, WPARAM wParam, LPARAM lParam) {
  switch (message) {
    case WM_NCCALCSIZE:
      if (wParam != 0) {
        if (IsZoomed(window_)) {
          auto* parameters = reinterpret_cast<NCCALCSIZE_PARAMS*>(lParam);
          MONITORINFO monitor{sizeof(monitor)};
          GetMonitorInfoW(MonitorFromWindow(window_, MONITOR_DEFAULTTONEAREST), &monitor);
          parameters->rgrc[0] = monitor.rcWork;
        }
        return 0;
      }
      break;
    case WM_NCHITTEST: {
      LRESULT dwmResult = 0;
      if (DwmDefWindowProc(window_, message, wParam, lParam, &dwmResult)) return dwmResult;
      return HitTest({GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam)});
    }
    case WM_NCLBUTTONUP:
      HandleNonClientAction(wParam);
      return 0;
    case WM_NCRBUTTONUP:
      if (wParam == HTCAPTION) ShowSystemMenu({GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam)});
      return 0;
    case WM_SYSKEYDOWN:
      if (wParam == VK_SPACE && (GetKeyState(VK_MENU) & 0x8000) != 0) {
        RECT bounds{};
        GetWindowRect(window_, &bounds);
        ShowSystemMenu({bounds.left + 8, bounds.top + Pixels(kTitlebarDip, dpi_)});
        return 0;
      }
      break;
    case WM_KEYDOWN:
      if (wParam == VK_F11) {
        ToggleFullscreen();
        return 0;
      }
      if (wParam == VK_ESCAPE && fullscreen_) {
        ExitFullscreen();
        return 0;
      }
      break;
    case WM_GETMINMAXINFO: {
      auto* info = reinterpret_cast<MINMAXINFO*>(lParam);
      info->ptMinTrackSize = {Pixels(kMinimumWidthDip, dpi_), Pixels(kMinimumHeightDip, dpi_)};
      return 0;
    }
    case WM_DPICHANGED: {
      UpdateDpi(HIWORD(wParam));
      const auto suggested = reinterpret_cast<RECT*>(lParam);
      SetWindowPos(window_, nullptr, suggested->left, suggested->top,
                   suggested->right - suggested->left, suggested->bottom - suggested->top,
                   SWP_NOZORDER | SWP_NOACTIVATE);
      break;
    }
    case WM_DESTROY:
      if (!suppressQuit_) PostQuitMessage(0);
      return 0;
  }
  if (handler_) {
    if (const auto result = handler_(message, wParam, lParam)) return *result;
  }
  return DefWindowProcW(window_, message, wParam, lParam);
}

LRESULT NativeWindow::HitTest(POINT screenPoint) const {
  POINT point = screenPoint;
  ScreenToClient(window_, &point);
  RECT client{};
  GetClientRect(window_, &client);
  const int border = std::max(GetSystemMetricsForDpi(SM_CXFRAME, dpi_) +
                                  GetSystemMetricsForDpi(SM_CXPADDEDBORDER, dpi_),
                              Pixels(6, dpi_));
  if (!IsZoomed(window_) && !fullscreen_) {
    const bool left = point.x < border;
    const bool right = point.x >= client.right - border;
    const bool top = point.y < border;
    const bool bottom = point.y >= client.bottom - border;
    if (top && left) return HTTOPLEFT;
    if (top && right) return HTTOPRIGHT;
    if (bottom && left) return HTBOTTOMLEFT;
    if (bottom && right) return HTBOTTOMRIGHT;
    if (left) return HTLEFT;
    if (right) return HTRIGHT;
    if (top) return HTTOP;
    if (bottom) return HTBOTTOM;
  }
  if (point.y < Pixels(kTitlebarDip, dpi_)) {
    const int control = Pixels(kControlWidthDip, dpi_);
    if (point.x >= client.right - control) return HTCLOSE;
    if (point.x >= client.right - control * 2) return HTMAXBUTTON;
    if (point.x >= client.right - control * 3) return HTMINBUTTON;
    return HTCAPTION;
  }
  return HTCLIENT;
}

void NativeWindow::HandleNonClientAction(WPARAM hit) {
  switch (hit) {
    case HTCLOSE:
      PostMessageW(window_, WM_CLOSE, 0, 0);
      break;
    case HTMINBUTTON:
      ShowWindow(window_, SW_MINIMIZE);
      break;
    case HTMAXBUTTON:
      ShowWindow(window_, IsZoomed(window_) ? SW_RESTORE : SW_MAXIMIZE);
      break;
  }
}

void NativeWindow::UpdateDpi(UINT dpi) { dpi_ = dpi == 0 ? 96 : dpi; }

}  // namespace lgt::window
