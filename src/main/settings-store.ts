import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import Store from 'electron-store';
import type { SettingsPatch, SettingsV2 } from '../shared/contracts';
import { migrateSettingsRecord } from '../shared/settings-migration';
import { DEFAULT_SETTINGS, SETTINGS_SCHEMA } from '../shared/settings';

const SETTINGS_STORAGE_SCHEMA = {
  ...SETTINGS_SCHEMA,
  // Accept the previous upper bound long enough to normalize it without discarding other settings.
  glassOpacity: { ...SETTINGS_SCHEMA.glassOpacity, maximum: 85 },
} as const;

export class SettingsStore {
  readonly #store: Store<Record<string, unknown>>;
  readonly recovered: boolean;

  constructor() {
    try {
      this.#store = this.createStore();
      this.normalizeStoredSettings();
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
      schema: SETTINGS_STORAGE_SCHEMA,
      clearInvalidConfig: false,
      migrations: {
        '0.1.0': (store) => {
          store.store = migrateSettingsRecord(store.store);
        },
      },
    });
  }

  private normalizeStoredSettings(): void {
    const stored = this.#store.store;
    const normalized = migrateSettingsRecord(stored);
    if (
      stored.schemaVersion !== normalized.schemaVersion ||
      stored.glassOpacity !== normalized.glassOpacity ||
      Object.hasOwn(stored, 'glass')
    ) {
      this.#store.store = normalized;
    }
  }

  get value(): SettingsV2 {
    const stored = this.#store.store as unknown as SettingsV2;
    return {
      schemaVersion: 2,
      locale: stored.locale,
      theme: stored.theme,
      glassOpacity: stored.glassOpacity,
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

  update(patch: SettingsPatch): SettingsV2 {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) this.#store.set(key, value);
    }
    return this.value;
  }
}
