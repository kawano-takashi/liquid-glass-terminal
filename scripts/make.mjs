import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { root, run } from './lib/native-toolchain.mjs';

const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
run(process.execPath, [path.join(root, 'scripts', 'package.mjs')]);
run('dotnet.exe', [
  'build',
  path.join(root, 'installer', 'LiquidGlassTerminal.wixproj'),
  '--configuration',
  'Release',
  `-p:ProductVersion=${manifest.version}`,
  `-p:StageDir=${path.join(root, 'build', 'package', 'LiquidGlassTerminal')}`,
  '--nologo',
]);
