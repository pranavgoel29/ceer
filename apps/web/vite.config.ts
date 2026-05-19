import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const port = Number(process.env.PORT ?? 5173);
const host = process.env.HOST?.trim() || "localhost";

export default defineConfig({
  plugins: [react()],
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
