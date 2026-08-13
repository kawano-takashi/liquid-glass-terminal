export type ClipboardTarget = 'terminal' | 'editable' | 'blocked';
export type ClipboardAction = 'copy' | 'paste';

export interface ClipboardKeyInput {
  key: string;
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

function isMacCommand(input: ClipboardKeyInput): boolean {
  return input.meta && !input.control && !input.shift && !input.alt;
}

function isControlCommand(input: ClipboardKeyInput): boolean {
  return input.control && !input.meta && !input.alt;
}

export function clipboardActionForTarget(
  platform: NodeJS.Platform,
  input: ClipboardKeyInput,
  target: ClipboardTarget,
  terminalHasSelection: boolean,
): ClipboardAction | undefined {
  if (target === 'blocked') return undefined;

  const key = input.key.toLowerCase();
  if (platform === 'darwin') {
    if (!isMacCommand(input)) return undefined;
    if (key === 'c') return 'copy';
    if (key === 'v') return 'paste';
    return undefined;
  }

  if (!isControlCommand(input)) return undefined;
  if (key === 'c' && !input.shift) {
    return target === 'editable' || terminalHasSelection ? 'copy' : undefined;
  }
  if (key === 'v' && (target === 'editable' || input.shift)) return 'paste';
  return undefined;
}

export function isApplicationClipboardAccelerator(
  platform: NodeJS.Platform,
  input: ClipboardKeyInput,
): boolean {
  const key = input.key.toLowerCase();
  if (platform === 'darwin') {
    return isMacCommand(input) && (key === 'c' || key === 'v');
  }
  if (!isControlCommand(input)) return false;
  return (key === 'c' && !input.shift) || (key === 'v' && input.shift);
}
