# Architecture

## Processes and trust boundaries

```text
React + xterm renderer
        │ narrow, typed preload API
        │ one MessagePort per terminal
        ▼
Electron main process ── node-pty / ConPTY ── local shell and children
        │
        ├─ electron-store settings/window state
        └─ Windows material, menu, and external-browser delegation
```

The renderer is context-isolated, sandboxed, and has no Node integration. It can request a detected shell profile ID but never sends an executable or argument list. Main-frame origin, request shape, bounds, ownership, and URL scheme are validated at every IPC boundary.

At startup the main process verifies Windows, x64 Electron, native x64 Windows, build 22621+, and `InstallationType=Client`. Unsupported systems receive a native error dialog and exit before settings, profile discovery, or PTY creation.

## Terminal flow control

Each tab owns one `MessageChannelMain`. The renderer receives its port before the PTY starts, then waits for an explicit `ready` message. PTY output carries a sequence number and UTF-8 byte count. The main process pauses the PTY at 256 KiB of unacknowledged output; xterm acknowledges from its `write` callback, and the PTY resumes below 64 KiB. Port loss, renderer failure, or tab closure kills the associated PTY tree.

OSC 0/2 supplies a sanitized, 80-grapheme tab title. OSC 7 is accepted only for a local `file://` host and an existing path in the same shell profile. Only an accepted OSC 7 path may flow into a newly opened tab; shell profiles are never modified or injected.

## Window material

```text
Windows 11 22H2+ x64 client
        │
        ├─ DWM transient system backdrop ───────── fixed frost / blur
        ├─ Windows App SDK DesktopAcrylicController ─ tint + luminosity
        └─ renderer effect variables ───────────── noise / local blur / fills / halo
```

The application uses a normal resizable, maximizable, Snap-compatible BrowserWindow; it does not use Electron's `transparent: true` mode. The native bridge keeps the DWM transient backdrop active and attaches a self-contained Windows App SDK 2.3 Acrylic controller. It reapplies a borderless small-corner policy while preserving standard window behavior. No component captures, stores, or redraws the desktop.

`backgroundOpacity` is an integer from 0 to 50. Native values are linear:

```text
strength = backgroundOpacity / 50
tint opacity = backgroundOpacity / 100
luminosity opacity = 0.59 × strength
```

Thus 0% maps to 0/0, the 25% default maps to 0.25/0.295, and 50% maps to 0.50/0.59. The renderer uses the same strength for decorative noise, local `backdrop-filter` blur, translucent control fills, danger/bell fills, and the terminal text halo. All reach zero at the slider's 0% endpoint; functional text, icons, cursor, selection, focus, and error color remain visible.

The main process is the source of truth for system appearance and native material availability. High contrast, reduced transparency, screen-reader mode, an unavailable addon, or a runtime controller failure switches to a safe opaque pseudo material. The renderer then uses full-strength readable controls, the slider is disabled with a reason, and its saved value is retained.

## Persistence

Settings and window geometry are separate atomic JSON stores. Settings schema v3 stores integer `backgroundOpacity`. Migration rules are deterministic:

- v2 `glassOpacity` values from 0 to 50 are preserved, values above 50 become 50, and values below 0 become 0.
- Invalid v2 values become the 25% default.
- v1 Clear, Balanced, and Dense presets become 10%, 25%, and 40%.
- Legacy `glass` and `glassOpacity` keys are removed.

Only settings, one-time hints, and clamped geometry persist. Tabs, PTYs, output, titles, and order never survive restart.
