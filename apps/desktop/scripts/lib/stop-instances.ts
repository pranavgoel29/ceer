import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { desktopDir } from "./paths.ts";

export const devElectronPidFile = join(desktopDir, ".dev-electron.pid");

const mainCjsMarker = join(desktopDir, "dist-electron/main.cjs");

/** Stop packaged Ceer from `dist-out/win-unpacked` (Windows file locks). */
export function stopPackagedInstances(): void {
  if (process.platform !== "win32") {
    return;
  }

  spawnSync("taskkill", ["/IM", "Ceer.exe", "/F", "/T"], { stdio: "ignore" });
}

/** Stop the dev Electron launcher (electron.exe on Windows, electron on Unix). */
export function stopDevInstances(): void {
  if (process.platform === "win32") {
    if (!existsSync(devElectronPidFile)) {
      return;
    }

    const raw = readFileSync(devElectronPidFile, "utf8").trim();
    const pid = Number.parseInt(raw, 10);
    if (Number.isInteger(pid) && pid > 0) {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    }

    try {
      unlinkSync(devElectronPidFile);
    } catch {
      // Ignore stale or locked pid file.
    }
    return;
  }

  spawnSync("pkill", ["-f", mainCjsMarker], { stdio: "ignore" });
}

export function stopAllInstances(): void {
  stopPackagedInstances();
  stopDevInstances();
}

export function writeDevElectronPid(pid: number): void {
  writeFileSync(devElectronPidFile, `${pid}\n`, "utf8");
}

export function clearDevElectronPid(): void {
  try {
    unlinkSync(devElectronPidFile);
  } catch {
    // Ignore if already removed.
  }
}
