import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import Store from 'electron-store';
import type { SettingsPatch, SettingsV1 } from '../shared/contracts';
import { DEFAULT_SETTINGS, SETTINGS_SCHEMA } from '../shared/settings';

export class SettingsStore {
  readonly #store: Store<SettingsV1>;
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

  private createStore(): Store<SettingsV1> {
    return new Store<SettingsV1>({
      name: 'settings',
      defaults: DEFAULT_SETTINGS,
      schema: SETTINGS_SCHEMA,
      clearInvalidConfig: false,
    });
  }

  get value(): SettingsV1 {
    return { ...DEFAULT_SETTINGS, ...this.#store.store, schemaVersion: 1 };
  }

  update(patch: SettingsPatch): SettingsV1 {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) this.#store.set(key as keyof SettingsV1, value);
    }
    return this.value;
  }
}
