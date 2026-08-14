# Architecture

Liquid Glass Terminal is a native Windows application with a web-authored content layer. Electron, layered transparent windows, Mica/Acrylic presets, and screen capture are not part of the runtime.

## Runtime topology

```text
Win32 HWND (C++20)
│
├─ Windows.UI.Composition / DesktopWindowTarget
│  └─ Root ContainerVisual
│     ├─ opaque safe-mode surface
│     ├─ shared HostBackdrop effect visual, clipped to all Glass regions
│     ├─ per-region tint and noise masks
│     ├─ per-region shadows, borders, and highlights
│     ├─ WebView2 composition visual
│     └─ native title-bar glyphs and hit-test overlay
│
├─ CoreWebView2CompositionController
│  └─ bundled React / TypeScript / xterm.js UI
│
├─ ConPTY + kill-on-close Job Object
│  └─ PowerShell 7, Windows PowerShell, or cmd
│
└─ Native services
   ├─ typed Web Message bridge
   ├─ WebView2 shared-buffer transport
   ├─ settings and window state
   ├─ clipboard and file drop
   ├─ system policy and DPI
   └─ diagnostics and recovery
```

The top-level window is always a C++ Win32 `HWND`. Composition mode uses `WS_EX_NOREDIRECTIONBITMAP` and publishes the visual tree through `DesktopWindowTarget`. If Composition cannot initialize, the window is recreated without that extended style and hosts an opaque windowed WebView2 controller. Standard `WS_OVERLAPPEDWINDOW` capabilities remain available in both modes.

## Glass renderer

The renderer uses `Windows.UI.Composition` rather than CSS or a captured image:

```text
HostBackdropBrush
      ↓
GaussianBlurEffect
      ↓
SaturationEffect
      ↓
one full-window SpriteVisual
      ↓
combined geometry clip for all visible Glass regions
```

Blur and saturation execute once for the visible region set. Each region then receives independent tint, a generated local noise brush, border, highlight, and shadow. Uniform rounded rectangles use `CompositionRoundedRectangleGeometry`; nonuniform corner radii use a Direct2D geometry exposed through `CompositionPath`. The protocol accepts at most 32 unique regions.

Material parameters are native, fixed presets:

| Preset  |    Blur | Saturation | Tint opacity | Noise opacity |
| ------- | ------: | ---------: | -----------: | ------------: |
| Clear   |  6 DIPs |       1.05 |         0.64 |         0.015 |
| Regular | 16 DIPs |       1.10 |         0.72 |         0.020 |
| Dense   | 30 DIPs |       1.15 |         0.82 |         0.025 |

The React layout reports only bounded region geometry and semantic roles. It cannot create effects or supply arbitrary effect values. Regions are converted from WebView DIPs to physical Composition coordinates in one native path. Terminal glyphs remain in the WebView layer above Glass and are never passed through decorative distortion.

The DWM host-backdrop attribute and `CreateHostBackdropBrush()` provide the pixels already owned by desktop composition. The application never captures, copies, stores, or replays pixels belonging to the desktop or another process.

## Window and input

The native window owns non-client behavior. `WM_NCHITTEST` returns standard resize, caption, minimize, maximize, and close hit-test values; DWM therefore retains Snap Layout behavior on the maximize control. Alt+Space opens the system menu, F11 toggles fullscreen, and `WM_DPICHANGED` applies the suggested monitor bounds.

The WebView occupies the client area below the 44-DIP native title bar. In Composition mode there is no child WebView window, so `WebViewInputRouter` forwards:

- mouse move, buttons, double-click, horizontal/vertical wheel, capture, and leave;
- Pointer messages for touch and pen using `ICoreWebView2PointerInfo`;
- focus and cursor updates;
- coordinates relative to the WebView bounds, with DPI and zoom handled centrally.

Keyboard and IME remain attached to the controller focus path. Input routing is intentionally centralized; Glass rendering and React components do not call Composition Controller input APIs.

## WebView2 host and web UI

`CoreWebView2CompositionController` places WebView output in the native visual tree. Its default background and `html`/`body`/`#root` are transparent while Glass is active. Solid and safe states switch the controller to an opaque background before hiding native Glass.

The host maps packaged `web/` assets to `https://app.liquid-glass-terminal.invalid/`. Only the exact `index.html` main-frame navigation is permitted. All other resource origins receive a synthetic 403 response. New windows, permissions, downloads, host objects, browser accelerator keys, default context menus, and release-build DevTools are disabled.

React owns ordinary application UI, localization, layout, settings, paste confirmation, and xterm.js. It never receives Node.js, COM, Win32, or raw WebView2 objects.

## Native/web protocol

`contracts/protocol.idl.json` is the source of truth. `npm run contracts:generate` creates both:

- `contracts/generated/protocol.ts` with discriminated unions and exact validators;
- `native/contracts/generated/Protocol.generated.h` with message names, bounds, and enum helpers.

Every envelope contains protocol version, type, and a type-specific payload. Unknown keys, invalid enum values, stale layout revisions, invalid buffer sequences, out-of-range terminal sizes, duplicate region IDs, oversized clipboard content, and messages from any other source are rejected.

Low-frequency control traffic uses JSON Web Messages. Terminal bytes do not:

```text
ConPTY output
  → bounded native queue
  → four 64-KiB read-only WebView2 shared buffers
  → terminal.output.ready
  → xterm write callback
  → terminal.output.ack

xterm input
  → two 64-KiB writable shared buffers
  → terminal.input.commit
  → native sequence/length validation
  → ConPTY input pipe
  → terminal.input.ack
```

Outstanding terminal data is capped at 256 KiB and resumes below 64 KiB. Buffer slots carry generation and sequence numbers so stale commits after WebView recovery cannot be replayed.

## Shell lifecycle

The native ConPTY host selects PowerShell 7 when installed, then Windows PowerShell, then `cmd.exe`. It does not accept an executable or argument list from the web UI. The shell starts suspended, is assigned to a Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, and only then resumes. Closing the app terminates the complete shell tree.

Dropped paths are accepted only from the native OLE drop target and are quoted for the active PowerShell or Command Prompt grammar before being sent to React for insertion. Clipboard reads and writes are bounded native operations; multiline paste requires an explicit web confirmation.

## Settings and local data

Settings and window state live under `%LOCALAPPDATA%\Liquid Glass Terminal`. The settings drawer starts a native transaction:

1. preview applies an in-memory candidate;
2. apply writes a temporary file and atomically replaces `settings-v1.json`;
3. cancel restores the committed value;
4. invalid persisted JSON is isolated with an `.invalid-*` suffix.

The same directory contains the WebView2 profile and rotating `logs/app.log` files. No application state is synchronized or uploaded.

## Policy and fallback

`SystemPolicy` observes:

- Windows transparency and overlapped-content policy;
- high contrast;
- client-area animation and active UI Automation clients;
- Remote Desktop;
- energy saver.

Disabled transparency, high contrast, Remote Desktop, energy saver, or user opt-out selects a solid surface without changing saved Glass preferences. High contrast uses Windows system window/text colors. Reduced animation and screen-reader state stop decorative motion and cursor blinking. Policy changes are sent to React through `capabilities.changed`.

Three runtime appearance states are exposed:

| State   | Meaning                                                                           |
| ------- | --------------------------------------------------------------------------------- |
| `glass` | Host backdrop and native material are active.                                     |
| `solid` | Expected policy/user fallback; application remains fully usable.                  |
| `safe`  | Composition update or device recovery failed; opaque emergency surface is active. |

Composition initialization gets two attempts. Device loss first rebuilds the Composition tree and WebView target; if that fails, the `HWND` and WebView are recreated in opaque mode while the ConPTY session and shared transport remain alive. WebView process failure pauses transport and recreates the UI; repeated failures within 60 seconds require an explicit retry or quit choice.

## Packaging

Vite emits static UI assets and MSBuild links one x64 GUI executable with the static WebView2 loader. The staged package contains the executable, web assets, licenses, metadata, and a SHA-256 file manifest—no Electron, Node.js, `.node` module, or application DLL. WiX 7 creates a per-machine MSI.

The E2E configuration is separately compiled with loopback WebView inspection support and an `E2E-ONLY.json` marker. Release verification fails if that switch or marker appears in the normal package.
