#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  mergeUpdateManifests,
  parseUpdateManifest,
  serializeUpdateManifest,
} from "./lib/update-manifest.ts";

const platform = process.argv[2];
const primaryPath = process.argv[3];
const secondaryPath = process.argv[4];
const outputPath = process.argv[5];

if (platform !== "mac" || !primaryPath || !secondaryPath) {
  console.error(
    "Usage: bun scripts/merge-update-manifests.ts mac <arm64-manifest> <x64-manifest> [output]",
  );
  process.exit(1);
}

const platformLabel = "macOS";
const primary = resolve(primaryPath);
const secondary = resolve(secondaryPath);
const output = resolve(outputPath ?? primaryPath);

const merged = mergeUpdateManifests(
  parseUpdateManifest(readFileSync(primary, "utf8"), primary, platformLabel),
  parseUpdateManifest(readFileSync(secondary, "utf8"), secondary, platformLabel),
  platformLabel,
);

writeFileSync(output, serializeUpdateManifest(merged, { platformLabel }));
