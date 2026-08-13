import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nativeRoot = path.join(root, 'native', 'windows-glass');
const distRoot = path.join(nativeRoot, 'dist');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, WINAPP_CLI_TELEMETRY_OPTOUT: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} ${args.join(' ')} exited with ${result.status}`);
  }
}

async function removePreviouslyStagedRuntime() {
  const electronRoot = path.join(root, 'node_modules', 'electron', 'dist');
  const marker = path.join(electronRoot, '.liquid-glass-windows-runtime.json');
  let record;
  try {
    record = JSON.parse(await readFile(marker, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  if (!Array.isArray(record.files)) {
    throw new Error('The staged Windows runtime marker has an invalid format.');
  }
  for (const file of record.files) {
    if (typeof file !== 'string' || path.basename(file) !== file) {
      throw new Error('The staged Windows runtime marker contains an invalid path.');
    }
    await rm(path.join(electronRoot, file), { force: true });
  }
  await rm(marker, { force: true });
}

if (process.platform !== 'win32') {
  throw new Error('The Windows frosted-backdrop addon can only be built on Windows.');
}

const arch = process.env.npm_config_arch ?? process.arch;
if (arch !== 'x64') throw new Error(`The Windows glass addon currently supports x64, not ${arch}.`);

const winappCli = path.join(root, 'node_modules', '@microsoft', 'winappcli', 'dist', 'cli.js');
const nodeGyp = path.join(root, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

await removePreviouslyStagedRuntime();
run(process.execPath, [winappCli, 'restore']);
await rm(distRoot, { recursive: true, force: true });
await mkdir(distRoot, { recursive: true });
run(process.execPath, [
  nodeGyp,
  'rebuild',
  `--directory=${nativeRoot}`,
  `--target=${manifest.devDependencies.electron}`,
  `--arch=${arch}`,
  '--dist-url=https://electronjs.org/headers',
  '--release',
]);

await copyFile(
  path.join(nativeRoot, 'build', 'Release', 'windows_glass.node'),
  path.join(distRoot, 'windows-glass.node'),
);

console.log('Built Windows frosted-backdrop addon.');
