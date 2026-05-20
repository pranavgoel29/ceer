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
let mainHiddenForCaptureSession = false;
let controlBarShown = false;
let appIsActive = true;

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

function pushRecorderStateTo(window: BrowserWindow): void {
  if (!window.isDestroyed()) {
    window.webContents.send(IpcChannels.RECORDER_STATE_CHANNEL, remoteState);
  }
}

function pushRecorderStateToAllWindows(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    pushRecorderStateTo(window);
  }
}

let trayMenuRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleTrayMenuRefresh(): void {
  if (trayMenuRefreshTimer !== null) {
    return;
  }
  trayMenuRefreshTimer = setTimeout(() => {
    trayMenuRefreshTimer = null;
    void refreshTrayMenu();
  }, 1000);
}

function broadcastRecorderState(options?: { refreshTray?: boolean }): void {
  pushRecorderStateToAllWindows();
  if (options?.refreshTray) {
    void refreshTrayMenu();
  } else if (isRecordingPhase(remoteState.phase)) {
    scheduleTrayMenuRefresh();
  }
}

function attachHudStateSync(window: BrowserWindow): void {
  const push = () => {
    pushRecorderStateTo(window);
  };

  window.webContents.on("did-finish-load", push);
  if (!window.webContents.isLoading()) {
    push();
  }
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

  const isRecording = isRecordingPhase(remoteState.phase);
  const sourcesDisabled = isRecording || areaPickerActive;
  const canShowControlBar = canShowControlWidget();

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
      label: isControlBarMenuVisible() ? "Hide control bar" : "Show control bar",
      enabled: canShowControlBar,
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

  mainHiddenForCaptureSession = false;
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
  const { armedSourceDisplayId } = remoteState;
  if (armedSourceDisplayId) {
    const armedDisplay = screen
      .getAllDisplays()
      .find((display) => String(display.id) === armedSourceDisplayId);
    if (armedDisplay) {
      return armedDisplay;
    }
  }

  const main = recordingControlDeps?.getMainWindow();
  if (main && !main.isDestroyed()) {
    return screen.getDisplayMatching(main.getBounds());
  }

  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

type HudPresentationMode = "standard" | "fullscreen-overlay";

let hudPresentationMode: HudPresentationMode | null = null;

function applyHudPresentation(window: BrowserWindow, fullscreenOverlay: boolean): void {
  const mode: HudPresentationMode = fullscreenOverlay ? "fullscreen-overlay" : "standard";
  if (hudPresentationMode === mode) {
    return;
  }
  hudPresentationMode = mode;

  if (process.platform === "darwin") {
    if (mode === "fullscreen-overlay") {
      // `type: "panel"` (see createControlWidgetWindow) is what Electron documents for
      // floating above other apps' native fullscreen. visibleOnFullScreen alone is unreliable.
      window.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true,
      });
      window.setAlwaysOnTop(true, "screen-saver", 1);
      return;
    }

    window.setVisibleOnAllWorkspaces(false, { skipTransformProcessType: true });
    window.setAlwaysOnTop(true, "floating");
    return;
  }

  window.setAlwaysOnTop(true, mode === "fullscreen-overlay" ? "screen-saver" : "floating");
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
    width: 272,
    height: 88,
    ...(process.platform === "darwin"
      ? { type: "panel" as const, acceptFirstMouse: true }
      : {}),
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
    webPreferences: {
      preload: resolveControlWidgetPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  hudPresentationMode = null;
  attachHudStateSync(window);
  loadControlWidgetPage(window);

  window.once("ready-to-show", () => {
    syncControlWidgetVisibility();
    pushRecorderStateTo(window);
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
    controlBarShown = false;
    return;
  }

  const fullscreenOverlay = shouldUseFullscreenOverlay();
  // Re-apply macOS collection behaviors after hide/show (Electron fullscreen overlay is flaky otherwise).
  hudPresentationMode = null;
  applyHudPresentation(window, fullscreenOverlay);

  if (!controlBarShown) {
    positionControlWidget(window);
    window.showInactive();
    controlBarShown = true;
  } else if (fullscreenOverlay) {
    // Re-anchor when the armed display changes mid-session.
    positionControlWidget(window);
  }

  pushRecorderStateTo(window);
}

function isRecordingPhase(phase: RecorderRemoteState["phase"]): boolean {
  return phase === "recording" || phase === "stopping";
}

function hasArmedCaptureTarget(state: RecorderRemoteState): boolean {
  return (
    state.phase === "armed" &&
    state.canRecord &&
    (Boolean(state.armedSourceId) || Boolean(state.sourceName))
  );
}

function shouldUseFullscreenOverlay(): boolean {
  return isRecordingPhase(remoteState.phase) || hasArmedCaptureTarget(remoteState);
}

function isControlBarMenuVisible(): boolean {
  return (
    hudVisiblePreference &&
    shouldUseFullscreenOverlay() &&
    controlBarShown &&
    controlWidgetWindow !== null &&
    !controlWidgetWindow.isDestroyed()
  );
}

function canShowControlWidget(): boolean {
  if (areaPickerActive) {
    return false;
  }

  return isRecordingPhase(remoteState.phase) || hasArmedCaptureTarget(remoteState);
}

function shouldShowControlWidget(): boolean {
  return hudVisiblePreference && canShowControlWidget();
}

function canPresentFloatingHud(): boolean {
  if (!shouldShowControlWidget()) {
    return false;
  }

  // While recording, always allow the HUD over other apps/spaces. When only armed, block the
  // initial auto-show while inactive (Mission Control) so we do not steal focus.
  if (
    process.platform === "darwin" &&
    !appIsActive &&
    !controlBarShown &&
    !isRecordingPhase(remoteState.phase)
  ) {
    return false;
  }

  return true;
}

export function setAreaPickerActive(active: boolean): void {
  areaPickerActive = active;
  if (active && controlWidgetWindow && !controlWidgetWindow.isDestroyed()) {
    controlWidgetWindow.hide();
    controlBarShown = false;
  }
  syncControlWidgetVisibility();
}

function syncControlWidgetVisibility(): void {
  if (canPresentFloatingHud()) {
    if (!controlWidgetWindow || controlWidgetWindow.isDestroyed()) {
      controlWidgetWindow = createControlWidgetWindow();
    } else {
      showFloatingHud(controlWidgetWindow);
    }
    return;
  }

  if (controlBarShown && controlWidgetWindow && !controlWidgetWindow.isDestroyed()) {
    controlWidgetWindow.hide();
    controlBarShown = false;
  }

  if (controlWidgetWindow && !controlWidgetWindow.isDestroyed()) {
    applyHudPresentation(controlWidgetWindow, false);
  }
}

function hideMainForCaptureSession(): void {
  const main = recordingControlDeps?.getMainWindow();
  if (!main || main.isDestroyed() || !main.isVisible()) {
    return;
  }

  main.hide();
  mainHiddenForCaptureSession = true;
}

function showMainAfterCaptureSession(focus = true): void {
  const main = recordingControlDeps?.getMainWindow();
  if (!main || main.isDestroyed()) {
    return;
  }

  mainHiddenForCaptureSession = false;
  if (main.isMinimized()) {
    main.restore();
  }
  if (focus) {
    showMainWindow();
    return;
  }

  if (!main.isVisible()) {
    main.showInactive();
  }
}

function hideControlWidget(): void {
  hudVisiblePreference = false;
  if (controlWidgetWindow && !controlWidgetWindow.isDestroyed()) {
    controlWidgetWindow.hide();
  }
  controlBarShown = false;
  void refreshTrayMenu();
}

function toggleControlWidget(): void {
  if (!controlWidgetWindow || controlWidgetWindow.isDestroyed()) {
    hudVisiblePreference = true;
    syncControlWidgetVisibility();
    return;
  }

  if (isControlBarMenuVisible()) {
    hideControlWidget();
  } else {
    hudVisiblePreference = true;
    showFloatingHud(controlWidgetWindow);
  }

  void refreshTrayMenu();
}

function recorderStateAffectsHudVisibility(
  next: RecorderRemoteState,
  previous: RecorderRemoteState,
): boolean {
  return (
    next.phase !== previous.phase ||
    next.canRecord !== previous.canRecord ||
    next.canStop !== previous.canStop ||
    next.armedSourceId !== previous.armedSourceId ||
    next.armedSourceDisplayId !== previous.armedSourceDisplayId ||
    next.armedSourceKind !== previous.armedSourceKind ||
    next.sourceName !== previous.sourceName
  );
}

function applyRemoteState(next: RecorderRemoteState, previous: RecorderRemoteState): void {
  const previousPhase = previous.phase;
  remoteState = next;

  const isRecording = isRecordingPhase(next.phase);
  const previousRecording = isRecordingPhase(previousPhase);
  const hudVisibilityChanged = recorderStateAffectsHudVisibility(next, previous);
  setPowerSaveBlocker(isRecording);

  if (isRecording && !previousRecording) {
    hideMainForCaptureSession();
  }

  if (!isRecording && previousRecording) {
    if (next.phase === "stopped") {
      showRecordingNotification("Recording ready — export or discard in Ceer.");
      showMainAfterCaptureSession(true);
    } else {
      showMainAfterCaptureSession(false);
    }
  }

  if (next.phase === "recording" && previousPhase !== "recording") {
    showRecordingNotification("Recording… Click to open Ceer.");
  }

  if (hudVisibilityChanged) {
    syncControlWidgetVisibility();
  }

  broadcastRecorderState({ refreshTray: hudVisibilityChanged });
}

export function registerRecordingControl(deps: RecordingControlDeps): void {
  recordingControlDeps = deps;

  ipcMain.on(IpcChannels.RECORDER_STATE_GET_CHANNEL, (event) => {
    event.returnValue = remoteState;
  });

  ipcMain.on(IpcChannels.RECORDER_STATE_PUBLISH_CHANNEL, (_event, state: RecorderRemoteState) => {
    applyRemoteState(state, remoteState);
  });

  ipcMain.on(IpcChannels.RECORDER_COMMAND_CHANNEL, (_event, command: RecorderRemoteCommand) => {
    if (command === "show-main") {
      showMainWindow();
      return;
    }

    if (command === "hide-control-bar") {
      hideControlWidget();
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

  if (process.platform === "darwin") {
    app.on("did-resign-active", () => {
      appIsActive = false;
      // Keep the HUD visible while recording so elapsed updates do not fight hide/show.
      if (!isRecordingPhase(remoteState.phase)) {
        syncControlWidgetVisibility();
      }
    });

    app.on("did-become-active", () => {
      appIsActive = true;
      syncControlWidgetVisibility();
    });
  }
}

/** macOS `activate` — avoid pulling focus to the main window when only the HUD is active. */
export function handleAppActivate(): void {
  const main = recordingControlDeps?.getMainWindow();
  if (!main || main.isDestroyed()) {
    return;
  }

  const recordingActive = isRecordingPhase(remoteState.phase);

  if (recordingActive && mainHiddenForCaptureSession) {
    syncControlWidgetVisibility();
    return;
  }

  if (!main.isVisible()) {
    if (main.isMinimized()) {
      main.restore();
    }
    if (recordingActive) {
      main.showInactive();
      syncControlWidgetVisibility();
      return;
    }
    main.show();
    main.focus();
    return;
  }

  if (recordingActive) {
    syncControlWidgetVisibility();
    return;
  }

  if (main.isMinimized()) {
    main.restore();
  }
  main.focus();
}

export function attachMainWindowCloseBehavior(
  window: BrowserWindow,
  shouldCloseToTray: () => boolean,
): void {
  window.on("close", (event) => {
    if (!shouldCloseToTray()) {
      return;
    }
    event.preventDefault();
    window.hide();
  });
}
