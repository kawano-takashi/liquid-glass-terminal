# Native material QA checklist

Automated tests validate behavior and deterministic pseudo-glass screenshots. Native backdrop quality still requires a real interactive desktop.

Record the application version, OS build, display scale, GPU, compositor/session, theme, and result for every run.

## Common

- [ ] Window opens at 1100×720, honors 720×420 minimum, resizes smoothly, maximizes, and restores without a visible app-drawn border or shadow.
- [ ] Saved geometry is clamped after disconnecting or rearranging displays.
- [ ] At the 60% default, large shapes and colors behind the window remain visible, background prose is unreadable, and terminal text remains readable in light and dark themes.
- [ ] The 10% and 60% endpoints are visibly different; changes preview live in 1% steps and survive restart.
- [ ] Settings, search, menus, dialogs, and toasts add no backdrop dimming, cumulative tint, visible rim, or shadow.
- [ ] High contrast, reduced transparency, and screen-reader mode detach native material, become fully opaque, disable the slider with a reason, then restore the saved opacity when disabled.
- [ ] No screen-capture or screen-recording permission prompt appears.
- [ ] 100%, 150%, and 200% scale show a sharp icon, titlebar controls, xterm glyphs, and drag targets.
- [ ] Keyboard, Edit menu, and terminal context menu paste exactly once into the active terminal.
- [ ] Multiline paste always shows its preview, cancel inserts nothing, and payloads above 1 MiB still require confirmation.
- [ ] Copy and paste in the search field preserve its selection and do not send data to the terminal.

## Windows

- [ ] Windows 11 22H2+ shows Acrylic behind a normal resizable/maximizable window.
- [ ] Acrylic remains visible when the window loses focus, and light/dark theme changes update neutral tint and luminosity without restarting.
- [ ] Native Acrylic reports Active/Fallback/HighContrast correctly; Fallback is opaque and preserves the saved slider value.
- [ ] The DWM colored rim is absent, corners use the small preference, and resize/snap/maximize remain functional.
- [ ] Battery saver, Remote Desktop, disabled Windows transparency, and insufficient compositor capability use the documented safe fallback.
- [ ] A package works after uninstalling the machine-wide Windows App Runtime (the self-contained DLLs are beside the executable).
- [ ] Windows 10 uses the opaque pseudo-glass fallback without broken transparency.
- [ ] PowerShell 7, Windows PowerShell, cmd, Git Bash, and installed non-system WSL distributions are detected correctly.
- [ ] Ctrl+C copies only with a selection; otherwise it reaches the PTY as interrupt.
- [ ] Ctrl+Shift+V pastes, while Ctrl+V remains available to the PTY.

## macOS

- [ ] macOS 12+ shows `under-window` Vibrancy and correctly placed traffic lights.
- [ ] Vibrancy remains active when the window loses focus.
- [ ] Intel and Apple Silicon artifacts launch and load the matching node-pty binary.
- [ ] Cmd+C/Cmd+V use clipboard operations from both keyboard and menus while Ctrl+C reaches the PTY.

## Linux

- [ ] GNOME Wayland and X11 show the same stable pseudo-glass composition and resizable window.
- [ ] KDE launches and functions; compositor-specific appearance differences are documented as best effort.
- [ ] Ctrl+Shift+V and both menus paste under X11 and Wayland while Ctrl+V remains available to the PTY.
- [ ] DEB and RPM install, launch, expose the icon, and remove cleanly.

## Status for v0.1.0 Preview

CI package/launch smoke is required on all target architectures. Windows local visual QA is expected first; macOS and Linux native visual checks may remain explicitly marked pending when the draft release is created.
