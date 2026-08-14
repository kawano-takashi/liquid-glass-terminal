import { NativeBridge } from '../../web/src/bridge/NativeBridge';
import { LIMITS, PROTOCOL_VERSION } from '../../contracts/generated/protocol';
import { beforeEach, describe, expect, it } from 'vitest';

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

describe('NativeBridge', () => {
  let host: WebViewMock;
  let bridge: NativeBridge;

  beforeEach(() => {
    host = new WebViewMock();
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      value: { webview: host },
    });
    bridge = new NativeBridge();
    bridge.connect();
  });

  it('queues input and never overwrites either in-flight shared buffer', () => {
    const buffers = [new ArrayBuffer(LIMITS.maxTerminalChunkBytes), new ArrayBuffer(65_536)];
    buffers.forEach((buffer, index) => {
      host.emit('sharedbufferreceived', {
        additionalData: envelope('terminal.buffer.attach', {
          direction: 'input',
          buffer: index,
          generation: 7,
          capacity: LIMITS.maxTerminalChunkBytes,
        }),
        getBuffer: () => buffer,
      });
    });
    bridge.sendInput('a'.repeat(LIMITS.maxTerminalChunkBytes * 3));
    const commits = host.posted.filter(
      (message) => (message as { type?: string }).type === 'terminal.input.commit',
    ) as Array<{
      payload: { buffer: number; generation: number; sequence: number; length: number };
    }>;
    expect(commits).toHaveLength(2);
    expect(commits.map(({ payload }) => payload.buffer).sort()).toEqual([0, 1]);

    host.emit('message', { data: envelope('terminal.input.ack', commits[0].payload) });
    const afterAck = host.posted.filter(
      (message) => (message as { type?: string }).type === 'terminal.input.commit',
    ) as Array<{ payload: { buffer: number } }>;
    expect(afterAck).toHaveLength(3);
    expect(afterAck[2].payload.buffer).toBe(commits[0].payload.buffer);
  });

  it('streams UTF-8 across output buffer boundaries and rejects hostile messages', () => {
    const buffer = new ArrayBuffer(LIMITS.maxTerminalChunkBytes);
    host.emit('sharedbufferreceived', {
      additionalData: envelope('terminal.buffer.attach', {
        direction: 'output',
        buffer: 0,
        generation: 3,
        capacity: LIMITS.maxTerminalChunkBytes,
      }),
      getBuffer: () => buffer,
    });
    const received: string[] = [];
    bridge.onOutput((text, commit) => {
      received.push(text);
      bridge.acknowledge(commit);
    });
    const encoded = new TextEncoder().encode('日');
    new Uint8Array(buffer, 0, 2).set(encoded.subarray(0, 2));
    host.emit('message', {
      data: envelope('terminal.output.ready', {
        buffer: 0,
        generation: 3,
        sequence: 1,
        length: 2,
      }),
    });
    new Uint8Array(buffer, 0, 1).set(encoded.subarray(2));
    host.emit('message', {
      data: envelope('terminal.output.ready', {
        buffer: 0,
        generation: 3,
        sequence: 2,
        length: 1,
      }),
    });
    host.emit('message', {
      data: { v: PROTOCOL_VERSION, type: 'app.notice', payload: { level: 'fatal' } },
    });
    expect(received.join('')).toBe('日');
    expect(
      host.posted.filter(
        (message) => (message as { type?: string }).type === 'terminal.output.ack',
      ),
    ).toHaveLength(2);
  });

  it('retains startup output until the terminal listener is mounted', () => {
    const buffer = new ArrayBuffer(LIMITS.maxTerminalChunkBytes);
    host.emit('sharedbufferreceived', {
      additionalData: envelope('terminal.buffer.attach', {
        direction: 'output',
        buffer: 0,
        generation: 11,
        capacity: LIMITS.maxTerminalChunkBytes,
      }),
      getBuffer: () => buffer,
    });
    const encoded = new TextEncoder().encode('startup');
    new Uint8Array(buffer, 0, encoded.length).set(encoded);
    const commit = { buffer: 0, generation: 11, sequence: 1, length: encoded.length };
    host.emit('message', { data: envelope('terminal.output.ready', commit) });
    expect(
      host.posted.some((message) => (message as { type?: string }).type === 'terminal.output.ack'),
    ).toBe(false);

    const received: string[] = [];
    bridge.onOutput((text, pending) => {
      received.push(text);
      bridge.acknowledge(pending);
    });
    expect(received).toEqual(['startup']);
    expect(
      host.posted.some((message) => (message as { type?: string }).type === 'terminal.output.ack'),
    ).toBe(true);
  });
});
