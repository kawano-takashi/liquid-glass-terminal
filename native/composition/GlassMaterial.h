#pragma once

#include <algorithm>
#include <cstdint>

#include "contracts/generated/Protocol.generated.h"

namespace lgt::composition {

[[nodiscard]] inline constexpr std::uint32_t GlassBlurDips(std::uint32_t blurDips) noexcept {
  return std::clamp(blurDips, protocol::kBlurDipsConstraint.minimum,
                    protocol::kBlurDipsConstraint.maximum);
}

[[nodiscard]] inline constexpr bool CanRenderGlassBlur(bool effectsSupported,
                                                       bool effectsFast) noexcept {
  return effectsSupported && effectsFast;
}

}  // namespace lgt::composition
