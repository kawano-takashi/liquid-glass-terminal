import type { ITheme } from '@xterm/xterm';
import type { ResolvedTheme } from '../../shared/contracts';

const dark: ITheme = {
  background: '#17131f00',
  foreground: '#f5f1ff',
  cursor: '#d9c7ff',
  cursorAccent: '#241b31',
  selectionBackground: '#8c66c766',
  selectionInactiveBackground: '#77638a45',
  black: '#211a2b',
  red: '#ff7892',
  green: '#79d8ae',
  yellow: '#f5cc7a',
  blue: '#82b8ff',
  magenta: '#cf94ff',
  cyan: '#73dce6',
  white: '#e8e1f2',
  brightBlack: '#746881',
  brightRed: '#ff9cad',
  brightGreen: '#9ae6c3',
  brightYellow: '#ffe09b',
  brightBlue: '#a8cdff',
  brightMagenta: '#dfb2ff',
  brightCyan: '#9cecf2',
  brightWhite: '#ffffff',
};

const light: ITheme = {
  background: '#f7f3fb00',
  foreground: '#211b2b',
  cursor: '#6642a5',
  cursorAccent: '#ffffff',
  selectionBackground: '#7651ba48',
  selectionInactiveBackground: '#6f627a2e',
  black: '#211b2b',
  red: '#a51d43',
  green: '#176c4a',
  yellow: '#755800',
  blue: '#1857a5',
  magenta: '#7432a5',
  cyan: '#006a75',
  white: '#e9e3ef',
  brightBlack: '#5d5368',
  brightRed: '#c72f55',
  brightGreen: '#1e8259',
  brightYellow: '#8c6900',
  brightBlue: '#276fc5',
  brightMagenta: '#8d47bd',
  brightCyan: '#00808d',
  brightWhite: '#ffffff',
};

export const terminalTheme = (theme: ResolvedTheme): ITheme => (theme === 'dark' ? dark : light);
