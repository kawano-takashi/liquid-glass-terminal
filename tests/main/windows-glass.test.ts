import { describe, expect, it } from 'vitest';
import { resolveWindowsBackdropOptions } from '../../src/main/windows-glass';

const normalAppearance = {
  highContrast: false,
  reducedTransparency: false,
};

describe('Windows frosted-backdrop values', () => {
  it('passes the independent default glass and frost settings', () => {
    expect(
      resolveWindowsBackdropOptions(normalAppearance, false, {
        glassOpacity: 25,
        frostStrength: 6,
      }),
    ).toEqual({
      policyEnabled: true,
      glassOpacity: 25,
      frostStrength: 6,
    });
  });

  it('applies a structured live preview without mutating saved settings', () => {
    const saved = { glassOpacity: 25, frostStrength: 6 };
    expect(
      resolveWindowsBackdropOptions(normalAppearance, false, saved, {
        glassOpacity: 0,
        frostStrength: 13,
      }),
    ).toMatchObject({ glassOpacity: 0, frostStrength: 13 });
    expect(saved).toEqual({ glassOpacity: 25, frostStrength: 6 });
  });

  it.each([
    { highContrast: true, reducedTransparency: false, screenReader: false },
    { highContrast: false, reducedTransparency: true, screenReader: false },
    { highContrast: false, reducedTransparency: false, screenReader: true },
  ])('disables native effects for accessibility policy: %o', (policy) => {
    expect(
      resolveWindowsBackdropOptions(
        {
          ...normalAppearance,
          highContrast: policy.highContrast,
          reducedTransparency: policy.reducedTransparency,
        },
        policy.screenReader,
        { glassOpacity: 25, frostStrength: 6 },
      ).policyEnabled,
    ).toBe(false);
  });

  it('clamps defense-in-depth values to native endpoints', () => {
    expect(
      resolveWindowsBackdropOptions(normalAppearance, false, {
        glassOpacity: -1,
        frostStrength: 99,
      }),
    ).toMatchObject({ glassOpacity: 0, frostStrength: 13 });
  });
});
