import type {
  BackdropPreviewPatch,
  ContextMenuState,
  CursorStyle,
  LocaleMode,
  RendererToPtyMessage,
  SessionCreateRequest,
  SettingsPatch,
} from './contracts';
import {
  FROST_STRENGTH_MAX,
  FROST_STRENGTH_MIN,
  GLASS_CONTRAST_MAX,
  GLASS_CONTRAST_MIN,
  GLASS_CONTRAST_STEP,
} from './settings';

const REQUEST_ID = /^[a-zA-Z0-9_-]{8,80}$/;
const SESSION_ID = /^[a-f0-9-]{20,80}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function isSessionCreateRequest(value: unknown): value is SessionCreateRequest {
  if (!isRecord(value)) return false;
  return (
    typeof value.requestId === 'string' &&
    REQUEST_ID.test(value.requestId) &&
    (value.profileId === undefined ||
      (typeof value.profileId === 'string' && value.profileId.length <= 200)) &&
    (value.cwdToken === undefined ||
      (typeof value.cwdToken === 'string' && REQUEST_ID.test(value.cwdToken))) &&
    (value.inheritFromSessionId === undefined ||
      (typeof value.inheritFromSessionId === 'string' &&
        SESSION_ID.test(value.inheritFromSessionId))) &&
    Number.isInteger(value.cols) &&
    Number(value.cols) >= 2 &&
    Number(value.cols) <= 500 &&
    Number.isInteger(value.rows) &&
    Number(value.rows) >= 2 &&
    Number(value.rows) <= 300
  );
}

export function isRendererToPtyMessage(value: unknown): value is RendererToPtyMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'input':
      return typeof value.data === 'string' && Buffer.byteLength(value.data, 'utf8') <= 65_536;
    case 'resize':
      return (
        Number.isInteger(value.cols) &&
        Number(value.cols) >= 2 &&
        Number(value.cols) <= 500 &&
        Number.isInteger(value.rows) &&
        Number(value.rows) >= 2 &&
        Number(value.rows) <= 300
      );
    case 'ack':
      return (
        Number.isSafeInteger(value.seq) &&
        Number(value.seq) > 0 &&
        Number.isSafeInteger(value.bytes) &&
        Number(value.bytes) >= 0 &&
        Number(value.bytes) <= 1_048_576
      );
    case 'cwd':
      return typeof value.uri === 'string' && value.uri.length <= 4096;
    case 'restart':
    case 'close':
      return true;
    default:
      return false;
  }
}

export function validateSettingsPatch(value: unknown): SettingsPatch | null {
  if (!isRecord(value)) return null;
  const allowed = new Set([
    'locale',
    'glassContrast',
    'frostStrength',
    'defaultProfileId',
    'fontSize',
    'cursorStyle',
    'cursorBlink',
    'bellSound',
    'scrollback',
    'warnMultilinePaste',
    'screenReaderMode',
    'firstRunHintsSeen',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;

  const patch: SettingsPatch = {};
  if (value.locale !== undefined) {
    if (typeof value.locale !== 'string' || !['system', 'en', 'ja'].includes(value.locale))
      return null;
    patch.locale = value.locale as LocaleMode;
  }
  if (value.glassContrast !== undefined) {
    const contrast = validateGlassContrast(value.glassContrast);
    if (contrast === null) return null;
    patch.glassContrast = contrast;
  }
  if (value.frostStrength !== undefined) {
    const strength = validateFrostStrength(value.frostStrength);
    if (strength === null) return null;
    patch.frostStrength = strength;
  }
  if (value.defaultProfileId !== undefined) {
    if (typeof value.defaultProfileId !== 'string' || value.defaultProfileId.length > 200)
      return null;
    patch.defaultProfileId = value.defaultProfileId;
  }
  if (value.fontSize !== undefined) {
    if (typeof value.fontSize !== 'number' || !Number.isFinite(value.fontSize)) return null;
    patch.fontSize = Math.min(32, Math.max(10, Math.round(value.fontSize)));
  }
  if (value.cursorStyle !== undefined) {
    if (
      typeof value.cursorStyle !== 'string' ||
      !['block', 'bar', 'underline'].includes(value.cursorStyle)
    )
      return null;
    patch.cursorStyle = value.cursorStyle as CursorStyle;
  }
  for (const key of [
    'cursorBlink',
    'bellSound',
    'warnMultilinePaste',
    'screenReaderMode',
    'firstRunHintsSeen',
  ] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'boolean') return null;
      patch[key] = value[key];
    }
  }
  if (value.scrollback !== undefined) {
    if (typeof value.scrollback !== 'number' || !Number.isFinite(value.scrollback)) return null;
    patch.scrollback = Math.min(1_000_000, Math.max(1_000, Math.round(value.scrollback)));
  }
  return patch;
}

export function validateGlassContrast(value: unknown): number | null {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < GLASS_CONTRAST_MIN ||
    value > GLASS_CONTRAST_MAX ||
    value % GLASS_CONTRAST_STEP !== 0
  ) {
    return null;
  }
  return value;
}

export function validateFrostStrength(value: unknown): number | null {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < FROST_STRENGTH_MIN ||
    value > FROST_STRENGTH_MAX
  ) {
    return null;
  }
  return value;
}

export function validateBackdropPreviewPatch(value: unknown): BackdropPreviewPatch | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => key !== 'glassContrast' && key !== 'frostStrength')) {
    return null;
  }
  const patch: BackdropPreviewPatch = {};
  if (value.glassContrast !== undefined) {
    const contrast = validateGlassContrast(value.glassContrast);
    if (contrast === null) return null;
    patch.glassContrast = contrast;
  }
  if (value.frostStrength !== undefined) {
    const strength = validateFrostStrength(value.frostStrength);
    if (strength === null) return null;
    patch.frostStrength = strength;
  }
  return patch;
}

export function isContextMenuState(value: unknown): value is ContextMenuState {
  return isRecord(value) && typeof value.hasSelection === 'boolean';
}

export function safeExternalUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function sanitizeTerminalTitle(value: string): string {
  const withoutControls = Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return !(code <= 0x1f || (code >= 0x7f && code <= 0x9f));
    })
    .join('');
  const stripped = withoutControls
    .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .trim();
  const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(stripped);
  return [...graphemes]
    .slice(0, 80)
    .map((item) => item.segment)
    .join('');
}

export function detectPasteRisk(text: string): {
  multiline: boolean;
  oversized: boolean;
  lines: number;
  bytes: number;
} {
  const bytes = new TextEncoder().encode(text).byteLength;
  return {
    multiline: /[\r\n]/.test(text),
    oversized: bytes > 1_048_576,
    lines: text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length,
    bytes,
  };
}

export function quotePathForShell(path: string, kind: string): string {
  if (kind === 'cmd') return `"${path.replaceAll('"', '""')}"`;
  if (kind === 'powershell' || kind === 'windows-powershell') {
    return `'${path.replaceAll("'", "''")}'`;
  }
  return `'${path.replaceAll("'", `'"'"'`)}'`;
}
