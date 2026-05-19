import { BrowserWindow, desktopCapturer, ipcMain, screen, type Display } from "electron";
import path from "node:path";

import type { CaptureRegion, CaptureRegionPickResult, DisplayBounds } from "@ceer/contracts";

import * as IpcChannels from "./ipc/channels.ts";

let areaPickerWindow: BrowserWindow | null = null;
let areaPickerResolver: ((value: CaptureRegionPickResult | null) => void) | null = null;
let activeDisplayBounds: DisplayBounds | null = null;
let pickerBackgroundDataUrl: string | null = null;

function resolveAreaPickerPreloadPath(): string {
  return path.join(__dirname, "area-picker-preload.cjs");
}

function resolveAreaPickerUrl(): string {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL?.trim();
  if (devServerUrl) {
    return `${devServerUrl}?mode=area-picker`;
  }
  return `file://${path.join(__dirname, "../../web/dist/index.html")}?mode=area-picker`;
}

async function findDisplayForSource(sourceId: string) {
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

function closeAreaPickerWindow(): void {
  if (areaPickerWindow && !areaPickerWindow.isDestroyed()) {
    areaPickerWindow.close();
  }
  areaPickerWindow = null;
  pickerBackgroundDataUrl = null;
}

async function captureDisplayBackground(sourceId: string, display: Display): Promise<string> {
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

export function registerAreaPickerHandlers(): void {
  ipcMain.on(IpcChannels.GET_AREA_PICKER_BACKGROUND_CHANNEL, (event) => {
    event.returnValue = pickerBackgroundDataUrl;
  });

  ipcMain.handle(
    IpcChannels.PICK_CAPTURE_REGION_CHANNEL,
    async (_event, sourceId: string): Promise<CaptureRegionPickResult | null> => {
      if (areaPickerWindow) {
        return null;
      }

      const targetDisplay = await findDisplayForSource(sourceId);
      const { x, y, width, height } = targetDisplay.bounds;
      activeDisplayBounds = { width, height };
      pickerBackgroundDataUrl = await captureDisplayBackground(sourceId, targetDisplay);

      return new Promise((resolve) => {
        areaPickerResolver = resolve;

        areaPickerWindow = new BrowserWindow({
          x,
          y,
          width,
          height,
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

        areaPickerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        areaPickerWindow.setAlwaysOnTop(true, "screen-saver");

        void areaPickerWindow.loadURL(resolveAreaPickerUrl());

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
          activeDisplayBounds = null;
        });
      });
    },
  );

  ipcMain.on(IpcChannels.AREA_PICKER_COMPLETE_CHANNEL, (_event, region: CaptureRegion) => {
    const resolver = areaPickerResolver;
    const display = activeDisplayBounds;
    areaPickerResolver = null;
    activeDisplayBounds = null;
    closeAreaPickerWindow();

    if (!resolver || !display) {
      return;
    }

    resolver({ region, display });
  });

  ipcMain.on(IpcChannels.AREA_PICKER_CANCEL_CHANNEL, () => {
    const resolver = areaPickerResolver;
    areaPickerResolver = null;
    activeDisplayBounds = null;
    closeAreaPickerWindow();
    resolver?.(null);
  });
}
