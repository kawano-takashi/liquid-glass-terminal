import { spawnSync } from 'node:child_process';
import path from 'node:path';

const cli = path.resolve('node_modules/@electron-forge/cli/dist/electron-forge.js');
const result = spawnSync(process.execPath, [cli, 'package'], {
  stdio: 'inherit',
  env: { ...process.env, LGT_E2E_BUILD: '1' },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
