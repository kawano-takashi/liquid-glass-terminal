import { describe, expect, it } from 'vitest';
import { resolveGlassMode } from '../../src/main/window-appearance';

const normalAppearance = {
  resolvedTheme: 'dark' as const,
  highContrast: false,
  reducedTransparency: false,
};

describe('resolveGlassMode', () => {
  it('uses official Acrylic only on a supported Windows host', () => {
    expect(
      resolveGlassMode({
        platform: 'win32',
        windowsAcrylicAvailable: true,
        systemAppearance: normalAppearance,
        screenReaderMode: false,
      }),
    ).toBe('acrylic');
    expect(
      resolveGlassMode({
        platform: 'win32',
        windowsAcrylicAvailable: false,
        systemAppearance: normalAppearance,
        screenReaderMode: false,
      }),
    ).toBe('pseudo');
  });

  it('uses under-window Vibrancy on macOS and pseudo glass on Linux', () => {
    expect(
      resolveGlassMode({
        platform: 'darwin',
        windowsAcrylicAvailable: false,
        systemAppearance: normalAppearance,
        screenReaderMode: false,
      }),
    ).toBe('vibrancy');
    expect(
      resolveGlassMode({
        platform: 'linux',
        windowsAcrylicAvailable: false,
        systemAppearance: normalAppearance,
        screenReaderMode: false,
      }),
    ).toBe('pseudo');
  });

  it.each([
    { highContrast: true, reducedTransparency: false, screenReaderMode: false },
    { highContrast: false, reducedTransparency: true, screenReaderMode: false },
    { highContrast: false, reducedTransparency: false, screenReaderMode: true },
  ])('forces an opaque fallback for accessibility: %o', (accessibility) => {
    expect(
      resolveGlassMode({
        platform: 'win32',
        windowsAcrylicAvailable: true,
        systemAppearance: {
          ...normalAppearance,
          highContrast: accessibility.highContrast,
          reducedTransparency: accessibility.reducedTransparency,
        },
        screenReaderMode: accessibility.screenReaderMode,
      }),
    ).toBe('pseudo');
  });
});
