import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import Store from 'electron-store';
import type { SettingsPatch, SettingsV4 } from '../shared/contracts';
import { migrateSettingsRecord } from '../shared/settings-migration';
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
      // This guarantees v4 runs for development builds that already recorded app 0.2.0.
      ...({ projectVersion: '4.0.1' } as Record<string, unknown>),
      migrations: {
        '4.0.0': (store) => {
          store.store = migrateSettingsRecord(store.store);
        },
        // Development builds may already have recorded 4.0.0 with a theme key.
        '4.0.1': (store) => {
          store.store = migrateSettingsRecord(store.store);
        },
      },
    });
  }

  get value(): SettingsV4 {
    const stored = this.#store.store as unknown as SettingsV4;
    return {
      schemaVersion: 4,
      locale: stored.locale,
      glassOpacity: stored.glassOpacity,
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

  update(patch: SettingsPatch): SettingsV4 {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) this.#store.set(key, value);
    }
    return this.value;
  }
}
