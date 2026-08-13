import { describe, expect, it } from 'vitest';
import {
  BackdropNativeError,
  resolveBackdropFailureCode,
  resolveWindowsBackdropOptions,
} from '../../src/main/windows-glass';

const normalAppearance = {
  highContrast: false,
  reducedTransparency: false,
};

describe('Windows frosted-backdrop values', () => {
  it('passes the independent default contrast and frost settings', () => {
    expect(
      resolveWindowsBackdropOptions(normalAppearance, false, {
        glassContrast: 0,
        frostStrength: 6,
      }),
    ).toEqual({
      policyEnabled: true,
      glassContrast: 0,
      frostBlurAmount: 9,
    });
  });

  it('applies a structured live preview without mutating saved settings', () => {
    const saved = { glassContrast: 0, frostStrength: 6 };
    expect(
      resolveWindowsBackdropOptions(normalAppearance, false, saved, {
        glassContrast: -100,
        frostStrength: 13,
      }),
    ).toMatchObject({ glassContrast: -100, frostBlurAmount: 74 });
    expect(saved).toEqual({ glassContrast: 0, frostStrength: 6 });
  });

  it('maps the minimum frost level to zero blur', () => {
    expect(
      resolveWindowsBackdropOptions(normalAppearance, false, {
        glassContrast: 0,
        frostStrength: 0,
      }),
    ).toMatchObject({ frostBlurAmount: 0 });
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
        { glassContrast: 0, frostStrength: 6 },
      ).policyEnabled,
    ).toBe(false);
  });

  it('clamps defense-in-depth values to native endpoints', () => {
    expect(
      resolveWindowsBackdropOptions(normalAppearance, false, {
        glassContrast: -101,
        frostStrength: 99,
      }),
    ).toMatchObject({ glassContrast: -100, frostBlurAmount: 74 });
  });
});

describe('Windows frosted-backdrop failure codes', () => {
  it('preserves a stable native startup failure code', () => {
    expect(
      resolveBackdropFailureCode(
        new BackdropNativeError('effects-not-fast', 'Composition effects are not fast.'),
        'attach-failed',
      ),
    ).toBe('effects-not-fast');
  });

  it('uses the caller fallback for an unclassified failure', () => {
    expect(resolveBackdropFailureCode(new Error('unexpected'), 'attach-failed')).toBe(
      'attach-failed',
    );
  });
});
