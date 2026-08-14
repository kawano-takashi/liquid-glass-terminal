interface WebViewMessageEvent extends Event {
  data: unknown;
}

declare module '*.css';

interface WebViewSharedBufferEvent extends Event {
  additionalData: unknown;
  getBuffer(): ArrayBuffer;
}

interface WebViewHost {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: WebViewMessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: WebViewMessageEvent) => void): void;
  addEventListener(
    type: 'sharedbufferreceived',
    listener: (event: WebViewSharedBufferEvent) => void,
  ): void;
  removeEventListener(
    type: 'sharedbufferreceived',
    listener: (event: WebViewSharedBufferEvent) => void,
  ): void;
}

interface Window {
  chrome: { webview: WebViewHost };
}
