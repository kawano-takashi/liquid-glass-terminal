import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { findPackagedExecutable } from '../../scripts/packaged-executable.mjs';

type LaunchedApplication = Awaited<ReturnType<typeof electron.launch>>;

async function removeTemporaryUserData(userData: string): Promise<void> {
  const tempRoot = path.resolve(os.tmpdir());
  const resolved = path.resolve(userData);
  if (!resolved.startsWith(`${tempRoot}${path.sep}`)) {
    throw new Error(`Refusing to remove a non-temporary user data path: ${resolved}`);
  }
  await rm(resolved, { recursive: true, force: true });
}

async function readClipboard(application: LaunchedApplication): Promise<string> {
  return application.evaluate(({ clipboard }) => clipboard.readText());
}

async function writeClipboard(application: LaunchedApplication, text: string): Promise<void> {
  await application.evaluate(({ clipboard }, value) => clipboard.writeText(value), text);
}

async function clickApplicationMenu(
  application: LaunchedApplication,
  itemId: string,
): Promise<void> {
  await application.evaluate(({ BrowserWindow, Menu }, id) => {
    const window = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed());
    const menuItem = Menu.getApplicationMenu()?.getMenuItemById(id);
    if (!window || !menuItem) throw new Error(`Application menu item not found: ${id}`);
    const click = menuItem.click as (
      event: object,
      focusedWindow: Electron.BrowserWindow,
      focusedWebContents: Electron.WebContents,
    ) => void;
    click({}, window, window.webContents);
  }, itemId);
}

async function waitForRendererTurn(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function enableScreenReaderMode(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Settings|設定/ }).click();
  const settingsDialog = page.getByRole('dialog', { name: /Settings|設定/ });
  const screenReader = page.getByRole('checkbox', {
    name: /Screen reader mode|スクリーンリーダーモード/,
  });
  await screenReader.check();
  await expect(page.locator('.xterm-accessibility-tree')).toBeVisible();
  await settingsDialog.getByRole('button', { name: /Close|閉じる/ }).click();
  await expect(settingsDialog).not.toBeVisible();
}

test('launches one terminal and opens settings', async () => {
  const executablePath = await findPackagedExecutable(path.resolve('out'));
  const userData = await mkdtemp(path.join(os.tmpdir(), 'liquid-glass-terminal-e2e-'));
  const application = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${userData}`, '--cwd', process.cwd()],
  });
  let electronStderr = '';
  application.process().stderr?.on('data', (chunk: Buffer) => {
    electronStderr = `${electronStderr}${String(chunk)}`.slice(-32_768);
  });
  try {
    const page = await application.firstWindow();
    await expect(page.locator('.app-shell')).toBeVisible();
    const invalidClipboardWrite = await page.evaluate(async () => {
      if (typeof window.liquidGlass.writeClipboardText !== 'function') return 'missing';
      const writeClipboardText = window.liquidGlass.writeClipboardText as (
        value: unknown,
      ) => Promise<void>;
      try {
        await writeClipboardText(42);
        return 'accepted';
      } catch {
        return 'rejected';
      }
    });
    expect(invalidClipboardWrite).toBe('rejected');
    await expect(page.getByRole('tab')).toHaveCount(1);
    const terminalPane = page.locator('.terminal-pane[data-active="true"]');
    await expect(terminalPane).toHaveAttribute('data-session-ready', 'true');

    const terminalInput = page.locator('.xterm-helper-textarea');
    await terminalInput.focus();
    await terminalInput.evaluate((element) => {
      element.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          data: 'echo LGT_E2E_READY\r',
          inputType: 'insertText',
        }),
      );
    });
    await expect(terminalPane).toHaveAttribute('data-has-output', 'true');

    await page.getByRole('button', { name: /Settings|設定/ }).click();
    const settingsDialog = page.getByRole('dialog', { name: /Settings|設定/ });
    await expect(settingsDialog).toBeVisible();
    const backgroundOpacity = page.getByRole('slider', {
      name: /Background opacity|背景の不透明度/,
    });
    await expect(backgroundOpacity).toHaveValue('25');
    const overlayStyles = await page.evaluate(() => {
      const drawerBackdrop = document.querySelector('.drawer-backdrop');
      const settingsDrawer = document.querySelector('.settings-drawer');
      if (!drawerBackdrop || !settingsDrawer) throw new Error('Background overlays not found');
      const backdrop = getComputedStyle(drawerBackdrop);
      const drawer = getComputedStyle(settingsDrawer);
      return {
        backdrop: backdrop.backgroundColor,
        drawerBorder: drawer.borderTopWidth,
        drawerShadow: drawer.boxShadow,
      };
    });
    expect(overlayStyles).toEqual({
      backdrop: 'rgba(0, 0, 0, 0)',
      drawerBorder: '0px',
      drawerShadow: 'none',
    });
    const screenReader = page.getByRole('checkbox', {
      name: /Screen reader mode|スクリーンリーダーモード/,
    });
    await screenReader.check();
    await expect(screenReader).toBeChecked();
    await expect(backgroundOpacity).toBeDisabled();
    await expect(settingsDialog).toContainText(/accessibility preference|アクセシビリティ設定/);
    const accessibilityTree = page.locator('.xterm-accessibility-tree');
    await expect(accessibilityTree).toBeVisible();
    await expect(accessibilityTree).toContainText('LGT_E2E_READY');
    await screenReader.uncheck();
    await expect(screenReader).not.toBeChecked();
    await page.screenshot({ path: 'test-results/liquid-glass-terminal.png' });
  } catch (error: unknown) {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    throw new Error(`${detail}\nPackaged Electron stderr:\n${electronStderr || '(empty)'}`);
  } finally {
    await application.close();
    await removeTemporaryUserData(userData);
  }
});

test('migrates, previews, and persists Windows background opacity', async () => {
  const executablePath = await findPackagedExecutable(path.resolve('out'));
  const userData = await mkdtemp(path.join(os.tmpdir(), 'liquid-glass-terminal-opacity-e2e-'));
  const settingsPath = path.join(userData, 'settings.json');
  await writeFile(
    settingsPath,
    JSON.stringify({
      schemaVersion: 2,
      glassOpacity: 85,
      fontSize: 17,
      __internal__: { migrations: { version: '0.1.0' } },
    }),
  );
  let application: LaunchedApplication | undefined;
  try {
    application = await electron.launch({
      executablePath,
      args: [`--user-data-dir=${userData}`, '--cwd', process.cwd()],
    });
    let page = await application.firstWindow();
    await expect(page.locator('.app-shell')).toBeVisible();
    await page.getByRole('button', { name: /Settings|設定/ }).click();
    let slider = page.getByRole('slider', {
      name: /Background opacity|背景の不透明度/,
    });
    test.skip(await slider.isDisabled(), 'The current Windows session is using a system fallback.');
    await expect(slider).toHaveValue('50');
    const migratedSettings = JSON.parse(await readFile(settingsPath, 'utf8')) as {
      schemaVersion?: unknown;
      backgroundOpacity?: unknown;
      glassOpacity?: unknown;
      fontSize?: unknown;
    };
    expect(migratedSettings).toMatchObject({
      schemaVersion: 3,
      backgroundOpacity: 50,
      fontSize: 17,
    });
    expect(migratedSettings).not.toHaveProperty('glassOpacity');

    await slider.fill('0');
    await slider.dispatchEvent('pointerup');
    await expect(slider).toHaveValue('0');
    const zeroEffects = await page.locator('.app-shell').evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundOpacity: style.getPropertyValue('--background-opacity').trim(),
        effectStrength: style.getPropertyValue('--effect-strength').trim(),
        blur: style.getPropertyValue('--effect-blur').trim(),
        noise: style.getPropertyValue('--background-noise-opacity').trim(),
        control: style.getPropertyValue('--control-fill').trim(),
        halo: style.getPropertyValue('--terminal-halo-color').trim(),
        danger: style.getPropertyValue('--danger-fill-percent').trim(),
        bell: style.getPropertyValue('--bell-fill-percent').trim(),
      };
    });
    expect(zeroEffects).toMatchObject({
      backgroundOpacity: '0',
      effectStrength: '0',
      blur: '0px',
      noise: '0',
      danger: '0%',
      bell: '0%',
    });
    expect(zeroEffects.control).toMatch(/\/ 0\)$/);
    expect(zeroEffects.halo).toMatch(/\/ 0\)$/);
    await page.waitForTimeout(250);
    await application.close();

    application = await electron.launch({
      executablePath,
      args: [`--user-data-dir=${userData}`, '--cwd', process.cwd()],
    });
    page = await application.firstWindow();
    await expect(page.locator('.app-shell')).toBeVisible();
    await page.getByRole('button', { name: /Settings|設定/ }).click();
    slider = page.getByRole('slider', { name: /Background opacity|背景の不透明度/ });
    await expect(slider).toHaveValue('0');
    await expect
      .poll(() =>
        page
          .locator('.app-shell')
          .evaluate((element) =>
            getComputedStyle(element).getPropertyValue('--effect-strength').trim(),
          ),
      )
      .toBe('0');
  } finally {
    if (application) await application.close().catch(() => undefined);
    await removeTemporaryUserData(userData);
  }
});

test('copies and pastes through native clipboard routes', async () => {
  test.skip(
    process.env.LGT_CLIPBOARD_E2E !== '1',
    'Set LGT_CLIPBOARD_E2E=1 to allow this test to modify the OS clipboard.',
  );

  const executablePath = await findPackagedExecutable(path.resolve('out'));
  const userData = await mkdtemp(path.join(os.tmpdir(), 'liquid-glass-terminal-clipboard-e2e-'));
  const application = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${userData}`, '--cwd', process.cwd()],
  });
  let electronStderr = '';
  let originalClipboard = '';
  let clipboardCaptured = false;
  application.process().stderr?.on('data', (chunk: Buffer) => {
    electronStderr = `${electronStderr}${String(chunk)}`.slice(-32_768);
  });

  try {
    originalClipboard = await readClipboard(application);
    clipboardCaptured = true;

    const page = await application.firstWindow();
    await expect(page.locator('.app-shell')).toBeVisible();
    const terminalPane = page.locator('.terminal-pane[data-active="true"]');
    await expect(terminalPane).toHaveAttribute('data-session-ready', 'true');
    await enableScreenReaderMode(page);

    const accessibilityTree = terminalPane.locator('.xterm-accessibility-tree');
    const terminalInput = terminalPane.locator('.xterm-helper-textarea');
    const copyShortcut = 'Control+C';
    const terminalPasteShortcut = 'Control+Shift+V';
    const editablePasteShortcut = 'Control+V';

    await page.keyboard.press('Control+F');
    const searchInput = page.getByRole('searchbox', { name: /Search|検索/ });
    const searchMarker = 'LGT_SEARCH_CLIPBOARD';
    await writeClipboard(application, searchMarker);
    await searchInput.press(editablePasteShortcut);
    await expect(searchInput).toHaveValue(searchMarker);

    await searchInput.evaluate((input) => (input as HTMLInputElement).select());
    await searchInput.press(copyShortcut);
    await expect.poll(() => readClipboard(application)).toBe(searchMarker);

    const menuSearchMarker = 'LGT_MENU_SEARCH_CLIPBOARD';
    await searchInput.fill('');
    await writeClipboard(application, menuSearchMarker);
    await clickApplicationMenu(application, 'edit-paste');
    await expect(searchInput).toHaveValue(menuSearchMarker);
    await searchInput.press('Escape');

    const shortcutMarker = 'LGT_CLIPBOARD_SHORTCUT_ONCE';
    const shortcutCommand = `echo ${shortcutMarker}`;
    await terminalInput.focus();
    await writeClipboard(application, shortcutCommand);
    await terminalInput.press(terminalPasteShortcut);
    await expect(accessibilityTree).toContainText(shortcutCommand);
    await terminalInput.press('Enter');
    await expect(
      accessibilityTree.locator('[role="listitem"]').filter({
        hasText: new RegExp(`^${shortcutMarker}$`),
      }),
    ).toHaveCount(1);

    const multilineFirst = 'LGT_MULTILINE_FIRST';
    const multilineSecond = 'LGT_MULTILINE_SECOND';
    await terminalInput.focus();
    await writeClipboard(application, `echo ${multilineFirst}\necho ${multilineSecond}`);
    await terminalInput.press(terminalPasteShortcut);
    const pasteDialog = page.getByRole('alertdialog', {
      name: /Paste multiple lines|複数行を貼り付け/,
    });
    await expect(pasteDialog).toBeVisible();
    await pasteDialog.getByRole('button', { name: /Cancel|キャンセル/ }).click();
    await expect(accessibilityTree).not.toContainText(multilineFirst);
    await expect(accessibilityTree).not.toContainText(multilineSecond);

    const menuMarker = 'LGT_CLIPBOARD_MENU_ONCE';
    const menuCommand = `echo ${menuMarker}`;
    await terminalInput.focus();
    await writeClipboard(application, menuCommand);
    await clickApplicationMenu(application, 'edit-paste');
    await expect(accessibilityTree).toContainText(menuCommand);
    await terminalInput.press('Enter');
    await expect(
      accessibilityTree.locator('[role="listitem"]').filter({
        hasText: new RegExp(`^${menuMarker}$`),
      }),
    ).toHaveCount(1);

    await clickApplicationMenu(application, 'edit-select-all');
    await waitForRendererTurn(page);
    await writeClipboard(application, 'LGT_COPY_SENTINEL');
    await clickApplicationMenu(application, 'edit-copy');
    await expect.poll(() => readClipboard(application)).toContain(menuMarker);
  } catch (error: unknown) {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    throw new Error(`${detail}\nPackaged Electron stderr:\n${electronStderr || '(empty)'}`);
  } finally {
    if (clipboardCaptured) await writeClipboard(application, originalClipboard);
    await application.close();
    await removeTemporaryUserData(userData);
  }
});
