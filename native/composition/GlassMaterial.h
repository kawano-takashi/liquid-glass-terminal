#pragma once

#include <algorithm>
#include <cstdint>

#include "contracts/generated/Protocol.generated.h"

namespace lgt::composition {

inline constexpr std::uint32_t kGlassTintMaximumAlpha = 115;

[[nodiscard]] inline constexpr std::uint32_t GlassBlurDips(std::uint32_t blurDips) noexcept {
  return std::clamp(blurDips, protocol::kBlurDipsConstraint.minimum,
                    protocol::kBlurDipsConstraint.maximum);
}

[[nodiscard]] inline constexpr bool CanRenderGlassBlur(bool effectsSupported,
                                                       bool effectsFast) noexcept {
  return effectsSupported && effectsFast;
}

[[nodiscard]] inline constexpr std::uint32_t GlassTintAlpha(std::uint32_t blurDips) noexcept {
  const auto blur = GlassBlurDips(blurDips);
  return (blur * kGlassTintMaximumAlpha + protocol::kBlurDipsConstraint.maximum / 2) /
         protocol::kBlurDipsConstraint.maximum;
}

}  // namespace lgt::composition
