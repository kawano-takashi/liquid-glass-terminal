import { describe, expect, it } from 'vitest';
import { resolveBackdropAppearance } from '../../src/main/window-appearance';

const normalAppearance = {
  highContrast: false,
  reducedTransparency: false,
};

describe('resolveBackdropAppearance', () => {
  it('uses the frosted backdrop when capabilities and policy are active', () => {
    expect(
      resolveBackdropAppearance({
        nativeState: 'active',
        systemAppearance: normalAppearance,
        screenReaderMode: false,
      }),
    ).toEqual({ backdropMode: 'frosted', backdropStatus: 'active' });
  });

  it.each([
    { highContrast: true, reducedTransparency: false, screenReaderMode: false },
    { highContrast: false, reducedTransparency: true, screenReaderMode: false },
    { highContrast: false, reducedTransparency: false, screenReaderMode: true },
  ])('uses opaque output for accessibility policy: %o', (policy) => {
    expect(
      resolveBackdropAppearance({
        nativeState: 'active',
        systemAppearance: {
          ...normalAppearance,
          highContrast: policy.highContrast,
          reducedTransparency: policy.reducedTransparency,
        },
        screenReaderMode: policy.screenReaderMode,
      }),
    ).toEqual({ backdropMode: 'opaque', backdropStatus: 'policy-disabled' });
  });

  it('honors the native energy-saver, remote-session, or Windows-effects policy', () => {
    expect(
      resolveBackdropAppearance({
        nativeState: 'policy-disabled',
        systemAppearance: normalAppearance,
        screenReaderMode: false,
      }),
    ).toEqual({ backdropMode: 'opaque', backdropStatus: 'policy-disabled' });
  });

  it('makes runtime failure sticky and exposes its stable code', () => {
    expect(
      resolveBackdropAppearance({
        nativeState: 'active',
        failureCode: 'runtime-rebuild-failed',
        systemAppearance: normalAppearance,
        screenReaderMode: false,
      }),
    ).toEqual({
      backdropMode: 'opaque',
      backdropStatus: 'runtime-failure',
      backdropFailureCode: 'runtime-rebuild-failed',
    });
  });
});
