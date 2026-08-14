import {
  LIMITS,
  PROTOCOL_VERSION,
  type BufferCommit,
  type GlassRegion,
  isNativeToWebMessage,
  type NativeToWebMessage,
  type SettingsPatch,
  type WebToNativeMessage,
} from '../../../contracts/generated/protocol';

type MessageListener = (message: NativeToWebMessage) => void;
type OutputListener = (text: string, commit: BufferCommit) => void;

interface AttachedBuffer {
  buffer: ArrayBuffer;
  generation: number;
  capacity: number;
}

export class NativeBridge {
  readonly #input = new Map<number, AttachedBuffer>();
  readonly #output = new Map<number, AttachedBuffer>();
  readonly #messageListeners = new Set<MessageListener>();
  readonly #outputListeners = new Set<OutputListener>();
  readonly #encoder = new TextEncoder();
  readonly #pendingInput: Uint8Array[] = [];
  readonly #pendingOutput: Array<{ text: string; commit: BufferCommit }> = [];
  readonly #inputInFlight = new Map<number, BufferCommit>();
  #decoder = new TextDecoder('utf-8');
  #inputGeneration = 0;
  #outputGeneration = 0;
  #inputSequence = 1;
  #connected = false;

  connect(): void {
    if (this.#connected) return;
    window.chrome.webview.addEventListener('message', this.#onMessage);
    window.chrome.webview.addEventListener('sharedbufferreceived', this.#onSharedBuffer);
    this.#connected = true;
  }

  dispose(): void {
    if (!this.#connected) return;
    window.chrome.webview.removeEventListener('message', this.#onMessage);
    window.chrome.webview.removeEventListener('sharedbufferreceived', this.#onSharedBuffer);
    this.#connected = false;
    this.#messageListeners.clear();
    this.#outputListeners.clear();
    this.#input.clear();
    this.#output.clear();
    this.#inputInFlight.clear();
    this.#pendingInput.length = 0;
    this.#pendingOutput.length = 0;
    this.#decoder = new TextDecoder('utf-8');
    this.#inputGeneration = 0;
    this.#outputGeneration = 0;
  }

  onMessage(listener: MessageListener): () => void {
    this.#messageListeners.add(listener);
    return () => this.#messageListeners.delete(listener);
  }

  onOutput(listener: OutputListener): () => void {
    this.#outputListeners.add(listener);
    for (const pending of this.#pendingOutput.splice(0)) {
      listener(pending.text, pending.commit);
    }
    return () => this.#outputListeners.delete(listener);
  }

  ready(): void {
    this.post('bridge.ready', { locale: navigator.language.slice(0, 32), devicePixelRatio });
  }

  resize(cols: number, rows: number): void {
    this.post('terminal.resize', { cols, rows });
  }

  sendInput(text: string): void {
    const encoded = this.#encoder.encode(text);
    for (let offset = 0; offset < encoded.byteLength; offset += LIMITS.maxTerminalChunkBytes) {
      this.#pendingInput.push(encoded.slice(offset, offset + LIMITS.maxTerminalChunkBytes));
    }
    this.#flushInput();
  }

  acknowledge(commit: BufferCommit): void {
    this.post('terminal.output.ack', commit);
  }

  setGlassLayout(revision: number, regions: GlassRegion[]): void {
    this.post('glass.layout.set', { revision, regions });
  }

  previewSettings(transactionId: string, patch: SettingsPatch): void {
    this.post('settings.preview', { transactionId, patch });
  }

  applySettings(transactionId: string, patch: SettingsPatch): void {
    this.post('settings.apply', { transactionId, patch });
  }

  cancelSettings(transactionId: string): void {
    this.post('settings.cancel', { transactionId });
  }

  readClipboard(requestId: string): void {
    this.post('clipboard.read', { requestId });
  }

  writeClipboard(requestId: string, text: string): void {
    this.post('clipboard.write', { requestId, text });
  }

  private post<T extends WebToNativeMessage['type']>(
    type: T,
    payload: Extract<WebToNativeMessage, { type: T }>['payload'],
  ): void {
    window.chrome.webview.postMessage({ v: PROTOCOL_VERSION, type, payload });
  }

  #flushInput(): void {
    for (const [index, target] of [...this.#input.entries()].sort(
      ([left], [right]) => left - right,
    )) {
      if (this.#inputInFlight.has(index)) continue;
      const chunk = this.#pendingInput.shift();
      if (!chunk) return;
      if (chunk.byteLength > target.capacity) continue;
      new Uint8Array(target.buffer, 0, chunk.byteLength).set(chunk);
      const commit: BufferCommit = {
        buffer: index,
        generation: target.generation,
        sequence: this.#inputSequence++,
        length: chunk.byteLength,
      };
      this.#inputInFlight.set(index, commit);
      this.post('terminal.input.commit', commit);
    }
  }

  readonly #onMessage = (event: WebViewMessageEvent): void => {
    if (!isNativeToWebMessage(event.data)) return;
    const message = event.data;
    if (message.type === 'terminal.input.ack') {
      const expected = this.#inputInFlight.get(message.payload.buffer);
      if (
        expected?.generation === message.payload.generation &&
        expected.sequence === message.payload.sequence &&
        expected.length === message.payload.length
      ) {
        this.#inputInFlight.delete(message.payload.buffer);
        this.#flushInput();
      }
      return;
    }
    if (message.type === 'terminal.output.ready') {
      const commit = message.payload;
      const source = this.#output.get(commit.buffer);
      if (
        !source ||
        source.generation !== commit.generation ||
        commit.length < 0 ||
        commit.length > source.capacity
      ) {
        return;
      }
      const text = this.#decoder.decode(new Uint8Array(source.buffer, 0, commit.length), {
        stream: true,
      });
      if (this.#outputListeners.size === 0) this.#pendingOutput.push({ text, commit });
      else for (const listener of this.#outputListeners) listener(text, commit);
      return;
    }
    if (message.type === 'terminal.recovered') {
      this.#pendingOutput.length = 0;
      this.#decoder = new TextDecoder('utf-8');
    }
    for (const listener of this.#messageListeners) listener(message);
  };

  readonly #onSharedBuffer = (event: WebViewSharedBufferEvent): void => {
    if (
      !isNativeToWebMessage(event.additionalData) ||
      event.additionalData.type !== 'terminal.buffer.attach'
    ) {
      return;
    }
    const metadata = event.additionalData.payload;
    if (metadata.direction === 'output' && metadata.generation !== this.#outputGeneration) {
      this.#outputGeneration = metadata.generation;
      this.#output.clear();
      this.#pendingOutput.length = 0;
      this.#decoder = new TextDecoder('utf-8');
    } else if (metadata.direction === 'input' && metadata.generation !== this.#inputGeneration) {
      this.#inputGeneration = metadata.generation;
      this.#input.clear();
      this.#inputInFlight.clear();
    }
    const target = metadata.direction === 'input' ? this.#input : this.#output;
    target.set(metadata.buffer, {
      buffer: event.getBuffer(),
      generation: metadata.generation,
      capacity: metadata.capacity,
    });
    if (metadata.direction === 'input') {
      this.#inputInFlight.delete(metadata.buffer);
      this.#flushInput();
    }
  };
}
