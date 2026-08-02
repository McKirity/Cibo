/**
 * COMPACT — the cross-device density lever (Build step 6a; ruled 2026-07-20
 * that compact is IMPLEMENTED during Build, Phase 2 keeps only real-hardware
 * tuning). The tri-state `auto | on | off`; **auto keys off WINDOW width,
 * never the device** (~1600px, live on resize — [[Sync & Per-Device
 * Settings]]'s row). Per-device; localStorage stand-in until the per-device
 * file; the control is dev-hosted until step 10's Settings → Appearance.
 *
 * Mechanism: one class on the root element — `.compact` — mirroring
 * `.reduce-effects` (the corpus-wide root-class doctrine). The value block
 * lives in kit.css (§ COMPACT) and re-values dials; screens never test the
 * class directly.
 */

export type CompactMode = "auto" | "on" | "off";
export const COMPACT_KEY = "cibo.compactMode";
/** The Sync note's "~1600px" window-width knee for compact-auto. */
export const COMPACT_AUTO_BELOW = 1600;

const lsGet = (): CompactMode => {
  try {
    const v = localStorage.getItem(COMPACT_KEY);
    return v === "on" || v === "off" || v === "auto" ? v : "auto";
  } catch {
    return "auto";
  }
};

export const getCompactMode = (): CompactMode => lsGet();

/** True when the class is currently applied (for the dev switch's readout). */
export const compactApplied = (): boolean => document.documentElement.classList.contains("compact");

function resolve(mode: CompactMode): void {
  const on = mode === "on" || (mode === "auto" && window.innerWidth < COMPACT_AUTO_BELOW);
  document.documentElement.classList.toggle("compact", on);
}

export function setCompactMode(mode: CompactMode): void {
  try {
    localStorage.setItem(COMPACT_KEY, mode);
  } catch {
    /* per-device sugar */
  }
  resolve(mode);
}

/** Launch wiring: apply the stored mode and follow window resizes live. */
export function initCompact(): void {
  resolve(lsGet());
  window.addEventListener("resize", () => resolve(lsGet()));
}
