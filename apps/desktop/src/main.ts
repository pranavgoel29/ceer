import { app, BrowserWindow, ipcMain, session, systemPreferences } from "electron";
import path from "node:path";

import type { CapturePreferences, CaptureSourceRef } from "@ceer/contracts";

import { registerAreaPickerHandlers } from "./area-picker.ts";
import { registerDisplayMediaHandler } from "./display-media-handler.ts";
import * as IpcChannels from "./ipc/channels.ts";
import { listDesktopSources } from "./list-desktop-sources.ts";
import {
  attachMainWindowCloseBehavior,
  handleAppActivate,
  registerRecordingControl,
} from "./recording-control.ts";
import { resolveProductionIndexPath } from "./resolve-renderer.ts";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL?.trim());
const appName = isDevelopment ? "Ceer (Dev)" : "Ceer";

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let selectedCaptureSource: CaptureSourceRef | null = null;
let capturePreferences: CapturePreferences = { systemAudioEnabled: true };
let isQuitting = false;

function resolvePreloadPath(): string {
  return path.join(__dirname, "preload.cjs");
}

function resolveAppIconPath(): string {
  const iconFile = process.platform === "win32" ? "icon.ico" : "icon.png";
  if (app.isPackaged) {
    return path.join(process.resourcesPath, iconFile);
  }
  return path.join(__dirname, "../resources", iconFile);
}

function wireDisplayMediaHandler(): void {
  registerDisplayMediaHandler(session.defaultSession, () => ({
    selectedCaptureSource,
    capturePreferences,
  }));
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

  attachMainWindowCloseBehavior(window, () => !isQuitting);
  mainWindow = window;
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

function initializeApp(): void {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(resolveAppIconPath());
  }

  wireDisplayMediaHandler();
  registerIpcHandlers();
  registerAreaPickerHandlers(() => mainWindow);
  registerRecordingControl({
    getMainWindow: () => mainWindow,
    setCaptureSource: (source) => {
      selectedCaptureSource = source;
    },
  });
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      return;
    }
    handleAppActivate();
  });
}

app.setName(appName);

if (process.platform === "win32") {
  app.setAppUserModelId("com.ceer.app");
}

if (hasSingleInstanceLock) {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on("ready", initializeApp);

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", () => {
    isQuitting = true;
    selectedCaptureSource = null;
    capturePreferences = { systemAudioEnabled: true };
  });
}
