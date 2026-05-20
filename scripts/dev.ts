import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runChildren } from "./lib/run-children.ts";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const webDir = join(repoRoot, "apps/web");
const desktopDir = join(repoRoot, "apps/desktop");

const port = process.env.PORT ?? "5173";
const host = process.env.HOST?.trim() || "localhost";

process.env.PORT = port;
process.env.HOST = host;
process.env.VITE_DEV_SERVER_URL = `http://${host}:${port}`;

const mode = process.argv[2];
const bun = Bun.which("bun");
if (!bun) {
  throw new Error("Could not find bun on PATH.");
}

const spawnDefaults = {
  env: process.env,
  stdin: "inherit" as const,
  stdout: "inherit" as const,
  stderr: "inherit" as const,
};

const children =
  mode === "web"
    ? [
        Bun.spawn({
          cmd: [bun, "run", "dev"],
          cwd: webDir,
          ...spawnDefaults,
        }),
      ]
    : [
        Bun.spawn({
          cmd: [bun, "run", "dev"],
          cwd: webDir,
          ...spawnDefaults,
        }),
        Bun.spawn({
          cmd: [bun, "x", "tsdown", "--watch"],
          cwd: desktopDir,
          ...spawnDefaults,
        }),
        Bun.spawn({
          cmd: [bun, "run", "dev:electron"],
          cwd: desktopDir,
          ...spawnDefaults,
        }),
      ];

await runChildren(children);
