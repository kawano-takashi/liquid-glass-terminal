// Generated from contracts/protocol.idl.json. Do not edit.

export const PROTOCOL_VERSION = 1 as const;
export const APP_ORIGIN = 'https://app.liquid-glass-terminal.invalid/' as const;
export const LIMITS = {
  maxGlassRegions: 32,
  maxTerminalChunkBytes: 65536,
  maxTerminalOutstandingBytes: 262144,
  resumeTerminalBelowBytes: 65536,
  maxClipboardBytes: 1048576,
} as const;

export const GLASS_ROLES = ['terminal', 'overlay', 'decorative'] as const;
export const GLASS_PRESETS = ['clear', 'regular', 'dense'] as const;
export const FOREGROUNDS = ['auto', 'light', 'dark'] as const;
export const LOCALES = ['system', 'en', 'ja'] as const;
export const APPEARANCE_STATES = ['glass', 'solid', 'safe'] as const;
export const WEB_TO_NATIVE_TYPES = [
  'bridge.ready',
  'terminal.resize',
  'terminal.input.commit',
  'terminal.output.ack',
  'glass.layout.set',
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
  'clipboard.result',
  'drop.path',
  'app.notice',
] as const;

export type GlassRole = (typeof GLASS_ROLES)[number];
export type GlassPreset = (typeof GLASS_PRESETS)[number];
export type Foreground = (typeof FOREGROUNDS)[number];
export type Locale = (typeof LOCALES)[number];
export type AppearanceState = (typeof APPEARANCE_STATES)[number];
export type WebToNativeType = (typeof WEB_TO_NATIVE_TYPES)[number];
export type NativeToWebType = (typeof NATIVE_TO_WEB_TYPES)[number];

export interface Settings {
  locale: Locale;
  glass: { enabled: boolean; preset: GlassPreset; tint: string };
  foreground: Foreground;
  animations: boolean;
  uiScale: number;
}

export interface SettingsPatch {
  locale?: Locale;
  glass?: Partial<Settings['glass']>;
  foreground?: Foreground;
  animations?: boolean;
  uiScale?: number;
}

export interface GlassRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  radii: readonly [number, number, number, number];
  role: GlassRole;
}

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
  | Envelope<'glass.layout.set', { revision: number; regions: GlassRegion[] }>
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
      { sessionId: string; settings: Settings; capabilities: Capabilities }
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
  | Envelope<'settings.result', { transactionId: string; ok: boolean; error?: string }>
  | Envelope<'appearance.changed', { state: AppearanceState; reason?: string }>
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
const exactKeys = (
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
const integer = (value: unknown, min: number, max: number): value is number =>
  Number.isInteger(value) && finite(value, min, max);
const asciiId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(value);
const enumValue = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && values.includes(value as T);

const boundedString = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;
const utf8Within = (value: string, max: number): boolean =>
  new TextEncoder().encode(value).byteLength <= max;

export function isSettings(value: unknown): value is Settings {
  if (
    !record(value) ||
    !exactKeys(value, ['locale', 'glass', 'foreground', 'animations', 'uiScale']) ||
    !enumValue(LOCALES, value.locale) ||
    !enumValue(FOREGROUNDS, value.foreground) ||
    typeof value.animations !== 'boolean' ||
    !integer(value.uiScale, 80, 200) ||
    value.uiScale % 10 !== 0
  )
    return false;
  return (
    record(value.glass) &&
    exactKeys(value.glass, ['enabled', 'preset', 'tint']) &&
    typeof value.glass.enabled === 'boolean' &&
    enumValue(GLASS_PRESETS, value.glass.preset) &&
    typeof value.glass.tint === 'string' &&
    /^#[0-9A-Fa-f]{6}$/.test(value.glass.tint)
  );
}

export function isSettingsPatch(value: unknown): value is SettingsPatch {
  if (
    !record(value) ||
    !exactKeys(value, [], ['locale', 'glass', 'foreground', 'animations', 'uiScale']) ||
    Object.keys(value).length === 0
  )
    return false;
  if (value.locale !== undefined && !enumValue(LOCALES, value.locale)) return false;
  if (value.foreground !== undefined && !enumValue(FOREGROUNDS, value.foreground)) return false;
  if (value.animations !== undefined && typeof value.animations !== 'boolean') return false;
  if (value.uiScale !== undefined && (!integer(value.uiScale, 80, 200) || value.uiScale % 10 !== 0))
    return false;
  if (value.glass !== undefined) {
    if (
      !record(value.glass) ||
      !exactKeys(value.glass, [], ['enabled', 'preset', 'tint']) ||
      Object.keys(value.glass).length === 0
    )
      return false;
    if (value.glass.enabled !== undefined && typeof value.glass.enabled !== 'boolean') return false;
    if (value.glass.preset !== undefined && !enumValue(GLASS_PRESETS, value.glass.preset))
      return false;
    if (
      value.glass.tint !== undefined &&
      (typeof value.glass.tint !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value.glass.tint))
    )
      return false;
  }
  return true;
}

export function isGlassRegion(value: unknown): value is GlassRegion {
  if (!record(value) || !exactKeys(value, ['id', 'x', 'y', 'width', 'height', 'radii', 'role']))
    return false;
  if (
    !asciiId(value.id) ||
    !finite(value.x, -100000, 100000) ||
    !finite(value.y, -100000, 100000) ||
    !finite(value.width, 0, 100000) ||
    !finite(value.height, 0, 100000)
  )
    return false;
  if (
    !Array.isArray(value.radii) ||
    value.radii.length !== 4 ||
    !value.radii.every((item) => finite(item, 0, 512))
  )
    return false;
  return enumValue(GLASS_ROLES, value.role);
}

function isCommit(value: unknown, buffers: number): value is BufferCommit {
  return (
    record(value) &&
    exactKeys(value, ['buffer', 'generation', 'sequence', 'length']) &&
    integer(value.buffer, 0, buffers - 1) &&
    integer(value.generation, 0, 0xffffffff) &&
    integer(value.sequence, 0, 0xffffffff) &&
    integer(value.length, 0, LIMITS.maxTerminalChunkBytes)
  );
}

export function isWebToNativeMessage(value: unknown): value is WebToNativeMessage {
  if (
    !record(value) ||
    !exactKeys(value, ['v', 'type', 'payload'], ['id']) ||
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
        exactKeys(payload, ['locale', 'devicePixelRatio']) &&
        typeof payload.locale === 'string' &&
        payload.locale.length <= 32 &&
        finite(payload.devicePixelRatio, 0.5, 8)
      );
    case 'terminal.resize':
      return (
        exactKeys(payload, ['cols', 'rows']) &&
        integer(payload.cols, 2, 500) &&
        integer(payload.rows, 1, 300)
      );
    case 'terminal.input.commit':
      return isCommit(payload, 2);
    case 'terminal.output.ack':
      return isCommit(payload, 4);
    case 'glass.layout.set':
      return (
        exactKeys(payload, ['revision', 'regions']) &&
        integer(payload.revision, 0, 0xffffffff) &&
        Array.isArray(payload.regions) &&
        payload.regions.length <= LIMITS.maxGlassRegions &&
        payload.regions.every(isGlassRegion) &&
        new Set(payload.regions.map((region) => region.id)).size === payload.regions.length
      );
    case 'settings.preview':
    case 'settings.apply':
      return (
        exactKeys(payload, ['transactionId', 'patch']) &&
        asciiId(payload.transactionId) &&
        isSettingsPatch(payload.patch)
      );
    case 'settings.cancel':
      return exactKeys(payload, ['transactionId']) && asciiId(payload.transactionId);
    case 'clipboard.read':
      return exactKeys(payload, ['requestId']) && asciiId(payload.requestId);
    case 'clipboard.write':
      return (
        exactKeys(payload, ['requestId', 'text']) &&
        asciiId(payload.requestId) &&
        typeof payload.text === 'string' &&
        utf8Within(payload.text, LIMITS.maxClipboardBytes)
      );
  }
}

export function isNativeToWebMessage(value: unknown): value is NativeToWebMessage {
  if (
    !record(value) ||
    !exactKeys(value, ['v', 'type', 'payload'], ['id']) ||
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
        exactKeys(payload, ['sessionId', 'settings', 'capabilities']) &&
        asciiId(payload.sessionId) &&
        isSettings(payload.settings) &&
        record(payload.capabilities) &&
        exactKeys(payload.capabilities, [
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
        exactKeys(payload, [
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
        !exactKeys(payload, ['direction', 'buffer', 'generation', 'capacity']) ||
        (payload.direction !== 'input' && payload.direction !== 'output') ||
        !integer(payload.generation, 0, 0xffffffff) ||
        payload.capacity !== LIMITS.maxTerminalChunkBytes
      )
        return false;
      return integer(payload.buffer, 0, payload.direction === 'input' ? 1 : 3);
    }
    case 'terminal.input.ack':
      return isCommit(payload, 2);
    case 'terminal.output.ready':
      return isCommit(payload, 4);
    case 'terminal.recovered':
      return (
        exactKeys(payload, ['generation', 'droppedBytes']) &&
        integer(payload.generation, 0, 0xffffffff) &&
        integer(payload.droppedBytes, 0, Number.MAX_SAFE_INTEGER)
      );
    case 'settings.snapshot':
      return (
        exactKeys(payload, ['transactionId', 'settings']) &&
        asciiId(payload.transactionId) &&
        isSettings(payload.settings)
      );
    case 'settings.result':
      return (
        exactKeys(payload, ['transactionId', 'ok'], ['error']) &&
        asciiId(payload.transactionId) &&
        typeof payload.ok === 'boolean' &&
        (payload.error === undefined || boundedString(payload.error, 256))
      );
    case 'appearance.changed':
      return (
        exactKeys(payload, ['state'], ['reason']) &&
        enumValue(APPEARANCE_STATES, payload.state) &&
        (payload.reason === undefined || boundedString(payload.reason, 256))
      );
    case 'clipboard.result':
      return (
        exactKeys(payload, ['requestId', 'ok'], ['text', 'error']) &&
        asciiId(payload.requestId) &&
        typeof payload.ok === 'boolean' &&
        (payload.text === undefined ||
          (boundedString(payload.text, LIMITS.maxClipboardBytes) &&
            utf8Within(payload.text, LIMITS.maxClipboardBytes))) &&
        (payload.error === undefined || boundedString(payload.error, 256))
      );
    case 'drop.path':
      return exactKeys(payload, ['path']) && boundedString(payload.path, 32768);
    case 'app.notice':
      return (
        exactKeys(payload, ['level', 'message']) &&
        enumValue(['info', 'warning', 'error'] as const, payload.level) &&
        boundedString(payload.message, 1024)
      );
  }
}
