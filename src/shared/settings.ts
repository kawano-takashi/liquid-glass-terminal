import type { SettingsV5 } from './contracts';

export const GLASS_CONTRAST_MIN = -100;
export const GLASS_CONTRAST_MAX = 100;
export const GLASS_CONTRAST_STEP = 5;
export const GLASS_CONTRAST_DEFAULT = 0;
export const LIGHT_SURFACE_CONTRAST_THRESHOLD = -50;
export const FROST_STRENGTH_MIN = 0;
export const FROST_STRENGTH_MAX = 13;
export const FROST_STRENGTH_DEFAULT = 6;
export const FROST_BLUR_AMOUNTS = [0, 2, 3, 4, 5, 6, 9, 12, 16, 22, 30, 41, 55, 74] as const;

export function resolveFrostBlurAmount(frostStrength: number): number {
  const strength = Number.isFinite(frostStrength)
    ? Math.min(FROST_STRENGTH_MAX, Math.max(FROST_STRENGTH_MIN, Math.trunc(frostStrength)))
    : FROST_STRENGTH_DEFAULT;
  return FROST_BLUR_AMOUNTS[strength];
}

export type ForegroundTone = 'light' | 'dark';

export function resolveForegroundTone(
  backdropActive: boolean,
  glassContrast: number,
): ForegroundTone {
  return backdropActive && glassContrast <= LIGHT_SURFACE_CONTRAST_THRESHOLD ? 'dark' : 'light';
}

export const DEFAULT_SETTINGS: SettingsV5 = {
  schemaVersion: 5,
  locale: 'system',
  glassContrast: GLASS_CONTRAST_DEFAULT,
  frostStrength: FROST_STRENGTH_DEFAULT,
  defaultProfileId: 'auto',
  fontSize: 14,
  cursorStyle: 'block',
  cursorBlink: true,
  bellSound: false,
  scrollback: 100_000,
  warnMultilinePaste: true,
  screenReaderMode: false,
  firstRunHintsSeen: false,
};

export const SETTINGS_SCHEMA = {
  schemaVersion: { type: 'number', enum: [5], default: 5 },
  locale: { type: 'string', enum: ['system', 'en', 'ja'], default: 'system' },
  glassContrast: {
    type: 'number',
    minimum: GLASS_CONTRAST_MIN,
    maximum: GLASS_CONTRAST_MAX,
    multipleOf: GLASS_CONTRAST_STEP,
    default: GLASS_CONTRAST_DEFAULT,
  },
  frostStrength: {
    type: 'number',
    minimum: FROST_STRENGTH_MIN,
    maximum: FROST_STRENGTH_MAX,
    multipleOf: 1,
    default: FROST_STRENGTH_DEFAULT,
  },
  defaultProfileId: { type: 'string', maxLength: 200, default: 'auto' },
  fontSize: { type: 'number', minimum: 10, maximum: 32, default: 14 },
  cursorStyle: {
    type: 'string',
    enum: ['block', 'bar', 'underline'],
    default: 'block',
  },
  cursorBlink: { type: 'boolean', default: true },
  bellSound: { type: 'boolean', default: false },
  scrollback: {
    type: 'number',
    minimum: 1_000,
    maximum: 1_000_000,
    default: 100_000,
  },
  warnMultilinePaste: { type: 'boolean', default: true },
  screenReaderMode: { type: 'boolean', default: false },
  firstRunHintsSeen: { type: 'boolean', default: false },
} as const;
