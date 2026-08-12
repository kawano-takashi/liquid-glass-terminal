import type {
  SessionCreateRequest,
  SessionPortPayload,
  ShellProfileDescriptor,
} from '../../shared/contracts';

export interface TerminalSession {
  sessionId: string;
  profile: ShellProfileDescriptor;
  port: MessagePort;
}

export function requestTerminalSession(
  request: Omit<SessionCreateRequest, 'requestId'>,
): Promise<TerminalSession> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', listener);
      reject(new Error('sessionTimeout'));
    }, 15_000);

    const listener = (event: MessageEvent<SessionPortPayload>) => {
      const payload = event.data;
      if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        payload?.source !== 'liquid-glass-preload' ||
        payload.requestId !== requestId
      ) {
        return;
      }
      window.clearTimeout(timeout);
      window.removeEventListener('message', listener);
      if (payload.error || !payload.sessionId || !payload.profile || event.ports.length !== 1) {
        reject(new Error(payload.error ?? 'sessionFailed'));
        return;
      }
      resolve({ sessionId: payload.sessionId, profile: payload.profile, port: event.ports[0] });
    };

    window.addEventListener('message', listener);
    window.liquidGlass.requestSession({ ...request, requestId });
  });
}
