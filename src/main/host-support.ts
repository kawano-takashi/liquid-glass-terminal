import { execFileSync } from 'node:child_process';
import os from 'node:os';

export const MINIMUM_WINDOWS_BUILD = 22_621;

export type UnsupportedHostReason =
  | 'platform'
  | 'process-architecture'
  | 'native-architecture'
  | 'windows-version'
  | 'windows-edition';

export interface HostEnvironment {
  platform: NodeJS.Platform;
  processArchitecture: string;
  nativeArchitecture: string | undefined;
  windowsRelease: string;
  installationType: string | undefined;
}

export type HostSupport =
  { supported: true; build: number } | { supported: false; reason: UnsupportedHostReason };

function normalizeArchitecture(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'amd64' || normalized === 'x86_64' || normalized === 'x64') return 'x64';
  if (normalized === 'arm64' || normalized === 'aarch64') return 'arm64';
  return normalized || undefined;
}

function readRegistryString(key: string, valueName: string): string | undefined {
  if (process.platform !== 'win32') return undefined;
  try {
    const output = execFileSync('reg.exe', ['query', key, '/v', valueName], {
      encoding: 'utf8',
      windowsHide: true,
    });
    const line = output
      .split(/\r?\n/)
      .map((candidate) => candidate.trim())
      .find((candidate) => candidate.startsWith(valueName));
    return /\s+REG_\w+\s+(.+)$/i.exec(line ?? '')?.[1]?.trim();
  } catch {
    return undefined;
  }
}

export function currentHostEnvironment(): HostEnvironment {
  return {
    platform: process.platform,
    processArchitecture: process.arch,
    nativeArchitecture: readRegistryString(
      'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
      'PROCESSOR_ARCHITECTURE',
    ),
    windowsRelease: os.release(),
    installationType: readRegistryString(
      'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion',
      'InstallationType',
    ),
  };
}

export function resolveHostSupport(environment: HostEnvironment): HostSupport {
  if (environment.platform !== 'win32') return { supported: false, reason: 'platform' };
  if (normalizeArchitecture(environment.processArchitecture) !== 'x64') {
    return { supported: false, reason: 'process-architecture' };
  }
  if (normalizeArchitecture(environment.nativeArchitecture) !== 'x64') {
    return { supported: false, reason: 'native-architecture' };
  }
  const build = Number(environment.windowsRelease.split('.')[2]);
  if (!Number.isInteger(build) || build < MINIMUM_WINDOWS_BUILD) {
    return { supported: false, reason: 'windows-version' };
  }
  if (environment.installationType?.toLowerCase() !== 'client') {
    return { supported: false, reason: 'windows-edition' };
  }
  return { supported: true, build };
}
