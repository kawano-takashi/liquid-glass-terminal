import type { Foreground, Settings } from '../../contracts/generated/protocol';

const LIGHT = '#ffffff';
const DARK = '#000000';
const MINIMUM_CONTRAST = 4.5;

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const parts = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!parts) return luminance('#181818');
  return (
    0.2126 * channel(Number.parseInt(parts[1], 16)) +
    0.7152 * channel(Number.parseInt(parts[2], 16)) +
    0.0722 * channel(Number.parseInt(parts[3], 16))
  );
}

function ratio(first: string, second: string): number {
  const high = Math.max(luminance(first), luminance(second));
  const low = Math.min(luminance(first), luminance(second));
  return (high + 0.05) / (low + 0.05);
}

export function resolveForeground(tint: string, choice: Foreground): 'light' | 'dark' {
  if (choice === 'light') return ratio(tint, LIGHT) >= MINIMUM_CONTRAST ? 'light' : 'dark';
  if (choice === 'dark') return ratio(tint, DARK) >= MINIMUM_CONTRAST ? 'dark' : 'light';
  return ratio(tint, LIGHT) >= ratio(tint, DARK) ? 'light' : 'dark';
}

export function cssAppearance(settings: Settings): Record<string, string> {
  const foreground = resolveForeground(settings.glass.tint, settings.foreground);
  return {
    '--tint': settings.glass.tint,
    '--text': foreground === 'light' ? LIGHT : DARK,
    '--muted': foreground === 'light' ? '#c9c9c9' : '#3b3b3b',
    '--control': foreground === 'light' ? 'rgb(255 255 255 / 0.10)' : 'rgb(0 0 0 / 0.09)',
    '--control-hover': foreground === 'light' ? 'rgb(255 255 255 / 0.17)' : 'rgb(0 0 0 / 0.15)',
  };
}
