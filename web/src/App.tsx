import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  DEFAULT_SETTINGS,
  UI_METRICS,
  type AppearanceState,
  type Capabilities,
  type Settings,
  type SettingsPatch,
  type WindowRuntimeState,
} from '../../contracts/generated/protocol';
import { cssAppearance } from './appearance';
import { NativeBridge } from './bridge/NativeBridge';
import { BridgeContext } from './bridge/context';
import { ContextMenu } from './components/ContextMenu';
import { PasteDialog } from './components/PasteDialog';
import { SettingsDrawer } from './components/SettingsDrawer';
import type { TerminalViewHandle } from './components/TerminalView';
import { WindowChrome } from './components/WindowChrome';
import { messages, resolveLocale } from './i18n';

const TerminalView = lazy(() =>
  import('./components/TerminalView').then((module) => ({ default: module.TerminalView })),
);

const INITIAL_SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  glass: { ...DEFAULT_SETTINGS.glass },
};
const DEFAULT_CAPABILITIES: Capabilities = {
  glass: false,
  sharedBuffers: false,
  reducedMotion: false,
  screenReader: false,
  highContrast: false,
};
const DEFAULT_WINDOW_STATE: WindowRuntimeState = {
  maximized: false,
  fullscreen: false,
  active: true,
};

interface ContextState {
  x: number;
  y: number;
}

interface Notice {
  id: number;
  level: 'info' | 'warning' | 'error';
  message: string;
}

function settingsPatch(settings: Settings): SettingsPatch {
  return {
    locale: settings.locale,
    glass: { ...settings.glass },
    foreground: settings.foreground,
    animations: settings.animations,
    uiScale: settings.uiScale,
  };
}

function requestId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function isMultiline(value: string): boolean {
  return /\r|\n/.test(value);
}

export function App() {
  const bridge = useMemo(() => new NativeBridge(), []);
  const appRoot = useRef<HTMLElement>(null);
  const terminal = useRef<TerminalViewHandle>(null);
  const settingsTransactionRef = useRef<string | undefined>(undefined);
  const pendingApplyRef = useRef<string | undefined>(undefined);
  const pendingCancelRef = useRef<string | undefined>(undefined);
  const settingsDraftDirtyRef = useRef(false);
  const previewFrameRef = useRef<number | undefined>(undefined);
  const previewValueRef = useRef<Settings>(INITIAL_SETTINGS);
  const draftRef = useRef<Settings>(INITIAL_SETTINGS);
  const settingsRef = useRef<Settings>(INITIAL_SETTINGS);
  const clipboardRequests = useRef(new Map<string, (text?: string) => void>());
  const noticeSequence = useRef(1);
  const [accepted, setAccepted] = useState(false);
  const [settings, setSettings] = useState<Settings>(INITIAL_SETTINGS);
  const [draft, setDraft] = useState<Settings>(INITIAL_SETTINGS);
  const [capabilities, setCapabilities] = useState(DEFAULT_CAPABILITIES);
  const [windowState, setWindowState] = useState(DEFAULT_WINDOW_STATE);
  const [appearance, setAppearance] = useState<AppearanceState>('solid');
  const [appearanceReason, setAppearanceReason] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [applyingSettings, setApplyingSettings] = useState(false);
  const [context, setContext] = useState<ContextState>();
  const [pasteCandidate, setPasteCandidate] = useState<string>();
  const [notices, setNotices] = useState<Notice[]>([]);
  const locale = resolveLocale(draft.locale);
  const labels = messages[locale];
  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  const focusTerminal = useCallback(() => {
    requestAnimationFrame(() => terminal.current?.focus());
  }, []);

  const addNotice = useCallback((level: Notice['level'], message: string) => {
    const id = noticeSequence.current++;
    setNotices((items) => [...items.slice(-2), { id, level, message }]);
    window.setTimeout(() => setNotices((items) => items.filter((item) => item.id !== id)), 6_000);
  }, []);

  const nativeNotice = useCallback((message: string): string => {
    if (message === 'composition.update.failed') return labelsRef.current.compositionUpdateFailed;
    if (message === 'bridge.invalid-message') return labelsRef.current.invalidBridgeMessage;
    if (message === 'terminal.transport.failed') return labelsRef.current.terminalTransportFailed;
    if (message === 'terminal.start.failed') return labelsRef.current.terminalStartFailed;
    if (message.startsWith('settings.')) return labelsRef.current.settingsFailed;
    if (message.startsWith('clipboard.')) return labelsRef.current.clipboardFailed;
    return message;
  }, []);

  const cancelScheduledPreview = useCallback(() => {
    if (previewFrameRef.current === undefined) return;
    cancelAnimationFrame(previewFrameRef.current);
    previewFrameRef.current = undefined;
  }, []);

  const schedulePreview = useCallback(
    (value: Settings) => {
      previewValueRef.current = value;
      if (previewFrameRef.current !== undefined) return;
      previewFrameRef.current = requestAnimationFrame(() => {
        previewFrameRef.current = undefined;
        const transaction = settingsTransactionRef.current;
        if (transaction)
          bridge.previewSettings(transaction, settingsPatch(previewValueRef.current));
      });
    },
    [bridge],
  );

  useEffect(() => {
    bridge.connect();
    const off = bridge.onMessage((message) => {
      switch (message.type) {
        case 'bridge.accepted':
          setSettings(message.payload.settings);
          settingsRef.current = message.payload.settings;
          setDraft(message.payload.settings);
          draftRef.current = message.payload.settings;
          previewValueRef.current = message.payload.settings;
          settingsDraftDirtyRef.current = false;
          setCapabilities(message.payload.capabilities);
          setWindowState(message.payload.windowState);
          setAccepted(true);
          break;
        case 'capabilities.changed':
          setCapabilities(message.payload);
          break;
        case 'window.state.changed':
          setWindowState(message.payload);
          break;
        case 'settings.snapshot':
          if (
            message.payload.transactionId === settingsTransactionRef.current &&
            !settingsDraftDirtyRef.current
          ) {
            setDraft(message.payload.settings);
            draftRef.current = message.payload.settings;
            previewValueRef.current = message.payload.settings;
          }
          break;
        case 'settings.result': {
          const pendingApply =
            message.payload.operation === 'apply' &&
            message.payload.transactionId === pendingApplyRef.current;
          const pendingCancel =
            message.payload.operation === 'cancel' &&
            message.payload.transactionId === pendingCancelRef.current;
          if (!message.payload.ok) {
            if (pendingApply || pendingCancel) {
              pendingApplyRef.current = undefined;
              pendingCancelRef.current = undefined;
              settingsTransactionRef.current = undefined;
              setApplyingSettings(false);
              setDraft(settingsRef.current);
              draftRef.current = settingsRef.current;
              previewValueRef.current = settingsRef.current;
              settingsDraftDirtyRef.current = false;
              setSettingsOpen(false);
              focusTerminal();
            }
            addNotice(
              'error',
              message.payload.error
                ? nativeNotice(message.payload.error)
                : labelsRef.current.settingsFailed,
            );
          } else if (pendingApply) {
            const committed = draftRef.current;
            pendingApplyRef.current = undefined;
            settingsTransactionRef.current = undefined;
            setApplyingSettings(false);
            setSettings(committed);
            settingsRef.current = committed;
            setDraft(committed);
            previewValueRef.current = committed;
            settingsDraftDirtyRef.current = false;
            setSettingsOpen(false);
            focusTerminal();
          } else if (pendingCancel) {
            pendingCancelRef.current = undefined;
            settingsTransactionRef.current = undefined;
            setApplyingSettings(false);
            setDraft(settingsRef.current);
            draftRef.current = settingsRef.current;
            previewValueRef.current = settingsRef.current;
            settingsDraftDirtyRef.current = false;
            setSettingsOpen(false);
            focusTerminal();
          }
          break;
        }
        case 'appearance.changed':
          setAppearance(message.payload.state);
          setAppearanceReason(message.payload.reason);
          break;
        case 'clipboard.result': {
          const callback = clipboardRequests.current.get(message.payload.requestId);
          clipboardRequests.current.delete(message.payload.requestId);
          if (message.payload.ok) callback?.(message.payload.text);
          else
            addNotice(
              'error',
              message.payload.error
                ? nativeNotice(message.payload.error)
                : labelsRef.current.clipboardFailed,
            );
          break;
        }
        case 'drop.path':
          terminal.current?.paste(message.payload.path);
          focusTerminal();
          break;
        case 'terminal.recovered':
          terminal.current?.clear();
          addNotice(
            'warning',
            message.payload.droppedBytes > 0
              ? labelsRef.current.terminalRecoveredDropped(message.payload.droppedBytes)
              : labelsRef.current.terminalRecovered,
          );
          break;
        case 'app.notice':
          addNotice(message.payload.level, nativeNotice(message.payload.message));
          break;
      }
    });
    return () => {
      cancelScheduledPreview();
      off();
      bridge.dispose();
    };
  }, [addNotice, bridge, cancelScheduledPreview, focusTerminal, nativeNotice]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (accepted) return;
    bridge.ready();
    const retry = window.setInterval(() => bridge.ready(), 500);
    return () => window.clearInterval(retry);
  }, [accepted, bridge]);

  const copy = useCallback(() => {
    const selection = terminal.current?.getSelection() ?? '';
    if (!selection) return;
    const id = requestId('copy');
    clipboardRequests.current.set(id, () => focusTerminal());
    bridge.writeClipboard(id, selection);
    setContext(undefined);
  }, [bridge, focusTerminal]);

  const requestPaste = useCallback(() => {
    const id = requestId('paste');
    clipboardRequests.current.set(id, (text) => {
      if (!text) {
        focusTerminal();
        return;
      }
      if (isMultiline(text)) setPasteCandidate(text);
      else {
        terminal.current?.paste(text);
        focusTerminal();
      }
    });
    bridge.readClipboard(id);
    setContext(undefined);
  }, [bridge, focusTerminal]);

  const openSettings = useCallback(() => {
    if (settingsOpen) return;
    const transaction = requestId('settings');
    settingsTransactionRef.current = transaction;
    settingsDraftDirtyRef.current = false;
    setDraft(settings);
    draftRef.current = settings;
    previewValueRef.current = settings;
    bridge.previewSettings(transaction, settingsPatch(settings));
    setSettingsOpen(true);
    setContext(undefined);
  }, [bridge, settings, settingsOpen]);

  const preview = useCallback(
    (value: Settings) => {
      settingsDraftDirtyRef.current = true;
      setDraft(value);
      draftRef.current = value;
      schedulePreview(value);
    },
    [schedulePreview],
  );

  const apply = useCallback(() => {
    const transaction = settingsTransactionRef.current;
    if (!transaction || applyingSettings) return;
    cancelScheduledPreview();
    pendingApplyRef.current = transaction;
    setApplyingSettings(true);
    bridge.applySettings(transaction, settingsPatch(draftRef.current));
  }, [applyingSettings, bridge, cancelScheduledPreview]);

  const cancel = useCallback(() => {
    if (applyingSettings) return;
    cancelScheduledPreview();
    const transaction = settingsTransactionRef.current;
    if (transaction) {
      pendingCancelRef.current = transaction;
      setApplyingSettings(true);
      bridge.cancelSettings(transaction);
      return;
    }
    setSettingsOpen(false);
    focusTerminal();
  }, [applyingSettings, bridge, cancelScheduledPreview, focusTerminal]);

  useEffect(() => {
    if (!windowState.fullscreen) return;
    setContext(undefined);
    if (settingsOpen) cancel();
  }, [cancel, settingsOpen, windowState.fullscreen]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.key === 'Escape') {
        if (pasteCandidate !== undefined) {
          setPasteCandidate(undefined);
          focusTerminal();
        } else if (context) {
          setContext(undefined);
          focusTerminal();
        } else if (settingsOpen) cancel();
        return;
      }
      if (settingsOpen || pasteCandidate !== undefined) return;
      if (event.ctrlKey && event.shiftKey && key === 'c') {
        event.preventDefault();
        copy();
      } else if (event.ctrlKey && event.shiftKey && key === 'v') {
        event.preventDefault();
        requestPaste();
      } else if (event.ctrlKey && key === 'c' && terminal.current?.hasSelection()) {
        event.preventDefault();
        copy();
      } else if (event.ctrlKey && event.shiftKey && key === 'a') {
        event.preventDefault();
        terminal.current?.selectAll();
      } else if (event.ctrlKey && key === ',') {
        event.preventDefault();
        openSettings();
      }
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, [
    cancel,
    context,
    copy,
    focusTerminal,
    openSettings,
    pasteCandidate,
    requestPaste,
    settingsOpen,
  ]);

  const zoom = draft.uiScale / 100;
  const motionEnabled =
    draft.animations && !capabilities.reducedMotion && !capabilities.screenReader;
  const appearanceStyle = {
    ...cssAppearance(draft),
    '--chrome-height': `${UI_METRICS.titlebarHeightDip / zoom}px`,
    '--caption-reserve': capabilities.glass
      ? `${(UI_METRICS.captionButtonWidthDip * 3) / zoom}px`
      : '0px',
    '--chrome-control-size': `${32 / zoom}px`,
    '--chrome-icon-size': `${17 / zoom}px`,
    '--chrome-font-size': `${12 / zoom}px`,
    '--chrome-inline-gap': `${8 / zoom}px`,
    '--surface-inset': `${12 / zoom}px`,
    '--material-duration': '0ms',
    '--motion-duration': motionEnabled ? '140ms' : '0ms',
  } as CSSProperties;

  return (
    <BridgeContext.Provider value={bridge}>
      <main
        ref={appRoot}
        className="app"
        data-appearance={appearance}
        data-active={windowState.active}
        data-animations={motionEnabled}
        data-composition={capabilities.glass}
        data-fullscreen={windowState.fullscreen}
        style={appearanceStyle}
        onPointerDown={(event) => {
          if (!(event.target instanceof Element) || !event.target.closest('.context-menu')) {
            setContext(undefined);
          }
        }}
      >
        <div className="application-content" inert={pasteCandidate !== undefined}>
          {!windowState.fullscreen ? (
            <WindowChrome
              accepted={accepted}
              active={windowState.active}
              appearance={appearance}
              appearanceReason={appearanceReason}
              compositionMode={capabilities.glass}
              labels={labels}
              onOpenSettings={openSettings}
            />
          ) : null}

          <div
            className="terminal-surface"
            onContextMenu={(event) => {
              event.preventDefault();
              setContext({ x: event.clientX, y: event.clientY });
            }}
          >
            {accepted ? (
              <Suspense fallback={<div className="loading">{labels.appName}</div>}>
                <TerminalView ref={terminal} settings={draft} capabilities={capabilities} />
              </Suspense>
            ) : (
              <div className="loading">{labels.appName}</div>
            )}
          </div>

          {context ? (
            <ContextMenu
              {...context}
              labels={labels}
              canCopy={terminal.current?.hasSelection() ?? false}
              onCopy={copy}
              onPaste={requestPaste}
              onSelectAll={() => {
                terminal.current?.selectAll();
                setContext(undefined);
                focusTerminal();
              }}
              onClear={() => {
                terminal.current?.clear();
                setContext(undefined);
                focusTerminal();
              }}
            />
          ) : null}

          <SettingsDrawer
            open={settingsOpen}
            value={draft}
            labels={labels}
            onChange={preview}
            onApply={apply}
            onCancel={cancel}
            pending={applyingSettings}
          />
        </div>

        {pasteCandidate !== undefined ? (
          <PasteDialog
            text={pasteCandidate}
            labels={labels}
            onCancel={() => {
              setPasteCandidate(undefined);
              focusTerminal();
            }}
            onAccept={() => {
              terminal.current?.paste(pasteCandidate);
              setPasteCandidate(undefined);
              focusTerminal();
            }}
          />
        ) : null}

        <div className="toast-region" aria-live="polite">
          {notices.map((notice) => (
            <div className="toast" data-level={notice.level} key={notice.id}>
              {notice.message}
            </div>
          ))}
        </div>
      </main>
    </BridgeContext.Provider>
  );
}
