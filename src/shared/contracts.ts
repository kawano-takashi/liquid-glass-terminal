export const IPC_CHANNELS = {
  bootstrap: 'app:bootstrap',
  updateSettings: 'settings:update',
  previewBackdrop: 'appearance:preview-backdrop',
  requestSession: 'terminal:request-session',
  sessionPort: 'terminal:session-port',
  prepareDroppedPath: 'terminal:prepare-dropped-path',
  openExternal: 'app:open-external',
  clipboardReadText: 'clipboard:read-text',
  clipboardWriteText: 'clipboard:write-text',
  clipboardCopyFocused: 'clipboard:copy-focused',
  clipboardPasteFocused: 'clipboard:paste-focused',
  showContextMenu: 'app:show-context-menu',
  confirmExit: 'app:confirm-exit',
  quit: 'app:quit',
  rendererReady: 'app:renderer-ready',
  command: 'app:command',
  windowAppearance: 'app:window-appearance',
} as const;

export type LocaleMode = 'system' | 'en' | 'ja';
export type CursorStyle = 'block' | 'bar' | 'underline';
export type BackdropMode = 'frosted' | 'opaque';
export type BackdropStatus = 'active' | 'policy-disabled' | 'unavailable';
export type BackdropFailureCode =
  | 'addon-load-failed'
  | 'effects-unsupported'
  | 'effects-not-fast'
  | 'effect-graph-failed'
  | 'attach-failed'
  | 'runtime-rebuild-failed';
export type NativeBackdropState = 'active' | 'policy-disabled' | 'capability-lost';
export type ShellProfileKind = 'powershell' | 'windows-powershell' | 'cmd' | 'git-bash' | 'wsl';

export interface SettingsV5 {
  schemaVersion: 5;
  locale: LocaleMode;
  glassContrast: number;
  frostStrength: number;
  defaultProfileId: string;
  fontSize: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  bellSound: boolean;
  scrollback: number;
  warnMultilinePaste: boolean;
  screenReaderMode: boolean;
  firstRunHintsSeen: boolean;
}

export type SettingsPatch = Partial<Omit<SettingsV5, 'schemaVersion'>>;

export interface BackdropPreviewPatch {
  glassContrast?: number;
  frostStrength?: number;
}

export interface ShellProfileDescriptor {
  id: string;
  label: string;
  kind: ShellProfileKind;
  wslDistro?: string;
}

export interface SystemAppearance {
  highContrast: boolean;
  reducedTransparency: boolean;
}

export interface WindowAppearance extends SystemAppearance {
  backdropMode: BackdropMode;
  backdropStatus: BackdropStatus;
  backdropFailureCode?: BackdropFailureCode;
}

export interface BootstrapState {
  appVersion: string;
  settings: SettingsV5;
  profiles: ShellProfileDescriptor[];
  windowAppearance: WindowAppearance;
  launchCwdToken?: string;
  startupNotice?: string;
}

export interface SessionCreateRequest {
  requestId: string;
  profileId?: string;
  cwdToken?: string;
  inheritFromSessionId?: string;
  cols: number;
  rows: number;
}

export interface SessionPortPayload {
  source: 'liquid-glass-preload';
  requestId: string;
  sessionId?: string;
  profile?: ShellProfileDescriptor;
  error?: string;
}

export type RendererToPtyMessage =
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'ack'; seq: number; bytes: number }
  | { type: 'cwd'; uri: string }
  | { type: 'restart' }
  | { type: 'close' };

export type PtyToRendererMessage =
  | { type: 'ready' }
  | { type: 'data'; seq: number; bytes: number; data: string }
  | { type: 'exit'; code: number; signal?: number }
  | { type: 'restarted' }
  | { type: 'error'; messageKey: string };

export type AppCommand =
  | { type: 'new-tab'; cwdToken?: string; notice?: string }
  | { type: 'close-tab' }
  | { type: 'next-tab' }
  | { type: 'previous-tab' }
  | { type: 'reorder-tab'; direction: -1 | 1 }
  | { type: 'copy' }
  | { type: 'paste' }
  | { type: 'select-all' }
  | { type: 'search' }
  | { type: 'clear' }
  | { type: 'open-settings' }
  | { type: 'confirm-exit' };

export interface ContextMenuState {
  hasSelection: boolean;
}

export interface PreloadApi {
  bootstrap(): Promise<BootstrapState>;
  updateSettings(patch: SettingsPatch): Promise<SettingsV5>;
  previewBackdrop(patch: BackdropPreviewPatch): void;
  requestSession(request: SessionCreateRequest): void;
  prepareDroppedPath(sessionId: string, path: string): Promise<string | null>;
  openExternal(url: string): Promise<boolean>;
  readClipboardText(): Promise<string>;
  writeClipboardText(text: string): Promise<void>;
  copyFocusedText(): Promise<void>;
  pasteFocusedText(): Promise<void>;
  showContextMenu(state: ContextMenuState): void;
  confirmExit(): void;
  quit(): void;
  rendererReady(): void;
  getPathForFile(file: File): string;
  onCommand(callback: (command: AppCommand) => void): () => void;
  onWindowAppearance(callback: (appearance: WindowAppearance) => void): () => void;
}
