import { describe, expect, it } from 'vitest';
import {
  clipboardActionForTarget,
  isApplicationClipboardAccelerator,
  type ClipboardKeyInput,
} from '../../src/shared/clipboard';

function key(
  value: string,
  modifiers: Partial<Omit<ClipboardKeyInput, 'key'>> = {},
): ClipboardKeyInput {
  return {
    key: value,
    control: false,
    meta: false,
    shift: false,
    alt: false,
    ...modifiers,
  };
}

describe('clipboardActionForTarget', () => {
  it('preserves terminal control keys on Windows and Linux', () => {
    const copy = key('c', { control: true });
    const paste = key('v', { control: true });
    const terminalPaste = key('v', { control: true, shift: true });

    expect(clipboardActionForTarget('win32', copy, 'terminal', false)).toBeUndefined();
    expect(clipboardActionForTarget('linux', copy, 'terminal', true)).toBe('copy');
    expect(clipboardActionForTarget('win32', paste, 'terminal', false)).toBeUndefined();
    expect(clipboardActionForTarget('linux', terminalPaste, 'terminal', false)).toBe('paste');
  });

  it('uses standard copy and paste keys in editable controls', () => {
    expect(clipboardActionForTarget('win32', key('c', { control: true }), 'editable', false)).toBe(
      'copy',
    );
    expect(clipboardActionForTarget('linux', key('v', { control: true }), 'editable', false)).toBe(
      'paste',
    );
    expect(
      clipboardActionForTarget(
        'win32',
        key('v', { control: true, shift: true }),
        'editable',
        false,
      ),
    ).toBe('paste');
  });

  it('uses Command shortcuts on macOS while preserving Control+C', () => {
    expect(clipboardActionForTarget('darwin', key('c', { meta: true }), 'terminal', false)).toBe(
      'copy',
    );
    expect(clipboardActionForTarget('darwin', key('v', { meta: true }), 'editable', false)).toBe(
      'paste',
    );
    expect(
      clipboardActionForTarget('darwin', key('c', { control: true }), 'terminal', true),
    ).toBeUndefined();
  });

  it('does not handle clipboard keys for blocked targets or extra modifiers', () => {
    expect(
      clipboardActionForTarget('darwin', key('v', { meta: true }), 'blocked', false),
    ).toBeUndefined();
    expect(
      clipboardActionForTarget(
        'win32',
        key('v', { control: true, shift: true, alt: true }),
        'terminal',
        false,
      ),
    ).toBeUndefined();
  });
});

describe('isApplicationClipboardAccelerator', () => {
  it('matches only the accelerators registered by the application menu', () => {
    expect(isApplicationClipboardAccelerator('darwin', key('c', { meta: true }))).toBe(true);
    expect(isApplicationClipboardAccelerator('darwin', key('v', { meta: true }))).toBe(true);
    expect(isApplicationClipboardAccelerator('win32', key('c', { control: true }))).toBe(true);
    expect(
      isApplicationClipboardAccelerator('linux', key('v', { control: true, shift: true })),
    ).toBe(true);

    expect(isApplicationClipboardAccelerator('win32', key('v', { control: true }))).toBe(false);
    expect(isApplicationClipboardAccelerator('darwin', key('v', { meta: true, shift: true }))).toBe(
      false,
    );
  });
});
