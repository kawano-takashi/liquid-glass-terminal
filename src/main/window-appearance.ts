import type { GlassMode, SystemAppearance } from '../shared/contracts';

export interface GlassModeInput {
  platform: NodeJS.Platform;
  windowsAcrylicAvailable: boolean;
  systemAppearance: SystemAppearance;
  screenReaderMode: boolean;
}

export function resolveGlassMode(input: GlassModeInput): GlassMode {
  if (
    input.systemAppearance.highContrast ||
    input.systemAppearance.reducedTransparency ||
    input.screenReaderMode
  ) {
    return 'pseudo';
  }
  if (input.platform === 'win32' && input.windowsAcrylicAvailable) return 'acrylic';
  if (input.platform === 'darwin') return 'vibrancy';
  return 'pseudo';
}
