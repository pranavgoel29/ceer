import { BrowserWindow, ipcMain, screen } from "electron";
import path from "node:path";

import * as IpcChannels from "./ipc/channels.ts";
import { setCountdownOverlayActive } from "./recording-control.ts";
import { resolveProductionIndexPath } from "./resolve-renderer.ts";

let countdownWindow: BrowserWindow | null = null;
let countdownRemaining = 3;

function resolveCountdownPreloadPath(): string {
  return path.join(__dirname, "countdown-preload.cjs");
}

function loadCountdownPage(window: BrowserWindow): void {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL?.trim();
  if (devServerUrl) {
    void window.loadURL(`${devServerUrl}?mode=countdown`);
    return;
  }
  void window.loadFile(resolveProductionIndexPath(), { query: { mode: "countdown" } });
}

function pushRemaining(window: BrowserWindow, remaining: number): void {
  if (!window.isDestroyed()) {
    window.webContents.send(IpcChannels.COUNTDOWN_REMAINING_CHANNEL, remaining);
  }
}

function closeCountdownWindow(): void {
  if (countdownWindow && !countdownWindow.isDestroyed()) {
    countdownWindow.close();
    return;
  }
  countdownWindow = null;
  setCountdownOverlayActive(false);
}

function createCountdownWindow(): BrowserWindow {
  const { x, y, width, height } = screen.getPrimaryDisplay().bounds;

  const window = new BrowserWindow({
    x,
    y,
    width,
    height,
    ...(process.platform === "darwin"
      ? { type: "panel" as const, titleBarStyle: "hidden" as const }
      : {}),
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
      preload: resolveCountdownPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.platform === "darwin") {
    window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
    window.setAlwaysOnTop(true, "screen-saver", 1);
  } else {
    window.setAlwaysOnTop(true, "screen-saver");
  }

  loadCountdownPage(window);

  window.once("ready-to-show", () => {
    pushRemaining(window, countdownRemaining);
    window.show();
    window.focus();
  });

  window.on("closed", () => {
    countdownWindow = null;
    setCountdownOverlayActive(false);
  });

  return window;
}

function showCountdown(remaining: number): void {
  countdownRemaining = remaining;
  setCountdownOverlayActive(true);

  if (!countdownWindow || countdownWindow.isDestroyed()) {
    countdownWindow = createCountdownWindow();
    return;
  }

  const { x, y, width, height } = screen.getPrimaryDisplay().bounds;
  countdownWindow.setBounds({ x, y, width, height });
  pushRemaining(countdownWindow, remaining);
  if (!countdownWindow.isVisible()) {
    countdownWindow.show();
    countdownWindow.focus();
  }
}

function updateCountdown(remaining: number): void {
  countdownRemaining = remaining;
  if (countdownWindow && !countdownWindow.isDestroyed()) {
    pushRemaining(countdownWindow, remaining);
  }
}

function hideCountdown(): void {
  closeCountdownWindow();
}

export function registerCountdownOverlay(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.on(IpcChannels.COUNTDOWN_GET_REMAINING_CHANNEL, (event) => {
    event.returnValue = countdownRemaining;
  });

  ipcMain.on(IpcChannels.COUNTDOWN_SHOW_CHANNEL, (_event, remaining: number) => {
    showCountdown(typeof remaining === "number" ? remaining : 3);
  });

  ipcMain.on(IpcChannels.COUNTDOWN_UPDATE_CHANNEL, (_event, remaining: number) => {
    updateCountdown(typeof remaining === "number" ? remaining : countdownRemaining);
  });

  ipcMain.on(IpcChannels.COUNTDOWN_HIDE_CHANNEL, () => {
    hideCountdown();
  });

  ipcMain.on(IpcChannels.COUNTDOWN_CANCEL_CHANNEL, () => {
    hideCountdown();
    const main = getMainWindow();
    if (main && !main.isDestroyed()) {
      main.webContents.send(IpcChannels.COUNTDOWN_CANCEL_CHANNEL);
    }
  });
}
