# Contributing

## Setup

Use Node.js 24.19.0 and npm 11.17.0 exactly on an x64 Windows machine:

```powershell
npm ci
npm run verify:toolchain
npm run audit:install-scripts
npm run bootstrap:native
```

Visual Studio 2022 must include **Desktop development with C++** and Windows SDK 10.0.26100.0. Native restore uses the exact packages in `native/packages.config`: WebView2 SDK, C++/WinRT, and WIL. Interactive launch and E2E require an x64 client edition of Windows 11 24H2+ and WebView2 Runtime 150.0.4078.44+; GitHub's Windows Server runner can build but is not a supported launch host.

Lifecycle scripts remain disabled in `.npmrc`. Do not use `--force` or `--legacy-peer-deps`. Pin every direct dependency exactly, commit `package-lock.json`, and review lifecycle scripts plus native/package compatibility before updating versions.

## Before a pull request

```powershell
npm run check

$env:LGT_NATIVE_TESTS = '1'
npm run test:run

npm run package
npm run verify:native-assets
npm run smoke:package
```

On a supported Windows 11 client, also run:

```powershell
npm run package:e2e
node scripts/verify-native-assets.mjs --e2e
npm run test:e2e
```

Set `LGT_CLIPBOARD_E2E=1` only intentionally. That test temporarily replaces and restores OS clipboard text. Always generate a fresh normal package after E2E packaging.

## Native/web boundaries

- `contracts/protocol.idl.json` is the only editable protocol definition. Run `npm run contracts:generate` after changing it and commit both generated outputs.
- Test accepted and rejected inputs whenever changing ConPTY framing, shared buffers, Web Messages, settings validation, URL/path validation, permissions, clipboard, or file-drop quoting.
- Keep Glass effects in Windows Composition. React owns its content layout and settings; it must not manipulate native visuals or capture or process desktop pixels in CSS. Never draw an unprocessed HostBackdrop directly.
- Do not expose COM, Win32, WebView host objects, arbitrary executables, or arguments to the web layer.
- Do not add remote navigation, remote fonts, analytics, update checks, or runtime content delivery.
- Preserve shell state across WebView and composition recovery paths. Solid/safe fallback must remain fully operable.

## User interface

- Keep terminal glyphs outside decorative effects and preserve a minimum xterm contrast ratio of 4.5 for auto, light, and dark foreground modes.
- Verify Clear, Regular, and Dense against white, black, saturated, text-heavy, and moving backgrounds.
- Preserve resize, maximize/restore, Snap Layout, system-menu, fullscreen, high-DPI, multi-monitor, high-refresh, mouse, pointer, touch/pen, keyboard, and Japanese IME behavior.
- Honor disabled transparency, high contrast, reduced motion, screen readers, Remote Desktop, and energy saver without overwriting saved preferences.
- Update English and Japanese dictionaries and README files together.

## Releases

`npm run make` builds an unsigned per-machine x64 MSI in `build/artifacts/`. Before publishing a `v*` draft, verify the normal package and installer, review SHA-256 checksums, and complete [docs/native-qa.md](docs/native-qa.md) on a supported Windows 11 client. Never publish `build/package-e2e` or an executable containing its loopback inspection switch.
