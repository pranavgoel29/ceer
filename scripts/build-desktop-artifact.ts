#!/usr/bin/env bun

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import { getCliBoolean, getCliString, parseCliArgs } from "./lib/parse-cli-args.ts";

const repoRoot = join(import.meta.dir, "..");
const desktopDir = join(repoRoot, "apps/desktop");
const distOutDir = join(desktopDir, "dist-out");

type BuildPlatform = "mac" | "win";
type BuildArch = "arm64" | "x64";

const PLATFORM_CONFIG: Record<
  BuildPlatform,
  { cliFlag: "--mac" | "--win"; defaultTarget: string; archChoices: readonly BuildArch[] }
> = {
  mac: {
    cliFlag: "--mac",
    defaultTarget: "dmg",
    archChoices: ["arm64", "x64"],
  },
  win: {
    cliFlag: "--win",
    defaultTarget: "nsis",
    archChoices: ["x64"],
  },
};

function detectHostPlatform(): BuildPlatform | undefined {
  if (process.platform === "darwin") return "mac";
  if (process.platform === "win32") return "win";
  return undefined;
}

function getDefaultArch(platform: BuildPlatform): BuildArch {
  if (platform === "win") {
    return "x64";
  }
  return process.arch === "arm64" ? "arm64" : "x64";
}

async function runCommandAsync(
  command: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
) {
  const subprocess = Bun.spawn({
    cmd: command,
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await subprocess.exited;
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

function copyArtifacts(outputDir: string) {
  if (!existsSync(distOutDir)) {
    console.error(`Build completed but dist-out was not found at ${distOutDir}`);
    process.exit(1);
  }

  mkdirSync(outputDir, { recursive: true });
  const copiedArtifacts: string[] = [];

  for (const entry of readdirSync(distOutDir)) {
    const from = join(distOutDir, entry);
    if (!statSync(from).isFile()) {
      continue;
    }

    const to = join(outputDir, entry);
    copyFileSync(from, to);
    copiedArtifacts.push(to);
  }

  if (copiedArtifacts.length === 0) {
    console.error(`Build completed but no files were produced in ${distOutDir}`);
    process.exit(1);
  }

  console.log("[desktop-artifact] Done. Artifacts:");
  for (const artifact of copiedArtifacts) {
    console.log(`  ${artifact}`);
  }
}

function isMacUpdateManifest(fileName: string): boolean {
  return fileName.endsWith(".yml") && fileName.includes("mac");
}

function backupMacUpdateManifests(backupDir: string): void {
  mkdirSync(backupDir, { recursive: true });
  for (const entry of readdirSync(distOutDir)) {
    if (!isMacUpdateManifest(entry)) {
      continue;
    }
    copyFileSync(join(distOutDir, entry), join(backupDir, entry));
  }
}

function restoreMacUpdateManifests(backupDir: string): void {
  if (!existsSync(backupDir)) {
    return;
  }

  for (const entry of readdirSync(backupDir)) {
    copyFileSync(join(backupDir, entry), join(distOutDir, entry));
  }
  rmSync(backupDir, { recursive: true, force: true });
}

function assertMacZipArtifactsPresent(): void {
  const zipArtifacts = readdirSync(distOutDir).filter((entry) => entry.toLowerCase().endsWith(".zip"));
  if (zipArtifacts.length === 0) {
    console.error(
      "[desktop-artifact] macOS zip artifact missing. electron-updater requires a .zip build.",
    );
    process.exit(1);
  }
}

const parsed = parseCliArgs(process.argv.slice(2));
const platformInput = getCliString(parsed, "platform");
const platform =
  platformInput === "mac" || platformInput === "win"
    ? platformInput
    : detectHostPlatform();

if (!platform) {
  console.error(
    `Unsupported host platform '${process.platform}'. Pass --platform mac or --platform win.`,
  );
  process.exit(1);
}

const platformConfig = PLATFORM_CONFIG[platform];
const targetInput = getCliString(parsed, "target") ?? platformConfig.defaultTarget;
const targets = targetInput.split(/\s+/).filter((value) => value.length > 0);
const archInput = getCliString(parsed, "arch");
const arch: BuildArch =
  archInput === "arm64" || archInput === "x64" ? archInput : getDefaultArch(platform);

if (!platformConfig.archChoices.includes(arch)) {
  console.error(`Unsupported arch '${arch}' for platform '${platform}'.`);
  process.exit(1);
}

const buildVersion = getCliString(parsed, "build-version");
const outputDir = join(repoRoot, getCliString(parsed, "output-dir") ?? "release");
const skipBuild = getCliBoolean(parsed, "skip-build");
const verbose = getCliBoolean(parsed, "verbose");
const bun = Bun.which("bun");

if (!bun) {
  console.error("Could not find bun on PATH.");
  process.exit(1);
}

if (!skipBuild) {
  console.log("[desktop-artifact] Building web and desktop bundles...");
  await runCommandAsync([bun, "run", "build"], {
    env: {
      ...process.env,
      ...(buildVersion ? { CEER_BUILD_VERSION: buildVersion } : {}),
    },
  });
}

console.log("[desktop-artifact] Preparing desktop dist...");
await runCommandAsync([bun, "run", "dist:prepare"], { cwd: desktopDir });

// Match local `dist:mac`: allow electron-builder to ad-hoc sign on macOS runners.
// Windows stays unsigned (see electron-builder.yml `win.sign: false`).
const buildEnv: NodeJS.ProcessEnv =
  platform === "win"
    ? { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" }
    : { ...process.env };

function createElectronBuilderArgs(macTarget?: string): string[] {
  const electronBuilderArgs = [
    "bunx",
    "electron-builder",
    platformConfig.cliFlag,
    ...(macTarget ? [macTarget] : targets),
    `--${arch}`,
    "--publish",
    "never",
  ];

  if (buildVersion) {
    electronBuilderArgs.push("-c.extraMetadata.version", buildVersion);
  }

  if (verbose) {
    electronBuilderArgs.push("--config.compression", "store");
  }

  return electronBuilderArgs;
}

async function runElectronBuilder(macTarget?: string): Promise<void> {
  await runCommandAsync(createElectronBuilderArgs(macTarget), {
    cwd: desktopDir,
    env: buildEnv,
  });
}

const buildMacZipThenDmg =
  platform === "mac" && targets.includes("dmg") && targets.includes("zip");

console.log(
  `[desktop-artifact] Building ${platform}/${targets.join(" ")} (arch=${arch}, version=${buildVersion ?? "package.json"})...`,
);

// electron-builder overwrites latest-mac.yml with DMG when both targets run together.
// Build zip first (updater manifest + .zip), then dmg (installer), then restore zip manifests.
if (buildMacZipThenDmg) {
  const manifestBackupDir = join(distOutDir, ".mac-update-manifest-backup");

  console.log("[desktop-artifact] macOS pass 1/2: zip (auto-update)...");
  await runElectronBuilder("zip");
  backupMacUpdateManifests(manifestBackupDir);

  console.log("[desktop-artifact] macOS pass 2/2: dmg (installer)...");
  await runElectronBuilder("dmg");
  restoreMacUpdateManifests(manifestBackupDir);
  assertMacZipArtifactsPresent();
} else {
  await runElectronBuilder();
}

copyArtifacts(outputDir);
