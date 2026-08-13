import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { isApplicationClipboardAccelerator } from '../shared/clipboard';
import type { AppCommand } from '../shared/contracts';

type MenuLocale = 'en' | 'ja';

const labels = {
  en: {
    file: 'File',
    newTab: 'New Tab',
    closeTab: 'Close Tab',
    quit: 'Quit',
    edit: 'Edit',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    search: 'Find',
    view: 'View',
    nextTab: 'Next Tab',
    previousTab: 'Previous Tab',
    settings: 'Settings',
    window: 'Window',
  },
  ja: {
    file: 'ファイル',
    newTab: '新しいタブ',
    closeTab: 'タブを閉じる',
    quit: '終了',
    edit: '編集',
    copy: 'コピー',
    paste: '貼り付け',
    selectAll: 'すべて選択',
    search: '検索',
    view: '表示',
    nextTab: '次のタブ',
    previousTab: '前のタブ',
    settings: '設定',
    window: 'ウィンドウ',
  },
} as const;

export function installApplicationMenu(
  window: BrowserWindow,
  locale: MenuLocale,
  send: (command: AppCommand) => void,
): void {
  const t = labels[locale];
  const mod = process.platform === 'darwin' ? 'Cmd' : 'Ctrl';
  const template: MenuItemConstructorOptions[] = [];

  if (process.platform === 'darwin') {
    template.push({
      label: app.name,
      submenu: [
        { label: t.settings, accelerator: 'Cmd+,', click: () => send({ type: 'open-settings' }) },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { label: t.quit, accelerator: 'Cmd+Q', click: () => window.close() },
      ],
    });
  }

  template.push(
    {
      label: t.file,
      submenu: [
        { label: t.newTab, accelerator: `${mod}+T`, click: () => send({ type: 'new-tab' }) },
        { label: t.closeTab, accelerator: `${mod}+W`, click: () => send({ type: 'close-tab' }) },
        { type: 'separator' },
        ...(process.platform === 'darwin'
          ? []
          : [{ label: t.quit, accelerator: 'Alt+F4', click: () => window.close() }]),
      ],
    },
    {
      label: t.edit,
      submenu: [
        {
          id: 'edit-copy',
          label: t.copy,
          accelerator: `${mod}+C`,
          click: () => send({ type: 'copy' }),
        },
        {
          id: 'edit-paste',
          label: t.paste,
          accelerator: process.platform === 'darwin' ? 'Cmd+V' : 'Ctrl+Shift+V',
          click: () => send({ type: 'paste' }),
        },
        {
          id: 'edit-select-all',
          label: t.selectAll,
          accelerator: `${mod}+A`,
          click: () => send({ type: 'select-all' }),
        },
        { type: 'separator' },
        { label: t.search, accelerator: `${mod}+F`, click: () => send({ type: 'search' }) },
      ],
    },
    {
      label: t.view,
      submenu: [
        { label: t.nextTab, accelerator: 'Ctrl+Tab', click: () => send({ type: 'next-tab' }) },
        {
          label: t.previousTab,
          accelerator: 'Ctrl+Shift+Tab',
          click: () => send({ type: 'previous-tab' }),
        },
        { type: 'separator' },
        {
          label: t.settings,
          accelerator: `${mod}+,`,
          click: () => send({ type: 'open-settings' }),
        },
      ],
    },
    { label: t.window, role: 'windowMenu' },
  );

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

export function installClipboardShortcutRouting(window: BrowserWindow): void {
  window.webContents.on('before-input-event', (_event, input) => {
    window.webContents.setIgnoreMenuShortcuts(
      isApplicationClipboardAccelerator(process.platform, {
        key: input.key,
        control: input.control,
        meta: input.meta,
        shift: input.shift,
        alt: input.alt,
      }),
    );
  });
}

export function showTerminalContextMenu(
  window: BrowserWindow,
  locale: MenuLocale,
  hasSelection: boolean,
  send: (command: AppCommand) => void,
): void {
  const t = labels[locale];
  Menu.buildFromTemplate([
    { label: t.copy, enabled: hasSelection, click: () => send({ type: 'copy' }) },
    { label: t.paste, click: () => send({ type: 'paste' }) },
    { type: 'separator' },
    { label: t.selectAll, click: () => send({ type: 'select-all' }) },
    { label: t.search, click: () => send({ type: 'search' }) },
    {
      label: locale === 'ja' ? '端末をクリア' : 'Clear terminal',
      click: () => send({ type: 'clear' }),
    },
  ]).popup({ window });
}
