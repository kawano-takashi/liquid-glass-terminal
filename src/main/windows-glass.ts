import path from 'node:path';
import { createRequire } from 'node:module';
import { app, type BrowserWindow } from 'electron';
import type { SystemAppearance } from '../shared/contracts';

interface WindowsGlassAddon {
  isSupported(): boolean;
  attach(handle: Buffer, theme: 'light' | 'dark', highContrast: boolean): boolean;
  update(theme: 'light' | 'dark', highContrast: boolean): boolean;
  detach(): void;
}

export class WindowsGlass {
  private addon: WindowsGlassAddon | null | undefined;
  private supported: boolean | undefined;
  private attachedWindowId: number | undefined;
  private reportedError = false;

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

  apply(window: BrowserWindow, appearance: SystemAppearance): boolean {
    if (!this.isSupported()) return false;
    try {
      const addon = this.loadAddon();
      if (
        this.attachedWindowId === window.id &&
        addon.update(appearance.resolvedTheme, appearance.highContrast)
      ) {
        return true;
      }
      const attached = addon.attach(
        window.getNativeWindowHandle(),
        appearance.resolvedTheme,
        appearance.highContrast,
      );
      this.attachedWindowId = attached ? window.id : undefined;
      return attached;
    } catch (error: unknown) {
      this.attachedWindowId = undefined;
      try {
        this.addon?.detach();
      } catch {
        // The opaque renderer fallback remains safe even if native cleanup also fails.
      }
      this.report(error);
      return false;
    }
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
