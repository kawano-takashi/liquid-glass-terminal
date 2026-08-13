import { describe, expect, it } from 'vitest';
import { resolveTerminalTheme } from '../../src/renderer/lib/terminal-theme';

describe('terminal adaptive themes', () => {
  it('uses light glyphs over dark surfaces', () => {
    expect(resolveTerminalTheme('light')).toMatchObject({
      background: '#18181800',
      foreground: '#f5f5f5',
      cursor: '#f5f5f5',
    });
  });

  it('uses dark glyphs and the conservative switch-point RGB over light surfaces', () => {
    expect(resolveTerminalTheme('dark')).toMatchObject({
      background: '#80808000',
      foreground: '#181818',
      cursor: '#181818',
    });
  });
});
