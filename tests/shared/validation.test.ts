import { describe, expect, it } from 'vitest';
import {
  detectPasteRisk,
  isRendererToPtyMessage,
  isSessionCreateRequest,
  quotePathForShell,
  safeExternalUrl,
  sanitizeTerminalTitle,
  validateSettingsPatch,
} from '../../src/shared/validation';

describe('IPC validation', () => {
  it('accepts a bounded session request', () => {
    expect(
      isSessionCreateRequest({
        requestId: 'request_1234',
        profileId: 'windows:pwsh',
        cols: 120,
        rows: 40,
      }),
    ).toBe(true);
  });

  it('rejects oversized grids and input', () => {
    expect(isSessionCreateRequest({ requestId: 'request_1234', cols: 501, rows: 40 })).toBe(false);
    expect(isRendererToPtyMessage({ type: 'input', data: 'x'.repeat(70_000) })).toBe(false);
  });

  it('clamps numeric settings and rejects unknown keys', () => {
    expect(validateSettingsPatch({ fontSize: 100, scrollback: 20 })).toEqual({
      fontSize: 32,
      scrollback: 1_000,
    });
    expect(validateSettingsPatch({ nodeIntegration: true })).toBeNull();
  });
});

describe('terminal input safety', () => {
  it('allows only HTTP(S) URLs', () => {
    expect(safeExternalUrl('https://example.com/path')?.hostname).toBe('example.com');
    expect(safeExternalUrl('file:///etc/passwd')).toBeNull();
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
  });

  it('removes control and bidi characters from titles', () => {
    expect(sanitizeTerminalTitle('\u001b[31mhello\u202eworld')).toBe('[31mhelloworld');
    expect(Array.from(sanitizeTerminalTitle('a'.repeat(100)))).toHaveLength(80);
  });

  it('classifies multiline and large paste payloads', () => {
    expect(detectPasteRisk('echo one\necho two')).toMatchObject({ multiline: true, lines: 2 });
    expect(detectPasteRisk('x'.repeat(1_048_577)).oversized).toBe(true);
  });

  it('quotes dropped paths without executing them', () => {
    expect(quotePathForShell("C:\\it's here", 'powershell')).toBe("'C:\\it''s here'");
    expect(quotePathForShell('C:\\A & B', 'cmd')).toBe('"C:\\A & B"');
    expect(quotePathForShell("/tmp/it's here", 'bash')).toBe("'/tmp/it'\"'\"'s here'");
  });
});
