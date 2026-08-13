import { access, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { findPackagedExecutable } from './packaged-executable.mjs';

const executable = await findPackagedExecutable();
const resources = path.join(path.dirname(executable), 'resources');
const ptyRoot = path.join(resources, 'app.asar.unpacked', 'node_modules', 'node-pty');

async function firstExisting(candidates) {
  for (const relative of candidates) {
    const candidate = path.join(ptyRoot, relative);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue to the next supported node-pty layout.
    }
  }
  throw new Error(`Missing native package asset; checked: ${candidates.join(', ')}`);
}

const nativeModule = await firstExisting([
  path.join('build', 'Release', 'pty.node'),
  path.join('prebuilds', 'win32-x64', 'pty.node'),
]);

console.log(`Verified packaged node-pty assets in ${ptyRoot}`);
console.log(`Native module: ${nativeModule}`);

const glassRoot = path.join(resources, 'windows-glass');
const glassAddon = path.join(glassRoot, 'windows-glass.node');
const runtimeManifestPath = path.join(glassRoot, 'runtime-manifest.json');
await access(glassAddon);
await access(path.join(glassRoot, 'LICENSE.txt'));
await access(path.join(glassRoot, 'NOTICE.txt'));
const glassApi = createRequire(import.meta.url)(glassAddon);
for (const method of ['isSupported', 'attach', 'update', 'detach']) {
  if (typeof glassApi[method] !== 'function') {
    throw new Error(`Windows Acrylic addon does not export ${method}().`);
  }
}
glassApi.detach();
const runtimeManifest = JSON.parse(await readFile(runtimeManifestPath, 'utf8'));
if (runtimeManifest.architecture !== 'x64' || !Array.isArray(runtimeManifest.files)) {
  throw new Error('Packaged Windows Acrylic runtime manifest is invalid.');
}
const names = new Set(runtimeManifest.files.map((entry) => entry.name));
for (const required of [
  'Microsoft.WindowsAppRuntime.dll',
  'Microsoft.UI.dll',
  'Microsoft.UI.Composition.SystemBackdrops.dll',
]) {
  if (!names.has(required)) throw new Error(`Windows Acrylic runtime is missing ${required}.`);
}
for (const entry of runtimeManifest.files) {
  if (typeof entry.name !== 'string' || path.basename(entry.name) !== entry.name) {
    throw new Error('Windows Acrylic runtime manifest contains an invalid path.');
  }
  const packaged = path.join(path.dirname(executable), entry.name);
  const packagedStats = await stat(packaged);
  if (packagedStats.size !== entry.bytes) {
    throw new Error(`Windows Acrylic runtime size mismatch: ${entry.name}`);
  }
}
console.log(`Verified packaged Windows Acrylic addon in ${glassRoot}`);
