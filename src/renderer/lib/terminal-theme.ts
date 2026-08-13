import type { ITheme } from '@xterm/xterm';
import type { ResolvedTheme } from '../../shared/contracts';

const dark: ITheme = {
  background: '#18181800',
  foreground: '#f5f5f5',
  cursor: '#f5f5f5',
  cursorAccent: '#181818',
  selectionBackground: '#ffffff2e',
  selectionInactiveBackground: '#ffffff1c',
  black: '#1a1a1a',
  red: '#ff7892',
  green: '#79d8ae',
  yellow: '#f5cc7a',
  blue: '#82b8ff',
  magenta: '#cf94ff',
  cyan: '#73dce6',
  white: '#e8e8e8',
  brightBlack: '#767676',
  brightRed: '#ff9cad',
  brightGreen: '#9ae6c3',
  brightYellow: '#ffe09b',
  brightBlue: '#a8cdff',
  brightMagenta: '#dfb2ff',
  brightCyan: '#9cecf2',
  brightWhite: '#ffffff',
};

const light: ITheme = {
  background: '#f4f4f400',
  foreground: '#181818',
  cursor: '#181818',
  cursorAccent: '#ffffff',
  selectionBackground: '#00000028',
  selectionInactiveBackground: '#00000018',
  black: '#181818',
  red: '#a51d43',
  green: '#176c4a',
  yellow: '#755800',
  blue: '#1857a5',
  magenta: '#7432a5',
  cyan: '#006a75',
  white: '#e8e8e8',
  brightBlack: '#5e5e5e',
  brightRed: '#c72f55',
  brightGreen: '#1e8259',
  brightYellow: '#8c6900',
  brightBlue: '#276fc5',
  brightMagenta: '#8d47bd',
  brightCyan: '#00808d',
  brightWhite: '#ffffff',
};

export const terminalTheme = (theme: ResolvedTheme): ITheme => (theme === 'dark' ? dark : light);
