import type {
  GlassAvailability,
  GlassMode,
  SystemAppearance,
  WindowsGlassState,
} from '../shared/contracts';

export interface GlassModeInput {
  windowsAcrylicAvailable: boolean;
  windowsGlassState?: WindowsGlassState;
  systemAppearance: SystemAppearance;
  screenReaderMode: boolean;
}

export interface ResolvedGlassAppearance {
  glassMode: GlassMode;
  glassAvailability: GlassAvailability;
}

export function resolveGlassAppearance(input: GlassModeInput): ResolvedGlassAppearance {
  if (
    input.systemAppearance.highContrast ||
    input.systemAppearance.reducedTransparency ||
    input.screenReaderMode
  ) {
    return { glassMode: 'pseudo', glassAvailability: 'accessibility-disabled' };
  }
  if (!input.windowsAcrylicAvailable) {
    return { glassMode: 'pseudo', glassAvailability: 'unsupported' };
  }
  if (input.windowsGlassState === 'fallback') {
    return { glassMode: 'acrylic', glassAvailability: 'system-fallback' };
  }
  if (input.windowsGlassState === 'high-contrast') {
    return { glassMode: 'pseudo', glassAvailability: 'accessibility-disabled' };
  }
  return { glassMode: 'acrylic', glassAvailability: 'active' };
}
