import type { LegacyGlassPreset } from './contracts';
import { GLASS_OPACITY_DEFAULT } from './settings';

const LEGACY_GLASS_OPACITY: Record<LegacyGlassPreset, number> = {
  clear: 45,
  balanced: 60,
  dense: 75,
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
  return output;
}
