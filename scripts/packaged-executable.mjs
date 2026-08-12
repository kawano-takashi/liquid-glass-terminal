import { readdir } from 'node:fs/promises';
import path from 'node:path';

export async function findPackagedExecutable(root = path.resolve('out')) {
  const supplied = process.env.LGT_E2E_EXECUTABLE;
  if (supplied) return supplied;
  const candidates = [];

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (
        (process.platform === 'win32' && entry.name === 'liquid-glass-terminal.exe') ||
        (process.platform === 'darwin' &&
          full.includes('.app') &&
          entry.name === 'liquid-glass-terminal') ||
        (process.platform === 'linux' && entry.name === 'liquid-glass-terminal')
      ) {
        candidates.push(full);
      }
    }
  }

  await walk(root);
  const unpacked = candidates.find(
    (candidate) => candidate.includes('unpacked') || candidate.includes('-win32-'),
  );
  const selected = unpacked ?? candidates[0];
  if (!selected) throw new Error(`Packaged executable was not found under ${root}`);
  return selected;
}
