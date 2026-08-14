import {
  GLASS_PRESETS,
  resolveGlassPreset,
  toneToHex,
  type Foreground,
  type GlassPreset,
  type Settings,
} from '../../contracts/generated/protocol';

const PREFERRED_LIGHT = '#F5F5F5';
const PREFERRED_DARK = '#202124';
const ABSOLUTE_LIGHT = '#FFFFFF';
const ABSOLUTE_DARK = '#000000';
const MINIMUM_CONTRAST = 4.5;

export { toneToHex };

export type NamedGlassPreset = GlassPreset;
export type GlassPresetState = NamedGlassPreset | 'custom';

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const parts = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!parts) return luminance('#EBEBEB');
  return (
    0.2126 * channel(Number.parseInt(parts[1], 16)) +
    0.7152 * channel(Number.parseInt(parts[2], 16)) +
    0.0722 * channel(Number.parseInt(parts[3], 16))
  );
}

export function contrastRatio(first: string, second: string): number {
  const high = Math.max(luminance(first), luminance(second));
  const low = Math.min(luminance(first), luminance(second));
  return (high + 0.05) / (low + 0.05);
}

export interface ResolvedForeground {
  color: string;
  mode: 'light' | 'dark';
}

function preferredForeground(mode: ResolvedForeground['mode']): string {
  return mode === 'light' ? PREFERRED_LIGHT : PREFERRED_DARK;
}

function absoluteForeground(mode: ResolvedForeground['mode']): string {
  return mode === 'light' ? ABSOLUTE_LIGHT : ABSOLUTE_DARK;
}

export function resolveForeground(tone: number, choice: Foreground): ResolvedForeground {
  const background = toneToHex(tone);
  const lightRatio = contrastRatio(background, PREFERRED_LIGHT);
  const darkRatio = contrastRatio(background, PREFERRED_DARK);
  const firstMode = choice === 'auto' ? (lightRatio >= darkRatio ? 'light' : 'dark') : choice;
  const secondMode = firstMode === 'light' ? 'dark' : 'light';

  for (const mode of [firstMode, secondMode] as const) {
    const color = preferredForeground(mode);
    if (contrastRatio(background, color) >= MINIMUM_CONTRAST) return { color, mode };
  }

  const absoluteLightRatio = contrastRatio(background, ABSOLUTE_LIGHT);
  const absoluteDarkRatio = contrastRatio(background, ABSOLUTE_DARK);
  const mode = absoluteLightRatio >= absoluteDarkRatio ? 'light' : 'dark';
  return { color: absoluteForeground(mode), mode };
}

export function matchingGlassPreset(glass: Settings['glass']): GlassPresetState {
  return resolveGlassPreset(glass);
}

export function withGlassPreset(settings: Settings, preset: NamedGlassPreset): Settings {
  return {
    ...settings,
    glass: {
      enabled: settings.glass.enabled,
      ...GLASS_PRESETS[preset],
    },
  };
}

export function cssAppearance(settings: Settings): Record<string, string> {
  const tone = toneToHex(settings.glass.tone);
  const foreground = resolveForeground(settings.glass.tone, settings.foreground);
  const glassOpacity = Math.min(100, Math.max(0, settings.glass.opacity)) / 100;
  return {
    '--glass-opacity': String(glassOpacity),
    '--tone': tone,
    '--text': foreground.color,
    '--muted': foreground.mode === 'light' ? 'rgb(245 245 245 / 0.68)' : 'rgb(32 33 36 / 0.68)',
    '--control':
      foreground.mode === 'light'
        ? 'rgb(255 255 255 / calc(0.10 * var(--decoration-opacity)))'
        : 'rgb(0 0 0 / calc(0.075 * var(--decoration-opacity)))',
    '--control-hover':
      foreground.mode === 'light' ? 'rgb(255 255 255 / 0.17)' : 'rgb(0 0 0 / 0.13)',
    '--surface-solid': tone,
    '--overlay-solid':
      foreground.mode === 'light'
        ? `color-mix(in srgb, ${tone} 86%, #000000)`
        : `color-mix(in srgb, ${tone} 92%, #FFFFFF)`,
    '--color-scheme': foreground.mode === 'light' ? 'dark' : 'light',
  };
}
