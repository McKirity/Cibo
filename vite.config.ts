import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

/**
 * The PINNED lucide version, read from package.json at build time and injected
 * as a constant (Settings → Habits → Icons reads it).
 *
 * Read from our own dependency entry rather than from lucide's package.json,
 * because that is where the PIN lives — the exact string, no caret, which is
 * the thing [[Iconography]] § Versioning rules must be locked. If a caret ever
 * creeps back in, this readout shows it, which is a useful accident.
 */
const pkg = (() => {
  try {
    return JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
  } catch {
    return {};
  }
})();
const lucideVersion = String(pkg.dependencies?.lucide ?? "unknown");
/** The app's own version — Settings → Health's identity row, and About's. */
const appVersion = String(pkg.version ?? "0.0.0");
/**
 * The build date, for About's version line (the frozen face draws
 * "Cibo 0.9.4 · build 2026.07.12"). Stamped at config load — which makes a
 * build non-reproducible byte-for-byte, taken knowingly: for a personal app
 * shipped by auto-update, "which build am I running" is worth more than
 * reproducibility, and nothing here verifies binaries.
 */
const buildDate = new Date().toISOString().slice(0, 10);

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  define: {
    __LUCIDE_VERSION__: JSON.stringify(lucideVersion),
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },

  // Evolu: its workers/WASM must not be pre-bundled, and workers need ES format.
  // Do NOT set COOP/COEP headers — SAHPool needs no cross-origin isolation, and
  // COEP silently breaks Tauri IPC (see Setup Guide Part C).
  optimizeDeps: {
    exclude: ["@evolu/common", "@evolu/web", "@evolu/sqlite-wasm"],
  },
  worker: {
    format: "es" as const,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
