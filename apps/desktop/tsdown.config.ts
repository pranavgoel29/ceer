import { defineConfig } from "tsdown";

const shared = {
  format: "cjs" as const,
  outDir: "dist-electron",
  sourcemap: true,
  outExtensions: () => ({ js: ".cjs" }),
};

export default defineConfig([
  {
    ...shared,
    entry: ["src/main.ts"],
    clean: true,
    // Must stay external — bundling inlines getElectronPath() and breaks at runtime.
    external: ["electron"],
    noExternal: (id) => id.startsWith("@ceer/"),
  },
  {
    ...shared,
    entry: ["src/preload.ts"],
    external: ["electron"],
  },
  {
    ...shared,
    entry: ["src/area-picker-preload.ts"],
    external: ["electron"],
  },
]);
