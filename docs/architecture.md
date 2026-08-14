# Architecture

Liquid Glass Terminal is a native Windows application with a web-authored content layer. Electron, layered transparent windows, Mica/Acrylic presets, and screen capture are not part of the runtime.

## Runtime topology

```text
Win32 HWND (C++20)
│
├─ Windows.UI.Composition / DesktopWindowTarget
│  └─ Root ContainerVisual
│     ├─ opaque safe-mode surface
│     ├─ one full-client HostBackdrop effect visual
│     ├─ full-client grayscale tone and optional grain
│     ├─ overlay tone, grain, border, and shadow masks
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
SaturationEffect (fixed at 1.0)
      ↓
one full-client SpriteVisual
```

Blur and saturation execute once for the entire client. Glass opacity linearly controls the contribution of that blurred visual while retaining the Frost-selected blur radius. The base grayscale tone uses the same opacity, grain alpha is multiplied by it, and overlay density is a proportional 1.18× boost. Settings, context menus, paste confirmation, notices, and toasts report WebView-local geometry so native masks can add density and borders without another blur pass. Uniform rounded rectangles use `CompositionRoundedRectangleGeometry`; nonuniform corner radii use a Direct2D geometry exposed through `CompositionPath`. The protocol accepts at most 32 unique overlay regions.

Frost thickness selects one of the COSMIC-compatible blur values below. Presets are exact tuples and become `Custom` in the UI when any value differs.

```text
index:     0  1  2  3  4  5  6   7   8   9  10  11  12  13
blur DIP:  0  2  3  4  5  6  9  12  16  22  30  41  55  74
```

| Preset  | Frost | Opacity | Tone | Grain |
| ------- | ----: | ------: | ---: | ----: |
| Clear   |     5 |     20% |   92 |     0 |
| Regular |    10 |     35% |   92 |     0 |
| Dense   |    12 |     50% |   92 |     0 |

Tone 0–100 maps to equal sRGB channels; grain 0–100 maps to 0–3% alpha before Glass opacity is applied. At 0%, the backdrop, tint, grain, overlay masks, and passive borders are hidden and their unnecessary resources are released; at 100%, the opaque tone suppresses backdrop sampling. React scales only passive control surfaces, separators, scrollbars, shadows, and modal scrims by the same value. Text, terminal glyphs, focus, hover, selection, and error feedback remain visible, and CSS never creates a desktop effect. Regions are converted from WebView CSS coordinates to physical Composition coordinates in one native path. Terminal glyphs remain in the WebView layer above Glass and are never passed through decorative distortion.

The DWM host-backdrop attribute and `CreateHostBackdropBrush()` provide the pixels already owned by desktop composition. The application never captures, copies, stores, or replays pixels belonging to the desktop or another process.

## Window and input

The native window owns non-client behavior. In Composition mode `WM_NCHITTEST` gives DWM and resize edges priority, then native caption controls, then WebView2 app regions. The maximize control returns `HTMAXBUTTON`, preserving Snap Layout. Alt+Space opens the system menu, F11 toggles fullscreen, and `WM_DPICHANGED` applies the suggested monitor bounds. Non-Composition fallback delegates non-client behavior to the standard Windows frame.

The WebView occupies the full client in Composition mode. React draws the centered title and settings button in a fixed 56-DIP header, while native Composition draws the three 46-DIP caption controls above it. WebView2 app regions mark draggable and interactive areas. In Composition mode there is no child WebView window, so `WebViewInputRouter` forwards:

- mouse move, buttons, double-click, horizontal/vertical wheel, capture, and leave;
- Pointer messages for touch and pen using `ICoreWebView2PointerInfo`;
- focus and cursor updates;
- coordinates relative to the WebView bounds without reapplying DPI or zoom to physical pointer input.

Keyboard and IME remain attached to the controller focus path. Input routing is intentionally centralized; Glass rendering and React components do not call Composition Controller input APIs.

## WebView2 host and web UI

`CoreWebView2CompositionController` places WebView output in the native visual tree. Its default background and `html`/`body`/`#root` are transparent while Glass is active. Solid and safe states switch the controller to an opaque background before hiding native Glass.

The host maps packaged `web/` assets to `https://app.liquid-glass-terminal.invalid/`. Only the exact `index.html` main-frame navigation is permitted. All other resource origins receive a synthetic 403 response. New windows, permissions, downloads, host objects, browser accelerator keys, default context menus, and release-build DevTools are disabled.

React owns ordinary application UI, localization, layout, settings, paste confirmation, and xterm.js. It never receives Node.js, COM, Win32, or raw WebView2 objects.

## Native/web protocol

`contracts/protocol.idl.json` is the source of truth for protocol messages, settings fields and bounds, defaults, preset tuples, blur values, and shared chrome metrics. `npm run contracts:generate` creates both:

- `contracts/generated/protocol.ts` with discriminated unions and exact validators;
- `native/contracts/generated/Protocol.generated.h` with message names, bounds, settings metadata, material tables, and validation helpers.

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
2. apply writes a temporary file and atomically replaces `settings-v2.json`;
3. cancel restores the committed value;
4. invalid persisted JSON is isolated with an `.invalid-*` suffix.

Window placement uses `window-state-v2.json`; v1 files are neither imported nor deleted. The same directory contains the WebView2 profile and rotating `logs/app.log` files. No application state is synchronized or uploaded.

## Policy and fallback

`SystemPolicy` observes:

- Windows transparency and overlapped-content policy;
- `UISettings.AdvancedEffectsEnabled` and Composition effect capability;
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
