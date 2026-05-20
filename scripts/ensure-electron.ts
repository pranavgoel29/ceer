import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const desktopPackageJson = join(repoRoot, "apps/desktop/package.json");
const require = createRequire(desktopPackageJson);

function resolveElectronDir(): string | null {
  try {
    return dirname(require.resolve("electron/package.json"));
  } catch {
    return null;
  }
}

function platformRelativePath(): string {
  switch (process.platform) {
    case "darwin":
      return "Electron.app/Contents/MacOS/Electron";
    case "win32":
      return "electron.exe";
    default:
      return "electron";
  }
}

function tryResolveElectronBinary(): string | null {
  try {
    const binaryPath = require("electron") as string;
    return typeof binaryPath === "string" && existsSync(binaryPath) ? binaryPath : null;
  } catch {
    return null;
  }
}

function repairPathTxt(electronDir: string): boolean {
  const relativePath = platformRelativePath();
  const binaryPath = join(electronDir, "dist", relativePath);
  if (!existsSync(binaryPath)) {
    return false;
  }

  writeFileSync(join(electronDir, "path.txt"), relativePath);
  return true;
}

const electronDir = resolveElectronDir();
if (!electronDir) {
  console.warn("[ensure-electron] electron is not installed; skipping.");
  process.exit(0);
}

if (tryResolveElectronBinary()) {
  process.exit(0);
}

if (repairPathTxt(electronDir) && tryResolveElectronBinary()) {
  console.log("[ensure-electron] Repaired path.txt for an existing Electron download.");
  process.exit(0);
}

console.log("[ensure-electron] Downloading Electron binary (Bun skipped the default postinstall)…");

const result = spawnSync(process.execPath, [join(electronDir, "install.js")], {
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!tryResolveElectronBinary()) {
  console.error("[ensure-electron] Electron install finished but the binary is still missing.");
  process.exit(1);
}
