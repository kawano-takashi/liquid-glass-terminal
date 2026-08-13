import type { SettingsV3 } from './contracts';

export const BACKGROUND_OPACITY_MIN = 0;
export const BACKGROUND_OPACITY_MAX = 50;
export const BACKGROUND_OPACITY_DEFAULT = 25;

export const DEFAULT_SETTINGS: SettingsV3 = {
  schemaVersion: 3,
  locale: 'system',
  theme: 'system',
  backgroundOpacity: BACKGROUND_OPACITY_DEFAULT,
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
  schemaVersion: { type: 'number', enum: [3], default: 3 },
  locale: { type: 'string', enum: ['system', 'en', 'ja'], default: 'system' },
  theme: { type: 'string', enum: ['system', 'light', 'dark'], default: 'system' },
  backgroundOpacity: {
    type: 'number',
    minimum: BACKGROUND_OPACITY_MIN,
    maximum: BACKGROUND_OPACITY_MAX,
    multipleOf: 1,
    default: BACKGROUND_OPACITY_DEFAULT,
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
