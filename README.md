# Liquid Glass Terminal

[日本語](README.ja.md)

A local-first terminal for Windows 11 whose window, Glass material, input routing, and shell lifecycle are native C++. React and xterm.js run inside a transparent WebView2 composition visual; Electron is not used.

> **Preview:** version 0.3.0 targets Windows 11 24H2 or later on x64 client editions. The installer is currently unsigned.

## What changed in 0.3

- A Win32 `HWND` with `WS_EX_NOREDIRECTIONBITMAP` owns the top-level window and preserves resize, maximize/restore, Snap Layout, system-menu, DPI, and fullscreen behavior.
- Windows.UI.Composition renders one full-window `HostBackdropBrush → Gaussian blur → saturation` graph. Overlay masks add only tone, grain, borders, and shadows, so the title bar and terminal remain one continuous sheet of Glass.
- `CoreWebView2CompositionController` places the transparent React UI directly in the native visual tree. Native code routes mouse, wheel, pointer, touch/pen, cursor, focus, DPI, drag/drop, and IME-sensitive input.
- A C++20 ConPTY host starts the local shell in a kill-on-close Job Object. WebView2 shared buffers carry terminal data with bounded queues, sequence validation, acknowledgements, and recovery generations.
- Clear, Regular, and Dense presets set frost thickness, Glass opacity, grayscale tone, and grain together. Glass opacity is the master contribution for backdrop blur, tone, grain, panel density, and passive UI decoration; 0% is fully transparent while text and interaction feedback remain visible. Each value can also be adjusted independently, and CSS never captures or blurs the desktop.
- High contrast, disabled transparency, Remote Desktop, energy saver, composition failure, and user opt-out switch to an operable solid fallback. WebView2 and GPU recovery keep the shell alive where possible.
- The WebView loads only bundled files from `https://app.liquid-glass-terminal.invalid/`. Navigation, downloads, permissions, new windows, remote requests, host objects, and release-build DevTools are denied.

The implementation is described in [docs/architecture.md](docs/architecture.md). Native release acceptance is tracked in [docs/native-qa.md](docs/native-qa.md).

## Requirements

### Run

- Windows 11 24H2 (build 26100) or later, x64 client edition.
- Microsoft Edge WebView2 Evergreen Runtime 150.0.4078.44 or later.
- A hardware-accelerated desktop composition environment for Glass. Unsupported or policy-disabled environments use the solid fallback.

Windows 10, Windows Server, Windows on ARM (including x64 emulation), macOS, and Linux are intentionally unsupported.

### Develop

- Node.js 24.19.0 and npm 11.17.0 exactly.
- Visual Studio 2022 with **Desktop development with C++**.
- Windows SDK 10.0.26100.0.

## Build and run

```powershell
npm ci
npm run verify:toolchain
npm run audit:install-scripts
npm run bootstrap:native
npm start
```

Lifecycle scripts remain disabled through `.npmrc`. `bootstrap:native` explicitly restores pinned WebView2, C++/WinRT, and WIL packages and builds the native solution. The release package uses the static WebView2 loader and Windows system APIs; it does not bundle Electron, Node.js, a Windows App SDK runtime, or remote content.

## Quality gates

```powershell
# Formatting, lint, TypeScript, contract, and unit tests
npm run check

# Native settings, quoting, clipboard, and real ConPTY tests
$env:LGT_NATIVE_TESTS = '1'
npm run test:run

# Instrumented local E2E package; Windows 11 client only
npm run package:e2e
node scripts/verify-native-assets.mjs --e2e
npm run test:e2e

# Rebuild a non-instrumented package before release checks
npm run package
npm run verify:native-assets
npm run smoke:package
npm run audit:production
npm run make
npm run verify:installer
```

Set `LGT_CLIPBOARD_E2E=1` only when the real clipboard test is intended; it temporarily replaces and restores plain text on the OS clipboard. `package:e2e` enables loopback inspection in a separately compiled executable and is never a release input.

The staged release package is written to `build/package/LiquidGlassTerminal/`. `npm run make` creates `build/artifacts/LiquidGlassTerminal-0.3.0-win-x64.msi`.

## Controls

- `Ctrl+Shift+C`: copy the terminal selection.
- `Ctrl+Shift+V`: paste; multiline content requires confirmation.
- `Ctrl+C`: copy when text is selected, otherwise send the interrupt to the shell.
- `Ctrl+,`: open settings.
- `F11`: enter or leave fullscreen; `Esc` leaves fullscreen.
- Drag local files into the terminal to insert shell-appropriate quoted paths.

The custom 56-DIP header is draggable except for its controls. The maximize control retains Windows 11 Snap Layout, and fullscreen hides the entire header.

Settings v2, window state v2, the WebView2 profile, and rotating diagnostic logs stay under `%LOCALAPPDATA%\Liquid Glass Terminal`. Version 1 settings and placement files are left untouched and are not imported. No telemetry, analytics, update checks, or runtime content downloads are performed.

## Release status

Tags matching `v*` build an unsigned x64 MSI and create a draft GitHub Release with SHA-256 checksums. A maintainer must complete the supported-client checklist in [docs/native-qa.md](docs/native-qa.md) before publishing.

## License

[MIT](LICENSE). Cascadia Mono PL is distributed under the SIL Open Font License 1.1; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
