#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const releasePackageFiles = [
  "apps/desktop/package.json",
  "apps/web/package.json",
  "packages/contracts/package.json",
] as const;

const version = process.argv[2]?.trim();
const writeGithubOutput = process.argv.includes("--github-output");

if (!version) {
  console.error("Usage: bun scripts/update-release-package-versions.ts <version> [--github-output]");
  process.exit(1);
}

const repoRoot = join(import.meta.dir, "..");
let changed = false;

for (const relativePath of releasePackageFiles) {
  const filePath = join(repoRoot, relativePath);
  const packageJson = JSON.parse(readFileSync(filePath, "utf8")) as { version?: string };
  if (packageJson.version === version) {
    continue;
  }

  packageJson.version = version;
  writeFileSync(filePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  changed = true;
}

if (writeGithubOutput) {
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (!githubOutput) {
    console.error("GITHUB_OUTPUT is not set.");
    process.exit(1);
  }
  writeFileSync(githubOutput, `changed=${changed}\n`, { flag: "a" });
}

console.log(changed ? `Updated package versions to ${version}.` : `Package versions already ${version}.`);
