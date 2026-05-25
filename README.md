<p align="center">
  <img src="apps/desktop/resources/icon.svg" alt="Ceer logo" width="128" height="128" />
</p>

<h1 align="center">Ceer</h1>

<p align="center">
  Screen recorder for desktop and browser — capture screens, windows, or a custom region, mix mic and system audio, then export.
</p>

## Features

| | **Desktop** (`bun run dev`) | **Browser** (`bun run dev:web`) |
|---|---------------------------|--------------------------------|
| Capture | Source grid, **area crop**, tray/HUD switching | Browser **share picker** (tab / window / screen) |
| Background control | Menu bar **tray** + floating **HUD** | — |
| System audio | macOS loopback via Electron | Shared tab audio when the browser provides it (Chrome); often none on Firefox/Zen for window/screen |
| Microphone | Mixed in renderer | Optional; attach after share |
| Export | MP4, MOV, WebM at multiple resolutions | Same |

Shared everywhere:

- **Live preview** — arm or share a target, verify framing and audio, then record
- **Recording** — `MediaRecorder` → WebM (VP9/VP8 + Opus)
- **Export** — transcode with [mediabunny](https://github.com/nickdesaulniers/mediabunny)
- **Packaging** — macOS `.dmg` and Windows NSIS installer (desktop app only)

### Platform notes

#### Desktop (Electron)

| Topic | Behavior |
|-------|----------|
| **Targets** | Screens and windows from the sidebar or tray menu. No OS share dialog — the main process selects via `desktopCapturer`. |
| **Region snip** | Fullscreen overlay with a source strip (switch targets live), background preview, then drag a rectangle. |
| **System audio** | macOS 13+ with Screen Recording permission. Loopback is most reliable for **full-screen** capture; single-window capture may have no system audio. |
| **Microphone** | `getUserMedia` — allow access when macOS or Windows prompts. |
| **Tray** | Pick targets, snip, refresh the list, start/stop, show the main window, show/hide the control bar, or quit. While recording, the tooltip shows elapsed time. Tray selection arms preview without stealing focus from other apps. |
| **Control bar (HUD)** | Small floating bar (timer, record/stop, open app, hide bar). Appears when a target is armed or while recording. The main window hides during capture and reopens for export after stop. |
| **Lifecycle** | Close/minimize hides to the tray (use **Quit** in the menu to exit). Notifications on start/stop; click to focus the app. |

**macOS**

- **Screen Recording permission** is required to list screens/windows and capture video. If sources fail to load, open **System Settings → Privacy & Security → Screen & System Audio Recording** and enable the app you are actually running.
- **Development vs packaged app:** `bun run dev:desktop` launches the Electron binary (`Electron` or **Ceer (Dev)** in the list). A built **Ceer.app** is a separate entry (`Ceer` / **Ceer.app**). macOS tracks permissions per binary, so you may see two Ceer-related rows — enable the one that matches how you launched the app, or reset stale entries with `tccutil reset ScreenCapture` and grant again on next launch.
- Apps in a native fullscreen Space often disappear from the **Windows** list — choose the matching **Screen** instead.
- Screen picks store a `displayId` so the same monitor stays selected after Exposé or Mission Control even when Electron source IDs change.
- Tray: **right-click** the menu bar icon. HUD uses a `panel` window so it can sit above other apps’ fullscreen modes.

**Windows**

- Tray: **left-click** the notification area icon to show Ceer; **right-click** to open the menu. If the icon is hidden, open the overflow area (**^**) in the taskbar notification corner.
- HUD: floating control bar appears when a target is armed or while recording.

#### Browser

Requires a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) (`https://` or `localhost`). Capture always goes through the browser’s native share dialog.

| | Chrome / Edge | Firefox / Zen |
|---|---------------|---------------|
| Picker | Tab, window, or screen | Window or entire screen only (no tab list) |
| System audio | Enable **Share tab audio** when sharing a tab | Usually none for window/screen — use **Mic** |
| UI copy | “Share screen, window, or tab” | “Share window or screen” (`capture-platform.ts`) |

If shared audio is missing, a banner explains the limitation once at the top of the recorder (not in the sidebar).

## Recording flows

### Desktop

**Main window**

1. Pick a **screen** or **window** in the sidebar (`SourcePicker`), or **snip a region** (overlay lets you switch targets, then draw).
2. Main resolves the source; `display-media-handler.ts` satisfies `getDisplayMedia` via `desktopCapturer` (no OS picker).
3. Preview arms (`phase: armed`) — mix system audio + mic (`audio-mix.ts`), optional crop (`crop-video-stream.ts`). HUD appears when armed.
4. **Roll tape** (main window or HUD) → main window hides → stop → export.

**Menu bar tray**

1. Open the tray menu → choose a screen/window or **Snip region…**.
2. **Start recording** when enabled (preview must be armed).
3. Stop from the HUD or tray; export in the main window.

### Browser

1. Click **Share screen, window, or tab** (`WebCapturePanel`) — native picker opens (`previewLoading` while waiting).
2. Preview goes live (`phase: armed`); optional mic attach; record stream is pre-built before start (Firefox needs a synchronous `MediaRecorder.start()`).
3. **Roll tape** → stop → export. Informational banners (e.g. missing tab audio) appear once at the top of the shell.

Platform is automatic: `window.desktopBridge` (Electron preload) → desktop mode; otherwise web.

## Recorder architecture (UI)

One React tree, two capture backends, shared chrome. Vite entry modes via `?mode=`: default recorder, `area-picker`, `control-widget`.

```mermaid
flowchart TB
  subgraph entry [Entry]
    App["recorder-app.tsx"]
    Area["area-picker-page"]
    Hud["control-widget-page"]
  end

  subgraph content [Platform content]
    Desktop["useDesktopRecorder()"]
    Web["useWebRecorder()"]
  end

  subgraph shell [Shared UI]
    Shell["RecorderShell"]
    Stage["RecordStage"]
    Controls["RecordControls"]
  end

  subgraph main [Electron main]
    RC["recording-control\ntray + HUD"]
    DM["display-media-handler"]
  end

  App --> Desktop
  App --> Web
  Desktop --> Shell
  Web --> Shell
  Desktop -->|publishRecorderState| RC
  Hud -->|commands| RC
  DM --> Desktop
```

| Layer | Role |
|-------|------|
| `recorder-app.tsx` | Entry; platform branch; desktop source/area state |
| `use-desktop-recorder.ts` | Arm preview, audio mix, `MediaRecorder`; publishes state to main |
| `use-web-recorder.ts` | Share picker, mic attach, pre-warmed record stream |
| `recording-control.ts` | Tray menu, HUD lifecycle, notifications |
| `recorder-shell.tsx` | Shared layout, errors, record toggles |
| `recorder-media.ts` / `audio-mix.ts` | Capture, mux, codecs |
| `@ceer/contracts` | `DesktopBridge`, capture refs, `RecorderRemoteState` |

Phases: `idle` → `armed` → `recording` → `stopping` → `stopped`. Web uses `previewLoading` during the share picker while `phase` stays `idle`.

## Architecture (media pipeline)

```mermaid
flowchart LR
  subgraph renderer [apps/web renderer]
    UI[RecorderShell + hooks]
    Mix[audio-mix / recorder-media]
    MR[MediaRecorder]
    UI --> Mix --> MR
    MR --> Export[mediabunny export]
  end

  subgraph main [apps/desktop main]
    DMH[display-media-handler]
    DC[desktopCapturer]
    RC[recording-control]
    DMH --> DC
  end

  UI -->|getDisplayMedia| DMH
  UI -->|getUserMedia mic| Mic[Microphone]
  UI -->|publishRecorderState| RC
```

- **Desktop video** — `getDisplayMedia` in main via `display-media-handler` → `desktopCapturer` and the selected `CaptureSourceRef`.
- **Desktop system audio** — Electron `audio: "loopback"` when enabled (macOS 13+).
- **Web video/audio** — Browser `getDisplayMedia`; multi-track mux when needed (`recorder-media.ts`).
- **Area crop** — Canvas crop on the preview stream before record (desktop only).

## Stack

- **Bun** workspaces + **Turbo**
- **`apps/desktop`** — Electron main, preload, area-picker + control-widget windows (**tsdown**)
- **`apps/web`** — React recorder UI (**Vite**)
- **`packages/contracts`** — shared IPC types (`DesktopBridge`, capture refs, remote state)

## Prerequisites

- [Bun](https://bun.sh) 1.2+
- macOS or Windows for distributable desktop builds

## Develop

From the repo root:

```bash
bun install
bun run dev
```

[`scripts/dev.ts`](scripts/dev.ts) starts in parallel:

1. Vite (`@ceer/web`) on `http://localhost:5173`
2. `tsdown --watch` for Electron main, preload, area-picker preload, and control-widget preload
3. Electron loading the Vite dev server (restarts when main/preload bundles change)

Override host or port:

```bash
PORT=5174 HOST=127.0.0.1 bun run dev
```

**Browser-only** (no Electron bridge):

```bash
bun run dev:web
```

**Desktop** (alias for the same orchestration as `dev`):

```bash
bun run dev:desktop
```

### Stuck or multiple dock icons?

```bash
bun run stop
```

Then `bun run dev` again.

### Electron failed to install

```bash
bun run setup:electron
bun run dev
```

Or clean reinstall: `rm -rf node_modules apps/*/node_modules && bun install`

## Build

```bash
bun run build
bun run typecheck
cd apps/desktop && bun run start   # run against built web assets
```

### App icons

Edit `apps/desktop/resources/icon.svg`, then:

```bash
bun run generate:icons
```

## Package installers

Requires **Node ≥ 22.18** and **Bun**. Stop `bun run dev` before building.

From the repo root:

```bash
bun run dist:win   # NSIS → apps/desktop/dist-out/*.exe
bun run dist:mac   # DMG → apps/desktop/dist-out/*.dmg
```

`dist:mac` detaches stale mounted DMG volumes before packaging so rebuilds do not fail.

Desktop-only (after `bun run build`):

```bash
cd apps/desktop && bun run dist:win   # or dist:mac
```

Quit any **Ceer** window from `dist-out/win-unpacked` before rebuilding, or run `bun run stop`. Config: `apps/desktop/electron-builder.yml`. Packaged UI is served from `process.resourcesPath/web/`.
