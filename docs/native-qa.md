# Native material QA checklist

Automated tests validate mappings, migration, fallback selection, IPC validation, and both renderer palettes. Frosted-backdrop quality and the zero-blur HostBackdrop still require a real interactive Windows 11 desktop.

Record the application version, Windows build and edition, display scale, GPU, Windows color setting, accessibility state, and result for every run.

## Host gate

- [ ] Windows 11 22H2+ x64 client launches normally.
- [ ] Windows 10 exits with the localized native unsupported-system dialog before creating settings or a PTY.
- [ ] Windows Server exits through the same gate.
- [ ] Windows on ARM, including an x64-emulated process, exits through the same gate.

## Window and material

- [ ] Window opens at 1100×720, honors the 720×420 minimum, resizes smoothly, maximizes, restores, and supports Snap.
- [ ] Saved geometry is clamped after disconnecting or rearranging displays.
- [ ] Frost stays active when the window loses focus; switching Windows between light and dark does not override the surface, renderer palette, titlebar symbols, menus, or xterm palette.
- [ ] At the neutral / 7-of-14 defaults (9 DIPs), shapes, colors, and placement behind the window remain distinguishable, background prose is softened, and terminal text remains readable.
- [ ] At neutral contrast and frost level 1, HostBackdrop remains visible with Gaussian blur disabled at 0 DIPs; the background is sharp and never replaced by an unintended black window surface.
- [ ] Glass contrast remains enabled at frost level 1, previews and persists normally, and produces the same white/black overlays as levels 2–14.
- [ ] White −100% and black +100% are completely opaque, bypass blur work, and do not expose stale desktop pixels while resizing.
- [ ] Negative contrast adds only white, positive contrast adds only black, and neutral 0% adds no color sprite.
- [ ] At every active frost level, crossing from white −45% to −50% switches UI text, titlebar symbols, xterm colors, control fills, and terminal halo together without restarting the shell or losing terminal output.
- [ ] Returning above white −50% or entering any fallback switches back to light foregrounds.
- [ ] All 14 frost levels (0, 2, 3, 4, 5, 6, 9, 12, 16, 22, 30, 41, 55, 74 DIPs) differ progressively against the same high-detail background, preview live, and survive restart.
- [ ] At frost level 14 (74 DIPs), normal-size background prose is unreadable and the result is visibly stronger than levels 12 and 13.
- [ ] No static noise texture appears anywhere in the titlebar, terminal, settings, search, menus, dialogs, or toasts.
- [ ] Settings, search, menus, dialogs, and toasts add no local CSS blur, cumulative tint, visible rim, or shadow.
- [ ] High contrast keeps the app's dark fallback colors, suppresses Windows forced-color replacement, uses an opaque `#181818` surface with light foregrounds, disables both appearance sliders with a reason, and restores both saved values afterward.
- [ ] Reduced transparency and screen-reader mode use the same opaque dark surface and restore both saved values afterward.
- [ ] Energy saver, Remote Desktop, and disabled Windows transparency follow the same opaque policy and automatically restore frost when policy clears.
- [ ] An unavailable addon, unsupported compositor, or non-fast compositor gets two total startup attempts, then opens an opaque `#181818` terminal with light foregrounds, disabled appearance sliders, persistent restart guidance, and the corresponding stable error code.
- [ ] The startup fallback creates a working PTY, stays unavailable without further native retries, and remains resizable, maximizable, and Snap-compatible.
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
