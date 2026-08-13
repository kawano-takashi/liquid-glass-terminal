# Native material QA checklist

Automated tests validate mappings, migration, fallback selection, IPC validation, and renderer effect variables. Frosted-backdrop quality still requires a real interactive Windows 11 desktop.

Record the application version, Windows build and edition, display scale, GPU, theme, accessibility state, and result for every run.

## Host gate

- [ ] Windows 11 22H2+ x64 client launches normally.
- [ ] Windows 10 exits with the localized native unsupported-system dialog before creating settings or a PTY.
- [ ] Windows Server exits through the same gate.
- [ ] Windows on ARM, including an x64-emulated process, exits through the same gate.

## Window and material

- [ ] Window opens at 1100×720, honors the 720×420 minimum, resizes smoothly, maximizes, restores, and supports Snap.
- [ ] Saved geometry is clamped after disconnecting or rearranging displays.
- [ ] Acrylic stays active when the window loses focus; light/dark theme changes update its neutral recipe without restarting.
- [ ] At the 25% default, shapes and colors behind the window remain visible, background prose is unreadable, and terminal text remains readable.
- [ ] The 0% endpoint retains DWM frost while native tint and luminosity reach zero.
- [ ] At 0%, renderer noise, local blur, decorative fills, danger/bell fills, and text halo are absent; text, icons, cursor, selection, focus, and errors remain clear.
- [ ] The 0% and 50% endpoints are visibly different; changes preview live in 1% steps and survive restart.
- [ ] Settings, search, menus, dialogs, and toasts add no cumulative tint, visible rim, or shadow.
- [ ] High contrast, reduced transparency, and screen-reader mode use a safe opaque surface, disable the slider with a reason, and restore the saved opacity afterward.
- [ ] Forced native Acrylic failure also uses the opaque fallback without leaving transparent renderer CSS.
- [ ] The DWM colored rim is absent, corners use the small preference, and resize/Snap/maximize remain functional.
- [ ] Battery saver, Remote Desktop, disabled Windows transparency, and insufficient compositor capability remain readable.
- [ ] No screen-capture or screen-recording permission prompt appears.
- [ ] A package works after uninstalling the machine-wide Windows App Runtime; required self-contained DLLs sit beside the executable.
- [ ] 100%, 150%, and 200% scale show a sharp icon, titlebar controls, xterm glyphs, and drag targets.

## Terminal and input

- [ ] PowerShell 7, Windows PowerShell, cmd, Git Bash, and installed non-system WSL distributions are detected correctly.
- [ ] Ctrl+C copies only with a selection; otherwise it reaches the PTY as interrupt.
- [ ] Ctrl+Shift+V and both menus paste exactly once; Ctrl+V remains available to the PTY.
- [ ] Multiline paste always shows its preview, cancel inserts nothing, and payloads above 1 MiB still require confirmation.
- [ ] Copy and paste in the search field preserve its selection and do not send data to the terminal.

## Status for v0.2.0 Preview

GitHub CI builds and statically verifies the Windows x64 package on Windows Server but does not launch it. Package launch, E2E, compositor behavior, and final visual checks must be completed locally on a supported Windows 11 x64 client before publishing the draft release.
