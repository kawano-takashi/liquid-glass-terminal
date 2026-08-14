import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { format, resolveConfig } from 'prettier';

const root = path.resolve(import.meta.dirname, '..');
const idlPath = path.join(root, 'contracts', 'protocol.idl.json');
const tsPath = path.join(root, 'contracts', 'generated', 'protocol.ts');
const cppPath = path.join(root, 'native', 'contracts', 'generated', 'Protocol.generated.h');
const idl = JSON.parse(await readFile(idlPath, 'utf8'));

const invariant = (condition, message) => {
  if (!condition) throw new Error(`Invalid protocol IDL: ${message}`);
};
const integer = (value) => Number.isInteger(value);
const exactKeys = (value, expected) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join('\0') === [...expected].sort().join('\0');
const exactValues = (value, expected) =>
  Array.isArray(value) &&
  value.length === expected.length &&
  [...value].sort().join('\0') === [...expected].sort().join('\0');
const quoted = (values) => values.map((value) => `'${value}'`).join(', ');
const cppQuoted = (values) => values.map((value) => `L"${value}"`).join(', ');
const pascal = (value) =>
  value
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
const cppEnumMember = (value) =>
  value === 'en' ? 'English' : value === 'ja' ? 'Japanese' : pascal(value);
const cppFloat = (value) => `${Number(value).toFixed(Number.isInteger(value) ? 1 : 3)}F`;
const tsTypeForSetting = (name, value) => {
  if (name === 'locale') return 'Locale';
  if (name === 'foreground') return 'Foreground';
  if (name === 'glass') return 'GlassSettings';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  throw new Error(`Invalid protocol IDL: unsupported settings field ${name}`);
};

invariant(integer(idl.version) && idl.version > 0, 'version must be a positive integer');
invariant(typeof idl.origin === 'string', 'origin must be a string');
invariant(
  exactKeys(idl.uiMetrics, ['titlebarHeightDip', 'captionButtonWidthDip']),
  'uiMetrics must contain only titlebarHeightDip and captionButtonWidthDip',
);
invariant(
  integer(idl.uiMetrics.titlebarHeightDip) && idl.uiMetrics.titlebarHeightDip > 0,
  'titlebarHeightDip must be a positive integer',
);
invariant(
  integer(idl.uiMetrics.captionButtonWidthDip) && idl.uiMetrics.captionButtonWidthDip > 0,
  'captionButtonWidthDip must be a positive integer',
);

const settingsIdl = idl.settings;
invariant(settingsIdl && typeof settingsIdl === 'object', 'settings metadata is required');
invariant(
  settingsIdl.defaults && typeof settingsIdl.defaults === 'object',
  'settings defaults are required',
);
invariant(
  settingsIdl.defaults.glass && typeof settingsIdl.defaults.glass === 'object',
  'glass defaults are required',
);
const settingsRootNames = Object.keys(settingsIdl.defaults);
const glassSettingNames = Object.keys(settingsIdl.defaults.glass);
const settingNames = Object.keys(settingsIdl.constraints);
const glassValueNames = glassSettingNames.filter((name) => name in settingsIdl.constraints);
const rootConstrainedNames = settingsRootNames.filter((name) => name in settingsIdl.constraints);
const unconstrainedGlassNames = glassSettingNames.filter(
  (name) => !(name in settingsIdl.constraints),
);
invariant(
  exactKeys(settingsIdl.defaults, ['locale', 'glass', 'foreground', 'animations', 'uiScale']),
  'settings defaults have unexpected keys',
);
invariant(
  exactKeys(settingsIdl.defaults.glass, ['enabled', 'frostThickness', 'opacity', 'tone', 'grain']),
  'glass defaults have unexpected keys',
);
invariant(
  unconstrainedGlassNames.length === 1 &&
    typeof settingsIdl.defaults.glass[unconstrainedGlassNames[0]] === 'boolean',
  'glass must have exactly one unconstrained boolean setting',
);
invariant(
  settingNames.length === glassValueNames.length + rootConstrainedNames.length,
  'every numeric constraint must describe a settings default',
);
invariant(
  integer(settingsIdl.schemaVersion) && settingsIdl.schemaVersion > 0,
  'settings schemaVersion must be a positive integer',
);
for (const name of settingNames) {
  const constraint = settingsIdl.constraints[name];
  invariant(
    exactKeys(constraint, ['minimum', 'maximum', 'step']) &&
      integer(constraint.minimum) &&
      integer(constraint.maximum) &&
      integer(constraint.step) &&
      constraint.minimum <= constraint.maximum &&
      constraint.step > 0,
    `${name} constraint is invalid`,
  );
  const defaultValue =
    name in settingsIdl.defaults.glass
      ? settingsIdl.defaults.glass[name]
      : settingsIdl.defaults[name];
  invariant(
    integer(defaultValue) &&
      defaultValue >= constraint.minimum &&
      defaultValue <= constraint.maximum &&
      (defaultValue - constraint.minimum) % constraint.step === 0,
    `${name} default is outside its constraint`,
  );
}
invariant(
  Array.isArray(settingsIdl.frostBlurDips) &&
    settingsIdl.frostBlurDips.length === settingsIdl.constraints.frostThickness.maximum + 1 &&
    settingsIdl.frostBlurDips.every((value) => integer(value) && value >= 0),
  'frostBlurDips must cover every frostThickness index',
);
invariant(
  typeof settingsIdl.grainMaximumOpacity === 'number' &&
    settingsIdl.grainMaximumOpacity >= 0 &&
    settingsIdl.grainMaximumOpacity <= 1,
  'grainMaximumOpacity must be between zero and one',
);
invariant(idl.enums.locale.includes(settingsIdl.defaults.locale), 'default locale is invalid');
invariant(
  idl.enums.foreground.includes(settingsIdl.defaults.foreground),
  'default foreground is invalid',
);
invariant(
  typeof settingsIdl.defaults.glass.enabled === 'boolean',
  'default glass enabled must be boolean',
);
invariant(
  typeof settingsIdl.defaults.animations === 'boolean',
  'default animations must be boolean',
);

const presetNames = Object.keys(settingsIdl.presets);
invariant(
  presetNames.length > 0 && exactValues(idl.enums.glassPreset, presetNames),
  'preset names must exactly match glassPreset',
);
for (const [presetName, preset] of Object.entries(settingsIdl.presets)) {
  invariant(exactKeys(preset, glassValueNames), `${presetName} preset has unexpected keys`);
  for (const name of glassValueNames) {
    const constraint = settingsIdl.constraints[name];
    invariant(
      integer(preset[name]) &&
        preset[name] >= constraint.minimum &&
        preset[name] <= constraint.maximum &&
        (preset[name] - constraint.minimum) % constraint.step === 0,
      `${presetName}.${name} is outside its constraint`,
    );
  }
}

const windowStateIdl = idl.windowState;
invariant(
  windowStateIdl && integer(windowStateIdl.schemaVersion) && windowStateIdl.schemaVersion > 0,
  'windowState schemaVersion must be a positive integer',
);
invariant(
  exactKeys(windowStateIdl.defaults, ['x', 'y', 'width', 'height', 'maximized']) &&
    integer(windowStateIdl.defaults.x) &&
    integer(windowStateIdl.defaults.y) &&
    integer(windowStateIdl.defaults.width) &&
    integer(windowStateIdl.defaults.height) &&
    typeof windowStateIdl.defaults.maximized === 'boolean',
  'windowState defaults are invalid',
);
invariant(
  exactKeys(windowStateIdl.constraints, ['minimumWidth', 'minimumHeight', 'maximumExtent']) &&
    integer(windowStateIdl.constraints.minimumWidth) &&
    integer(windowStateIdl.constraints.minimumHeight) &&
    integer(windowStateIdl.constraints.maximumExtent) &&
    windowStateIdl.defaults.width >= windowStateIdl.constraints.minimumWidth &&
    windowStateIdl.defaults.height >= windowStateIdl.constraints.minimumHeight &&
    windowStateIdl.defaults.width <= windowStateIdl.constraints.maximumExtent &&
    windowStateIdl.defaults.height <= windowStateIdl.constraints.maximumExtent,
  'windowState constraints are invalid',
);

invariant(
  exactValues(idl.enums.settingsOperation, ['preview', 'apply', 'cancel']),
  'settingsOperation must contain exactly preview, apply, and cancel',
);

const tsGlassValueFields = glassValueNames.map((name) => `  ${name}: number;`).join('\n');
const tsGlassSettingFields = unconstrainedGlassNames
  .map((name) => `  ${name}: ${tsTypeForSetting(name, settingsIdl.defaults.glass[name])};`)
  .join('\n');
const tsSettingsFields = settingsRootNames
  .map((name) => `  ${name}: ${tsTypeForSetting(name, settingsIdl.defaults[name])};`)
  .join('\n');
const tsSettingsPatchFields = settingsRootNames
  .map(
    (name) =>
      `  ${name}?: ${name === 'glass' ? 'Partial<GlassSettings>' : tsTypeForSetting(name, settingsIdl.defaults[name])};`,
  )
  .join('\n');
const tsSettingValidator = (owner, name, value) => {
  if (name === 'locale') return `enumValue(LOCALES, ${owner}.${name})`;
  if (name === 'foreground') return `enumValue(FOREGROUNDS, ${owner}.${name})`;
  if (typeof value === 'boolean') return `typeof ${owner}.${name} === 'boolean'`;
  if (typeof value === 'number') return `validConstrainedField('${name}', ${owner}.${name})`;
  throw new Error(`Invalid protocol IDL: unsupported validator for ${name}`);
};
const tsSettingsValidators = settingsRootNames
  .filter((name) => name !== 'glass')
  .map((name) => tsSettingValidator('value', name, settingsIdl.defaults[name]))
  .join(' && ');
const tsGlassValidators = glassSettingNames
  .map((name) => tsSettingValidator('value.glass', name, settingsIdl.defaults.glass[name]))
  .join(' && ');
const tsSettingsPatchValidators = settingsRootNames
  .filter((name) => name !== 'glass')
  .map(
    (name) =>
      `  if (value.${name} !== undefined && !(${tsSettingValidator('value', name, settingsIdl.defaults[name])})) return false;`,
  )
  .join('\n');
const tsGlassPatchValidators = glassSettingNames
  .map(
    (name) =>
      `    if (value.glass.${name} !== undefined && !(${tsSettingValidator('value.glass', name, settingsIdl.defaults.glass[name])})) return false;`,
  )
  .join('\n');

const ts =
  `// Generated from contracts/protocol.idl.json. Do not edit.\n\n` +
  `export const PROTOCOL_VERSION = ${idl.version} as const;\n` +
  `export const APP_ORIGIN = '${idl.origin}' as const;\n` +
  `export const UI_METRICS = ${JSON.stringify(idl.uiMetrics, null, 2)} as const;\n` +
  `export const SETTINGS_SCHEMA_VERSION = ${settingsIdl.schemaVersion} as const;\n` +
  `export const WINDOW_STATE_SCHEMA_VERSION = ${windowStateIdl.schemaVersion} as const;\n` +
  `export const SETTINGS_CONSTRAINTS = ${JSON.stringify(settingsIdl.constraints, null, 2)} as const;\n` +
  `export const SETTINGS_KEYS = [${quoted(settingsRootNames)}] as const;\n` +
  `export const GLASS_SETTING_KEYS = [${quoted(glassSettingNames)}] as const;\n` +
  `export const GLASS_VALUE_KEYS = [${quoted(glassValueNames)}] as const;\n` +
  `export const FROST_BLUR_DIPS = ${JSON.stringify(settingsIdl.frostBlurDips)} as const;\n` +
  `export const GRAIN_MAXIMUM_OPACITY = ${settingsIdl.grainMaximumOpacity} as const;\n` +
  `export const LIMITS = ${JSON.stringify(idl.limits, null, 2)} as const;\n\n` +
  `export const GLASS_ROLES = [${quoted(idl.enums.glassRole)}] as const;\n` +
  `export const GLASS_PRESET_NAMES = [${quoted(presetNames)}] as const;\n` +
  `export const SETTINGS_OPERATIONS = [${quoted(idl.enums.settingsOperation)}] as const;\n` +
  `export const FOREGROUNDS = [${quoted(idl.enums.foreground)}] as const;\n` +
  `export const LOCALES = [${quoted(idl.enums.locale)}] as const;\n` +
  `export const APPEARANCE_STATES = [${quoted(idl.enums.appearanceState)}] as const;\n` +
  `export const WEB_TO_NATIVE_TYPES = [${quoted(idl.messages.webToNative)}] as const;\n` +
  `export const NATIVE_TO_WEB_TYPES = [${quoted(idl.messages.nativeToWeb)}] as const;\n\n` +
  `export type GlassRole = (typeof GLASS_ROLES)[number];\n` +
  `export type GlassPreset = (typeof GLASS_PRESET_NAMES)[number];\n` +
  `export type SettingsOperation = (typeof SETTINGS_OPERATIONS)[number];\n` +
  `export type Foreground = (typeof FOREGROUNDS)[number];\n` +
  `export type Locale = (typeof LOCALES)[number];\n` +
  `export type AppearanceState = (typeof APPEARANCE_STATES)[number];\n` +
  `export type WebToNativeType = (typeof WEB_TO_NATIVE_TYPES)[number];\n` +
  `export type NativeToWebType = (typeof NATIVE_TO_WEB_TYPES)[number];\n\n` +
  `export interface GlassValues {\n${tsGlassValueFields}\n}\n` +
  `export interface GlassSettings extends GlassValues {\n${tsGlassSettingFields}\n}\n` +
  `export interface Settings {\n${tsSettingsFields}\n}\n\n` +
  `export interface SettingsPatch {\n${tsSettingsPatchFields}\n}\n\n` +
  `export interface WindowRuntimeState { maximized: boolean; fullscreen: boolean; active: boolean }\n\n` +
  `export interface PersistedWindowState { x: number; y: number; width: number; height: number; maximized: boolean }\n` +
  `export const DEFAULT_PERSISTED_WINDOW_STATE = ${JSON.stringify(windowStateIdl.defaults, null, 2)} as const satisfies PersistedWindowState;\n\n` +
  `export const GLASS_PRESETS = ${JSON.stringify(settingsIdl.presets, null, 2)} as const satisfies Record<GlassPreset, GlassValues>;\n` +
  `export const DEFAULT_SETTINGS = ${JSON.stringify(settingsIdl.defaults, null, 2)} as const satisfies Settings;\n\n` +
  `export interface GlassRegion {\n` +
  `  id: string;\n  x: number;\n  y: number;\n  width: number;\n  height: number;\n` +
  `  radii: readonly [number, number, number, number];\n  role: GlassRole;\n}\n\n` +
  `export interface Envelope<TType extends string = string, TPayload = unknown> {\n` +
  `  v: typeof PROTOCOL_VERSION;\n  type: TType;\n  id?: string;\n  payload: TPayload;\n}\n\n` +
  `export type WebToNativeMessage =\n` +
  `  | Envelope<'bridge.ready', { locale: string; devicePixelRatio: number }>\n` +
  `  | Envelope<'terminal.resize', { cols: number; rows: number }>\n` +
  `  | Envelope<'terminal.input.commit', BufferCommit>\n` +
  `  | Envelope<'terminal.output.ack', BufferCommit>\n` +
  `  | Envelope<'glass.layout.set', { revision: number; regions: GlassRegion[] }>\n` +
  `  | Envelope<'settings.preview', { transactionId: string; patch: SettingsPatch }>\n` +
  `  | Envelope<'settings.apply', { transactionId: string; patch: SettingsPatch }>\n` +
  `  | Envelope<'settings.cancel', { transactionId: string }>\n` +
  `  | Envelope<'clipboard.read', { requestId: string }>\n` +
  `  | Envelope<'clipboard.write', { requestId: string; text: string }>;\n\n` +
  `export interface BufferCommit { buffer: number; generation: number; sequence: number; length: number }\n\n` +
  `export type NativeToWebMessage =\n` +
  `  | Envelope<'bridge.accepted', { sessionId: string; settings: Settings; capabilities: Capabilities; windowState: WindowRuntimeState }>\n` +
  `  | Envelope<'capabilities.changed', Capabilities>\n` +
  `  | Envelope<'terminal.buffer.attach', { direction: 'input' | 'output'; buffer: number; generation: number; capacity: number }>\n` +
  `  | Envelope<'terminal.input.ack', BufferCommit>\n` +
  `  | Envelope<'terminal.output.ready', BufferCommit>\n` +
  `  | Envelope<'terminal.recovered', { generation: number; droppedBytes: number }>\n` +
  `  | Envelope<'settings.snapshot', { transactionId: string; settings: Settings }>\n` +
  `  | Envelope<'settings.result', { transactionId: string; operation: SettingsOperation; ok: boolean; error?: string }>\n` +
  `  | Envelope<'appearance.changed', { state: AppearanceState; reason?: string }>\n` +
  `  | Envelope<'window.state.changed', WindowRuntimeState>\n` +
  `  | Envelope<'clipboard.result', { requestId: string; ok: boolean; text?: string; error?: string }>\n` +
  `  | Envelope<'drop.path', { path: string }>\n` +
  `  | Envelope<'app.notice', { level: 'info' | 'warning' | 'error'; message: string }>;\n\n` +
  `export interface Capabilities { glass: boolean; sharedBuffers: boolean; reducedMotion: boolean; screenReader: boolean; highContrast: boolean }\n\n` +
  `const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);\n` +
  `const exactObjectKeys = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean => {\n` +
  `  const allowed = new Set([...required, ...optional]);\n  return required.every((key) => key in value) && Object.keys(value).every((key) => allowed.has(key));\n};\n` +
  `const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;\n` +
  `const integerInRange = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && finite(value, min, max);\n` +
  `const constrainedInteger = (value: unknown, constraint: { minimum: number; maximum: number; step: number }): value is number => integerInRange(value, constraint.minimum, constraint.maximum) && (value - constraint.minimum) % constraint.step === 0;\n` +
  `const asciiId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(value);\n` +
  `const enumValue = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === 'string' && values.includes(value as T);\n\n` +
  `const boundedString = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;\n` +
  `const utf8Within = (value: string, max: number): boolean => new TextEncoder().encode(value).byteLength <= max;\n\n` +
  `const validConstrainedField = (name: keyof typeof SETTINGS_CONSTRAINTS, value: unknown): value is number => constrainedInteger(value, SETTINGS_CONSTRAINTS[name]);\n\n` +
  `export function toneToChannel(tone: number): number { return Math.floor((tone * 255 + 50) / 100); }\n` +
  `export function toneToHex(tone: number): string { const channel = toneToChannel(tone).toString(16).padStart(2, '0').toUpperCase(); return \`#\${channel}\${channel}\${channel}\`; }\n` +
  `export function frostBlurDip(frostThickness: number): number { return FROST_BLUR_DIPS[frostThickness] ?? FROST_BLUR_DIPS[DEFAULT_SETTINGS.glass.frostThickness]; }\n` +
  `export function grainOpacity(grain: number): number { return (grain / SETTINGS_CONSTRAINTS.grain.maximum) * GRAIN_MAXIMUM_OPACITY; }\n` +
  `export function resolveGlassPreset(glass: GlassSettings): GlassPreset | 'custom' { for (const name of GLASS_PRESET_NAMES) { const value = GLASS_PRESETS[name]; if (GLASS_VALUE_KEYS.every((field) => value[field] === glass[field])) return name; } return 'custom'; }\n\n` +
  `export function isSettings(value: unknown): value is Settings {\n` +
  `  if (!record(value) || !exactObjectKeys(value, SETTINGS_KEYS) || !(${tsSettingsValidators})) return false;\n` +
  `  return record(value.glass) && exactObjectKeys(value.glass, GLASS_SETTING_KEYS) && ${tsGlassValidators};\n` +
  `}\n\n` +
  `export function isSettingsPatch(value: unknown): value is SettingsPatch {\n` +
  `  if (!record(value) || !exactObjectKeys(value, [], SETTINGS_KEYS) || Object.keys(value).length === 0) return false;\n` +
  `${tsSettingsPatchValidators}\n` +
  `  if (value.glass !== undefined) {\n` +
  `    if (!record(value.glass) || !exactObjectKeys(value.glass, [], GLASS_SETTING_KEYS) || Object.keys(value.glass).length === 0) return false;\n` +
  `${tsGlassPatchValidators}\n` +
  `  }\n  return true;\n}\n\n` +
  `export function isWindowRuntimeState(value: unknown): value is WindowRuntimeState {\n` +
  `  return record(value) && exactObjectKeys(value, ['maximized', 'fullscreen', 'active']) && typeof value.maximized === 'boolean' && typeof value.fullscreen === 'boolean' && typeof value.active === 'boolean';\n` +
  `}\n\n` +
  `export function isGlassRegion(value: unknown): value is GlassRegion {\n` +
  `  if (!record(value) || !exactObjectKeys(value, ['id', 'x', 'y', 'width', 'height', 'radii', 'role'])) return false;\n` +
  `  if (!asciiId(value.id) || !finite(value.x, -100000, 100000) || !finite(value.y, -100000, 100000) || !finite(value.width, 0, 100000) || !finite(value.height, 0, 100000)) return false;\n` +
  `  if (!Array.isArray(value.radii) || value.radii.length !== 4 || !value.radii.every((item) => finite(item, 0, 512))) return false;\n` +
  `  return enumValue(GLASS_ROLES, value.role);\n}\n\n` +
  `function isCommit(value: unknown, buffers: number): value is BufferCommit {\n` +
  `  return record(value) && exactObjectKeys(value, ['buffer', 'generation', 'sequence', 'length']) && integerInRange(value.buffer, 0, buffers - 1) && integerInRange(value.generation, 0, 0xffffffff) && integerInRange(value.sequence, 0, 0xffffffff) && integerInRange(value.length, 0, LIMITS.maxTerminalChunkBytes);\n}\n\n` +
  `export function isWebToNativeMessage(value: unknown): value is WebToNativeMessage {\n` +
  `  if (!record(value) || !exactObjectKeys(value, ['v', 'type', 'payload'], ['id']) || value.v !== PROTOCOL_VERSION || !enumValue(WEB_TO_NATIVE_TYPES, value.type) || (value.id !== undefined && !asciiId(value.id)) || !record(value.payload)) return false;\n` +
  `  const payload = value.payload;\n  switch (value.type) {\n` +
  `    case 'bridge.ready': return exactObjectKeys(payload, ['locale', 'devicePixelRatio']) && typeof payload.locale === 'string' && payload.locale.length <= 32 && finite(payload.devicePixelRatio, 0.5, 8);\n` +
  `    case 'terminal.resize': return exactObjectKeys(payload, ['cols', 'rows']) && integerInRange(payload.cols, 2, 500) && integerInRange(payload.rows, 1, 300);\n` +
  `    case 'terminal.input.commit': return isCommit(payload, 2);\n` +
  `    case 'terminal.output.ack': return isCommit(payload, 4);\n` +
  `    case 'glass.layout.set': return exactObjectKeys(payload, ['revision', 'regions']) && integerInRange(payload.revision, 0, 0xffffffff) && Array.isArray(payload.regions) && payload.regions.length <= LIMITS.maxGlassRegions && payload.regions.every(isGlassRegion) && new Set(payload.regions.map((region) => region.id)).size === payload.regions.length;\n` +
  `    case 'settings.preview': case 'settings.apply': return exactObjectKeys(payload, ['transactionId', 'patch']) && asciiId(payload.transactionId) && isSettingsPatch(payload.patch);\n` +
  `    case 'settings.cancel': return exactObjectKeys(payload, ['transactionId']) && asciiId(payload.transactionId);\n` +
  `    case 'clipboard.read': return exactObjectKeys(payload, ['requestId']) && asciiId(payload.requestId);\n` +
  `    case 'clipboard.write': return exactObjectKeys(payload, ['requestId', 'text']) && asciiId(payload.requestId) && typeof payload.text === 'string' && utf8Within(payload.text, LIMITS.maxClipboardBytes);\n` +
  `  }\n}\n\n` +
  `export function isNativeToWebMessage(value: unknown): value is NativeToWebMessage {\n` +
  `  if (!record(value) || !exactObjectKeys(value, ['v', 'type', 'payload'], ['id']) || value.v !== PROTOCOL_VERSION || !enumValue(NATIVE_TO_WEB_TYPES, value.type) || (value.id !== undefined && !asciiId(value.id)) || !record(value.payload)) return false;\n` +
  `  const payload = value.payload;\n  switch (value.type) {\n` +
  `    case 'bridge.accepted': return exactObjectKeys(payload, ['sessionId', 'settings', 'capabilities', 'windowState']) && asciiId(payload.sessionId) && isSettings(payload.settings) && isWindowRuntimeState(payload.windowState) && record(payload.capabilities) && exactObjectKeys(payload.capabilities, ['glass', 'sharedBuffers', 'reducedMotion', 'screenReader', 'highContrast']) && typeof payload.capabilities.glass === 'boolean' && typeof payload.capabilities.sharedBuffers === 'boolean' && typeof payload.capabilities.reducedMotion === 'boolean' && typeof payload.capabilities.screenReader === 'boolean' && typeof payload.capabilities.highContrast === 'boolean';\n` +
  `    case 'capabilities.changed': return exactObjectKeys(payload, ['glass', 'sharedBuffers', 'reducedMotion', 'screenReader', 'highContrast']) && typeof payload.glass === 'boolean' && typeof payload.sharedBuffers === 'boolean' && typeof payload.reducedMotion === 'boolean' && typeof payload.screenReader === 'boolean' && typeof payload.highContrast === 'boolean';\n` +
  `    case 'terminal.buffer.attach': {\n` +
  `      if (!exactObjectKeys(payload, ['direction', 'buffer', 'generation', 'capacity']) || (payload.direction !== 'input' && payload.direction !== 'output') || !integerInRange(payload.generation, 0, 0xffffffff) || payload.capacity !== LIMITS.maxTerminalChunkBytes) return false;\n` +
  `      return integerInRange(payload.buffer, 0, payload.direction === 'input' ? 1 : 3);\n` +
  `    }\n` +
  `    case 'terminal.input.ack': return isCommit(payload, 2);\n` +
  `    case 'terminal.output.ready': return isCommit(payload, 4);\n` +
  `    case 'terminal.recovered': return exactObjectKeys(payload, ['generation', 'droppedBytes']) && integerInRange(payload.generation, 0, 0xffffffff) && integerInRange(payload.droppedBytes, 0, Number.MAX_SAFE_INTEGER);\n` +
  `    case 'settings.snapshot': return exactObjectKeys(payload, ['transactionId', 'settings']) && asciiId(payload.transactionId) && isSettings(payload.settings);\n` +
  `    case 'settings.result': return exactObjectKeys(payload, ['transactionId', 'operation', 'ok'], ['error']) && asciiId(payload.transactionId) && enumValue(SETTINGS_OPERATIONS, payload.operation) && typeof payload.ok === 'boolean' && (payload.error === undefined || boundedString(payload.error, 256));\n` +
  `    case 'appearance.changed': return exactObjectKeys(payload, ['state'], ['reason']) && enumValue(APPEARANCE_STATES, payload.state) && (payload.reason === undefined || boundedString(payload.reason, 256));\n` +
  `    case 'window.state.changed': return isWindowRuntimeState(payload);\n` +
  `    case 'clipboard.result': return exactObjectKeys(payload, ['requestId', 'ok'], ['text', 'error']) && asciiId(payload.requestId) && typeof payload.ok === 'boolean' && (payload.text === undefined || (boundedString(payload.text, LIMITS.maxClipboardBytes) && utf8Within(payload.text, LIMITS.maxClipboardBytes))) && (payload.error === undefined || boundedString(payload.error, 256));\n` +
  `    case 'drop.path': return exactObjectKeys(payload, ['path']) && boundedString(payload.path, 32768);\n` +
  `    case 'app.notice': return exactObjectKeys(payload, ['level', 'message']) && enumValue(['info', 'warning', 'error'] as const, payload.level) && boundedString(payload.message, 1024);\n` +
  `  }\n}\n`;

const cppEnum = (name, values) =>
  `enum class ${name} { ${values.map(cppEnumMember).join(', ')} };\n`;
const cppToString = (name, values) =>
  `constexpr std::wstring_view ToString(${name} value) noexcept {\n  switch (value) {\n${values
    .map((value) => `    case ${name}::${cppEnumMember(value)}: return L"${value}";`)
    .join('\n')}\n  }\n  return {};\n}\n`;
const cppParse = (name, values) =>
  `constexpr std::optional<${name}> Parse${name}(std::wstring_view value) noexcept {\n${values
    .map((value) => `  if (value == L"${value}") return ${name}::${cppEnumMember(value)};`)
    .join('\n')}\n  return std::nullopt;\n}\n`;
const cppConstraint = (name) => {
  const constraint = settingsIdl.constraints[name];
  return `inline constexpr NumericConstraint k${pascal(name)}Constraint{${constraint.minimum}, ${constraint.maximum}, ${constraint.step}};`;
};
const cppBoolean = (value) => (value ? 'true' : 'false');
const cppGlassValues = (value) => `{${glassValueNames.map((name) => value[name]).join(', ')}}`;
const cppDefault = settingsIdl.defaults;
const cppGlassValueFields = glassValueNames.map((name) => `  std::uint32_t ${name};`).join('\n');
const cppGlassSettingFields = glassSettingNames
  .map((name) => {
    const value = cppDefault.glass[name];
    return typeof value === 'boolean'
      ? `  bool ${name} = ${cppBoolean(value)};`
      : `  std::uint32_t ${name} = ${value};`;
  })
  .join('\n');
const cppSettingsFields = settingsRootNames
  .map((name) => {
    const value = cppDefault[name];
    if (name === 'locale') return `  Locale locale = Locale::${cppEnumMember(value)};`;
    if (name === 'foreground')
      return `  Foreground foreground = Foreground::${cppEnumMember(value)};`;
    if (name === 'glass') return '  GlassSettings glass{};';
    if (typeof value === 'boolean') return `  bool ${name} = ${cppBoolean(value)};`;
    if (typeof value === 'number') return `  std::uint32_t ${name} = ${value};`;
    throw new Error(`Invalid protocol IDL: unsupported C++ settings field ${name}`);
  })
  .join('\n');
const cppGlassValueValidation = glassValueNames
  .map((name) => `IsValid(value.${name}, k${pascal(name)}Constraint)`)
  .join(' && ');
const cppSettingsValidation = settingsRootNames
  .filter((name) => typeof cppDefault[name] !== 'boolean')
  .map((name) => {
    if (name === 'locale' || name === 'foreground' || name === 'glass') {
      return `IsValid(value.${name})`;
    }
    return `IsValid(value.${name}, k${pascal(name)}Constraint)`;
  })
  .join(' && ');
const cppPresets = presetNames
  .map(
    (name) =>
      `inline constexpr GlassValues k${pascal(name)}GlassPreset${cppGlassValues(settingsIdl.presets[name])};`,
  )
  .join('\n');
const cppPresetArray = presetNames
  .map((name) => `    {GlassPreset::${cppEnumMember(name)}, k${pascal(name)}GlassPreset}`)
  .join(',\n');

const allTypes = [...idl.messages.webToNative, ...idl.messages.nativeToWeb];
const cpp =
  `// Generated from contracts/protocol.idl.json. Do not edit.\n#pragma once\n\n` +
  `#include <array>\n#include <compare>\n#include <cstdint>\n#include <optional>\n#include <string_view>\n\nnamespace lgt::protocol {\n` +
  `inline constexpr std::uint32_t kVersion = ${idl.version};\n` +
  `inline constexpr std::uint32_t kSettingsSchemaVersion = ${settingsIdl.schemaVersion};\n` +
  `inline constexpr std::uint32_t kWindowStateSchemaVersion = ${windowStateIdl.schemaVersion};\n` +
  `inline constexpr std::wstring_view kAppOrigin = L"${idl.origin}";\n` +
  `inline constexpr std::uint32_t kTitlebarHeightDip = ${idl.uiMetrics.titlebarHeightDip};\n` +
  `inline constexpr std::uint32_t kCaptionButtonWidthDip = ${idl.uiMetrics.captionButtonWidthDip};\n` +
  `inline constexpr std::size_t kMaxGlassRegions = ${idl.limits.maxGlassRegions};\n` +
  `inline constexpr std::size_t kTerminalChunkBytes = ${idl.limits.maxTerminalChunkBytes};\n` +
  `inline constexpr std::size_t kTerminalPauseBytes = ${idl.limits.maxTerminalOutstandingBytes};\n` +
  `inline constexpr std::size_t kTerminalResumeBytes = ${idl.limits.resumeTerminalBelowBytes};\n` +
  `inline constexpr std::size_t kMaxClipboardBytes = ${idl.limits.maxClipboardBytes};\n` +
  `inline constexpr float kGrainMaximumOpacity = ${cppFloat(settingsIdl.grainMaximumOpacity)};\n\n` +
  cppEnum('GlassPreset', presetNames) +
  cppEnum('SettingsOperation', idl.enums.settingsOperation) +
  cppEnum('Foreground', idl.enums.foreground) +
  cppEnum('Locale', idl.enums.locale) +
  `\n` +
  cppToString('GlassPreset', presetNames) +
  `\n` +
  cppToString('SettingsOperation', idl.enums.settingsOperation) +
  `\n` +
  cppToString('Foreground', idl.enums.foreground) +
  `\n` +
  cppToString('Locale', idl.enums.locale) +
  `\n` +
  cppParse('GlassPreset', presetNames) +
  `\n` +
  cppParse('SettingsOperation', idl.enums.settingsOperation) +
  `\n` +
  cppParse('Foreground', idl.enums.foreground) +
  `\n` +
  cppParse('Locale', idl.enums.locale) +
  `\nstruct NumericConstraint { std::uint32_t minimum; std::uint32_t maximum; std::uint32_t step; };\n` +
  settingNames.map(cppConstraint).join('\n') +
  `\n\ninline constexpr std::array<std::wstring_view, ${settingsRootNames.length}> kSettingsKeys{${cppQuoted(settingsRootNames)}};\n` +
  `inline constexpr std::array<std::wstring_view, ${glassSettingNames.length}> kGlassSettingKeys{${cppQuoted(glassSettingNames)}};\n` +
  `inline constexpr std::array<std::wstring_view, ${glassValueNames.length}> kGlassValueKeys{${cppQuoted(glassValueNames)}};\n` +
  `inline constexpr std::array<float, ${settingsIdl.frostBlurDips.length}> kFrostBlurDips{${settingsIdl.frostBlurDips.map(cppFloat).join(', ')}};\n\n` +
  `struct GlassValues {\n${cppGlassValueFields}\n  auto operator<=>(const GlassValues&) const = default;\n};\n\n` +
  `struct GlassSettings {\n${cppGlassSettingFields}\n  auto operator<=>(const GlassSettings&) const = default;\n};\n\n` +
  `${cppPresets}\n\n` +
  `struct GlassPresetDefinition { GlassPreset name; GlassValues values; };\n` +
  `inline constexpr std::array<GlassPresetDefinition, ${presetNames.length}> kGlassPresets{{\n${cppPresetArray}\n}};\n\n` +
  `struct Settings {\n${cppSettingsFields}\n  auto operator<=>(const Settings&) const = default;\n};\n\n` +
  `inline constexpr Settings kDefaultSettings{};\n\n` +
  `struct WindowRuntimeState {\n  bool maximized = false;\n  bool fullscreen = false;\n  bool active = true;\n  auto operator<=>(const WindowRuntimeState&) const = default;\n};\n\n` +
  `struct PersistedWindowState {\n  int x = ${windowStateIdl.defaults.x};\n  int y = ${windowStateIdl.defaults.y};\n  int width = ${windowStateIdl.defaults.width};\n  int height = ${windowStateIdl.defaults.height};\n  bool maximized = ${windowStateIdl.defaults.maximized};\n  auto operator<=>(const PersistedWindowState&) const = default;\n};\n` +
  `inline constexpr PersistedWindowState kDefaultPersistedWindowState{};\n` +
  `inline constexpr int kMinimumWindowWidth = ${windowStateIdl.constraints.minimumWidth};\n` +
  `inline constexpr int kMinimumWindowHeight = ${windowStateIdl.constraints.minimumHeight};\n` +
  `inline constexpr int kMaximumWindowExtent = ${windowStateIdl.constraints.maximumExtent};\n\n` +
  `constexpr bool IsValid(std::uint32_t value, NumericConstraint constraint) noexcept { return value >= constraint.minimum && value <= constraint.maximum && (value - constraint.minimum) % constraint.step == 0; }\n` +
  `constexpr bool IsValid(const GlassValues& value) noexcept { return ${cppGlassValueValidation}; }\n` +
  `constexpr bool IsValid(const GlassSettings& value) noexcept { return IsValid(GlassValues{${glassValueNames.map((name) => `value.${name}`).join(', ')}}); }\n` +
  `constexpr bool IsValid(Locale value) noexcept { return !ToString(value).empty(); }\n` +
  `constexpr bool IsValid(Foreground value) noexcept { return !ToString(value).empty(); }\n` +
  `constexpr bool IsValid(const Settings& value) noexcept { return ${cppSettingsValidation}; }\n` +
  `constexpr std::uint32_t ToneChannel(std::uint32_t tone) noexcept { return (tone * 255U + 50U) / 100U; }\n` +
  `constexpr std::uint32_t ToneRgb(std::uint32_t tone) noexcept { const auto channel = ToneChannel(tone); return (channel << 16U) | (channel << 8U) | channel; }\n` +
  `constexpr float FrostBlurDip(std::uint32_t frostThickness) noexcept { return frostThickness < kFrostBlurDips.size() ? kFrostBlurDips[frostThickness] : kFrostBlurDips[kDefaultSettings.glass.frostThickness]; }\n` +
  `constexpr float GrainOpacity(std::uint32_t grain) noexcept { return static_cast<float>(grain) / static_cast<float>(kGrainConstraint.maximum) * kGrainMaximumOpacity; }\n\n` +
  `inline constexpr std::array<std::wstring_view, ${idl.messages.webToNative.length}> kWebToNativeTypes{${cppQuoted(idl.messages.webToNative)}};\n` +
  `inline constexpr std::array<std::wstring_view, ${idl.messages.nativeToWeb.length}> kNativeToWebTypes{${cppQuoted(idl.messages.nativeToWeb)}};\n` +
  `inline constexpr std::array<std::wstring_view, ${allTypes.length}> kAllTypes{${cppQuoted(allTypes)}};\n\n` +
  `constexpr bool Contains(const auto& values, std::wstring_view value) noexcept {\n  for (const auto candidate : values) if (candidate == value) return true;\n  return false;\n}\n` +
  `constexpr bool IsWebToNative(std::wstring_view value) noexcept { return Contains(kWebToNativeTypes, value); }\n` +
  `constexpr bool IsNativeToWeb(std::wstring_view value) noexcept { return Contains(kNativeToWebTypes, value); }\n` +
  `}  // namespace lgt::protocol\n`;

async function update(file, contents) {
  if (process.argv.includes('--check')) {
    let existing = '';
    try {
      existing = await readFile(file, 'utf8');
    } catch {
      // A missing generated file is reported as stale below.
    }
    if (existing !== contents) {
      console.error(`${path.relative(root, file)} is stale. Run npm run contracts:generate.`);
      process.exitCode = 1;
    }
    return;
  }
  await writeFile(file, contents, 'utf8');
}

const prettierConfig = (await resolveConfig(tsPath)) ?? {};
const formattedTs = await format(ts, { ...prettierConfig, filepath: tsPath });
await Promise.all([update(tsPath, formattedTs), update(cppPath, cpp)]);
if (!process.argv.includes('--check'))
  console.log('Generated TypeScript and C++ protocol contracts.');
