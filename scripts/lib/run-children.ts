import type { Subprocess } from "bun";

export async function runChildren(children: Subprocess[]): Promise<void> {
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

  const exits = children.map((child) => child.exited);
  const firstExitCode = await Promise.race(exits);
  await shutdown(firstExitCode);
}
