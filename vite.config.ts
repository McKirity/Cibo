import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

/**
 * THE PROBE SINK — the dev-only channel out of the webview (2026-08-18).
 *
 * `src/dev/layoutProbe.ts` measures the rendered boxes and POSTs its report
 * here; this writes it to `.probe/latest.json` (gitignored) where a person — or
 * Claude, working the Mac — can read it.
 *
 * ⚠ WHY A VITE MIDDLEWARE AND NOT A TAURI FS WRITE. In dev the app IS
 * `localhost:1420`, so the app's own CSP (`connect-src 'self'`) already permits
 * the POST: no capability entry, no CSP edit, no Rust rebuild. Writing the file
 * from the webview instead would have needed all three — and the standing
 * capability lesson is that a missing permission fails SILENTLY, which is the
 * worst possible property for a diagnostic tool.
 *
 * `apply: "serve"` keeps it out of every production build by construction.
 */
function probeSink() {
  return {
    name: "cibo-probe-sink",
    apply: "serve" as const,
    configureServer(server: { middlewares: { use: (path: string, fn: unknown) => void } }) {
      server.middlewares.use("/__probe", (req: any, res: any, next: () => void) => {
        if (req.method !== "POST") return next();
        let body = "";
        req.on("data", (c: Buffer) => (body += c));
        req.on("end", () => {
          try {
            const dir = new URL("./.probe/", import.meta.url);
            mkdirSync(dir, { recursive: true });
            writeFileSync(new URL("latest.json", dir), body);
            const n = JSON.parse(body)?.findings?.length ?? "?";
            console.log(`[probe] ${n} findings written to .probe/latest.json`);
          } catch (e) {
            console.warn("[probe] could not write the report:", e);
          }
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

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
  plugins: [react(), probeSink()],

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
