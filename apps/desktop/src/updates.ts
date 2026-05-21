import { BrowserWindow, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";

import type { DesktopUpdateActionResult, DesktopUpdateState } from "@ceer/contracts";

import * as IpcChannels from "./ipc/channels.ts";

const STARTUP_DELAY_MS = 15_000;
const POLL_INTERVAL_MS = 4 * 60 * 60_000;

const idleState: DesktopUpdateState = { status: "idle" };

let updateState: DesktopUpdateState = idleState;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let checkInFlight = false;

function broadcastUpdateState(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue;
    }
    window.webContents.send(IpcChannels.UPDATE_STATE_CHANNEL, updateState);
  }
}

function setUpdateState(next: DesktopUpdateState): void {
  updateState = next;
  broadcastUpdateState();
}

function resolveGithubToken(): string | undefined {
  const token =
    process.env.CEER_UPDATE_GITHUB_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim();
  return token && token.length > 0 ? token : undefined;
}

async function checkForUpdates(reason: string): Promise<void> {
  if (checkInFlight) {
    return;
  }

  checkInFlight = true;
  console.info(`[ceer-updater] Checking for updates (${reason})...`);

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ceer-updater] Check failed: ${message}`);
    setUpdateState({
      status: "error",
      errorMessage: message,
    });
  } finally {
    checkInFlight = false;
  }
}

export function registerAppUpdates(): void {
  if (process.platform !== "darwin" && process.platform !== "win32") {
    console.info("[ceer-updater] Updates are not supported on this platform.");
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;

  const token = resolveGithubToken();
  if (token) {
    autoUpdater.requestHeaders = {
      Authorization: `Bearer ${token}`,
    };
  }

  autoUpdater.on("checking-for-update", () => {
    setUpdateState({ status: "checking" });
  });

  autoUpdater.on("update-not-available", () => {
    setUpdateState(idleState);
  });

  autoUpdater.on("update-available", (info) => {
    setUpdateState({
      status: "available",
      availableVersion: info.version,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    setUpdateState({
      status: "downloading",
      availableVersion: updateState.availableVersion,
      progressPercent: progress.percent,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    setUpdateState({
      status: "ready",
      availableVersion: info.version,
      progressPercent: 100,
    });
  });

  autoUpdater.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ceer-updater] ${message}`);
    setUpdateState({
      status: "error",
      errorMessage: message,
      availableVersion: updateState.availableVersion,
    });
  });

  ipcMain.on(IpcChannels.GET_UPDATE_STATE_CHANNEL, (event) => {
    event.returnValue = updateState;
  });

  ipcMain.handle(IpcChannels.CHECK_FOR_UPDATES_CHANNEL, async () => {
    await checkForUpdates("manual");
  });

  ipcMain.handle(IpcChannels.DOWNLOAD_UPDATE_CHANNEL, async (): Promise<DesktopUpdateActionResult> => {
    if (updateState.status !== "available") {
      return {
        ok: false,
        errorMessage: "No update is available to download.",
      };
    }

    try {
      setUpdateState({
        status: "downloading",
        availableVersion: updateState.availableVersion,
        progressPercent: 0,
      });
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setUpdateState({
        status: "error",
        errorMessage: message,
        availableVersion: updateState.availableVersion,
      });
      return { ok: false, errorMessage: message };
    }
  });

  ipcMain.handle(IpcChannels.INSTALL_UPDATE_CHANNEL, (): DesktopUpdateActionResult => {
    if (updateState.status !== "ready") {
      return {
        ok: false,
        errorMessage: "Download an update before installing.",
      };
    }

    autoUpdater.quitAndInstall();
    return { ok: true };
  });

  setTimeout(() => {
    void checkForUpdates("startup");
  }, STARTUP_DELAY_MS);

  pollTimer = setInterval(() => {
    void checkForUpdates("poll");
  }, POLL_INTERVAL_MS);
}

export function disposeAppUpdates(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
