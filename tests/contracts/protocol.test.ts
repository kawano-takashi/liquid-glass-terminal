import {
  LIMITS,
  PROTOCOL_VERSION,
  isNativeToWebMessage,
  isSettings,
  isSettingsPatch,
  isWebToNativeMessage,
  type Settings,
} from '../../contracts/generated/protocol';
import { describe, expect, it } from 'vitest';

const settings: Settings = {
  locale: 'ja',
  glass: { enabled: true, preset: 'regular', tint: '#181818' },
  foreground: 'auto',
  animations: true,
  uiScale: 100,
};

describe('generated protocol validators', () => {
  it('accepts exact settings and rejects unknown or invalid values', () => {
    expect(isSettings(settings)).toBe(true);
    expect(isSettings({ ...settings, extra: true })).toBe(false);
    expect(isSettings({ ...settings, uiScale: 105 })).toBe(false);
    expect(isSettings({ ...settings, glass: { ...settings.glass, tint: 'red' } })).toBe(false);
    expect(isSettingsPatch({ glass: { preset: 'dense' }, animations: false })).toBe(true);
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
