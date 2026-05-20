import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { desktopDir } from "./electron-launcher.ts";

if (process.platform === "win32") {
  spawnSync("taskkill", ["/IM", "Ceer.exe", "/F", "/T"], { stdio: "ignore" });
} else {
  const marker = join(desktopDir, "dist-electron/main.cjs");
  spawnSync("pkill", ["-f", marker], { stdio: "ignore" });
}
