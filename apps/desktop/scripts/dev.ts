import { desktopDir } from "./electron-launcher.ts";

const bun = Bun.which("bun");
if (!bun) {
  throw new Error("Could not find bun on PATH.");
}

const commands = ["dev:bundle", "dev:electron"];
const children = commands.map((scriptName) =>
  Bun.spawn({
    cmd: [bun, "run", scriptName],
    cwd: desktopDir,
    env: process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }),
);

let shuttingDown = false;

function killChildren(): void {
  for (const child of children) {
    child.kill();
  }
}

async function shutdown(exitCode: number): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  killChildren();
  await Promise.allSettled(children.map((child) => child.exited));
  process.exit(exitCode);
}

process.once("SIGINT", () => {
  void shutdown(130);
});

process.once("SIGTERM", () => {
  void shutdown(143);
});

const exits = children.map(async (child) => {
  const exitCode = await child.exited;
  return exitCode;
});

const firstExitCode = await Promise.race(exits);
await shutdown(firstExitCode);
