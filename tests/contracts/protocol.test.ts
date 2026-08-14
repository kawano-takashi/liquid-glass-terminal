import {
  DEFAULT_SETTINGS,
  FROST_BLUR_DIPS,
  GLASS_SETTING_KEYS,
  GLASS_PRESETS,
  GLASS_VALUE_KEYS,
  LIMITS,
  PROTOCOL_VERSION,
  SETTINGS_CONSTRAINTS,
  SETTINGS_KEYS,
  SETTINGS_OPERATIONS,
  UI_METRICS,
  frostBlurDip,
  grainOpacity,
  isNativeToWebMessage,
  isSettings,
  isSettingsPatch,
  isWindowRuntimeState,
  isWebToNativeMessage,
  resolveGlassPreset,
  toneToChannel,
  toneToHex,
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
  it('generates the complete v2 material metadata from the IDL', () => {
    expect(PROTOCOL_VERSION).toBe(2);
    expect(SETTINGS_OPERATIONS).toEqual(['preview', 'apply', 'cancel']);
    expect(UI_METRICS).toEqual({ titlebarHeightDip: 56, captionButtonWidthDip: 46 });
    expect(SETTINGS_CONSTRAINTS).toEqual({
      frostThickness: { minimum: 0, maximum: 13, step: 1 },
      opacity: { minimum: 0, maximum: 100, step: 5 },
      tone: { minimum: 0, maximum: 100, step: 1 },
      grain: { minimum: 0, maximum: 100, step: 1 },
      uiScale: { minimum: 80, maximum: 200, step: 10 },
    });
    expect(FROST_BLUR_DIPS).toEqual([0, 2, 3, 4, 5, 6, 9, 12, 16, 22, 30, 41, 55, 74]);
    expect(GLASS_PRESETS).toEqual({
      clear: { frostThickness: 5, opacity: 20, tone: 92, grain: 0 },
      regular: { frostThickness: 10, opacity: 35, tone: 92, grain: 0 },
      dense: { frostThickness: 12, opacity: 50, tone: 92, grain: 0 },
    });
    expect(DEFAULT_SETTINGS.glass).toEqual({
      enabled: true,
      frostThickness: 10,
      opacity: 35,
      tone: 92,
      grain: 0,
    });
    expect(toneToHex(92)).toBe('#EBEBEB');
    expect(grainOpacity(0)).toBe(0);
    expect(grainOpacity(SETTINGS_CONSTRAINTS.grain.maximum)).toBeCloseTo(0.03);
    expect(resolveGlassPreset({ ...DEFAULT_SETTINGS.glass })).toBe('regular');
    expect(resolveGlassPreset({ ...DEFAULT_SETTINGS.glass, tone: 91 })).toBe('custom');
  });

  it('implements the tone formula and blur lookup at every defined value', () => {
    for (
      let tone = SETTINGS_CONSTRAINTS.tone.minimum;
      tone <= SETTINGS_CONSTRAINTS.tone.maximum;
      tone += SETTINGS_CONSTRAINTS.tone.step
    ) {
      const expected = Math.floor((tone * 255 + 50) / 100);
      const channel = expected.toString(16).padStart(2, '0').toUpperCase();
      expect(toneToChannel(tone)).toBe(expected);
      expect(toneToHex(tone)).toBe(`#${channel}${channel}${channel}`);
    }
    FROST_BLUR_DIPS.forEach((blur, index) => expect(frostBlurDip(index)).toBe(blur));
    expect(frostBlurDip(-1)).toBe(FROST_BLUR_DIPS[DEFAULT_SETTINGS.glass.frostThickness]);
    expect(frostBlurDip(FROST_BLUR_DIPS.length)).toBe(
      FROST_BLUR_DIPS[DEFAULT_SETTINGS.glass.frostThickness],
    );
  });

  it('accepts every numeric boundary and step while rejecting fractions and adjacent invalid values', () => {
    const withGlass = (
      patch: Partial<Settings['glass']>,
      root: Partial<Pick<Settings, 'uiScale'>> = {},
    ): Settings => ({
      ...settings,
      ...root,
      glass: { ...settings.glass, ...patch },
    });
    const valid = [
      withGlass({ frostThickness: 0 }),
      withGlass({ frostThickness: 1 }),
      withGlass({ frostThickness: 13 }),
      withGlass({ opacity: 0 }),
      withGlass({ opacity: 5 }),
      withGlass({ opacity: 100 }),
      withGlass({ tone: 0 }),
      withGlass({ tone: 1 }),
      withGlass({ tone: 100 }),
      withGlass({ grain: 0 }),
      withGlass({ grain: 1 }),
      withGlass({ grain: 100 }),
      withGlass({}, { uiScale: 80 }),
      withGlass({}, { uiScale: 90 }),
      withGlass({}, { uiScale: 200 }),
    ];
    valid.forEach((value) => expect(isSettings(value)).toBe(true));

    const invalid = [
      withGlass({ frostThickness: -1 }),
      withGlass({ frostThickness: 14 }),
      withGlass({ frostThickness: 0.5 }),
      withGlass({ opacity: -1 }),
      withGlass({ opacity: 101 }),
      withGlass({ opacity: 1 }),
      withGlass({ opacity: 2.5 }),
      withGlass({ tone: -1 }),
      withGlass({ tone: 101 }),
      withGlass({ tone: 0.5 }),
      withGlass({ grain: -1 }),
      withGlass({ grain: 101 }),
      withGlass({ grain: 0.5 }),
      withGlass({}, { uiScale: 79 }),
      withGlass({}, { uiScale: 201 }),
      withGlass({}, { uiScale: 85 }),
      withGlass({}, { uiScale: 80.5 }),
    ];
    invalid.forEach((value) => expect(isSettings(value)).toBe(false));
  });

  it('requires the exact v2 Settings shape and rejects every removed v1 glass key', () => {
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
    expect(isSettings({ ...settings, unknown: true })).toBe(false);
    expect(isSettings({ ...settings, glass: { ...settings.glass, unknown: true } })).toBe(false);
    expect(isSettings({ ...settings, glass: { ...settings.glass, preset: 'regular' } })).toBe(
      false,
    );
    expect(isSettings({ ...settings, glass: { ...settings.glass, tint: '#EBEBEB' } })).toBe(false);
    expect(isSettings({ ...settings, preset: 'regular' })).toBe(false);
    expect(isSettings({ ...settings, locale: 'fr' })).toBe(false);
    expect(isSettings({ ...settings, foreground: 'sepia' })).toBe(false);
    expect(isSettings({ ...settings, animations: 'true' })).toBe(false);
    expect(isSettings({ ...settings, glass: null })).toBe(false);
    expect(isSettings({ ...settings, glass: { ...settings.glass, enabled: 1 } })).toBe(false);
  });

  it('resolves every preset, detects each customized value, and resets only appearance values', () => {
    for (const [name, values] of Object.entries(GLASS_PRESETS)) {
      expect(resolveGlassPreset({ enabled: false, ...values })).toBe(name);
    }
    const customValues = {
      frostThickness: 7,
      opacity: 40,
      tone: 91,
      grain: 1,
    } as const;
    for (const key of GLASS_VALUE_KEYS) {
      expect(
        resolveGlassPreset({
          ...DEFAULT_SETTINGS.glass,
          [key]: customValues[key],
        }),
      ).toBe('custom');
    }

    const customized: Settings = {
      locale: 'ja',
      glass: { enabled: false, frostThickness: 7, opacity: 40, tone: 60, grain: 12 },
      foreground: 'dark',
      animations: false,
      uiScale: 140,
    };
    const reset: Settings = {
      ...customized,
      glass: { enabled: customized.glass.enabled, ...GLASS_PRESETS.regular },
    };
    expect(reset).toEqual({
      ...customized,
      glass: { enabled: false, frostThickness: 10, opacity: 35, tone: 92, grain: 0 },
    });
    expect(resolveGlassPreset(reset.glass)).toBe('regular');
  });

  it('accepts exact v2 settings and rejects old, unknown, fractional, or out-of-range values', () => {
    expect(isSettings(settings)).toBe(true);
    expect(isSettings({ ...settings, extra: true })).toBe(false);
    expect(isSettings({ ...settings, uiScale: 105 })).toBe(false);
    expect(isSettings({ ...settings, glass: { ...settings.glass, frostThickness: 14 } })).toBe(
      false,
    );
    expect(isSettings({ ...settings, glass: { ...settings.glass, frostThickness: 1.5 } })).toBe(
      false,
    );
    expect(isSettings({ ...settings, glass: { ...settings.glass, opacity: 33 } })).toBe(false);
    expect(isSettings({ ...settings, glass: { ...settings.glass, opacity: 35.5 } })).toBe(false);
    expect(isSettings({ ...settings, glass: { ...settings.glass, tone: 101 } })).toBe(false);
    expect(isSettings({ ...settings, glass: { ...settings.glass, grain: -1 } })).toBe(false);
    expect(
      isSettings({
        ...settings,
        glass: { enabled: true, preset: 'regular', tint: '#181818' },
      }),
    ).toBe(false);
    expect(isSettingsPatch({ glass: { opacity: 35 }, animations: false })).toBe(true);
    expect(isSettingsPatch({ glass: { frostThickness: 0, opacity: 0, tone: 0, grain: 0 } })).toBe(
      true,
    );
    expect(isSettingsPatch({ glass: { opacity: 33 } })).toBe(false);
    expect(isSettingsPatch({ glass: { preset: 'dense' } })).toBe(false);
    expect(isSettingsPatch({ glass: {} })).toBe(false);
    expect(isSettingsPatch({})).toBe(false);
  });

  it('validates web messages, region uniqueness, and byte limits', () => {
    expect(
      isWebToNativeMessage({
        v: PROTOCOL_VERSION,
        type: 'terminal.resize',
        payload: { cols: 80, rows: 24 },
      }),
    ).toBe(true);
    expect(
      isWebToNativeMessage({
        v: 1,
        type: 'terminal.resize',
        payload: { cols: 80, rows: 24 },
      }),
    ).toBe(false);
    expect(
      isWebToNativeMessage({
        v: PROTOCOL_VERSION,
        type: 'terminal.resize',
        payload: { cols: 1, rows: 24 },
      }),
    ).toBe(false);
    const region = {
      id: 'terminal',
      x: 12,
      y: 56,
      width: 900,
      height: 600,
      radii: [16, 16, 16, 16],
      role: 'terminal',
    } as const;
    expect(
      isWebToNativeMessage({
        v: PROTOCOL_VERSION,
        type: 'glass.layout.set',
        payload: { revision: 1, regions: [region] },
      }),
    ).toBe(true);
    expect(
      isWebToNativeMessage({
        v: PROTOCOL_VERSION,
        type: 'glass.layout.set',
        payload: { revision: 2, regions: [region, region] },
      }),
    ).toBe(false);
    expect(
      isWebToNativeMessage({
        v: PROTOCOL_VERSION,
        type: 'clipboard.write',
        payload: { requestId: 'clip-1', text: 'a'.repeat(LIMITS.maxClipboardBytes + 1) },
      }),
    ).toBe(false);
  });

  it('validates every native boundary rather than trusting the message type', () => {
    expect(
      isNativeToWebMessage({
        v: PROTOCOL_VERSION,
        type: 'bridge.accepted',
        payload: {
          sessionId: 'terminal-1',
          settings,
          capabilities: {
            glass: true,
            sharedBuffers: true,
            reducedMotion: false,
            screenReader: false,
            highContrast: false,
          },
          windowState: { maximized: false, fullscreen: false, active: true },
        },
      }),
    ).toBe(true);
    expect(isWindowRuntimeState({ maximized: true, fullscreen: false, active: true })).toBe(true);
    expect(
      isWindowRuntimeState({ maximized: true, fullscreen: false, active: true, extra: false }),
    ).toBe(false);
    for (const operation of SETTINGS_OPERATIONS) {
      expect(
        isNativeToWebMessage({
          v: PROTOCOL_VERSION,
          type: 'settings.result',
          payload: { transactionId: 'settings-1', operation, ok: true },
        }),
      ).toBe(true);
    }
    expect(
      isNativeToWebMessage({
        v: PROTOCOL_VERSION,
        type: 'settings.result',
        payload: { transactionId: 'settings-1', ok: true },
      }),
    ).toBe(false);
    expect(
      isNativeToWebMessage({
        v: PROTOCOL_VERSION,
        type: 'settings.result',
        payload: { transactionId: 'settings-1', operation: 'save', ok: true },
      }),
    ).toBe(false);
    expect(
      isNativeToWebMessage({
        v: PROTOCOL_VERSION,
        type: 'window.state.changed',
        payload: { maximized: true, fullscreen: false, active: false },
      }),
    ).toBe(true);
    expect(
      isNativeToWebMessage({
        v: PROTOCOL_VERSION,
        type: 'capabilities.changed',
        payload: {
          glass: true,
          sharedBuffers: true,
          reducedMotion: true,
          screenReader: false,
          highContrast: true,
        },
      }),
    ).toBe(true);
    expect(
      isNativeToWebMessage({
        v: PROTOCOL_VERSION,
        type: 'capabilities.changed',
        payload: {
          glass: true,
          sharedBuffers: true,
          reducedMotion: true,
          screenReader: false,
          highContrast: true,
          unexpected: true,
        },
      }),
    ).toBe(false);
    expect(
      isNativeToWebMessage({
        v: PROTOCOL_VERSION,
        type: 'terminal.buffer.attach',
        payload: { direction: 'input', buffer: 2, generation: 1, capacity: 65_536 },
      }),
    ).toBe(false);
    expect(
      isNativeToWebMessage({
        v: PROTOCOL_VERSION,
        type: 'app.notice',
        payload: { level: 'fatal', message: 'invalid level' },
      }),
    ).toBe(false);
  });
});
