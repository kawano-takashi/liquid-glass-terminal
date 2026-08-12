import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  AppCommand,
  BootstrapState,
  ContextMenuState,
  PreloadApi,
  SessionCreateRequest,
  SessionPortPayload,
  SettingsPatch,
  SettingsV1,
  SystemAppearance,
} from '../shared/contracts';
import { IPC_CHANNELS } from '../shared/contracts';

ipcRenderer.on(IPC_CHANNELS.sessionPort, (event, payload: SessionPortPayload) => {
  window.postMessage(payload, window.location.origin, event.ports);
});

const api: PreloadApi = {
  bootstrap: () => ipcRenderer.invoke(IPC_CHANNELS.bootstrap) as Promise<BootstrapState>,
  updateSettings: (patch: SettingsPatch) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateSettings, patch) as Promise<SettingsV1>,
  requestSession: (request: SessionCreateRequest) =>
    ipcRenderer.send(IPC_CHANNELS.requestSession, request),
  prepareDroppedPath: (sessionId: string, path: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.prepareDroppedPath, sessionId, path) as Promise<string | null>,
  openExternal: (url: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.openExternal, url) as Promise<boolean>,
  showContextMenu: (state: ContextMenuState) =>
    ipcRenderer.send(IPC_CHANNELS.showContextMenu, state),
  confirmExit: () => ipcRenderer.send(IPC_CHANNELS.confirmExit),
  quit: () => ipcRenderer.send(IPC_CHANNELS.quit),
  rendererReady: () => ipcRenderer.send(IPC_CHANNELS.rendererReady),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  onCommand: (callback: (command: AppCommand) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: AppCommand) => callback(command);
    ipcRenderer.on(IPC_CHANNELS.command, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.command, listener);
  },
  onSystemAppearance: (callback: (appearance: SystemAppearance) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: SystemAppearance) =>
      callback(state);
    ipcRenderer.on(IPC_CHANNELS.systemAppearance, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.systemAppearance, listener);
  },
};

contextBridge.exposeInMainWorld('liquidGlass', api);
