import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

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
