import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ClipboardEvent as ReactClipboardEvent,
} from 'react';
import type {
  PtyToRendererMessage,
  RendererToPtyMessage,
  ResolvedTheme,
  SettingsV1,
  ShellProfileDescriptor,
} from '../../shared/contracts';
import { safeExternalUrl, sanitizeTerminalTitle } from '../../shared/validation';
import { terminalTheme } from '../lib/terminal-theme';

const INPUT_CHUNK = 32 * 1024;

export interface TerminalPaneHandle {
  focus(): void;
  getSelection(): string;
  hasSelection(): boolean;
  paste(text: string): void;
  selectAll(): void;
  clear(): void;
  findNext(term: string, caseSensitive: boolean): boolean;
  findPrevious(term: string, caseSensitive: boolean): boolean;
}

interface TerminalPaneProps {
  sessionId: string;
  profile: ShellProfileDescriptor;
  port: MessagePort;
  active: boolean;
  settings: SettingsV1;
  resolvedTheme: ResolvedTheme;
  reducedMotion: boolean;
  onTitle(title: string): void;
  onExit(code: number): void;
  onRestarted(): void;
  onBell(): void;
  onLinkHover(url?: string): void;
  onError(key: string): void;
}

function sendChunked(port: MessagePort, data: string): void {
  for (let offset = 0; offset < data.length; offset += INPUT_CHUNK) {
    port.postMessage({
      type: 'input',
      data: data.slice(offset, offset + INPUT_CHUNK),
    } satisfies RendererToPtyMessage);
  }
}

export const TerminalPane = forwardRef<TerminalPaneHandle, TerminalPaneProps>(function TerminalPane(
  {
    sessionId,
    profile,
    port,
    active,
    settings,
    resolvedTheme,
    reducedMotion,
    onTitle,
    onExit,
    onRestarted,
    onBell,
    onLinkHover,
    onError,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | undefined>(undefined);
  const fitRef = useRef<FitAddon | undefined>(undefined);
  const searchRef = useRef<SearchAddon | undefined>(undefined);
  const callbacksRef = useRef({ onTitle, onExit, onRestarted, onBell, onLinkHover, onError });
  callbacksRef.current = { onTitle, onExit, onRestarted, onBell, onLinkHover, onError };

  useImperativeHandle(
    ref,
    () => ({
      focus: () => terminalRef.current?.focus(),
      getSelection: () => terminalRef.current?.getSelection() ?? '',
      hasSelection: () => terminalRef.current?.hasSelection() ?? false,
      paste: (text) => terminalRef.current?.paste(text),
      selectAll: () => terminalRef.current?.selectAll(),
      clear: () => terminalRef.current?.clear(),
      findNext: (term, caseSensitive) =>
        searchRef.current?.findNext(term, { caseSensitive, incremental: true }) ?? false,
      findPrevious: (term, caseSensitive) =>
        searchRef.current?.findPrevious(term, { caseSensitive, incremental: true }) ?? false,
    }),
    [],
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const terminal = new Terminal({
      allowProposedApi: true,
      allowTransparency: true,
      convertEol: false,
      cursorBlink: settings.cursorBlink && !reducedMotion && !settings.screenReaderMode,
      cursorStyle: settings.cursorStyle,
      fontFamily: '"Cascadia Mono PL", "Yu Gothic UI", "Hiragino Sans", monospace',
      fontSize: settings.fontSize,
      lineHeight: 1.25,
      minimumContrastRatio: 4.5,
      rightClickSelectsWord: false,
      screenReaderMode: settings.screenReaderMode,
      scrollback: settings.scrollback,
      scrollOnUserInput: true,
      theme: terminalTheme(resolvedTheme),
      windowOptions: {},
      linkHandler: {
        activate: (event, text) => {
          if ((event.ctrlKey || event.metaKey) && safeExternalUrl(text)) {
            void window.liquidGlass.openExternal(text);
          }
        },
        hover: (_event, text) => callbacksRef.current.onLinkHover(safeExternalUrl(text)?.href),
        leave: () => callbacksRef.current.onLinkHover(),
      },
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    const unicode = new Unicode11Addon();
    terminal.loadAddon(fit);
    terminal.loadAddon(search);
    terminal.loadAddon(unicode);
    terminal.unicode.activeVersion = '11';
    terminal.loadAddon(
      new WebLinksAddon((event, uri) => {
        if ((event.ctrlKey || event.metaKey) && safeExternalUrl(uri)) {
          void window.liquidGlass.openExternal(uri);
        }
      }),
    );
    terminal.open(containerRef.current);

    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      terminal.loadAddon(webgl);
    } catch {
      // xterm keeps its DOM renderer when WebGL is unavailable.
    }

    terminalRef.current = terminal;
    fitRef.current = fit;
    searchRef.current = search;

    const dataDisposable = terminal.onData((data) => sendChunked(port, data));
    const titleDisposable = terminal.onTitleChange((title) => {
      const sanitized = sanitizeTerminalTitle(title);
      if (sanitized) callbacksRef.current.onTitle(sanitized);
    });
    const bellDisposable = terminal.onBell(() => callbacksRef.current.onBell());
    const oscDisposable = terminal.parser.registerOscHandler(7, (uri) => {
      port.postMessage({ type: 'cwd', uri } satisfies RendererToPtyMessage);
      return true;
    });

    port.onmessage = (event: MessageEvent<PtyToRendererMessage>) => {
      const message = event.data;
      if (message.type === 'data') {
        terminal.write(message.data, () => {
          port.postMessage({
            type: 'ack',
            seq: message.seq,
            bytes: message.bytes,
          } satisfies RendererToPtyMessage);
        });
      } else if (message.type === 'exit') {
        callbacksRef.current.onExit(message.code);
      } else if (message.type === 'restarted') {
        callbacksRef.current.onRestarted();
      } else if (message.type === 'error') {
        callbacksRef.current.onError(message.messageKey);
      }
    };
    port.start();

    const resize = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        try {
          fit.fit();
          port.postMessage({
            type: 'resize',
            cols: terminal.cols,
            rows: terminal.rows,
          } satisfies RendererToPtyMessage);
        } catch {
          // Hidden tabs have no measurable viewport.
        }
      });
    });
    resize.observe(containerRef.current);
    fit.fit();

    return () => {
      resize.disconnect();
      dataDisposable.dispose();
      titleDisposable.dispose();
      bellDisposable.dispose();
      oscDisposable.dispose();
      port.onmessage = null;
      try {
        port.postMessage({ type: 'close' } satisfies RendererToPtyMessage);
        port.close();
      } catch {
        // The main process may already have closed the port.
      }
      terminal.dispose();
      terminalRef.current = undefined;
    };
  }, [sessionId, port, profile.id]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.fontSize = settings.fontSize;
    terminal.options.cursorStyle = settings.cursorStyle;
    terminal.options.cursorBlink =
      settings.cursorBlink && !reducedMotion && !settings.screenReaderMode;
    terminal.options.screenReaderMode = settings.screenReaderMode;
    terminal.options.scrollback = settings.scrollback;
    terminal.options.theme = terminalTheme(resolvedTheme);
    if (active) {
      fitRef.current?.fit();
      terminal.focus();
    }
  }, [active, reducedMotion, resolvedTheme, settings]);

  const blockNativePaste = (event: ReactClipboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      className="terminal-pane"
      data-active={active}
      data-session-id={sessionId}
      aria-hidden={!active}
      onPasteCapture={blockNativePaste}
    >
      <div ref={containerRef} className="terminal-mount" aria-label={profile.label} />
    </div>
  );
});
