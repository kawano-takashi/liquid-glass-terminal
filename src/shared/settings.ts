import type { SettingsV4 } from './contracts';

export const GLASS_OPACITY_MIN = 0;
export const GLASS_OPACITY_MAX = 100;
export const GLASS_OPACITY_STEP = 5;
export const GLASS_OPACITY_DEFAULT = 25;
export const FROST_STRENGTH_MIN = 0;
export const FROST_STRENGTH_MAX = 13;
export const FROST_STRENGTH_DEFAULT = 6;
export const FROST_BLUR_AMOUNTS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 17, 20, 24] as const;

export function resolveFrostBlurAmount(frostStrength: number): number {
  const strength = Number.isFinite(frostStrength)
    ? Math.min(FROST_STRENGTH_MAX, Math.max(FROST_STRENGTH_MIN, Math.trunc(frostStrength)))
    : FROST_STRENGTH_DEFAULT;
  return FROST_BLUR_AMOUNTS[strength];
}

export const DEFAULT_SETTINGS: SettingsV4 = {
  schemaVersion: 4,
  locale: 'system',
  glassOpacity: GLASS_OPACITY_DEFAULT,
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
  schemaVersion: { type: 'number', enum: [4], default: 4 },
  locale: { type: 'string', enum: ['system', 'en', 'ja'], default: 'system' },
  glassOpacity: {
    type: 'number',
    minimum: GLASS_OPACITY_MIN,
    maximum: GLASS_OPACITY_MAX,
    multipleOf: GLASS_OPACITY_STEP,
    default: GLASS_OPACITY_DEFAULT,
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
