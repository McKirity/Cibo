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
 * construction — content, not window chrome. The macOS FIRST-RUN default —
 * 85 since the 2026-08-10 re-rule — is firstRun.ts's write (platform-keyed);
 * here the absent-key default is 1.0.
 */
import { withAppWindow } from "../shell/safeWindow";
import { LUCIDE_VERSION } from "../shell/habitIcons";
import { deviceGet as lsGet, deviceSet as lsSet, inTauri } from "./deviceStore";

import { todayLocal } from "../metrics/clock";
// The ruled interval floor has ONE owner (timerCore) — the settings clamp reads
// it rather than re-typing a 2 the machine would not know had changed.
import { MIN_INTERVALS } from "../timers/timerCore";
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
export const UI_SCALE_DEFAULT = 100; // percent; macOS first-run 85 = firstRun.ts's write (90 until 2026-08-10)
export const UI_SCALE_STEP = 5;
export const clampUiScale = (pct: number): number =>
  // Floor 70 → 60 (Phase 2 step 4, 2026-08-09): 59% is the scale at which a
  // 1512 MacBook window mathematically matches the 2560 desktop canvas, so 60
  // is the "whole desktop layout, crunched" experiment the floor was blocking.
  !Number.isFinite(pct) ? UI_SCALE_DEFAULT : Math.min(150, Math.max(60, Math.round(pct / UI_SCALE_STEP) * UI_SCALE_STEP));

export const getUiScale = (): number => clampUiScale(Number(lsGet(UI_SCALE_KEY) ?? UI_SCALE_DEFAULT));

/** Parity zoom — Developer's dial, composed onto UI scale in MacBook mode.
 *  The screen preset sets it (85 / 100); the slider stays for hand-tuning. */
export const PARITY_ZOOM_KEY = "cibo.dev.parityZoom";
/** The MacBook preset's parity. Was hand-set to 85 and never moved off it. */
export const PARITY_MACBOOK = 85;
export const clampParity = (pct: number): number =>
  !Number.isFinite(pct) ? 100 : Math.min(120, Math.max(80, Math.round(pct)));
export const getParityZoom = (): number => clampParity(Number(lsGet(PARITY_ZOOM_KEY) ?? 100));
/**
 * THE SCREEN PRESET — one control for the whole MacBook/desktop swap.
 *
 * USER-RULED 2026-08-13: *"I just want one single toggle that changes the
 * screen from mac to 2k, no matter the actual screen"* — reversing an
 * arrangement that took FOUR settings across TWO panes to reach either view
 * (preview on/off + parity + UI scale in one place, compact in another), which
 * is how the store ended up in a state no single control could explain.
 *
 * What one pick now moves:
 *   window   1512×982, or the size remembered before the first MacBook pick
 *   parity   PARITY_MACBOOK / 100 — user-ruled to follow the mode
 *   compact  NOTHING IS WRITTEN. It derives from window width (theme/compact),
 *            so it follows the resize for free and can never disagree with the
 *            window it describes. The bug this replaces was exactly that
 *            disagreement, held in a stored value.
 *   UI scale UNTOUCHED, deliberately — it is the user's own comfort lever and
 *            composes on top, so the preset must not overwrite a hand-set value.
 *
 * ⚠ THE TWO ZOOMS MULTIPLY, so the preview reproduces the Mac's CANVAS only
 * while UI scale sits at 100: 1512 ÷ 0.85 = 1779 CSS, the ruled figure. Set UI
 * scale to 90 as well and the preview composes 0.765 while the real Mac at the
 * same setting composes 0.90 — the two stop agreeing. Fine for the instrument's
 * job (layout at the small canvas) as long as it is known; it is written down
 * here because nothing on screen says it.
 *
 * The key is kept verbatim from the MacBook-preview era so a set flag survives
 * the reshape — the same convention REDUCE_KEY was kept under.
 */
/**
 * THE SMALL-CANVAS KNEE — the window width below which this is the MacBook
 * canvas. Lives HERE, not in `theme/compact`, only because of import direction:
 * compact.ts already reads `currentZoomFactor` from this module, so the constant
 * has to travel the same way or the two modules form a cycle. It is the same
 * number for both readers by construction — the project has been bitten twice by
 * one figure written down in two places.
 */
export const SMALL_CANVAS_BELOW = 1600;

export type ScreenMode = "macbook" | "desktop";
export const MB_PREVIEW_KEY = "cibo.dev.macbookPreview";
export const getScreenMode = (): ScreenMode => (lsGet(MB_PREVIEW_KEY) === "1" ? "macbook" : "desktop");
/** Kept as the predicate `currentZoomFactor` reads — one name per question. */
export const getMacBookPreview = (): boolean => getScreenMode() === "macbook";

/**
 * The composed zoom the app itself applies — UI scale × parity while the
 * preview is on. ONE owner (the `probe-1` callee rule): compact-auto divides
 * this back out of `innerWidth` to recover the window's true width, and a
 * reader computing its own copy would drift from what `applyZoom` sets.
 * Browser dev never applies a zoom, so it reports 1.
 */
export const currentZoomFactor = (): number =>
  !inTauri() ? 1 : (getUiScale() / 100) * (getMacBookPreview() ? getParityZoom() / 100 : 1);

/** Applies the composed zoom: UI scale, × parity while the preview is on. */
export const applyZoom = async (): Promise<void> => {
  if (!inTauri()) return;
  const factor = currentZoomFactor();
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
 * The screen preset's write half — the ruled Settings → Developer anatomy
 * (snap to 1512×982 logical · REMEMBER and restore the prior size · parity
 * zoom composes in MacBook mode). Geometry half was born as a dev button
 * 2026-08-01; this is its real home. Reading it is for LAYOUT, not legibility
 * — Phase 2 owns real-hardware tuning.
 */
/** LEGACY (read-only since 2026-08-20): the size-only record the preview toggle
 *  wrote when it was switched on. `WIN_GEOM_KEY` superseded it; this is read
 *  as a fallback so an install upgraded mid-preview still restores. */
const MB_PRIOR_KEY = "cibo.dev.macbookPriorSize";
const MB_W = 1512;
const MB_H = 982;

// ── the desktop window's remembered geometry ─────────────────────────────────
//
// THE WINDOW OPENS IN THE MODE IT CLOSED IN — user-ruled 2026-08-20 (*"the
// window always boots up in macbook dimensions even if it was in 2k mode before
// it was closed. I want the window to remember what mode it was in and to open
// in that"*). The MacBook half already re-applied at launch (`macbook-2`); the
// DESKTOP half never did — `tauri.conf.json` opens at 1600×1000, which on a 2K
// screen reads as the MacBook canvas. The app has no window-state plugin by
// design, so this is the small, per-device version of one: in desktop mode the
// window's logical size + position + maximized flag are recorded (debounced)
// on every resize/move, and re-applied at launch and when the preview switches
// off. Recorded ONLY while on the desktop canvas — the preview's 1512×982 and a
// real small screen must never overwrite the desktop record (same gate the
// preview's own launch restore uses: the true width knee).
//
// Restore is clamped to the CURRENT work area and never writes the record
// itself: a desktop record replayed on a smaller display fits the display, and
// the record keeps the size the user actually chose.

const WIN_GEOM_KEY = "cibo.desktopGeometry";

interface WinGeom {
  w: number;
  h: number;
  x: number;
  y: number;
  /** Maximized when last seen; w/h/x/y then hold the last UN-maximized frame. */
  max: boolean;
}

const readGeom = (): WinGeom | null => {
  const raw = lsGet(WIN_GEOM_KEY);
  if (raw) {
    try {
      const g = JSON.parse(raw) as Partial<WinGeom>;
      if (
        typeof g.w === "number" && typeof g.h === "number" &&
        typeof g.x === "number" && typeof g.y === "number"
      )
        return { w: g.w, h: g.h, x: g.x, y: g.y, max: g.max === true };
    } catch {
      /* a malformed record is no record */
    }
  }
  // the legacy size-only record (position unknown → the restore centres it)
  const m = lsGet(MB_PRIOR_KEY)?.match(/^(\d+)x(\d+)$/);
  return m ? { w: Number(m[1]), h: Number(m[2]), x: NaN, y: NaN, max: false } : null;
};

let geomTimer: number | null = null;
/** Record the desktop geometry, debounced — the live half of the memory. */
const scheduleGeomRecord = (): void => {
  if (geomTimer != null) window.clearTimeout(geomTimer);
  geomTimer = window.setTimeout(() => {
    geomTimer = null;
    void recordDesktopGeometry();
  }, 400);
};

const recordDesktopGeometry = async (): Promise<void> => {
  if (!inTauri() || getMacBookPreview()) return;
  if (trueWindowWidth() < SMALL_CANVAS_BELOW) return; // not the desktop canvas
  await withAppWindow(async (win) => {
    const max = await win.isMaximized();
    const prev = readGeom();
    if (max) {
      // keep the last un-maximized frame for the day the user un-maximizes
      const base = prev ?? { w: 1600, h: 1000, x: NaN, y: NaN, max: false };
      lsSet(WIN_GEOM_KEY, JSON.stringify({ ...base, max: true }));
      return;
    }
    const scale = await win.scaleFactor();
    const size = (await win.innerSize()).toLogical(scale);
    const pos = (await win.outerPosition()).toLogical(scale);
    lsSet(
      WIN_GEOM_KEY,
      JSON.stringify({
        w: Math.round(size.width),
        h: Math.round(size.height),
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        max: false,
      }),
    );
  });
};

/**
 * Re-apply the remembered desktop geometry — launch (desktop mode) and the
 * preview's Off. Maximized restores as maximized; otherwise size and position
 * are clamped into the current monitor's work area (a record from a bigger
 * display must still land on-screen). No record → the configured 1600×1000.
 */
const restoreDesktopGeometry = async (): Promise<void> => {
  if (!inTauri()) return;
  const { LogicalSize, LogicalPosition } = await import("@tauri-apps/api/dpi");
  const g = readGeom();
  await withAppWindow(async (win) => {
    if (g?.max) {
      await win.maximize();
      return;
    }
    let [w, h] = g ? [g.w, g.h] : [1600, 1000];
    let x = g?.x ?? NaN;
    let y = g?.y ?? NaN;
    const { currentMonitor } = await import("@tauri-apps/api/window");
    const monitor = await currentMonitor();
    if (monitor) {
      const area = monitor.workArea.size.toLogical(monitor.scaleFactor);
      const origin = monitor.workArea.position.toLogical(monitor.scaleFactor);
      w = Math.min(w, area.width);
      h = Math.min(h, area.height);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        // no position on record — centre on the work area (the Rust fit's rule)
        x = origin.x + Math.max(0, area.width - w) / 2;
        y = origin.y + Math.max(0, area.height - h) / 2;
      } else {
        x = Math.min(Math.max(x, origin.x), origin.x + Math.max(0, area.width - w));
        y = Math.min(Math.max(y, origin.y), origin.y + Math.max(0, area.height - h));
      }
    }
    await win.setSize(new LogicalSize(w, h));
    if (Number.isFinite(x) && Number.isFinite(y)) await win.setPosition(new LogicalPosition(x, y));
  }, "desktop geometry restore");
};

export const setScreenMode = async (mode: ScreenMode): Promise<void> => {
  const on = mode === "macbook";
  lsSet(MB_PREVIEW_KEY, on ? "1" : "0");
  // Parity follows the mode (user-ruled). Written through the setter so the
  // clamp and the zoom re-apply are the same ones the slider goes through —
  // two writers, one path.
  setParityZoom(on ? PARITY_MACBOOK : 100);
  if (!inTauri()) return;
  try {
    const { LogicalSize } = await import("@tauri-apps/api/dpi");
    if (on) {
      // The desktop record is kept live by the resize/move recorder, so there is
      // nothing to snapshot here; the flag was written above, which gates the
      // recorder off before the 1512×982 resize below can be mistaken for a
      // desktop size. A maximized window is un-maximized first — setSize on a
      // maximized window is ignored on Windows.
      await withAppWindow(async (win) => {
        if (await win.isMaximized()) await win.unmaximize();
        await win.setSize(new LogicalSize(MB_W, MB_H));
      }, "MacBook preview resize");
    } else {
      await restoreDesktopGeometry();
    }
  } catch (e) {
    console.error("settings: MacBook preview resize failed", e);
  }
  void applyZoom();
};

/**
 * The window's TRUE logical width. `innerWidth` is CSS px, which webview zoom
 * inflates below 100% — the same correction compact-auto makes, and the same
 * reason it exists (a 1512 window at 0.85 reads as 1779). The product is
 * zoom-INVARIANT, so it is safe to read while deciding a value the zoom itself
 * depends on.
 */
const trueWindowWidth = (): number => window.innerWidth * currentZoomFactor();

/**
 * MACBOOK VIEW FOLLOWS THE CANVAS — USER-RULED 2026-08-14, on the hardware.
 *
 * *"I do not want the default view, I want specifically that. Toggle THAT once
 * the threshold is cleared."* Ruled after seeing both on the real 14": the
 * desktop composition on a small screen is not what the small canvas was built
 * for, and MacBook view — parity 85 composed onto UI scale — is.
 *
 * ⚠ CLAUDE ARGUED AGAINST THIS TWICE AND WAS WRONG BOTH TIMES. The objection
 * was arithmetic (0.85 parity × 0.85 UI scale = 0.72, "everything goes tiny"),
 * which is true and beside the point: the user had LOOKED at both and preferred
 * this one. A prediction does not outrank an observation of the thing itself.
 *
 * So the mode is DERIVED, exactly as compact is — same knee, same true-width
 * reading, for the same reason the 2026-08-14 ruling gave when it stopped
 * compact being a setting: a value describing the canvas must not be storable
 * in a state that contradicts the canvas. The flag is still WRITTEN, because
 * `currentZoomFactor` reads it and Settings draws it, but nothing keeps a pick
 * that the window disagrees with.
 *
 * ⚠ CONSEQUENCE, AND IT IS INTENDED: on a screen below the knee the Developer
 * toggle cannot be held on "2K". Flip it and the window it asks for still does
 * not fit, so the next resolve puts it back. On a desktop the preset behaves
 * exactly as it always did — its 1512×982 crosses the knee, its restore crosses
 * back, and the derivation agrees with both.
 */
const adoptScreenModeForCanvas = (): void => {
  if (!inTauri()) return;
  const want = trueWindowWidth() < SMALL_CANVAS_BELOW;
  if (want === getMacBookPreview()) return;
  // Flag FIRST: setParityZoom re-applies the composed zoom, and the composition
  // reads this flag. Written the other way round the zoom lands one pick stale.
  lsSet(MB_PREVIEW_KEY, want ? "1" : "0");
  setParityZoom(want ? PARITY_MACBOOK : 100);
};

/**
 * RE-APPLY THE PREVIEW GEOMETRY AT LAUNCH (`macbook-2`, 2026-08-08).
 *
 * The flag is per-device and persists; the WINDOW SIZE did not. The app has no
 * window-state plugin and `tauri.conf.json` opens at 1600×1000, so every
 * relaunch reopened at desktop size while Settings still read "On" — and the
 * miss is not cosmetic: **compact-auto keys off window width below 1600**, so a
 * relaunched "MacBook preview" was showing the DESKTOP layout, which is the
 * exact opposite of what the instrument is for.
 *
 * Deliberately does NOT touch `MB_PRIOR_KEY`: the prior size was recorded when
 * the preview was first switched on, and overwriting it here with 1512×982
 * would make Off restore the preview size instead of the real one.
 */
const restoreMacBookGeometry = async (): Promise<void> => {
  if (!inTauri()) return;
  // The desktop half (2026-08-20): the mode the window closed in is the mode
  // it opens in. Below, the MacBook half as it was.
  if (!getMacBookPreview()) {
    await restoreDesktopGeometry();
    return;
  }
  // Already on the small canvas — real small hardware, sized to the screen's
  // work area by the Rust launch fit. The preview's 1512×982 is a SIMULATION
  // for a big screen; forcing it here would make the window taller than the
  // display can show, which is the defect the fit was written to end.
  if (trueWindowWidth() < SMALL_CANVAS_BELOW) return;
  const { LogicalSize } = await import("@tauri-apps/api/dpi");
  await withAppWindow(
    (win) => win.setSize(new LogicalSize(MB_W, MB_H)),
    "MacBook preview restore at launch",
  );
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

/* The third leg of the default pomodoro (user-ruled 2026-08-08, with the
 * interval-plan amendment): how many WORK intervals a new pomodoro opens with.
 * Its own clamp, because the floor is 2 — the ruled minimum — where the
 * work/break pair floors at 1. */
export const POMO_INTERVALS_KEY = "cibo.pomoIntervals";
const clampIntervals = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(24, Math.max(MIN_INTERVALS, Math.round(n))) : 4;
};
export const getPomoIntervals = (): number => clampIntervals(lsGet(POMO_INTERVALS_KEY) ?? 4);
export const setPomoIntervals = (n: number): void =>
  lsSet(POMO_INTERVALS_KEY, String(clampIntervals(n)));

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
  const next: LucideSeen = { version, since: todayLocal() };
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

// ── the ambience slideshow (ruled 2026-08-20 — [[Ambience Slideshow]]) ──────
//
// Three per-device levers for the backdrop SET a theme may carry (backdrops/ ·
// timers/): how often the picture changes · how long the crossfade takes ·
// whether the Timers screen has its own surface or just keeps the backdrop.
// Appearance levers are local by the [[Sync & Per-Device Settings]] roster, so
// none of these sync. Settings → Appearance → Ambience owns the rows; the
// Ambience layer reads the values live through AMBIENCE_SETTINGS_EVENT.

/** Seconds between swaps; 0 = Off (a set shows its FIRST picture by filename, never swaps). */
export const AMB_INTERVAL_KEY = "cibo.ambienceInterval";
/** The preset list IS the domain — a value outside it (a hand-edited file) falls to the default. */
export const AMB_INTERVALS = [0, 30, 60, 120, 300, 600, 900, 1800, 3600] as const;
export const AMB_INTERVAL_DEFAULT = 600;
export const intervalLabel = (s: number): string => (s === 0 ? "Off" : s < 60 ? `${s} s` : `${s / 60} min`);
export const getAmbienceInterval = (): number => {
  const v = Number(lsGet(AMB_INTERVAL_KEY) ?? AMB_INTERVAL_DEFAULT);
  return (AMB_INTERVALS as readonly number[]).includes(v) ? v : AMB_INTERVAL_DEFAULT;
};

/** Crossfade length in ms; 0 = a hard cut. A SETTING, not a constant and not a roster dial (user's B). */
export const AMB_FADE_KEY = "cibo.ambienceFade";
export const AMB_FADE_DEFAULT = 1500;
export const AMB_FADE_STEP = 500;
export const AMB_FADE_MAX = 5000;
export const clampAmbienceFade = (ms: number): number =>
  !Number.isFinite(ms) ? AMB_FADE_DEFAULT : Math.min(AMB_FADE_MAX, Math.max(0, Math.round(ms / AMB_FADE_STEP) * AMB_FADE_STEP));
export const getAmbienceFade = (): number => clampAmbienceFade(Number(lsGet(AMB_FADE_KEY) ?? AMB_FADE_DEFAULT));
/**
 * The fade is published as ONE custom property on the root, and BOTH the real
 * backdrop layers and the Settings preview read it — one owner (the `probe-1`
 * callee rule), so the preview cannot drift from the thing it previews.
 */
export const AMB_FADE_PROP = "--amb-fade";
export const applyAmbienceFade = (): void => {
  document.documentElement.style.setProperty(AMB_FADE_PROP, `${getAmbienceFade()}ms`);
};

/** "own" = the Timers screen shows its own surface (today's behaviour, the default);
 *  "shared" = NO timer surface at all — the backdrop simply continues (user-ruled). */
export type TimerAmbience = "own" | "shared";
export const TIMER_AMB_KEY = "cibo.timerAmbience";
export const getTimerAmbience = (): TimerAmbience => (lsGet(TIMER_AMB_KEY) === "shared" ? "shared" : "own");

/** Fired on every ambience-setting write; the Ambience layer re-reads on it. */
export const AMBIENCE_SETTINGS_EVENT = "cibo:ambience-settings";
const announceAmbience = (): void => {
  window.dispatchEvent(new Event(AMBIENCE_SETTINGS_EVENT));
};

export const setAmbienceInterval = (s: number): void => {
  lsSet(AMB_INTERVAL_KEY, String((AMB_INTERVALS as readonly number[]).includes(s) ? s : AMB_INTERVAL_DEFAULT));
  announceAmbience();
};
export const setAmbienceFade = (ms: number): void => {
  lsSet(AMB_FADE_KEY, String(clampAmbienceFade(ms)));
  applyAmbienceFade();
  announceAmbience();
};
export const setTimerAmbience = (v: TimerAmbience): void => {
  lsSet(TIMER_AMB_KEY, v);
  announceAmbience();
};

// ── launch wiring ────────────────────────────────────────────────────────────

/** bootstrap.tsx, beside initCompact — apply every persisted per-device lever. */
export function initLocalSettings(): void {
  // Stamp the icon set's install date before any surface asks for it.
  noteLucideVersion(LUCIDE_VERSION);
  document.documentElement.classList.toggle("reduce-effects", getReduceEffects());
  applyAmbienceFade();
  void applyZoom();
  // The geometry half of the MacBook preview — persisted as a flag since it was
  // built, re-applied to the window only since 2026-08-08.
  // …then let the canvas have the last word. CHAINED, not called after: the
  // restore is async, so a bare call reads the width the window has NOT been
  // resized to yet — on a desktop that cancels the preview flag one launch in
  // one and flips it back when the resize finally lands.
  void restoreMacBookGeometry().then(adoptScreenModeForCanvas);
  window.addEventListener("resize", adoptScreenModeForCanvas);
  // The desktop geometry recorder — Tauri's own events, because a MOVE fires no
  // DOM event. Registered once; the unlisten is never needed (page lifetime).
  if (inTauri()) {
    void withAppWindow(async (win) => {
      await win.onResized(scheduleGeomRecord);
      await win.onMoved(scheduleGeomRecord);
    }, "desktop geometry recorder");
  }
  // Force-opaque re-derives per theme apply; the first run needs the body.
  const first = () => applyForceOpaque();
  if (document.body) first();
  else window.addEventListener("DOMContentLoaded", first, { once: true });
  window.addEventListener("cibo:theme-applied", () => {
    applyForceOpaque();
  });
}
