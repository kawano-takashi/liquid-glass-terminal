# Contributing

## Setup

Use Node.js 24.19.0 and npm 11.17.0. Install dependencies with scripts disabled, audit the reviewed lifecycle set, then prepare native modules explicitly:

```text
npm install
npm run audit:install-scripts
npm run bootstrap:native
```

Do not use `--force` or `--legacy-peer-deps`. Keep every direct dependency exact and commit `package-lock.json`. Dependency updates are manual: review changelogs, install/lifecycle scripts, native ABI compatibility, and the generated lockfile before changing a version or `allowScripts`.

## Before a pull request

```text
npm run check
npm run package
```

Run `LGT_NATIVE_TESTS=1 npm run test:run` after preparing node-pty. Run `npm run test:e2e` against the packaged application when the host supports Electron GUI tests.

Changes to PTY framing, IPC, preload APIs, URL/path validation, permissions, CSP, or Electron Fuses require tests covering rejected input as well as valid input. Do not expose Node.js or raw Electron objects to the renderer.

## User interface

- Keep terminal text outside decorative distortion and preserve a minimum xterm contrast ratio of 4.5.
- Verify light, dark, high-contrast, reduced-transparency, and reduced-motion behavior.
- Update both English and Japanese dictionaries and README files together.
- Do not add remote fonts, analytics, update checks, or runtime content delivery.

## Releases

Tags matching `v*` build unsigned artifacts and create a draft release. A maintainer must review all matrix jobs, SHA-256 checksums, known QA gaps, and release notes before publishing.
