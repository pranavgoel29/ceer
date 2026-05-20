import { existsSync, renameSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { desktopDir } from "./electron-launcher.ts";

/** Matches `directories.output` in electron-builder.yml */
const winUnpacked = join(desktopDir, "dist-out", "win-unpacked");

if (process.platform === "win32") {
  spawnSync("taskkill", ["/IM", "Ceer.exe", "/F", "/T"], { stdio: "ignore" });
} else {
  spawnSync("pkill", ["-f", join(desktopDir, "dist-electron/main.cjs")], { stdio: "ignore" });
}

if (!existsSync(winUnpacked)) {
  process.exit(0);
}

try {
  rmSync(winUnpacked, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  const stale = `${winUnpacked}.stale-${Date.now()}`;
  try {
    renameSync(winUnpacked, stale);
    console.warn(`[dist] Renamed locked ${winUnpacked} → ${stale}`);
  } catch {
    console.error(`Close Ceer, then retry. Could not remove ${winUnpacked}.`);
    process.exit(1);
  }
}
