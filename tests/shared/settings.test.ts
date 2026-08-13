import { describe, expect, it } from 'vitest';
import {
  FROST_BLUR_AMOUNTS,
  FROST_STRENGTH_DEFAULT,
  resolveForegroundTone,
  resolveFrostBlurAmount,
} from '../../src/shared/settings';

describe('frost blur amounts', () => {
  it('defines 14 strictly increasing transparent-first levels', () => {
    expect(FROST_BLUR_AMOUNTS).toEqual([0, 2, 3, 4, 5, 6, 9, 12, 16, 22, 30, 41, 55, 74]);
    expect(FROST_BLUR_AMOUNTS).toHaveLength(14);
    expect(
      FROST_BLUR_AMOUNTS.every(
        (amount, index) => index === 0 || amount > FROST_BLUR_AMOUNTS[index - 1],
      ),
    ).toBe(true);
  });

  it('maps the default and both endpoints to DIPs', () => {
    expect(resolveFrostBlurAmount(0)).toBe(0);
    expect(resolveFrostBlurAmount(FROST_STRENGTH_DEFAULT)).toBe(9);
    expect(resolveFrostBlurAmount(13)).toBe(74);
  });

  it('clamps out-of-range indices and defaults non-finite values', () => {
    expect(resolveFrostBlurAmount(-1)).toBe(0);
    expect(resolveFrostBlurAmount(99)).toBe(74);
    expect(resolveFrostBlurAmount(Number.NaN)).toBe(9);
  });

  it('uses the same contrast-based foreground rule at every active frost level', () => {
    expect(resolveForegroundTone(true, -50)).toBe('dark');
    expect(resolveForegroundTone(true, -45)).toBe('light');
    expect(resolveForegroundTone(true, -100)).toBe('dark');
    expect(resolveForegroundTone(false, -100)).toBe('light');
  });
});
