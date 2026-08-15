# Liquid Glass Terminal

- Local-first Windows 11 x64 terminal with native masked Glass and a WebView2 React UI.

## Build & Test

```powershell
# Exact toolchain and native bootstrap
npm ci
npm run verify:toolchain
npm run audit:install-scripts
npm run bootstrap:native

# Development
npm start

# Required quality gate
npm run check

# Real C++/ConPTY integration tests
$env:LGT_NATIVE_TESTS = '1'
npm run test:run

# Test-only package and local Windows 11 E2E
npm run package:e2e
npm run verify:native-assets -- --e2e
npm run test:e2e

# Release package, smoke test, MSI, and verification
npm run package
npm run verify:native-assets
npm run smoke:package
npm run audit:production
npm run make
npm run verify:installer
```

## Tech Stack

- C++20 / Win32 / C++/WinRT / Windows.UI.Composition / Direct3D 11 / WebView2 1.0.4078.44 / ConPTY / TypeScript 6.0.3 / React 19.2.8 / Vite 8.2.1 / xterm.js 6.0.0 / WiX 7.

## Constraints

- Use Node.js 24.19.0 and npm 11.17.0 exactly; `engine-strict=true`.
- Native builds target Windows x64 and require Visual Studio 2022 with the Desktop development with C++ workload plus Windows SDK 10.0.26100.0.
- Interactive launch, packaged E2E, and visual QA require an x64 client edition of Windows 11 24H2 or later and Microsoft Edge WebView2 Runtime 150.0.4078.44 or later.
- Keep npm lifecycle scripts disabled. Audit the reviewed set before `npm run bootstrap:native`.
- Do not use npm `--force` or `--legacy-peer-deps`.
- Pin every direct dependency exactly and commit `package-lock.json`; review lifecycle scripts and native/package compatibility before updates.
- Do not commit `.winapp/`, `build/`, `native/packages/`, WiX intermediates, or staged runtime binaries.
- Never add Electron, Node.js integration, host objects, arbitrary navigation, remote fonts, analytics, update checks, or runtime content delivery to the WebView.
- Treat `npm run package:e2e` output as test-only. It enables loopback inspection and must never become a release artifact.

## Conventions

- Changes to ConPTY framing, shared-buffer transport, Web Messages, URL/path validation, permissions, CSP, clipboard, or file-drop quoting require tests for valid and rejected input.
- Generate TypeScript and C++ contracts only from `contracts/protocol.idl.json` with `npm run contracts:generate`; never hand-edit generated files.
- Keep Glass rendering in Windows Composition. CSS may style content but must not capture or process desktop pixels.
- Use one shared processed HostBackdrop Gaussian blur surface; never draw the raw HostBackdrop directly. Keep the Glass layer opacity at 1, expose only `glass.blurDips` (0–74 DIP), and keep panel decoration independent from blur amount. At 0 DIP, retain the shared processed path with Gaussian blur disabled.
- Keep terminal glyphs outside decorative distortion and preserve xterm's minimum contrast ratio of at least 4.5; do not promise arbitrary desktop-background contrast for Glass.
- Preserve standard resize, maximize/restore, Snap Layout, system-menu, keyboard, DPI, mouse, pointer, touch/pen, and Japanese IME behavior.
- Glass failure must retain terminal state and fall back to an opaque surface. Honor transparency, high-contrast, reduced-motion, screen-reader, Remote Desktop, and energy-saver policy changes.
- Update English and Japanese dictionaries and README files together.
- Set `LGT_CLIPBOARD_E2E=1` only intentionally; the test temporarily replaces and restores OS clipboard text.
- Regenerate a normal package after E2E packaging before release verification.
- Complete `docs/native-qa.md` on a supported Windows 11 client before publishing a draft release.
