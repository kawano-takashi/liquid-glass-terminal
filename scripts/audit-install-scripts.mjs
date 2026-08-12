import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const allowed = new Set(
  Object.entries(manifest.allowScripts ?? {})
    .filter(([, value]) => value === true)
    .map(([name]) => name),
);
const discovered = new Set();

function inspectPackage(packageDirectory) {
  const manifestPath = path.join(packageDirectory, 'package.json');
  if (!existsSync(manifestPath)) return;
  const dependency = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const scripts = dependency.scripts ?? {};
  const hasLifecycle = ['preinstall', 'install', 'postinstall'].some(
    (name) => typeof scripts[name] === 'string' && scripts[name].trim().length > 0,
  );
  const hasImplicitNodeGyp =
    existsSync(path.join(packageDirectory, 'binding.gyp')) && !scripts.install;
  if (hasLifecycle || hasImplicitNodeGyp)
    discovered.add(`${dependency.name}@${dependency.version}`);

  const nested = path.join(packageDirectory, 'node_modules');
  if (existsSync(nested)) inspectNodeModules(nested);
}

function inspectNodeModules(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.bin') continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.name.startsWith('@')) {
      for (const scoped of readdirSync(entryPath, { withFileTypes: true })) {
        if (scoped.isDirectory()) inspectPackage(path.join(entryPath, scoped.name));
      }
    } else {
      inspectPackage(entryPath);
    }
  }
}

inspectNodeModules(path.join(root, 'node_modules'));
const unapproved = [...discovered].filter((entry) => !allowed.has(entry)).sort();
const stale = [...allowed].filter((entry) => !discovered.has(entry)).sort();

console.log(`Reviewed install-script packages: ${[...discovered].sort().join(', ')}`);
if (unapproved.length || stale.length) {
  if (unapproved.length) console.error(`Unapproved install scripts: ${unapproved.join(', ')}`);
  if (stale.length) console.error(`Stale allowScripts entries: ${stale.join(', ')}`);
  process.exitCode = 1;
}
