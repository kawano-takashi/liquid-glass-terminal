import type { ITheme } from '@xterm/xterm';
import type { ForegroundTone } from '../../shared/settings';

const darkSurfaceTheme: ITheme = {
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

const lightSurfaceTheme: ITheme = {
  // At the -50 switch point, a white overlay can still resolve to #808080 over black.
  // Feed that conservative RGB value to xterm's 4.5:1 contrast correction while
  // retaining a fully transparent alpha channel for rendering.
  background: '#80808000',
  foreground: '#181818',
  cursor: '#181818',
  cursorAccent: '#f5f5f5',
  selectionBackground: '#0000002e',
  selectionInactiveBackground: '#0000001c',
  black: '#181818',
  red: '#a71332',
  green: '#12643d',
  yellow: '#765100',
  blue: '#145da0',
  magenta: '#7640a4',
  cyan: '#00666e',
  white: '#dedede',
  brightBlack: '#656565',
  brightRed: '#be2944',
  brightGreen: '#24764e',
  brightYellow: '#876300',
  brightBlue: '#2970b3',
  brightMagenta: '#8954b6',
  brightCyan: '#147980',
  brightWhite: '#ffffff',
};

export function resolveTerminalTheme(tone: ForegroundTone): ITheme {
  return tone === 'dark' ? lightSurfaceTheme : darkSurfaceTheme;
}
