import { app, BrowserWindow, desktopCapturer, ipcMain, session, systemPreferences } from "electron";
import path from "node:path";

import type { CapturePreferences, DesktopCaptureSource } from "@ceer/contracts";

import * as IpcChannels from "./ipc/channels.ts";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL?.trim());
const appName = isDevelopment ? "Ceer (Dev)" : "Ceer";

let mainWindow: BrowserWindow | null = null;
let selectedCaptureSourceId: string | null = null;
let capturePreferences: CapturePreferences = { systemAudioEnabled: true };

function resolvePreloadPath(): string {
  return path.join(__dirname, "preload.cjs");
}

function resolveProductionIndexHtml(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "web", "index.html");
  }
  return path.join(__dirname, "../../web/dist/index.html");
}

function classifySourceKind(sourceName: string): DesktopCaptureSource["kind"] {
  const lower = sourceName.toLowerCase();
  if (lower.includes("screen") || lower.includes("display") || lower.includes("entire")) {
    return "screen";
  }
  return "window";
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
  }));
}

function registerDisplayMediaHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    void (async () => {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 1, height: 1 },
      });

      const picked =
        (selectedCaptureSourceId
          ? sources.find((source) => source.id === selectedCaptureSourceId)
          : undefined) ?? sources[0];

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
    void window.loadFile(resolveProductionIndexHtml());
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

  ipcMain.on(IpcChannels.SET_CAPTURE_SOURCE_CHANNEL, (_event, sourceId: string | null) => {
    selectedCaptureSourceId = sourceId;
  });

  ipcMain.on(IpcChannels.SET_CAPTURE_PREFERENCES_CHANNEL, (_event, preferences: CapturePreferences) => {
    capturePreferences = {
      systemAudioEnabled: Boolean(preferences.systemAudioEnabled),
    };
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

app.whenReady().then(() => {
  registerDisplayMediaHandler();
  registerIpcHandlers();
  mainWindow = createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  mainWindow = null;
  selectedCaptureSourceId = null;
  capturePreferences = { systemAudioEnabled: true };
});
