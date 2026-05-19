import { app } from "electron";
import path from "node:path";

/** Path to the built web `index.html` (dev build output or packaged `extraResources`). */
export function resolveProductionIndexPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "web", "index.html");
  }
  return path.join(__dirname, "../../web/dist/index.html");
}
