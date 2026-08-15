import {
  AnsiBackgroundFilter,
  installBackgroundOscSuppression,
  writeFilteredTerminalOutput,
} from '../../web/src/terminal/AnsiBackgroundFilter';
import { describe, expect, it, vi } from 'vitest';

describe('ANSI background filter', () => {
  it('removes palette, bright palette, and inverse attributes while preserving foreground styles', () => {
    const filter = new AnsiBackgroundFilter();

    expect(filter.push('\u001b[1;31;44mwarning\u001b[0m')).toBe('\u001b[1;31mwarning\u001b[0m');
    expect(filter.push('\u001b[7;100mreversed\u001b[27m')).toBe('reversed\u001b[27m');
  });

  it('removes 256-color and truecolor backgrounds from combined SGR sequences', () => {
    const filter = new AnsiBackgroundFilter();

    expect(filter.push('\u001b[38;5;196;48;5;234mindexed')).toBe('\u001b[38;5;196mindexed');
    expect(filter.push('\u001b[1;38;2;1;2;3;48;2;4;5;6;4mtruecolor')).toBe(
      '\u001b[1;38;2;1;2;3;4mtruecolor',
    );
    expect(filter.push('\u009b48:2::4:5:6;38:5:196mcolon')).toBe('\u009b38:5:196mcolon');
  });

  it('handles ANSI sequences split across output chunks', () => {
    const filter = new AnsiBackgroundFilter();

    expect(filter.push('before\u001b[1;48;2;12;')).toBe('before');
    expect(filter.push('34;56mafter')).toBe('\u001b[1mafter');
  });

  it('keeps non-SGR terminal controls and foreground-only SGR unchanged', () => {
    const filter = new AnsiBackgroundFilter();
    const value = '\u001b[2J\u001b[?1049h\u001b[38;5;45mcyan\u001b]2;title\u0007\u001b[?1049l';

    expect(filter.push(value)).toBe(value);
  });

  it('does not leak an incomplete sequence across a recovered terminal session', () => {
    const filter = new AnsiBackgroundFilter();

    expect(filter.push('\u001b[48;2;')).toBe('');
    filter.reset();
    expect(filter.push('1;2;3mnew session')).toBe('1;2;3mnew session');
  });

  it('installs and disposes background OSC suppressors', () => {
    const handlers = new Map<number, (data: string) => boolean>();
    const dispose = vi.fn();
    const parser = {
      registerOscHandler(identifier: number, handler: (data: string) => boolean) {
        handlers.set(identifier, handler);
        return { dispose };
      },
    };

    const disposeAll = installBackgroundOscSuppression(parser);

    expect(handlers.get(11)?.('?#fff')).toBe(true);
    expect(handlers.get(111)?.('')).toBe(true);
    disposeAll();
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it('acknowledges output even when filtering removes the whole chunk', () => {
    const filter = new AnsiBackgroundFilter();
    const writes: string[] = [];
    const acknowledge = vi.fn();
    const commit = { buffer: 0, generation: 1, sequence: 2, length: 7 };
    const terminal = {
      write(value: string, callback: () => void) {
        writes.push(value);
        callback();
      },
    };

    writeFilteredTerminalOutput(terminal, filter, '\u001b[44m', commit, acknowledge);

    expect(writes).toEqual([]);
    expect(acknowledge).toHaveBeenCalledWith(commit);
  });
});
