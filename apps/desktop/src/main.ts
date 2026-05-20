import { app, BrowserWindow, desktopCapturer, ipcMain, session, systemPreferences } from "electron";
import path from "node:path";

import type { CapturePreferences, CaptureSourceRef, DesktopCaptureSource } from "@ceer/contracts";

import { registerAreaPickerHandlers } from "./area-picker.ts";
import * as IpcChannels from "./ipc/channels.ts";
import { classifySourceKind, resolveCapturerSource } from "./resolve-capture-source.ts";
import { resolveProductionIndexPath } from "./resolve-renderer.ts";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL?.trim());
const appName = isDevelopment ? "Ceer (Dev)" : "Ceer";

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

let selectedCaptureSource: CaptureSourceRef | null = null;
let capturePreferences: CapturePreferences = { systemAudioEnabled: true };

function resolvePreloadPath(): string {
  return path.join(__dirname, "preload.cjs");
}

function resolveAppIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "icon.png");
  }
  return path.join(__dirname, "../resources/icon.png");
}

async function listDesktopSources(): Promise<DesktopCaptureSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 360, height: 203 },
    fetchWindowIcons: true,
  });

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    kind: classifySourceKind(source.name),
    thumbnailDataUrl: source.thumbnail.toDataURL(),
    displayId: source.display_id,
  }));
}

function registerDisplayMediaHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    void (async () => {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 1, height: 1 },
      });

      const picked = resolveCapturerSource(sources, selectedCaptureSource);

      if (!picked) {
        callback({});
        return;
      }

      const wantsSystemAudio = capturePreferences.systemAudioEnabled && request.audioRequested;

      callback({
        video: picked,
        ...(wantsSystemAudio ? { audio: "loopback" as const } : {}),
      });
    })();
  });
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    title: appName,
    show: false,
    backgroundColor: "#1c1917",
    icon: resolveAppIconPath(),
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL?.trim();
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadFile(resolveProductionIndexPath());
  }

  window.once("ready-to-show", () => {
    window.show();
  });

  return window;
}

function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannels.PING_CHANNEL, () => "pong");

  ipcMain.on(IpcChannels.GET_APP_INFO_CHANNEL, (event) => {
    event.returnValue = {
      name: appName,
      version: app.getVersion(),
      platform: process.platform,
      isDevelopment,
    };
  });

  ipcMain.handle(IpcChannels.GET_DESKTOP_SOURCES_CHANNEL, () => listDesktopSources());

  ipcMain.on(IpcChannels.SET_CAPTURE_SOURCE_CHANNEL, (event, source: CaptureSourceRef | null) => {
    selectedCaptureSource = source;
    event.returnValue = null;
  });

  ipcMain.on(IpcChannels.SET_CAPTURE_PREFERENCES_CHANNEL, (event, preferences: CapturePreferences) => {
    capturePreferences = {
      systemAudioEnabled: Boolean(preferences.systemAudioEnabled),
    };
    event.returnValue = null;
  });

  ipcMain.handle(IpcChannels.REQUEST_MICROPHONE_ACCESS_CHANNEL, async () => {
    if (process.platform !== "darwin") {
      return true;
    }

    const status = systemPreferences.getMediaAccessStatus("microphone");
    if (status === "granted") {
      return true;
    }

    if (status === "denied" || status === "restricted") {
      return false;
    }

    return systemPreferences.askForMediaAccess("microphone");
  });
}

app.setName(appName);

if (hasSingleInstanceLock) {
  app.on("second-instance", () => {
    const existing = BrowserWindow.getAllWindows()[0];
    if (existing) {
      if (existing.isMinimized()) {
        existing.restore();
      }
      existing.focus();
    }
  });

  app.whenReady().then(() => {
    if (process.platform === "darwin" && app.dock) {
      app.dock.setIcon(resolveAppIconPath());
    }

    registerDisplayMediaHandler();
    registerIpcHandlers();
    registerAreaPickerHandlers();
    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", () => {
    selectedCaptureSource = null;
    capturePreferences = { systemAudioEnabled: true };
  });
}
