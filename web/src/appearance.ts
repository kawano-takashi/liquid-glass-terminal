import {
  GLASS_PRESETS,
  resolveGlassPreset,
  type Foreground,
  type GlassPreset,
  type Settings,
} from '../../contracts/generated/protocol';

const PREFERRED_LIGHT = '#F5F5F5';
const PREFERRED_DARK = '#202124';

export type NamedGlassPreset = GlassPreset;
export type GlassPresetState = NamedGlassPreset | 'custom';

export interface ResolvedForeground {
  color: string;
  mode: 'light' | 'dark';
}

function systemForeground(): ResolvedForeground {
  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return { color: 'CanvasText', mode: prefersDark ? 'light' : 'dark' };
}

export function resolveForeground(choice: Foreground): ResolvedForeground {
  if (choice === 'auto') return systemForeground();
  return {
    color: choice === 'light' ? PREFERRED_LIGHT : PREFERRED_DARK,
    mode: choice,
  };
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
  const foreground = resolveForeground(settings.foreground);
  const colorScheme =
    settings.foreground === 'auto' ? 'light dark' : foreground.mode === 'light' ? 'dark' : 'light';
  return {
    '--text': foreground.color,
    '--muted': 'color-mix(in srgb, var(--text) 68%, transparent)',
    '--control': 'color-mix(in srgb, var(--text) 10%, transparent)',
    '--control-hover': 'color-mix(in srgb, var(--text) 17%, transparent)',
    '--surface-solid': 'Canvas',
    '--overlay-solid': 'Canvas',
    '--color-scheme': colorScheme,
  };
}
