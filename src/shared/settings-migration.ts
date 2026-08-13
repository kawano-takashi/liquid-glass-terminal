import type { LegacyGlassPreset } from './contracts';
import { GLASS_OPACITY_DEFAULT, GLASS_OPACITY_MAX, GLASS_OPACITY_MIN } from './settings';

const LEGACY_GLASS_OPACITY: Record<LegacyGlassPreset, number> = {
  clear: 20,
  balanced: 35,
  dense: 50,
};

function isLegacyGlassPreset(value: unknown): value is LegacyGlassPreset {
  return value === 'clear' || value === 'balanced' || value === 'dense';
}

export function migrateSettingsRecord(
  input: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const output = { ...input };
  if (output.schemaVersion === 1 || Object.hasOwn(output, 'glass')) {
    output.glassOpacity = isLegacyGlassPreset(output.glass)
      ? LEGACY_GLASS_OPACITY[output.glass]
      : GLASS_OPACITY_DEFAULT;
    output.schemaVersion = 2;
    delete output.glass;
  }
  if (
    typeof output.glassOpacity === 'number' &&
    Number.isFinite(output.glassOpacity) &&
    Number.isInteger(output.glassOpacity)
  ) {
    output.glassOpacity = Math.min(
      GLASS_OPACITY_MAX,
      Math.max(GLASS_OPACITY_MIN, output.glassOpacity),
    );
  }
  return output;
}
