import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

import { detachStaleDmgVolumes } from "./lib/detach-dmg-volumes.ts";
import { desktopDir } from "./lib/paths.ts";
import { stopPackagedInstances } from "./lib/stop-instances.ts";

/** Matches `directories.output` in electron-builder.yml */
const winUnpacked = join(desktopDir, "dist-out", "win-unpacked");

stopPackagedInstances();

if (!detachStaleDmgVolumes()) {
  process.exit(1);
}

if (!existsSync(winUnpacked)) {
  process.exit(0);
}

try {
  rmSync(winUnpacked, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  console.error(`Close Ceer (or run \`bun run stop\`), then retry. Could not remove ${winUnpacked}.`);
  process.exit(1);
}
