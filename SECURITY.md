# Security policy

## Supported versions

Security fixes are provided for the latest 0.3.x preview on a best-effort basis. Preview releases may contain breaking changes.

## Reporting a vulnerability

Use GitHub private vulnerability reporting for this repository. Do not open a public issue containing exploit details, secrets, terminal history, local paths, or personally identifiable information.

Include the affected version, Windows and WebView2 versions, a minimal reproduction, impact, and any suggested mitigation. Maintainers will acknowledge the report when received and coordinate disclosure after a fix is available.

## Trust boundary

Liquid Glass Terminal is a terminal, not a sandbox. Commands entered by the user and every descendant of the selected shell run with the same Windows privileges as the application.

The React/xterm UI is treated as an unprivileged presentation layer:

- It loads bundled assets only from the fixed virtual origin `https://app.liquid-glass-terminal.invalid/`.
- Native code permits only the exact application navigation and returns 403 for every non-application resource origin.
- New windows, downloads, WebView permissions, host objects, default context menus, browser accelerators, and release-build DevTools are disabled.
- It receives no Node.js, COM, Win32, raw WebView2, executable-selection, or argument-building API.
- Every Web Message is source-checked, versioned, exact-key validated, bounded, and dispatched by a closed message-type set.
- Terminal data uses direction-limited WebView2 shared buffers with validated slot, generation, sequence, and length fields. Bounded queues apply backpressure.

The native host chooses only trusted local PowerShell/cmd locations. The shell starts suspended, enters a kill-on-close Job Object, and then resumes. Native OLE file drops are quoted for the active shell grammar. Clipboard data is limited to 1 MiB; multiline paste requires confirmation.

Settings, window state, WebView2 data, and rotating diagnostic event logs remain under `%LOCALAPPDATA%\Liquid Glass Terminal`. The application performs no telemetry, analytics, update check, remote UI load, or background download. Logs contain event names and numeric error codes, not terminal input/output.

## Packaging and dependencies

`npm audit --omit=dev` must report no known production npm vulnerabilities before release. Lifecycle scripts are globally disabled and audited before native restore. Direct dependencies are exact-pinned.

Release verification checks an x64 Windows GUI PE, every staged file's SHA-256 hash, the exact manifest file set, absence of Electron/Node/native-addon runtime assets, and absence of the E2E-only inspection switch and marker. E2E packages are test-only and must never be distributed.

The MSI is currently unsigned. Verify its checksum from the draft release before installing and treat SmartScreen warnings accordingly.
