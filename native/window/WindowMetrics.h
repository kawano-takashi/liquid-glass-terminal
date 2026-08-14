#pragma once

#include <windows.h>

#include <algorithm>
#include <optional>

#include "contracts/generated/Protocol.generated.h"

namespace lgt::window {

inline constexpr int kTitlebarHeightDip = static_cast<int>(protocol::kTitlebarHeightDip);
inline constexpr int kCaptionButtonWidthDip =
    static_cast<int>(protocol::kCaptionButtonWidthDip);
inline constexpr int kMinimumWidthDip = protocol::kMinimumWindowWidth;
inline constexpr int kMinimumHeightDip = protocol::kMinimumWindowHeight;

enum class CaptionButton { None, Minimize, Maximize, Close };

[[nodiscard]] inline int DipPixels(int dips, UINT dpi) noexcept {
  return MulDiv(dips, static_cast<int>(dpi == 0 ? 96 : dpi), 96);
}

[[nodiscard]] inline float CssPixelsToClient(float value, UINT dpi, double webZoom) noexcept {
  return value * static_cast<float>(dpi == 0 ? 96 : dpi) / 96.0F *
         static_cast<float>(std::clamp(webZoom, 0.8, 2.0));
}

[[nodiscard]] inline POINT ClientPointToWebView(POINT point, const RECT& webViewBounds) noexcept {
  point.x -= webViewBounds.left;
  point.y -= webViewBounds.top;
  return point;
}

[[nodiscard]] inline std::optional<LRESULT> ResizeHitTest(POINT point, const RECT& client,
                                                          UINT dpi, bool enabled) noexcept {
  if (!enabled) return std::nullopt;
  const int border = std::max(GetSystemMetricsForDpi(SM_CXFRAME, dpi) +
                                  GetSystemMetricsForDpi(SM_CXPADDEDBORDER, dpi),
                              DipPixels(6, dpi));
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
  return std::nullopt;
}

[[nodiscard]] inline CaptionButton CaptionButtonAtPoint(POINT point, const RECT& client,
                                                         UINT dpi, bool fullscreen) noexcept {
  if (fullscreen || point.y < 0 || point.y >= DipPixels(kTitlebarHeightDip, dpi)) {
    return CaptionButton::None;
  }
  const int width = DipPixels(kCaptionButtonWidthDip, dpi);
  if (point.x >= client.right - width) return CaptionButton::Close;
  if (point.x >= client.right - width * 2) return CaptionButton::Maximize;
  if (point.x >= client.right - width * 3) return CaptionButton::Minimize;
  return CaptionButton::None;
}

[[nodiscard]] inline LRESULT CaptionButtonHit(CaptionButton button) noexcept {
  switch (button) {
    case CaptionButton::Minimize: return HTMINBUTTON;
    case CaptionButton::Maximize: return HTMAXBUTTON;
    case CaptionButton::Close: return HTCLOSE;
    case CaptionButton::None: return HTNOWHERE;
  }
  return HTNOWHERE;
}

[[nodiscard]] inline CaptionButton CaptionButtonFromHit(WPARAM hit) noexcept {
  switch (hit) {
    case HTMINBUTTON: return CaptionButton::Minimize;
    case HTMAXBUTTON: return CaptionButton::Maximize;
    case HTCLOSE: return CaptionButton::Close;
    default: return CaptionButton::None;
  }
}

}  // namespace lgt::window
