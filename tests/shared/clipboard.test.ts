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
  it('preserves terminal control keys unless the application owns the shortcut', () => {
    const copy = key('c', { control: true });
    const paste = key('v', { control: true });
    const terminalPaste = key('v', { control: true, shift: true });

    expect(clipboardActionForTarget(copy, 'terminal', false)).toBeUndefined();
    expect(clipboardActionForTarget(copy, 'terminal', true)).toBe('copy');
    expect(clipboardActionForTarget(paste, 'terminal', false)).toBeUndefined();
    expect(clipboardActionForTarget(terminalPaste, 'terminal', false)).toBe('paste');
  });

  it('uses standard copy and paste keys in editable controls', () => {
    expect(clipboardActionForTarget(key('c', { control: true }), 'editable', false)).toBe('copy');
    expect(clipboardActionForTarget(key('v', { control: true }), 'editable', false)).toBe('paste');
    expect(
      clipboardActionForTarget(key('v', { control: true, shift: true }), 'editable', false),
    ).toBe('paste');
  });

  it('does not handle clipboard keys for blocked targets or extra modifiers', () => {
    expect(clipboardActionForTarget(key('v', { control: true }), 'blocked', false)).toBeUndefined();
    expect(clipboardActionForTarget(key('v', { meta: true }), 'editable', false)).toBeUndefined();
    expect(
      clipboardActionForTarget(
        key('v', { control: true, shift: true, alt: true }),
        'terminal',
        false,
      ),
    ).toBeUndefined();
  });
});

describe('isApplicationClipboardAccelerator', () => {
  it('matches only the accelerators registered by the application menu', () => {
    expect(isApplicationClipboardAccelerator(key('c', { control: true }))).toBe(true);
    expect(isApplicationClipboardAccelerator(key('v', { control: true, shift: true }))).toBe(true);

    expect(isApplicationClipboardAccelerator(key('v', { control: true }))).toBe(false);
    expect(isApplicationClipboardAccelerator(key('v', { meta: true }))).toBe(false);
  });
});
