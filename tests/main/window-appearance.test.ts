import { describe, expect, it } from 'vitest';
import { resolveGlassAppearance } from '../../src/main/window-appearance';

const normalAppearance = {
  resolvedTheme: 'dark' as const,
  highContrast: false,
  reducedTransparency: false,
};

describe('resolveGlassAppearance', () => {
  it('uses official Acrylic only on a supported Windows host', () => {
    expect(
      resolveGlassAppearance({
        platform: 'win32',
        windowsAcrylicAvailable: true,
        systemAppearance: normalAppearance,
        screenReaderMode: false,
      }),
    ).toEqual({ glassMode: 'acrylic', glassAvailability: 'active' });
    expect(
      resolveGlassAppearance({
        platform: 'win32',
        windowsAcrylicAvailable: false,
        systemAppearance: normalAppearance,
        screenReaderMode: false,
      }),
    ).toEqual({ glassMode: 'pseudo', glassAvailability: 'unsupported' });
  });

  it('uses under-window Vibrancy on macOS and pseudo glass on Linux', () => {
    expect(
      resolveGlassAppearance({
        platform: 'darwin',
        windowsAcrylicAvailable: false,
        systemAppearance: normalAppearance,
        screenReaderMode: false,
      }),
    ).toEqual({ glassMode: 'vibrancy', glassAvailability: 'active' });
    expect(
      resolveGlassAppearance({
        platform: 'linux',
        windowsAcrylicAvailable: false,
        systemAppearance: normalAppearance,
        screenReaderMode: false,
      }),
    ).toEqual({ glassMode: 'pseudo', glassAvailability: 'unsupported' });
  });

  it.each([
    ['fallback', 'system-fallback'],
    ['high-contrast', 'accessibility-disabled'],
  ] as const)('reports Windows controller state %s', (windowsGlassState, availability) => {
    expect(
      resolveGlassAppearance({
        platform: 'win32',
        windowsAcrylicAvailable: true,
        windowsGlassState,
        systemAppearance: normalAppearance,
        screenReaderMode: false,
      }),
    ).toEqual({ glassMode: 'acrylic', glassAvailability: availability });
  });

  it.each([
    { highContrast: true, reducedTransparency: false, screenReaderMode: false },
    { highContrast: false, reducedTransparency: true, screenReaderMode: false },
    { highContrast: false, reducedTransparency: false, screenReaderMode: true },
  ])('forces an opaque fallback for accessibility: %o', (accessibility) => {
    expect(
      resolveGlassAppearance({
        platform: 'win32',
        windowsAcrylicAvailable: true,
        systemAppearance: {
          ...normalAppearance,
          highContrast: accessibility.highContrast,
          reducedTransparency: accessibility.reducedTransparency,
        },
        screenReaderMode: accessibility.screenReaderMode,
      }),
    ).toEqual({ glassMode: 'pseudo', glassAvailability: 'accessibility-disabled' });
  });
});
