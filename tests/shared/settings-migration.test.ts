import { describe, expect, it } from 'vitest';
import {
  migrateFrostStrengthRangeRecord,
  migrateSettingsRecord,
} from '../../src/shared/settings-migration';

describe('settings migration', () => {
  it.each([
    { schemaVersion: 1, glass: 'clear' },
    { schemaVersion: 2, glassOpacity: 85 },
    { schemaVersion: 3, backgroundOpacity: 12 },
  ])('resets all pre-v4 appearance values while preserving unrelated settings: %o', (legacy) => {
    expect(
      migrateSettingsRecord({ ...legacy, locale: 'ja', theme: 'light', fontSize: 17 }),
    ).toEqual({
      schemaVersion: 4,
      glassOpacity: 25,
      frostStrength: 6,
      locale: 'ja',
      fontSize: 17,
    });
  });

  it('removes the legacy theme while preserving current v4 appearance values idempotently', () => {
    const current = {
      schemaVersion: 4,
      glassOpacity: 0,
      frostStrength: 13,
      theme: 'dark',
    };
    const expected = { schemaVersion: 4, glassOpacity: 0, frostStrength: 13 };
    expect(migrateSettingsRecord(current)).toEqual(expected);
    expect(migrateSettingsRecord(migrateSettingsRecord(current))).toEqual(expected);
  });

  it('removes every legacy appearance key', () => {
    expect(
      migrateSettingsRecord({
        schemaVersion: 3,
        backgroundOpacity: 50,
        glass: 'dense',
        glassOpacity: 100,
      }),
    ).toEqual({ schemaVersion: 4, glassOpacity: 25, frostStrength: 6 });
  });

  it('does not mutate the source record', () => {
    const source = { schemaVersion: 3, backgroundOpacity: 25, theme: 'system' } as const;
    migrateSettingsRecord(source);
    expect(source).toEqual({ schemaVersion: 3, backgroundOpacity: 25, theme: 'system' });
  });

  it('resets only the frost strength for the transparent-first range', () => {
    const source = {
      schemaVersion: 4,
      locale: 'ja',
      glassOpacity: 0,
      frostStrength: 13,
      defaultProfileId: 'pwsh',
      fontSize: 17,
    } as const;

    expect(migrateFrostStrengthRangeRecord(source)).toEqual({
      ...source,
      frostStrength: 6,
    });
    expect(source.frostStrength).toBe(13);
  });
});
