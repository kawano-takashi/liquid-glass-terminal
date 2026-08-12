import { access, stat } from 'node:fs/promises';
import path from 'node:path';
import { findPackagedExecutable } from './packaged-executable.mjs';

const executable = await findPackagedExecutable();
const resources =
  process.platform === 'darwin'
    ? path.resolve(path.dirname(executable), '..', 'Resources')
    : path.join(path.dirname(executable), 'resources');
const nativeRoot = path.join(resources, 'app.asar.unpacked', 'node_modules', 'node-pty');

async function firstExisting(candidates) {
  for (const relative of candidates) {
    const candidate = path.join(nativeRoot, relative);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue to the next supported node-pty layout.
    }
  }
  throw new Error(`Missing native package asset; checked: ${candidates.join(', ')}`);
}

const platformArch = `${process.platform}-${process.arch}`;
const nativeModule = await firstExisting([
  path.join('build', 'Release', 'pty.node'),
  path.join('prebuilds', platformArch, 'pty.node'),
]);

if (process.platform !== 'win32') {
  const helper = await firstExisting([
    path.join('build', 'Release', 'spawn-helper'),
    path.join('prebuilds', platformArch, 'spawn-helper'),
  ]);
  const helperStats = await stat(helper);
  if ((helperStats.mode & 0o111) === 0) {
    throw new Error(`node-pty spawn-helper is not executable: ${helper}`);
  }
}

console.log(`Verified packaged node-pty assets in ${nativeRoot}`);
console.log(`Native module: ${nativeModule}`);
