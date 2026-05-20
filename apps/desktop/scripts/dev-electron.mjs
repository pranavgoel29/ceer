import { spawn, spawnSync } from "node:child_process";
import { watch } from "node:fs";
import { join } from "node:path";
import * as Timers from "node:timers/promises";

import { desktopDir, resolveElectronPath } from "./electron-launcher.mjs";
import { waitForResources } from "./wait-for-resources.mjs";

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
const forcedShutdownTimeoutMs = 1_500;
const forcedKillAfterMs = 400;
const restartDebounceMs = 450;
const initialBundleQuietMs = 500;

const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;

let shuttingDown = false;
let stopping = false;
let launcherReady = false;
let restartTimer = null;
let currentApp = null;
let restartQueue = Promise.resolve();
let lastBundleWriteAt = Date.now();
const expectedExits = new WeakSet();
const watchers = [];

function killOrphanedDevInstances() {
  if (process.platform === "win32") {
    return;
  }

  const marker = join(desktopDir, "dist-electron/main.cjs");
  spawnSync("pkill", ["-f", marker], { stdio: "ignore" });
}

function signalAppShutdown(app) {
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

function signalAppForceKill(app) {
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

function startApp() {
  if (shuttingDown || stopping || currentApp !== null) {
    return;
  }

  const spawnOptions = {
    cwd: desktopDir,
    env: childEnv,
    stdio: "inherit",
  };

  if (process.platform !== "win32") {
    spawnOptions.detached = true;
  }

  const app = spawn(resolveElectronPath(), ["dist-electron/main.cjs"], spawnOptions);
  currentApp = app;

  app.once("error", () => {
    if (currentApp === app) {
      currentApp = null;
    }
    if (!shuttingDown) {
      scheduleRestart();
    }
  });

  app.once("exit", (code, signal) => {
    if (currentApp === app) {
      currentApp = null;
    }

    const exitedAbnormally = signal !== null || code !== 0;
    if (!shuttingDown && !expectedExits.has(app) && exitedAbnormally) {
      scheduleRestart();
    }
  });
}

async function stopApp() {
  const app = currentApp;
  if (!app) {
    return;
  }

  stopping = true;
  currentApp = null;
  expectedExits.add(app);

  await new Promise((resolve) => {
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
      }
    }, forcedKillAfterMs).unref();

    setTimeout(() => {
      if (!settled) {
        signalAppForceKill(app);
        finish();
      }
    }, forcedShutdownTimeoutMs).unref();
  });

  stopping = false;
}

function scheduleRestart() {
  if (shuttingDown || !launcherReady) {
    return;
  }

  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    restartQueue = restartQueue
      .catch(() => undefined)
      .then(async () => {
        await stopApp();
        if (!shuttingDown) {
          startApp();
        }
      });
  }, restartDebounceMs);
}

function startWatchers() {
  const watcher = watch(join(desktopDir, "dist-electron"), { persistent: true }, (_eventType, filename) => {
    if (typeof filename !== "string" || !restartWatchFiles.has(filename)) {
      return;
    }

    lastBundleWriteAt = Date.now();
    scheduleRestart();
  });
  watchers.push(watcher);
}

async function waitForInitialBundleQuiet() {
  while (Date.now() - lastBundleWriteAt < initialBundleQuietMs) {
    await Timers.setTimeout(50);
  }
}

async function shutdown(exitCode) {
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

  await restartQueue.catch(() => undefined);
  await stopApp();
  killOrphanedDevInstances();
  process.exit(exitCode);
}

killOrphanedDevInstances();
startWatchers();

await waitForResources({
  baseDir: desktopDir,
  files: requiredFiles,
  tcpHost: devServer.hostname,
  tcpPort: port,
});

await waitForInitialBundleQuiet();
launcherReady = true;
startApp();

process.once("SIGINT", () => {
  void shutdown(130);
});
process.once("SIGTERM", () => {
  void shutdown(143);
});
