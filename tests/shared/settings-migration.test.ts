import { describe, expect, it } from 'vitest';
import { migrateSettingsRecord } from '../../src/shared/settings-migration';

describe('settings migration', () => {
  it.each([
    ['clear', 45],
    ['balanced', 60],
    ['dense', 75],
  ] as const)('maps the legacy %s preset to %i percent', (glass, glassOpacity) => {
    expect(migrateSettingsRecord({ schemaVersion: 1, glass, locale: 'ja', fontSize: 17 })).toEqual({
      schemaVersion: 2,
      glassOpacity,
      locale: 'ja',
      fontSize: 17,
    });
  });

  it('uses the safe default for a malformed legacy preset and is idempotent', () => {
    const migrated = migrateSettingsRecord({ schemaVersion: 1, glass: 'broken', theme: 'dark' });
    expect(migrated).toEqual({ schemaVersion: 2, glassOpacity: 60, theme: 'dark' });
    expect(migrateSettingsRecord(migrated)).toEqual(migrated);
  });

  it('does not mutate the source record', () => {
    const source = { schemaVersion: 1, glass: 'clear' } as const;
    migrateSettingsRecord(source);
    expect(source).toEqual({ schemaVersion: 1, glass: 'clear' });
  });
});
