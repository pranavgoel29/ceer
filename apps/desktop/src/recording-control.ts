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

import {
  isSameCaptureSource,
  toCaptureSourceRef,
  type CaptureSourceRef,
  type DesktopCaptureSource,
  type RecorderRemoteCommand,
  type RecorderRemoteState,
} from "@ceer/contracts";

import * as IpcChannels from "./ipc/channels.ts";
import { listDesktopSources } from "./list-desktop-sources.ts";
import { resolveProductionIndexPath } from "./resolve-renderer.ts";

export interface RecordingControlDeps {
  readonly getMainWindow: () => BrowserWindowType | null;
  readonly setCaptureSource: (source: CaptureSourceRef | null) => void;
}

let tray: Tray | null = null;
let controlWidgetWindow: BrowserWindow | null = null;
let powerSaveBlockerId: number | null = null;
let hudVisiblePreference = true;
let areaPickerActive = false;

let recordingControlDeps: RecordingControlDeps | null = null;

let remoteState: RecorderRemoteState = {
  phase: "idle",
  canRecord: false,
  canStop: false,
  elapsedMs: 0,
  sourceName: null,
  armedSourceKind: null,
  armedSourceDisplayId: null,
  armedSourceId: null,
};

function resolveAppIconPath(): string {
  const iconFile = process.platform === "win32" ? "icon.ico" : "icon.png";
  if (app.isPackaged) {
    return path.join(process.resourcesPath, iconFile);
  }
  return path.join(__dirname, "../resources", iconFile);
}

function resolveTrayIconPath(): string {
  const resourcesRoot = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, "../resources");

  if (process.platform === "darwin") {
    const packagedTray = path.join(resourcesRoot, "tray-icon.png");
    const devTray = path.join(resourcesRoot, "icon.iconset", "icon_16x16@2x.png");
    return app.isPackaged ? packagedTray : devTray;
  }

  return resolveAppIconPath();
}

function createTrayIcon() {
  const image = nativeImage.createFromPath(resolveTrayIconPath());
  if (image.isEmpty()) {
    return nativeImage.createFromPath(resolveAppIconPath());
  }

  if (process.platform === "darwin") {
    return image.resize({ width: 22, height: 22 });
  }

  if (process.platform === "win32") {
    return image.resize({ width: 16, height: 16 });
  }

  return image.resize({ width: 24, height: 24 });
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
  void refreshTrayMenu();
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function sendSelectSourceToRenderer(source: CaptureSourceRef): void {
  const main = recordingControlDeps?.getMainWindow();
  if (!main || main.isDestroyed()) {
    return;
  }

  main.webContents.send(IpcChannels.RECORDER_SELECT_SOURCE_CHANNEL, source);
}

function selectCaptureSourceFromTray(source: DesktopCaptureSource): void {
  const ref = toCaptureSourceRef(source);

  recordingControlDeps?.setCaptureSource(ref);
  sendSelectSourceToRenderer(ref);
}

function armedSourceRefFromRemoteState(): CaptureSourceRef | null {
  const { armedSourceId, sourceName, armedSourceKind } = remoteState;
  if (!armedSourceId && !sourceName) {
    return null;
  }

  return {
    id: armedSourceId ?? "",
    name: sourceName ?? "",
    kind: armedSourceKind ?? "screen",
    ...(remoteState.armedSourceDisplayId ? { displayId: remoteState.armedSourceDisplayId } : {}),
  };
}

function buildSourceMenuItems(
  sources: DesktopCaptureSource[],
  disabled: boolean,
): import("electron").MenuItemConstructorOptions[] {
  if (sources.length === 0) {
    return [{ label: "No targets found", enabled: false }];
  }

  const armedRef = armedSourceRefFromRemoteState();

  return sources.map((source) => ({
    label: source.name,
    type: "radio" as const,
    checked: isSameCaptureSource(source, armedRef),
    enabled: !disabled,
    click: () => {
      selectCaptureSourceFromTray(source);
    },
  }));
}

async function refreshTrayMenu(): Promise<void> {
  if (!tray) {
    return;
  }

  const isRecording = remoteState.phase === "recording" || remoteState.phase === "stopping";
  const sourcesDisabled =
    isRecording || remoteState.phase === "stopping" || areaPickerActive;

  let sources: DesktopCaptureSource[] = [];
  try {
    sources = await listDesktopSources();
  } catch {
    sources = [];
  }

  const screens = sources.filter((source) => source.kind === "screen");
  const windows = sources.filter((source) => source.kind === "window");
  const defaultScreenId = screens[0]?.id;

  const menu = Menu.buildFromTemplate([
    {
      label: "Show Ceer",
      click: () => sendRecorderCommand("show-main"),
    },
    { type: "separator" },
    {
      label: "Screens",
      enabled: !areaPickerActive,
      submenu: buildSourceMenuItems(screens, sourcesDisabled),
    },
    {
      label: "Windows",
      enabled: !areaPickerActive,
      submenu: buildSourceMenuItems(windows, sourcesDisabled),
    },
    { type: "separator" },
    {
      label: "Snip region…",
      enabled: !sourcesDisabled && Boolean(defaultScreenId),
      click: () => {
        const armedRef = armedSourceRefFromRemoteState();
        const screenSource =
          (armedRef?.kind === "screen"
            ? screens.find((item) => isSameCaptureSource(item, armedRef))
            : undefined) ?? screens[0];
        if (screenSource) {
          selectCaptureSourceFromTray(screenSource);
        }
        sendRecorderCommand("pick-area");
      },
    },
    {
      label: "Refresh targets",
      enabled: !sourcesDisabled,
      click: () => {
        void refreshTrayMenu();
      },
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

  const targetLabel = remoteState.sourceName ? ` — ${remoteState.sourceName}` : "";
  tray.setToolTip(
    isRecording
      ? `Ceer — Recording ${formatElapsed(remoteState.elapsedMs)}${targetLabel}`
      : `Ceer — Screen recorder${targetLabel}`,
  );
}

function showMainWindow(): void {
  const main = recordingControlDeps?.getMainWindow();
  if (!main || main.isDestroyed()) {
    return;
  }

  if (main.isMinimized()) {
    main.restore();
  }
  main.show();
  main.focus();
}

function sendRecorderCommand(command: "start" | "stop" | "show-main" | "pick-area"): void {
  const main = recordingControlDeps?.getMainWindow();
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
    powerSaveBlockerId ??= powerSaveBlocker.start("prevent-app-suspension");
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
  const main = recordingControlDeps?.getMainWindow();
  if (main && !main.isDestroyed()) {
    return screen.getDisplayMatching(main.getBounds());
  }

  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function configureFloatingHud(window: BrowserWindow): void {
  // Keep the HUD on the current Space only — visibleOnAllWorkspaces makes Ceer follow
  // every Mission Control desktop and often wins focus when dismissing Exposé.
  if (process.platform === "darwin") {
    window.setVisibleOnAllWorkspaces(false);
  }
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
  window.showInactive();
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
    } else if (controlWidgetWindow.isVisible()) {
      configureFloatingHud(controlWidgetWindow);
    } else {
      showFloatingHud(controlWidgetWindow);
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

  void refreshTrayMenu();
}

function applyRemoteState(next: RecorderRemoteState, previousPhase: RecorderRemoteState["phase"]): void {
  remoteState = next;

  const isRecording = next.phase === "recording" || next.phase === "stopping";
  setPowerSaveBlocker(isRecording);

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

export function registerRecordingControl(deps: RecordingControlDeps): void {
  recordingControlDeps = deps;

  ipcMain.on(IpcChannels.RECORDER_STATE_PUBLISH_CHANNEL, (_event, state: RecorderRemoteState) => {
    const previousPhase = remoteState.phase;
    applyRemoteState(state, previousPhase);
  });

  ipcMain.on(IpcChannels.RECORDER_COMMAND_CHANNEL, (_event, command: RecorderRemoteCommand) => {
    if (command === "show-main") {
      showMainWindow();
      return;
    }

    const main = recordingControlDeps?.getMainWindow();
    if (main && !main.isDestroyed()) {
      main.webContents.send(IpcChannels.RECORDER_COMMAND_CHANNEL, command);
    }
  });

  tray = new Tray(createTrayIcon());
  tray.setToolTip("Ceer — Screen recorder");
  if (process.platform === "darwin") {
    tray.setTitle("");
    tray.on("right-click", () => {
      void refreshTrayMenu();
    });
  } else {
    tray.on("click", () => {
      void refreshTrayMenu().then(() => {
        tray?.popUpContextMenu();
      });
    });
  }
  void refreshTrayMenu();
}

/** macOS `activate` — avoid pulling focus to the main window when only the HUD is active. */
export function handleAppActivate(): void {
  const main = recordingControlDeps?.getMainWindow();
  if (!main || main.isDestroyed()) {
    return;
  }

  if (!main.isVisible()) {
    if (main.isMinimized()) {
      main.restore();
    }
    main.show();
    main.focus();
    return;
  }

  const hudSession =
    remoteState.phase === "armed" ||
    remoteState.phase === "recording" ||
    remoteState.phase === "stopping";
  const hudVisible =
    Boolean(controlWidgetWindow && !controlWidgetWindow.isDestroyed() && controlWidgetWindow.isVisible());

  if (hudSession && hudVisible) {
    return;
  }

  if (main.isMinimized()) {
    main.restore();
  }
  main.focus();
}

export function attachMainWindowCloseBehavior(window: BrowserWindow): void {
  window.on("close", (event) => {
    event.preventDefault();
    window.hide();
  });
}
