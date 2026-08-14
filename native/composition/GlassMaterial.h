#pragma once

#include "settings/SettingsStore.h"

namespace lgt::composition {

struct GlassMaterial {
  float blurRadius;
  float saturation;
  float luminosity;
  float tintOpacity;
  float noiseOpacity;
  float borderOpacity;
  float highlightIntensity;
  float inactiveOpacity;
  float cornerRadius;
};

inline constexpr GlassMaterial kClearMaterial{6.0F, 1.05F, 0.02F, 0.64F, 0.015F,
                                               0.20F, 0.18F, 0.82F, 16.0F};
inline constexpr GlassMaterial kRegularMaterial{16.0F, 1.10F, 0.01F, 0.72F, 0.020F,
                                                 0.28F, 0.24F, 0.82F, 16.0F};
inline constexpr GlassMaterial kDenseMaterial{30.0F, 1.15F, 0.00F, 0.82F, 0.025F,
                                               0.36F, 0.30F, 0.82F, 16.0F};

inline constexpr const GlassMaterial& Material(settings::GlassPreset preset) noexcept {
  switch (preset) {
    case settings::GlassPreset::Clear:
      return kClearMaterial;
    case settings::GlassPreset::Regular:
      return kRegularMaterial;
    case settings::GlassPreset::Dense:
      return kDenseMaterial;
  }
  return kRegularMaterial;
}

}  // namespace lgt::composition
