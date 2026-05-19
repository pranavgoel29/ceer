# Ceer

Screen recorder monorepo:

- **Bun** workspaces + install
- **Turbo** task orchestration
- **`apps/desktop`** — base Electron (main + preload) bundled with **tsdown**
- **`apps/web`** — React UI via **Vite** (not `electron-vite`)
- **`packages/contracts`** — shared TypeScript types for preload IPC

## Prerequisites

- [Bun](https://bun.sh) 1.2+
- macOS or Windows for distributable builds

### Package manager

This repo uses **Bun** (`bun.lock`, `node_modules/.bun`). If you see a `.pnpm-store` folder at the repo root, it was created incidentally (for example by `bunx shadcn` or a one-off `pnpm` run). It is safe to delete and is gitignored — it is not part of the normal Bun install.

## Develop

From the repo root:

```bash
bun install
bun run dev
```

### Electron failed to install correctly

Bun does not run Electron’s download script unless the package is trusted. This repo sets `trustedDependencies: ["electron"]` and runs `scripts/ensure-electron.mjs` on `postinstall`.

If desktop dev still fails:

```bash
bun run setup:electron
bun run dev
```

Or reinstall from scratch:

```bash
rm -rf node_modules apps/*/node_modules
bun install
```

This starts:

1. Vite (`@ceer/web`) on `http://localhost:5173`
2. `tsdown --watch` for Electron main/preload
3. Electron, loading the Vite dev server

Override the port:

```bash
PORT=5174 bun run dev
```

Run only the web UI in a browser:

```bash
bun run dev:web
```

## Build

```bash
bun run build
```

Then run the desktop app against the built web assets:

```bash
cd apps/desktop && bun run start
```

## Package installers

Build web + desktop, then run [electron-builder](https://www.electron.build/) from `apps/desktop`:

Stop `bun run dev` first — a running dev watcher can slow or interrupt the production build.

```bash
# macOS → apps/desktop/release/*.dmg
bun run dist:mac

# Windows → apps/desktop/release/*.exe (NSIS installer)
bun run dist:win
```

Config: `apps/desktop/electron-builder.yml`. Packaged UI lives under `process.resourcesPath/web/` (see `main.ts`).

Add icons later under `apps/desktop/resources/` (`icon.icns`, `icon.ico`).

## Layout

```
ceer/
├── apps/
│   ├── desktop/          # Electron main + preload + electron-builder.yml
│   └── web/              # React renderer (Vite)
├── packages/
│   └── contracts/        # DesktopBridge + IPC types
├── scripts/
│   └── dev.mjs           # Sets VITE_DEV_SERVER_URL, runs turbo dev
├── turbo.json
└── package.json
```

## Next steps (recording)

- Main: `session.setDisplayMediaRequestHandler` + `desktopCapturer`
- Renderer: compositor canvas + `MediaRecorder`
- Export: FFmpeg in main for trim/crop
