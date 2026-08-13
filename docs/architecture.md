# Architecture

## Processes and trust boundaries

```text
React + xterm renderer
        │ narrow, typed preload API
        │ one MessagePort per terminal
        ▼
Electron main process ── node-pty ── local shell and children
        │
        ├─ electron-store settings/window state
        └─ OS window material, menu, external browser delegation
```

The renderer is context-isolated, sandboxed, and has no Node integration. It can request a known shell profile ID but never sends an executable or argument list. Main-frame origin, request shape, bounds, ownership, and URL scheme are validated at every IPC boundary.

## Terminal flow control

Each tab owns one `MessageChannelMain`. The renderer receives its port before the PTY starts, then waits for an explicit `ready` message; this keeps startup output and early input queued instead of racing port transfer. PTY output carries a sequence number and UTF-8 byte count. The main process pauses the PTY at 256 KiB of unacknowledged output; xterm acknowledges from its `write` callback, and the PTY resumes below 64 KiB. Port loss, renderer failure, or tab closure kills the associated PTY tree.

OSC 0/2 supplies a sanitized, 80-grapheme tab title. OSC 7 is accepted only for a local `file://` host and an existing path in the same shell profile. Only an accepted OSC 7 path may flow into a newly opened tab; shell profiles are never modified or injected.

## Window material

```text
live system + accessibility state
        │
        ├─ Windows 11 build 22621+ ── Node-API HWND bridge ── DesktopAcrylicController
        ├─ macOS 12+ ─────────────────────────────────────── under-window Vibrancy
        └─ Windows 10 / Linux / unsupported native path ─── opaque CSS pseudo glass
```

The window remains a normal resizable window. On Windows, Electron creates an alpha-capable surface and the self-contained Windows App SDK 2.3 runtime owns the actual Acrylic backdrop through the documented `DesktopAcrylicController.SetTarget` API. The controller stays input-active while the window is unfocused. macOS uses `under-window` Vibrancy with an active visual-effect state. No branch captures, stores, or redraws the desktop.

The main process is the source of truth for both the system appearance and the glass mode actually applied. It publishes them as one atomic renderer event so native initialization failure cannot leave transparent CSS over an opaque window. High contrast, reduced transparency, or screen-reader mode detaches native material and switches to an opaque pseudo treatment; disabling the override restores the selected Clear, Balanced, or Dense preset.

## Persistence

Settings and window geometry are separate atomic JSON stores. Only settings, one-time hints, and clamped geometry persist. Tabs, PTYs, output, titles, and order never survive restart.
