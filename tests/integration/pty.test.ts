import { describe, expect, it } from 'vitest';

const native = process.env.LGT_NATIVE_TESTS === '1' ? describe : describe.skip;

native('node-pty integration', () => {
  it('spawns, echoes input, resizes, and exits', async () => {
    const pty = await import('node-pty');
    const windows = process.platform === 'win32';
    const executable = windows
      ? (process.env.ComSpec ?? 'cmd.exe')
      : (process.env.SHELL ?? '/bin/bash');
    const args = windows ? ['/Q'] : ['--noprofile', '--norc'];
    const terminal = pty.spawn(executable, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: process.env,
    });
    const marker = `LGT_${Date.now()}`;
    let output = '';
    const seen = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`PTY output timeout: ${output}`)), 10_000);
      terminal.onData((data) => {
        output += data;
        if (output.includes(marker)) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    terminal.resize(100, 30);
    terminal.write(windows ? `echo ${marker}\r` : `printf '${marker}\\n'\r`);
    await seen;
    expect(output).toContain(marker);
    terminal.kill();
  });
});
