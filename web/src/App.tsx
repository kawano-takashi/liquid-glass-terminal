import { Settings as SettingsIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  LIMITS,
  type AppearanceState,
  type Capabilities,
  type GlassRegion,
  type Settings,
  type SettingsPatch,
} from '../../contracts/generated/protocol';
import { cssAppearance } from './appearance';
import { NativeBridge } from './bridge/NativeBridge';
import { BridgeContext } from './bridge/context';
import { ContextMenu } from './components/ContextMenu';
import { PasteDialog } from './components/PasteDialog';
import { SettingsDrawer } from './components/SettingsDrawer';
import { TerminalView, type TerminalViewHandle } from './components/TerminalView';
import { messages, resolveLocale } from './i18n';

const TITLEBAR_DIP = 44;
const DEFAULT_SETTINGS: Settings = {
  locale: 'system',
  glass: { enabled: true, preset: 'regular', tint: '#181818' },
  foreground: 'auto',
  animations: true,
  uiScale: 100,
};
const DEFAULT_CAPABILITIES: Capabilities = {
  glass: false,
  sharedBuffers: false,
  reducedMotion: false,
  screenReader: false,
  highContrast: false,
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
  const terminal = useRef<TerminalViewHandle>(null);
  const terminalSurface = useRef<HTMLDivElement>(null);
  const drawerSurface = useRef<HTMLElement>(null);
  const contextSurface = useRef<HTMLDivElement>(null);
  const settingsTransactionRef = useRef<string | undefined>(undefined);
  const pendingApplyRef = useRef<string | undefined>(undefined);
  const pendingCancelRef = useRef<string | undefined>(undefined);
  const draftRef = useRef(DEFAULT_SETTINGS);
  const settingsRef = useRef(DEFAULT_SETTINGS);
  const clipboardRequests = useRef(new Map<string, (text?: string) => void>());
  const layoutRevision = useRef(0);
  const noticeSequence = useRef(1);
  const [accepted, setAccepted] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState(DEFAULT_SETTINGS);
  const [capabilities, setCapabilities] = useState(DEFAULT_CAPABILITIES);
  const [appearance, setAppearance] = useState<AppearanceState>('solid');
  const [appearanceReason, setAppearanceReason] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTransaction, setSettingsTransaction] = useState<string>();
  const [applyingSettings, setApplyingSettings] = useState(false);
  const [context, setContext] = useState<ContextState>();
  const [pasteCandidate, setPasteCandidate] = useState<string>();
  const [notices, setNotices] = useState<Notice[]>([]);
  const locale = resolveLocale(draft.locale);
  const labels = messages[locale];

  const addNotice = useCallback((level: Notice['level'], message: string) => {
    const id = noticeSequence.current++;
    setNotices((items) => [...items.slice(-2), { id, level, message }]);
    window.setTimeout(() => setNotices((items) => items.filter((item) => item.id !== id)), 6_000);
  }, []);

  const sendLayout = useCallback(() => {
    const makeRegion = (
      element: Element,
      id: string,
      role: GlassRegion['role'],
      radius: number,
    ): GlassRegion => {
      const rect = element.getBoundingClientRect();
      return {
        id,
        x: rect.x,
        y: rect.y + TITLEBAR_DIP,
        width: rect.width,
        height: rect.height,
        radii: [radius, radius, radius, radius],
        role,
      };
    };
    const regions: GlassRegion[] = [];
    if (terminalSurface.current) {
      regions.push(makeRegion(terminalSurface.current, 'terminal', 'terminal', 16));
    }
    if (settingsOpen && drawerSurface.current) {
      regions.push(makeRegion(drawerSurface.current, 'settings', 'overlay', 20));
    }
    if (context && contextSurface.current) {
      regions.push(makeRegion(contextSurface.current, 'context', 'overlay', 12));
    }
    bridge.setGlassLayout(++layoutRevision.current, regions.slice(0, LIMITS.maxGlassRegions));
  }, [bridge, context, settingsOpen]);

  useEffect(() => {
    bridge.connect();
    const off = bridge.onMessage((message) => {
      switch (message.type) {
        case 'bridge.accepted':
          setSettings(message.payload.settings);
          settingsRef.current = message.payload.settings;
          setDraft(message.payload.settings);
          setCapabilities(message.payload.capabilities);
          setAccepted(true);
          break;
        case 'capabilities.changed':
          setCapabilities(message.payload);
          break;
        case 'settings.snapshot':
          if (message.payload.transactionId === settingsTransactionRef.current) {
            setDraft(message.payload.settings);
            draftRef.current = message.payload.settings;
          }
          break;
        case 'settings.result':
          if (!message.payload.ok) {
            if (
              message.payload.transactionId === pendingApplyRef.current ||
              message.payload.transactionId === pendingCancelRef.current
            ) {
              pendingApplyRef.current = undefined;
              pendingCancelRef.current = undefined;
              settingsTransactionRef.current = undefined;
              setApplyingSettings(false);
              setDraft(settingsRef.current);
              draftRef.current = settingsRef.current;
              setSettingsOpen(false);
              setSettingsTransaction(undefined);
              requestAnimationFrame(() => terminal.current?.focus());
            }
            addNotice('error', message.payload.error ?? 'Settings failed.');
          } else if (message.payload.transactionId === pendingApplyRef.current) {
            const committed = draftRef.current;
            pendingApplyRef.current = undefined;
            settingsTransactionRef.current = undefined;
            setApplyingSettings(false);
            setSettings(committed);
            settingsRef.current = committed;
            setDraft(committed);
            setSettingsOpen(false);
            setSettingsTransaction(undefined);
            requestAnimationFrame(() => terminal.current?.focus());
          } else if (message.payload.transactionId === pendingCancelRef.current) {
            pendingCancelRef.current = undefined;
            settingsTransactionRef.current = undefined;
            setApplyingSettings(false);
            setDraft(settingsRef.current);
            draftRef.current = settingsRef.current;
            setSettingsOpen(false);
            setSettingsTransaction(undefined);
            requestAnimationFrame(() => terminal.current?.focus());
          }
          break;
        case 'appearance.changed':
          setAppearance(message.payload.state);
          setAppearanceReason(message.payload.reason);
          break;
        case 'clipboard.result': {
          const callback = clipboardRequests.current.get(message.payload.requestId);
          clipboardRequests.current.delete(message.payload.requestId);
          if (message.payload.ok) callback?.(message.payload.text);
          else addNotice('error', message.payload.error ?? 'Clipboard operation failed.');
          break;
        }
        case 'drop.path':
          terminal.current?.paste(message.payload.path);
          break;
        case 'terminal.recovered':
          terminal.current?.clear();
          addNotice(
            'warning',
            message.payload.droppedBytes > 0
              ? `WebView recovered; ${message.payload.droppedBytes} buffered bytes were dropped.`
              : 'WebView recovered.',
          );
          break;
        case 'app.notice':
          addNotice(message.payload.level, message.payload.message);
          break;
      }
    });
    return () => {
      off();
      bridge.dispose();
    };
  }, [addNotice, bridge]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (accepted) return;
    bridge.ready();
    const retry = window.setInterval(() => bridge.ready(), 500);
    return () => window.clearInterval(retry);
  }, [accepted, bridge]);

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sendLayout);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(document.documentElement);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [sendLayout]);

  useEffect(() => {
    const frame = requestAnimationFrame(sendLayout);
    return () => cancelAnimationFrame(frame);
  }, [context, draft.uiScale, sendLayout, settingsOpen]);

  const copy = useCallback(() => {
    const selection = terminal.current?.getSelection() ?? '';
    if (!selection) return;
    const id = requestId('copy');
    clipboardRequests.current.set(id, () => undefined);
    bridge.writeClipboard(id, selection);
    setContext(undefined);
  }, [bridge]);

  const requestPaste = useCallback(() => {
    const id = requestId('paste');
    clipboardRequests.current.set(id, (text) => {
      if (!text) return;
      if (isMultiline(text)) setPasteCandidate(text);
      else terminal.current?.paste(text);
    });
    bridge.readClipboard(id);
    setContext(undefined);
  }, [bridge]);

  const openSettings = useCallback(() => {
    if (settingsOpen) return;
    const transaction = requestId('settings');
    settingsTransactionRef.current = transaction;
    setSettingsTransaction(transaction);
    setDraft(settings);
    draftRef.current = settings;
    bridge.previewSettings(transaction, settingsPatch(settings));
    setSettingsOpen(true);
    setContext(undefined);
  }, [bridge, settings, settingsOpen]);

  const preview = useCallback(
    (value: Settings) => {
      setDraft(value);
      draftRef.current = value;
      if (settingsTransaction) bridge.previewSettings(settingsTransaction, settingsPatch(value));
    },
    [bridge, settingsTransaction],
  );

  const apply = useCallback(() => {
    if (!settingsTransaction || applyingSettings) return;
    pendingApplyRef.current = settingsTransaction;
    setApplyingSettings(true);
    bridge.applySettings(settingsTransaction, settingsPatch(draft));
  }, [applyingSettings, bridge, draft, settingsTransaction]);

  const cancel = useCallback(() => {
    if (applyingSettings) return;
    if (settingsTransaction) {
      pendingCancelRef.current = settingsTransaction;
      setApplyingSettings(true);
      bridge.cancelSettings(settingsTransaction);
      return;
    }
    setSettingsOpen(false);
    terminal.current?.focus();
  }, [applyingSettings, bridge, settings, settingsTransaction]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.key === 'Escape') {
        if (pasteCandidate !== undefined) setPasteCandidate(undefined);
        else if (context) setContext(undefined);
        else if (settingsOpen) cancel();
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
  }, [cancel, context, copy, openSettings, pasteCandidate, requestPaste, settingsOpen]);

  const appearanceStyle = cssAppearance(draft) as CSSProperties;
  const appearanceNotice =
    appearance === 'safe'
      ? labels.safeMode
      : appearanceReason === 'user-disabled'
        ? labels.glassDisabled
        : labels.policyFallback;
  return (
    <BridgeContext.Provider value={bridge}>
      <main
        className="app"
        data-appearance={appearance}
        data-animations={draft.animations && !capabilities.reducedMotion}
        style={appearanceStyle}
        onPointerDown={() => setContext(undefined)}
      >
        <div
          ref={terminalSurface}
          className="terminal-surface"
          onContextMenu={(event) => {
            event.preventDefault();
            setContext({ x: event.clientX, y: event.clientY });
          }}
        >
          {accepted ? (
            <TerminalView ref={terminal} settings={draft} capabilities={capabilities} />
          ) : (
            <div className="loading">Liquid Glass Terminal</div>
          )}
        </div>

        <button
          className="settings-trigger"
          type="button"
          aria-label={labels.settings}
          onClick={openSettings}
          disabled={!accepted}
        >
          <SettingsIcon size={17} />
        </button>

        {appearance !== 'glass' && (
          <div className="appearance-notice" role="status">
            {appearanceNotice}
            {appearanceReason ? <code>{appearanceReason}</code> : null}
          </div>
        )}

        {context ? (
          <ContextMenu
            ref={contextSurface}
            {...context}
            labels={labels}
            canCopy={terminal.current?.hasSelection() ?? false}
            onCopy={copy}
            onPaste={requestPaste}
            onSelectAll={() => {
              terminal.current?.selectAll();
              setContext(undefined);
            }}
            onClear={() => {
              terminal.current?.clear();
              setContext(undefined);
            }}
          />
        ) : null}

        <SettingsDrawer
          ref={drawerSurface}
          open={settingsOpen}
          value={draft}
          labels={labels}
          onChange={preview}
          onApply={apply}
          onCancel={cancel}
          pending={applyingSettings}
        />

        {pasteCandidate !== undefined ? (
          <PasteDialog
            text={pasteCandidate}
            labels={labels}
            onCancel={() => {
              setPasteCandidate(undefined);
              terminal.current?.focus();
            }}
            onAccept={() => {
              terminal.current?.paste(pasteCandidate);
              setPasteCandidate(undefined);
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
