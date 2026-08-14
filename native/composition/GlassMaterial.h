#pragma once

#include <algorithm>
#include <cstdint>

#include "contracts/generated/Protocol.generated.h"

namespace lgt::composition {

inline constexpr float kOverlayOpacityBoostPercent = 18.0F;
inline constexpr float kMaximumGrainOpacity = protocol::kGrainMaximumOpacity;

[[nodiscard]] inline constexpr std::uint8_t ToneChannel(std::uint32_t tone) noexcept {
  return static_cast<std::uint8_t>(protocol::ToneChannel(
      std::min(tone, protocol::kToneConstraint.maximum)));
}

[[nodiscard]] inline constexpr std::uint32_t ToneRgb(std::uint32_t tone) noexcept {
  return protocol::ToneRgb(std::min(tone, protocol::kToneConstraint.maximum));
}

[[nodiscard]] inline constexpr float FrostBlurDips(std::uint32_t thickness) noexcept {
  return protocol::FrostBlurDip(
      std::min(thickness, protocol::kFrostThicknessConstraint.maximum));
}

[[nodiscard]] inline constexpr float MaterialOpacity(std::uint32_t opacity) noexcept {
  return static_cast<float>(std::min(opacity, protocol::kOpacityConstraint.maximum)) /
         static_cast<float>(protocol::kOpacityConstraint.maximum);
}

[[nodiscard]] inline constexpr float OverlayOpacity(std::uint32_t opacity) noexcept {
  const float base = MaterialOpacity(opacity);
  return std::min(1.0F, base * (1.0F + kOverlayOpacityBoostPercent / 100.0F));
}

[[nodiscard]] inline constexpr float OverlayAdditionalOpacity(std::uint32_t opacity) noexcept {
  const float base = MaterialOpacity(opacity);
  if (base >= 1.0F) return 0.0F;
  return (OverlayOpacity(opacity) - base) / (1.0F - base);
}

[[nodiscard]] inline constexpr float GrainOpacity(std::uint32_t grain) noexcept {
  return protocol::GrainOpacity(std::min(grain, protocol::kGrainConstraint.maximum));
}

[[nodiscard]] inline constexpr float MaterialGrainOpacity(std::uint32_t grain,
                                                          std::uint32_t opacity) noexcept {
  return GrainOpacity(grain) * MaterialOpacity(opacity);
}

[[nodiscard]] inline constexpr bool NeedsGrainSurface(std::uint32_t grain,
                                                      std::uint32_t opacity) noexcept {
  return grain > protocol::kGrainConstraint.minimum &&
         opacity > protocol::kOpacityConstraint.minimum;
}

[[nodiscard]] inline constexpr bool NeedsExtendedDwmFrame(bool glass,
                                                           std::uint32_t opacity) noexcept {
  return !glass || opacity > protocol::kOpacityConstraint.minimum;
}

}  // namespace lgt::composition
