import { describe, expect, it } from 'vitest';
import {
  MINIMUM_WINDOWS_BUILD,
  resolveHostSupport,
  type HostEnvironment,
} from '../../src/main/host-support';

const supportedHost: HostEnvironment = {
  platform: 'win32',
  processArchitecture: 'x64',
  nativeArchitecture: 'AMD64',
  windowsRelease: `10.0.${MINIMUM_WINDOWS_BUILD}`,
  installationType: 'Client',
};

describe('resolveHostSupport', () => {
  it('accepts Windows 11 22H2 and newer x64 client editions', () => {
    expect(resolveHostSupport(supportedHost)).toEqual({
      supported: true,
      build: MINIMUM_WINDOWS_BUILD,
    });
    expect(resolveHostSupport({ ...supportedHost, windowsRelease: '10.0.30000' })).toEqual({
      supported: true,
      build: 30_000,
    });
  });

  it.each([
    [{ ...supportedHost, platform: 'linux' as const }, 'platform'],
    [{ ...supportedHost, processArchitecture: 'arm64' }, 'process-architecture'],
    [{ ...supportedHost, nativeArchitecture: 'ARM64' }, 'native-architecture'],
    [{ ...supportedHost, windowsRelease: '10.0.22000' }, 'windows-version'],
    [{ ...supportedHost, windowsRelease: 'broken' }, 'windows-version'],
    [{ ...supportedHost, installationType: 'Server' }, 'windows-edition'],
    [{ ...supportedHost, installationType: undefined }, 'windows-edition'],
  ] as const)('rejects unsupported host details with reason %s', (environment, reason) => {
    expect(resolveHostSupport(environment)).toEqual({ supported: false, reason });
  });
});
