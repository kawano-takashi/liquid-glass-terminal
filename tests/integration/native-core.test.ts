import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const enabled = process.env.LGT_NATIVE_TESTS === '1';

describe.skipIf(!enabled)('native core integration', () => {
  it('passes strict settings, quoting, clipboard, material, and real ConPTY checks', () => {
    const executable = path.resolve(
      'build',
      'native',
      'Debug',
      'LiquidGlassTerminal.NativeTests.exe',
    );
    expect(existsSync(executable), 'run npm run bootstrap:native first').toBe(true);
    const result = spawnSync(executable, [], {
      env: { ...process.env, LGT_NATIVE_TESTS: '1' },
      encoding: 'utf8',
      timeout: 20_000,
      windowsHide: true,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('Native core tests passed.');
  }, 25_000);
});
