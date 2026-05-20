import { copyFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const port = Number(process.env.PORT ?? 5173);
const host = process.env.HOST?.trim() || "localhost";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconDir = path.resolve(__dirname, "../desktop/resources");

const iconRoutes: Record<string, { file: string; type: string }> = {
  "/favicon.ico": { file: "favicon.ico", type: "image/x-icon" },
  "/favicon.svg": { file: "favicon.svg", type: "image/svg+xml" },
  "/favicon-32.png": { file: "favicon-32.png", type: "image/png" },
  "/favicon-192.png": { file: "favicon-192.png", type: "image/png" },
};

function ceerAppIcons(): Plugin {
  return {
    name: "ceer-app-icons",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const route = iconRoutes[req.url?.split("?")[0] ?? ""];
        if (!route) {
          next();
          return;
        }

        const iconPath = path.join(iconDir, route.file);
        if (!existsSync(iconPath)) {
          next();
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", route.type);
        res.end(readFileSync(iconPath));
      });
    },
    closeBundle() {
      const outDir = path.resolve(__dirname, "dist");
      const copies: Array<[string, string]> = [
        ["favicon.ico", "favicon.ico"],
        ["favicon.svg", "favicon.svg"],
        ["favicon-32.png", "favicon-32.png"],
        ["favicon-192.png", "favicon-192.png"],
      ];
      for (const [sourceName, destName] of copies) {
        const source = path.join(iconDir, sourceName);
        if (existsSync(source)) {
          copyFileSync(source, path.join(outDir, destName));
        }
      }
    },
  };
}

export default defineConfig({
  // Relative asset URLs so Electron `loadFile()` can load the production bundle.
  base: "./",
  plugins: [react(), tailwindcss(), ceerAppIcons()],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host,
    port,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
