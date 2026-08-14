import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { root } from './lib/native-toolchain.mjs';

const executable = path.join(
  root,
  'build',
  'package',
  'LiquidGlassTerminal',
  'LiquidGlassTerminal.exe',
);
const args = [];
const child = spawn(executable, args, {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, LGT_SMOKE_TEST: '1' },
});
let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += String(chunk);
});

const result = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve({ running: child.exitCode === null }), 5_000);
  child.once('exit', (code, signal) => {
    clearTimeout(timer);
    resolve({ running: false, code, signal });
  });
});

if (child.exitCode === null) {
  spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
}

if (!result.running) {
  throw new Error(
    `Packaged process exited during smoke test: ${JSON.stringify(result)}\n${stderr}`,
  );
}
console.log(`Packaged process remained healthy for 5 seconds: ${executable}`);
