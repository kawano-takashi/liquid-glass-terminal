import { describe, expect, it } from 'vitest';
import {
  FROST_BLUR_AMOUNTS,
  FROST_STRENGTH_DEFAULT,
  resolveFrostBlurAmount,
} from '../../src/shared/settings';

describe('frost blur amounts', () => {
  it('defines 14 strictly increasing transparent-first levels', () => {
    expect(FROST_BLUR_AMOUNTS).toEqual([0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 17, 20, 24]);
    expect(FROST_BLUR_AMOUNTS).toHaveLength(14);
    expect(
      FROST_BLUR_AMOUNTS.every(
        (amount, index) => index === 0 || amount > FROST_BLUR_AMOUNTS[index - 1],
      ),
    ).toBe(true);
  });

  it('maps the default and both endpoints to DIPs', () => {
    expect(resolveFrostBlurAmount(0)).toBe(0);
    expect(resolveFrostBlurAmount(FROST_STRENGTH_DEFAULT)).toBe(6);
    expect(resolveFrostBlurAmount(13)).toBe(24);
  });

  it('clamps out-of-range indices and defaults non-finite values', () => {
    expect(resolveFrostBlurAmount(-1)).toBe(0);
    expect(resolveFrostBlurAmount(99)).toBe(24);
    expect(resolveFrostBlurAmount(Number.NaN)).toBe(6);
  });
});
