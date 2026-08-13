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
        │        → GaussianBlur (Quality + hard border, 0–74 DIPs)
        │        → optional white/black contrast sprite
        └─ renderer ── adaptive controls, terminal palette, and text halo
```

The application uses a normal resizable, maximizable, Snap-compatible BrowserWindow; it does not use Electron's `transparent: true` mode. Electron's `backgroundMaterial: 'acrylic'` is used only to establish Chromium's internal translucent surface. Native code immediately sets `DWMWA_SYSTEMBACKDROP_TYPE` to `NONE`, extends the frame, and attaches one client-sized Composition visual tree. The active and policy-disabled paths never call Electron's material setter with `none`; a sticky native failure does so before switching to the opaque fallback. No component captures, stores, or redraws desktop pixels.

The visual source is `CreateHostBackdropBrush()`, and the only effect is a Direct2D Gaussian blur configured for Quality optimization and hard borders. Electron exposes system-material selection but not a blur-amount control, so the adjustable Composition graph, HWND validation, DWM policy, and OS capability queries remain isolated in the C++ Node-API addon. A separate color sprite implements signed `glassContrast`: negative values overlay white, zero hides the sprite, and positive values overlay black. It is an integer from −100 to 100 in steps of 5. `frostStrength` is an integer index from 0 to 13:

```text
index:  0   1   2   3   4   5   6   7   8   9  10  11  12  13
blur:   0   2   3   4   5   6   9  12  16  22  30  41  55  74 DIPs
```

The defaults are neutral contrast and frost index 6 (shown as 7/14), which resolves to 9 DIPs. The main process converts the saved index to a blur amount before calling the native addon. Frost index 0 keeps the backdrop visual attached and sets Gaussian blur to 0 DIPs, which disables the blur effect; contrast remains enabled and follows the same rules as indices 1–13. At neutral contrast this passes through a sharp HostBackdrop. At either ±100% contrast endpoint, the contrast sprite is fully opaque and the backdrop visual is hidden to bypass unnecessary effect work. There are no local CSS `backdrop-filter` layers and no renderer noise texture.

When the native backdrop is active and contrast is white −50% or stronger, the renderer uses a dark-foreground/light-surface palette at every frost level. Every other active combination uses the light-foreground palette. xterm changes theme in place, retains its 4.5 minimum contrast correction, and uses transparent `#808080` as the conservative contrast reference at the −50% switch point. UI variables, terminal text halo, and title-bar symbols switch together. Policy-disabled and unavailable states always use an opaque `#181818` fallback with light foregrounds. Windows light/dark color preference does not select the palette; the user's contrast value does.

The native addon uses only Windows system APIs. Its strict capability probe requires active DWM composition, a hardware Direct3D 11 feature-level 11 adapter (software adapters are rejected), and successful creation of the exact Windows.UI.Composition effect graph. This is also run when policy currently disables transparency. Initialization gets two total attempts. If both fail, the main process retains the stable failure code, detaches native state, disables Electron's material, and continues startup with an opaque `#181818` surface. The unavailable state is sticky until restart, but the renderer and new PTYs remain usable. No Windows App SDK runtime is staged or loaded.

The main process is the source of truth for material status. High contrast, reduced transparency, screen-reader mode, disabled advanced effects, energy saver, or Remote Desktop switches the attached tree and renderer to an opaque dark surface without replacing the app's colors with Windows forced colors. Both appearance sliders are disabled with a reason, saved values remain untouched, and polling plus native change notifications restore frost automatically. A runtime exception or capability loss permits one detach/probe/reattach cycle. If that fails—or a later failure occurs—the app enters the same sticky unavailable state, existing PTYs stay alive, and the renderer displays persistent nonmodal guidance with the stable failure code.

## Persistence

Settings and window geometry are separate atomic JSON stores. Settings schema v5 stores integer `glassContrast` and `frostStrength`. Every pre-v5 record resets appearance to the new defaults (neutral contrast and index 6) while preserving unrelated settings. Legacy `theme`, `glass`, `glassOpacity`, and `backgroundOpacity` keys are removed. A migrated v5 record is then stable.

Only settings, one-time hints, and clamped geometry persist. Tabs, PTYs, output, titles, and order never survive restart.
