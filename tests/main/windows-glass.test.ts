import { describe, expect, it } from 'vitest';
import { resolveWindowsAcrylicValues } from '../../src/main/windows-glass';

describe('Windows Acrylic values', () => {
  it('maps the default opacity to a neutral dark Acrylic recipe', () => {
    const values = resolveWindowsAcrylicValues('dark', 60);
    expect(values.tintOpacity).toBe(0.6);
    expect(values.luminosityOpacity).toBeCloseTo(0.678);
    expect(values.neutralTone).toBe(24);
  });

  it('uses the same opacity and a milk-white tint in light mode', () => {
    expect(resolveWindowsAcrylicValues('light', 60)).toMatchObject({
      tintOpacity: 0.6,
      neutralTone: 244,
    });
  });

  it('clamps native preview values to the supported endpoints', () => {
    expect(resolveWindowsAcrylicValues('dark', 0).tintOpacity).toBe(0.1);
    expect(resolveWindowsAcrylicValues('dark', 100).tintOpacity).toBe(0.6);
  });
});
