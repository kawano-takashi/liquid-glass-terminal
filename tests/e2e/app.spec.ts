import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { findPackagedExecutable } from '../../scripts/packaged-executable.mjs';

test('launches one terminal and opens settings', async () => {
  const executablePath = await findPackagedExecutable(path.resolve('out'));
  const userData = await mkdtemp(path.join(os.tmpdir(), 'liquid-glass-terminal-e2e-'));
  const application = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${userData}`, '--cwd', process.cwd()],
  });
  try {
    const page = await application.firstWindow();
    await expect(page.locator('.app-shell')).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(1);

    await page.getByRole('button', { name: /Settings|設定/ }).click();
    const settingsDialog = page.getByRole('dialog', { name: /Settings|設定/ });
    await expect(settingsDialog).toBeVisible();
    const screenReader = page.getByRole('checkbox', {
      name: /Screen reader mode|スクリーンリーダーモード/,
    });
    await screenReader.check();
    await expect(screenReader).toBeChecked();
    await page.keyboard.press('Escape');

    const terminalInput = page.locator('.xterm-helper-textarea');
    await terminalInput.focus();
    await page.keyboard.type('echo LGT_E2E_READY');
    await page.keyboard.press('Enter');
    await expect(page.locator('.xterm-accessibility-tree')).toContainText('LGT_E2E_READY');

    await page.getByRole('button', { name: /Settings|設定/ }).click();
    await expect(settingsDialog).toBeVisible();
    await screenReader.uncheck();
    await expect(screenReader).not.toBeChecked();
    await page.screenshot({ path: 'test-results/liquid-glass-terminal.png' });
  } finally {
    await application.close();
    await rm(userData, { recursive: true, force: true });
  }
});
