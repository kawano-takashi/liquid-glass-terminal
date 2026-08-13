import path from 'node:path';
import { createRequire } from 'node:module';
import { app, type BrowserWindow } from 'electron';
import type {
  BackdropFailureCode,
  BackdropPreviewPatch,
  NativeBackdropState,
  SettingsV4,
  SystemAppearance,
} from '../shared/contracts';
import {
  FROST_STRENGTH_MAX,
  FROST_STRENGTH_MIN,
  GLASS_OPACITY_MAX,
  GLASS_OPACITY_MIN,
} from '../shared/settings';

export interface WindowsBackdropOptions {
  policyEnabled: boolean;
  glassOpacity: number;
  frostStrength: number;
}

interface BackdropProbeResult {
  supported: boolean;
  fast: boolean;
}

interface WindowsGlassAddon {
  probe(): BackdropProbeResult;
  attach(
    handle: Buffer,
    options: WindowsBackdropOptions,
    onStateChanged: (state: NativeBackdropState) => void,
  ): NativeBackdropState | false;
  update(options: WindowsBackdropOptions): NativeBackdropState | false;
  detach(): void;
}

export class BackdropNativeError extends Error {
  constructor(
    readonly code: BackdropFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BackdropNativeError';
  }
}

export function resolveWindowsBackdropOptions(
  appearance: SystemAppearance,
  screenReaderMode: boolean,
  settings: Pick<SettingsV4, 'glassOpacity' | 'frostStrength'>,
  preview: BackdropPreviewPatch = {},
): WindowsBackdropOptions {
  const glassOpacity = preview.glassOpacity ?? settings.glassOpacity;
  const frostStrength = preview.frostStrength ?? settings.frostStrength;
  return {
    policyEnabled: !appearance.highContrast && !appearance.reducedTransparency && !screenReaderMode,
    glassOpacity: Math.min(GLASS_OPACITY_MAX, Math.max(GLASS_OPACITY_MIN, glassOpacity)),
    frostStrength: Math.min(FROST_STRENGTH_MAX, Math.max(FROST_STRENGTH_MIN, frostStrength)),
  };
}

export class WindowsGlass {
  private addon: WindowsGlassAddon | undefined;
  private attachedWindowId: number | undefined;

  constructor(private readonly onStateChanged: (state: NativeBackdropState) => void) {}

  probe(): BackdropProbeResult {
    let addon: WindowsGlassAddon;
    try {
      addon = this.loadAddon();
    } catch (error: unknown) {
      throw new BackdropNativeError(
        'addon-load-failed',
        'The native frosted-backdrop module could not be loaded.',
        { cause: error },
      );
    }

    let result: BackdropProbeResult;
    try {
      result = addon.probe();
    } catch (error: unknown) {
      throw new BackdropNativeError(
        'effect-graph-failed',
        'The composition effect graph could not be created.',
        { cause: error },
      );
    }
    if (!result.supported) {
      throw new BackdropNativeError(
        'effects-unsupported',
        'Composition effects are unsupported on this system.',
      );
    }
    if (!result.fast) {
      throw new BackdropNativeError(
        'effects-not-fast',
        'Composition effects are not fast on this system.',
      );
    }
    return result;
  }

  apply(window: BrowserWindow, options: WindowsBackdropOptions): NativeBackdropState {
    const addon = this.loadAddonSafely();
    try {
      let state: NativeBackdropState | false;
      if (this.attachedWindowId === window.id) {
        state = addon.update(options);
      } else {
        state = addon.attach(window.getNativeWindowHandle(), options, (nextState) => {
          if (['active', 'policy-disabled', 'capability-lost'].includes(nextState)) {
            this.onStateChanged(nextState);
          }
        });
      }
      if (state === false) throw new Error('Native backdrop operation returned false.');
      this.attachedWindowId = window.id;
      return state;
    } catch (error: unknown) {
      this.attachedWindowId = undefined;
      try {
        addon.detach();
      } catch {
        // Startup and runtime recovery still report the original attach/update failure.
      }
      throw new BackdropNativeError(
        'attach-failed',
        'The frosted backdrop could not be attached.',
        {
          cause: error,
        },
      );
    }
  }

  rebuild(window: BrowserWindow, options: WindowsBackdropOptions): NativeBackdropState {
    this.detach();
    return this.apply(window, options);
  }

  detach(): void {
    if (!this.addon) return;
    try {
      this.addon.detach();
    } catch (error: unknown) {
      console.warn('Failed to detach the native frosted backdrop.', error);
    } finally {
      this.attachedWindowId = undefined;
    }
  }

  private loadAddonSafely(): WindowsGlassAddon {
    try {
      return this.loadAddon();
    } catch (error: unknown) {
      throw new BackdropNativeError(
        'addon-load-failed',
        'The native frosted-backdrop module could not be loaded.',
        { cause: error },
      );
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
}
