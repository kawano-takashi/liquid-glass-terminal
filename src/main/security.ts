import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { protocol, session, type BrowserWindow } from 'electron';
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
};

export function registerPrivilegedScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
      },
    },
  ]);
}

export function registerAppProtocol(rendererRoot: string): void {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'bundle') return new Response('Not found', { status: 404 });
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const resolved = path.resolve(rendererRoot, `.${relative}`);
    const safeRoot = `${path.resolve(rendererRoot)}${path.sep}`;
    if (resolved !== path.join(rendererRoot, 'index.html') && !resolved.startsWith(safeRoot)) {
      return new Response('Forbidden', { status: 403 });
    }
    try {
      const body = await readFile(resolved);
      return new Response(body, {
        headers: {
          'Content-Type':
            CONTENT_TYPES[path.extname(resolved).toLowerCase()] ?? 'application/octet-stream',
          'Cache-Control': 'no-store',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

export function hardenSession(developmentOrigin?: string): void {
  const current = session.defaultSession;
  const developmentOrigins = new Set<string>();
  if (developmentOrigin) {
    const parsed = new URL(developmentOrigin);
    developmentOrigins.add(parsed.origin);
    developmentOrigins.add(`${parsed.protocol === 'https:' ? 'wss:' : 'ws:'}//${parsed.host}`);
  }
  current.setPermissionCheckHandler(() => false);
  current.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  current.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url;
    const allowed =
      url.startsWith('app://bundle/') ||
      [...developmentOrigins].some((origin) => url.startsWith(origin));
    callback({ cancel: !allowed });
  });
}

export function hardenWindow(window: BrowserWindow, developmentOrigin?: string): void {
  const trusted = (target: string) => {
    try {
      const url = new URL(target);
      if (url.protocol === 'app:' && url.hostname === 'bundle') return true;
      return developmentOrigin !== undefined && url.origin === new URL(developmentOrigin).origin;
    } catch {
      return false;
    }
  };
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, target) => {
    if (!trusted(target)) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
}
