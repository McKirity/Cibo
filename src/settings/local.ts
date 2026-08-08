/**
 * PER-DEVICE settings — the local tier (Build step 10, slice 1).
 *
 * The roster: [[Sync & Per-Device Settings]] — appearance levers + machine
 * facts stay on the device. Since 2026-08-04 the store is the REAL per-device
 * file (settings/deviceStore — settings.json; localStorage passthrough only
 * outside Tauri). The localStorage stand-in era is over.
 *
 * Members already living elsewhere, deliberately NOT moved: the theme pick +
 * themes root (theme/loader.ts) · compact (theme/compact.ts) · the Calibre
 * path (importers/calibre.ts) · timer state (timers/timerStore.ts). Settings
 * panes import their homes; a key migration is churn, not progress.
 *
 * REDUCE-EFFECTS moved HERE from shell/DevPanels (its key value kept verbatim
 * so a dev-set flag survives). Its launch re-apply loses the DEV gate: the
 * gate existed because "a stale flag in a production build would degrade
 * effects with no control to undo it" — Settings → Appearance IS that control
 * now.
 *
 * UI SCALE is born here — the last of the three cross-device levers with no
 * implementation ([[Cross-device]]; the MacBook preview note called it out).
 * Mechanism: the webview zoom factor (Tauri v2 `setZoom`), whole-app by
 * construction — content, not window chrome. The macOS 0.9 FIRST-RUN default
 * is step 15's write (platform-keyed); here the absent-key default is 1.0.
 */
import { withAppWindow } from "../shell/safeWindow";
import { LUCIDE_VERSION } from "../shell/habitIcons";
import { deviceGet as lsGet, deviceSet as lsSet, inTauri } from "./deviceStore";

import { pad2 } from "../metrics/clock";
// inTauri is imported from settings/deviceStore (the one declaration; it lives
// there because the boot shim needs a dependency-free module). Was a local copy.

// ── reduce-effects ───────────────────────────────────────────────────────────

/** Key value kept verbatim from the DevPanels era — a set flag survives. */
export const REDUCE_KEY = "cibo.dev.reduceEffects";

export const getReduceEffects = (): boolean => lsGet(REDUCE_KEY) === "1";
export const setReduceEffects = (on: boolean): void => {
  lsSet(REDUCE_KEY, on ? "1" : "0");
  document.documentElement.classList.toggle("reduce-effects", on);
};

// ── UI scale (webview zoom) ──────────────────────────────────────────────────

export const UI_SCALE_KEY = "cibo.uiScale";
export const UI_SCALE_DEFAULT = 100; // percent; macOS first-run 90 = step 15's write
export const UI_SCALE_STEP = 5;
export const clampUiScale = (pct: number): number =>
  !Number.isFinite(pct) ? UI_SCALE_DEFAULT : Math.min(150, Math.max(70, Math.round(pct / UI_SCALE_STEP) * UI_SCALE_STEP));

export const getUiScale = (): number => clampUiScale(Number(lsGet(UI_SCALE_KEY) ?? UI_SCALE_DEFAULT));

/** Parity zoom — Developer's dial, composed onto UI scale while preview is on. */
export const PARITY_ZOOM_KEY = "cibo.dev.parityZoom";
export const clampParity = (pct: number): number =>
  !Number.isFinite(pct) ? 100 : Math.min(120, Math.max(80, Math.round(pct)));
export const getParityZoom = (): number => clampParity(Number(lsGet(PARITY_ZOOM_KEY) ?? 100));
export const MB_PREVIEW_KEY = "cibo.dev.macbookPreview";
export const getMacBookPreview = (): boolean => lsGet(MB_PREVIEW_KEY) === "1";

/** Applies the composed zoom: UI scale, × parity while the preview is on. */
export const applyZoom = async (): Promise<void> => {
  if (!inTauri()) return;
  const factor =
    (getUiScale() / 100) * (getMacBookPreview() ? getParityZoom() / 100 : 1);
  try {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    await getCurrentWebview().setZoom(factor);
  } catch (e) {
    console.error("settings: setZoom failed", e);
  }
};

export const setUiScale = (pct: number): void => {
  lsSet(UI_SCALE_KEY, String(clampUiScale(pct)));
  void applyZoom();
};
export const setParityZoom = (pct: number): void => {
  lsSet(PARITY_ZOOM_KEY, String(clampParity(pct)));
  void applyZoom();
};

/**
 * The MacBook preview toggle — the ruled Settings → Developer anatomy
 * (snap to 1512×982 logical · REMEMBER and restore the prior size · parity
 * zoom composes while on). Geometry half was born as a dev button 2026-08-01;
 * this is its real home. Reading it is for LAYOUT, not legibility — Phase 2
 * owns real-hardware tuning.
 */
const MB_PRIOR_KEY = "cibo.dev.macbookPriorSize";
const MB_W = 1512;
const MB_H = 982;

export const setMacBookPreview = async (on: boolean): Promise<void> => {
  lsSet(MB_PREVIEW_KEY, on ? "1" : "0");
  if (!inTauri()) return;
  try {
    const { LogicalSize } = await import("@tauri-apps/api/dpi");
    if (on) {
      // Remember the prior LOGICAL size once, so Off restores it.
      await withAppWindow(async (win) => {
        const scale = await win.scaleFactor();
        const size = (await win.innerSize()).toLogical(scale);
        lsSet(MB_PRIOR_KEY, `${Math.round(size.width)}x${Math.round(size.height)}`);
        await win.setSize(new LogicalSize(MB_W, MB_H));
      });
    } else {
      const prior = lsGet(MB_PRIOR_KEY);
      const m = prior?.match(/^(\d+)x(\d+)$/);
      const [w, h] = m ? [Number(m[1]), Number(m[2])] : [1600, 1000];
      await withAppWindow((win) => win.setSize(new LogicalSize(w, h)));
    }
  } catch (e) {
    console.error("settings: MacBook preview resize failed", e);
  }
  void applyZoom();
};

// ── force-opaque panels ──────────────────────────────────────────────────────

export const FORCE_OPAQUE_KEY = "cibo.forceOpaque";
export const getForceOpaque = (): boolean => lsGet(FORCE_OPAQUE_KEY) === "1";

/**
 * The backdrop-legibility override, one-way toward opaque ([[Theme Roster]]
 * § backdrop). A translucent surface dial can't be flattened in CSS alone —
 * a var can't be redefined in terms of itself — so the three surface dials
 * are RESOLVED via a probe element (computed style gives real rgba), alpha-
 * composited over the window ground, and pinned as inline root overrides.
 * Blur dies with the translucency. Re-runs on every theme apply (the
 * `cibo:theme-applied` event), because the overrides must re-derive from the
 * NEW theme's values. Inert on an all-opaque theme (the bundled pair since
 * the 6a ladder move); its real tenant is the first translucent-panel theme
 * (UT/DR's spotlight pools).
 */
const SURFACE_DIALS = ["--panel-background", "--raised-background", "--inset-background"];

const resolveColor = (probe: HTMLElement, expr: string): number[] | null => {
  probe.style.color = "";
  probe.style.color = expr;
  const c = getComputedStyle(probe).color;
  const m = c.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] == null ? 1 : Number(m[4])];
};

export const applyForceOpaque = (): void => {
  const root = document.documentElement;
  root.classList.toggle("force-opaque", getForceOpaque());
  if (!getForceOpaque()) {
    for (const d of SURFACE_DIALS) root.style.removeProperty(d);
    return;
  }
  const probe = document.createElement("div");
  probe.style.display = "none";
  document.body.appendChild(probe);
  try {
    const ground = resolveColor(probe, "var(--window-background)");
    for (const d of SURFACE_DIALS) {
      const c = resolveColor(probe, `var(${d})`);
      if (!c || !ground || c[3] >= 1) {
        root.style.removeProperty(d); // already opaque (or unresolvable) — leave the theme's value
        continue;
      }
      const a = c[3];
      const mix = (i: number) => Math.round(c[i] * a + ground[i] * (1 - a));
      root.style.setProperty(d, `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`);
    }
  } finally {
    probe.remove();
  }
};

export const setForceOpaque = (on: boolean): void => {
  lsSet(FORCE_OPAQUE_KEY, on ? "1" : "0");
  applyForceOpaque();
};

/* (`cibo.bannerFade` — the Appearance slider over --hero-banner-fade — was
 * REMOVED 2026-08-06, user-ruled, with the rightward dissolve it drove: the
 * hero card's banner now covers the card whole, so the dial has no reader and
 * the slider had nothing to move. Any stored key is inert. Retiring the DIAL
 * itself from the roster is a separate ratified pass. */

/* (`cibo.railBanner` — the creation rail banner's on/off, built per the
 * 2026-07-23 ruling "Build it, but I want the option to disable it" and
 * shipped 2026-08-04 — went with the BAND itself on 2026-08-06, user-ruled.
 * The band is gone unconditionally, so there is nothing left to toggle. Any
 * stored key is inert; nothing reads it. The "Banner fade" slider that sat
 * beside it in Appearance went the same day, for the same reason — see the
 * note above. */

// ── timers ───────────────────────────────────────────────────────────────────

export type SignalStyle = "chime" | "silent";
export const SIGNAL_KEY = "cibo.timerSignal";
export const getSignalStyle = (): SignalStyle =>
  lsGet(SIGNAL_KEY) === "silent" ? "silent" : "chime";
export const setSignalStyle = (s: SignalStyle): void => lsSet(SIGNAL_KEY, s);

export const POMO_WORK_KEY = "cibo.pomoWorkMin";
export const POMO_BREAK_KEY = "cibo.pomoBreakMin";
const clampPomo = (v: unknown, dflt: number, hi: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(1, Math.round(n))) : dflt;
};
export const getPomoWork = (): number => clampPomo(lsGet(POMO_WORK_KEY) ?? 25, 25, 180);
export const getPomoBreak = (): number => clampPomo(lsGet(POMO_BREAK_KEY) ?? 5, 5, 60);
export const setPomoWork = (min: number): void => lsSet(POMO_WORK_KEY, String(clampPomo(min, 25, 180)));
export const setPomoBreak = (min: number): void => lsSet(POMO_BREAK_KEY, String(clampPomo(min, 5, 60)));

// ── the lucide pin's install date ────────────────────────────────────────────

/**
 * When the CURRENTLY BUNDLED lucide version first ran on this machine
 * (Settings → Habits → Icons row B).
 *
 * PER-DEVICE, not synced, and that is the load-bearing choice: the bundled
 * version is a property of the installed BINARY, so the Mac running last
 * month's release genuinely has a different answer from this desktop. A synced
 * row would have the two machines overwriting each other every launch.
 *
 * Mechanism: compare the build constant against what was last seen; on a
 * change (or a first ever look) stamp today. So the date means "this version
 * has been in use here since" — which for an upgrade is exactly the install
 * date, and for the very first stamp is the day the app first noticed, since
 * nothing recorded it before.
 */
const LUCIDE_SEEN_KEY = "cibo.lucideSeen";

export interface LucideSeen {
  version: string;
  since: string;
}

const localDate = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/** Reconcile at launch; returns what the Icons tab should show. */
export function noteLucideVersion(version: string): LucideSeen {
  let stored: LucideSeen | null = null;
  try {
    const raw = lsGet(LUCIDE_SEEN_KEY);
    if (raw != null) {
      const p = JSON.parse(raw) as Partial<LucideSeen>;
      if (typeof p.version === "string" && typeof p.since === "string")
        stored = { version: p.version, since: p.since };
    }
  } catch {
    /* a malformed row re-stamps rather than throwing */
  }
  if (stored != null && stored.version === version) return stored;
  const next: LucideSeen = { version, since: localDate() };
  lsSet(LUCIDE_SEEN_KEY, JSON.stringify(next));
  return next;
}

export const getLucideSeen = (): LucideSeen | null => {
  try {
    const raw = lsGet(LUCIDE_SEEN_KEY);
    if (raw == null) return null;
    const p = JSON.parse(raw) as Partial<LucideSeen>;
    return typeof p.version === "string" && typeof p.since === "string"
      ? { version: p.version, since: p.since }
      : null;
  } catch {
    return null;
  }
};

// ── launch wiring ────────────────────────────────────────────────────────────

/** main.tsx, beside initCompact — apply every persisted per-device lever. */
export function initLocalSettings(): void {
  // Stamp the icon set's install date before any surface asks for it.
  noteLucideVersion(LUCIDE_VERSION);
  document.documentElement.classList.toggle("reduce-effects", getReduceEffects());
  void applyZoom();
  // Force-opaque re-derives per theme apply; the first run needs the body.
  const first = () => applyForceOpaque();
  if (document.body) first();
  else window.addEventListener("DOMContentLoaded", first, { once: true });
  window.addEventListener("cibo:theme-applied", () => {
    applyForceOpaque();
  });
}
