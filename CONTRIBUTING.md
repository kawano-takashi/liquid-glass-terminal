# Contributing

## Setup

Use Node.js 24.19.0 and npm 11.17.0. Install dependencies with scripts disabled, audit the reviewed lifecycle set, then prepare native modules explicitly:

```text
npm install
npm run audit:install-scripts
npm run bootstrap:native
```

Development and packaging require an x64 client edition of Windows 11 22H2 or later and the Visual Studio 2022 **Desktop development with C++** workload. The bootstrap step restores the versions in `winapp.yaml`, builds `native/windows-glass`, and stages the Windows App SDK self-contained runtime. Do not commit `.winapp`, the addon build directory, or staged runtime binaries.

Do not use `--force` or `--legacy-peer-deps`. Keep every direct dependency exact and commit `package-lock.json`. Dependency updates are manual: review changelogs, install/lifecycle scripts, native ABI compatibility, and the generated lockfile before changing a version or `allowScripts`.

## Before a pull request

```text
npm run check
npm run package
```

Run `$env:LGT_NATIVE_TESTS = '1'; npm run test:run` after preparing node-pty. Build an instrumented package with `npm run package:e2e`, then run `npm run test:e2e` locally on a supported Windows 11 host.
Set `LGT_CLIPBOARD_E2E=1` to include the real OS clipboard checks; they are opt-in locally because the test temporarily replaces and then restores the plain-text clipboard content.

Changes to PTY framing, IPC, preload APIs, URL/path validation, permissions, CSP, or Electron Fuses require tests covering rejected input as well as valid input. Do not expose Node.js or raw Electron objects to the renderer.

## User interface

- Keep terminal text outside decorative distortion and preserve a minimum xterm contrast ratio of 4.5.
- Verify light, dark, high-contrast, reduced-transparency, and reduced-motion behavior.
- Update both English and Japanese dictionaries and README files together.
- Do not add remote fonts, analytics, update checks, or runtime content delivery.

## Releases

Tags matching `v*` build an unsigned Windows x64 artifact and create a draft release. A maintainer must review the quality gates, SHA-256 checksums, local Windows 11 native QA, known gaps, and release notes before publishing.
