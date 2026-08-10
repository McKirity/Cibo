/**
 * COMPACT — the small-canvas LAYOUT LAYER's switch (re-pointed Phase 2
 * step 4, 2026-08-10; born Build step 6a as the density lever). The
 * tri-state `auto | on | off`; **auto keys off WINDOW width, never the
 * device** (~1600px TRUE width — zoom-corrected, the 2026-08-09 fix).
 * Per-device, on the settings file (deviceStore); the control lives in
 * Settings → Appearance.
 *
 * Mechanism: one class on the root element — `.compact` — mirroring
 * `.reduce-effects` (the corpus-wide root-class doctrine). What the class
 * MEANS changed at the re-point: the density value sheet (theme/compact.css)
 * tested worse than the plain base at the Mac's 90% zoom and is DELETED;
 * `src/small.css` — the per-screen small-window re-compositions over the
 * base sheets — is now the class's only consumer. Screens still never test
 * the class directly.
 */

import { deviceGet, deviceSet } from "../settings/deviceStore";
import { currentZoomFactor } from "../settings/local";

export type CompactMode = "auto" | "on" | "off";
export const COMPACT_KEY = "cibo.compactMode";
/** The Sync note's "~1600px" window-width knee for compact-auto. */
export const COMPACT_AUTO_BELOW = 1600;

const lsGet = (): CompactMode => {
  const v = deviceGet(COMPACT_KEY);
  return v === "on" || v === "off" || v === "auto" ? v : "auto";
};

export const getCompactMode = (): CompactMode => lsGet();

// `compactApplied` was DELETED 2026-08-04: its only stated consumer was the dev
// switch's readout, and that switch retired 2026-08-02 — Settings → Appearance
// reads `getCompactMode()` instead.

function resolve(mode: CompactMode): void {
  // The knee tests the WINDOW's width, not the CSS viewport: `innerWidth` is
  // CSS px, which webview zoom INFLATES below 100% — at the Mac's ruled 0.9
  // scale a 1512 window reads as 1680 and compact-auto silently switched OFF
  // on the exact device the lever exists for (the two levers of the 3-lever
  // model cancelling; found at the step-4 preview pass, 2026-08-09).
  // Multiplying the zoom back out recovers the width the ruling names. Zoom
  // changes re-resolve for free: setZoom moves `innerWidth`, which fires the
  // resize listener below.
  const width = window.innerWidth * currentZoomFactor();
  const on = mode === "on" || (mode === "auto" && width < COMPACT_AUTO_BELOW);
  document.documentElement.classList.toggle("compact", on);
}

export function setCompactMode(mode: CompactMode): void {
  deviceSet(COMPACT_KEY, mode);
  resolve(mode);
}

/** Launch wiring: apply the stored mode and follow window resizes live. */
export function initCompact(): void {
  resolve(lsGet());
  window.addEventListener("resize", () => resolve(lsGet()));
}
