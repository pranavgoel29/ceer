import { app, BrowserWindow, ipcMain, session } from "electron";
import path from "node:path";

import type { CapturePreferences, CaptureSourceRef, PrivacyPane } from "@ceer/contracts";

import { registerAreaPickerHandlers } from "./area-picker.ts";
import {
  getCapturePreferences,
  getSelectedCaptureSource,
  resetCaptureState,
  setCapturePreferences,
  setSelectedCaptureSource,
} from "./capture-state.ts";
import { registerDisplayMediaHandler } from "./display-media-handler.ts";
import * as IpcChannels from "./ipc/channels.ts";
import { listDesktopSources } from "./list-desktop-sources.ts";
import { resolveWindowCapture } from "./resolve-window-capture.ts";
import {
  getPermissionStatus,
  openPrivacySettings,
  relaunchApp,
  requestMicrophoneAccess,
  requestScreenCaptureAccess,
} from "./permissions.ts";
import {
  attachMainWindowCloseBehavior,
  handleAppActivate,
  isTrayActive,
  registerRecordingControl,
} from "./recording-control.ts";
import { resolveProductionIndexPath } from "./resolve-renderer.ts";
import { disposeAppUpdates, registerAppUpdates, registerUpdateIpcHandlers } from "./updates.ts";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL?.trim());
const appName = isDevelopment ? "Ceer (Dev)" : "Ceer";

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
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
    selectedCaptureSource: getSelectedCaptureSource(),
    capturePreferences: getCapturePreferences(),
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
  ipcMain.handle(IpcChannels.RESOLVE_WINDOW_CAPTURE_CHANNEL, (_event, source: CaptureSourceRef) =>
    resolveWindowCapture(source),
  );

  ipcMain.on(IpcChannels.SET_CAPTURE_SOURCE_CHANNEL, (event, source: CaptureSourceRef | null) => {
    setSelectedCaptureSource(source);
    event.returnValue = null;
  });

  ipcMain.on(IpcChannels.SET_CAPTURE_PREFERENCES_CHANNEL, (event, preferences: CapturePreferences) => {
    setCapturePreferences(preferences);
    event.returnValue = null;
  });

  ipcMain.handle(IpcChannels.GET_PERMISSION_STATUS_CHANNEL, () => getPermissionStatus());
  ipcMain.handle(IpcChannels.REQUEST_SCREEN_CAPTURE_ACCESS_CHANNEL, () =>
    requestScreenCaptureAccess(),
  );
  ipcMain.handle(IpcChannels.REQUEST_MICROPHONE_ACCESS_CHANNEL, () => requestMicrophoneAccess());
  ipcMain.handle(IpcChannels.OPEN_PRIVACY_SETTINGS_CHANNEL, (_event, pane: PrivacyPane) =>
    openPrivacySettings(pane),
  );
  ipcMain.handle(IpcChannels.RELAUNCH_APP_CHANNEL, () => {
    relaunchApp();
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
      setSelectedCaptureSource(source);
    },
  });
  registerUpdateIpcHandlers();
  if (!isDevelopment) {
    registerAppUpdates();
  }
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
    if (process.platform === "darwin") {
      return;
    }
    if (process.platform === "win32" && isTrayActive()) {
      return;
    }
    app.quit();
  });

  app.on("before-quit", () => {
    isQuitting = true;
    resetCaptureState();
    disposeAppUpdates();
  });
}
