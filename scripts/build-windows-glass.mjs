import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nativeRoot = path.join(root, 'native', 'windows-glass');
const distRoot = path.join(nativeRoot, 'dist');
const runtimeRoot = path.join(distRoot, 'runtime');
const runtimeAliases = [
  {
    source: 'wuceffectsi.dll',
    target: 'Microsoft.UI.Composition.SystemBackdrops.dll',
  },
];

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

async function copyDirectoryFiles(source, destination, files) {
  await mkdir(destination, { recursive: true });
  for (const file of files) await copyFile(path.join(source, file), path.join(destination, file));
}

async function stageRuntime(arch) {
  const lock = JSON.parse(await readFile(path.join(root, '.winapp', 'winmds.lock.json'), 'utf8'));
  if (typeof lock.nuget_cache_dir !== 'string' || !Array.isArray(lock.packages)) {
    throw new Error('The winapp restore lockfile has an unsupported format.');
  }

  const runtimePackages = [
    'Microsoft.WindowsAppSDK.Foundation',
    'Microsoft.WindowsAppSDK.InteractiveExperiences',
  ];
  const sdk = lock.packages.find(
    (candidate) => candidate.name?.toLowerCase() === 'microsoft.windowsappsdk',
  );
  if (!sdk || typeof sdk.version !== 'string') {
    throw new Error('winapp restore did not resolve Microsoft.WindowsAppSDK.');
  }
  const staged = new Map();
  const components = {};
  for (const packageName of runtimePackages) {
    const entry = lock.packages.find(
      (candidate) => candidate.name?.toLowerCase() === packageName.toLowerCase(),
    );
    if (!entry || typeof entry.version !== 'string') {
      throw new Error(`winapp restore did not resolve ${packageName}.`);
    }
    components[packageName] = entry.version;
    const source = path.join(
      lock.nuget_cache_dir,
      packageName.toLowerCase(),
      entry.version,
      'runtimes-framework',
      `win-${arch}`,
      'native',
    );
    const files = (await readdir(source, { withFileTypes: true }))
      .filter((item) => item.isFile())
      .map((item) => item.name)
      .sort();
    if (files.length === 0) throw new Error(`No self-contained runtime files found in ${source}.`);
    for (const file of files) {
      const key = file.toLowerCase();
      if (staged.has(key)) throw new Error(`Duplicate Windows App SDK runtime file: ${file}`);
      staged.set(key, { file, source, sourceFile: file });
    }
  }

  for (const alias of runtimeAliases) {
    const source = staged.get(alias.source.toLowerCase());
    if (!source)
      throw new Error(`Windows App SDK runtime alias source is missing: ${alias.source}`);
    const key = alias.target.toLowerCase();
    if (staged.has(key)) throw new Error(`Duplicate Windows App SDK runtime file: ${alias.target}`);
    staged.set(key, { file: alias.target, source: source.source, sourceFile: source.sourceFile });
  }

  await mkdir(runtimeRoot, { recursive: true });
  for (const { file, source, sourceFile } of staged.values()) {
    await copyFile(path.join(source, sourceFile), path.join(runtimeRoot, file));
  }

  const files = [];
  for (const { file } of staged.values()) {
    files.push({ name: file, bytes: (await stat(path.join(runtimeRoot, file))).size });
  }
  const manifest = {
    schemaVersion: 1,
    architecture: arch,
    windowsAppSdk: sdk.version,
    components,
    files,
  };
  await writeFile(
    path.join(distRoot, 'runtime-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  const sdkPackageRoot = path.join(lock.nuget_cache_dir, 'microsoft.windowsappsdk', sdk.version);
  await copyFile(path.join(sdkPackageRoot, 'license.txt'), path.join(distRoot, 'LICENSE.txt'));
  await copyFile(path.join(sdkPackageRoot, 'NOTICE.txt'), path.join(distRoot, 'NOTICE.txt'));
  return files.map(({ name }) => name);
}

async function stageDevelopmentRuntime(files) {
  const electronRoot = path.join(root, 'node_modules', 'electron', 'dist');
  await copyDirectoryFiles(runtimeRoot, electronRoot, files);
  await writeFile(
    path.join(electronRoot, '.liquid-glass-windows-runtime.json'),
    `${JSON.stringify({ files }, null, 2)}\n`,
    'utf8',
  );
}

if (process.platform !== 'win32') {
  throw new Error('The Windows Acrylic addon can only be built on Windows.');
}

const arch = process.env.npm_config_arch ?? process.arch;
if (arch !== 'x64') throw new Error(`The Windows glass addon currently supports x64, not ${arch}.`);

const winappCli = path.join(root, 'node_modules', '@microsoft', 'winappcli', 'dist', 'cli.js');
const nodeGyp = path.join(root, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

run(process.execPath, [winappCli, 'restore']);
await rm(distRoot, { recursive: true, force: true });
await mkdir(distRoot, { recursive: true });
const runtimeFiles = await stageRuntime(arch);
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
if (process.argv.includes('--stage-electron')) await stageDevelopmentRuntime(runtimeFiles);

console.log(`Built Windows Acrylic addon and staged ${runtimeFiles.length} runtime files.`);
