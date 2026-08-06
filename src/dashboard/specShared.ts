/**
 * Helpers shared by the consumption / creation / simple habit-dashboard specs.
 * These were copy-pasted across all three (streak tiles, year-over-year and
 * month-over-month deltas, the trend-window bucket builder, the categorical
 * literals); hoisted here so a fix lands once and the specs stop drifting.
 * Pure functions — no React, no dials.
 */
import { dayFromIndex, dayGap, dayIndex, monthKey, weekNum, weekStart, yearKey } from "../metrics/dates";
import { deltaChip, decimal1, fmtDMY, fmtRange, groupInt, MONTHS_SHORT, type DeltaChip } from "../metrics/format";
import {
  priorWindow,
  scoped,
  sessionMinutes,
  type Run,
  type SessionRow,
} from "../metrics/shapes";
import type { TileSpec } from "./consumptionSpec";

// ── Shared literals ───────────────────────────────────────────────────────────

/** Abbreviated month names, index 0 = Jan (alias of the format module's). */
export const MON = MONTHS_SHORT;

/** Single-letter month labels ("J F M …") — the drawn spark/chart axis faces. */
export const MON_1 = MONTHS_SHORT.map((m) => m[0]);

/** heat chip word → CSS class (COOLING wears the warm face by the drawn rule). */
export const HEAT_CLASS: Record<string, string> = { HOT: "hot", WARM: "warm", COOLING: "warm", COLD: "cold" };

/** The categorical-palette slots, cycled for by-type distributions + open vocab. */
export const CAT_SLOTS = ["--cat-1", "--cat-2", "--cat-3", "--cat-4", "--cat-5", "--cat-6", "--cat-7", "--cat-8"];

/**
 * status → categorical slot (matches the frozen FINALs' pills). The five seeded
 * statuses are IMMUTABLE ANCHORS (user-ruled 2026-07-22), so keying colour off
 * the literal strings is safe; user-added statuses take the unused slots.
 */
export const STATUS_CAT: Record<string, string> = {
  Current: "--cat-2",
  Finished: "--cat-4",
  Dropped: "--cat-6",
  Planned: "--cat-3",
  Hiatus: "--cat-8",
};

// ── Small string/number helpers ───────────────────────────────────────────────

export const maxStr = (a: string, b: string) => (a >= b ? a : b);
export const minStr = (a: string, b: string) => (a <= b ? a : b);

/** Compact big numbers: ≥1000 → "12k", else thousands-grouped. (entrySpec's
 *  `kFmt1` is a deliberate SIBLING, not a duplicate — it keeps one decimal
 *  between 10k and 100k and stays grouped below 10k, the drawn wave-table face.) */
export const kFmt = (v: number): string => (v >= 1000 ? `${Math.round(v / 1000)}k` : groupInt(v));

/** Up to `max` uppercase initials for a lettermark cover (4 = the card faces;
 *  the entry rail's big cover passes 12). */
export const initialism = (title: string, max = 4): string => {
  const words = title.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const s = words.length > 1 ? words.map((w) => w[0]).join("") : title.replace(/[^A-Za-z0-9]/g, "");
  return s.slice(0, max).toUpperCase();
};

/** "wk 12 · 2024" for a week-start day. */
export const bestWeekLabel = (weekStartDay: string): string => {
  const { week, year } = weekNum(weekStartDay);
  return `wk ${week} · ${year}`;
};

// ── Count-measure siblings (creation + simple) ────────────────────────────────

export type Grain = "day" | "week" | "month";
export const grainKey = (day: string, grain: Grain): string =>
  grain === "day" ? day : grain === "week" ? weekStart(day) : monthKey(day);

/** A session's count-measure amount (0 for non-count rows) — the count
 *  sibling of `sessionMinutes`, the amount-of callback the generalized catalog
 *  shapes (`bestAmount` · `periodDeltaBy`) take. */
export const countAmountOf = (s: SessionRow): number =>
  s.measure_kind === "count" ? s.value ?? 0 : 0;

/** Count-session values summed per day (the count sibling of `dayMinutes`). */
export function dayCounts(sessions: SessionRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) {
    const a = countAmountOf(s);
    if (s.measure_kind === "count") m.set(s.day, (m.get(s.day) ?? 0) + a);
  }
  return m;
}

/** The whole-number delta chip ("▲ 1,240") — count-measure deltas' face. */
export const intDeltaChip = (d: number): DeltaChip => ({
  text: `${d < 0 ? "▼" : "▲"} ${groupInt(Math.abs(d))}`,
  down: d < 0,
});

// ── Runs ──────────────────────────────────────────────────────────────────────

export const longestRunOf = (st: { runs: Run[] }): Run | null =>
  st.runs.reduce<Run | null>((b, r) => (!b || r.days > b.days ? r : b), null);
export const lastRunOf = (st: { runs: Run[] }): Run | null => st.runs[st.runs.length - 1] ?? null;

/**
 * A streak stat tile with a date line + a three-row prior/next streak table.
 * `valueOfRun` (simple's measured face) prefixes each run with a measure amount;
 * pass null (consumption/creation) for the bare date form — identical output.
 */
export function streakTile(
  label: string,
  run: Run | null,
  st: { runs: Run[]; currentRun: Run | null },
  isCurrent: boolean,
  valueOfRun: ((run: Run) => string | null) | null = null,
): TileSpec {
  const value = run ? `${run.days}` : "0";
  const prefix = (r: Run): string => {
    const v = valueOfRun?.(r);
    return v ? `${v} · ` : "";
  };
  const dateLine = run
    ? isCurrent && run === st.currentRun
      ? `${prefix(run)}since ${fmtDMY(run.start)}`
      : `${prefix(run)}${fmtRange(run.start, run.end)}`
    : "—";
  const others = st.runs.filter((r) => r !== run);
  const picked = isCurrent
    ? [...others].sort((a, b) => b.end.localeCompare(a.end)).slice(0, 3)
    : [...others].sort((a, b) => b.days - a.days).slice(0, 3);
  return {
    label,
    value,
    unit: "d",
    list: {
      dateLine,
      rows: picked.map((r) => ({ k: `${prefix(r)}${fmtRange(r.start, r.end)}`, v: `${r.days}d` })),
    },
  };
}

// ── Deltas ────────────────────────────────────────────────────────────────────

/** Under a year scope every delta is this-year-vs-last; annotate the chip. */
export const vsYear = (
  chip: DeltaChip | null | undefined,
  isYear: boolean,
  year: string,
): DeltaChip | undefined =>
  chip == null ? undefined : isYear ? { ...chip, text: `${chip.text} vs ${Number(year) - 1}` } : chip;

/**
 * Per-ACTIVE-DAY delta of an arbitrary per-session amount — the grain the
 * "Avg / active day" tiles state — window vs the prior equal-length one,
 * formatted by the caller's chip builder. (Was simpleSpec's local
 * `amountActiveDayDelta`; `activeDayDelta` below is its duration face.)
 */
export function amountActiveDayDelta(
  sessions: SessionRow[],
  amountOf: (s: SessionRow) => number,
  from: string,
  to: string,
  chipOf: (d: number) => DeltaChip,
): DeltaChip | undefined {
  const avg = (f: string, t: string) => {
    const rows = scoped(sessions, { from: f, to: t });
    const days = new Set(rows.map((s) => s.day)).size;
    return days > 0 ? rows.reduce((a, s) => a + amountOf(s), 0) / days : 0;
  };
  const prev = priorWindow(from, to);
  if (scoped(sessions, prev).length === 0) return undefined;
  return chipOf(avg(from, to) - avg(prev.from, prev.to));
}

/** Avg-active-day delta in minutes (chip unit "m"), window vs the prior one. */
export const activeDayDelta = (
  sessions: SessionRow[],
  from: string,
  to: string,
): DeltaChip | undefined =>
  amountActiveDayDelta(sessions, sessionMinutes, from, to, (d) => deltaChip(d, "m"));

/** Generic window-vs-prior delta of any scalar stat over day windows. */
export function statDelta(
  stat: (from: string, to: string) => number | null,
  from: string,
  to: string,
  fmt: (d: number) => string = (d) => decimal1(Math.abs(d)),
): DeltaChip | undefined {
  const prev = priorWindow(from, to);
  const cur = stat(from, to);
  const before = stat(prev.from, prev.to);
  if (cur == null || before == null) return undefined;
  const d = cur - before;
  return { text: `${d < 0 ? "▼" : "▲"} ${fmt(d)}`, down: d < 0 };
}

/**
 * The month spark's chip under a year scope: the pinned year's total vs the
 * SAME span of the prior year (a part-way year never compares to a whole one).
 * `div` scales the summed amount (e.g. minutes → hours); default 1 = raw sum.
 */
export function yearOverYearDelta(
  src: Map<string, number>,
  year: string,
  endDay: string,
  div = 1,
): DeltaChip | null {
  const from = `${year}-01-01`;
  const prevFrom = `${Number(year) - 1}-01-01`;
  const prevTo = dayFromIndex(dayIndex(prevFrom) + dayGap(from, endDay));
  const sum = (f: string, t: string) =>
    [...src.entries()].filter(([d]) => d >= f && d <= t).reduce((a, [, v]) => a + v, 0) / div;
  const cur = sum(from, endDay);
  const prev = sum(prevFrom, prevTo);
  if (prev <= 0) return null;
  const pct = ((cur - prev) / prev) * 100;
  return {
    text: `${pct < 0 ? "▼" : "▲"} ${Math.abs(Math.round(pct))}% vs ${Number(year) - 1}`,
    down: pct < 0,
  };
}

/** Index of the last month (0–11) whose value is > 0, else 0. */
export const lastMonthWithData = (vals: number[]): number => {
  for (let i = vals.length - 1; i >= 0; i--) if (vals[i] > 0) return i;
  return 0;
};

/** Month-over-month percentage chip ("▼ 27%"), or null with no prior month. */
export function monthOverMonth(vals: number[], idx: number): DeltaChip | null {
  if (idx <= 0) return null;
  const cur = vals[idx];
  const prev = vals[idx - 1];
  if (prev <= 0) return null;
  const pct = ((cur - prev) / prev) * 100;
  return { text: `${pct < 0 ? "▼" : "▲"} ${Math.abs(Math.round(pct))}% vs last month`, down: pct < 0 };
}

// ── Scope window · masthead tabs · month spark (the ×4/×3 stanzas) ────────────

type ScopeSelLike = { kind: "all" } | { kind: "year"; year: string };

/**
 * The scope-window clamp every habit spec opens with: All Time = tracked span →
 * today; a pinned year clamps to the year's own days ∩ the tracked span.
 * An empty habit anchors both ends at today.
 */
export function resolveScopeWindow(
  sel: ScopeSelLike,
  firstDay: string | null,
  today: string,
  empty: boolean = firstDay == null,
): { isYear: boolean; scopeFrom: string; scopeTo: string } {
  const isYear = sel.kind === "year";
  const base = firstDay ?? today;
  const scopeFrom = empty ? today : isYear ? maxStr(`${sel.year}-01-01`, base) : base;
  const scopeTo = isYear ? minStr(`${sel.year}-12-31`, today) : today;
  return { isYear, scopeFrom, scopeTo };
}

/**
 * The masthead's scope tabs: All Time + every tracked year, newest first.
 * `years` rides along ascending (the measureless dayspark reads it).
 */
export function yearTabs(
  firstDay: string | null,
  today: string,
): { years: string[]; tabs: { key: string; label: string }[] } {
  const years: string[] = [];
  if (firstDay != null)
    for (let y = Number(yearKey(firstDay)); y <= Number(yearKey(today)); y++) years.push(String(y));
  return {
    years,
    tabs: [{ key: "all", label: "All Time" }, ...[...years].reverse().map((y) => ({ key: y, label: y }))],
  };
}

export interface MonthSpark {
  /** Single-letter axis label ("J"). */
  label: string;
  /** The three-letter month name ("Jan") — tooltip material. */
  month: string;
  value: number;
  monthVar: string;
}

/**
 * The 12 monthly spark bars for `year` from a day→amount map, in ONE grouped
 * pass (the old per-month full-map rescan ×12 folded away). Month slots are
 * NAMED dials (--month-jan … --month-dec), never numbered.
 */
export function monthlySpark(src: Map<string, number>, year: string, div = 1): MonthSpark[] {
  const perMonth = new Array<number>(12).fill(0);
  for (const [d, v] of src) if (d.startsWith(year)) perMonth[Number(d.slice(5, 7)) - 1] += v;
  return MON.map((mo, i) => ({
    label: mo[0],
    month: mo,
    value: perMonth[i] / div,
    monthVar: `--month-${mo.toLowerCase()}`,
  }));
}

/** The archived-habit empty-trend message (creation ≡ simple, one wording). */
export const archivedEmptyMessage = (
  archived: boolean,
  windowEmpty: boolean,
  isYear: boolean,
  year: string,
  archivedOn: string | null,
): string | null =>
  archived && windowEmpty
    ? `No activity in ${isYear ? year : "the last 30 days"} — this habit was archived${archivedOn ? ` ${fmtDMY(archivedOn)}` : ""}.`
    : null;

// ── Trend window ──────────────────────────────────────────────────────────────

export interface TrendWindow {
  buckets: string[][];
  xticks: { i: number; label: string }[];
  windowLabel: string;
  grainNoun: string;
}

/**
 * The trend chart's x-domain, shared by all three habit specs: under a pinned
 * year → whole-year WEEK buckets with every-4th-week ISO ticks (straddle weeks
 * clamp to the year's own days; buckets whose ISO week belongs to a neighbour
 * year are skipped rather than mislabeled); otherwise → the trailing 30 DAY
 * buckets with 4 dated ticks. `trendEnd` is the scope's right edge.
 */
export function buildTrendWindow(year: string, isYear: boolean, trendEnd: string): TrendWindow {
  const windowLabel = isYear ? year : "Last 30 days";
  const grainNoun = isYear ? "week" : "day";
  let buckets: string[][];
  let xticks: { i: number; label: string }[];
  if (isYear) {
    buckets = [];
    for (let ws = dayIndex(weekStart(`${year}-01-01`)); ws <= dayIndex(trendEnd); ws += 7) {
      const days: string[] = [];
      for (let k = 0; k < 7; k++) {
        const d = dayFromIndex(ws + k);
        if (d.startsWith(year) && d <= trendEnd) days.push(d);
      }
      buckets.push(days);
    }
    xticks = [];
    for (let i = 0; i < buckets.length; i += 4) {
      const d0 = buckets[i][0];
      if (!d0) continue;
      const iw = weekNum(d0);
      if (String(iw.year) !== year) continue;
      xticks.push({ i, label: `W${iw.week}` });
    }
  } else {
    buckets = Array.from({ length: 30 }, (_, i) => [dayFromIndex(dayIndex(trendEnd) - 29 + i)]);
    xticks = [0, 10, 20, 29].map((i) => {
      const d = dayFromIndex(dayIndex(trendEnd) - (29 - i));
      return { i, label: `${Number(d.slice(8))} ${MON[Number(d.slice(5, 7)) - 1]}` };
    });
  }
  return { buckets, xticks, windowLabel, grainNoun };
}
