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
        ├─ Electron backgroundMaterial: acrylic ── translucent Chromium surface only
        ├─ DWM system backdrop: NONE
        ├─ Windows.UI.Composition DesktopWindowTarget
        │      HostBackdrop
        │        → GaussianBlur (Quality + hard border, 8–74 DIPs)
        │        → Saturation (1.10)
        │        → fixed dark tint (#181818)
        └─ renderer ── fixed controls + text halo; static 3% terminal-only noise
```

The application uses a normal resizable, maximizable, Snap-compatible BrowserWindow; it does not use Electron's `transparent: true` mode. Electron's `backgroundMaterial: 'acrylic'` is used only to establish Chromium's internal translucent surface. Native code immediately sets `DWMWA_SYSTEMBACKDROP_TYPE` to `NONE`, extends the frame, and attaches one client-sized Composition visual tree. The app never calls Electron's material setter with `none`, and no component captures, stores, or redraws desktop pixels.

The visual source is `CreateHostBackdropBrush()`. A Direct2D Gaussian blur configured for Quality optimization and hard borders feeds a fixed Saturation 1.10 effect. A dark `#181818` color sprite is layered above it. `glassOpacity` is an integer from 0 to 100 in steps of 5 and directly controls that sprite's opacity. `frostStrength` is an integer index from 0 to 13:

```text
index:  0   1   2   3   4   5   6   7   8   9  10  11  12  13
blur:   8  10  12  14  17  20  24  28  33  39  46  54  63  74 DIPs
```

The defaults are 25% glass opacity and frost index 6 (shown as 7/14). At 0% the tint is absent but the blur visual remains active. At 100% the tint is fully opaque and the blur visual is hidden so unnecessary blur work is bypassed. There are no local CSS `backdrop-filter` layers. Control fills, danger/bell fills, and the terminal text halo stay fixed for readability; static 3% noise sits behind terminal content only and is removed for opaque policy/failure output.

The native addon uses only Windows system APIs. Its strict capability probe requires active DWM composition, a hardware Direct3D 11 feature-level 11 adapter (software adapters are rejected), and successful creation of the exact Windows.UI.Composition effect graph. This is also run when policy currently disables transparency. Initialization gets two total attempts; failure shows a localized dialog with a stable code and exits before any PTY is created. No Windows App SDK runtime is staged or loaded.

The main process is the source of truth for material status. High contrast, reduced transparency, screen-reader mode, disabled advanced effects, energy saver, or Remote Desktop switches the attached tree and renderer to an opaque dark surface without replacing the app's colors with Windows forced colors. Both appearance sliders are disabled with a reason, saved values remain untouched, and polling plus native change notifications restore frost automatically. A runtime exception or capability loss permits one detach/probe/reattach cycle. If that fails—or a later failure occurs—the opaque fallback is sticky until restart, existing PTYs stay alive, and the renderer displays persistent nonmodal guidance.

## Persistence

Settings and window geometry are separate atomic JSON stores. Settings schema v4 stores integer `glassOpacity` and `frostStrength`. Any pre-v4 record resets appearance to the new defaults (25% and index 6) while preserving unrelated settings. Legacy `theme`, `glass`, and `backgroundOpacity` keys are removed. A valid v4 record is idempotent.

Only settings, one-time hints, and clamped geometry persist. Tabs, PTYs, output, titles, and order never survive restart.
