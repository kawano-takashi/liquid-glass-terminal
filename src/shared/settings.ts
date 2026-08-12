import type { SettingsV1 } from './contracts';

export const DEFAULT_SETTINGS: SettingsV1 = {
  schemaVersion: 1,
  locale: 'system',
  theme: 'system',
  glass: 'balanced',
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
  schemaVersion: { type: 'number', enum: [1], default: 1 },
  locale: { type: 'string', enum: ['system', 'en', 'ja'], default: 'system' },
  theme: { type: 'string', enum: ['system', 'light', 'dark'], default: 'system' },
  glass: {
    type: 'string',
    enum: ['clear', 'balanced', 'dense'],
    default: 'balanced',
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
