# Liquid Glass Terminal

- Local-first frosted-glass terminal for Windows 11 x64.

## Build & Test

```powershell
# Clean install and native setup
npm ci
npm run verify:toolchain
npm run audit:install-scripts
npm run bootstrap:native

# Development
npm start

# Required quality gate: formatting, lint, types, and unit tests
npm run check

# Individual checks
npm run lint
npm run typecheck
npm run test:run

# Real ConPTY integration test; run after native bootstrap
$env:LGT_NATIVE_TESTS = '1'; npm run test:run

# Instrumented package and local E2E
npm run package:e2e
npm run test:e2e

# Normal unpacked package
npm run package

# Release artifacts and post-build verification
npm run audit:production
npm run make
npm run verify:native-assets
npm run verify:fuses
```

## Tech Stack

- TypeScript 6.0.3 / Electron 43.2.0 / React 19.2.8 / Vite 8.2.1 / Vitest 4.1.10 / Playwright 1.62.1 / C++20 Node-API / Windows.UI.Composition / Direct3D 11.

## Constraints

- Use Node.js 24.19.0 and npm 11.17.0 exactly; `engine-strict=true`.
- Native builds target Windows x64 and require Visual Studio 2022 with the Desktop development with C++ workload.
- Interactive launch, packaged E2E, and visual QA require an x64 client edition of Windows 11 22H2 or later.
- Keep npm lifecycle scripts disabled globally. Audit the reviewed `allowScripts` set, then use `npm run bootstrap:native`.
- Do not use npm's `--force` or `--legacy-peer-deps`.
- Pin every direct dependency exactly and commit `package-lock.json`; review lifecycle scripts and native ABI compatibility before updates.
- Do not commit `.winapp`, native build/dist directories, or staged runtime binaries.
- Never expose Node.js or raw Electron objects to the renderer.
- Do not add remote fonts, analytics, update checks, or runtime content delivery.
- Treat `npm run package:e2e` output as test-only; it enables an inspection fuse and must never become a release artifact.

## Conventions

- Changes to PTY framing, IPC, preload APIs, URL/path validation, permissions, CSP, or Electron Fuses require tests for rejected and valid input.
- Keep terminal text outside decorative distortion and preserve an xterm contrast ratio of at least 4.5 in both foreground palettes.
- Verify zero blur without an unintended black surface at frost 1/14, consistent contrast and palette behavior across all 14 levels, both opaque contrast endpoints, and the dark-foreground switch at white 50%.
- Verify that Windows light and dark settings do not override the user-selected surface, and verify opaque dark high-contrast/reduced-transparency fallbacks plus reduced-motion behavior.
- Update English and Japanese dictionaries and README files together.
- Set `LGT_CLIPBOARD_E2E=1` only intentionally; the test temporarily replaces and restores the OS clipboard text.
- Regenerate a normal package after E2E packaging before running final Fuse verification.
- Complete `docs/native-qa.md` on a supported Windows 11 client before publishing a draft release.
