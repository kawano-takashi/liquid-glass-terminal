# Native material QA checklist

Automated tests validate behavior and deterministic pseudo-glass screenshots. Native backdrop quality still requires a real interactive desktop.

Record the application version, OS build, display scale, GPU, compositor/session, theme, and result for every run.

## Common

- [ ] Window opens at 1100×720, honors 720×420 minimum, resizes smoothly, maximizes, restores, and keeps its shadow.
- [ ] Saved geometry is clamped after disconnecting or rearranging displays.
- [ ] Terminal remains readable in light/dark and Clear/Balanced/Dense; text is never refracted.
- [ ] Pointer reflection stops when idle/unfocused and disappears with reduced motion.
- [ ] High contrast and reduced transparency override decorative glass, then restore the chosen preset when disabled.
- [ ] 100%, 150%, and 200% scale show a sharp icon, titlebar controls, xterm glyphs, and drag targets.

## Windows

- [ ] Windows 11 22H2+ shows Acrylic behind a normal resizable/maximizable window.
- [ ] Windows 10 uses the opaque pseudo-glass fallback without broken transparency.
- [ ] PowerShell 7, Windows PowerShell, cmd, Git Bash, and installed non-system WSL distributions are detected correctly.
- [ ] Ctrl+C copies only with a selection; otherwise it reaches the PTY as interrupt.

## macOS

- [ ] macOS 12+ shows `under-window` Vibrancy and correctly placed traffic lights.
- [ ] Intel and Apple Silicon artifacts launch and load the matching node-pty binary.
- [ ] Cmd+C/Cmd+V use clipboard operations while Ctrl+C reaches the PTY.

## Linux

- [ ] GNOME Wayland and X11 show the same stable pseudo-glass composition and resizable window.
- [ ] KDE launches and functions; compositor-specific appearance differences are documented as best effort.
- [ ] DEB and RPM install, launch, expose the icon, and remove cleanly.

## Status for v0.1.0 Preview

CI package/launch smoke is required on all target architectures. Windows local visual QA is expected first; macOS and Linux native visual checks may remain explicitly marked pending when the draft release is created.
