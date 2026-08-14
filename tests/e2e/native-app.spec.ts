import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { access, mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const executable = path.join(
  root,
  'build',
  'package-e2e',
  'LiquidGlassTerminal',
  'LiquidGlassTerminal.exe',
);
const profile = path.join(root, 'build', 'e2e-data');

let app: ChildProcess | undefined;
let browser: Browser | undefined;
let page: Page;

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve an E2E port.');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function waitForEndpoint(port: number): Promise<void> {
  const endpoint = `http://127.0.0.1:${port}/json/version`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (app?.exitCode !== null) throw new Error(`Native application exited with ${app?.exitCode}.`);
    try {
      const response = await fetch(endpoint);
      if (response.ok) return;
    } catch {
      // WebView2 has not opened its loopback inspection endpoint yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${endpoint}.`);
}

test.beforeAll(async () => {
  await access(executable);
  await rm(profile, { recursive: true, force: true });
  await mkdir(profile, { recursive: true });
  const port = await availablePort();
  app = spawn(executable, [], {
    cwd: path.dirname(executable),
    env: {
      ...process.env,
      LGT_E2E_DATA_DIR: profile,
      LGT_E2E_REMOTE_DEBUGGING_PORT: String(port),
    },
    stdio: 'ignore',
  });
  await waitForEndpoint(port);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  if (!context) throw new Error('WebView2 did not expose a browser context.');
  page = context.pages()[0] ?? (await context.waitForEvent('page'));
  await page.waitForURL('https://app.liquid-glass-terminal.invalid/index.html');
  await expect(page.locator('.terminal-mount')).toBeVisible();
});

test.afterAll(async () => {
  if (app?.pid && app.exitCode === null) {
    spawnSync('taskkill.exe', ['/pid', String(app.pid), '/t', '/f'], { stdio: 'ignore' });
  }
  await browser?.close().catch(() => undefined);
  await expect
    .poll(
      async () => {
        try {
          await rm(profile, { recursive: true, force: true });
          return true;
        } catch {
          return false;
        }
      },
      { timeout: 10_000 },
    )
    .toBe(true);
});

test.describe.serial('native WebView2 application', () => {
  test('exposes only the WebView bridge and blocks remote content', async () => {
    await expect(page.locator('.app')).toBeVisible();
    const surface = await page.evaluate(() => ({
      node: typeof (globalThis as { process?: unknown }).process,
      require: typeof (globalThis as { require?: unknown }).require,
      webview: typeof window.chrome.webview,
    }));
    expect(surface).toEqual({ node: 'undefined', require: 'undefined', webview: 'object' });
    await expect
      .poll(() =>
        page.evaluate(() =>
          fetch('https://example.com').then(
            () => false,
            () => true,
          ),
        ),
      )
      .toBe(true);

    const rejected = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const listener = (event: WebViewMessageEvent) => {
            const message = event.data as { type?: string; payload?: { message?: string } };
            if (message.type !== 'app.notice') return;
            window.chrome.webview.removeEventListener('message', listener);
            resolve(message.payload?.message ?? '');
          };
          window.chrome.webview.addEventListener('message', listener);
          window.chrome.webview.postMessage({
            v: 1,
            type: 'terminal.resize',
            payload: { cols: 1, rows: 24 },
          });
        }),
    );
    expect(rejected).toBe('bridge.invalid-message');
    await expect(page.locator('.terminal-mount')).toBeVisible();
  });

  test('carries terminal input and output through the native ConPTY bridge', async () => {
    await page.locator('.terminal-mount').click();
    await page.keyboard.type("Write-Output ([string]::Concat('__LGT_', 'E2E_OK__'))");
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listitem').filter({ hasText: '__LGT_E2E_OK__' })).toHaveCount(1, {
      timeout: 15_000,
    });
  });

  test('previews, cancels, and atomically applies native settings', async () => {
    const appSurface = page.locator('.app');
    const initialAppearance = await appSurface.getAttribute('data-appearance');
    await page.locator('.settings-trigger').click();
    const drawer = page.locator('.settings-drawer');
    await expect(drawer).toHaveAttribute('data-open', 'true');

    const glassToggle = drawer.locator('input[type="checkbox"]').first();
    if (await glassToggle.isChecked()) {
      await glassToggle.uncheck();
      await expect(appSurface).toHaveAttribute('data-appearance', 'solid');
    }
    await drawer.locator('footer .button.ghost').click();
    await expect(drawer).toHaveAttribute('data-open', 'false');
    if (initialAppearance)
      await expect(appSurface).toHaveAttribute('data-appearance', initialAppearance);

    await page.locator('.settings-trigger').click();
    await drawer.getByRole('button', { name: 'Dense' }).click();
    await drawer.locator('footer .button.primary').click();
    await expect(drawer).toHaveAttribute('data-open', 'false');
    await page.locator('.settings-trigger').click();
    await expect(drawer.getByRole('button', { name: 'Dense' })).toHaveAttribute(
      'data-active',
      'true',
    );
    await drawer.locator('footer .button.ghost').click();
  });

  test('round-trips and restores clipboard text when explicitly enabled', async () => {
    test.skip(process.env.LGT_CLIPBOARD_E2E !== '1', 'LGT_CLIPBOARD_E2E is not enabled.');
    const clipboard = async (operation: 'read' | 'write', text = '') =>
      page.evaluate(
        ({ operation, text }) =>
          new Promise<{ ok: boolean; text?: string }>((resolve) => {
            const requestId = `clipboard-${Date.now().toString(36)}-${Math.random()
              .toString(36)
              .slice(2, 8)}`;
            const listener = (event: WebViewMessageEvent) => {
              const message = event.data as {
                type?: string;
                payload?: { requestId?: string; ok?: boolean; text?: string };
              };
              if (message.type !== 'clipboard.result' || message.payload?.requestId !== requestId)
                return;
              window.chrome.webview.removeEventListener('message', listener);
              resolve({ ok: message.payload.ok === true, text: message.payload.text });
            };
            window.chrome.webview.addEventListener('message', listener);
            window.chrome.webview.postMessage({
              v: 1,
              type: operation === 'read' ? 'clipboard.read' : 'clipboard.write',
              payload: operation === 'read' ? { requestId } : { requestId, text },
            });
          }),
        { operation, text },
      );

    const original = await clipboard('read');
    expect(original.ok).toBe(true);
    const probe = `Liquid Glass Terminal clipboard ${Date.now()}`;
    try {
      expect((await clipboard('write', probe)).ok).toBe(true);
      expect(await clipboard('read')).toEqual({ ok: true, text: probe });
    } finally {
      await clipboard('write', original.text ?? '');
    }
  });

  test('cancels external top-level navigation', async () => {
    await page.evaluate(() => window.location.assign('https://example.com/'));
    await page.waitForTimeout(300);
    expect(page.url()).toBe('https://app.liquid-glass-terminal.invalid/index.html');
  });
});
