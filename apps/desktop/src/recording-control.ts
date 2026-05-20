import {
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  app,
  ipcMain,
  nativeImage,
  powerSaveBlocker,
  screen,
  type BrowserWindow as BrowserWindowType,
  type Display,
} from "electron";
import path from "node:path";

import type { RecorderRemoteCommand, RecorderRemoteState } from "@ceer/contracts";

import * as IpcChannels from "./ipc/channels.ts";
import { resolveProductionIndexPath } from "./resolve-renderer.ts";

let tray: Tray | null = null;
let controlWidgetWindow: BrowserWindow | null = null;
let mainWindowRef: (() => BrowserWindowType | null) | null = null;
let powerSaveBlockerId: number | null = null;
let hudVisiblePreference = true;
let areaPickerActive = false;

let remoteState: RecorderRemoteState = {
  phase: "idle",
  canRecord: false,
  canStop: false,
  elapsedMs: 0,
  sourceName: null,
};

function resolveAppIconPath(): string {
  const iconFile = process.platform === "win32" ? "icon.ico" : "icon.png";
  if (app.isPackaged) {
    return path.join(process.resourcesPath, iconFile);
  }
  return path.join(__dirname, "../resources", iconFile);
}

function createTrayIcon() {
  const image = nativeImage.createFromPath(resolveAppIconPath());
  if (process.platform === "darwin") {
    const resized = image.resize({ width: 18, height: 18 });
    resized.setTemplateImage(true);
    return resized;
  }
  return image;
}

function resolveControlWidgetPreloadPath(): string {
  return path.join(__dirname, "control-widget-preload.cjs");
}

function broadcastRecorderState(): void {
  const windows = BrowserWindow.getAllWindows();
  for (const window of windows) {
    if (!window.isDestroyed()) {
      window.webContents.send(IpcChannels.RECORDER_STATE_CHANNEL, remoteState);
    }
  }
  updateTrayMenu();
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateTrayMenu(): void {
  if (!tray) {
    return;
  }

  const isRecording = remoteState.phase === "recording" || remoteState.phase === "stopping";
  const menu = Menu.buildFromTemplate([
    {
      label: "Show Ceer",
      click: () => sendRecorderCommand("show-main"),
    },
    { type: "separator" },
    {
      label: isRecording ? `Stop recording (${formatElapsed(remoteState.elapsedMs)})` : "Start recording",
      enabled: isRecording ? remoteState.canStop : remoteState.canRecord,
      click: () => sendRecorderCommand(isRecording ? "stop" : "start"),
    },
    {
      label: controlWidgetWindow?.isVisible() ? "Hide control bar" : "Show control bar",
      enabled: remoteState.phase === "armed" || isRecording,
      click: () => toggleControlWidget(),
    },
    { type: "separator" },
    {
      label: "Quit",
      enabled: !isRecording,
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.setToolTip(
    isRecording
      ? `Ceer — Recording ${formatElapsed(remoteState.elapsedMs)}`
      : "Ceer — Screen recorder",
  );
}

function showMainWindow(): void {
  const main = mainWindowRef?.();
  if (!main || main.isDestroyed()) {
    return;
  }

  if (main.isMinimized()) {
    main.restore();
  }
  main.show();
  main.focus();
}

function sendRecorderCommand(command: RecorderRemoteCommand): void {
  const main = mainWindowRef?.();
  if (!main || main.isDestroyed()) {
    return;
  }

  if (command === "show-main") {
    showMainWindow();
    return;
  }

  main.webContents.send(IpcChannels.RECORDER_COMMAND_CHANNEL, command);
}

function setPowerSaveBlocker(active: boolean): void {
  if (active) {
    if (powerSaveBlockerId === null) {
      powerSaveBlockerId = powerSaveBlocker.start("prevent-app-suspension");
    }
    return;
  }

  if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
    powerSaveBlocker.stop(powerSaveBlockerId);
  }
  powerSaveBlockerId = null;
}

function showRecordingNotification(body: string): void {
  if (!Notification.isSupported()) {
    return;
  }

  const notification = new Notification({
    title: "Ceer",
    body,
    icon: resolveAppIconPath(),
  });

  notification.on("click", () => {
    sendRecorderCommand("show-main");
  });
}

function resolveHudDisplay(): Display {
  const main = mainWindowRef?.();
  if (main && !main.isDestroyed()) {
    return screen.getDisplayMatching(main.getBounds());
  }

  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function configureFloatingHud(window: BrowserWindow): void {
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.setAlwaysOnTop(true, "screen-saver");
}

function loadControlWidgetPage(window: BrowserWindow): void {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL?.trim();
  if (devServerUrl) {
    void window.loadURL(`${devServerUrl}?mode=control-widget`);
    return;
  }
  void window.loadFile(resolveProductionIndexPath(), { query: { mode: "control-widget" } });
}

function createControlWidgetWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 240,
    height: 88,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    focusable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    show: false,
    backgroundColor: "#00000000",
    ...(process.platform === "darwin" ? { type: "panel" as const } : {}),
    webPreferences: {
      preload: resolveControlWidgetPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  configureFloatingHud(window);
  loadControlWidgetPage(window);

  window.once("ready-to-show", () => {
    showFloatingHud(window);
  });

  return window;
}

function positionControlWidget(window: BrowserWindow): void {
  const display = resolveHudDisplay();
  const { x, y, width, height } = display.workArea;
  const widgetBounds = window.getBounds();
  window.setPosition(
    Math.round(x + width - widgetBounds.width - 24),
    Math.round(y + height - widgetBounds.height - 24),
  );
}

function showFloatingHud(window: BrowserWindow): void {
  if (!hudVisiblePreference || window.isDestroyed()) {
    return;
  }

  configureFloatingHud(window);
  positionControlWidget(window);
  window.show();
}

function shouldShowControlWidget(): boolean {
  if (areaPickerActive) {
    return false;
  }

  return (
    hudVisiblePreference &&
    (remoteState.phase === "armed" ||
      remoteState.phase === "recording" ||
      remoteState.phase === "stopping")
  );
}

export function setAreaPickerActive(active: boolean): void {
  areaPickerActive = active;
  if (active && controlWidgetWindow && !controlWidgetWindow.isDestroyed()) {
    controlWidgetWindow.hide();
  }
  syncControlWidgetVisibility();
}

function syncControlWidgetVisibility(): void {
  if (shouldShowControlWidget()) {
    if (!controlWidgetWindow || controlWidgetWindow.isDestroyed()) {
      controlWidgetWindow = createControlWidgetWindow();
    } else if (!controlWidgetWindow.isVisible()) {
      showFloatingHud(controlWidgetWindow);
    } else {
      configureFloatingHud(controlWidgetWindow);
    }
    return;
  }

  if (controlWidgetWindow && !controlWidgetWindow.isDestroyed()) {
    controlWidgetWindow.hide();
  }
}

function toggleControlWidget(): void {
  if (!controlWidgetWindow || controlWidgetWindow.isDestroyed()) {
    hudVisiblePreference = true;
    syncControlWidgetVisibility();
    return;
  }

  if (controlWidgetWindow.isVisible()) {
    hudVisiblePreference = false;
    controlWidgetWindow.hide();
  } else {
    hudVisiblePreference = true;
    showFloatingHud(controlWidgetWindow);
  }

  updateTrayMenu();
}

function applyRemoteState(next: RecorderRemoteState, previousPhase: RecorderRemoteState["phase"]): void {
  remoteState = next;

  const isRecording = next.phase === "recording" || next.phase === "stopping";
  setPowerSaveBlocker(isRecording);

  if (
    isRecording &&
    controlWidgetWindow &&
    !controlWidgetWindow.isDestroyed() &&
    controlWidgetWindow.isVisible()
  ) {
    configureFloatingHud(controlWidgetWindow);
  }

  if (next.phase === "recording" && previousPhase !== "recording") {
    showRecordingNotification("Recording… Click to open Ceer.");
  }

  if (next.phase === "stopped" && (previousPhase === "recording" || previousPhase === "stopping")) {
    showRecordingNotification("Recording ready — export or discard in Ceer.");
    showMainWindow();
  }

  syncControlWidgetVisibility();
  broadcastRecorderState();
}

export function registerRecordingControl(getMainWindow: () => BrowserWindowType | null): void {
  mainWindowRef = getMainWindow;

  ipcMain.on(IpcChannels.RECORDER_STATE_PUBLISH_CHANNEL, (_event, state: RecorderRemoteState) => {
    const previousPhase = remoteState.phase;
    applyRemoteState(state, previousPhase);
  });

  ipcMain.on(IpcChannels.RECORDER_COMMAND_CHANNEL, (_event, command: RecorderRemoteCommand) => {
    sendRecorderCommand(command);
  });

  tray = new Tray(createTrayIcon());
  tray.setToolTip("Ceer — Screen recorder");
  if (process.platform === "darwin") {
    tray.setTitle("");
    // macOS: use the context menu only (right-click). Left-click does not open the app.
  } else {
    tray.on("click", () => {
      tray?.popUpContextMenu();
    });
  }
  updateTrayMenu();
}

export function attachMainWindowCloseBehavior(window: BrowserWindow): void {
  window.on("close", (event) => {
    event.preventDefault();
    window.hide();
  });
}
