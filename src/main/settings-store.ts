import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import Store from 'electron-store';
import type { SettingsPatch, SettingsV5 } from '../shared/contracts';
import {
  migrateFrostStrengthRangeRecord,
  migrateSettingsRecord,
  migrateSettingsV5Record,
} from '../shared/settings-migration';
import { DEFAULT_SETTINGS, SETTINGS_SCHEMA } from '../shared/settings';

export class SettingsStore {
  readonly #store: Store<Record<string, unknown>>;
  readonly recovered: boolean;

  constructor() {
    try {
      this.#store = this.createStore();
      this.recovered = false;
    } catch {
      const settingsPath = path.join(app.getPath('userData'), 'settings.json');
      if (existsSync(settingsPath)) {
        const backup = path.join(
          app.getPath('userData'),
          `settings.corrupt-${new Date().toISOString().replaceAll(':', '-')}.json`,
        );
        renameSync(settingsPath, backup);
      }
      this.#store = this.createStore();
      this.recovered = true;
    }
  }

  private createStore(): Store<Record<string, unknown>> {
    return new Store<Record<string, unknown>>({
      name: 'settings',
      defaults: { ...DEFAULT_SETTINGS },
      schema: SETTINGS_SCHEMA,
      clearInvalidConfig: false,
      // Settings migrations follow the schema version, independently of the app release.
      // This guarantees schema migrations run for development builds that already recorded
      // a newer application version.
      ...({ projectVersion: '5.0.0' } as Record<string, unknown>),
      migrations: {
        '4.0.0': (store) => {
          store.store = migrateSettingsRecord(store.store);
        },
        // Development builds may already have recorded 4.0.0 with a theme key.
        '4.0.1': (store) => {
          store.store = migrateSettingsRecord(store.store);
        },
        // The transparent-first frost range intentionally resets only the saved level.
        '4.0.2': (store) => {
          store.store = migrateFrostStrengthRangeRecord(store.store);
        },
        // Appearance semantics changed in v5, so every previous appearance value resets.
        '5.0.0': (store) => {
          store.store = migrateSettingsV5Record(store.store);
        },
      },
    });
  }

  get value(): SettingsV5 {
    const stored = this.#store.store as unknown as SettingsV5;
    return {
      schemaVersion: 5,
      locale: stored.locale,
      glassContrast: stored.glassContrast,
      frostStrength: stored.frostStrength,
      defaultProfileId: stored.defaultProfileId,
      fontSize: stored.fontSize,
      cursorStyle: stored.cursorStyle,
      cursorBlink: stored.cursorBlink,
      bellSound: stored.bellSound,
      scrollback: stored.scrollback,
      warnMultilinePaste: stored.warnMultilinePaste,
      screenReaderMode: stored.screenReaderMode,
      firstRunHintsSeen: stored.firstRunHintsSeen,
    };
  }

  update(patch: SettingsPatch): SettingsV5 {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) this.#store.set(key, value);
    }
    return this.value;
  }
}
