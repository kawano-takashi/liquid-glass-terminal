import { act, fireEvent, render, screen } from '@testing-library/react';
import { PROTOCOL_VERSION, DEFAULT_SETTINGS } from '../../contracts/generated/protocol';
import { App } from '../../web/src/App';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../web/src/components/TerminalView', async () => {
  const React = await import('react');
  return {
    TerminalView: React.forwardRef(function TerminalViewMock(_props, ref) {
      React.useImperativeHandle(ref, () => ({
        clear() {},
        focus() {},
        getSelection: () => '',
        hasSelection: () => false,
        paste() {},
        selectAll() {},
      }));
      return React.createElement('div', { className: 'terminal-mount' });
    }),
  };
});

type Listener = (event: never) => void;

class WebViewMock {
  readonly posted: unknown[] = [];
  readonly listeners = new Map<string, Set<Listener>>();

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event as never);
  }
}

function envelope(type: string, payload: unknown) {
  return { v: PROTOCOL_VERSION, type, payload };
}

describe('App Glass settings transaction', () => {
  let host: WebViewMock;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;

  const flushFrames = async () => {
    while (frames.size > 0) {
      const pending = [...frames.values()];
      frames.clear();
      act(() => {
        for (const callback of pending) callback(0);
      });
      await Promise.resolve();
    }
  };

  beforeEach(() => {
    host = new WebViewMock();
    frames = new Map();
    nextFrame = 1;
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      value: { webview: host },
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 12,
      y: 68,
      width: 400,
      height: 600,
      top: 68,
      right: 412,
      bottom: 668,
      left: 12,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps Chrome at 56 DIP, batches blur previews, and sends no overlay layout', async () => {
    const { container } = render(<App />);
    act(() => {
      host.emit('message', {
        data: envelope('bridge.accepted', {
          sessionId: 'terminal-1',
          settings: { ...DEFAULT_SETTINGS, glass: { ...DEFAULT_SETTINGS.glass } },
          capabilities: {
            glass: true,
            sharedBuffers: false,
            reducedMotion: false,
            screenReader: false,
            highContrast: false,
          },
          windowState: { maximized: false, fullscreen: false, active: true },
        }),
      });
      host.emit('message', { data: envelope('appearance.changed', { state: 'glass' }) });
    });
    await flushFrames();

    const app = container.querySelector<HTMLElement>('.app');
    expect(app?.style.getPropertyValue('--chrome-height')).toBe('56px');
    expect(app?.style.getPropertyValue('--glass-intensity')).toBe('');
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    const initialPreviews = host.posted.filter(
      (message) => (message as { type?: string }).type === 'settings.preview',
    );
    expect(initialPreviews).toHaveLength(1);

    const blur = screen.getByRole('slider', { name: 'Blur' });
    fireEvent.change(blur, { target: { value: '40' } });
    fireEvent.change(blur, { target: { value: '45' } });
    expect(app?.style.getPropertyValue('--glass-intensity')).toBe('');
    act(() => {
      host.emit('message', {
        data: envelope('settings.snapshot', {
          transactionId: (initialPreviews[0] as { payload: { transactionId: string } }).payload
            .transactionId,
          settings: { ...DEFAULT_SETTINGS, glass: { ...DEFAULT_SETTINGS.glass } },
        }),
      });
    });
    expect(blur).toHaveValue('45');
    expect(
      host.posted.filter((message) => (message as { type?: string }).type === 'settings.preview'),
    ).toHaveLength(1);
    await flushFrames();

    const previews = host.posted.filter(
      (message) => (message as { type?: string }).type === 'settings.preview',
    ) as Array<{ payload: { patch: { glass: { blurDips: number } } } }>;
    expect(previews).toHaveLength(2);
    expect(previews[1].payload.patch.glass.blurDips).toBe(45);

    fireEvent.change(screen.getByRole('slider', { name: 'UI scale' }), {
      target: { value: '200' },
    });
    expect(app?.style.getPropertyValue('--chrome-height')).toBe('28px');
    await flushFrames();

    const layouts = host.posted.filter(
      (message) => (message as { type?: string }).type === 'glass.layout.set',
    );
    expect(layouts).toHaveLength(0);

    const transactionId = (initialPreviews[0] as { payload: { transactionId: string } }).payload
      .transactionId;
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    act(() => {
      host.emit('message', {
        data: envelope('settings.result', {
          transactionId,
          operation: 'preview',
          ok: false,
          error: 'settings.patch.invalid',
        }),
      });
    });
    const drawer = container.querySelector('.settings-drawer');
    expect(drawer).toHaveAttribute('data-open', 'true');
    expect(drawer).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Settings could not be saved.')).toBeInTheDocument();

    act(() => {
      host.emit('message', {
        data: envelope('settings.result', {
          transactionId,
          operation: 'apply',
          ok: false,
          error: 'settings.save.failed',
        }),
      });
    });
    expect(drawer).toHaveAttribute('data-open', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('slider', { name: 'Blur' })).toHaveValue('30');
  });

  it('removes all DOM Chrome when native fullscreen state changes', async () => {
    render(<App />);
    act(() => {
      host.emit('message', {
        data: envelope('bridge.accepted', {
          sessionId: 'terminal-1',
          settings: { ...DEFAULT_SETTINGS, glass: { ...DEFAULT_SETTINGS.glass } },
          capabilities: {
            glass: true,
            sharedBuffers: false,
            reducedMotion: false,
            screenReader: false,
            highContrast: false,
          },
          windowState: { maximized: false, fullscreen: false, active: true },
        }),
      });
    });
    expect(await screen.findByText('Terminal')).toBeInTheDocument();

    act(() => {
      host.emit('message', {
        data: envelope('window.state.changed', {
          maximized: false,
          fullscreen: true,
          active: true,
        }),
      });
    });
    expect(screen.queryByText('Terminal')).not.toBeInTheDocument();
  });
});
