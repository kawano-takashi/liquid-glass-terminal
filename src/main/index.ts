import path from 'node:path';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  MessageChannelMain,
  nativeTheme,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import type {
  AppCommand,
  BackdropFailureCode,
  BackdropPreviewPatch,
  BootstrapState,
  NativeBackdropState,
  SettingsV5,
  SystemAppearance,
  WindowAppearance,
} from '../shared/contracts';
import { IPC_CHANNELS } from '../shared/contracts';
import { resolveLocale } from '../shared/i18n';
import { resolveForegroundTone } from '../shared/settings';
import {
  isContextMenuState,
  isSessionCreateRequest,
  safeExternalUrl,
  validateBackdropPreviewPatch,
  validateSettingsPatch,
} from '../shared/validation';
import { CwdTokenVault, parseLaunchRequest, type LaunchRequest } from './cli';
import { initializeBackdropWithRetry, OneShotBackdropRecovery } from './backdrop-recovery';
import { currentHostEnvironment, resolveHostSupport } from './host-support';
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
import { resolveBackdropAppearance } from './window-appearance';
import {
  BackdropNativeError,
  resolveBackdropFailureCode,
  resolveWindowsBackdropOptions,
  WindowsGlass,
} from './windows-glass';

registerPrivilegedScheme();

app.setName('Liquid Glass Terminal');

const initialLaunch = parseLaunchRequest(process.argv, process.cwd());
const singleInstance = app.requestSingleInstanceLock({ launch: initialLaunch });
if (!singleInstance) app.quit();

let mainWindow: BrowserWindow | undefined;
let settingsStore: SettingsStore;
let profiles: ShellProfileRegistry;
let ptyManager: PtyManager;
let allowWindowClose = false;
let rendererReady = false;
let nativeBackdropState: NativeBackdropState | undefined;
let backdropFailureCode: BackdropFailureCode | undefined;
const runtimeRecovery = new OneShotBackdropRecovery();
let backdropPolicyTimer: ReturnType<typeof setInterval> | undefined;
const commandQueue: AppCommand[] = [];
const cwdTokens = new CwdTokenVault();
let initialLaunchCwdToken: string | undefined;
let initialStartupNotice: string | undefined;
const windowsGlass = new WindowsGlass(handleNativeBackdropStateChanged);

function appearance(): SystemAppearance {
  return {
    highContrast: nativeTheme.shouldUseHighContrastColors,
    reducedTransparency: nativeTheme.prefersReducedTransparency,
  };
}

function desiredBackdropAppearance() {
  return resolveBackdropAppearance({
    nativeState: nativeBackdropState,
    failureCode: backdropFailureCode,
    systemAppearance: appearance(),
    screenReaderMode: settingsStore.value.screenReaderMode,
  });
}

function windowAppearance(): WindowAppearance {
  return {
    ...appearance(),
    ...desiredBackdropAppearance(),
  };
}

function publishWindowAppearance(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(IPC_CHANNELS.windowAppearance, windowAppearance());
}

function handleNativeBackdropStateChanged(state: NativeBackdropState): void {
  if (state === 'capability-lost') {
    recoverNativeBackdrop();
    return;
  }
  applyNativeAppearance();
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

function currentBackdropOptions(preview: BackdropPreviewPatch = {}) {
  return resolveWindowsBackdropOptions(
    appearance(),
    settingsStore.value.screenReaderMode,
    settingsStore.value,
    preview,
  );
}

function updateTitleBarOverlay(options = currentBackdropOptions()): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const darkSymbols =
    resolveForegroundTone(nativeBackdropState === 'active', options.glassContrast) === 'dark';
  mainWindow.setTitleBarOverlay({
    color: '#00000000',
    symbolColor: darkSymbols ? '#181818' : '#f5f5f5',
    height: 44,
  });
}

function enterStickyBackdropFailure(error: unknown, failureCode: BackdropFailureCode): void {
  console.error('Native backdrop failed; using the opaque fallback until restart.', error);
  backdropFailureCode = failureCode;
  nativeBackdropState = 'capability-lost';
  windowsGlass.detach();
  if (backdropPolicyTimer) {
    clearInterval(backdropPolicyTimer);
    backdropPolicyTimer = undefined;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundMaterial('none');
    mainWindow.setBackgroundColor('#181818');
  }
  updateTitleBarOverlay();
  publishWindowAppearance();
}

function recoverNativeBackdrop(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (backdropFailureCode || runtimeRecovery.attempted) {
    enterStickyBackdropFailure(
      new Error('The one permitted backdrop rebuild was exhausted.'),
      'runtime-rebuild-failed',
    );
    return;
  }
  try {
    nativeBackdropState = runtimeRecovery.run(() => {
      windowsGlass.probe();
      return windowsGlass.rebuild(mainWindow!, currentBackdropOptions());
    });
    updateTitleBarOverlay();
    publishWindowAppearance();
  } catch (error: unknown) {
    enterStickyBackdropFailure(error, 'runtime-rebuild-failed');
  }
}

function applyNativeAppearance(preview: BackdropPreviewPatch = {}): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (backdropFailureCode) {
    updateTitleBarOverlay();
    publishWindowAppearance();
    return;
  }
  try {
    const options = currentBackdropOptions(preview);
    nativeBackdropState = windowsGlass.apply(mainWindow, options);
    updateTitleBarOverlay(options);
    publishWindowAppearance();
  } catch (error: unknown) {
    console.warn('Native backdrop update failed; attempting one rebuild.', error);
    recoverNativeBackdrop();
  }
}

function initializeNativeBackdrop(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new BackdropNativeError('attach-failed', 'The application window is unavailable.');
  }
  try {
    nativeBackdropState = initializeBackdropWithRetry(
      () => {
        windowsGlass.probe();
        return windowsGlass.apply(mainWindow!, currentBackdropOptions());
      },
      (error, attempt) => {
        windowsGlass.detach();
        console.warn(`Native backdrop startup attempt ${attempt} failed.`, error);
      },
    );
    updateTitleBarOverlay();
  } catch (error: unknown) {
    enterStickyBackdropFailure(error, resolveBackdropFailureCode(error, 'attach-failed'));
  }
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
      settings: settingsStore.value,
      profiles: profiles.descriptors(),
      windowAppearance: windowAppearance(),
      ...(initialLaunchCwdToken ? { launchCwdToken: initialLaunchCwdToken } : {}),
      ...(initialStartupNotice ? { startupNotice: initialStartupNotice } : {}),
    };
  });

  ipcMain.handle(IPC_CHANNELS.updateSettings, (event, value: unknown): SettingsV5 => {
    if (!isTrustedFrame(event)) throw new Error('Untrusted IPC sender');
    const patch = validateSettingsPatch(value);
    if (!patch) throw new TypeError('Invalid settings patch');
    const next = settingsStore.update(patch);
    if (patch.locale !== undefined) rebuildMenu();
    applyNativeAppearance();
    return next;
  });

  ipcMain.on(IPC_CHANNELS.previewBackdrop, (event, value: unknown) => {
    if (!isTrustedFrame(event)) return;
    const patch = validateBackdropPreviewPatch(value);
    if (!patch) return;
    applyNativeAppearance(patch);
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

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 720,
    minHeight: 420,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#f5f5f5',
      height: 44,
    },
    // This enables Chromium's translucent surface. Native code immediately disables
    // the DWM system backdrop and supplies the custom HostBackdrop effect graph.
    backgroundMaterial: 'acrylic',
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
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

  try {
    initializeNativeBackdrop();
  } catch (error: unknown) {
    mainWindow.destroy();
    mainWindow = undefined;
    throw error;
  }

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

  if (!backdropFailureCode) {
    backdropPolicyTimer = setInterval(() => applyNativeAppearance(), 5_000);
    backdropPolicyTimer.unref();
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
    const hostSupport = resolveHostSupport(currentHostEnvironment());
    if (!hostSupport.supported) {
      const japanese = app.getLocale().toLowerCase().startsWith('ja');
      dialog.showErrorBox(
        japanese ? '対応していない環境です' : 'Unsupported system',
        japanese
          ? 'Liquid Glass Terminal 0.2.0には、Windows 11 22H2以降のx64クライアント版が必要です。'
          : 'Liquid Glass Terminal 0.2.0 requires an x64 client edition of Windows 11 22H2 or later.',
      );
      app.quit();
      return;
    }
    app.setAppUserModelId('dev.liquidglass.terminal');
    settingsStore = new SettingsStore();
    profiles = new ShellProfileRegistry();
    await profiles.detect();
    nativeTheme.themeSource = 'dark';

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

app.on('window-all-closed', () => {
  if (backdropPolicyTimer) clearInterval(backdropPolicyTimer);
  app.quit();
});
