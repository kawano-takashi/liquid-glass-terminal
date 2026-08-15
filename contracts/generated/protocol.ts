// Generated from contracts/protocol.idl.json. Do not edit.

export const PROTOCOL_VERSION = 7 as const;
export const APP_ORIGIN = 'https://app.liquid-glass-terminal.invalid/' as const;
export const UI_METRICS = {
  titlebarHeightDip: 56,
  captionButtonWidthDip: 46,
} as const;
export const SETTINGS_SCHEMA_VERSION = 7 as const;
export const WINDOW_STATE_SCHEMA_VERSION = 2 as const;
export const STRING_FORMATS = {
  backgroundColor: 'empty-or-hex-rgb',
} as const;
export const SETTINGS_CONSTRAINTS = {
  blurDips: {
    minimum: 0,
    maximum: 74,
    step: 1,
  },
  uiScale: {
    minimum: 80,
    maximum: 200,
    step: 10,
  },
} as const;
export const SETTINGS_KEYS = [
  'locale',
  'backgroundColor',
  'glass',
  'foreground',
  'animations',
  'uiScale',
] as const;
export const GLASS_SETTING_KEYS = ['enabled', 'blurDips'] as const;
export const GLASS_VALUE_KEYS = ['blurDips'] as const;
export const LIMITS = {
  maxTerminalChunkBytes: 65536,
  maxTerminalOutstandingBytes: 262144,
  resumeTerminalBelowBytes: 65536,
  maxClipboardBytes: 1048576,
} as const;

export const GLASS_PRESET_NAMES = ['clear', 'regular', 'dense'] as const;
export const SETTINGS_OPERATIONS = ['preview', 'apply', 'cancel'] as const;
export const FOREGROUNDS = ['auto', 'light', 'dark'] as const;
export const LOCALES = ['system', 'en', 'ja'] as const;
export const APPEARANCE_STATES = ['glass', 'solid', 'safe'] as const;
export const WEB_TO_NATIVE_TYPES = [
  'bridge.ready',
  'terminal.resize',
  'terminal.input.commit',
  'terminal.output.ack',
  'settings.preview',
  'settings.apply',
  'settings.cancel',
  'clipboard.read',
  'clipboard.write',
] as const;
export const NATIVE_TO_WEB_TYPES = [
  'bridge.accepted',
  'capabilities.changed',
  'terminal.buffer.attach',
  'terminal.input.ack',
  'terminal.output.ready',
  'terminal.recovered',
  'settings.snapshot',
  'settings.result',
  'appearance.changed',
  'window.state.changed',
  'clipboard.result',
  'drop.path',
  'app.notice',
] as const;

export type GlassPreset = (typeof GLASS_PRESET_NAMES)[number];
export type SettingsOperation = (typeof SETTINGS_OPERATIONS)[number];
export type Foreground = (typeof FOREGROUNDS)[number];
export type Locale = (typeof LOCALES)[number];
export type AppearanceState = (typeof APPEARANCE_STATES)[number];
export type WebToNativeType = (typeof WEB_TO_NATIVE_TYPES)[number];
export type NativeToWebType = (typeof NATIVE_TO_WEB_TYPES)[number];

export interface GlassValues {
  blurDips: number;
}
export interface GlassSettings extends GlassValues {
  enabled: boolean;
}
export interface Settings {
  locale: Locale;
  backgroundColor: string;
  glass: GlassSettings;
  foreground: Foreground;
  animations: boolean;
  uiScale: number;
}

export interface SettingsPatch {
  locale?: Locale;
  backgroundColor?: string;
  glass?: Partial<GlassSettings>;
  foreground?: Foreground;
  animations?: boolean;
  uiScale?: number;
}

export interface WindowRuntimeState {
  maximized: boolean;
  fullscreen: boolean;
  active: boolean;
}

export interface PersistedWindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}
export const DEFAULT_PERSISTED_WINDOW_STATE = {
  x: 0,
  y: 0,
  width: 1120,
  height: 840,
  maximized: false,
} as const satisfies PersistedWindowState;

export const GLASS_PRESETS = {
  clear: {
    blurDips: 0,
  },
  regular: {
    blurDips: 30,
  },
  dense: {
    blurDips: 55,
  },
} as const satisfies Record<GlassPreset, GlassValues>;
export const DEFAULT_SETTINGS = {
  locale: 'system',
  backgroundColor: '',
  glass: {
    enabled: true,
    blurDips: 30,
  },
  foreground: 'auto',
  animations: true,
  uiScale: 100,
} as const satisfies Settings;

export interface Envelope<TType extends string = string, TPayload = unknown> {
  v: typeof PROTOCOL_VERSION;
  type: TType;
  id?: string;
  payload: TPayload;
}

export type WebToNativeMessage =
  | Envelope<'bridge.ready', { locale: string; devicePixelRatio: number }>
  | Envelope<'terminal.resize', { cols: number; rows: number }>
  | Envelope<'terminal.input.commit', BufferCommit>
  | Envelope<'terminal.output.ack', BufferCommit>
  | Envelope<'settings.preview', { transactionId: string; patch: SettingsPatch }>
  | Envelope<'settings.apply', { transactionId: string; patch: SettingsPatch }>
  | Envelope<'settings.cancel', { transactionId: string }>
  | Envelope<'clipboard.read', { requestId: string }>
  | Envelope<'clipboard.write', { requestId: string; text: string }>;

export interface BufferCommit {
  buffer: number;
  generation: number;
  sequence: number;
  length: number;
}

export type NativeToWebMessage =
  | Envelope<
      'bridge.accepted',
      {
        sessionId: string;
        settings: Settings;
        capabilities: Capabilities;
        windowState: WindowRuntimeState;
      }
    >
  | Envelope<'capabilities.changed', Capabilities>
  | Envelope<
      'terminal.buffer.attach',
      { direction: 'input' | 'output'; buffer: number; generation: number; capacity: number }
    >
  | Envelope<'terminal.input.ack', BufferCommit>
  | Envelope<'terminal.output.ready', BufferCommit>
  | Envelope<'terminal.recovered', { generation: number; droppedBytes: number }>
  | Envelope<'settings.snapshot', { transactionId: string; settings: Settings }>
  | Envelope<
      'settings.result',
      { transactionId: string; operation: SettingsOperation; ok: boolean; error?: string }
    >
  | Envelope<'appearance.changed', { state: AppearanceState; reason?: string }>
  | Envelope<'window.state.changed', WindowRuntimeState>
  | Envelope<'clipboard.result', { requestId: string; ok: boolean; text?: string; error?: string }>
  | Envelope<'drop.path', { path: string }>
  | Envelope<'app.notice', { level: 'info' | 'warning' | 'error'; message: string }>;

export interface Capabilities {
  glass: boolean;
  sharedBuffers: boolean;
  reducedMotion: boolean;
  screenReader: boolean;
  highContrast: boolean;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const exactObjectKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => key in value) && Object.keys(value).every((key) => allowed.has(key))
  );
};
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integerInRange = (value: unknown, min: number, max: number): value is number =>
  Number.isInteger(value) && finite(value, min, max);
const constrainedInteger = (
  value: unknown,
  constraint: { minimum: number; maximum: number; step: number },
): value is number =>
  integerInRange(value, constraint.minimum, constraint.maximum) &&
  (value - constraint.minimum) % constraint.step === 0;
const validStringField = (name: keyof typeof STRING_FORMATS, value: unknown): value is string =>
  typeof value === 'string' &&
  (name === 'backgroundColor' ? value === '' || /^#[0-9a-fA-F]{6}$/u.test(value) : false);
const asciiId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(value);
const enumValue = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && values.includes(value as T);

const boundedString = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;
const utf8Within = (value: string, max: number): boolean =>
  new TextEncoder().encode(value).byteLength <= max;

const validConstrainedField = (
  name: keyof typeof SETTINGS_CONSTRAINTS,
  value: unknown,
): value is number => constrainedInteger(value, SETTINGS_CONSTRAINTS[name]);

export function resolveGlassPreset(glass: GlassSettings): GlassPreset | 'custom' {
  for (const name of GLASS_PRESET_NAMES) {
    const value = GLASS_PRESETS[name];
    if (GLASS_VALUE_KEYS.every((field) => value[field] === glass[field])) return name;
  }
  return 'custom';
}

export function isSettings(value: unknown): value is Settings {
  if (
    !record(value) ||
    !exactObjectKeys(value, SETTINGS_KEYS) ||
    !(
      enumValue(LOCALES, value.locale) &&
      validStringField('backgroundColor', value.backgroundColor) &&
      enumValue(FOREGROUNDS, value.foreground) &&
      typeof value.animations === 'boolean' &&
      validConstrainedField('uiScale', value.uiScale)
    )
  )
    return false;
  return (
    record(value.glass) &&
    exactObjectKeys(value.glass, GLASS_SETTING_KEYS) &&
    typeof value.glass.enabled === 'boolean' &&
    validConstrainedField('blurDips', value.glass.blurDips)
  );
}

export function isSettingsPatch(value: unknown): value is SettingsPatch {
  if (
    !record(value) ||
    !exactObjectKeys(value, [], SETTINGS_KEYS) ||
    Object.keys(value).length === 0
  )
    return false;
  if (value.locale !== undefined && !enumValue(LOCALES, value.locale)) return false;
  if (
    value.backgroundColor !== undefined &&
    !validStringField('backgroundColor', value.backgroundColor)
  )
    return false;
  if (value.foreground !== undefined && !enumValue(FOREGROUNDS, value.foreground)) return false;
  if (value.animations !== undefined && !(typeof value.animations === 'boolean')) return false;
  if (value.uiScale !== undefined && !validConstrainedField('uiScale', value.uiScale)) return false;
  if (value.glass !== undefined) {
    if (
      !record(value.glass) ||
      !exactObjectKeys(value.glass, [], GLASS_SETTING_KEYS) ||
      Object.keys(value.glass).length === 0
    )
      return false;
    if (value.glass.enabled !== undefined && !(typeof value.glass.enabled === 'boolean'))
      return false;
    if (
      value.glass.blurDips !== undefined &&
      !validConstrainedField('blurDips', value.glass.blurDips)
    )
      return false;
  }
  return true;
}

export function isWindowRuntimeState(value: unknown): value is WindowRuntimeState {
  return (
    record(value) &&
    exactObjectKeys(value, ['maximized', 'fullscreen', 'active']) &&
    typeof value.maximized === 'boolean' &&
    typeof value.fullscreen === 'boolean' &&
    typeof value.active === 'boolean'
  );
}

function isCommit(value: unknown, buffers: number): value is BufferCommit {
  return (
    record(value) &&
    exactObjectKeys(value, ['buffer', 'generation', 'sequence', 'length']) &&
    integerInRange(value.buffer, 0, buffers - 1) &&
    integerInRange(value.generation, 0, 0xffffffff) &&
    integerInRange(value.sequence, 0, 0xffffffff) &&
    integerInRange(value.length, 0, LIMITS.maxTerminalChunkBytes)
  );
}

export function isWebToNativeMessage(value: unknown): value is WebToNativeMessage {
  if (
    !record(value) ||
    !exactObjectKeys(value, ['v', 'type', 'payload'], ['id']) ||
    value.v !== PROTOCOL_VERSION ||
    !enumValue(WEB_TO_NATIVE_TYPES, value.type) ||
    (value.id !== undefined && !asciiId(value.id)) ||
    !record(value.payload)
  )
    return false;
  const payload = value.payload;
  switch (value.type) {
    case 'bridge.ready':
      return (
        exactObjectKeys(payload, ['locale', 'devicePixelRatio']) &&
        typeof payload.locale === 'string' &&
        payload.locale.length <= 32 &&
        finite(payload.devicePixelRatio, 0.5, 8)
      );
    case 'terminal.resize':
      return (
        exactObjectKeys(payload, ['cols', 'rows']) &&
        integerInRange(payload.cols, 2, 500) &&
        integerInRange(payload.rows, 1, 300)
      );
    case 'terminal.input.commit':
      return isCommit(payload, 2);
    case 'terminal.output.ack':
      return isCommit(payload, 4);
    case 'settings.preview':
    case 'settings.apply':
      return (
        exactObjectKeys(payload, ['transactionId', 'patch']) &&
        asciiId(payload.transactionId) &&
        isSettingsPatch(payload.patch)
      );
    case 'settings.cancel':
      return exactObjectKeys(payload, ['transactionId']) && asciiId(payload.transactionId);
    case 'clipboard.read':
      return exactObjectKeys(payload, ['requestId']) && asciiId(payload.requestId);
    case 'clipboard.write':
      return (
        exactObjectKeys(payload, ['requestId', 'text']) &&
        asciiId(payload.requestId) &&
        typeof payload.text === 'string' &&
        utf8Within(payload.text, LIMITS.maxClipboardBytes)
      );
  }
}

export function isNativeToWebMessage(value: unknown): value is NativeToWebMessage {
  if (
    !record(value) ||
    !exactObjectKeys(value, ['v', 'type', 'payload'], ['id']) ||
    value.v !== PROTOCOL_VERSION ||
    !enumValue(NATIVE_TO_WEB_TYPES, value.type) ||
    (value.id !== undefined && !asciiId(value.id)) ||
    !record(value.payload)
  )
    return false;
  const payload = value.payload;
  switch (value.type) {
    case 'bridge.accepted':
      return (
        exactObjectKeys(payload, ['sessionId', 'settings', 'capabilities', 'windowState']) &&
        asciiId(payload.sessionId) &&
        isSettings(payload.settings) &&
        isWindowRuntimeState(payload.windowState) &&
        record(payload.capabilities) &&
        exactObjectKeys(payload.capabilities, [
          'glass',
          'sharedBuffers',
          'reducedMotion',
          'screenReader',
          'highContrast',
        ]) &&
        typeof payload.capabilities.glass === 'boolean' &&
        typeof payload.capabilities.sharedBuffers === 'boolean' &&
        typeof payload.capabilities.reducedMotion === 'boolean' &&
        typeof payload.capabilities.screenReader === 'boolean' &&
        typeof payload.capabilities.highContrast === 'boolean'
      );
    case 'capabilities.changed':
      return (
        exactObjectKeys(payload, [
          'glass',
          'sharedBuffers',
          'reducedMotion',
          'screenReader',
          'highContrast',
        ]) &&
        typeof payload.glass === 'boolean' &&
        typeof payload.sharedBuffers === 'boolean' &&
        typeof payload.reducedMotion === 'boolean' &&
        typeof payload.screenReader === 'boolean' &&
        typeof payload.highContrast === 'boolean'
      );
    case 'terminal.buffer.attach': {
      if (
        !exactObjectKeys(payload, ['direction', 'buffer', 'generation', 'capacity']) ||
        (payload.direction !== 'input' && payload.direction !== 'output') ||
        !integerInRange(payload.generation, 0, 0xffffffff) ||
        payload.capacity !== LIMITS.maxTerminalChunkBytes
      )
        return false;
      return integerInRange(payload.buffer, 0, payload.direction === 'input' ? 1 : 3);
    }
    case 'terminal.input.ack':
      return isCommit(payload, 2);
    case 'terminal.output.ready':
      return isCommit(payload, 4);
    case 'terminal.recovered':
      return (
        exactObjectKeys(payload, ['generation', 'droppedBytes']) &&
        integerInRange(payload.generation, 0, 0xffffffff) &&
        integerInRange(payload.droppedBytes, 0, Number.MAX_SAFE_INTEGER)
      );
    case 'settings.snapshot':
      return (
        exactObjectKeys(payload, ['transactionId', 'settings']) &&
        asciiId(payload.transactionId) &&
        isSettings(payload.settings)
      );
    case 'settings.result':
      return (
        exactObjectKeys(payload, ['transactionId', 'operation', 'ok'], ['error']) &&
        asciiId(payload.transactionId) &&
        enumValue(SETTINGS_OPERATIONS, payload.operation) &&
        typeof payload.ok === 'boolean' &&
        (payload.error === undefined || boundedString(payload.error, 256))
      );
    case 'appearance.changed':
      return (
        exactObjectKeys(payload, ['state'], ['reason']) &&
        enumValue(APPEARANCE_STATES, payload.state) &&
        (payload.reason === undefined || boundedString(payload.reason, 256))
      );
    case 'window.state.changed':
      return isWindowRuntimeState(payload);
    case 'clipboard.result':
      return (
        exactObjectKeys(payload, ['requestId', 'ok'], ['text', 'error']) &&
        asciiId(payload.requestId) &&
        typeof payload.ok === 'boolean' &&
        (payload.text === undefined ||
          (boundedString(payload.text, LIMITS.maxClipboardBytes) &&
            utf8Within(payload.text, LIMITS.maxClipboardBytes))) &&
        (payload.error === undefined || boundedString(payload.error, 256))
      );
    case 'drop.path':
      return exactObjectKeys(payload, ['path']) && boundedString(payload.path, 32768);
    case 'app.notice':
      return (
        exactObjectKeys(payload, ['level', 'message']) &&
        enumValue(['info', 'warning', 'error'] as const, payload.level) &&
        boundedString(payload.message, 1024)
      );
  }
}
