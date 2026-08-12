import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CwdTokenVault, parseLaunchRequest } from '../../src/main/cli';

describe('--cwd parsing', () => {
  it('resolves an existing relative directory against the caller cwd', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'lgt-cli-'));
    expect(parseLaunchRequest(['electron', '--cwd', '.'], directory)).toEqual({
      cwd: directory,
      invalidCwd: false,
    });
  });

  it('falls back when the path is invalid or missing', () => {
    expect(parseLaunchRequest(['electron', '--cwd'], process.cwd())).toEqual({ invalidCwd: true });
    expect(parseLaunchRequest(['electron', '--cwd', '__missing__'], process.cwd())).toEqual({
      invalidCwd: true,
    });
  });

  it('issues one-use cwd tokens', () => {
    const vault = new CwdTokenVault();
    const token = vault.issue('C:\\work');
    expect(vault.consume(token)).toBe('C:\\work');
    expect(vault.consume(token)).toBeUndefined();
  });
});
