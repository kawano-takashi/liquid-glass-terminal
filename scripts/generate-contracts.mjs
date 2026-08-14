import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { format, resolveConfig } from 'prettier';

const root = path.resolve(import.meta.dirname, '..');
const idlPath = path.join(root, 'contracts', 'protocol.idl.json');
const tsPath = path.join(root, 'contracts', 'generated', 'protocol.ts');
const cppPath = path.join(root, 'native', 'contracts', 'generated', 'Protocol.generated.h');
const idl = JSON.parse(await readFile(idlPath, 'utf8'));

const quoted = (values) => values.map((value) => `'${value}'`).join(', ');
const cppQuoted = (values) => values.map((value) => `L"${value}"`).join(', ');

const ts =
  `// Generated from contracts/protocol.idl.json. Do not edit.\n\n` +
  `export const PROTOCOL_VERSION = ${idl.version} as const;\n` +
  `export const APP_ORIGIN = '${idl.origin}' as const;\n` +
  `export const LIMITS = ${JSON.stringify(idl.limits, null, 2)} as const;\n\n` +
  `export const GLASS_ROLES = [${quoted(idl.enums.glassRole)}] as const;\n` +
  `export const GLASS_PRESETS = [${quoted(idl.enums.glassPreset)}] as const;\n` +
  `export const FOREGROUNDS = [${quoted(idl.enums.foreground)}] as const;\n` +
  `export const LOCALES = [${quoted(idl.enums.locale)}] as const;\n` +
  `export const APPEARANCE_STATES = [${quoted(idl.enums.appearanceState)}] as const;\n` +
  `export const WEB_TO_NATIVE_TYPES = [${quoted(idl.messages.webToNative)}] as const;\n` +
  `export const NATIVE_TO_WEB_TYPES = [${quoted(idl.messages.nativeToWeb)}] as const;\n\n` +
  `export type GlassRole = (typeof GLASS_ROLES)[number];\n` +
  `export type GlassPreset = (typeof GLASS_PRESETS)[number];\n` +
  `export type Foreground = (typeof FOREGROUNDS)[number];\n` +
  `export type Locale = (typeof LOCALES)[number];\n` +
  `export type AppearanceState = (typeof APPEARANCE_STATES)[number];\n` +
  `export type WebToNativeType = (typeof WEB_TO_NATIVE_TYPES)[number];\n` +
  `export type NativeToWebType = (typeof NATIVE_TO_WEB_TYPES)[number];\n\n` +
  `export interface Settings {\n` +
  `  locale: Locale;\n  glass: { enabled: boolean; preset: GlassPreset; tint: string };\n` +
  `  foreground: Foreground;\n  animations: boolean;\n  uiScale: number;\n}\n\n` +
  `export interface SettingsPatch {\n` +
  `  locale?: Locale;\n  glass?: Partial<Settings['glass']>;\n  foreground?: Foreground;\n` +
  `  animations?: boolean;\n  uiScale?: number;\n}\n\n` +
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
  `  | Envelope<'bridge.accepted', { sessionId: string; settings: Settings; capabilities: Capabilities }>\n` +
  `  | Envelope<'capabilities.changed', Capabilities>\n` +
  `  | Envelope<'terminal.buffer.attach', { direction: 'input' | 'output'; buffer: number; generation: number; capacity: number }>\n` +
  `  | Envelope<'terminal.input.ack', BufferCommit>\n` +
  `  | Envelope<'terminal.output.ready', BufferCommit>\n` +
  `  | Envelope<'terminal.recovered', { generation: number; droppedBytes: number }>\n` +
  `  | Envelope<'settings.snapshot', { transactionId: string; settings: Settings }>\n` +
  `  | Envelope<'settings.result', { transactionId: string; ok: boolean; error?: string }>\n` +
  `  | Envelope<'appearance.changed', { state: AppearanceState; reason?: string }>\n` +
  `  | Envelope<'clipboard.result', { requestId: string; ok: boolean; text?: string; error?: string }>\n` +
  `  | Envelope<'drop.path', { path: string }>\n` +
  `  | Envelope<'app.notice', { level: 'info' | 'warning' | 'error'; message: string }>;\n\n` +
  `export interface Capabilities { glass: boolean; sharedBuffers: boolean; reducedMotion: boolean; screenReader: boolean; highContrast: boolean }\n\n` +
  `const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);\n` +
  `const exactKeys = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean => {\n` +
  `  const allowed = new Set([...required, ...optional]);\n  return required.every((key) => key in value) && Object.keys(value).every((key) => allowed.has(key));\n};\n` +
  `const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;\n` +
  `const integer = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && finite(value, min, max);\n` +
  `const asciiId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(value);\n` +
  `const enumValue = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === 'string' && values.includes(value as T);\n\n` +
  `const boundedString = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;\n` +
  `const utf8Within = (value: string, max: number): boolean => new TextEncoder().encode(value).byteLength <= max;\n\n` +
  `export function isSettings(value: unknown): value is Settings {\n` +
  `  if (!record(value) || !exactKeys(value, ['locale', 'glass', 'foreground', 'animations', 'uiScale']) || !enumValue(LOCALES, value.locale) || !enumValue(FOREGROUNDS, value.foreground) || typeof value.animations !== 'boolean' || !integer(value.uiScale, 80, 200) || value.uiScale % 10 !== 0) return false;\n` +
  `  return record(value.glass) && exactKeys(value.glass, ['enabled', 'preset', 'tint']) && typeof value.glass.enabled === 'boolean' && enumValue(GLASS_PRESETS, value.glass.preset) && typeof value.glass.tint === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value.glass.tint);\n` +
  `}\n\n` +
  `export function isSettingsPatch(value: unknown): value is SettingsPatch {\n` +
  `  if (!record(value) || !exactKeys(value, [], ['locale', 'glass', 'foreground', 'animations', 'uiScale']) || Object.keys(value).length === 0) return false;\n` +
  `  if (value.locale !== undefined && !enumValue(LOCALES, value.locale)) return false;\n` +
  `  if (value.foreground !== undefined && !enumValue(FOREGROUNDS, value.foreground)) return false;\n` +
  `  if (value.animations !== undefined && typeof value.animations !== 'boolean') return false;\n` +
  `  if (value.uiScale !== undefined && (!integer(value.uiScale, 80, 200) || value.uiScale % 10 !== 0)) return false;\n` +
  `  if (value.glass !== undefined) {\n` +
  `    if (!record(value.glass) || !exactKeys(value.glass, [], ['enabled', 'preset', 'tint']) || Object.keys(value.glass).length === 0) return false;\n` +
  `    if (value.glass.enabled !== undefined && typeof value.glass.enabled !== 'boolean') return false;\n` +
  `    if (value.glass.preset !== undefined && !enumValue(GLASS_PRESETS, value.glass.preset)) return false;\n` +
  `    if (value.glass.tint !== undefined && (typeof value.glass.tint !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value.glass.tint))) return false;\n` +
  `  }\n  return true;\n}\n\n` +
  `export function isGlassRegion(value: unknown): value is GlassRegion {\n` +
  `  if (!record(value) || !exactKeys(value, ['id', 'x', 'y', 'width', 'height', 'radii', 'role'])) return false;\n` +
  `  if (!asciiId(value.id) || !finite(value.x, -100000, 100000) || !finite(value.y, -100000, 100000) || !finite(value.width, 0, 100000) || !finite(value.height, 0, 100000)) return false;\n` +
  `  if (!Array.isArray(value.radii) || value.radii.length !== 4 || !value.radii.every((item) => finite(item, 0, 512))) return false;\n` +
  `  return enumValue(GLASS_ROLES, value.role);\n}\n\n` +
  `function isCommit(value: unknown, buffers: number): value is BufferCommit {\n` +
  `  return record(value) && exactKeys(value, ['buffer', 'generation', 'sequence', 'length']) && integer(value.buffer, 0, buffers - 1) && integer(value.generation, 0, 0xffffffff) && integer(value.sequence, 0, 0xffffffff) && integer(value.length, 0, LIMITS.maxTerminalChunkBytes);\n}\n\n` +
  `export function isWebToNativeMessage(value: unknown): value is WebToNativeMessage {\n` +
  `  if (!record(value) || !exactKeys(value, ['v', 'type', 'payload'], ['id']) || value.v !== PROTOCOL_VERSION || !enumValue(WEB_TO_NATIVE_TYPES, value.type) || (value.id !== undefined && !asciiId(value.id)) || !record(value.payload)) return false;\n` +
  `  const payload = value.payload;\n  switch (value.type) {\n` +
  `    case 'bridge.ready': return exactKeys(payload, ['locale', 'devicePixelRatio']) && typeof payload.locale === 'string' && payload.locale.length <= 32 && finite(payload.devicePixelRatio, 0.5, 8);\n` +
  `    case 'terminal.resize': return exactKeys(payload, ['cols', 'rows']) && integer(payload.cols, 2, 500) && integer(payload.rows, 1, 300);\n` +
  `    case 'terminal.input.commit': return isCommit(payload, 2);\n` +
  `    case 'terminal.output.ack': return isCommit(payload, 4);\n` +
  `    case 'glass.layout.set': return exactKeys(payload, ['revision', 'regions']) && integer(payload.revision, 0, 0xffffffff) && Array.isArray(payload.regions) && payload.regions.length <= LIMITS.maxGlassRegions && payload.regions.every(isGlassRegion) && new Set(payload.regions.map((region) => region.id)).size === payload.regions.length;\n` +
  `    case 'settings.preview': case 'settings.apply': return exactKeys(payload, ['transactionId', 'patch']) && asciiId(payload.transactionId) && isSettingsPatch(payload.patch);\n` +
  `    case 'settings.cancel': return exactKeys(payload, ['transactionId']) && asciiId(payload.transactionId);\n` +
  `    case 'clipboard.read': return exactKeys(payload, ['requestId']) && asciiId(payload.requestId);\n` +
  `    case 'clipboard.write': return exactKeys(payload, ['requestId', 'text']) && asciiId(payload.requestId) && typeof payload.text === 'string' && utf8Within(payload.text, LIMITS.maxClipboardBytes);\n` +
  `  }\n}\n\n` +
  `export function isNativeToWebMessage(value: unknown): value is NativeToWebMessage {\n` +
  `  if (!record(value) || !exactKeys(value, ['v', 'type', 'payload'], ['id']) || value.v !== PROTOCOL_VERSION || !enumValue(NATIVE_TO_WEB_TYPES, value.type) || (value.id !== undefined && !asciiId(value.id)) || !record(value.payload)) return false;\n` +
  `  const payload = value.payload;\n  switch (value.type) {\n` +
  `    case 'bridge.accepted': return exactKeys(payload, ['sessionId', 'settings', 'capabilities']) && asciiId(payload.sessionId) && isSettings(payload.settings) && record(payload.capabilities) && exactKeys(payload.capabilities, ['glass', 'sharedBuffers', 'reducedMotion', 'screenReader', 'highContrast']) && typeof payload.capabilities.glass === 'boolean' && typeof payload.capabilities.sharedBuffers === 'boolean' && typeof payload.capabilities.reducedMotion === 'boolean' && typeof payload.capabilities.screenReader === 'boolean' && typeof payload.capabilities.highContrast === 'boolean';\n` +
  `    case 'capabilities.changed': return exactKeys(payload, ['glass', 'sharedBuffers', 'reducedMotion', 'screenReader', 'highContrast']) && typeof payload.glass === 'boolean' && typeof payload.sharedBuffers === 'boolean' && typeof payload.reducedMotion === 'boolean' && typeof payload.screenReader === 'boolean' && typeof payload.highContrast === 'boolean';\n` +
  `    case 'terminal.buffer.attach': {\n` +
  `      if (!exactKeys(payload, ['direction', 'buffer', 'generation', 'capacity']) || (payload.direction !== 'input' && payload.direction !== 'output') || !integer(payload.generation, 0, 0xffffffff) || payload.capacity !== LIMITS.maxTerminalChunkBytes) return false;\n` +
  `      return integer(payload.buffer, 0, payload.direction === 'input' ? 1 : 3);\n` +
  `    }\n` +
  `    case 'terminal.input.ack': return isCommit(payload, 2);\n` +
  `    case 'terminal.output.ready': return isCommit(payload, 4);\n` +
  `    case 'terminal.recovered': return exactKeys(payload, ['generation', 'droppedBytes']) && integer(payload.generation, 0, 0xffffffff) && integer(payload.droppedBytes, 0, Number.MAX_SAFE_INTEGER);\n` +
  `    case 'settings.snapshot': return exactKeys(payload, ['transactionId', 'settings']) && asciiId(payload.transactionId) && isSettings(payload.settings);\n` +
  `    case 'settings.result': return exactKeys(payload, ['transactionId', 'ok'], ['error']) && asciiId(payload.transactionId) && typeof payload.ok === 'boolean' && (payload.error === undefined || boundedString(payload.error, 256));\n` +
  `    case 'appearance.changed': return exactKeys(payload, ['state'], ['reason']) && enumValue(APPEARANCE_STATES, payload.state) && (payload.reason === undefined || boundedString(payload.reason, 256));\n` +
  `    case 'clipboard.result': return exactKeys(payload, ['requestId', 'ok'], ['text', 'error']) && asciiId(payload.requestId) && typeof payload.ok === 'boolean' && (payload.text === undefined || (boundedString(payload.text, LIMITS.maxClipboardBytes) && utf8Within(payload.text, LIMITS.maxClipboardBytes))) && (payload.error === undefined || boundedString(payload.error, 256));\n` +
  `    case 'drop.path': return exactKeys(payload, ['path']) && boundedString(payload.path, 32768);\n` +
  `    case 'app.notice': return exactKeys(payload, ['level', 'message']) && enumValue(['info', 'warning', 'error'] as const, payload.level) && boundedString(payload.message, 1024);\n` +
  `  }\n}\n`;

const allTypes = [...idl.messages.webToNative, ...idl.messages.nativeToWeb];
const cpp =
  `// Generated from contracts/protocol.idl.json. Do not edit.\n#pragma once\n\n` +
  `#include <array>\n#include <cstdint>\n#include <string_view>\n\nnamespace lgt::protocol {\n` +
  `inline constexpr std::uint32_t kVersion = ${idl.version};\n` +
  `inline constexpr std::wstring_view kAppOrigin = L"${idl.origin}";\n` +
  `inline constexpr std::size_t kMaxGlassRegions = ${idl.limits.maxGlassRegions};\n` +
  `inline constexpr std::size_t kTerminalChunkBytes = ${idl.limits.maxTerminalChunkBytes};\n` +
  `inline constexpr std::size_t kTerminalPauseBytes = ${idl.limits.maxTerminalOutstandingBytes};\n` +
  `inline constexpr std::size_t kTerminalResumeBytes = ${idl.limits.resumeTerminalBelowBytes};\n` +
  `inline constexpr std::size_t kMaxClipboardBytes = ${idl.limits.maxClipboardBytes};\n\n` +
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
