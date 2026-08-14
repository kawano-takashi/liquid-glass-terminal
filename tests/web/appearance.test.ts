import { DEFAULT_SETTINGS, type Settings } from '../../contracts/generated/protocol';
import {
  contrastRatio,
  cssAppearance,
  matchingGlassPreset,
  resolveForeground,
  toneToHex,
  withGlassPreset,
} from '../../web/src/appearance';
import { messages, resolveLocale } from '../../web/src/i18n';
import { describe, expect, it } from 'vitest';

const settings = (): Settings => ({
  ...DEFAULT_SETTINGS,
  glass: { ...DEFAULT_SETTINGS.glass },
});

describe('appearance and locale', () => {
  it('uses the preferred graphite and soft-white foregrounds when they are safe', () => {
    expect(resolveForeground(0, 'auto')).toEqual({ color: '#F5F5F5', mode: 'light' });
    expect(resolveForeground(100, 'auto')).toEqual({ color: '#202124', mode: 'dark' });
    expect(resolveForeground(100, 'light').mode).toBe('dark');
    expect(resolveForeground(0, 'dark').mode).toBe('light');
  });

  it('falls back to absolute black or white throughout the mid-tone contrast gap', () => {
    for (let tone = 0; tone <= 100; tone += 1) {
      const foreground = resolveForeground(tone, 'auto');
      expect(contrastRatio(toneToHex(tone), foreground.color)).toBeGreaterThanOrEqual(4.5);
    }
    expect(resolveForeground(50, 'auto')).toEqual({ color: '#000000', mode: 'dark' });
  });

  it('converts tone deterministically and exposes the bright achromatic defaults', () => {
    expect(toneToHex(0)).toBe('#000000');
    expect(toneToHex(92)).toBe('#EBEBEB');
    expect(toneToHex(100)).toBe('#FFFFFF');
    const css = cssAppearance(settings());
    expect(css['--glass-opacity']).toBe('0.35');
    expect(css['--tone']).toBe('#EBEBEB');
    expect(css['--text']).toBe('#202124');
    expect(css['--color-scheme']).toBe('light');

    const transparent = settings();
    transparent.glass.opacity = 0;
    expect(cssAppearance(transparent)['--glass-opacity']).toBe('0');
    transparent.glass.opacity = 100;
    expect(cssAppearance(transparent)['--glass-opacity']).toBe('1');
  });

  it('derives Custom and applies a preset without changing the enabled flag', () => {
    const value = settings();
    expect(matchingGlassPreset(value.glass)).toBe('regular');
    value.glass.opacity = 40;
    expect(matchingGlassPreset(value.glass)).toBe('custom');
    value.glass.enabled = false;
    const dense = withGlassPreset(value, 'dense');
    expect(dense.glass).toEqual({
      enabled: false,
      frostThickness: 12,
      opacity: 50,
      tone: 92,
      grain: 0,
    });
  });

  it('keeps English and Japanese dictionaries in lockstep', () => {
    expect(Object.keys(messages.ja).sort()).toEqual(Object.keys(messages.en).sort());
    expect(resolveLocale('system', 'ja-JP')).toBe('ja');
    expect(resolveLocale('system', 'en-US')).toBe('en');
  });
});
