import { arrayMove } from '@dnd-kit/sortable';
import { RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppCommand,
  BootstrapState,
  SettingsPatch,
  SettingsV1,
  ShellProfileDescriptor,
  SystemAppearance,
} from '../shared/contracts';
import { formatMessage, isMessageKey, messages, resolveLocale } from '../shared/i18n';
import { detectPasteRisk } from '../shared/validation';
import { Dialog } from './components/Dialog';
import { SearchBar } from './components/SearchBar';
import { SettingsDrawer } from './components/SettingsDrawer';
import { TabBar } from './components/TabBar';
import { TerminalPane, type TerminalPaneHandle } from './components/TerminalPane';
import { requestTerminalSession } from './lib/session';

interface TabState {
  id: string;
  title: string;
  profile: ShellProfileDescriptor;
  port: MessagePort;
  exitedCode?: number;
  bell: boolean;
}

type DialogState =
  | { kind: 'paste'; text: string; oversized: boolean; lines: number; bytes: number }
  | { kind: 'exit'; count: number }
  | { kind: 'tab-limit'; profileId?: string; cwdToken?: string; inherit: boolean };

interface ToastState {
  id: number;
  text: string;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

function safePreview(text: string): string {
  return Array.from(text)
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 0x08 ||
        code === 0x0b ||
        code === 0x0c ||
        (code >= 0x0e && code <= 0x1f) ||
        (code >= 0x7f && code <= 0x9f)
        ? '�'
        : character;
    })
    .join('')
    .split(/\r\n|\r|\n/)
    .slice(0, 20)
    .join('\n')
    .slice(0, 16_384);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapState>();
  const [settings, setSettings] = useState<SettingsV1>();
  const [systemAppearance, setSystemAppearance] = useState<SystemAppearance>();
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [noMatches, setNoMatches] = useState(false);
  const [dialog, setDialog] = useState<DialogState>();
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [opening, setOpening] = useState(false);
  const [linkHover, setLinkHover] = useState<string>();
  const [bellFlash, setBellFlash] = useState(false);
  const terminalRefs = useRef(new Map<string, TerminalPaneHandle>());
  const settingsRef = useRef<SettingsV1 | undefined>(undefined);
  const tabsRef = useRef<TabState[]>([]);
  const activeIdRef = useRef<string | undefined>(undefined);
  const initialized = useRef(false);
  const toastSequence = useRef(1);
  const pointerFrame = useRef<number | undefined>(undefined);
  const commandHandler = useRef<(command: AppCommand) => void>(() => undefined);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const locale = useMemo(
    () => resolveLocale(settings?.locale ?? 'system', navigator.language),
    [settings?.locale],
  );
  const t = messages[locale];
  const resolvedTheme =
    settings?.theme === 'light' || settings?.theme === 'dark'
      ? settings.theme
      : (systemAppearance?.resolvedTheme ?? 'dark');

  const toast = useCallback(
    (keyOrText: string) => {
      const text = isMessageKey(keyOrText) ? messages[locale][keyOrText] : keyOrText;
      const id = toastSequence.current++;
      setToasts((items) => [...items, { id, text }]);
      window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4_500);
    },
    [locale],
  );

  const createTabInternal = useCallback(
    async (profileId?: string, cwdToken?: string, inherit = true) => {
      if (!settings) return;
      setOpening(true);
      try {
        const active = inherit ? activeIdRef.current : undefined;
        const session = await requestTerminalSession({
          profileId: profileId ?? settings.defaultProfileId,
          ...(cwdToken ? { cwdToken } : {}),
          ...(active ? { inheritFromSessionId: active } : {}),
          cols: 80,
          rows: 24,
        });
        const next: TabState = {
          id: session.sessionId,
          title: session.profile.label,
          profile: session.profile,
          port: session.port,
          bell: false,
        };
        setTabs((items) => [...items, next]);
        setActiveId(next.id);
      } catch (error) {
        toast(error instanceof Error ? error.message : 'sessionFailed');
      } finally {
        setOpening(false);
      }
    },
    [settings, toast],
  );

  const requestNewTab = useCallback(
    (profileId?: string, cwdToken?: string, inherit = true) => {
      if (tabsRef.current.length >= 20) {
        setDialog({ kind: 'tab-limit', profileId, cwdToken, inherit });
        return;
      }
      void createTabInternal(profileId, cwdToken, inherit);
    },
    [createTabInternal],
  );

  const activateTab = useCallback((id: string) => {
    setActiveId(id);
    setTabs((items) => items.map((item) => (item.id === id ? { ...item, bell: false } : item)));
    window.setTimeout(() => terminalRefs.current.get(id)?.focus(), 0);
  }, []);

  const closeTab = useCallback((id: string) => {
    const current = tabsRef.current;
    const index = current.findIndex((tab) => tab.id === id);
    if (index === -1) return;
    if (current.length === 1) {
      setTabs([]);
      window.liquidGlass.quit();
      return;
    }
    const next = current.filter((tab) => tab.id !== id);
    setTabs(next);
    if (activeIdRef.current === id) {
      const replacement = next[Math.min(index, next.length - 1)];
      setActiveId(replacement.id);
    }
  }, []);

  const cycleTab = useCallback(
    (direction: -1 | 1) => {
      const current = tabsRef.current;
      if (current.length < 2) return;
      const index = current.findIndex((tab) => tab.id === activeIdRef.current);
      activateTab(current[(index + direction + current.length) % current.length].id);
    },
    [activateTab],
  );

  const reorderActive = useCallback((direction: -1 | 1) => {
    const current = tabsRef.current;
    const index = current.findIndex((tab) => tab.id === activeIdRef.current);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return;
    setTabs(arrayMove(current, index, target));
  }, []);

  const activeTerminal = useCallback(
    () => (activeIdRef.current ? terminalRefs.current.get(activeIdRef.current) : undefined),
    [],
  );

  const copy = useCallback(async () => {
    const selection = activeTerminal()?.getSelection();
    if (selection) await navigator.clipboard.writeText(selection);
  }, [activeTerminal]);

  const offerPaste = useCallback(
    (text: string) => {
      const risk = detectPasteRisk(text);
      if (risk.oversized || (risk.multiline && settings?.warnMultilinePaste)) {
        setDialog({ kind: 'paste', text, ...risk });
      } else {
        activeTerminal()?.paste(text);
      }
    },
    [activeTerminal, settings?.warnMultilinePaste],
  );

  const paste = useCallback(async () => {
    try {
      offerPaste(await navigator.clipboard.readText());
    } catch {
      toast(
        locale === 'ja'
          ? 'クリップボードを読み取れませんでした。'
          : 'Could not read the clipboard.',
      );
    }
  }, [locale, offerPaste, toast]);

  const runSearch = useCallback(
    (previous = false, query = searchQuery, sensitive = caseSensitive) => {
      if (!query) {
        setNoMatches(false);
        return;
      }
      const found = previous
        ? activeTerminal()?.findPrevious(query, sensitive)
        : activeTerminal()?.findNext(query, sensitive);
      setNoMatches(found === false);
    },
    [activeTerminal, caseSensitive, searchQuery],
  );

  const updateSettings = useCallback(
    async (patch: SettingsPatch) => {
      const previous = settingsRef.current;
      if (previous) {
        const optimistic = { ...previous, ...patch };
        settingsRef.current = optimistic;
        setSettings(optimistic);
      }
      try {
        const next = await window.liquidGlass.updateSettings(patch);
        settingsRef.current = next;
        setSettings(next);
      } catch {
        if (previous) {
          settingsRef.current = previous;
          setSettings(previous);
        }
        toast(locale === 'ja' ? '設定を保存できませんでした。' : 'Could not save settings.');
      }
    },
    [locale, toast],
  );

  useEffect(() => {
    let alive = true;
    void window.liquidGlass.bootstrap().then((state) => {
      if (!alive) return;
      setBootstrap(state);
      setSettings(state.settings);
      setSystemAppearance(state.systemAppearance);
      if (state.startupNotice) toast(state.startupNotice);
      window.liquidGlass.rendererReady();
    });
    const offAppearance = window.liquidGlass.onSystemAppearance(setSystemAppearance);
    return () => {
      alive = false;
      offAppearance();
    };
  }, [toast]);

  useEffect(() => {
    if (!bootstrap || !settings || initialized.current) return;
    initialized.current = true;
    void createTabInternal(undefined, bootstrap.launchCwdToken, false);
  }, [bootstrap, createTabInternal, settings]);

  commandHandler.current = (command) => {
    switch (command.type) {
      case 'new-tab':
        if (command.notice) toast(command.notice);
        requestNewTab(undefined, command.cwdToken, !command.cwdToken);
        break;
      case 'close-tab':
        if (activeIdRef.current) closeTab(activeIdRef.current);
        break;
      case 'next-tab':
        cycleTab(1);
        break;
      case 'previous-tab':
        cycleTab(-1);
        break;
      case 'reorder-tab':
        reorderActive(command.direction);
        break;
      case 'copy':
        void copy();
        break;
      case 'paste':
        void paste();
        break;
      case 'select-all':
        activeTerminal()?.selectAll();
        break;
      case 'search':
        setSearchOpen(true);
        break;
      case 'clear':
        activeTerminal()?.clear();
        break;
      case 'open-settings':
        setSettingsOpen(true);
        break;
      case 'confirm-exit':
        setDialog({ kind: 'exit', count: tabsRef.current.length });
        break;
    }
  };

  useEffect(() => window.liquidGlass.onCommand((command) => commandHandler.current(command)), []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (dialog || settingsOpen) return;
      const mac = navigator.platform.toLowerCase().includes('mac');
      const command = mac ? event.metaKey : event.ctrlKey;
      const active = activeTerminal();

      if (command && event.key.toLowerCase() === 't') {
        event.preventDefault();
        requestNewTab();
      } else if (command && event.key.toLowerCase() === 'w') {
        event.preventDefault();
        if (activeIdRef.current) closeTab(activeIdRef.current);
      } else if (command && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
      } else if (command && event.key === ',') {
        event.preventDefault();
        setSettingsOpen(true);
      } else if (event.ctrlKey && event.key === 'Tab') {
        event.preventDefault();
        cycleTab(event.shiftKey ? -1 : 1);
      } else if (event.altKey && event.shiftKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        reorderActive(-1);
      } else if (event.altKey && event.shiftKey && event.key === 'ArrowRight') {
        event.preventDefault();
        reorderActive(1);
      } else if (mac && event.metaKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        void copy();
      } else if (
        !mac &&
        event.ctrlKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'c' &&
        active?.hasSelection()
      ) {
        event.preventDefault();
        void copy();
      } else if (
        (mac && event.metaKey && event.key.toLowerCase() === 'v') ||
        (!mac && event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'v')
      ) {
        event.preventDefault();
        void paste();
      }
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, [
    activeTerminal,
    closeTab,
    copy,
    cycleTab,
    dialog,
    paste,
    reorderActive,
    requestNewTab,
    settingsOpen,
  ]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  if (!bootstrap || !settings || !systemAppearance) {
    return (
      <main className="loading-screen">
        <div className="brand-orb" />
        <span>Liquid Glass Terminal</span>
      </main>
    );
  }

  const activeTab = tabs.find((tab) => tab.id === activeId);
  const highReadability =
    systemAppearance.highContrast ||
    systemAppearance.reducedTransparency ||
    settings.screenReaderMode;

  const handleBell = (id: string) => {
    if (id === activeIdRef.current) {
      setBellFlash(true);
      window.setTimeout(() => setBellFlash(false), reducedMotion ? 0 : 180);
    } else {
      setTabs((items) => items.map((item) => (item.id === id ? { ...item, bell: true } : item)));
    }
    if (settings.bellSound) {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.035, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.12);
      oscillator.frequency.value = 660;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.12);
      oscillator.addEventListener('ended', () => void context.close());
    }
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    if (!activeTab) return;
    const files = [...event.dataTransfer.files];
    if (files.length !== 1) {
      toast('dropOne');
      return;
    }
    const path = window.liquidGlass.getPathForFile(files[0]);
    const quoted = await window.liquidGlass.prepareDroppedPath(activeTab.id, path);
    if (!quoted) {
      toast('unsupportedDrop');
      return;
    }
    activeTerminal()?.paste(quoted);
  };

  const pointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (reducedMotion) return;
    const { clientX, clientY } = event;
    if (pointerFrame.current) cancelAnimationFrame(pointerFrame.current);
    pointerFrame.current = requestAnimationFrame(() => {
      document.documentElement.style.setProperty('--pointer-x', `${clientX}px`);
      document.documentElement.style.setProperty('--pointer-y', `${clientY}px`);
    });
  };

  return (
    <main
      className="app-shell"
      data-theme={resolvedTheme}
      data-glass={highReadability ? 'dense' : settings.glass}
      data-native-glass={highReadability ? 'pseudo' : bootstrap.glassMode}
      data-high-contrast={systemAppearance.highContrast}
      data-screen-reader={settings.screenReaderMode}
      data-platform={bootstrap.platform}
      data-bell={bellFlash}
      onPointerMove={pointerMove}
    >
      <div className="glass-light" aria-hidden="true" />
      <div className="glass-noise" aria-hidden="true" />
      <TabBar
        tabs={tabs.map((tab) => ({
          id: tab.id,
          title: tab.title,
          profile: tab.profile,
          bell: tab.bell,
          exited: tab.exitedCode !== undefined,
        }))}
        activeId={activeId}
        profiles={bootstrap.profiles}
        labels={{ newTab: t.newTab, closeTab: t.closeTab, settings: t.settings }}
        onActivate={activateTab}
        onClose={closeTab}
        onNew={(profileId) => requestNewTab(profileId)}
        onSettings={() => setSettingsOpen(true)}
        onReorder={(dragged, over) => {
          const from = tabsRef.current.findIndex((tab) => tab.id === dragged);
          const to = tabsRef.current.findIndex((tab) => tab.id === over);
          if (from >= 0 && to >= 0) setTabs(arrayMove(tabsRef.current, from, to));
        }}
      />

      <section
        className="terminal-stage"
        aria-label={t.terminal}
        onContextMenu={(event) => {
          event.preventDefault();
          window.liquidGlass.showContextMenu({
            hasSelection: activeTerminal()?.hasSelection() ?? false,
          });
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => void handleDrop(event)}
      >
        {tabs.map((tab) => (
          <div key={tab.id} className="terminal-slot" data-active={tab.id === activeId}>
            <TerminalPane
              ref={(handle) => {
                if (handle) terminalRefs.current.set(tab.id, handle);
                else terminalRefs.current.delete(tab.id);
              }}
              sessionId={tab.id}
              profile={tab.profile}
              port={tab.port}
              active={tab.id === activeId}
              settings={settings}
              resolvedTheme={resolvedTheme}
              reducedMotion={reducedMotion}
              onTitle={(title) =>
                setTabs((items) =>
                  items.map((item) => (item.id === tab.id ? { ...item, title } : item)),
                )
              }
              onExit={(code) =>
                setTabs((items) =>
                  items.map((item) => (item.id === tab.id ? { ...item, exitedCode: code } : item)),
                )
              }
              onRestarted={() =>
                setTabs((items) =>
                  items.map((item) =>
                    item.id === tab.id ? { ...item, exitedCode: undefined } : item,
                  ),
                )
              }
              onBell={() => handleBell(tab.id)}
              onLinkHover={setLinkHover}
              onError={toast}
            />
            {tab.exitedCode !== undefined && (
              <div className="exit-card" role="status">
                <span>{formatMessage(locale, 'exited', { code: tab.exitedCode })}</span>
                <button
                  type="button"
                  className="button primary compact"
                  onClick={() => tab.port.postMessage({ type: 'restart' })}
                >
                  <RotateCcw size={14} />
                  {t.restart}
                </button>
              </div>
            )}
          </div>
        ))}
        {opening && <div className="opening-indicator" aria-label="Opening terminal" />}
      </section>

      {searchOpen && (
        <SearchBar
          query={searchQuery}
          caseSensitive={caseSensitive}
          noMatches={noMatches}
          labels={{
            search: t.search,
            previous: t.previous,
            next: t.next,
            caseSensitive: t.caseSensitive,
            close: t.close,
            noMatches: t.noMatches,
          }}
          onQuery={(value) => {
            setSearchQuery(value);
            runSearch(false, value, caseSensitive);
          }}
          onCaseSensitive={(value) => {
            setCaseSensitive(value);
            runSearch(false, searchQuery, value);
          }}
          onNext={() => runSearch(false)}
          onPrevious={() => runSearch(true)}
          onClose={() => {
            setSearchOpen(false);
            activeTerminal()?.focus();
          }}
        />
      )}

      {linkHover && <div className="link-preview">{linkHover}</div>}

      {!settings.firstRunHintsSeen && tabs.length > 0 && (
        <div className="first-run-hint" role="status">
          <span>{t.firstHint}</span>
          <button type="button" onClick={() => void updateSettings({ firstRunHintsSeen: true })}>
            {t.dismiss}
          </button>
        </div>
      )}

      <SettingsDrawer
        open={settingsOpen}
        settings={settings}
        profiles={bootstrap.profiles}
        labels={t}
        onClose={() => {
          setSettingsOpen(false);
          activeTerminal()?.focus();
        }}
        onChange={(patch) => void updateSettings(patch)}
      />

      {dialog?.kind === 'paste' && (
        <Dialog
          title={dialog.oversized ? t.oversizedTitle : t.multilineTitle}
          cancelLabel={t.cancel}
          confirmLabel={t.pasteAction}
          destructive={dialog.oversized}
          onCancel={() => setDialog(undefined)}
          onConfirm={() => {
            activeTerminal()?.paste(dialog.text);
            setDialog(undefined);
          }}
        >
          <p>
            {formatMessage(locale, 'pasteSummary', {
              lines: dialog.lines,
              size: formatBytes(dialog.bytes),
            })}
          </p>
          <pre className="paste-preview">{safePreview(dialog.text)}</pre>
        </Dialog>
      )}

      {dialog?.kind === 'exit' && (
        <Dialog
          title={t.exitTitle}
          cancelLabel={t.cancel}
          confirmLabel={t.quit}
          destructive
          onCancel={() => setDialog(undefined)}
          onConfirm={() => window.liquidGlass.confirmExit()}
        >
          <p>{formatMessage(locale, 'exitBody', { count: dialog.count })}</p>
        </Dialog>
      )}

      {dialog?.kind === 'tab-limit' && (
        <Dialog
          title={t.tabLimitTitle}
          cancelLabel={t.cancel}
          confirmLabel={t.continue}
          onCancel={() => setDialog(undefined)}
          onConfirm={() => {
            const pending = dialog;
            setDialog(undefined);
            void createTabInternal(pending.profileId, pending.cwdToken, pending.inherit);
          }}
        >
          <p>{t.tabLimitBody}</p>
        </Dialog>
      )}

      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className="toast">
            {item.text}
          </div>
        ))}
      </div>
    </main>
  );
}
