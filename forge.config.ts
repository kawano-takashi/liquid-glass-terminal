import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { flipFuses, FuseV1Options, FuseVersion } from '@electron/fuses';
import type { FuseConfig } from '@electron/fuses';

const iconPath = 'assets/icons/icon';
const e2eBuild = process.env.LGT_E2E_BUILD === '1';

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Liquid Glass Terminal packages can only be built on Windows x64.');
}

const fuseConfig = {
  version: FuseVersion.V1,
  resetAdHocDarwinSignature: false,
  strictlyRequireAllFuses: true,
  // node-pty uses child_process.fork to enumerate ConPTY descendants during shutdown.
  [FuseV1Options.RunAsNode]: true,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: e2eBuild,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  [FuseV1Options.WasmTrapHandlers]: true,
} satisfies FuseConfig;

const config: ForgeConfig = {
  packagerConfig: {
    // ConPTY's native module must load from the real filesystem.
    asar: { unpackDir: path.join('node_modules', 'node-pty') },
    executableName: 'liquid-glass-terminal',
    icon: iconPath,
    extraResource: ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'third_party/cascadia-code/OFL.txt'],
    ignore: (candidate) => {
      if (!candidate) return false;
      return !(
        candidate.startsWith('/.vite') ||
        candidate === '/node_modules' ||
        candidate.startsWith('/node_modules/node-pty')
      );
    },
  },
  // Native modules are rebuilt once by scripts/bootstrap-native.mjs before Forge runs.
  rebuildConfig: { ignoreModules: ['node-pty'] },
  hooks: {
    packageAfterCopy: async (_resolvedConfig, resourcesPath, _electronVersion, platform, arch) => {
      if (platform !== 'win32' || arch !== 'x64') {
        throw new Error(`Unsupported package target: ${platform}-${arch}.`);
      }
      const executable = path.join(path.resolve(resourcesPath, '../..'), 'electron.exe');
      const source = path.resolve('native/windows-glass/dist');
      const nativeDestination = path.resolve(resourcesPath, '..', 'windows-glass');
      await mkdir(nativeDestination, { recursive: true });
      await copyFile(
        path.join(source, 'windows-glass.node'),
        path.join(nativeDestination, 'windows-glass.node'),
      );

      await flipFuses(executable, fuseConfig);
    },
  },
  makers: [
    new MakerSquirrel({
      name: 'liquid_glass_terminal',
      setupExe: 'Liquid-Glass-Terminal-Setup.exe',
      setupIcon: `${iconPath}.ico`,
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        { entry: 'src/main/index.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/preload/index.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
  ],
};

export default config;
