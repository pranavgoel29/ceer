import { BrowserWindow, desktopCapturer, ipcMain, screen, type Display } from "electron";
import path from "node:path";

import type {
  CaptureRegion,
  CaptureRegionPickResult,
  CaptureSourceKind,
  DisplayBounds,
  RegionCoordinateSpace,
} from "@ceer/contracts";

import * as IpcChannels from "./ipc/channels.ts";
import { listDesktopSources } from "./list-desktop-sources.ts";
import { setAreaPickerActive } from "./recording-control.ts";
import { resolveProductionIndexPath } from "./resolve-renderer.ts";

interface ActivePickerSource {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly kind: CaptureSourceKind;
  readonly coordinateSpace: RegionCoordinateSpace;
  readonly displayBounds: DisplayBounds;
}

let areaPickerWindow: BrowserWindow | null = null;
let areaPickerResolver: ((value: CaptureRegionPickResult | null) => void) | null = null;
let activePickerSource: ActivePickerSource | null = null;
let pickerBackgroundDataUrl: string | null = null;
let pickerSourcesCache: Awaited<ReturnType<typeof listDesktopSources>> = [];

async function findDisplayForSource(sourceId: string): Promise<Display> {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 1, height: 1 },
  });
  const source = sources.find((item) => item.id === sourceId);
  if (!source) {
    return screen.getPrimaryDisplay();
  }

  if (source.display_id) {
    const match = screen.getAllDisplays().find((display) => String(display.id) === source.display_id);
    if (match) {
      return match;
    }
  }

  return screen.getPrimaryDisplay();
}

function resolveAreaPickerPreloadPath(): string {
  return path.join(__dirname, "area-picker-preload.cjs");
}

function loadAreaPickerPage(window: BrowserWindow): void {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL?.trim();
  if (devServerUrl) {
    void window.loadURL(`${devServerUrl}?mode=area-picker`);
    return;
  }
  void window.loadFile(resolveProductionIndexPath(), { query: { mode: "area-picker" } });
}

async function captureScreenBackground(sourceId: string, display: Display): Promise<string> {
  const scaleFactor = display.scaleFactor;
  const width = Math.max(1, Math.round(display.bounds.width * scaleFactor));
  const height = Math.max(1, Math.round(display.bounds.height * scaleFactor));

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width, height },
  });

  const match = sources.find((source) => source.id === sourceId) ?? sources[0];
  if (!match) {
    return "";
  }

  return match.thumbnail.toDataURL();
}

async function captureWindowBackground(sourceId: string): Promise<string> {
  const sources = await desktopCapturer.getSources({
    types: ["window"],
    thumbnailSize: { width: 1280, height: 720 },
    fetchWindowIcons: true,
  });

  const match = sources.find((source) => source.id === sourceId) ?? sources[0];
  if (!match) {
    return "";
  }

  return match.thumbnail.toDataURL();
}

async function applyPickerSource(sourceId: string): Promise<ActivePickerSource | null> {
  pickerSourcesCache = await listDesktopSources();
  const entry = pickerSourcesCache.find((item) => item.id === sourceId);
  if (!entry) {
    return null;
  }

  const targetDisplay = await findDisplayForSource(sourceId);
  const { x, y, width, height } = targetDisplay.bounds;
  const displayBounds: DisplayBounds = { width, height };

  if (entry.kind === "window") {
    const screens = pickerSourcesCache.filter((item) => item.kind === "screen");
    const screenOnDisplay =
      screens.find((item) => item.displayId === String(targetDisplay.id)) ?? screens[0];
    pickerBackgroundDataUrl = screenOnDisplay
      ? await captureScreenBackground(screenOnDisplay.id, targetDisplay)
      : await captureWindowBackground(sourceId);
    activePickerSource = {
      sourceId: entry.id,
      sourceName: entry.name,
      kind: entry.kind,
      coordinateSpace: "display",
      displayBounds,
    };
  } else {
    pickerBackgroundDataUrl = await captureScreenBackground(sourceId, targetDisplay);
    activePickerSource = {
      sourceId: entry.id,
      sourceName: entry.name,
      kind: entry.kind,
      coordinateSpace: "display",
      displayBounds,
    };
  }

  if (areaPickerWindow && !areaPickerWindow.isDestroyed()) {
    areaPickerWindow.setBounds({ x, y, width, height });
  }

  return activePickerSource;
}

function notifyPickerSourceChanged(): void {
  if (areaPickerWindow && !areaPickerWindow.isDestroyed()) {
    areaPickerWindow.webContents.send(IpcChannels.AREA_PICKER_SOURCE_CHANGED_CHANNEL);
  }
}

function closeAreaPickerWindow(): void {
  if (areaPickerWindow && !areaPickerWindow.isDestroyed()) {
    areaPickerWindow.close();
    return;
  }
  areaPickerWindow = null;
  pickerBackgroundDataUrl = null;
  activePickerSource = null;
  setAreaPickerActive(false);
}

function showMainWindowAfterPicker(getMainWindow: () => BrowserWindow | null): void {
  const main = getMainWindow();
  if (main && !main.isDestroyed()) {
    main.show();
    main.focus();
  }
}

function openPickerWindow(bounds: { x: number; y: number; width: number; height: number }): void {
  areaPickerWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: resolveAreaPickerPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.platform === "darwin") {
    areaPickerWindow.setVisibleOnAllWorkspaces(false);
  }
  areaPickerWindow.setAlwaysOnTop(true, "screen-saver");

  loadAreaPickerPage(areaPickerWindow);

  areaPickerWindow.once("ready-to-show", () => {
    areaPickerWindow?.show();
    areaPickerWindow?.focus();
  });

  areaPickerWindow.on("closed", () => {
    areaPickerWindow = null;
    if (areaPickerResolver) {
      areaPickerResolver(null);
      areaPickerResolver = null;
    }
    activePickerSource = null;
    pickerBackgroundDataUrl = null;
    setAreaPickerActive(false);
  });
}

export function registerAreaPickerHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.on(IpcChannels.GET_AREA_PICKER_BACKGROUND_CHANNEL, (event) => {
    event.returnValue = pickerBackgroundDataUrl;
  });

  ipcMain.on(IpcChannels.GET_AREA_PICKER_SOURCES_CHANNEL, (event) => {
    event.returnValue = pickerSourcesCache;
  });

  ipcMain.on(IpcChannels.GET_AREA_PICKER_ACTIVE_SOURCE_CHANNEL, (event) => {
    event.returnValue = activePickerSource
      ? { sourceId: activePickerSource.sourceId, kind: activePickerSource.kind }
      : null;
  });

  ipcMain.handle(IpcChannels.SET_AREA_PICKER_SOURCE_CHANNEL, async (_event, sourceId: string) => {
    const next = await applyPickerSource(sourceId);
    if (next) {
      notifyPickerSourceChanged();
    }
    return next !== null;
  });

  ipcMain.handle(
    IpcChannels.PICK_CAPTURE_REGION_CHANNEL,
    async (_event, sourceId: string): Promise<CaptureRegionPickResult | null> => {
      if (areaPickerWindow) {
        return null;
      }

      const main = getMainWindow();
      if (main && !main.isDestroyed()) {
        main.hide();
      }
      setAreaPickerActive(true);

      // Let the window compositor drop Ceer from the display before capturing the backdrop.
      await new Promise((resolve) => setTimeout(resolve, 200));

      const initial = await applyPickerSource(sourceId);
      if (!initial) {
        setAreaPickerActive(false);
        showMainWindowAfterPicker(getMainWindow);
        return null;
      }

      const targetDisplay = await findDisplayForSource(sourceId);
      const { x, y, width, height } = targetDisplay.bounds;

      return new Promise<CaptureRegionPickResult | null>((resolve) => {
        areaPickerResolver = resolve;
        openPickerWindow({ x, y, width, height });
      }).then((result) => {
        showMainWindowAfterPicker(getMainWindow);
        return result;
      });
    },
  );

  ipcMain.on(IpcChannels.AREA_PICKER_COMPLETE_CHANNEL, (_event, region: CaptureRegion) => {
    const resolver = areaPickerResolver;
    const active = activePickerSource;
    areaPickerResolver = null;
    closeAreaPickerWindow();

    if (!resolver || !active) {
      return;
    }

    resolver({
      region,
      display: active.displayBounds,
      coordinateSpace: active.coordinateSpace,
      sourceId: active.sourceId,
      sourceName: active.sourceName,
      sourceKind: active.kind,
    });
  });

  ipcMain.on(IpcChannels.AREA_PICKER_CANCEL_CHANNEL, () => {
    const resolver = areaPickerResolver;
    areaPickerResolver = null;
    closeAreaPickerWindow();
    resolver?.(null);
  });
}
