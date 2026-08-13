import { describe, expect, it } from 'vitest';
import { resolveGlassAppearance } from '../../src/main/window-appearance';

const normalAppearance = {
  resolvedTheme: 'dark' as const,
  highContrast: false,
  reducedTransparency: false,
};

describe('resolveGlassAppearance', () => {
  it('uses official Acrylic when the native controller is available', () => {
    expect(
      resolveGlassAppearance({
        windowsAcrylicAvailable: true,
        systemAppearance: normalAppearance,
        screenReaderMode: false,
      }),
    ).toEqual({ glassMode: 'acrylic', glassAvailability: 'active' });
    expect(
      resolveGlassAppearance({
        windowsAcrylicAvailable: false,
        systemAppearance: normalAppearance,
        screenReaderMode: false,
      }),
    ).toEqual({ glassMode: 'pseudo', glassAvailability: 'unsupported' });
  });

  it('reports an opaque Windows controller fallback', () => {
    expect(
      resolveGlassAppearance({
        windowsAcrylicAvailable: true,
        windowsGlassState: 'fallback',
        systemAppearance: normalAppearance,
        screenReaderMode: false,
      }),
    ).toEqual({ glassMode: 'acrylic', glassAvailability: 'system-fallback' });
  });

  it('forces pseudo glass when the Windows controller reports high contrast', () => {
    expect(
      resolveGlassAppearance({
        windowsAcrylicAvailable: true,
        windowsGlassState: 'high-contrast',
        systemAppearance: normalAppearance,
        screenReaderMode: false,
      }),
    ).toEqual({ glassMode: 'pseudo', glassAvailability: 'accessibility-disabled' });
  });

  it.each([
    { highContrast: true, reducedTransparency: false, screenReaderMode: false },
    { highContrast: false, reducedTransparency: true, screenReaderMode: false },
    { highContrast: false, reducedTransparency: false, screenReaderMode: true },
  ])('forces an opaque fallback for accessibility: %o', (accessibility) => {
    expect(
      resolveGlassAppearance({
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
