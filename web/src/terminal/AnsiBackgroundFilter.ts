import type { BufferCommit } from '../../../contracts/generated/protocol';

const ESC = '\u001b';
const BEL = '\u0007';
const CSI = '\u009b';
const OSC = '\u009d';
const ST = '\u009c';
const MAX_CSI_LENGTH = 4096;

type ParserState =
  | { kind: 'text' }
  | { kind: 'escape'; sequence: string }
  | { kind: 'csi'; sequence: string }
  | { kind: 'discard-csi' }
  | { kind: 'string'; sequence: string; terminatorPending: boolean };

function codePoint(value: string): number {
  return value.codePointAt(0) ?? 0;
}

function isEscapeFinal(value: string): boolean {
  const point = codePoint(value);
  return point >= 0x30 && point <= 0x7e;
}

function isCsiFinal(value: string): boolean {
  const point = codePoint(value);
  return point >= 0x40 && point <= 0x7e;
}

function isBackgroundPalette(value: number): boolean {
  return (value >= 40 && value <= 47) || (value >= 100 && value <= 107);
}

function numericParameter(value: string): number | undefined {
  if (value === '') return 0;
  if (!/^\d+$/.test(value)) return undefined;
  return Number(value);
}

function isColonBackgroundParameter(value: string): boolean {
  const parts = value.split(':');
  const color = numericParameter(parts[0] ?? '');
  if (color === undefined) return false;
  if (isBackgroundPalette(color)) return true;
  if (color !== 48) return false;
  const mode = numericParameter(parts[1] ?? '');
  return mode === undefined || mode === 2 || mode === 5;
}

function filterSgrParameters(parameters: string): string | undefined {
  const tokens = parameters.split(';');
  const kept: string[] = [];
  let removed = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const value = numericParameter(token);

    if (value === 7 || (value !== undefined && isBackgroundPalette(value))) {
      removed = true;
      continue;
    }

    if (value === 48) {
      removed = true;
      const mode = numericParameter(tokens[index + 1] ?? '');
      if (mode === 2) index += 4;
      else if (mode === 5) index += 2;
      else if (mode !== undefined) index += 1;
      continue;
    }

    if (value === 38 || value === 58) {
      const mode = numericParameter(tokens[index + 1] ?? '');
      const count = mode === 2 ? 5 : mode === 5 ? 3 : 1;
      kept.push(...tokens.slice(index, index + count));
      index += count - 1;
      continue;
    }

    if (isColonBackgroundParameter(token)) {
      removed = true;
      continue;
    }

    kept.push(token);
  }

  return removed ? kept.join(';') : undefined;
}

function filterCsi(sequence: string): string {
  const final = sequence.at(-1);
  if (final !== 'm') return sequence;

  const prefixLength = sequence.startsWith(`${ESC}[`) ? 2 : sequence.startsWith(CSI) ? 1 : 0;
  const parameters = sequence.slice(prefixLength, -1);
  const filtered = filterSgrParameters(parameters);
  if (filtered === undefined) return sequence;
  if (filtered === '') return '';
  return `${sequence.slice(0, prefixLength)}${filtered}${final}`;
}

export class AnsiBackgroundFilter {
  #state: ParserState = { kind: 'text' };

  push(input: string): string {
    const output: string[] = [];
    for (const character of input) this.#consume(character, output);
    return output.join('');
  }

  reset(): void {
    this.#state = { kind: 'text' };
  }

  #consume(character: string, output: string[]): void {
    switch (this.#state.kind) {
      case 'text':
        this.#consumeText(character);
        if (this.#state.kind === 'text') output.push(character);
        return;
      case 'escape':
        this.#consumeEscape(character, output);
        return;
      case 'csi':
        this.#consumeCsi(character, output);
        return;
      case 'discard-csi':
        this.#consumeDiscardedCsi(character);
        return;
      case 'string':
        this.#consumeString(character, output);
        return;
    }
  }

  #consumeText(character: string): void {
    if (character === ESC) {
      this.#state = { kind: 'escape', sequence: ESC };
    } else if (character === CSI) {
      this.#state = { kind: 'csi', sequence: CSI };
    } else if (character === OSC) {
      this.#state = { kind: 'string', sequence: OSC, terminatorPending: false };
    }
  }

  #consumeEscape(character: string, output: string[]): void {
    const state = this.#state;
    if (state.kind !== 'escape') return;
    const sequence = `${state.sequence}${character}`;
    if (character === ESC) {
      output.push(state.sequence);
      this.#state = { kind: 'escape', sequence: ESC };
      return;
    }
    if (character === CSI) {
      output.push(state.sequence.slice(0, -1));
      this.#state = { kind: 'csi', sequence: CSI };
      return;
    }
    if (character === OSC) {
      output.push(state.sequence.slice(0, -1));
      this.#state = { kind: 'string', sequence: OSC, terminatorPending: false };
      return;
    }
    if (character === '[') {
      this.#state = { kind: 'csi', sequence };
      return;
    }
    if (
      character === ']' ||
      character === 'P' ||
      character === '^' ||
      character === '_' ||
      character === 'X'
    ) {
      this.#state = { kind: 'string', sequence, terminatorPending: false };
      return;
    }
    if (isEscapeFinal(character)) {
      output.push(sequence);
      this.#state = { kind: 'text' };
      return;
    }
    this.#state = { kind: 'escape', sequence };
  }

  #consumeCsi(character: string, output: string[]): void {
    const state = this.#state;
    if (state.kind !== 'csi') return;
    if (character === ESC) {
      output.push(state.sequence);
      this.#state = { kind: 'escape', sequence: ESC };
      return;
    }
    const sequence = `${state.sequence}${character}`;
    if (isCsiFinal(character)) {
      output.push(filterCsi(sequence));
      this.#state = { kind: 'text' };
      return;
    }
    if (sequence.length > MAX_CSI_LENGTH) {
      this.#state = { kind: 'discard-csi' };
      return;
    }
    this.#state = { kind: 'csi', sequence };
  }

  #consumeDiscardedCsi(character: string): void {
    if (character === ESC) {
      this.#state = { kind: 'escape', sequence: ESC };
    } else if (isCsiFinal(character)) {
      this.#state = { kind: 'text' };
    }
  }

  #consumeString(character: string, output: string[]): void {
    const state = this.#state;
    if (state.kind !== 'string') return;
    const sequence = `${state.sequence}${character}`;
    if (state.terminatorPending) {
      if (character === '\\') {
        output.push(sequence);
        this.#state = { kind: 'text' };
      } else {
        this.#state = {
          kind: 'string',
          sequence,
          terminatorPending: character === ESC,
        };
      }
      return;
    }
    if (character === BEL || character === ST) {
      output.push(sequence);
      this.#state = { kind: 'text' };
    } else {
      this.#state = {
        kind: 'string',
        sequence,
        terminatorPending: character === ESC,
      };
    }
  }
}

export interface OscParser {
  registerOscHandler(identifier: number, handler: (data: string) => boolean): { dispose(): void };
}

export function installBackgroundOscSuppression(parser: OscParser): () => void {
  const handlers = [
    parser.registerOscHandler(11, () => true),
    parser.registerOscHandler(111, () => true),
  ];
  return () => handlers.forEach((handler) => handler.dispose());
}

export interface TerminalOutputWriter {
  write(value: string, callback: () => void): void;
}

export function writeFilteredTerminalOutput(
  terminal: TerminalOutputWriter,
  filter: AnsiBackgroundFilter,
  value: string,
  commit: BufferCommit,
  acknowledge: (commit: BufferCommit) => void,
): void {
  const filtered = filter.push(value);
  if (filtered.length === 0) {
    acknowledge(commit);
    return;
  }
  terminal.write(filtered, () => acknowledge(commit));
}
