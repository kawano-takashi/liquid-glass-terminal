import { spawnSync } from 'node:child_process';
import path from 'node:path';

const forgeCli = path.resolve('node_modules/@electron-forge/cli/dist/electron-forge.js');
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Distributables can only be built on Windows x64.');
}

const result = spawnSync(process.execPath, [forgeCli, 'make'], {
  env: process.env,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
