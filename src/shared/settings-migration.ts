import type { LegacyGlassPreset } from './contracts';
import {
  BACKGROUND_OPACITY_DEFAULT,
  BACKGROUND_OPACITY_MAX,
  BACKGROUND_OPACITY_MIN,
} from './settings';

const LEGACY_BACKGROUND_OPACITY: Record<LegacyGlassPreset, number> = {
  clear: 10,
  balanced: 25,
  dense: 40,
};

function isLegacyGlassPreset(value: unknown): value is LegacyGlassPreset {
  return value === 'clear' || value === 'balanced' || value === 'dense';
}

export function migrateSettingsRecord(
  input: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const output = { ...input };
  let candidate = output.backgroundOpacity;
  if (output.schemaVersion === 1 || Object.hasOwn(output, 'glass')) {
    candidate = isLegacyGlassPreset(output.glass)
      ? LEGACY_BACKGROUND_OPACITY[output.glass]
      : BACKGROUND_OPACITY_DEFAULT;
  } else if (output.schemaVersion !== 3 && Object.hasOwn(output, 'glassOpacity')) {
    candidate = output.glassOpacity;
  }
  output.backgroundOpacity =
    typeof candidate === 'number' && Number.isFinite(candidate) && Number.isInteger(candidate)
      ? Math.min(BACKGROUND_OPACITY_MAX, Math.max(BACKGROUND_OPACITY_MIN, candidate))
      : BACKGROUND_OPACITY_DEFAULT;
  output.schemaVersion = 3;
  delete output.glass;
  delete output.glassOpacity;
  return output;
}
