/**
 * COMPACT — the small-canvas LAYOUT LAYER's switch (re-pointed Phase 2
 * step 4, 2026-08-10; born Build step 6a as the density lever).
 *
 * ⚠ NO LONGER A SETTING. USER-RULED 2026-08-13: *"remove compact mode, that's
 * only for macbook in the end."* The tri-state `auto | on | off` and its
 * Settings → Appearance row are GONE; what survives is the `auto` rule alone,
 * which is the only one that was ever describing something true. Compact is not
 * a preference — it is a CONSEQUENCE of being on the small canvas — so it is
 * now derived from window width and cannot be set at all.
 *
 * ⚠ THIS SUPERSEDES THE 3-LEVER MODEL'S MIDDLE LEVER. [[Sync & Per-Device
 * Settings]] and [[Design Standardization & Process]] both describe compact as
 * a tri-state per-device setting; that is stale as of this ruling, and the
 * levers the user actually sets are now UI scale and reduce-effects. The vault
 * notes are owed the amendment — flagged, not silently reconciled here.
 *
 * WHAT THE REMOVAL FIXES, and it is not only tidiness: a stored `off` STUCK.
 * The whole whimsy re-mint is `:root.compact`-scoped, and a store carrying an
 * explicit `off` from an earlier test session rendered every re-minted card as
 * an empty box at every window size, with nothing on screen saying why (found
 * 2026-08-13). A derived value cannot be left in a state that contradicts the
 * window it is describing.
 *
 * Mechanism is unchanged: one class on the root element — `.compact` —
 * mirroring `.reduce-effects` (the corpus-wide root-class doctrine). Screens
 * still never test the class directly; `src/small.css` is its only consumer.
 *
 * ⚠ `cibo.compactMode` IS DELIBERATELY NOT READ AND NOT CLEANED UP. A stored
 * value is inert the moment nothing reads it, and a migration that deletes a
 * key buys nothing while adding a write path to a file the boot shim reads
 * synchronously. It simply stops mattering.
 */

import { currentZoomFactor } from "../settings/local";

/** The Sync note's "~1600px" window-width knee. */
export const COMPACT_AUTO_BELOW = 1600;

function resolve(): void {
  // The knee tests the WINDOW's width, not the CSS viewport: `innerWidth` is
  // CSS px, which webview zoom INFLATES below 100% — at the Mac's ruled 0.85
  // scale a 1512 window reads as 1779 and compact silently switched OFF on the
  // exact device the lever exists for (the two levers of the 3-lever model
  // cancelling; found at the step-4 preview pass, 2026-08-09).
  // Multiplying the zoom back out recovers the width the ruling names. Zoom
  // changes re-resolve for free: setZoom moves `innerWidth`, which fires the
  // resize listener below — which is also what makes the Developer screen
  // toggle carry compact with it without writing to compact at all.
  const width = window.innerWidth * currentZoomFactor();
  document.documentElement.classList.toggle("compact", width < COMPACT_AUTO_BELOW);
}

/** Launch wiring: resolve once, then follow the window forever. */
export function initCompact(): void {
  resolve();
  window.addEventListener("resize", resolve);
}
