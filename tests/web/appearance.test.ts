import { cssAppearance, resolveForeground } from '../../web/src/appearance';
import { messages, resolveLocale } from '../../web/src/i18n';
import { describe, expect, it } from 'vitest';

describe('appearance and locale', () => {
  it('selects the higher-contrast fixed foreground in auto mode', () => {
    expect(resolveForeground('#000000', 'auto')).toBe('light');
    expect(resolveForeground('#FFFFFF', 'auto')).toBe('dark');
    expect(resolveForeground('#FFFFFF', 'light')).toBe('dark');
    expect(resolveForeground('#000000', 'dark')).toBe('light');
  });

  it('uses the selected tint without following the Windows light/dark theme', () => {
    const css = cssAppearance({
      locale: 'system',
      glass: { enabled: true, preset: 'clear', tint: '#F0F0F0' },
      foreground: 'auto',
      animations: false,
      uiScale: 100,
    });
    expect(css['--tint']).toBe('#F0F0F0');
    expect(css['--text']).toBe('#000000');
  });

  it('keeps English and Japanese dictionaries in lockstep', () => {
    expect(Object.keys(messages.ja).sort()).toEqual(Object.keys(messages.en).sort());
    expect(resolveLocale('system', 'ja-JP')).toBe('ja');
    expect(resolveLocale('system', 'en-US')).toBe('en');
  });
});
