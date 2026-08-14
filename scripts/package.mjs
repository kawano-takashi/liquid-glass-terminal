import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root, run } from './lib/native-toolchain.mjs';

const e2e = process.argv.includes('--e2e');
const packageRoot = path.join(root, 'build', e2e ? 'package-e2e' : 'package');
const stage = path.join(packageRoot, 'LiquidGlassTerminal');

run(process.execPath, [path.join(root, 'scripts', 'generate-contracts.mjs'), '--check']);
run(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build']);
run(process.execPath, [
  path.join(root, 'scripts', 'build-native.mjs'),
  '--configuration',
  'Release',
  ...(e2e ? ['--e2e'] : []),
]);

await rm(packageRoot, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await cp(
  path.join(root, 'build', 'native', 'Release', 'LiquidGlassTerminal.exe'),
  path.join(stage, 'LiquidGlassTerminal.exe'),
);
await cp(path.join(root, 'build', 'web'), path.join(stage, 'web'), { recursive: true });
await cp(path.join(root, 'LICENSE'), path.join(stage, 'LICENSE'));
await cp(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(stage, 'THIRD_PARTY_NOTICES.md'));

const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await writeFile(
  path.join(stage, 'package-metadata.json'),
  `${JSON.stringify(
    {
      name: manifest.productName,
      version: manifest.version,
      platform: 'win32',
      architecture: 'x64',
      webView2: 'evergreen',
      testOnly: e2e,
    },
    null,
    2,
  )}\n`,
);
if (e2e) {
  await writeFile(path.join(stage, 'E2E-ONLY.json'), '{"testOnly":true,"releaseArtifact":false}\n');
}

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(absolute)));
    else result.push(absolute);
  }
  return result;
}

const hashes = {};
for (const file of (await files(stage)).sort()) {
  const relative = path.relative(stage, file).split(path.sep).join('/');
  hashes[relative] = createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
}
await writeFile(
  path.join(stage, 'package-manifest.json'),
  `${JSON.stringify({ version: 1, files: hashes }, null, 2)}\n`,
);
console.log(`Staged ${e2e ? 'test-only' : 'release'} package: ${stage}`);
