import type { ResolvedTheme } from '../../shared/contracts';
import { BACKGROUND_OPACITY_MAX, BACKGROUND_OPACITY_MIN } from '../../shared/settings';

export function resolveBackgroundEffectVariables(
  theme: ResolvedTheme,
  backgroundOpacity: number,
  adjustableTransparencyActive: boolean,
): Record<string, string | number> {
  const boundedOpacity = Math.min(
    BACKGROUND_OPACITY_MAX,
    Math.max(BACKGROUND_OPACITY_MIN, backgroundOpacity),
  );
  const effectStrength = adjustableTransparencyActive ? boundedOpacity / BACKGROUND_OPACITY_MAX : 1;
  const controlRgb = theme === 'light' ? '0 0 0' : '255 255 255';
  const haloRgb = theme === 'light' ? '255 255 255' : '0 0 0';

  return {
    '--background-opacity': boundedOpacity / 100,
    '--effect-strength': effectStrength,
    '--effect-blur': `${30 * effectStrength}px`,
    '--background-noise-opacity': 0.01 * effectStrength,
    '--control-fill': `rgb(${controlRgb} / ${(theme === 'light' ? 0.055 : 0.06) * effectStrength})`,
    '--control-fill-hover': `rgb(${controlRgb} / ${(theme === 'light' ? 0.09 : 0.1) * effectStrength})`,
    '--control-fill-strong': `rgb(${controlRgb} / ${(theme === 'light' ? 0.13 : 0.14) * effectStrength})`,
    '--terminal-halo-color': `rgb(${haloRgb} / ${(theme === 'light' ? 0.78 : 0.72) * effectStrength})`,
    '--danger-fill-percent': `${14 * effectStrength}%`,
    '--bell-fill-percent': `${5 * effectStrength}%`,
  };
}
