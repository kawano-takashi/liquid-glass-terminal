# Native material QA checklist

Automated tests validate mappings, migration, fallback selection, IPC validation, and dark-only renderer behavior. Frosted-backdrop quality still requires a real interactive Windows 11 desktop.

Record the application version, Windows build and edition, display scale, GPU, Windows color setting, accessibility state, and result for every run.

## Host gate

- [ ] Windows 11 22H2+ x64 client launches normally.
- [ ] Windows 10 exits with the localized native unsupported-system dialog before creating settings or a PTY.
- [ ] Windows Server exits through the same gate.
- [ ] Windows on ARM, including an x64-emulated process, exits through the same gate.

## Window and material

- [ ] Window opens at 1100×720, honors the 720×420 minimum, resizes smoothly, maximizes, restores, and supports Snap.
- [ ] Saved geometry is clamped after disconnecting or rearranging displays.
- [ ] Frost stays active when the window loses focus; switching Windows between light and dark leaves the renderer, titlebar, menus, xterm palette, and `#181818` tint dark without restarting.
- [ ] At the 25% / 7-of-14 defaults, shapes and colors behind the window remain visible, background prose is unreadable, and terminal text remains readable.
- [ ] The 0% glass endpoint removes tint but retains the custom HostBackdrop blur; control fills and the terminal text halo remain readable.
- [ ] The 100% glass endpoint is completely opaque and does not expose stale desktop pixels while resizing.
- [ ] All 14 frost levels (8, 10, 12, 14, 17, 20, 24, 28, 33, 39, 46, 54, 63, 74 DIPs) differ progressively, preview live, and survive restart.
- [ ] Static noise remains approximately 3%, appears behind terminal content only, and does not cover titlebar, settings, search, menus, dialogs, or toasts.
- [ ] Settings, search, menus, dialogs, and toasts add no local CSS blur, cumulative tint, visible rim, or shadow.
- [ ] High contrast keeps the app's dark colors, suppresses Windows forced-color replacement, uses a safe opaque surface, hides noise, disables both appearance sliders with a reason, and restores both saved values afterward.
- [ ] Reduced transparency and screen-reader mode use the same opaque dark surface and restore both saved values afterward.
- [ ] Energy saver, Remote Desktop, and disabled Windows transparency follow the same opaque policy and automatically restore frost when policy clears.
- [ ] An unsupported or non-fast compositor fails startup after two total attempts with a localized stable error code and creates no PTY.
- [ ] A forced runtime effect failure rebuilds once; a failed rebuild keeps every PTY alive, uses an opaque surface, and shows persistent restart guidance.
- [ ] The DWM colored rim is absent, corners use the small preference, and resize/Snap/maximize remain functional.
- [ ] No screen-capture or screen-recording permission prompt appears.
- [ ] A package works without a machine-wide Windows App Runtime and does not stage Windows App SDK DLLs beside the executable.
- [ ] 100%, 150%, and 200% scale show a sharp icon, titlebar controls, xterm glyphs, and drag targets.

## Terminal and input

- [ ] PowerShell 7, Windows PowerShell, cmd, Git Bash, and installed non-system WSL distributions are detected correctly.
- [ ] Ctrl+C copies only with a selection; otherwise it reaches the PTY as interrupt.
- [ ] Ctrl+Shift+V and both menus paste exactly once; Ctrl+V remains available to the PTY.
- [ ] Multiline paste always shows its preview, cancel inserts nothing, and payloads above 1 MiB still require confirmation.
- [ ] Copy and paste in the search field preserve its selection and do not send data to the terminal.

## Status for v0.2.0 Preview

GitHub CI builds and statically verifies the Windows x64 package on Windows Server but does not launch it. Package launch, E2E, compositor behavior, and final visual checks must be completed locally on a supported Windows 11 x64 client before publishing the draft release.
