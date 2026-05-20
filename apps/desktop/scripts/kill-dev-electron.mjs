import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { desktopDir } from "./electron-launcher.mjs";

if (process.platform === "win32") {
  console.log("dev:kill is only supported on macOS and Linux.");
  process.exit(0);
}

const marker = join(desktopDir, "dist-electron/main.cjs");
const result = spawnSync("pkill", ["-f", marker], { stdio: "ignore" });
process.exit(result.status === 0 ? 0 : 0);
