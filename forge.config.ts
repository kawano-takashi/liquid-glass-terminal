import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { flipFuses, FuseV1Options, FuseVersion } from '@electron/fuses';
import type { FuseConfig } from '@electron/fuses';

const iconPath = 'assets/icons/icon';
const e2eBuild = process.env.LGT_E2E_BUILD === '1';

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
    // Unix node-pty loads both pty.node and its sibling spawn-helper from the real filesystem.
    asar: { unpackDir: path.join('node_modules', 'node-pty') },
    executableName: 'liquid-glass-terminal',
    appBundleId: process.env.APP_BUNDLE_ID ?? 'dev.liquidglass.terminal',
    appCategoryType: 'public.app-category.developer-tools',
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
    packageAfterCopy: async (resolvedConfig, resourcesPath, _electronVersion, platform, arch) => {
      const applePlatform = platform === 'darwin' || platform === 'mas';
      const executable = path.join(
        path.resolve(resourcesPath, '../..'),
        applePlatform ? 'MacOS' : '',
        applePlatform ? 'Electron' : platform === 'win32' ? 'electron.exe' : 'electron',
      );
      const osxSign = resolvedConfig.packagerConfig.osxSign;
      const hasOsxSign =
        typeof osxSign === 'object' ? Object.keys(osxSign).length > 0 : Boolean(osxSign);

      if (platform === 'win32') {
        if (arch !== 'x64') throw new Error(`Windows Acrylic is not built for ${arch}.`);
        const source = path.resolve('native/windows-glass/dist');
        const nativeDestination = path.resolve(resourcesPath, '..', 'windows-glass');
        const runtimeManifest = JSON.parse(
          await readFile(path.join(source, 'runtime-manifest.json'), 'utf8'),
        ) as { architecture?: string; files?: Array<{ name?: string }> };
        if (runtimeManifest.architecture !== arch || !Array.isArray(runtimeManifest.files)) {
          throw new Error('Windows Acrylic runtime manifest does not match the package target.');
        }
        await mkdir(nativeDestination, { recursive: true });
        await copyFile(
          path.join(source, 'windows-glass.node'),
          path.join(nativeDestination, 'windows-glass.node'),
        );
        await copyFile(
          path.join(source, 'runtime-manifest.json'),
          path.join(nativeDestination, 'runtime-manifest.json'),
        );
        for (const legalFile of ['LICENSE.txt', 'NOTICE.txt']) {
          await copyFile(path.join(source, legalFile), path.join(nativeDestination, legalFile));
        }
        for (const entry of runtimeManifest.files) {
          if (!entry.name || path.basename(entry.name) !== entry.name) {
            throw new Error('Windows Acrylic runtime manifest contains an invalid path.');
          }
          await copyFile(
            path.join(source, 'runtime', entry.name),
            path.join(path.dirname(executable), entry.name),
          );
        }
      }

      await flipFuses(executable, {
        ...fuseConfig,
        resetAdHocDarwinSignature: applePlatform && arch === 'arm64' && !hasOsxSign,
      });
    },
  },
  makers: [
    new MakerSquirrel({
      name: 'liquid_glass_terminal',
      setupExe: 'Liquid-Glass-Terminal-Setup.exe',
      setupIcon: `${iconPath}.ico`,
    }),
    new MakerDMG({ name: 'Liquid-Glass-Terminal', icon: `${iconPath}.icns` }, ['darwin']),
    new MakerZIP({}, ['darwin']),
    new MakerDeb({ options: { icon: `${iconPath}.png` } }),
    new MakerRpm({ options: { icon: `${iconPath}.png` } }),
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
