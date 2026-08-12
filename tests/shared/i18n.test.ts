import { describe, expect, it } from 'vitest';
import { formatMessage, messages, resolveLocale } from '../../src/shared/i18n';

describe('localization', () => {
  it('keeps English and Japanese dictionaries structurally identical', () => {
    expect(Object.keys(messages.ja).sort()).toEqual(Object.keys(messages.en).sort());
  });

  it('resolves system locales and interpolates values', () => {
    expect(resolveLocale('system', 'ja-JP')).toBe('ja');
    expect(resolveLocale('system', 'fr-FR')).toBe('en');
    expect(formatMessage('en', 'exitBody', { count: 3 })).toContain('3');
  });
});
