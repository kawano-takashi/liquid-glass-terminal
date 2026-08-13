import { spawnSync } from 'node:child_process';
import path from 'node:path';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} ${args.join(' ')} exited with ${result.status}`);
  }
}

async function runWithRetries(command, args, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      run(command, args);
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      const delay = attempt * 2_000;
      console.warn(`Attempt ${attempt}/${attempts} failed; retrying in ${delay}ms.`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is unavailable; run this script through npm.');
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Native bootstrap requires Windows x64.');
}

await runWithRetries(process.execPath, [path.resolve('node_modules/electron/install.js')]);

run(process.execPath, [npmCli, 'rebuild', 'electron-winstaller', '--ignore-scripts=false']);

run(process.execPath, [
  path.resolve('node_modules/@electron/rebuild/lib/cli.js'),
  '--force',
  '--which-module',
  'node-pty',
]);

run(process.execPath, [path.resolve('scripts/build-windows-glass.mjs')]);
