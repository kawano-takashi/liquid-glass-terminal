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

Each tab owns one `MessageChannelMain`. PTY output carries a sequence number and UTF-8 byte count. The main process pauses the PTY at 256 KiB of unacknowledged output; xterm acknowledges from its `write` callback, and the PTY resumes below 64 KiB. Port loss, renderer failure, or tab closure kills the associated PTY tree.

OSC 0/2 supplies a sanitized, 80-grapheme tab title. OSC 7 is accepted only for a local `file://` host and an existing path in the same shell profile. Only an accepted OSC 7 path may flow into a newly opened tab; shell profiles are never modified or injected.

## Window material

The window remains a normal resizable window. Windows 11 build 22621+ requests Electron Acrylic; macOS requests `under-window` Vibrancy. Other systems use CSS pseudo glass. High contrast or reduced transparency switches to a dense, non-native fallback. Pointer light is decorative, frame-limited, and disabled for reduced motion.

## Persistence

Settings and window geometry are separate atomic JSON stores. Only settings, one-time hints, and clamped geometry persist. Tabs, PTYs, output, titles, and order never survive restart.
