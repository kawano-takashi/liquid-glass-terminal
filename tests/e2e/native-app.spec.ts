import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { access, mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { PROTOCOL_VERSION } from '../../contracts/generated/protocol';

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
let backdrop: ChildProcess | undefined;
let browser: Browser | undefined;
let page: Page;

interface PixelProbe {
  visible: number[];
  hidden: number[];
}

interface StartOptions {
  resetProfile?: boolean;
  forceCompositionFailure?: boolean;
}

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

async function stopApplication(): Promise<void> {
  if (app?.pid && app.exitCode === null) {
    spawnSync('taskkill.exe', ['/pid', String(app.pid), '/t', '/f'], { stdio: 'ignore' });
  }
  await browser?.close().catch(() => undefined);
  browser = undefined;
  app = undefined;
}

async function startBackdrop(): Promise<void> {
  const script = `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Liquid Glass Terminal E2E Backdrop'
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.WindowState = [System.Windows.Forms.FormWindowState]::Maximized
$form.TopMost = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(31, 93, 157)
[System.Windows.Forms.Application]::Run($form)
`;
  const backdropProcess = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Sta', '-Command', script],
    { stdio: 'ignore', windowsHide: true },
  );
  backdrop = backdropProcess;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (backdropProcess.exitCode !== null)
      throw new Error(`Backdrop exited with ${backdropProcess.exitCode}.`);
    const handle = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-Process -Id ${backdropProcess.pid}).MainWindowHandle.ToInt64()`,
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    if (handle.status === 0 && Number.parseInt(handle.stdout.trim(), 10) !== 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for the E2E backdrop window.');
}

function stopBackdrop(): void {
  if (backdrop?.pid && backdrop.exitCode === null) {
    spawnSync('taskkill.exe', ['/pid', String(backdrop.pid), '/t', '/f'], { stdio: 'ignore' });
  }
  backdrop = undefined;
}

function makeApplicationTopmost(): void {
  if (!app?.pid) throw new Error('Native application is not running.');
  const script = `
Add-Type -Namespace LgtE2E -Name WindowOrder -MemberDefinition '[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool SetWindowPos(System.IntPtr hWnd, System.IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);'
$target = Get-Process -Id ${app.pid}
if ($target.MainWindowHandle -eq 0) { exit 2 }
[LgtE2E.WindowOrder]::SetWindowPos($target.MainWindowHandle, [System.IntPtr](-1), 0, 0, 0, 0, 0x53) | Out-Null
`;
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(`Could not raise the application above the E2E backdrop: ${result.stderr}`);
  }
}

function probeWindowPixels(): PixelProbe {
  if (!app?.pid) throw new Error('Native application is not running.');
  const script = `
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class LgtPixelProbe { [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; } [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect); [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command); [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hWnd); [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr dc); [DllImport("gdi32.dll")] public static extern uint GetPixel(IntPtr dc, int x, int y); [DllImport("dwmapi.dll")] public static extern int DwmFlush(); }'
function Read-Pixels($points) {
  $dc = [LgtPixelProbe]::GetDC([IntPtr]::Zero)
  try { return @($points | ForEach-Object { [uint32][LgtPixelProbe]::GetPixel($dc, $_[0], $_[1]) }) }
  finally { [LgtPixelProbe]::ReleaseDC([IntPtr]::Zero, $dc) | Out-Null }
}
$target = Get-Process -Id ${app.pid}
$handle = $target.MainWindowHandle
if ($handle -eq 0) { exit 2 }
$rect = New-Object LgtPixelProbe+RECT
if (-not [LgtPixelProbe]::GetWindowRect($handle, [ref]$rect)) { exit 3 }
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
$points = @(
  @([int]($rect.Left + $width * 0.22), [int]($rect.Top + $height * 0.48)),
  @([int]($rect.Left + $width * 0.45), [int]($rect.Top + $height * 0.72)),
  @([int]($rect.Left + $width * 0.24), [int]($rect.Top + $height * 0.84))
)
[LgtPixelProbe]::SetWindowPos($handle, [IntPtr](-1), 0, 0, 0, 0, 0x53) | Out-Null
[LgtPixelProbe]::DwmFlush() | Out-Null
Start-Sleep -Milliseconds 120
$visible = Read-Pixels $points
[LgtPixelProbe]::ShowWindow($handle, 0) | Out-Null
[LgtPixelProbe]::DwmFlush() | Out-Null
Start-Sleep -Milliseconds 120
$hidden = Read-Pixels $points
[LgtPixelProbe]::ShowWindow($handle, 8) | Out-Null
[LgtPixelProbe]::SetWindowPos($handle, [IntPtr](-1), 0, 0, 0, 0, 0x53) | Out-Null
[LgtPixelProbe]::DwmFlush() | Out-Null
[pscustomobject]@{ visible = $visible; hidden = $hidden } | ConvertTo-Json -Compress
`;
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(`Could not probe the composed window: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout.trim()) as PixelProbe;
}

async function startApplication(options: StartOptions = {}): Promise<void> {
  if (options.resetProfile) await rm(profile, { recursive: true, force: true });
  await mkdir(profile, { recursive: true });
  const port = await availablePort();
  app = spawn(executable, [], {
    cwd: path.dirname(executable),
    env: {
      ...process.env,
      LGT_E2E_DATA_DIR: profile,
      LGT_E2E_REMOTE_DEBUGGING_PORT: String(port),
      ...(options.forceCompositionFailure ? { LGT_E2E_FORCE_COMPOSITION_FAILURE: '1' } : {}),
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
  makeApplicationTopmost();
}

function sendVirtualKey(key: number): void {
  if (!app?.pid) throw new Error('Native application is not running.');
  const script = `
Add-Type -Namespace LgtE2E -Name NativeMethods -MemberDefinition '[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool PostMessage(System.IntPtr hWnd, uint message, System.UIntPtr wParam, System.IntPtr lParam);'
$target = Get-Process -Id ${app.pid}
if ($target.MainWindowHandle -eq 0) { exit 2 }
[LgtE2E.NativeMethods]::PostMessage($target.MainWindowHandle, 0x0100, [System.UIntPtr]::new(${key}), [System.IntPtr]::Zero) | Out-Null
Start-Sleep -Milliseconds 40
[LgtE2E.NativeMethods]::PostMessage($target.MainWindowHandle, 0x0101, [System.UIntPtr]::new(${key}), [System.IntPtr]::Zero) | Out-Null
`;
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(`Could not send virtual key ${key}: ${result.stderr || result.stdout}`);
  }
}

test.beforeAll(async () => {
  await access(executable);
  await startBackdrop();
  await startApplication({ resetProfile: true });
});

test.afterAll(async () => {
  try {
    await stopApplication();
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
  } finally {
    stopBackdrop();
  }
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
      (version) =>
        new Promise<string>((resolve) => {
          const listener = (event: WebViewMessageEvent) => {
            const message = event.data as { type?: string; payload?: { message?: string } };
            if (message.type !== 'app.notice') return;
            window.chrome.webview.removeEventListener('message', listener);
            resolve(message.payload?.message ?? '');
          };
          window.chrome.webview.addEventListener('message', listener);
          window.chrome.webview.postMessage({
            v: version,
            type: 'terminal.resize',
            payload: { cols: 1, rows: 24 },
          });
        }),
      PROTOCOL_VERSION,
    );
    expect(rejected).toBe('bridge.invalid-message');

    const rejectedV1 = await page.evaluate(
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
            payload: { cols: 80, rows: 24 },
          });
        }),
    );
    expect(rejectedV1).toBe('bridge.invalid-message');
    await expect(page.locator('.terminal-mount')).toBeVisible();
  });

  test('rolls back an invalid native Apply transaction', async () => {
    const invalidApply = await page.evaluate(
      (version) =>
        new Promise<{ operation?: string; ok?: boolean; error?: string }>((resolve) => {
          const transactionId = `invalid-apply-${Date.now().toString(36)}`;
          let snapshotReceived = false;
          let previewAccepted = false;
          let applySent = false;
          const maybeApply = () => {
            if (!snapshotReceived || !previewAccepted || applySent) return;
            applySent = true;
            window.chrome.webview.postMessage({
              v: version,
              type: 'settings.apply',
              payload: { transactionId, patch: { glass: { opacity: 33 } } },
            });
          };
          const listener = (event: WebViewMessageEvent) => {
            const message = event.data as {
              type?: string;
              payload?: {
                transactionId?: string;
                operation?: string;
                ok?: boolean;
                error?: string;
              };
            };
            if (message.payload?.transactionId !== transactionId) return;
            if (message.type === 'settings.snapshot') {
              snapshotReceived = true;
              maybeApply();
            } else if (
              message.type === 'settings.result' &&
              message.payload.operation === 'preview'
            ) {
              previewAccepted = message.payload.ok === true;
              maybeApply();
            } else if (
              message.type === 'settings.result' &&
              message.payload.operation === 'apply'
            ) {
              window.chrome.webview.removeEventListener('message', listener);
              resolve(message.payload);
            }
          };
          window.chrome.webview.addEventListener('message', listener);
          window.chrome.webview.postMessage({
            v: version,
            type: 'settings.preview',
            payload: { transactionId, patch: { glass: { opacity: 35 } } },
          });
        }),
      PROTOCOL_VERSION,
    );
    expect(invalidApply).toMatchObject({
      operation: 'apply',
      ok: false,
      error: 'settings.patch.invalid',
    });

    const nextTransaction = await page.evaluate(
      (version) =>
        new Promise<{ operation?: string; ok?: boolean }>((resolve) => {
          const transactionId = `after-invalid-${Date.now().toString(36)}`;
          let cancelSent = false;
          const listener = (event: WebViewMessageEvent) => {
            const message = event.data as {
              type?: string;
              payload?: { transactionId?: string; operation?: string; ok?: boolean };
            };
            if (
              message.type !== 'settings.result' ||
              message.payload?.transactionId !== transactionId
            )
              return;
            if (message.payload.operation === 'preview' && message.payload.ok && !cancelSent) {
              cancelSent = true;
              window.chrome.webview.postMessage({
                v: version,
                type: 'settings.cancel',
                payload: { transactionId },
              });
            } else if (message.payload.operation === 'cancel') {
              window.chrome.webview.removeEventListener('message', listener);
              resolve(message.payload);
            }
          };
          window.chrome.webview.addEventListener('message', listener);
          window.chrome.webview.postMessage({
            v: version,
            type: 'settings.preview',
            payload: { transactionId, patch: { glass: { opacity: 35 } } },
          });
        }),
      PROTOCOL_VERSION,
    );
    expect(nextTransaction).toMatchObject({ operation: 'cancel', ok: true });
  });

  test('renders zero-opacity Glass as true native transparency and persists it', async () => {
    const appSurface = page.locator('.app');
    test.skip(
      (await appSurface.getAttribute('data-appearance')) !== 'glass',
      'Requires Glass to be allowed by the local Windows policy.',
    );

    await page.locator('.settings-trigger').click();
    const drawer = page.locator('.settings-drawer');
    const opacity = drawer
      .locator('.settings-section')
      .first()
      .locator('input[type="range"]')
      .nth(1);
    await opacity.fill('0');

    await expect(appSurface).toHaveAttribute('data-appearance', 'glass');
    await expect(appSurface).toHaveCSS('--glass-opacity', '0');
    const decoration = await page.evaluate(() => {
      const passive = document.querySelector<HTMLElement>('.segmented');
      const active = document.querySelector<HTMLElement>('.segment-status[data-active="true"]');
      const panel = document.querySelector<HTMLElement>('.settings-drawer-panel');
      if (!passive || !active || !panel) throw new Error('Settings decorations are missing.');
      return {
        passiveBackground: getComputedStyle(passive).backgroundColor,
        activeBackground: getComputedStyle(active).backgroundColor,
        panelShadow: getComputedStyle(panel).boxShadow,
      };
    });
    expect(decoration.passiveBackground).toBe('rgba(0, 0, 0, 0)');
    expect(decoration.activeBackground).not.toBe('rgba(0, 0, 0, 0)');
    expect(decoration.panelShadow).toContain('rgba(0, 0, 0, 0)');

    await page.waitForTimeout(250);
    const firstZeroProbe = probeWindowPixels();
    expect(firstZeroProbe.visible).toEqual(firstZeroProbe.hidden);

    await opacity.fill('5');
    await expect(appSurface).toHaveCSS('--glass-opacity', '0.05');
    await page.waitForTimeout(250);
    const nonzeroProbe = probeWindowPixels();
    expect(nonzeroProbe.visible.some((pixel, index) => pixel !== nonzeroProbe.hidden[index])).toBe(
      true,
    );

    await opacity.fill('0');
    await expect(appSurface).toHaveCSS('--glass-opacity', '0');
    await page.waitForTimeout(250);
    const secondZeroProbe = probeWindowPixels();
    expect(secondZeroProbe.visible).toEqual(secondZeroProbe.hidden);

    await drawer.locator('footer .button.primary').click();
    await expect(drawer).toHaveAttribute('data-open', 'false');

    await stopApplication();
    await startApplication();
    const restartedSurface = page.locator('.app');
    await expect(restartedSurface).toHaveAttribute('data-appearance', 'glass');
    await expect(restartedSurface).toHaveCSS('--glass-opacity', '0');
    await page.waitForTimeout(250);
    const restartedProbe = probeWindowPixels();
    expect(restartedProbe.visible).toEqual(restartedProbe.hidden);

    await page.locator('.settings-trigger').click();
    const restartedDrawer = page.locator('.settings-drawer');
    const restartedOpacity = restartedDrawer
      .locator('.settings-section')
      .first()
      .locator('input[type="range"]')
      .nth(1);
    await expect(restartedOpacity).toHaveValue('0');
    await restartedOpacity.fill('35');
    await restartedDrawer.locator('footer .button.primary').click();
    await expect(restartedDrawer).toHaveAttribute('data-open', 'false');
    await expect(restartedSurface).toHaveCSS('--glass-opacity', '0.35');
  });

  test('carries terminal input and output through the native ConPTY bridge', async () => {
    await page.locator('.terminal-mount').click();
    await page.keyboard.type("Write-Output ([string]::Concat('__LGT_', 'E2E_OK__'))");
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listitem').filter({ hasText: '__LGT_E2E_OK__' })).toHaveCount(1, {
      timeout: 15_000,
    });
  });

  test('previews, cancels, atomically applies, and reloads native settings', async () => {
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
    const glassRanges = drawer.locator('.settings-section').first().locator('input[type="range"]');
    await expect(glassRanges.nth(0)).toHaveValue('12');
    await expect(glassRanges.nth(1)).toHaveValue('50');
    await expect(glassRanges.nth(2)).toHaveValue('92');
    await expect(glassRanges.nth(3)).toHaveValue('0');
    await glassRanges.nth(1).fill('45');
    await expect(drawer.locator('.segment-status')).toHaveAttribute('data-active', 'true');
    await drawer.locator('footer .button.ghost').click();

    await page.locator('.settings-trigger').click();
    await expect(drawer.getByRole('button', { name: 'Dense' })).toHaveAttribute(
      'data-active',
      'true',
    );
    await drawer.locator('footer .button.ghost').click();

    await expect(page.getByRole('listitem').filter({ hasText: '__LGT_E2E_OK__' })).toHaveCount(1);

    await stopApplication();
    await startApplication();
    const restartedDrawer = page.locator('.settings-drawer');
    await page.locator('.settings-trigger').click();
    await expect(restartedDrawer.getByRole('button', { name: 'Dense' })).toHaveAttribute(
      'data-active',
      'true',
    );
    const restartedRanges = restartedDrawer
      .locator('.settings-section')
      .first()
      .locator('input[type="range"]');
    await expect(restartedRanges.nth(0)).toHaveValue('12');
    await expect(restartedRanges.nth(1)).toHaveValue('50');
    await expect(restartedRanges.nth(2)).toHaveValue('92');
    await expect(restartedRanges.nth(3)).toHaveValue('0');
    await restartedDrawer.locator('footer .button.ghost').click();
  });

  test('hides and restores all custom Chrome with F11', async () => {
    await expect(page.locator('.window-chrome')).toBeVisible();
    sendVirtualKey(0x7a);
    await expect(page.locator('.app')).toHaveAttribute('data-fullscreen', 'true');
    await expect(page.locator('.window-chrome')).toHaveCount(0);
    await expect(page.locator('.terminal-surface')).toBeVisible();

    sendVirtualKey(0x7a);
    await expect(page.locator('.app')).toHaveAttribute('data-fullscreen', 'false');
    await expect(page.locator('.window-chrome')).toBeVisible();
  });

  test('round-trips and restores clipboard text when explicitly enabled', async () => {
    test.skip(process.env.LGT_CLIPBOARD_E2E !== '1', 'LGT_CLIPBOARD_E2E is not enabled.');
    const clipboard = async (operation: 'read' | 'write', text = '') =>
      page.evaluate(
        ({ operation, text, version }) =>
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
              v: version,
              type: operation === 'read' ? 'clipboard.read' : 'clipboard.write',
              payload: operation === 'read' ? { requestId } : { requestId, text },
            });
          }),
        { operation, text, version: PROTOCOL_VERSION },
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

  test('uses a working standard-frame Safe fallback', async () => {
    await stopApplication();
    await startApplication({ forceCompositionFailure: true });
    await expect(page.locator('.app')).toHaveAttribute('data-appearance', 'safe');
    await expect(page.locator('.app')).toHaveAttribute('data-composition', 'false');
    await expect(page.getByRole('status')).toContainText('Safe');

    await page.locator('.terminal-mount').click();
    await page.keyboard.type("Write-Output ([string]::Concat('__LGT_', 'SAFE_OK__'))");
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listitem').filter({ hasText: '__LGT_SAFE_OK__' })).toHaveCount(1, {
      timeout: 15_000,
    });
  });
});
