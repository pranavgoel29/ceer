import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";

import * as IpcChannels from "./ipc/channels.ts";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL?.trim());
const appName = isDevelopment ? "Ceer (Dev)" : "Ceer";

let mainWindow: BrowserWindow | null = null;

function resolvePreloadPath(): string {
  return path.join(__dirname, "preload.cjs");
}

function resolveProductionIndexHtml(): string {
  return path.join(__dirname, "../../web/dist/index.html");
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    title: appName,
    show: false,
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
}

app.setName(appName);

app.whenReady().then(() => {
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
});
