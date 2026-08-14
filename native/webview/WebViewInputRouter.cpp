#include "webview/WebViewInputRouter.h"

#include <windowsx.h>

#include <algorithm>

namespace lgt::webview {
namespace {

std::optional<COREWEBVIEW2_MOUSE_EVENT_KIND> MouseKind(UINT message) {
  switch (message) {
    case WM_MOUSEMOVE: return COREWEBVIEW2_MOUSE_EVENT_KIND_MOVE;
    case WM_MOUSELEAVE: return COREWEBVIEW2_MOUSE_EVENT_KIND_LEAVE;
    case WM_LBUTTONDOWN: return COREWEBVIEW2_MOUSE_EVENT_KIND_LEFT_BUTTON_DOWN;
    case WM_LBUTTONUP: return COREWEBVIEW2_MOUSE_EVENT_KIND_LEFT_BUTTON_UP;
    case WM_LBUTTONDBLCLK: return COREWEBVIEW2_MOUSE_EVENT_KIND_LEFT_BUTTON_DOUBLE_CLICK;
    case WM_RBUTTONDOWN: return COREWEBVIEW2_MOUSE_EVENT_KIND_RIGHT_BUTTON_DOWN;
    case WM_RBUTTONUP: return COREWEBVIEW2_MOUSE_EVENT_KIND_RIGHT_BUTTON_UP;
    case WM_RBUTTONDBLCLK: return COREWEBVIEW2_MOUSE_EVENT_KIND_RIGHT_BUTTON_DOUBLE_CLICK;
    case WM_MBUTTONDOWN: return COREWEBVIEW2_MOUSE_EVENT_KIND_MIDDLE_BUTTON_DOWN;
    case WM_MBUTTONUP: return COREWEBVIEW2_MOUSE_EVENT_KIND_MIDDLE_BUTTON_UP;
    case WM_MBUTTONDBLCLK: return COREWEBVIEW2_MOUSE_EVENT_KIND_MIDDLE_BUTTON_DOUBLE_CLICK;
    case WM_XBUTTONDOWN: return COREWEBVIEW2_MOUSE_EVENT_KIND_X_BUTTON_DOWN;
    case WM_XBUTTONUP: return COREWEBVIEW2_MOUSE_EVENT_KIND_X_BUTTON_UP;
    case WM_XBUTTONDBLCLK: return COREWEBVIEW2_MOUSE_EVENT_KIND_X_BUTTON_DOUBLE_CLICK;
    case WM_MOUSEWHEEL: return COREWEBVIEW2_MOUSE_EVENT_KIND_WHEEL;
    case WM_MOUSEHWHEEL: return COREWEBVIEW2_MOUSE_EVENT_KIND_HORIZONTAL_WHEEL;
    default: return std::nullopt;
  }
}

}  // namespace

void WebViewInputRouter::Attach(HWND window, ICoreWebView2Environment* environment,
                                ICoreWebView2Controller* controller,
                                ICoreWebView2CompositionController* compositionController) {
  Detach();
  window_ = window;
  controller_ = controller;
  compositionController_ = compositionController;
  if (environment) environment->QueryInterface(IID_PPV_ARGS(&environment_));
}

void WebViewInputRouter::Detach() noexcept {
  environment_.Reset();
  compositionController_.Reset();
  controller_.Reset();
  window_ = nullptr;
  trackingMouse_ = false;
}

void WebViewInputRouter::SetBounds(RECT bounds) noexcept { bounds_ = bounds; }

std::optional<LRESULT> WebViewInputRouter::Handle(UINT message, WPARAM wParam, LPARAM lParam) {
  if (!compositionController_) return std::nullopt;
  if (MouseKind(message)) {
    POINT point{GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam)};
    if (message == WM_MOUSEWHEEL || message == WM_MOUSEHWHEEL) ScreenToClient(window_, &point);
    const bool inside = message == WM_MOUSELEAVE || PtInRect(&bounds_, point) != FALSE;
    const bool captured = GetCapture() == window_;
    if (!inside && !captured) {
      if (message == WM_MOUSEMOVE && trackingMouse_) {
        TRACKMOUSEEVENT cancel{sizeof(cancel), TME_LEAVE | TME_CANCEL, window_, 0};
        TrackMouseEvent(&cancel);
        trackingMouse_ = false;
        compositionController_->SendMouseInput(COREWEBVIEW2_MOUSE_EVENT_KIND_LEAVE,
                                                COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS_NONE, 0,
                                                POINT{});
      }
      return std::nullopt;
    }
    if (message == WM_MOUSEMOVE && !trackingMouse_) {
      TRACKMOUSEEVENT track{sizeof(track), TME_LEAVE, window_, 0};
      TrackMouseEvent(&track);
      trackingMouse_ = true;
    } else if (message == WM_MOUSELEAVE) {
      trackingMouse_ = false;
    }
    if (message == WM_LBUTTONDOWN || message == WM_RBUTTONDOWN || message == WM_MBUTTONDOWN ||
        message == WM_XBUTTONDOWN) {
      SetFocus(window_);
      controller_->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
      SetCapture(window_);
    } else if (message == WM_LBUTTONUP || message == WM_RBUTTONUP || message == WM_MBUTTONUP ||
               message == WM_XBUTTONUP) {
      const auto buttons = LOWORD(wParam) &
                           (MK_LBUTTON | MK_RBUTTON | MK_MBUTTON | MK_XBUTTON1 | MK_XBUTTON2);
      if (buttons == 0) ReleaseCapture();
    }
    return SUCCEEDED(SendMouse(message, wParam, lParam)) ? std::optional<LRESULT>(0)
                                                         : std::nullopt;
  }
  if (message >= WM_POINTERUPDATE && message <= WM_POINTERLEAVE) {
    return SUCCEEDED(SendPointer(message, wParam)) ? std::optional<LRESULT>(0)
                                                   : std::nullopt;
  }
  switch (message) {
    case WM_SETFOCUS:
      controller_->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
      return 0;
    case WM_SETCURSOR: {
      if (LOWORD(lParam) != HTCLIENT) return std::nullopt;
      POINT cursor{};
      if (!GetCursorPos(&cursor) || !ScreenToClient(window_, &cursor) ||
          !PtInRect(&bounds_, cursor)) {
        return std::nullopt;
      }
      UpdateCursor();
      return TRUE;
    }
    default:
      return std::nullopt;
  }
}

HRESULT WebViewInputRouter::SendMouse(UINT message, WPARAM wParam, LPARAM lParam) {
  const auto kind = MouseKind(message);
  if (!kind) return E_INVALIDARG;
  UINT32 data = 0;
  if (message == WM_MOUSEWHEEL || message == WM_MOUSEHWHEEL) {
    data = static_cast<UINT32>(GET_WHEEL_DELTA_WPARAM(wParam));
  } else if (message == WM_XBUTTONDOWN || message == WM_XBUTTONUP || message == WM_XBUTTONDBLCLK) {
    data = GET_XBUTTON_WPARAM(wParam);
  }
  const auto keys = message == WM_MOUSELEAVE ? COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS_NONE
                                             : MouseKeys(wParam);
  return compositionController_->SendMouseInput(*kind, keys, data,
                                                 MousePoint(message, lParam));
}

COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS WebViewInputRouter::MouseKeys(WPARAM wParam) const noexcept {
  auto keys = COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS_NONE;
  const auto state = LOWORD(wParam);
  if (state & MK_LBUTTON) keys = keys | COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS_LEFT_BUTTON;
  if (state & MK_RBUTTON) keys = keys | COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS_RIGHT_BUTTON;
  if (state & MK_MBUTTON) keys = keys | COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS_MIDDLE_BUTTON;
  if (state & MK_SHIFT) keys = keys | COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS_SHIFT;
  if (state & MK_CONTROL) keys = keys | COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS_CONTROL;
  if (state & MK_XBUTTON1) keys = keys | COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS_X_BUTTON1;
  if (state & MK_XBUTTON2) keys = keys | COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS_X_BUTTON2;
  return keys;
}

POINT WebViewInputRouter::MousePoint(UINT message, LPARAM lParam) const noexcept {
  if (message == WM_MOUSELEAVE) return {};
  POINT point{GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam)};
  if (message == WM_MOUSEWHEEL || message == WM_MOUSEHWHEEL) ScreenToClient(window_, &point);
  point.x -= bounds_.left;
  point.y -= bounds_.top;
  return point;
}

HRESULT WebViewInputRouter::SendPointer(UINT message, WPARAM wParam) {
  if (!environment_) return E_NOINTERFACE;
  const UINT32 pointerId = GET_POINTERID_WPARAM(wParam);
  POINTER_INFO source{};
  if (!GetPointerInfo(pointerId, &source)) return HRESULT_FROM_WIN32(GetLastError());
  Microsoft::WRL::ComPtr<ICoreWebView2PointerInfo> target;
  HRESULT result = environment_->CreateCoreWebView2PointerInfo(&target);
  if (FAILED(result)) return result;

  RECT device{};
  RECT display{};
  GetPointerDeviceRects(source.sourceDevice, &device, &display);
  POINT pixel = source.ptPixelLocation;
  ScreenToClient(window_, &pixel);
  pixel.x -= bounds_.left;
  pixel.y -= bounds_.top;
  POINT raw = source.ptPixelLocationRaw;
  ScreenToClient(window_, &raw);
  raw.x -= bounds_.left;
  raw.y -= bounds_.top;
  auto himetric = [&](POINT location) {
    POINT converted{};
    const LONG displayWidth = std::max<LONG>(1, display.right - display.left);
    const LONG displayHeight = std::max<LONG>(1, display.bottom - display.top);
    converted.x = device.left + MulDiv(location.x - display.left, device.right - device.left, displayWidth);
    converted.y = device.top + MulDiv(location.y - display.top, device.bottom - device.top, displayHeight);
    return converted;
  };
  target->put_PointerKind(source.pointerType);
  target->put_PointerId(source.pointerId);
  target->put_FrameId(source.frameId);
  target->put_PointerFlags(source.pointerFlags);
  target->put_PointerDeviceRect(device);
  target->put_DisplayRect(display);
  target->put_PixelLocation(pixel);
  target->put_HimetricLocation(himetric(source.ptPixelLocation));
  target->put_PixelLocationRaw(raw);
  target->put_HimetricLocationRaw(himetric(source.ptPixelLocationRaw));
  target->put_Time(source.dwTime);
  target->put_HistoryCount(source.historyCount);
  target->put_InputData(source.InputData);
  target->put_KeyStates(source.dwKeyStates);
  target->put_PerformanceCount(source.PerformanceCount);
  target->put_ButtonChangeKind(source.ButtonChangeType);

  if (source.pointerType == PT_PEN) {
    POINTER_PEN_INFO pen{};
    if (GetPointerPenInfo(pointerId, &pen)) {
      target->put_PenFlags(pen.penFlags);
      target->put_PenMask(pen.penMask);
      target->put_PenPressure(pen.pressure);
      target->put_PenRotation(pen.rotation);
      target->put_PenTiltX(pen.tiltX);
      target->put_PenTiltY(pen.tiltY);
    }
  } else if (source.pointerType == PT_TOUCH) {
    POINTER_TOUCH_INFO touch{};
    if (GetPointerTouchInfo(pointerId, &touch)) {
      RECT contact = touch.rcContact;
      MapWindowPoints(HWND_DESKTOP, window_, reinterpret_cast<POINT*>(&contact), 2);
      OffsetRect(&contact, -bounds_.left, -bounds_.top);
      RECT contactRaw = touch.rcContactRaw;
      MapWindowPoints(HWND_DESKTOP, window_, reinterpret_cast<POINT*>(&contactRaw), 2);
      OffsetRect(&contactRaw, -bounds_.left, -bounds_.top);
      target->put_TouchFlags(touch.touchFlags);
      target->put_TouchMask(touch.touchMask);
      target->put_TouchContact(contact);
      target->put_TouchContactRaw(contactRaw);
      target->put_TouchOrientation(touch.orientation);
      target->put_TouchPressure(touch.pressure);
    }
  }
  return compositionController_->SendPointerInput(
      static_cast<COREWEBVIEW2_POINTER_EVENT_KIND>(message), target.Get());
}

void WebViewInputRouter::UpdateCursor() const noexcept {
  HCURSOR cursor = nullptr;
  if (compositionController_ && SUCCEEDED(compositionController_->get_Cursor(&cursor)) && cursor) {
    SetCursor(cursor);
  } else {
    SetCursor(LoadCursorW(nullptr, IDC_ARROW));
  }
}

}  // namespace lgt::webview
