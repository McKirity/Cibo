/**
 * Clock-of-day arithmetic — minutes on the 1440-minute wheel — shared by the
 * range and cadence specs, which each carried a copy (rangeSpec's names won).
 * The pairs were verified identical except the circular mean: rangeSpec ROUNDS
 * to whole minutes and returns null on the degenerate all-cancelling case,
 * where cadence's copy returned a float and 0 — the rounded/null semantics are
 * canonical here (a sub-minute shift in cadence's sleep-line positions is
 * accepted; its labels already rounded at format time).
 *
 * Pure; datetimes are the schema's local "YYYY-MM-DDTHH:MM[:SS]" strings.
 */
import { dayIndex } from "./dates";
import { sessionMinutes } from "./shapes";

/** Minutes past midnight of a "YYYY-MM-DDTHH:MM[:SS]" local datetime. */
export const clockMinutes = (dt: string): number =>
  Number(dt.slice(11, 13)) * 60 + Number(dt.slice(14, 16));

/** Absolute minute index of a local datetime (day index × 1440 + clock). */
export const absMinutes = (dt: string): number =>
  dayIndex(dt.slice(0, 10)) * 1440 + clockMinutes(dt);

/**
 * Whole minutes spanned start → end; 0 when either bound is missing.
 *
 * DELEGATES to the shape catalog (2026-08-04). This computed the span as
 * `absMinutes(end) - absMinutes(start)` — WALL-CLOCK minutes, which read an
 * hour long on a spring-forward night and an hour short on fall-back, while
 * `shapes.sessionMinutes` (the catalog member every other duration surface
 * reads: milestones, the cover wall, Compare, search) measured REAL ELAPSED
 * time. The Sleep strip's derived readout agreed with the catalog, so the
 * range dashboard was the only surface disagreeing — 8h00m against the same
 * night's 7h00m elsewhere.
 *
 * Elapsed is canonical: a duration is time actually spent, and the catalog is
 * the app's one-shape-written-once law. `absMinutes`/`clockMinutes` above are
 * untouched — POSITION on the 24-hour wheel (circular means, the sleep-line
 * geometry) is a different job, and wall-clock is right for it.
 */
export const durationMinutes = (s: { start?: string | null; end?: string | null }): number =>
  sessionMinutes({ measure_kind: "range", value: null, start: s.start, end: s.end });

/** "HH:MM" from clock minutes (wrap-normalized onto 0–1439). */
export const fmtHM = (clockMin: number): string => {
  const m = ((Math.round(clockMin) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

/**
 * Circular mean of clock times in minutes (wraps midnight — 23:30 and 00:30
 * average to 00:00, never 12:00). Null when the list is empty or the times
 * fully cancel.
 */
export function circularMeanMinutes(mins: number[]): number | null {
  if (mins.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const m of mins) {
    const a = (m / 1440) * 2 * Math.PI;
    sx += Math.cos(a);
    sy += Math.sin(a);
  }
  if (sx === 0 && sy === 0) return null;
  const a = Math.atan2(sy, sx);
  const m = (a / (2 * Math.PI)) * 1440;
  return ((Math.round(m) % 1440) + 1440) % 1440;
}
