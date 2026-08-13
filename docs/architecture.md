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
        └─ Windows 10 / Linux / unsupported native path ─── opaque neutral surface
```

The window remains a normal resizable window. On Windows, Electron creates an alpha-capable surface. The transient DWM host backdrop supplies the fixed system frost, while the self-contained Windows App SDK 2.3 `DesktopAcrylicController.SetTarget` layer supplies the neutral dark or light tint, 35–85% user opacity, and matching luminosity recipe. Together they form one window-wide substrate; renderer surfaces do not stack their own tint. The controller stays input-active while the window is unfocused. The native bridge reapplies a borderless small-corner policy after selecting the backdrop, preserving resize and snap behavior. A deterministic C++/WinRT DLL alias lets the unpackaged Electron host resolve the bundled backdrop factory without machine-wide registration. macOS uses `under-window` Vibrancy with one neutral tint layer. No branch captures, stores, or redraws the desktop.

The main process is the source of truth for system appearance, the material actually applied, and its availability state (`active`, accessibility-disabled, unsupported, or system-fallback). It publishes them as one atomic renderer event so native initialization failure cannot leave transparent CSS over an opaque window. The renderer uses one tint layer only; titlebar, terminal, drawers, and dialogs do not accumulate additional tint. High contrast, reduced transparency, or screen-reader mode detaches native material and switches to an opaque treatment. The 35–85% slider is disabled with a reason while the saved value remains intact.

## Persistence

Settings and window geometry are separate atomic JSON stores. Settings schema v2 stores integer `glassOpacity`; schema v1 Clear, Balanced, and Dense values migrate to 45%, 60%, and 75%. Only settings, one-time hints, and clamped geometry persist. Tabs, PTYs, output, titles, and order never survive restart.
