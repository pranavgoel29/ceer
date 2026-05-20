import { spawn } from "node:child_process";

import { desktopDir, resolveElectronPath } from "./electron-launcher.ts";

const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;
delete childEnv.VITE_DEV_SERVER_URL;

const app = spawn(resolveElectronPath(), ["dist-electron/main.cjs"], {
  cwd: desktopDir,
  env: childEnv,
  stdio: "inherit",
});

app.on("exit", (code) => {
  process.exit(code ?? 0);
});
