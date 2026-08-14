import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ClipboardEvent as ReactClipboardEvent,
} from 'react';
import type { Capabilities, Settings } from '../../../contracts/generated/protocol';
import { resolveForeground } from '../appearance';
import { useBridge } from '../bridge/context';

export interface TerminalViewHandle {
  clear(): void;
  focus(): void;
  getSelection(): string;
  hasSelection(): boolean;
  paste(text: string): void;
  selectAll(): void;
}

interface TerminalViewProps {
  settings: Settings;
  capabilities: Capabilities;
}

function terminalTheme(settings: Settings, capabilities: Capabilities, host: HTMLElement | null) {
  if (capabilities.highContrast) {
    const foreground = host ? getComputedStyle(host).color : '#ffffff';
    return {
      background: '#00000000',
      foreground,
      cursor: foreground,
      selectionBackground: '#80808080',
    };
  }
  const foreground = resolveForeground(settings.glass.tint, settings.foreground);
  return foreground === 'light'
    ? {
        background: `${settings.glass.tint}00`,
        foreground: '#ffffff',
        cursor: '#ffffff',
        selectionBackground: '#ffffff38',
      }
    : {
        background: `${settings.glass.tint}00`,
        foreground: '#000000',
        cursor: '#000000',
        selectionBackground: '#0000002f',
      };
}

export const TerminalView = forwardRef<TerminalViewHandle, TerminalViewProps>(function TerminalView(
  { settings, capabilities },
  ref,
) {
  const bridge = useBridge();
  const host = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | undefined>(undefined);
  const fitRef = useRef<FitAddon | undefined>(undefined);

  useImperativeHandle(
    ref,
    () => ({
      clear: () => terminalRef.current?.clear(),
      focus: () => terminalRef.current?.focus(),
      getSelection: () => terminalRef.current?.getSelection() ?? '',
      hasSelection: () => terminalRef.current?.hasSelection() ?? false,
      paste: (text) => terminalRef.current?.paste(text),
      selectAll: () => terminalRef.current?.selectAll(),
    }),
    [],
  );

  useEffect(() => {
    if (!host.current) return;
    const terminal = new Terminal({
      allowTransparency: true,
      convertEol: false,
      cursorBlink: settings.animations && !capabilities.reducedMotion && !capabilities.screenReader,
      cursorStyle: 'block',
      disableStdin: false,
      fontFamily: '"Cascadia Mono PL", monospace',
      fontSize: 14,
      lineHeight: 1.22,
      minimumContrastRatio: 4.5,
      rightClickSelectsWord: false,
      screenReaderMode: capabilities.screenReader,
      scrollback: 100_000,
      scrollOnUserInput: true,
      theme: terminalTheme(settings, capabilities, host.current),
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host.current);
    let disposed = false;
    void import('@xterm/addon-webgl')
      .then(({ WebglAddon }) => {
        if (disposed) return;
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        terminal.loadAddon(webgl);
      })
      .catch(() => {
        // xterm keeps the DOM renderer when WebGL is unavailable.
      });
    terminalRef.current = terminal;
    fitRef.current = fit;

    const data = terminal.onData((value) => bridge.sendInput(value));
    const output = bridge.onOutput((value, commit) => {
      terminal.write(value, () => bridge.acknowledge(commit));
    });
    let frame = 0;
    const resize = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        try {
          fit.fit();
          bridge.resize(terminal.cols, terminal.rows);
        } catch {
          // A zero-sized transition is retried by the next observer notification.
        }
      });
    });
    resize.observe(host.current);
    fit.fit();
    bridge.resize(terminal.cols, terminal.rows);
    terminal.focus();

    return () => {
      disposed = true;
      resize.disconnect();
      cancelAnimationFrame(frame);
      data.dispose();
      output();
      terminal.dispose();
      terminalRef.current = undefined;
      fitRef.current = undefined;
    };
  }, [bridge]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.cursorBlink =
      settings.animations && !capabilities.reducedMotion && !capabilities.screenReader;
    terminal.options.screenReaderMode = capabilities.screenReader;
    terminal.options.theme = terminalTheme(settings, capabilities, host.current);
    fitRef.current?.fit();
    terminal.focus();
  }, [capabilities, settings]);

  const preventWebClipboard = (event: ReactClipboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      className="terminal-view"
      onCopyCapture={preventWebClipboard}
      onPasteCapture={preventWebClipboard}
    >
      <div ref={host} className="terminal-mount" aria-label="Terminal" />
    </div>
  );
});
