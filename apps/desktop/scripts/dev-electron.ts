import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { watch, type FSWatcher } from "node:fs";
import { join } from "node:path";

import { clearDevElectronPid, writeDevElectronPid } from "./lib/stop-instances.ts";
import { desktopDir, resolveElectronPath } from "./lib/paths.ts";
import { waitForResources } from "./lib/wait-ready.ts";

const devServerUrl = process.env.VITE_DEV_SERVER_URL?.trim();
if (!devServerUrl) {
  throw new Error("VITE_DEV_SERVER_URL is required for desktop development.");
}

const devServer = new URL(devServerUrl);
const port = Number.parseInt(devServer.port, 10);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`VITE_DEV_SERVER_URL must include an explicit port: ${devServerUrl}`);
}

const requiredFiles = ["dist-electron/main.cjs", "dist-electron/preload.cjs"];
const restartWatchFiles = new Set(["main.cjs", "preload.cjs"]);
const forcedShutdownTimeoutMs = 1_000;
const restartDebounceMs = 450;

const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;

let shuttingDown = false;
let stopping = false;
let restarting = false;
let launcherReady = false;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let currentApp: ChildProcess | null = null;
const expectedExits = new WeakSet<ChildProcess>();
const watchers: FSWatcher[] = [];

function signalAppShutdown(app: ChildProcess): void {
  const pid = app.pid;
  if (!pid) {
    return;
  }

  if (process.platform !== "win32") {
    try {
      process.kill(-pid, "SIGTERM");
      return;
    } catch {
      // Fall through to direct child signal.
    }
  }

  app.kill("SIGTERM");
}

function signalAppForceKill(app: ChildProcess): void {
  const pid = app.pid;
  if (!pid) {
    return;
  }

  if (process.platform !== "win32") {
    try {
      process.kill(-pid, "SIGKILL");
      return;
    } catch {
      // Fall through to direct child signal.
    }
  }

  app.kill("SIGKILL");
}

function startApp(): void {
  if (shuttingDown || stopping || currentApp !== null) {
    return;
  }

  const spawnOptions: SpawnOptions = {
    cwd: desktopDir,
    env: childEnv,
    stdio: "inherit",
  };

  if (process.platform !== "win32") {
    spawnOptions.detached = true;
  }

  const app = spawn(resolveElectronPath(), ["dist-electron/main.cjs"], spawnOptions);
  currentApp = app;

  if (app.pid) {
    writeDevElectronPid(app.pid);
  }

  app.once("error", () => {
    if (currentApp === app) {
      currentApp = null;
      clearDevElectronPid();
    }
    if (!shuttingDown) {
      scheduleRestart();
    }
  });

  app.once("exit", (code, signal) => {
    if (currentApp === app) {
      currentApp = null;
      clearDevElectronPid();
    }

    const exitedAbnormally = signal !== null || code !== 0;
    if (!shuttingDown && !expectedExits.has(app) && exitedAbnormally) {
      scheduleRestart();
    }
  });
}

async function stopApp(): Promise<void> {
  const app = currentApp;
  if (!app) {
    return;
  }

  stopping = true;
  currentApp = null;
  expectedExits.add(app);
  clearDevElectronPid();

  await new Promise<void>((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };

    app.once("exit", finish);
    signalAppShutdown(app);

    setTimeout(() => {
      if (!settled) {
        signalAppForceKill(app);
        finish();
      }
    }, forcedShutdownTimeoutMs).unref();
  });

  stopping = false;
}

function scheduleRestart(): void {
  if (shuttingDown || !launcherReady || restarting) {
    return;
  }

  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    void restartApp();
  }, restartDebounceMs);
}

async function restartApp(): Promise<void> {
  if (shuttingDown || restarting) {
    return;
  }

  restarting = true;
  try {
    await stopApp();
    if (!shuttingDown) {
      startApp();
    }
  } finally {
    restarting = false;
  }
}

function startWatchers(): void {
  const watcher = watch(join(desktopDir, "dist-electron"), { persistent: true }, (_eventType, filename) => {
    if (typeof filename !== "string" || !restartWatchFiles.has(filename)) {
      return;
    }

    scheduleRestart();
  });
  watchers.push(watcher);
}

async function shutdown(exitCode: number): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  for (const watcher of watchers) {
    watcher.close();
  }

  await stopApp();
  clearDevElectronPid();
  process.exit(exitCode);
}

await waitForResources({
  baseDir: desktopDir,
  files: requiredFiles,
  tcpHost: devServer.hostname,
  tcpPort: port,
});

startWatchers();
launcherReady = true;
startApp();

process.once("SIGINT", () => {
  void shutdown(130);
});
process.once("SIGTERM", () => {
  void shutdown(143);
});
