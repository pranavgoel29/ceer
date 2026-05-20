import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const desktopDir = resolve(__dirname, "..");

/** Resolve the Electron binary from the desktop package (works with Bun’s node_modules layout). */
export function resolveElectronPath(): string {
  const require = createRequire(join(desktopDir, "package.json"));
  return require("electron") as string;
}
