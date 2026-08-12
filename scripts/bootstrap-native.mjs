import { spawnSync } from 'node:child_process';
import path from 'node:path';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} ${args.join(' ')} exited with ${result.status}`);
  }
}

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is unavailable; run this script through npm.');

run(process.execPath, [path.resolve('node_modules/electron/install.js')]);

if (process.platform === 'win32') {
  run(process.execPath, [npmCli, 'rebuild', 'electron-winstaller', '--ignore-scripts=false']);
}

run(process.execPath, [
  path.resolve('node_modules/@electron/rebuild/lib/cli.js'),
  '--force',
  '--which-module',
  'node-pty',
]);

if (process.platform === 'darwin') {
  run(process.execPath, [npmCli, 'rebuild', 'fs-xattr', 'macos-alias', '--ignore-scripts=false']);
}
