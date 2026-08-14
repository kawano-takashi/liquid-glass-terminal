import path from 'node:path';
import { spawn } from 'node:child_process';
import { root, run } from './lib/native-toolchain.mjs';

run(process.execPath, [path.join(root, 'scripts', 'generate-contracts.mjs'), '--check']);
run(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build']);
run(process.execPath, [path.join(root, 'scripts', 'build-native.mjs'), '--configuration', 'Debug']);

const executable = path.join(root, 'build', 'native', 'Debug', 'LiquidGlassTerminal.exe');
const child = spawn(executable, process.argv.slice(2), {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});
child.once('error', (error) => {
  throw error;
});
child.once('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
