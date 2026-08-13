import { describe, expect, it } from 'vitest';
import { migrateSettingsRecord } from '../../src/shared/settings-migration';

describe('settings migration', () => {
  it.each([
    ['clear', 10],
    ['balanced', 25],
    ['dense', 40],
  ] as const)('maps the legacy %s preset to %i percent', (glass, backgroundOpacity) => {
    expect(migrateSettingsRecord({ schemaVersion: 1, glass, locale: 'ja', fontSize: 17 })).toEqual({
      schemaVersion: 3,
      backgroundOpacity,
      locale: 'ja',
      fontSize: 17,
    });
  });

  it('clamps opacity saved with the previous upper bound', () => {
    expect(migrateSettingsRecord({ schemaVersion: 2, glassOpacity: 85, theme: 'dark' })).toEqual({
      schemaVersion: 3,
      backgroundOpacity: 50,
      theme: 'dark',
    });
  });

  it('preserves v2 values already inside the new range and clamps the lower endpoint', () => {
    expect(migrateSettingsRecord({ schemaVersion: 2, glassOpacity: 25 })).toEqual({
      schemaVersion: 3,
      backgroundOpacity: 25,
    });
    expect(migrateSettingsRecord({ schemaVersion: 2, glassOpacity: -10 })).toEqual({
      schemaVersion: 3,
      backgroundOpacity: 0,
    });
  });

  it('uses the safe default for a malformed legacy preset and is idempotent', () => {
    const migrated = migrateSettingsRecord({ schemaVersion: 1, glass: 'broken', theme: 'dark' });
    expect(migrated).toEqual({ schemaVersion: 3, backgroundOpacity: 25, theme: 'dark' });
    expect(migrateSettingsRecord(migrated)).toEqual(migrated);
  });

  it('uses the default for invalid numeric values and removes both legacy keys', () => {
    expect(
      migrateSettingsRecord({
        schemaVersion: 2,
        glassOpacity: Number.NaN,
        glass: undefined,
      }),
    ).toEqual({ schemaVersion: 3, backgroundOpacity: 25 });
  });

  it('keeps the current v3 value when a stale legacy key is also present', () => {
    expect(
      migrateSettingsRecord({ schemaVersion: 3, backgroundOpacity: 12, glassOpacity: 50 }),
    ).toEqual({ schemaVersion: 3, backgroundOpacity: 12 });
  });

  it('does not mutate the source record', () => {
    const source = { schemaVersion: 1, glass: 'clear' } as const;
    migrateSettingsRecord(source);
    expect(source).toEqual({ schemaVersion: 1, glass: 'clear' });
  });
});
