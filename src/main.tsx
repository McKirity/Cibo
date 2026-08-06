/**
 * THE ENTRY SHIM (2026-08-04, the per-device file). The ONE job here: load
 * settings.json + timer-heartbeat.json into the device store's cache BEFORE
 * any app module evaluates, because module-scope code reads settings
 * synchronously — the timer store's crash-detection IIFE above all. The whole
 * former main.tsx lives on unchanged as bootstrap.tsx.
 *
 * initDeviceStore never rejects (any failure falls back to localStorage
 * passthrough) — but the dynamic import CAN (a chunk that fails to fetch), and
 * nothing above this point is listening. Without the catch that path is a blank
 * window and an unhandled rejection, bypassing the tier-④ fatal screen that
 * bootstrap.tsx installs. The handler is deliberately dependency-free: it must
 * not import the module that just failed to load.
 */
import { initDeviceStore } from "./settings/deviceStore";

void initDeviceStore()
  .then(() => import("./bootstrap"))
  .catch((err: unknown) => {
    console.error("boot: the app shell failed to load", err);
    const root = document.getElementById("root");
    if (root != null) {
      root.textContent =
        "Cibo could not start: the application files failed to load. Restart the app; if this repeats, reinstall.";
    }
  });
