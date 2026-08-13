import { access } from 'node:fs/promises';
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
await access(glassAddon);
const glassApi = createRequire(import.meta.url)(glassAddon);
for (const method of ['probe', 'attach', 'update', 'detach']) {
  if (typeof glassApi[method] !== 'function') {
    throw new Error(`Windows frosted-backdrop addon does not export ${method}().`);
  }
}
glassApi.detach();
console.log(`Verified packaged Windows frosted-backdrop addon in ${glassRoot}`);
