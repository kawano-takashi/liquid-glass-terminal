import { readFile, readdir } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { root } from './lib/native-toolchain.mjs';

const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const directory = path.join(root, 'build', 'artifacts');
const expected = `LiquidGlassTerminal-${manifest.version}-win-x64.msi`;
const artifacts = await readdir(directory);
if (!artifacts.includes(expected)) throw new Error(`Missing installer: ${expected}`);
if (artifacts.some((name) => /e2e/i.test(name))) {
  throw new Error('Release artifact directory contains a test-only installer.');
}
const bytes = await readFile(path.join(directory, expected));
const compoundFileMagic = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
if (!bytes.subarray(0, 8).equals(compoundFileMagic))
  throw new Error('Installer is not a valid MSI.');
console.log(`Verified installer: ${path.join(directory, expected)}`);
