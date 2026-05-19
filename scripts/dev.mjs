import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT ?? "5173";
const host = process.env.HOST?.trim() || "localhost";
const viteDevServerUrl = `http://${host}:${port}`;

const mode = process.argv[2];
const filters =
  mode === "desktop"
    ? ["--filter=@ceer/desktop", "--filter=@ceer/web"]
    : ["--filter=@ceer/web", "--filter=@ceer/desktop"];

const child = spawn("bun", ["run", "turbo", "run", "dev", ...filters, "--parallel"], {
  cwd: repoRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: port,
    HOST: host,
    VITE_DEV_SERVER_URL: viteDevServerUrl,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
