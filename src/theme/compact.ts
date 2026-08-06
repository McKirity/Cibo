/**
 * COMPACT — the cross-device density lever (Build step 6a; ruled 2026-07-20
 * that compact is IMPLEMENTED during Build, Phase 2 keeps only real-hardware
 * tuning). The tri-state `auto | on | off`; **auto keys off WINDOW width,
 * never the device** (~1600px, live on resize — [[Sync & Per-Device
 * Settings]]'s row). Per-device, on the settings file (deviceStore, 2026-08-04);
 * the control lives in Settings → Appearance.
 *
 * Mechanism: one class on the root element — `.compact` — mirroring
 * `.reduce-effects` (the corpus-wide root-class doctrine). The value block
 * lives in kit.css (§ COMPACT) and re-values dials; screens never test the
 * class directly.
 */

import { deviceGet, deviceSet } from "../settings/deviceStore";

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
  const on = mode === "on" || (mode === "auto" && window.innerWidth < COMPACT_AUTO_BELOW);
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
