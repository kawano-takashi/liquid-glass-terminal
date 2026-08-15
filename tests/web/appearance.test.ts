import { DEFAULT_SETTINGS, type Settings } from '../../contracts/generated/protocol';
import {
  cssAppearance,
  matchingGlassPreset,
  resolveForeground,
  withGlassPreset,
} from '../../web/src/appearance';
import { messages, resolveLocale } from '../../web/src/i18n';
import { describe, expect, it } from 'vitest';

const settings = (): Settings => ({
  ...DEFAULT_SETTINGS,
  glass: { ...DEFAULT_SETTINGS.glass },
});

describe('appearance and locale', () => {
  it('uses the fixed explicit foreground colors and the system color for Auto', () => {
    expect(resolveForeground('light')).toEqual({ color: '#F5F5F5', mode: 'light' });
    expect(resolveForeground('dark')).toEqual({ color: '#202124', mode: 'dark' });
    expect(resolveForeground('auto').color).toBe('CanvasText');
  });

  it('does not expose removed tone or opacity CSS variables', () => {
    const css = cssAppearance(settings());
    expect(css['--text']).toBe('CanvasText');
    expect(css['--surface-solid']).toBe('Canvas');
    expect(css['--overlay-solid']).toBe('Canvas');
    expect(css['--color-scheme']).toBe('light dark');
    expect(css['--glass-intensity']).toBeUndefined();
    expect(css['--tone']).toBeUndefined();
  });

  it('derives Custom and applies blur presets without changing enabled', () => {
    const value = settings();
    expect(matchingGlassPreset(value.glass)).toBe('regular');
    value.glass.blurDips = 31;
    expect(matchingGlassPreset(value.glass)).toBe('custom');
    value.glass.enabled = false;
    expect(withGlassPreset(value, 'dense').glass).toEqual({ enabled: false, blurDips: 55 });
  });

  it('keeps English and Japanese dictionaries in lockstep', () => {
    expect(Object.keys(messages.ja).sort()).toEqual(Object.keys(messages.en).sort());
    expect(resolveLocale('system', 'ja-JP')).toBe('ja');
    expect(resolveLocale('system', 'en-US')).toBe('en');
  });
});
