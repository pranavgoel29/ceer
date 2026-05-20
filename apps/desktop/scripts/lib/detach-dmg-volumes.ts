import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const volumesRoot = "/Volumes";
const productVolumePrefix = "Ceer";

/** Unmount leftover Ceer installer DMGs so electron-builder can rebuild on macOS. */
export function detachStaleDmgVolumes(): boolean {
  if (process.platform !== "darwin") {
    return true;
  }

  let names: string[];
  try {
    names = readdirSync(volumesRoot);
  } catch {
    console.error(`Could not read ${volumesRoot}.`);
    return false;
  }

  let ok = true;
  for (const name of names) {
    if (!name.startsWith(productVolumePrefix)) {
      continue;
    }

    const mountPoint = `${volumesRoot}/${name}`;
    const result = spawnSync("hdiutil", ["detach", mountPoint, "-quiet", "-force"], {
      encoding: "utf8",
    });

    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || "").trim();
      console.error(`Could not detach ${mountPoint}${detail ? `: ${detail}` : ""}`);
      ok = false;
      continue;
    }

    console.log(`Detached stale DMG volume: ${mountPoint}`);
  }

  return ok;
}
