import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { root } from './lib/native-toolchain.mjs';

const e2e = process.argv.includes('--e2e');
const stage = path.join(root, 'build', e2e ? 'package-e2e' : 'package', 'LiquidGlassTerminal');
const executable = path.join(stage, 'LiquidGlassTerminal.exe');
await access(executable);
await access(path.join(stage, 'web', 'index.html'));

const image = await readFile(executable);
if (image.toString('ascii', 0, 2) !== 'MZ') throw new Error('Native executable has no PE header.');
const pe = image.readUInt32LE(0x3c);
if (image.toString('ascii', pe, pe + 4) !== 'PE\0\0') throw new Error('Invalid PE signature.');
if (image.readUInt16LE(pe + 4) !== 0x8664) throw new Error('Native executable is not x64.');
if (image.readUInt16LE(pe + 24 + 68) !== 2)
  throw new Error('Native executable is not Windows GUI.');
const inspectionSwitch = Buffer.from('remote-debugging-port', 'utf16le');
if (image.includes(inspectionSwitch) !== e2e) {
  throw new Error(
    e2e
      ? 'E2E executable is missing its inspection switch.'
      : 'Release executable contains the E2E inspection switch.',
  );
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

const metadata = JSON.parse(await readFile(path.join(stage, 'package-metadata.json'), 'utf8'));
if (metadata.testOnly !== e2e || metadata.platform !== 'win32' || metadata.architecture !== 'x64') {
  throw new Error('Package metadata does not match the requested artifact type.');
}
const marker = path.join(stage, 'E2E-ONLY.json');
if (e2e) await access(marker);
else {
  try {
    await access(marker);
    throw new Error('Release package contains the E2E-only marker.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const manifest = JSON.parse(await readFile(path.join(stage, 'package-manifest.json'), 'utf8'));
if (manifest.version !== 1 || typeof manifest.files !== 'object' || manifest.files === null) {
  throw new Error('Package manifest has an unsupported schema.');
}
for (const [relative, expected] of Object.entries(manifest.files)) {
  const actual = createHash('sha256')
    .update(await readFile(path.join(stage, ...relative.split('/'))))
    .digest('hex');
  if (actual !== expected) throw new Error(`Package hash mismatch: ${relative}`);
}
const actualFiles = (await files(stage))
  .map((file) => path.relative(stage, file).split(path.sep).join('/'))
  .sort();
const expectedFiles = [...Object.keys(manifest.files), 'package-manifest.json'].sort();
if (
  actualFiles.length !== expectedFiles.length ||
  actualFiles.some((file, index) => file !== expectedFiles[index])
) {
  throw new Error('Package contains files that are missing from its manifest.');
}
const forbidden = /(^|[\\/])(electron|node_modules)([\\/]|$)|\.(node|dll)$/i;
for (const file of actualFiles) {
  if (forbidden.test(file)) throw new Error(`Forbidden packaged runtime asset: ${file}`);
}
console.log(`Verified native ${e2e ? 'E2E' : 'release'} package: ${stage}`);
