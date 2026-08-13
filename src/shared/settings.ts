import type { SettingsV2 } from './contracts';

export const GLASS_OPACITY_MIN = 35;
export const GLASS_OPACITY_MAX = 85;
export const GLASS_OPACITY_DEFAULT = 60;

export const DEFAULT_SETTINGS: SettingsV2 = {
  schemaVersion: 2,
  locale: 'system',
  theme: 'system',
  glassOpacity: GLASS_OPACITY_DEFAULT,
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
  schemaVersion: { type: 'number', enum: [2], default: 2 },
  locale: { type: 'string', enum: ['system', 'en', 'ja'], default: 'system' },
  theme: { type: 'string', enum: ['system', 'light', 'dark'], default: 'system' },
  glassOpacity: {
    type: 'number',
    minimum: GLASS_OPACITY_MIN,
    maximum: GLASS_OPACITY_MAX,
    multipleOf: 1,
    default: GLASS_OPACITY_DEFAULT,
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
