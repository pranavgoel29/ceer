import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { desktopDir } from "./electron-launcher.ts";

if (process.platform === "win32") {
  console.log("dev:kill is only supported on macOS and Linux.");
  process.exit(0);
}

const marker = join(desktopDir, "dist-electron/main.cjs");
spawnSync("pkill", ["-f", marker], { stdio: "ignore" });
process.exit(0);
