export type ClipboardTarget = 'terminal' | 'editable' | 'blocked';
export type ClipboardAction = 'copy' | 'paste';

export interface ClipboardKeyInput {
  key: string;
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

function isControlCommand(input: ClipboardKeyInput): boolean {
  return input.control && !input.meta && !input.alt;
}

export function clipboardActionForTarget(
  input: ClipboardKeyInput,
  target: ClipboardTarget,
  terminalHasSelection: boolean,
): ClipboardAction | undefined {
  if (target === 'blocked') return undefined;

  const key = input.key.toLowerCase();
  if (!isControlCommand(input)) return undefined;
  if (key === 'c' && !input.shift) {
    return target === 'editable' || terminalHasSelection ? 'copy' : undefined;
  }
  if (key === 'v' && (target === 'editable' || input.shift)) return 'paste';
  return undefined;
}

export function isApplicationClipboardAccelerator(input: ClipboardKeyInput): boolean {
  const key = input.key.toLowerCase();
  if (!isControlCommand(input)) return false;
  return (key === 'c' && !input.shift) || (key === 'v' && input.shift);
}
