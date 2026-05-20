const port = process.env.PORT ?? "5173";
const host = process.env.HOST?.trim() || "localhost";

process.env.PORT = port;
process.env.HOST = host;
process.env.VITE_DEV_SERVER_URL = `http://${host}:${port}`;

const mode = process.argv[2];
const filters =
  mode === "desktop"
    ? ["--filter=@ceer/desktop", "--filter=@ceer/web"]
    : ["--filter=@ceer/web", "--filter=@ceer/desktop"];

const bun = Bun.which("bun");
if (!bun) {
  throw new Error("Could not find bun on PATH.");
}

const child = Bun.spawn({
  cmd: [bun, "x", "turbo", "run", "dev", ...filters],
  cwd: import.meta.dirname + "/..",
  env: process.env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

const exitCode = await child.exited;
process.exit(exitCode);
