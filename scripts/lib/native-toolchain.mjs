import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const root = path.resolve(import.meta.dirname, '..', '..');
export const solution = path.join(root, 'native', 'LiquidGlassTerminal.sln');

export function requireWindowsX64() {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('Liquid Glass Terminal native builds require Windows x64.');
  }
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: {
      ...process.env,
      DOTNET_CLI_TELEMETRY_OPTOUT: '1',
      DOTNET_NOLOGO: '1',
    },
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} exited with ${result.status ?? 'no status'}.`);
  }
}

export function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `${path.basename(command)} failed.`);
  }
  return result.stdout.trim();
}

export function visualStudioInstallation() {
  requireWindowsX64();
  const vswhere = path.join(
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    'Microsoft Visual Studio',
    'Installer',
    'vswhere.exe',
  );
  if (!existsSync(vswhere)) throw new Error('Visual Studio Installer (vswhere.exe) was not found.');
  const installation = capture(vswhere, [
    '-latest',
    '-products',
    '*',
    '-requires',
    'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
    '-property',
    'installationPath',
  ]);
  if (!installation) throw new Error('Visual Studio 2022 C++ tools were not found.');
  return installation;
}

export function msbuildPath() {
  const candidate = path.join(
    visualStudioInstallation(),
    'MSBuild',
    'Current',
    'Bin',
    'MSBuild.exe',
  );
  if (!existsSync(candidate)) throw new Error(`MSBuild was not found at ${candidate}.`);
  return candidate;
}

export function configurationFromArguments(defaultValue = 'Release') {
  const index = process.argv.indexOf('--configuration');
  const positional = process.argv.find((value) => value === 'Debug' || value === 'Release');
  const value = index === -1 ? (positional ?? defaultValue) : process.argv[index + 1];
  if (value !== 'Debug' && value !== 'Release') {
    throw new Error('--configuration must be Debug or Release.');
  }
  return value;
}
