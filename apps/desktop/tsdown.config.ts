import { defineConfig } from "tsdown";

const shared = {
  format: "cjs" as const,
  outDir: "dist-electron",
  sourcemap: true,
  outExtensions: () => ({ js: ".cjs" }),
  // Turbo writes logs under .turbo/ during `dist:mac`; ignore so watch mode does not rebuild.
  ignoreWatch: [".turbo/**"],
  deps: {
    // Must stay external — bundling inlines getElectronPath() and breaks at runtime.
    neverBundle: ["electron"],
  },
};

export default defineConfig([
  {
    ...shared,
    entry: ["src/main.ts"],
    clean: true,
    deps: {
      ...shared.deps,
      alwaysBundle: (id) => id.startsWith("@ceer/"),
    },
  },
  {
    ...shared,
    entry: ["src/preload.ts"],
  },
  {
    ...shared,
    entry: ["src/area-picker-preload.ts"],
  },
]);
