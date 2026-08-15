import {
  DEFAULT_SETTINGS,
  GLASS_SETTING_KEYS,
  GLASS_PRESETS,
  GLASS_VALUE_KEYS,
  LIMITS,
  PROTOCOL_VERSION,
  SETTINGS_CONSTRAINTS,
  SETTINGS_KEYS,
  SETTINGS_OPERATIONS,
  UI_METRICS,
  isNativeToWebMessage,
  isSettings,
  isSettingsPatch,
  isWindowRuntimeState,
  isWebToNativeMessage,
  resolveGlassPreset,
  type Settings,
} from '../../contracts/generated/protocol';
import { describe, expect, it } from 'vitest';

const settings: Settings = {
  locale: 'ja',
  glass: { ...DEFAULT_SETTINGS.glass },
  foreground: 'auto',
  animations: true,
  uiScale: 100,
};

describe('generated protocol validators', () => {
  it('generates the v6 blur metadata from the IDL', () => {
    expect(PROTOCOL_VERSION).toBe(6);
    expect(SETTINGS_OPERATIONS).toEqual(['preview', 'apply', 'cancel']);
    expect(UI_METRICS).toEqual({ titlebarHeightDip: 56, captionButtonWidthDip: 46 });
    expect(SETTINGS_CONSTRAINTS).toEqual({
      blurDips: { minimum: 2, maximum: 74, step: 1 },
      uiScale: { minimum: 80, maximum: 200, step: 10 },
    });
    expect(GLASS_PRESETS).toEqual({
      clear: { blurDips: 6 },
      regular: { blurDips: 30 },
      dense: { blurDips: 55 },
    });
    expect(DEFAULT_SETTINGS.glass).toEqual({ enabled: true, blurDips: 30 });
    expect(resolveGlassPreset({ ...DEFAULT_SETTINGS.glass })).toBe('regular');
    expect(resolveGlassPreset({ ...DEFAULT_SETTINGS.glass, blurDips: 29 })).toBe('custom');
  });

  it('accepts 2/30/74 DIP and rejects fractions, adjacent values, and old fields', () => {
    const withGlass = (
      patch: Partial<Settings['glass']>,
      root: Partial<Pick<Settings, 'uiScale'>> = {},
    ): Settings => ({ ...settings, ...root, glass: { ...settings.glass, ...patch } });
    for (const blurDips of [2, 30, 74]) {
      expect(isSettings(withGlass({ blurDips }))).toBe(true);
    }
    for (const blurDips of [1, 75, 2.5]) {
      expect(isSettings(withGlass({ blurDips }))).toBe(false);
    }
    expect(isSettings(withGlass({ intensity: 35 } as never))).toBe(false);
    expect(isSettings(withGlass({ tone: 92 } as never))).toBe(false);
    expect(isSettings(withGlass({ opacity: 100 } as never))).toBe(false);
    expect(isSettings(withGlass({ frost: 10, grain: 10 } as never))).toBe(false);
    expect(isSettings(withGlass({}, { uiScale: 85 }))).toBe(false);
  });

  it('requires exact v6 Settings and patch shapes', () => {
    for (const key of SETTINGS_KEYS) {
      const candidate = { ...settings } as unknown as Record<string, unknown>;
      delete candidate[key];
      expect(isSettings(candidate)).toBe(false);
    }
    for (const key of GLASS_SETTING_KEYS) {
      const glass = { ...settings.glass } as unknown as Record<string, unknown>;
      delete glass[key];
      expect(isSettings({ ...settings, glass })).toBe(false);
    }
    expect(GLASS_VALUE_KEYS).toEqual(['blurDips']);
    expect(isSettings({ ...settings, extra: true })).toBe(false);
    expect(isSettings({ ...settings, glass: { ...settings.glass, extra: true } })).toBe(false);
    expect(isSettings({ ...settings, glass: null })).toBe(false);
    expect(isSettingsPatch({ glass: { blurDips: 2 } })).toBe(true);
    expect(isSettingsPatch({ glass: { blurDips: 74 } })).toBe(true);
    expect(isSettingsPatch({ glass: { blurDips: 1 } })).toBe(false);
    expect(isSettingsPatch({ glass: { blurDips: 2.5 } })).toBe(false);
    expect(isSettingsPatch({ glass: { intensity: 35 } })).toBe(false);
    expect(isSettingsPatch({ glass: { tone: 0 } })).toBe(false);
    expect(isSettingsPatch({ glass: { opacity: 35 } })).toBe(false);
    expect(isSettingsPatch({ glass: {} })).toBe(false);
    expect(isSettingsPatch({})).toBe(false);
  });

  it('resolves presets and preserves only the enabled flag when resetting', () => {
    for (const [name, values] of Object.entries(GLASS_PRESETS)) {
      expect(resolveGlassPreset({ enabled: false, ...values })).toBe(name);
    }
    expect(resolveGlassPreset({ ...DEFAULT_SETTINGS.glass, blurDips: 31 })).toBe('custom');
    expect(resolveGlassPreset({ ...DEFAULT_SETTINGS.glass, enabled: false })).toBe('regular');
  });

  it('rejects the removed glass.layout.set message and validates native boundaries', () => {
    expect(
      isWebToNativeMessage({
        v: PROTOCOL_VERSION,
        type: 'terminal.resize',
        payload: { cols: 80, rows: 24 },
      }),
    ).toBe(true);
    expect(
      isWebToNativeMessage({
        v: PROTOCOL_VERSION,
        type: 'glass.layout.set',
        payload: { revision: 1, regions: [] },
      }),
    ).toBe(false);
    expect(
      isWebToNativeMessage({
        v: PROTOCOL_VERSION,
        type: 'clipboard.write',
        payload: { requestId: 'clip-1', text: 'a'.repeat(LIMITS.maxClipboardBytes + 1) },
      }),
    ).toBe(false);
    expect(isWindowRuntimeState({ maximized: true, fullscreen: false, active: true })).toBe(true);
    expect(
      isNativeToWebMessage({
        v: PROTOCOL_VERSION,
        type: 'settings.result',
        payload: { transactionId: 'settings-1', operation: 'apply', ok: true },
      }),
    ).toBe(true);
    expect(
      isNativeToWebMessage({
        v: PROTOCOL_VERSION,
        type: 'settings.result',
        payload: { transactionId: 'settings-1', operation: 'save', ok: true },
      }),
    ).toBe(false);
  });
});
