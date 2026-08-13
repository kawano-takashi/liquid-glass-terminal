import { describe, expect, it } from 'vitest';
import { resolveBackgroundEffectVariables } from '../../src/renderer/lib/background-effects';

describe('background effect variables', () => {
  it('removes every decorative effect at active 0% opacity', () => {
    expect(resolveBackgroundEffectVariables('dark', 0, true)).toEqual({
      '--background-opacity': 0,
      '--effect-strength': 0,
      '--effect-blur': '0px',
      '--background-noise-opacity': 0,
      '--control-fill': 'rgb(255 255 255 / 0)',
      '--control-fill-hover': 'rgb(255 255 255 / 0)',
      '--control-fill-strong': 'rgb(255 255 255 / 0)',
      '--terminal-halo-color': 'rgb(0 0 0 / 0)',
      '--danger-fill-percent': '0%',
      '--bell-fill-percent': '0%',
    });
  });

  it('uses half strength at the 25% default', () => {
    expect(resolveBackgroundEffectVariables('dark', 25, true)).toMatchObject({
      '--background-opacity': 0.25,
      '--effect-strength': 0.5,
      '--effect-blur': '15px',
      '--background-noise-opacity': 0.005,
      '--control-fill': 'rgb(255 255 255 / 0.03)',
      '--terminal-halo-color': 'rgb(0 0 0 / 0.36)',
    });
  });

  it('uses full renderer strength for an opaque fallback while preserving the saved value', () => {
    expect(resolveBackgroundEffectVariables('light', 0, false)).toMatchObject({
      '--background-opacity': 0,
      '--effect-strength': 1,
      '--effect-blur': '30px',
      '--background-noise-opacity': 0.01,
      '--control-fill': 'rgb(0 0 0 / 0.055)',
      '--terminal-halo-color': 'rgb(255 255 255 / 0.78)',
      '--danger-fill-percent': '14%',
      '--bell-fill-percent': '5%',
    });
  });

  it('clamps out-of-range values to the supported endpoints', () => {
    expect(resolveBackgroundEffectVariables('dark', -1, true)['--effect-strength']).toBe(0);
    expect(resolveBackgroundEffectVariables('dark', 100, true)['--effect-strength']).toBe(1);
  });
});
