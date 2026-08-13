import { FROST_STRENGTH_DEFAULT, GLASS_CONTRAST_DEFAULT } from './settings';

export function migrateSettingsRecord(
  input: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const output = { ...input };
  if (output.schemaVersion !== 4) {
    output.glassOpacity = 25;
    output.frostStrength = FROST_STRENGTH_DEFAULT;
  }
  output.schemaVersion = 4;
  delete output.glass;
  delete output.backgroundOpacity;
  delete output.theme;
  return output;
}

export function migrateFrostStrengthRangeRecord(
  input: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return { ...input, frostStrength: FROST_STRENGTH_DEFAULT };
}

export function migrateSettingsV5Record(
  input: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const output: Record<string, unknown> = { ...input };
  if (output.schemaVersion !== 5) {
    output.glassContrast = GLASS_CONTRAST_DEFAULT;
    output.frostStrength = FROST_STRENGTH_DEFAULT;
  }
  output.schemaVersion = 5;
  delete output.glass;
  delete output.glassOpacity;
  delete output.backgroundOpacity;
  delete output.theme;
  return output;
}
