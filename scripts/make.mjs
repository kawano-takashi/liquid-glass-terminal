import { spawnSync } from 'node:child_process';
import path from 'node:path';

const forgeCli = path.resolve('node_modules/@electron-forge/cli/dist/electron-forge.js');
const attempts = process.platform === 'darwin' && process.env.CI ? 2 : 1;
let exitCode = 1;

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const result = spawnSync(process.execPath, [forgeCli, 'make'], {
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  exitCode = result.status ?? 1;
  if (exitCode === 0) process.exit(0);
  if (attempt < attempts) {
    console.warn(`macOS make attempt ${attempt}/${attempts} failed; retrying in 3 seconds.`);
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
}

process.exit(exitCode);
