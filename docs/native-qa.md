# Windows 11 native acceptance checklist

Automated tests cover protocol validation, settings persistence/rollback, foreground contrast, bridge/shared-buffer behavior, shell quoting, clipboard boundaries, real ConPTY startup, packaging integrity, and basic packaged interaction. Backdrop quality, IME placement, compositor timing, monitor transitions, and accessibility behavior still require an interactive Windows 11 client.

For each run record the application version, Windows build/edition, WebView2 Runtime, GPU and driver, monitor layout, DPI and refresh rates, HDR state, power state, accessibility settings, and result. Attach `%LOCALAPPDATA%\Liquid Glass Terminal\logs\app.log` for failures.

## Host and startup

- [ ] Windows 11 24H2+ x64 client starts normally with WebView2 Runtime 150.0.4078.44 or later.
- [ ] Windows 10, pre-24H2 Windows 11, Windows Server, and Windows on ARM are rejected before settings or ConPTY are created.
- [ ] A missing/old WebView2 Runtime shows the native requirement dialog and exits without downloading content.
- [ ] A normal package starts without Electron, Node.js, Windows App SDK, or a machine-wide developer environment.
- [ ] Settings, window state, WebView profile, and logs are created only under the local application-data directory.

## Window behavior

- [ ] Move, all-edge/corner resize, minimize, maximize, restore, Alt+Space system menu, keyboard window commands, and taskbar activation work.
- [ ] Hovering the maximize control exposes Snap Layout; snapped windows resize and restore correctly.
- [ ] F11 enters fullscreen and Escape restores the previous placement.
- [ ] F11 hides both the DOM header and native caption controls; restoring fullscreen returns both without shifting terminal content.
- [ ] The 480×320-DIP minimum and saved normal/maximized placement are honored.
- [ ] Reconnecting, removing, or rearranging monitors never restores the window entirely off-screen.
- [ ] Moving between 100%, 125%, 150%, and 200% DPI monitors keeps visuals, clicks, cursors, IME, drag targets, and title-bar controls aligned.
- [ ] 60 Hz, 120 Hz, and the highest available refresh rate show no obvious Glass lag, black flash, or stale frame during move/resize.

## Glass material

- [ ] Desktop wallpaper and another application behind the window are blurred live without a capture/recording prompt.
- [ ] The 56-DIP header and terminal form one continuous full-window Glass sheet without an inset terminal card or seam.
- [ ] Settings, context menu, paste confirmation, notices, and toasts use overlay masks only; opening/closing them leaves no stale mask or second blur pass.
- [ ] Nonuniform corner radii render without clipping gaps or crashes.
- [ ] Clear, Regular, and Dense are visibly distinct and switch without restarting or losing terminal output.
- [ ] Frost thickness 0–13, Glass opacity 0–100, grayscale tone 0–100, and grain 0–100 preview and persist at every boundary.
- [ ] With `tests/fixtures/frosted-backdrop.html` behind the terminal, Glass opacity 0 leaves fine text, checker edges, and large colors crisp and unshifted through empty areas from the title bar to the terminal; no blur, tone, grain, panel density, or passive border remains.
- [ ] Sweeping Glass opacity through 0, 5, 20, 35, 50, and 100 changes blur contribution, grain, panel density, and passive UI decoration without a discontinuity; the configured Frost radius does not change.
- [ ] At Glass opacity 0, settings, menus, dialogs, and toasts lose passive fills, separators, shadows, and modal scrims while text, focus, hover, selected, checked, and error states remain visible.
- [ ] Grain 0 is visually smooth and does not allocate the noise surface; grain 100 adds only fine high-frequency texture.
- [ ] Saturation remains 1.0, so large backdrop colors do not shift when Glass is enabled.
- [ ] Multiple panels do not multiply blur cost; GPU traces show exactly one backdrop/blur graph.
- [ ] With `tests/fixtures/frosted-backdrop.html` behind the terminal, large colors and shapes remain identifiable while the checker and fine text are unreadable.
- [ ] Automatic and explicit light/dark foreground choices retain at least 4.5:1 against the nominal Tone; extreme transparency/background combinations are inspected separately and are not corrected with a dynamic opacity floor.
- [ ] Deactivating and reactivating the window transitions smoothly when motion is enabled and changes immediately when it is reduced.
- [ ] DWM uses standard rounded corners and its external shadow normally, with square corners while maximized, snapped, or fullscreen.

## WebView2 and input

- [ ] The WebView background is completely transparent in Glass state and opaque in solid/safe state.
- [ ] Mouse move/buttons/double-click, vertical/horizontal wheel, capture outside the window, cursor changes, and context menu work at every tested DPI.
- [ ] Touch scrolling/tapping and pen input work without duplicated events or coordinate drift.
- [ ] Keyboard focus traverses controls and returns to the terminal after dialogs/settings close.
- [ ] The header drag region moves and double-click-maximizes the window, while the settings button remains interactive and the maximize button exposes Snap Layout.
- [ ] Japanese IME input, conversion, reconversion, candidate selection, and candidate-window placement remain correct while moved, resized, maximized, snapped, fullscreen, and across DPI monitors.
- [ ] Clipboard copy/paste works once per command; `Ctrl+C` without a selection reaches the shell.
- [ ] Multiline paste is never sent before confirmation, and cancel sends nothing.
- [ ] File drops insert exactly one correctly quoted path containing spaces, apostrophes, ampersands, percent signs, and Unicode.
- [ ] No remote navigation, download, permission prompt, popup, default browser menu, or DevTools entry is available in a normal build.

## Terminal transport

- [ ] PowerShell 7 is selected when installed; otherwise Windows PowerShell, then Command Prompt.
- [ ] Unicode, ANSI color, resize, full-screen console applications, and rapid output render correctly.
- [ ] Large output remains responsive, ordering is preserved, and memory does not grow without bound.
- [ ] Closing the window terminates the shell and all descendants.
- [ ] Malformed Web Messages, stale buffer generations/sequences, invalid terminal dimensions, duplicate Glass IDs, and oversized clipboard payloads are rejected without terminating the UI or shell.

## Policy and accessibility

- [ ] Turning Windows transparency off selects a solid surface and automatically restores Glass when re-enabled.
- [ ] Disabling Advanced Effects selects Solid without creating the backdrop graph and restores Glass when re-enabled.
- [ ] High contrast uses opaque Windows system window/text colors and retains keyboard/screen-reader operability.
- [ ] Remote Desktop and energy saver select the solid fallback and restore Glass after the condition clears.
- [ ] Disabling Glass in settings selects a solid surface without changing the information hierarchy.
- [ ] Reduced client-area animations or an active screen reader suppresses decorative transitions and cursor blinking.
- [ ] Narrator reads terminal content in xterm screen-reader mode and does not lose focus when settings or paste confirmation closes.
- [ ] Windows light/dark preference does not silently override the user-selected Tone and foreground policy.

## Recovery

- [ ] Forced Composition initialization failure retries once, recreates an opaque non-Composition window, and still starts a working shell.
- [ ] Forced device loss rebuilds the Composition tree and WebView without losing the shell or reordering buffered output.
- [ ] Failed device recovery recreates the window in safe mode, keeps the shell alive, and exposes a stable failure reason.
- [ ] WebView renderer/process termination pauses output, recreates the WebView, rejects stale shared-buffer commits, and resumes the existing shell.
- [ ] More than three WebView failures in 60 seconds prompts for explicit retry or quit rather than looping.
- [ ] Sleep/resume, display-driver reset, monitor hot-plug, and DWM policy changes do not crash or leave a black surface.

## Packaging and release

- [ ] `npm run package:e2e`, `node scripts/verify-native-assets.mjs --e2e`, and `npm run test:e2e` pass on the supported client.
- [ ] If explicitly enabled, the clipboard E2E restores the original plain text even after a failed assertion.
- [ ] A fresh `npm run package` follows E2E packaging.
- [ ] `npm run verify:native-assets` confirms an x64 GUI PE, exact SHA-256 manifest, no forbidden runtime assets, and no E2E switch/marker.
- [ ] `npm run smoke:package` keeps the normal package healthy for five seconds.
- [ ] `npm run audit:production`, `npm run make`, and `npm run verify:installer` pass.
- [ ] The MSI installs per-machine, launches from Start, upgrades the previous version, and uninstalls without deleting user data.
- [ ] The draft release contains only the unsigned normal MSI and matching SHA-256 checksum; no `package-e2e` output is uploaded.

## Status for 0.3.0 Preview

GitHub-hosted Windows Server runners build and statically verify the x64 package and MSI but cannot perform the supported-client launch or visual checks. Complete every applicable item above on a Windows 11 24H2+ x64 client before publishing the draft release.
