<p align="center">
  <img src="assets/icons/icon.png" width="128" height="128" alt="Liquid Glass Terminal icon">
</p>

# Liquid Glass Terminal

A local-first Electron terminal with a neutral, COSMIC-inspired frosted-glass interface for Windows 11.

> **Preview:** v0.2.0 is an unsigned preview. Review the source and release checksums before running packaged artifacts.

[日本語](README.ja.md) · [Architecture](docs/architecture.md) · [Native QA](docs/native-qa.md) · [Security](SECURITY.md)

## Highlights

- Real local shells through `node-pty`, rendered by xterm.js with WebGL and DOM fallback.
- Draggable tabs, Windows shell discovery, search, and restartable exited sessions.
- PowerShell 7, Windows PowerShell, cmd, Git Bash, and WSL profiles.
- Multiline paste confirmation, mandatory confirmation above 1 MiB, safe external links, and insert-only file/folder drop.
- English and Japanese UI, system/light/dark themes, and persisted settings/window geometry.
- No telemetry, remote content, update checks, crash uploads, desktop capture, or shell-profile injection.

## Supported host

Liquid Glass Terminal 0.2.0 supports only the x64 client edition of Windows 11 22H2 or later (build 22621+). Windows 10, Windows Server, Windows on ARM—including x64 emulation—macOS, and Linux are rejected before settings or a PTY are created.

The app remains a normal resizable, maximizable, and Snap-compatible window. DWM supplies the system frost, while a self-contained Windows App SDK Desktop Acrylic controller supplies the adjustable neutral tint. No screen-recording permission is requested and pixels from other windows are never captured or retained.

Background opacity ranges from 0% to 50% in 1% steps and defaults to 25%. At 0%, the DWM blur remains visible while tint, luminosity, renderer noise, local blur, decorative fills, and terminal text halo are removed. At 50%, tint opacity is 0.50 and luminosity opacity is 0.59. High contrast, reduced transparency, screen-reader mode, or a native Acrylic failure switches to a safe opaque fallback, disables the slider with an explanation, and preserves the saved value.

## Develop locally

Requirements:

- An x64 client edition of Windows 11 22H2 or later.
- Node.js **24.19.0** with npm **11.17.0**.
- Visual Studio 2022 Build Tools with **Desktop development with C++**.

```powershell
npm install
npm run audit:install-scripts
npm run bootstrap:native
npm start
```

`bootstrap:native` restores the pinned Windows App SDK, builds the x64 Node-API Acrylic addon, stages its self-contained runtime, and rebuilds `node-pty` for Electron's ABI.

Quality gates:

```powershell
npm run check
$env:LGT_NATIVE_TESTS = '1'; npm run test:run
npm run package:e2e
npm run test:e2e
npm run make
npm run verify:native-assets
npm run verify:fuses
```

The packaged launch/E2E checks are local Windows 11 checks because GitHub-hosted Windows runners use Windows Server, which the application intentionally rejects. Set `LGT_CLIPBOARD_E2E=1` to opt into clipboard tests that temporarily replace and restore plain text on the OS clipboard.

## Usage

Packaged applications accept one public argument:

```text
liquid-glass-terminal --cwd <directory>
```

Relative paths resolve from the caller's working directory. An invalid path opens the home directory and shows a notification. Starting a second instance focuses the existing window and opens a new tab at the requested directory.

### Keyboard

| Action              | Shortcut                   |
| ------------------- | -------------------------- |
| New / close tab     | Ctrl+T / Ctrl+W            |
| Find                | Ctrl+F                     |
| Paste               | Ctrl+Shift+V               |
| Copy                | Ctrl+C with a selection    |
| Send interrupt      | Ctrl+C without a selection |
| Next / previous tab | Ctrl+Tab / Ctrl+Shift+Tab  |
| Reorder active tab  | Alt+Shift+Left / Right     |
| Settings            | Ctrl+,                     |

Links open only with Ctrl+click and only for `http:` or `https:` URLs. Dropped paths are quoted for the selected shell and inserted without pressing Enter.

## Build and release

Electron Forge produces an unsigned Windows x64 Setup EXE. A matching `v*` tag runs Windows x64 quality gates and creates a draft GitHub Release with SHA-256 checksums. Signing, auto-update, session restoration, SSH management, split panes, arbitrary custom profiles, plugins, and inline images are not part of v0.2.0.

See [CONTRIBUTING.md](CONTRIBUTING.md) before changing dependencies or native code.

## License

Application code is available under the [MIT License](LICENSE). Cascadia Mono PL is bundled under the SIL Open Font License; see [third-party notices](THIRD_PARTY_NOTICES.md).
