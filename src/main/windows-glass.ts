import path from 'node:path';
import { createRequire } from 'node:module';
import { app, type BrowserWindow } from 'electron';
import type { SystemAppearance, WindowsGlassState } from '../shared/contracts';
import { GLASS_OPACITY_MAX, GLASS_OPACITY_MIN } from '../shared/settings';

interface WindowsGlassOptions {
  theme: 'light' | 'dark';
  highContrast: boolean;
  tintOpacity: number;
  luminosityOpacity: number;
  neutralTone: number;
}

export interface WindowsAcrylicValues {
  tintOpacity: number;
  luminosityOpacity: number;
  neutralTone: number;
}

export function resolveWindowsAcrylicValues(
  theme: 'light' | 'dark',
  glassOpacity: number,
): WindowsAcrylicValues {
  const tintOpacity = Math.min(
    GLASS_OPACITY_MAX / 100,
    Math.max(GLASS_OPACITY_MIN / 100, glassOpacity / 100),
  );
  return {
    tintOpacity,
    luminosityOpacity: Math.min(1, Math.max(0, 0.15 + 0.88 * tintOpacity)),
    neutralTone: theme === 'dark' ? 24 : 244,
  };
}

interface WindowsGlassAddon {
  isSupported(): boolean;
  attach(
    handle: Buffer,
    options: WindowsGlassOptions,
    onStateChanged: (state: WindowsGlassState) => void,
  ): WindowsGlassState | false;
  update(options: WindowsGlassOptions): WindowsGlassState | false;
  detach(): void;
}

export class WindowsGlass {
  private addon: WindowsGlassAddon | null | undefined;
  private supported: boolean | undefined;
  private attachedWindowId: number | undefined;
  private reportedError = false;

  constructor(private readonly onStateChanged: (state: WindowsGlassState) => void) {}

  isSupported(): boolean {
    if (process.platform !== 'win32') return false;
    if (this.supported !== undefined) return this.supported;
    try {
      this.supported = this.loadAddon().isSupported();
    } catch (error: unknown) {
      this.supported = false;
      this.report(error);
    }
    return this.supported;
  }

  apply(
    window: BrowserWindow,
    appearance: SystemAppearance,
    glassOpacity: number,
  ): WindowsGlassState | undefined {
    if (!this.isSupported()) return undefined;
    try {
      const addon = this.loadAddon();
      const options: WindowsGlassOptions = {
        theme: appearance.resolvedTheme,
        highContrast: appearance.highContrast,
        ...resolveWindowsAcrylicValues(appearance.resolvedTheme, glassOpacity),
      };
      let state: WindowsGlassState | false;
      if (this.attachedWindowId === window.id && (state = addon.update(options)) !== false) {
        return state;
      }
      state = addon.attach(window.getNativeWindowHandle(), options, (nextState) =>
        this.handleStateChanged(nextState),
      );
      this.attachedWindowId = state === false ? undefined : window.id;
      return state === false ? undefined : state;
    } catch (error: unknown) {
      this.attachedWindowId = undefined;
      try {
        this.addon?.detach();
      } catch {
        // The opaque renderer fallback remains safe even if native cleanup also fails.
      }
      this.report(error);
      return undefined;
    }
  }

  private handleStateChanged(state: WindowsGlassState): void {
    if (!['active', 'fallback', 'high-contrast'].includes(state)) return;
    this.onStateChanged(state);
  }

  detach(): void {
    if (!this.addon) return;
    try {
      this.addon.detach();
    } catch (error: unknown) {
      this.report(error);
    } finally {
      this.attachedWindowId = undefined;
    }
  }

  private loadAddon(): WindowsGlassAddon {
    if (this.addon) return this.addon;
    const addonPath = app.isPackaged
      ? path.join(process.resourcesPath, 'windows-glass', 'windows-glass.node')
      : path.resolve(app.getAppPath(), 'native', 'windows-glass', 'dist', 'windows-glass.node');
    const require = createRequire(__filename);
    this.addon = require(addonPath) as WindowsGlassAddon;
    return this.addon;
  }

  private report(error: unknown): void {
    if (this.reportedError) return;
    this.reportedError = true;
    console.warn('Windows Acrylic is unavailable; using opaque pseudo glass.', error);
  }
}
