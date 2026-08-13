import { FROST_STRENGTH_DEFAULT, GLASS_OPACITY_DEFAULT } from './settings';

export function migrateSettingsRecord(
  input: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const output = { ...input };
  if (output.schemaVersion !== 4) {
    output.glassOpacity = GLASS_OPACITY_DEFAULT;
    output.frostStrength = FROST_STRENGTH_DEFAULT;
  }
  output.schemaVersion = 4;
  delete output.glass;
  delete output.backgroundOpacity;
  delete output.theme;
  return output;
}
