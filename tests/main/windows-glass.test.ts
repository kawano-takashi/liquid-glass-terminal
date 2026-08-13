import { describe, expect, it } from 'vitest';
import { resolveWindowsAcrylicValues } from '../../src/main/windows-glass';

describe('Windows Acrylic values', () => {
  it('maps the default opacity to a neutral dark Acrylic recipe', () => {
    const values = resolveWindowsAcrylicValues('dark', 25);
    expect(values.tintOpacity).toBe(0.25);
    expect(values.luminosityOpacity).toBeCloseTo(0.295);
    expect(values.neutralTone).toBe(24);
  });

  it('uses the same opacity and a milk-white tint in light mode', () => {
    expect(resolveWindowsAcrylicValues('light', 25)).toMatchObject({
      tintOpacity: 0.25,
      neutralTone: 244,
    });
  });

  it('clamps native preview values to the supported endpoints', () => {
    expect(resolveWindowsAcrylicValues('dark', -1)).toMatchObject({
      tintOpacity: 0,
      luminosityOpacity: 0,
    });
    expect(resolveWindowsAcrylicValues('dark', 100)).toMatchObject({
      tintOpacity: 0.5,
      luminosityOpacity: 0.59,
    });
  });
});
