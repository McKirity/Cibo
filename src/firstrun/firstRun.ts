/**
 * FIRST-RUN SETUP — the gate (Build step 15, the Phase-1 closer).
 *
 * One `app_meta` flag, `first_run_complete`: absent → the boot gate renders
 * the setup screen instead of the shell; Finish writes it and it never shows
 * again. A store wipe removes the row, so the clean-slate restart re-arms the
 * screen BY CONSTRUCTION (the Phase-1 gate's framing — the whole build era is
 * a test run; user-ruled 2026-08-06: the flag alone gates, so the existing
 * dev store sees the screen exactly once, which doubles as its live pass).
 *
 * The macOS UI-scale first-run default rides here too — platform-keyed **85**
 * since the 2026-08-10 re-rule (0.9 before; `maybeApplyMacScaleDefault` below
 * carries the full history): written only when no scale was ever set, so it
 * can never clobber a chosen value. Windows stays at the 100 default —
 * nothing to write.
 */
import { NonEmptyString100, NonEmptyString1000 } from "@evolu/common";
import { evolu } from "../db/evolu";
import { todayLocal } from "../metrics/clock";
import { deviceGet } from "../settings/deviceStore";
import { UI_SCALE_KEY, setUiScale } from "../settings/local";

export const FIRST_RUN_KEY = "first_run_complete";

const flagQuery = evolu.createQuery((db) =>
  db
    .selectFrom("app_meta")
    .select(["id"])
    .where("key", "=", NonEmptyString100.orThrow(FIRST_RUN_KEY))
    .where("isDeleted", "is not", 1),
);

/** Absent flag = the setup screen is owed. Fails CLOSED (shell) — a query
 *  error must not lock a working store behind the front door. */
export const isFirstRunPending = async (): Promise<boolean> => {
  try {
    return (await evolu.loadQuery(flagQuery)).length === 0;
  } catch (e) {
    console.error("firstRun: flag check failed", e);
    return false;
  }
};

/** The value is the ISO day it completed — a free "set up on" fact. */
export const markFirstRunComplete = (): boolean => {
  const res = evolu.insert("app_meta", {
    key: NonEmptyString100.orThrow(FIRST_RUN_KEY),
    value: NonEmptyString1000.orThrow(todayLocal()),
  });
  // A failed write means the screen shows again next launch — harmless, and
  // logged (Evolu mutations fail silently; the 2026-07-23 lesson).
  if (!res.ok) console.error("firstRun: completion flag write failed", res.error);
  return res.ok;
};

/**
 * Re-arm the screen (Settings → Developer): deletes the flag row so the NEXT
 * launch shows setup again. The testing door the flag-only gate needs — a
 * completed test writes the flag, and without this there is no way back short
 * of a store wipe.
 */
export const rearmFirstRun = async (): Promise<boolean> => {
  const rows = await evolu.loadQuery(flagQuery);
  if (rows.length === 0) return true; // already armed
  let ok = true;
  for (const r of rows) {
    const res = evolu.update("app_meta", { id: r.id as never, isDeleted: 1 });
    if (!res.ok) {
      ok = false;
      console.error("firstRun: re-arm failed", res.error);
    }
  }
  return ok;
};

/**
 * The platform-keyed first-run scale: **macOS 85**, only if never set.
 *
 * 90 from the 2026-07-19 ruling until 2026-08-10, when the step-4 preview pass
 * re-ruled it by eye (*"85% is better. It gives more space without losing
 * fidelity"*). The number is not cosmetic: the preview snaps the window to the
 * Mac's real 1512×982 and applies UI scale as the webview zoom, so THIS VALUE
 * DECIDES THE CANVAS `src/small.css` IS COMPOSED AGAINST — 1779×1155 CSS at 85,
 * against 1680×1091 at 90. Tuning at one and shipping the other would hand every
 * screen ~100px less than it was built for.
 *
 * The original 90 had already outlived its own reasoning: it was set to keep the
 * rail's vignette band alive on the 14", and the vignette was abandoned
 * 2026-07-26 (it survived on a plain fit argument).
 */
export const maybeApplyMacScaleDefault = (): void => {
  const isMac = /Mac/i.test(navigator.userAgent);
  if (isMac && deviceGet(UI_SCALE_KEY) == null) setUiScale(85);
};
