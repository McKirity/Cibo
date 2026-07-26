/**
 * The ten-shape derived-metric catalog (Aggregation & Metrics Engine). Every
 * number on every dashboard composes from these; each shape is written **once**
 * here and reused by every surface. Pure functions over already-fetched rows —
 * no Evolu, no clock, no dials — so they memoize trivially and test in isolation.
 *
 * This module is the vertical slice's real deliverable: the next dashboard
 * consumes these, it does not rewrite them.
 *
 * Convention: duration is MINUTES (the sessions spine's `value` for time rows).
 */
import {
  dayFromIndex,
  dayGap,
  dayIndex,
  eachDay,
  monthKey,
  weekStart,
  yearKey,
} from "./dates";
import { deltaChip, type DeltaChip } from "./format";

// ── Input row shapes (nullable, as loaded from the CRDT store) ────────────────

export interface SessionRow {
  id: string;
  entry_fk: string | null;
  day: string; // "YYYY-MM-DD"
  measure_kind: "time" | "count" | "range" | "none" | null;
  value: number | null; // minutes, for time sessions
}

export interface EntryRow {
  id: string;
  title: string;
  status: string | null;
  genre: string[]; // decoded from the JSON column upstream
  rating: number | null;
  /** Entry-level Medium (`entries.type`) — null for habits with no type vocab (Gaming). */
  type: string | null;
}

/** Inclusive day-bounds; null = open. */
export interface Scope {
  from: string | null;
  to: string | null;
}

// ── Primitive helpers ─────────────────────────────────────────────────────────

/** Minutes carried by a session (time only; other kinds contribute nothing). */
export const sessionMinutes = (s: SessionRow): number =>
  s.measure_kind === "time" ? s.value ?? 0 : 0;

export const inScope = (day: string, scope: Scope): boolean =>
  (scope.from == null || day >= scope.from) && (scope.to == null || day <= scope.to);

export const scoped = (sessions: SessionRow[], scope: Scope): SessionRow[] =>
  scope.from == null && scope.to == null
    ? sessions
    : sessions.filter((s) => inScope(s.day, scope));

/** Minutes summed per day. */
export function dayMinutes(sessions: SessionRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) m.set(s.day, (m.get(s.day) ?? 0) + sessionMinutes(s));
  return m;
}

// ── Shape 1 · Total ───────────────────────────────────────────────────────────

export interface Total {
  minutes: number;
  count: number;
}
export const total = (sessions: SessionRow[]): Total => ({
  minutes: sessions.reduce((a, s) => a + sessionMinutes(s), 0),
  count: sessions.length,
});

// ── Shape 2 · Distinct-days ───────────────────────────────────────────────────

export const distinctDays = (sessions: SessionRow[]): number =>
  new Set(sessions.map((s) => s.day)).size;

export const playedDaySet = (sessions: SessionRow[]): Set<string> =>
  new Set(sessions.map((s) => s.day));

// ── Shape 3 · Best ────────────────────────────────────────────────────────────

export type Grain = "day" | "week" | "month" | "year";
export type Metric = "minutes" | "days";

const grainKey = (day: string, grain: Grain): string =>
  grain === "day" ? day : grain === "week" ? weekStart(day) : grain === "month" ? monthKey(day) : yearKey(day);

export interface BestBucket {
  key: string; // the bucket's key (a day / week-start / "YYYY-MM" / "YYYY")
  value: number; // minutes, or distinct-day count
}

/** The single richest bucket at a grain, by minutes or by distinct days. */
export function best(sessions: SessionRow[], grain: Grain, metric: Metric): BestBucket | null {
  if (metric === "minutes") {
    const by = new Map<string, number>();
    for (const s of sessions)
      by.set(grainKey(s.day, grain), (by.get(grainKey(s.day, grain)) ?? 0) + sessionMinutes(s));
    return pickMax(by);
  }
  // distinct days per bucket
  const by = new Map<string, Set<string>>();
  for (const s of sessions) {
    const k = grainKey(s.day, grain);
    (by.get(k) ?? by.set(k, new Set()).get(k)!).add(s.day);
  }
  const counts = new Map<string, number>();
  for (const [k, set] of by) counts.set(k, set.size);
  return pickMax(counts);
}

function pickMax(m: Map<string, number>): BestBucket | null {
  let best: BestBucket | null = null;
  for (const [key, value] of m) if (!best || value > best.value) best = { key, value };
  return best;
}

// ── Shape 4 · Day verdict ─────────────────────────────────────────────────────

export type Verdict = "done" | "missed" | "unknown";

/** done = a session exists · missed = finalized+absent · unknown = neither. */
export const dayVerdict = (
  day: string,
  played: Set<string>,
  finalized: Set<string>,
): Verdict => (played.has(day) ? "done" : finalized.has(day) ? "missed" : "unknown");

// ── Shape 5 · Streak ──────────────────────────────────────────────────────────

export interface Run {
  start: string;
  end: string;
  days: number;
}
export interface Streaks {
  current: number;
  currentRun: Run | null;
  longest: number;
  runs: Run[]; // every run, in chronological order
}

/**
 * Consecutive **done** days over [from, to]. Unknown days pass through (never
 * break, never count); a **missed** day (finalized + absent) breaks the run.
 */
export function streaks(
  from: string,
  to: string,
  played: Set<string>,
  finalized: Set<string>,
): Streaks {
  const runs: Run[] = [];
  let cur: Run | null = null;
  for (const d of eachDay(from, to)) {
    const v = dayVerdict(d, played, finalized);
    if (v === "done") {
      if (!cur) cur = { start: d, end: d, days: 1 };
      else {
        cur.end = d;
        cur.days++;
      }
    } else if (v === "missed") {
      if (cur) {
        runs.push(cur);
        cur = null;
      }
    }
    // unknown: pass through
  }
  if (cur) runs.push(cur);

  // The last run is "current" iff no confirmed miss sits after its end.
  const last = runs[runs.length - 1] ?? null;
  let currentRun: Run | null = null;
  if (last) {
    let stillAlive = true;
    for (const d of eachDay(dayFromIndex(dayIndex(last.end) + 1), to))
      if (dayVerdict(d, played, finalized) === "missed") stillAlive = false;
    currentRun = stillAlive ? last : null;
  }
  return {
    current: currentRun?.days ?? 0,
    currentRun,
    longest: runs.reduce((a, r) => Math.max(a, r.days), 0),
    runs,
  };
}

// ── Shape 6 · Heat level ──────────────────────────────────────────────────────

/** A day's intensity bucket 0–4 from its minutes (presentation cutoffs). */
export const heatLevel = (min: number): number =>
  min <= 0 ? 0 : min < 30 ? 1 : min < 90 ? 2 : min < 190 ? 3 : 4;

export type HeatChip = "HOT" | "WARM" | "COOLING" | "COLD";

/** The masthead chip from recent (trailing-14-day) average minutes/day. */
export function heatChip(sessions: SessionRow[], today: string): HeatChip {
  const from = dayFromIndex(dayIndex(today) - 13);
  const mins = scoped(sessions, { from, to: today }).reduce((a, s) => a + sessionMinutes(s), 0);
  const perDay = mins / 14;
  return perDay >= 120 ? "HOT" : perDay >= 45 ? "WARM" : perDay >= 15 ? "COOLING" : "COLD";
}

// ── Shape 7 · Distribution / leaderboard ──────────────────────────────────────

export interface DistRow {
  key: string;
  value: number;
  pct: number; // 0–100, relative to the row set's max (bar width)
}

/**
 * Tally by category → rows with a max-relative pct. `order` fixes the row order
 * (status vocab, ratings 5→1); omit it to rank descending (genre). `multi`
 * flat-maps a string[] key (genre). Empty categories are dropped.
 */
export function distribute(
  items: EntryRow[],
  keyOf: (e: EntryRow) => string | string[] | null,
  opts: { order?: string[]; top?: number } = {},
): DistRow[] {
  const counts = new Map<string, number>();
  for (const e of items) {
    const k = keyOf(e);
    if (k == null) continue;
    for (const key of Array.isArray(k) ? k : [k])
      counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let rows = [...counts.entries()].map(([key, value]) => ({ key, value }));
  if (opts.order) {
    const rank = new Map(opts.order.map((k, i) => [k, i]));
    rows = rows
      .filter((r) => rank.has(r.key))
      .sort((a, b) => rank.get(a.key)! - rank.get(b.key)!);
  } else {
    rows.sort((a, b) => b.value - a.value);
  }
  if (opts.top) rows = rows.slice(0, opts.top);
  const max = rows.reduce((a, r) => Math.max(a, r.value), 0) || 1;
  return rows.map((r) => ({ ...r, pct: (r.value / max) * 100 }));
}

export interface LeaderRow {
  entryId: string;
  title: string;
  value: number; // minutes, or distinct-day count
  pct: number;
}

/** Entries ranked by a per-entry Total (minutes) or distinct-days. */
export function leaderboard(
  sessions: SessionRow[],
  entries: EntryRow[],
  metric: Metric,
  top = 5,
): LeaderRow[] {
  const titleOf = new Map(entries.map((e) => [e.id, e.title]));
  const byEntry = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    if (s.entry_fk == null) continue;
    (byEntry.get(s.entry_fk) ?? byEntry.set(s.entry_fk, []).get(s.entry_fk)!).push(s);
  }
  const rows = [...byEntry.entries()]
    .map(([entryId, ss]) => ({
      entryId,
      title: titleOf.get(entryId) ?? "—",
      value: metric === "minutes" ? total(ss).minutes : distinctDays(ss),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, top);
  const max = rows[0]?.value || 1;
  return rows.map((r) => ({ ...r, pct: (r.value / max) * 100 }));
}

// ── Shape 8 · Period delta ────────────────────────────────────────────────────

/** total (hours if minutes, else distinct days) ÷ calendar buckets in [from,to]. */
function windowRate(
  sessions: SessionRow[],
  from: string,
  to: string,
  grain: Grain,
  metric: Metric,
): number {
  const rows = scoped(sessions, { from, to });
  const amount = metric === "minutes" ? total(rows).minutes / 60 : distinctDays(rows);
  const span = dayGap(from, to) + 1;
  const per = grain === "week" ? 7 : grain === "month" ? 30.4375 : 365.25;
  const buckets = span / per;
  return buckets > 0 ? amount / buckets : 0;
}

/**
 * The rate over [from,to] vs the immediately-preceding equal-length window.
 * Under a year scope the window is the year → this is year-over-year; for All
 * Time the caller passes a trailing-year window → a recent-trend delta. Returns
 * null when the prior window has no sessions (the no-prior-period law).
 */
export function periodDelta(
  sessions: SessionRow[],
  from: string,
  to: string,
  grain: Grain,
  metric: Metric,
): DeltaChip | null {
  const len = dayGap(from, to);
  const prevTo = dayFromIndex(dayIndex(from) - 1);
  const prevFrom = dayFromIndex(dayIndex(from) - 1 - len);
  if (scoped(sessions, { from: prevFrom, to: prevTo }).length === 0) return null;
  const curr = windowRate(sessions, from, to, grain, metric);
  const prev = windowRate(sessions, prevFrom, prevTo, grain, metric);
  return deltaChip(curr - prev, metric === "minutes" ? "h" : "");
}

// ── Shape 9 · Heatmap cells ───────────────────────────────────────────────────

export interface HeatmapCell {
  day: string | null; // null = a future cell (hidden)
  minutes: number;
  level: number; // 0–4, or −1 for future
  /** The dominant-type categorical slot for the By-Type face (null when no type resolver). */
  catVar?: string | null;
}

/**
 * A trailing `weeks`×7 grid ending at `today`, row-major (Mon row across all
 * weeks, then Tue…) to match the CSS grid's fill order. `catOf` (optional) maps
 * a day to its dominant-type categorical slot for the By-Type heatmap face.
 */
export function heatmapCells(
  dayMin: Map<string, number>,
  today: string,
  weeks = 53,
  catOf?: (day: string) => string | null,
): HeatmapCell[] {
  const startIdx = dayIndex(weekStart(today)) - (weeks - 1) * 7;
  const todayIdx = dayIndex(today);
  const cells: HeatmapCell[] = [];
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < weeks; col++) {
      const idx = startIdx + col * 7 + row;
      if (idx > todayIdx) {
        cells.push({ day: null, minutes: 0, level: -1 });
        continue;
      }
      const day = dayFromIndex(idx);
      const minutes = dayMin.get(day) ?? 0;
      cells.push({ day, minutes, level: heatLevel(minutes), catVar: catOf ? catOf(day) : null });
    }
  }
  return cells;
}

/** Month labels for the heatmap header: {col, label} where a new month begins. */
export function heatmapMonths(today: string, weeks = 53): { col: number; label: string }[] {
  const startIdx = dayIndex(weekStart(today)) - (weeks - 1) * 7;
  const out: { col: number; label: string }[] = [];
  let lastMonth = "";
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let col = 0; col < weeks; col++) {
    const mk = monthKey(dayFromIndex(startIdx + col * 7));
    if (mk !== lastMonth) {
      out.push({ col, label: MON[Number(mk.slice(5)) - 1] });
      lastMonth = mk;
    }
  }
  return out;
}

// ── Shape 10 · Waves ──────────────────────────────────────────────────────────
// Derivation-only on the habit dashboard (entry dashboards render the timeline);
// written once here so no later dashboard re-derives clustering.

export interface Wave {
  start: string;
  end: string;
  days: number;
  minutes: number;
}

/**
 * ── Eras (ruled 2026-07-24, the wave-timeline rethink) ───────────────────────
 * A DENSITY construct over the wave list — a second gap threshold provably
 * fails (any gap loose enough to hold a push together also chains the
 * scattered pokes), so eras grow-from-seed instead. Derived at read time,
 * never stored; parameters are metric params, siblings of `wave_gap_days`
 * (per-habit override permitted, none wired yet). Numbered, never named.
 * A wave belonging to no era is an INTERLUDE (not an era, never numbered).
 */
export interface Era {
  /** Wave-list index range (inclusive) this era claims. */
  from: number;
  to: number;
  start: string;
  end: string;
  /** Chronological 1-based number. */
  n: number;
  days: number;
  amount: number;
}

export interface EraParams {
  seedDays: number;
  seedShare: number;
  densityFloor: number;
  diluteRatio: number;
  joinMult: number;
}

export const ERA_DEFAULTS: EraParams = {
  seedDays: 5,
  seedShare: 0.05,
  densityFloor: 0.12,
  diluteRatio: 0.8,
  joinMult: 2,
};

/**
 * Grow-from-seed: a wave seeds when days ≥ seedDays AND its share of the
 * entry's total amount ≥ seedShare; it absorbs neighbours under two gates —
 * the REST CEILING (the silence to the candidate ≤ joinMult × gapDays; a
 * longer silence ends the era outright) and the DENSITY GATE (merged
 * density = Σ logged days ÷ merged calendar span must clear densityFloor
 * AND diluteRatio × the current density). Claimed waves never re-seed.
 */
export function erasForWaves(
  waves: Wave[],
  amountOf: (w: Wave) => number,
  gapDays: number,
  p: EraParams = ERA_DEFAULTS,
): Era[] {
  const amounts = waves.map(amountOf);
  const totalAmount = amounts.reduce((a, v) => a + v, 0) || 1;
  const used = new Set<number>();
  const out: Era[] = [];
  const dens = (lo: number, hi: number, dsum: number) =>
    dsum / (dayGap(waves[lo].start, waves[hi].end) + 1);

  waves.forEach((w, i) => {
    if (used.has(i)) return;
    if (w.days < p.seedDays || amounts[i] / totalAmount < p.seedShare) return;
    let lo = i;
    let hi = i;
    let dsum = w.days;
    let cur = dens(lo, hi, dsum);
    let moved = true;
    while (moved) {
      moved = false;
      for (const side of ["lo", "hi"] as const) {
        const j = side === "lo" ? lo - 1 : hi + 1;
        if (j < 0 || j >= waves.length || used.has(j)) continue;
        const silence =
          side === "lo" ? dayGap(waves[j].end, waves[lo].start) : dayGap(waves[hi].end, waves[j].start);
        if (silence > gapDays * p.joinMult) continue; // an era's rests are bounded
        const nl = side === "lo" ? j : lo;
        const nh = side === "hi" ? j : hi;
        const nd = dsum + waves[j].days;
        const d2 = dens(nl, nh, nd);
        if (d2 >= p.densityFloor && d2 >= cur * p.diluteRatio) {
          lo = nl;
          hi = nh;
          dsum = nd;
          cur = d2;
          moved = true;
        }
      }
    }
    for (let k = lo; k <= hi; k++) used.add(k);
    out.push({ from: lo, to: hi, start: waves[lo].start, end: waves[hi].end, n: 0, days: 0, amount: 0 });
  });

  out.sort((a, b) => (a.start < b.start ? -1 : 1));
  out.forEach((e, i) => {
    e.n = i + 1;
    for (let k = e.from; k <= e.to; k++) {
      e.days += waves[k].days;
      e.amount += amounts[k];
    }
  });
  return out;
}

/** An entry's sessions clustered by the gap threshold; later clusters = replays. */
export function wavesForEntry(entrySessions: SessionRow[], gapDays = 30): Wave[] {
  const days = [...new Set(entrySessions.map((s) => s.day))].sort();
  if (days.length === 0) return [];
  const minsByDay = dayMinutes(entrySessions);
  const waves: Wave[] = [];
  let cur: Wave = { start: days[0], end: days[0], days: 1, minutes: minsByDay.get(days[0]) ?? 0 };
  for (let i = 1; i < days.length; i++) {
    if (dayGap(days[i - 1], days[i]) > gapDays) {
      waves.push(cur);
      cur = { start: days[i], end: days[i], days: 1, minutes: minsByDay.get(days[i]) ?? 0 };
    } else {
      cur.end = days[i];
      cur.days++;
      cur.minutes += minsByDay.get(days[i]) ?? 0;
    }
  }
  waves.push(cur);
  return waves;
}
