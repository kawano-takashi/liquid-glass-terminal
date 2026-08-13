import os from 'node:os';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  MessageChannelMain,
  nativeTheme,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import type {
  AppCommand,
  BootstrapState,
  GlassAvailability,
  GlassMode,
  SettingsV2,
  SystemAppearance,
  WindowAppearance,
  WindowsGlassState,
} from '../shared/contracts';
import { IPC_CHANNELS } from '../shared/contracts';
import { resolveLocale } from '../shared/i18n';
import {
  isContextMenuState,
  isSessionCreateRequest,
  safeExternalUrl,
  validateSettingsPatch,
  validateGlassOpacity,
} from '../shared/validation';
import { CwdTokenVault, parseLaunchRequest, type LaunchRequest } from './cli';
import {
  installApplicationMenu,
  installClipboardShortcutRouting,
  showTerminalContextMenu,
} from './menu';
import { PtyManager } from './pty-manager';
import {
  hardenSession,
  hardenWindow,
  registerAppProtocol,
  registerPrivilegedScheme,
} from './security';
import { SettingsStore } from './settings-store';
import { ShellProfileRegistry } from './shell-profiles';
import { WindowStateStore } from './window-state';
import { resolveGlassAppearance } from './window-appearance';
import { WindowsGlass } from './windows-glass';

registerPrivilegedScheme();

app.setName('Liquid Glass Terminal');
if (process.platform === 'win32') app.setAppUserModelId('dev.liquidglass.terminal');

const initialLaunch = parseLaunchRequest(process.argv, process.cwd());
const singleInstance = app.requestSingleInstanceLock({ launch: initialLaunch });
if (!singleInstance) app.quit();

let mainWindow: BrowserWindow | undefined;
let settingsStore: SettingsStore;
let profiles: ShellProfileRegistry;
let ptyManager: PtyManager;
let allowWindowClose = false;
let rendererReady = false;
let currentGlassMode: GlassMode = 'pseudo';
let currentGlassAvailability: GlassAvailability = 'unsupported';
let windowsAcrylicAvailable = false;
let windowsGlassState: WindowsGlassState | undefined;
const commandQueue: AppCommand[] = [];
const cwdTokens = new CwdTokenVault();
let initialLaunchCwdToken: string | undefined;
let initialStartupNotice: string | undefined;
const windowsGlass = new WindowsGlass(handleWindowsGlassStateChanged);

function isWindowsAcrylicOsAvailable(): boolean {
  if (process.platform !== 'win32') return false;
  const build = Number(os.release().split('.')[2] ?? 0);
  return Number.isFinite(build) && build >= 22_621;
}

function appearance(): SystemAppearance {
  return {
    resolvedTheme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
    highContrast: nativeTheme.shouldUseHighContrastColors,
    reducedTransparency: nativeTheme.prefersReducedTransparency,
  };
}

function desiredGlassAppearance() {
  return resolveGlassAppearance({
    platform: process.platform,
    windowsAcrylicAvailable,
    windowsGlassState,
    systemAppearance: appearance(),
    screenReaderMode: settingsStore.value.screenReaderMode,
  });
}

function windowAppearance(): WindowAppearance {
  return {
    ...appearance(),
    glassMode: currentGlassMode,
    glassAvailability: currentGlassAvailability,
  };
}

function publishWindowAppearance(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(IPC_CHANNELS.windowAppearance, windowAppearance());
}

function handleWindowsGlassStateChanged(state: WindowsGlassState): void {
  windowsGlassState = state;
  const resolved = desiredGlassAppearance();
  currentGlassMode = resolved.glassMode;
  currentGlassAvailability = resolved.glassAvailability;
  publishWindowAppearance();
}

function locale(): 'en' | 'ja' {
  return resolveLocale(settingsStore.value.locale, app.getLocale());
}

function sendCommand(command: AppCommand): void {
  if (!mainWindow || mainWindow.isDestroyed() || !rendererReady) {
    commandQueue.push(command);
    return;
  }
  mainWindow.webContents.send(IPC_CHANNELS.command, command);
}

function applyNativeAppearance(glassOpacity = settingsStore.value.glassOpacity): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const systemAppearance = appearance();
  let resolved = desiredGlassAppearance();
  if (process.platform === 'win32') {
    if (resolved.glassMode === 'acrylic') {
      const state = windowsGlass.apply(mainWindow, systemAppearance, glassOpacity);
      if (state) {
        windowsGlassState = state;
      } else {
        windowsAcrylicAvailable = false;
        windowsGlassState = undefined;
      }
      resolved = desiredGlassAppearance();
    } else {
      windowsGlass.detach();
      windowsGlassState = undefined;
    }
  }
  if (process.platform === 'darwin') {
    mainWindow.setVibrancy(resolved.glassMode === 'vibrancy' ? 'under-window' : null);
  }
  currentGlassMode = resolved.glassMode;
  currentGlassAvailability = resolved.glassAvailability;
  if (process.platform !== 'darwin') {
    mainWindow.setTitleBarOverlay({
      color: '#00000000',
      symbolColor: nativeTheme.shouldUseDarkColors ? '#f5f5f5' : '#171717',
      height: 44,
    });
  }
  publishWindowAppearance();
}

function rebuildMenu(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  installApplicationMenu(mainWindow, locale(), sendCommand);
}

function isTrustedFrame(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const frame = event.senderFrame;
  if (!frame || frame !== mainWindow.webContents.mainFrame) return false;
  try {
    const url = new URL(frame.url);
    if (url.protocol === 'app:' && url.hostname === 'bundle') return true;
    return (
      MAIN_WINDOW_VITE_DEV_SERVER_URL !== undefined &&
      url.origin === new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin
    );
  } catch {
    return false;
  }
}

function installIpc(): void {
  ipcMain.handle(IPC_CHANNELS.bootstrap, (event): BootstrapState => {
    if (!isTrustedFrame(event)) throw new Error('Untrusted IPC sender');
    return {
      appVersion: app.getVersion(),
      platform: process.platform,
      settings: settingsStore.value,
      profiles: profiles.descriptors(),
      windowAppearance: windowAppearance(),
      ...(initialLaunchCwdToken ? { launchCwdToken: initialLaunchCwdToken } : {}),
      ...(initialStartupNotice ? { startupNotice: initialStartupNotice } : {}),
    };
  });

  ipcMain.handle(IPC_CHANNELS.updateSettings, (event, value: unknown): SettingsV2 => {
    if (!isTrustedFrame(event)) throw new Error('Untrusted IPC sender');
    const patch = validateSettingsPatch(value);
    if (!patch) throw new TypeError('Invalid settings patch');
    const next = settingsStore.update(patch);
    if (patch.theme !== undefined) nativeTheme.themeSource = patch.theme;
    if (patch.locale !== undefined) rebuildMenu();
    applyNativeAppearance();
    return next;
  });

  ipcMain.on(IPC_CHANNELS.previewGlassOpacity, (event, value: unknown) => {
    if (!isTrustedFrame(event)) return;
    const opacity = validateGlassOpacity(value);
    if (opacity === null) return;
    applyNativeAppearance(opacity);
  });

  ipcMain.on(IPC_CHANNELS.requestSession, (event, value: unknown) => {
    if (!isTrustedFrame(event) || !isSessionCreateRequest(value)) return;
    const senderFrame = event.senderFrame;
    if (!senderFrame) return;
    const request = value;
    const { port1, port2 } = new MessageChannelMain();
    const requestedCwd = cwdTokens.consume(request.cwdToken);
    try {
      const { sessionId, profile } = ptyManager.create(
        event.sender.id,
        port1,
        request.profileId,
        requestedCwd,
        request.inheritFromSessionId,
        request.cols,
        request.rows,
      );
      senderFrame.postMessage(
        IPC_CHANNELS.sessionPort,
        {
          source: 'liquid-glass-preload',
          requestId: request.requestId,
          sessionId,
          profile,
        },
        [port2],
      );
      void ptyManager.start(sessionId);
    } catch (error: unknown) {
      port1.close();
      port2.close();
      senderFrame.postMessage(IPC_CHANNELS.sessionPort, {
        source: 'liquid-glass-preload',
        requestId: request.requestId,
        error: error instanceof Error ? error.message : 'sessionFailed',
      });
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.prepareDroppedPath,
    async (event, sessionId: unknown, droppedPath: unknown): Promise<string | null> => {
      if (!isTrustedFrame(event)) throw new Error('Untrusted IPC sender');
      if (typeof sessionId !== 'string' || typeof droppedPath !== 'string') return null;
      return ptyManager.prepareDroppedPath(event.sender.id, sessionId, droppedPath);
    },
  );

  ipcMain.handle(IPC_CHANNELS.openExternal, async (event, value: unknown): Promise<boolean> => {
    if (!isTrustedFrame(event) || typeof value !== 'string') return false;
    const url = safeExternalUrl(value);
    if (!url) return false;
    await shell.openExternal(url.href, { activate: true });
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.clipboardReadText, (event): string => {
    if (!isTrustedFrame(event)) throw new Error('Untrusted IPC sender');
    return clipboard.readText();
  });

  ipcMain.handle(IPC_CHANNELS.clipboardWriteText, (event, value: unknown): void => {
    if (!isTrustedFrame(event)) throw new Error('Untrusted IPC sender');
    if (typeof value !== 'string') throw new TypeError('Clipboard text must be a string');
    clipboard.writeText(value);
  });

  ipcMain.handle(IPC_CHANNELS.clipboardCopyFocused, (event): void => {
    if (!isTrustedFrame(event)) throw new Error('Untrusted IPC sender');
    event.sender.copy();
  });

  ipcMain.handle(IPC_CHANNELS.clipboardPasteFocused, (event): void => {
    if (!isTrustedFrame(event)) throw new Error('Untrusted IPC sender');
    event.sender.paste();
  });

  ipcMain.on(IPC_CHANNELS.showContextMenu, (event, value: unknown) => {
    if (!isTrustedFrame(event) || !mainWindow || !isContextMenuState(value)) return;
    showTerminalContextMenu(mainWindow, locale(), value.hasSelection, sendCommand);
  });

  ipcMain.on(IPC_CHANNELS.rendererReady, (event) => {
    if (!isTrustedFrame(event)) return;
    rendererReady = true;
    initialLaunchCwdToken = undefined;
    initialStartupNotice = undefined;
    for (const command of commandQueue.splice(0)) sendCommand(command);
  });

  ipcMain.on(IPC_CHANNELS.confirmExit, (event) => {
    if (!isTrustedFrame(event) || !mainWindow) return;
    allowWindowClose = true;
    mainWindow.close();
  });

  ipcMain.on(IPC_CHANNELS.quit, (event) => {
    if (!isTrustedFrame(event) || !mainWindow) return;
    mainWindow.close();
  });
}

async function createWindow(): Promise<void> {
  const stateStore = new WindowStateStore();
  const state = stateStore.restore();
  windowsAcrylicAvailable = isWindowsAcrylicOsAvailable() && windowsGlass.isSupported();
  const initialGlassAppearance = desiredGlassAppearance();
  currentGlassMode = initialGlassAppearance.glassMode;
  currentGlassAvailability = initialGlassAppearance.glassAvailability;
  const isDark = nativeTheme.shouldUseDarkColors;

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 720,
    minHeight: 420,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform !== 'darwin'
      ? {
          titleBarOverlay: {
            color: '#00000000',
            symbolColor: isDark ? '#f5f5f5' : '#171717',
            height: 44,
          },
        }
      : { trafficLightPosition: { x: 14, y: 14 } }),
    // Electron uses this flag to create an alpha-capable Chromium surface. The Node-API
    // bridge keeps the transient DWM frost and attaches the adjustable neutral controller.
    ...(windowsAcrylicAvailable ? { backgroundMaterial: 'acrylic' as const } : {}),
    ...(process.platform === 'darwin'
      ? { vibrancy: 'under-window' as const, visualEffectState: 'active' as const }
      : {}),
    backgroundColor:
      windowsAcrylicAvailable || process.platform === 'darwin'
        ? '#00000000'
        : isDark
          ? '#181818'
          : '#f4f4f4',
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
    },
  });

  applyNativeAppearance();

  stateStore.track(mainWindow);
  hardenWindow(mainWindow, MAIN_WINDOW_VITE_DEV_SERVER_URL);
  installClipboardShortcutRouting(mainWindow);
  rebuildMenu();

  mainWindow.on('close', (event) => {
    if (!mainWindow || allowWindowClose) return;
    if (ptyManager.count(mainWindow.webContents.id) > 1) {
      event.preventDefault();
      sendCommand({ type: 'confirm-exit' });
    }
  });
  const ownerId = mainWindow.webContents.id;
  mainWindow.on('closed', () => {
    windowsGlass.detach();
    ptyManager.closeForOwner(ownerId);
    mainWindow = undefined;
    rendererReady = false;
  });
  mainWindow.webContents.on('render-process-gone', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    ptyManager.closeForOwner(mainWindow.webContents.id);
    rendererReady = false;
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
    }, 500);
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (state.maximized) mainWindow?.maximize();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadURL('app://bundle/index.html');
  }
}

function handleSecondInstance(request: LaunchRequest): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  sendCommand({
    type: 'new-tab',
    ...(request.cwd ? { cwdToken: cwdTokens.issue(request.cwd) } : {}),
    ...(request.invalidCwd ? { notice: 'invalidCwd' } : {}),
  });
}

app.on('second-instance', (_event, argv, workingDirectory, additionalData) => {
  const supplied = additionalData as { launch?: LaunchRequest } | undefined;
  const request = supplied?.launch ?? parseLaunchRequest(argv, workingDirectory);
  handleSecondInstance(request);
});

void app
  .whenReady()
  .then(async () => {
    settingsStore = new SettingsStore();
    profiles = new ShellProfileRegistry();
    await profiles.detect();
    nativeTheme.themeSource = settingsStore.value.theme;

    if (initialLaunch.cwd) initialLaunchCwdToken = cwdTokens.issue(initialLaunch.cwd);
    if (initialLaunch.invalidCwd) initialStartupNotice = 'invalidCwd';
    if (settingsStore.recovered) initialStartupNotice = 'configRecovered';

    if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      registerAppProtocol(path.join(__dirname, '../renderer', MAIN_WINDOW_VITE_NAME));
    }
    hardenSession(MAIN_WINDOW_VITE_DEV_SERVER_URL);

    ptyManager = new PtyManager(
      profiles,
      () => settingsStore.value,
      () => undefined,
    );
    installIpc();
    await createWindow();

    nativeTheme.on('updated', () => {
      applyNativeAppearance();
      rebuildMenu();
    });
  })
  .catch((error: unknown) => {
    console.error('Application startup failed', error);
    app.quit();
  });

app.on('window-all-closed', () => app.quit());
