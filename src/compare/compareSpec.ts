/**
 * Comparing Statistics — the PURE half (Build step 6 catch-up).
 *
 * Translation of `Final/comparing-statistics.html` + the owning notes
 * ([[Comparing Statistics]] · the per-screen note). The comparability gate
 * READS THROUGH THE PICKERS — this module computes what each picker offers,
 * and the offered set IS the gate (no explainer prose anywhere):
 *   - the measure list is the INTERSECTION of the selected scopes
 *     (duration comparable everywhere it exists; count only on a matching
 *     unit label; the day-set tier never empties);
 *   - self-comparison (one scope) is un-gated — full vocabulary, Sessions in;
 *   - the chart picker offers only what the configuration can draw.
 *
 * Rulings taken 2026-07-27 (user):
 *   - "Days (any)" — REMOVED ENTIRELY (the ruling's third and final form:
 *     app-wide semantics → self-only → "just remove it, I don't really see
 *     much of a use"). The FINAL draws it in both exhibits' measure strips;
 *     both faces are overridden. The day-set tier's survivor is Days active
 *     (plus flag day-sets), which keeps the tier non-empty as designed.
 *   - The Writing ⇄ Keyboard words overlap is ANNOTATED via the in-body chart
 *     caption (the one annotation form the screen note permits); the unit gate
 *     itself is unchanged — the comparison stays legal.
 *
 * Purely descriptive by charter: no goals, no verdict colours; the cross
 * difference is the plain magnitude (kit-chip-delta NEUTRAL).
 */
import { dayFromIndex, dayIndex, monthKey, weekStart, yearKey } from "../metrics/dates";
import { MONTHS_SHORT, decimal1, groupInt } from "../metrics/format";
import { sessionMinutes } from "../metrics/shapes";
import { resolveWindow, type ResolvedWindow, type WindowCfg } from "../kit/periodWindow";
import { CAT_SLOTS as CAT_SLOT_VARS } from "../dashboard/specShared";

// The period-window vocabulary MOVED to kit/periodWindow.ts 2026-07-30 (the
// dedup pass — it belongs beside kit/PeriodPicker, its editor). Re-exported
// here so this module's public API is unchanged.
export { RELATIVE_DAYS, resolveWindow } from "../kit/periodWindow";
export type { ResolvedWindow, WindowCfg };

// ── Data shapes (what useCompareData delivers) ───────────────────────────────

export interface CmpHabit {
  id: string;
  key: string;
  name: string;
  kind: "project" | "simple" | "range";
  /** Stored + immutable. consumption = importer-fed, high-volume; creation =
      hand-authored, few. Read by the entry split to decide browse vs search. */
  subType: "consumption" | "creation" | null;
  colour: string; // "habit-N" slot name
  /** Stored lucide name (seed batch 7 / the user's pick); null = lettermark/dot fallback. */
  icon?: string | null;
  archived: boolean;
  measuresTime: boolean;
  measuresCount: boolean;
  countUnit: string | null;
  sortOrder: number;
}

export interface CmpSession {
  id: string;
  habitId: string;
  entryId: string | null;
  day: string;
  /** Named as the app-wide SessionRow convention, so shapes helpers fit structurally. */
  measure_kind: "time" | "count" | "range" | "none";
  value: number | null;
  start: string | null;
  end: string | null;
}

export interface CmpEntry {
  id: string;
  habitId: string;
  title: string;
  /** The three entry-level categorical columns a split can read. */
  type: string | null;
  fandom: string | null;
  gamedev_engine: string | null;
}

/**
 * One split-able categorical field of a habit — an entry-level attribute
 * (Medium `type` · Fandom · Engine) or a session-level picklist.
 *
 * `entryColumn` is load-bearing: entry-level values do NOT all live in
 * `entries.type`. The keystone gives each attribute its own plain column
 * (`type` · `fandom` · `gamedev_engine`), so a split has to know which one to
 * read — assuming `type` for every entry-level field is what made "Writing by
 * fandom" silently draw nothing (fixed 2026-07-27).
 */
export interface SplitField {
  field: string; // the definition key ("writing_fandom", "writing_stage", …)
  label: string;
  entryLevel: boolean;
  /** Which `entries` column holds the value (entry-level fields only). */
  entryColumn?: "type" | "fandom" | "gamedev_engine";
  /** True only for a real Medium (entry `type` + the session categoricals). */
  isMedium: boolean;
  values: string[];
  /**
   * Display names where the stored value isn't one — the ENTRY split stores
   * entry ids (stable; titles are neither unique nor immutable).
   */
  valueLabel?: Record<string, string>;
  /** The entry split wants a filter: a consumption habit runs to hundreds. */
  searchable?: boolean;
}

/**
 * The synthetic split field every entry-bearing habit carries. Entries were a
 * one-entry DRILL until 2026-07-27; making them a split is what the owning
 * note always described — "compare one entry across windows, **or entries
 * against each other**" — and it is what lets each entry wear its own colour.
 * One selected value behaves exactly like the old drill.
 */
export const ENTRY_FIELD = "__entry";

export interface CmpData {
  habits: CmpHabit[];
  sessions: CmpSession[];
  entries: CmpEntry[];
  /** session id → { def key → value } (session-level categoricals + flags). */
  valueBySession: Map<string, Record<string, string>>;
  /** habit id → its split-able Medium fields. */
  splitFields: Map<string, SplitField[]>;
  /** habit id → its session-level FLAG defs ({key,label}) — the day-flag tier. */
  flagDefs: Map<string, { key: string; label: string }[]>;
}

// ── Builder configuration ────────────────────────────────────────────────────

/**
 * ONE split per scope (user-ruled 2026-07-27, "scope needs to be narrowed
 * down") — picking a dimension replaces the previous one, so a scope is
 * always exactly: a habit, optionally fanned one way.
 */
export interface ScopeCfg {
  habitId: string | null;
  split: { field: string; values: string[] } | null;
}

/**
 * The CHART is now only the drawn kinds — stat tiles left this union
 * 2026-07-27 (user-ruled) to become their own independently toggled section,
 * because they are a second READING of the same configuration rather than a
 * fourth chart shape: you can want the numbers and a chart at once.
 */
export type ChartKind = "line" | "gbar" | "sbar" | "area" | "hbar" | "donut";

/**
 * THE DONUT REVERSES A FROZEN RULING (user, 2026-07-27: "do donuts").
 * [[Comparing Statistics]] ruled pie/donut out because "stacked bar answers
 * proportions" — true over TIME, but a stacked bar over a single window
 * degenerates to one column, which is a worse donut. So it is offered exactly
 * where the stacked bar degenerates: ≥2 series, ONE window. Scatter and
 * tables stay ruled out (cross-measure / covered by the tiles).
 */
export const CHART_LABEL: Record<ChartKind, string> = {
  line: "line",
  gbar: "bar · grouped",
  sbar: "bar · stacked",
  area: "area · stacked",
  hbar: "bar · ranked",
  donut: "donut",
};

export interface CompareCfg {
  scopes: ScopeCfg[];
  measure: MeasurePick | null;
  windows: WindowCfg[];
  /** null = no chart drawn; the stat tiles can still be on. */
  chart: ChartKind | null;
  /** The numeric reading, on by default — its own section since 2026-07-27. */
  tiles: boolean;
}

export const emptyCfg = (): CompareCfg => ({
  scopes: [{ habitId: null, split: null }],
  measure: null,
  windows: [{ mode: "none" }],
  chart: null,
  tiles: true,
});

// ── The measure gate ─────────────────────────────────────────────────────────

/**
 * THE MEASURE MODEL (re-cut 2026-07-27, user-ruled — the drawn flat list of
 * measure words becomes a two-level pick).
 *
 * Level 1 = a COLUMN × a FAMILY. Every column offers Total and Average; Day
 * also offers Best day. Level 2 refines what the family needs and nothing
 * more: Count asks which counted thing, Average asks per which period, Day's
 * Total asks which day-set only when the scopes declare flags.
 *
 * "Average" divides by CALENDAR PERIODS SPANNED, not by active ones — the
 * reading the user's own gating example implies (per month must gray out a
 * 30-day window). So an average per day counts every day in the window,
 * where the superseded `avg-day` counted only days with activity.
 */
export type MeasureColumnKey = "time" | "day" | "count";
/**
 * "Best day" was the Day column's third family for one iteration and was
 * REMOVED 2026-07-27 (user: "it doesn't really work with the current set
 * up") — with the columns naming the subject and Total/Average naming the
 * operation, a peak sat in neither vocabulary, and its basis was ambiguous
 * the moment a habit declared both duration and a count.
 */
export type MeasureFamily = "total" | "average";
export type AvgScope = "day" | "week" | "month" | "quarter" | "year";

export interface MeasurePick {
  column: MeasureColumnKey;
  family: MeasureFamily;
  /** Count column: the habit's count unit, or "sessions" / "entries". */
  unit?: string | null;
  /** family "average": the denominator period. */
  scope?: AvgScope | null;
  /** Day column + total: null/"active" = active days, else "flag:<key>". */
  daySet?: string | null;
}

export interface ColumnSpec {
  key: MeasureColumnKey;
  label: string;
  families: MeasureFamily[];
}

export const AVG_SCOPES: AvgScope[] = ["day", "week", "month", "quarter", "year"];

/**
 * HOW LONG A WINDOW MAY BE BEFORE AN AVERAGE SCOPE STOPS BEING OFFERED.
 *
 * User-ruled 2026-08-15: *"Day average should be unavailable past 90 days both
 * in relative and custom, week average unavailable past 365 days."*
 *
 * An Average buckets at its OWN scope — one bar per period — so "average per
 * day" over a year asks for 365 grouped bars, about a pixel each, under 365
 * labels. `grainFor` coarsens every other measure as the window grows and the
 * average scope is the one path that bypasses it, which is why this is the only
 * place the chart could run away.
 *
 * The cap is on the WINDOW, so a custom Date → Date range is gated by exactly
 * the same rule as a relative one — it is the span in days that decides, not
 * how the span was asked for. Month, quarter and year are unbounded: their
 * bucket counts grow slowly enough that `grainFor`'s own ceilings never come
 * into play.
 */
export const AVG_SCOPE_MAX_DAYS: Partial<Record<AvgScope, number>> = {
  day: 90,
  week: 365,
};

/** Whether `scope` may be averaged over a window of `spanDays`. */
export function avgScopeAllowed(scope: AvgScope, spanDays: number): boolean {
  const cap = AVG_SCOPE_MAX_DAYS[scope];
  return cap == null || spanDays <= cap;
}

/**
 * The scope actually used for a window: the picked one, or the finest legal
 * scope when the window has outgrown it.
 *
 * A stored pick is not corrected in place — widen the window and the chart
 * falls back, narrow it again and the original pick returns. Writing it back
 * would silently lose what was asked for the first time the window moved.
 */
export function effectiveAvgScope(scope: AvgScope, spanDays: number): AvgScope {
  if (avgScopeAllowed(scope, spanDays)) return scope;
  return AVG_SCOPES.find((s) => avgScopeAllowed(s, spanDays)) ?? "year";
}

/**
 * The shortest window that can carry one period of a scope — the gate for the
 * relative chips and the error threshold for a custom range.
 *
 * These are NOMINAL period lengths, not maxima, and the difference is what
 * makes both ruled behaviours true at once: a 30-day window must not average
 * by month (30 < 30.5, the user's own example) while a plain calendar year —
 * 365 days — must average by year. The known edge: a custom range covering
 * exactly a SHORT month (February, 28 days) is refused for a monthly average;
 * an alignment test would admit it, at more complexity than the case earns.
 *
 * Each minimum is the SHORTEST REAL period of its scope — quarter is 90, not
 * ~91.3: Q1 of a non-leap year is 90 days, and 91 refused an exact calendar
 * Q1 (the 2026-07-30 audit's false-error case). Year is 365 for the same
 * reason (non-leap years are real years).
 */
export const AVG_SCOPE_MIN_DAYS: Record<AvgScope, number> = {
  day: 1,
  week: 7,
  month: 30.5,
  quarter: 90,
  year: 365,
};

const cap = (s: string): string => (s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s);

const hasDuration = (h: CmpHabit): boolean => h.measuresTime || h.kind === "range";

/** Scopes that have picked a habit (the gate reads only real selections). */
export const pickedScopes = (cfg: CompareCfg, data: CmpData): { scope: ScopeCfg; habit: CmpHabit }[] =>
  cfg.scopes.flatMap((scope) => {
    const habit = data.habits.find((h) => h.id === scope.habitId);
    return habit != null ? [{ scope, habit }] : [];
  });

/**
 * The shared numeric bases of a scope set — the gate's ONE intersection rule
 * (duration comparable where every scope has it; a count only on a matching
 * unit label across every scope). BOTH may exist (Writing declares duration
 * and a count). `countUnits` and `measureColumns` both read THIS, so the two
 * halves of the gate can never drift apart (they briefly re-encoded the
 * intersection separately — converged at the 2026-07-30 dedup pass; the
 * Best-day-era `sharedBases`/`sharedBasis` exports died there too, callerless).
 */
function sharedNumericBases(habits: CmpHabit[]): { time: boolean; countUnit: string | null } {
  const unit = habits[0]?.countUnit ?? null;
  return {
    time: habits.length > 0 && habits.every(hasDuration),
    countUnit:
      unit != null && habits.every((h) => h.measuresCount && h.countUnit === unit) ? unit : null,
  };
}

/**
 * Level 2 for the Count column: WHICH counted thing. The habit's own count
 * unit rides the intersection rule (a matching label across every scope);
 * Sessions stays self-comparison-only (the frozen strip's own gate); Entries
 * needs an all-project scope set and no entry drill.
 *
 * NOT offered anywhere, by the scope fence: efficiency (count ÷ duration) is
 * cross-measure — the same law that ruled out scatter.
 */
export function countUnits(
  cfg: CompareCfg,
  data: CmpData,
  picked: { scope: ScopeCfg; habit: CmpHabit }[] = pickedScopes(cfg, data),
): { id: string; label: string }[] {
  if (picked.length === 0) return [];
  const habits = picked.map((p) => p.habit);
  const out: { id: string; label: string }[] = [];
  const unit = sharedNumericBases(habits).countUnit;
  if (unit != null) out.push({ id: unit, label: cap(unit) });
  if (picked.length === 1) out.push({ id: "sessions", label: "Sessions" });
  // Counting entries while splitting BY entry is degenerate (every series
  // would read 1), so the unit drops out exactly then.
  if (
    habits.every((h) => h.kind === "project") &&
    picked.every((p) => p.scope.split?.field !== ENTRY_FIELD)
  )
    out.push({ id: "entries", label: "Entries" });
  return out;
}

/**
 * Level 2 for Day × Total: which day-set. Always "Active days"; a flag every
 * scope declares joins it (Sleep's Meds days) — the day-flag tier the
 * comparability gate calls the universal currency. One option = no picker.
 */
export function daySets(
  cfg: CompareCfg,
  data: CmpData,
  picked: { scope: ScopeCfg; habit: CmpHabit }[] = pickedScopes(cfg, data),
): { id: string; label: string }[] {
  if (picked.length === 0) return [];
  const habits = picked.map((p) => p.habit);
  const out = [{ id: "active", label: "Active days" }];
  for (const f of data.flagDefs.get(habits[0].id) ?? []) {
    // "Days I took medication", not "Took Medication days" — flag labels are
    // authored as completed ACTIONS since 2026-08-07, so a label appended to a
    // noun reads as a stutter. Same idiom the range dashboard's flag subtitles
    // use ("Nights I took medication"), which is the ruled wording.
    if (habits.every((h) => (data.flagDefs.get(h.id) ?? []).some((g) => g.key === f.key)))
      out.push({ id: `flag:${f.key}`, label: `Days I ${f.label.toLowerCase()}` });
  }
  return out;
}

/**
 * Level 1 — the columns this scope set can offer. Time needs duration
 * everywhere; Day is always available (its currency is the universal one);
 * Count needs at least one counted thing.
 */
export function measureColumns(
  cfg: CompareCfg,
  data: CmpData,
  picked: { scope: ScopeCfg; habit: CmpHabit }[] = pickedScopes(cfg, data),
): ColumnSpec[] {
  if (picked.length === 0) return [];
  const habits = picked.map((p) => p.habit);
  const cols: ColumnSpec[] = [];
  if (sharedNumericBases(habits).time)
    cols.push({ key: "time", label: "Time", families: ["total", "average"] });
  cols.push({ key: "day", label: "Day", families: ["total", "average"] });
  if (countUnits(cfg, data, picked).length > 0)
    cols.push({ key: "count", label: "Count", families: ["total", "average"] });
  return cols;
}

/** A pick is only usable once its level-2 questions are answered. */
export function pickComplete(pick: MeasurePick | null): boolean {
  if (pick == null) return false;
  if (pick.column === "count" && pick.unit == null) return false;
  if (pick.family === "average" && pick.scope == null) return false;
  return true;
}

/**
 * Is the pick still OFFERED by the current scopes? A measure outlives the
 * scope set that justified it — remove the habit that carried the shared
 * count unit, or split by entry after choosing to count entries, and the
 * pick becomes one the gate would no longer show. It is then treated as
 * unfinished rather than computed from a vocabulary that no longer exists
 * (this also catches a preset written against different scopes).
 */
export function pickOffered(
  pick: MeasurePick | null,
  cfg: CompareCfg,
  data: CmpData,
  picked: { scope: ScopeCfg; habit: CmpHabit }[] = pickedScopes(cfg, data),
): boolean {
  if (!pickComplete(pick) || pick == null) return false;
  if (!measureColumns(cfg, data, picked).some((c) => c.key === pick.column)) return false;
  if (pick.column === "count" && !countUnits(cfg, data, picked).some((u) => u.id === pick.unit)) return false;
  if (pick.column === "day" && pick.family === "total" && pick.daySet != null) {
    if (!daySets(cfg, data, picked).some((d) => d.id === pick.daySet)) return false;
  }
  return true;
}

/** The pick's display name + tile unit suffix. */
export function measureMeta(
  pick: MeasurePick,
  cfg: CompareCfg,
  data: CmpData,
  picked: { scope: ScopeCfg; habit: CmpHabit }[] = pickedScopes(cfg, data),
): { label: string; unit: string } {
  const scope = pick.scope ?? "day";
  if (pick.column === "time")
    return pick.family === "total"
      ? { label: "Total hours", unit: "h" }
      : { label: `Hours per ${scope}`, unit: "h" };

  if (pick.column === "count") {
    const u = countUnits(cfg, data, picked).find((x) => x.id === pick.unit);
    const name = u?.label ?? cap(pick.unit ?? "");
    // Sessions/Entries are their own noun — no unit suffix on the tile.
    const suffix = pick.unit === "sessions" || pick.unit === "entries" ? "" : pick.unit ?? "";
    return pick.family === "total"
      ? { label: `Total ${name.toLowerCase()}`, unit: suffix }
      : { label: `${name} per ${scope}`, unit: suffix };
  }

  const setLabel =
    daySets(cfg, data, picked).find((d) => d.id === (pick.daySet ?? "active"))?.label ?? "Active days";
  return pick.family === "total"
    ? { label: setLabel, unit: "d" }
    : { label: `${setLabel.replace(/ days$/i, "")} days per ${scope}`, unit: "d" };
}

// ── Buckets ──────────────────────────────────────────────────────────────────

type Grain = "day" | "week" | "month" | "quarter" | "year";

/** Bars read coarser than lines (the FINAL: a year window bars by QUARTER, lines by MONTH). */
export function grainFor(spanDays: number, chart: ChartKind): Grain {
  if (chart === "line") {
    if (spanDays <= 140) return "day";
    if (spanDays <= 550) return "month";
    return "quarter";
  }
  if (spanDays <= 16) return "day";
  if (spanDays <= 98) return "week";
  if (spanDays <= 200) return "month";
  if (spanDays <= 750) return "quarter";
  return "year";
}

const quarterKey = (day: string): string =>
  `${day.slice(0, 4)}-Q${Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1}`;

const bucketKey = (day: string, grain: Grain): string =>
  grain === "day" ? day
  : grain === "week" ? weekStart(day)
  : grain === "month" ? monthKey(day)
  : grain === "quarter" ? quarterKey(day)
  : yearKey(day);

const bucketLabel = (key: string, grain: Grain): string =>
  grain === "day" ? String(Number(key.slice(8)))
  : grain === "week" ? `${key.slice(8)} ${MONTHS_SHORT[Number(key.slice(5, 7)) - 1]}`
  : grain === "month" ? MONTHS_SHORT[Number(key.slice(5, 7)) - 1]
  : grain === "quarter" ? key.slice(5)
  : key;

/** Ordered bucket keys covering a window at a grain. */
export function windowBuckets(win: ResolvedWindow, grain: Grain): string[] {
  const keys: string[] = [];
  let idx = dayIndex(win.from);
  const end = dayIndex(win.to);
  let last = "";
  while (idx <= end) {
    const k = bucketKey(dayFromIndex(idx), grain);
    if (k !== last) {
      keys.push(k);
      last = k;
    }
    idx++;
  }
  return keys;
}

// ── Series derivation ────────────────────────────────────────────────────────

export interface CmpSeries {
  label: string;
  /** CSS var name without var() — "habit-3" · "cat-1" · "accent". */
  colourSlot: string;
  /** 0 solid · 1 dashed · 2 dotted (cycles) — window = line STYLE, never colour. */
  dashIdx: number;
  values: number[]; // per bucket index (shared relative axis)
  total: number; // over the whole window
  scopeIdx: number;
  windowIdx: number;
  splitValue: string | null;
  /** The hue's identity (habit name / split value) — carried structurally so
   *  the legend never re-parses the display label (labels contain " · ";
   *  fixed 2026-07-30). */
  sourceLabel: string;
  /** The window's full resolved label ("2024 · Jan – Dec"). */
  windowLabel: string;
}

export interface CmpTile {
  label: string;
  /** Colour dot only — [[Iconography]] rules stat tiles icon-free (number + label). */
  dotSlot: string | null;
  value: string;
  unit: string;
  subtitle: string;
}

export interface CmpDelta {
  value: string;
  unit: string;
  winner: string;
}

export interface CmpChart {
  kind: ChartKind;
  title: string;
  /** null unless something must be said — today only the Keyboard tie. */
  caption: string | null;
  bucketLabels: string[];
  series: CmpSeries[];
  yMax: number;
  yTicks: number[];
  /** Multi-window overlays share one relative axis (the FINAL's Jan → Dec frame). */
  sharedAxis: boolean;
}

export interface CmpResult {
  complete: boolean;
  tiles: CmpTile[];
  delta: CmpDelta | null;
  chart: CmpChart | null;
  allowed: Record<ChartKind, boolean>;
  /**
   * A configuration that is fully picked but cannot be computed — today the
   * one case is a custom window shorter than the average scope it is asked to
   * average over (relative windows are gated in the picker instead, which is
   * why only the custom path can reach this).
   */
  error: string | null;
}

// The categorical palette's one owner is specShared.CAT_SLOTS — the local
// `= 8` copy retired at the 6a sweep (two sources of truth for the count).
const CAT_SLOTS = CAT_SLOT_VARS.length;
// Minutes-of-a-session = the canonical shapes.sessionMinutes (the local float
// copy converged there 2026-07-30 — a sub-minute display shift is accepted).

/** Even ~4-tick axis reaching past the max (the chunk-5 computed-axis precedent). */
export function niceAxis(max: number): { yMax: number; ticks: number[] } {
  if (max <= 0) return { yMax: 4, ticks: [0, 1, 2, 3, 4] };
  const rawStep = max / 3;
  const pow = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rawStep) ?? 10 * pow;
  const yMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= yMax + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);
  return { yMax, ticks };
}

/** Whole calendar periods of `scope` the window spans — Average's divisor. */
export function periodsInWindow(win: ResolvedWindow, scope: AvgScope): number {
  return Math.max(1, windowBuckets(win, scope).length);
}

interface SeriesSource {
  label: string;
  colourSlot: string;
  scopeIdx: number;
  splitValue: string | null;
  sessions: CmpSession[]; // pre-filtered to the scope (NOT the window)
}

export function buildResult(cfg: CompareCfg, data: CmpData, today: string): CmpResult {
  const picked = pickedScopes(cfg, data); // computed ONCE and threaded through the gate calls
  const windows = cfg.windows
    .map((w) => resolveWindow(w, today))
    .filter((w): w is ResolvedWindow => w != null);
  const pick = cfg.measure;
  const cross = picked.length > 1;
  const wins = cross ? windows.slice(0, 1) : windows;

  const incomplete: CmpResult = {
    complete: false,
    tiles: [],
    delta: null,
    chart: null,
    allowed: { line: false, gbar: false, sbar: false, area: false, hbar: false, donut: false },
    error: null,
  };
  if (picked.length === 0 || pick == null || !pickOffered(pick, cfg, data, picked) || wins.length === 0)
    return incomplete;
  // A pick can be legal but uncomputable: averaging by month over a fortnight.
  // The relative chips are gated in the picker, so only a custom range lands
  // here — it surfaces in the results canvas rather than silently reading 0.
  if (pick.family === "average" && pick.scope != null) {
    const short = wins.find((w) => w.days < AVG_SCOPE_MIN_DAYS[pick.scope as AvgScope]);
    if (short != null)
      return {
        ...incomplete,
        error: `${short.label} is shorter than one ${pick.scope} — pick a longer range, or average by something smaller.`,
      };
  }
  const measure = measureMeta(pick, cfg, data, picked);

  const entryById = new Map(data.entries.map((e) => [e.id, e]));

  // — series sources: scope × split-value (windows multiply below) —
  const sources: SeriesSource[] = [];
  picked.forEach(({ scope, habit }, scopeIdx) => {
    const base = data.sessions.filter((s) => s.habitId === habit.id);
    const scopeName = habit.name;
    const split = scope.split;
    const field =
      split == null
        ? null
        : (data.splitFields.get(habit.id) ?? []).find((f) => f.field === split.field) ?? null;
    // A stale preset can carry entry-split values whose entries were deleted —
    // they must DROP, never render their raw row ids as series labels (the
    // stale-preset rule, enforced for habits/measures, now split values too;
    // 2026-07-30). A vocab-string value stays: the value IS its label.
    const liveValues =
      split != null && field != null && field.field === ENTRY_FIELD
        ? split.values.filter((v) => field.valueLabel?.[v] != null)
        : split?.values ?? [];
    if (split == null || field == null || liveValues.length === 0) {
      sources.push({ label: scopeName, colourSlot: habit.colour, scopeIdx, splitValue: null, sessions: base });
    } else {
      liveValues.forEach((v, pos) => {
        const sessions = base.filter((s) => {
          if (field.field === ENTRY_FIELD) return s.entryId === v;
          if (!field.entryLevel) return data.valueBySession.get(s.id)?.[field.field] === v;
          if (s.entryId == null) return false;
          const e = entryById.get(s.entryId);
          // Read the attribute's OWN column, never `type` for everything.
          return e != null && (e[field.entryColumn ?? "type"] ?? null) === v;
        });
        const name = field.valueLabel?.[v] ?? v;
        // Colour by POSITION IN THE SELECTION, not position in the vocabulary:
        // an entry split picks a handful out of hundreds, and indexing the
        // roster would hand most of them the same slot.
        sources.push({
          label: cross ? `${scopeName} · ${name}` : name,
          colourSlot: `cat-${(pos % CAT_SLOTS) + 1}`,
          scopeIdx,
          splitValue: name,
          sessions,
        });
      });
    }
  });

  // — the QUANTITY the pick names, before any averaging —
  const flagKey =
    pick.column === "day" && (pick.daySet ?? "active").startsWith("flag:")
      ? (pick.daySet as string).slice(5)
      : null;

  const rawValue = (sessions: CmpSession[]): number => {
    if (pick.column === "time") return sessions.reduce((a, s) => a + sessionMinutes(s), 0) / 60;
    if (pick.column === "count") {
      if (pick.unit === "sessions") return sessions.length;
      if (pick.unit === "entries")
        return new Set(sessions.flatMap((s) => (s.entryId != null ? [s.entryId] : []))).size;
      return sessions.reduce((a, s) => a + (s.measure_kind === "count" ? s.value ?? 0 : 0), 0);
    }
    // day column
    if (flagKey != null) {
      const days = new Set<string>();
      for (const s of sessions) {
        const v = data.valueBySession.get(s.id)?.[flagKey];
        if (v != null && v !== "0" && v.toLowerCase() !== "false") days.add(s.day);
      }
      return days.size;
    }
    return new Set(sessions.map((s) => s.day)).size;
  };

  // — chart allowance (the picker offers only what draws) —
  const spanDays = Math.max(...wins.map((w) => w.days));
  // An Average buckets at its OWN scope (the grain override below), so the
  // allowance must count those buckets too — grainFor's would enable a line
  // for one year-sized bucket, a single invisible point (fixed 2026-07-30).
  // ⚠ THE EFFECTIVE SCOPE, NOT THE PICKED ONE (2026-08-15). The picker gates
  // day past 90 days and week past 365, but a window can be WIDENED under a
  // pick that was legal when it was made — so the spec falls back too, or the
  // one path that bypasses `grainFor` could still ask for 365 bars.
  const avgGrain: Grain | null =
    pick.family === "average" && pick.scope != null
      ? effectiveAvgScope(pick.scope, spanDays)
      : null;
  // With avgGrain set, line and bar bucket at the SAME grain — count once
  // instead of walking the windows twice (2026-07-30).
  const avgBuckets =
    avgGrain != null
      ? Math.max(...wins.map((w) => windowBuckets(w, avgGrain).length))
      : null;
  const lineBuckets =
    avgBuckets ??
    Math.max(...wins.map((w) => windowBuckets(w, grainFor(w.days, "line")).length));
  const barBuckets =
    avgBuckets ??
    Math.max(...wins.map((w) => windowBuckets(w, grainFor(w.days, "gbar")).length));
  const seriesCount = sources.length * wins.length;
  // A share-of-a-whole shape needs the parts to BE a whole, so donut and
  // stacked area take one window only — stacking or slicing across separate
  // windows would total things that never coexisted.
  const oneWindow = wins.length === 1;
  const allowed: Record<ChartKind, boolean> = {
    line: lineBuckets >= 2,
    gbar: barBuckets >= 2,
    sbar: seriesCount >= 2 && barBuckets >= 2,
    area: seriesCount >= 2 && lineBuckets >= 2 && oneWindow,
    hbar: seriesCount >= 2,
    donut: seriesCount >= 2 && oneWindow,
  };
  // A chart the configuration cannot draw simply isn't drawn — the tiles
  // still answer, so there is nothing to fall back TO any more.
  const chartKind: ChartKind | null =
    cfg.chart != null && allowed[cfg.chart] ? cfg.chart : null;

  // — series × windows, bucketed on a shared relative axis —
  // An AVERAGE buckets at its own scope, so each bar IS one period and the
  // chart reads as the distribution whose mean the tile states — no divisor
  // inside a bucket, and no degenerate "average over one third of a month".
  // hbar and donut read series TOTALS, so their bucket grain is irrelevant —
  // they fall through to the bar grain and simply ignore the buckets.
  const grainFamily: ChartKind =
    chartKind === "area" ? "line" : chartKind === "hbar" || chartKind === "donut" ? "gbar" : chartKind ?? "gbar";
  const grain: Grain = avgGrain ?? grainFor(spanDays, grainFamily);
  const bucketsPerWin = wins.map((w) => windowBuckets(w, grain));
  const longest = bucketsPerWin.reduce((a, b) => (b.length > a.length ? b : a), bucketsPerWin[0]);

  const series: CmpSeries[] = [];
  wins.forEach((win, windowIdx) => {
    const keys = bucketsPerWin[windowIdx];
    sources.forEach((src) => {
      const inWin = src.sessions.filter((s) => s.day >= win.from && s.day <= win.to);
      const byBucket = new Map<string, CmpSession[]>();
      for (const s of inWin) {
        const k = bucketKey(s.day, grain);
        const arr = byBucket.get(k);
        if (arr) arr.push(s);
        else byBucket.set(k, [s]);
      }
      const values = keys.map((k) => rawValue(byBucket.get(k) ?? []));
      const label =
        wins.length > 1
          ? src.splitValue != null
            ? `${src.splitValue} · ${win.label}`
            : sources.length > 1
              ? `${src.label} · ${win.label}`
              : win.label
          : src.label;
      series.push({
        label,
        colourSlot: src.colourSlot,
        dashIdx: windowIdx % 3,
        values,
        total: rawValue(inWin),
        scopeIdx: src.scopeIdx,
        windowIdx,
        splitValue: src.splitValue,
        sourceLabel: src.label,
        windowLabel: win.label,
      });
    });
  });

  // — tiles: cross groups by SCOPE, self groups by WINDOW (the two exhibits) —
  const tiles: CmpTile[] = [];
  // Averages read to one decimal (a whole-number average lies); everything
  // else keeps the drawn whole-number face.
  const round1 = (v: number): string =>
    pick.family === "average" ? decimal1(v) : groupInt(Math.round(v));
  /** THE ONE PLACE AVERAGING HAPPENS: raw ÷ periods spanned by the window. */
  const per = (raw: number, win: ResolvedWindow): number =>
    pick.family === "average" && pick.scope != null ? raw / periodsInWindow(win, pick.scope) : raw;
  /*
   * NO SUBTITLE ECHOING THE WINDOW (user-ruled 2026-07-27): the Period step
   * already states it, and in self mode the tile's own LABEL is the window,
   * so "2025 · Jan – Dec total" said it three times. A subtitle appears only
   * where it carries something the tile doesn't — a split value's share, or a
   * multi-window split's breakdown — so the non-split faces below carry "".
   */
  /** The scope's own total, unsplit — the honest denominator for a split. */
  const scopeTotal = (habitId: string, win: ResolvedWindow): number =>
    rawValue(
      data.sessions.filter((s) => s.habitId === habitId && s.day >= win.from && s.day <= win.to),
    );

  const splitSelf = !cross && sources.length > 1 && sources[0].splitValue != null;
  if (splitSelf && wins.length === 1) {
    /**
     * A SPLIT GETS A CARD PER VALUE PLUS A TOTAL (user-ruled 2026-07-27:
     * "three cards detailing the breakdown including a total"). It replaces
     * cramming the breakdown into one tile's subtitle, which stopped being
     * readable past two values. Only for a single window — values × windows
     * would multiply past what a tile row can carry, so multi-window keeps
     * one tile per window below.
     */
    const win = wins[0];
    // Hoisted (2026-08-04): loop-INVARIANT — same habit, same window every
    // iteration — and each call filters the whole session set, so N split
    // series meant N full-store scans instead of one. The Total tile below
    // reuses it rather than computing a third time.
    const whole = scopeTotal(picked[0].habit.id, win);
    series.forEach((s) => {
      const share = whole > 0 ? Math.round((s.total / whole) * 100) : 0;
      tiles.push({
        label: s.splitValue ?? s.label,
        dotSlot: s.colourSlot,
        value: round1(per(s.total, win)),
        unit: measure.unit,
        // The bare share — what it is a share OF is the Total tile beside it.
        subtitle: `${share}%`,
      });
    });
    tiles.push({
      label: "Total",
      dotSlot: null,
      value: round1(per(whole, win)),
      unit: measure.unit,
      subtitle: "",
    });
  } else if (!cross && sources.length >= 1) {
    // self: one tile per window; a split's breakdown rides the subtitle
    wins.forEach((win, wi) => {
      const group = series.filter((s) => s.windowIdx === wi);
      const raw =
        sources.length === 1 || sources[0].splitValue == null
          ? group.reduce((a, s) => a + s.total, 0)
          : scopeTotal(picked[0].habit.id, win);
      const subtitle =
        group.length > 1 && group[0].splitValue != null
          ? group.map((s) => `${s.splitValue} ${round1(per(s.total, win))}`).join(" · ")
          : "";
      tiles.push({
        label: win.label,
        dotSlot: null,
        value: round1(per(raw, win)),
        unit: measure.unit,
        subtitle,
      });
    });
  } else {
    // cross: one tile per scope over the single shared window
    picked.forEach(({ habit }, scopeIdx) => {
      const group = series.filter((s) => s.scopeIdx === scopeIdx);
      const scopeName = habit.name;
      const raw = group.length === 1 ? group[0].total : scopeTotal(habit.id, wins[0]);
      const subtitle =
        group.length > 1 && group[0].splitValue != null
          ? group.map((s) => `${s.splitValue} ${round1(per(s.total, wins[0]))}`).join(" · ")
          : "";
      tiles.push({
        label: scopeName,
        dotSlot: habit.colour,
        value: round1(per(raw, wins[0])),
        unit: measure.unit,
        subtitle,
      });
    });
  }

  // — the neutral delta (cross, exactly two scopes, one window) —
  let delta: CmpDelta | null = null;
  if (cross && picked.length === 2) {
    const a = tiles[0];
    const b = tiles[1];
    if (a != null && b != null) {
      const av = Number(a.value.replace(/,/g, ""));
      const bv = Number(b.value.replace(/,/g, ""));
      const diff = Math.abs(av - bv);
      const winner = av >= bv ? a.label : b.label;
      // The chip's ▲ + name already says which way and by how much; naming
      // both sides again and asserting "unjudged" was the tile talking about
      // itself (user-ruled 2026-07-27). Neutrality stays in the FORM — no
      // verdict colour — which is where the charter put it.
      delta = { value: round1(diff), unit: measure.unit, winner };
    }
  }

  // — chart panel —
  let chart: CmpChart | null = null;
  if (chartKind != null) {
    const bucketLabels = longest.map((k) => bucketLabel(k, grain));
    // The stacked shapes measure their axis against the STACK, the ranked bar
    // against series totals, everything else against a single bucket's value.
    const stacked = chartKind === "sbar" || chartKind === "area";
    const yMaxRaw = Math.max(
      0,
      ...(chartKind === "hbar" || chartKind === "donut"
        ? series.map((s) => s.total)
        : stacked
          ? longest.map((_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0))
          : series.flatMap((s) => s.values)),
    );
    const { yMax, ticks } = niceAxis(yMaxRaw);
    /**
     * THE TITLE IS SCOPE · MEASURE · PERIOD · CHART, and nothing else
     * (user-ruled 2026-07-27). It replaces a prose headline that narrated the
     * shape's job ("share of the whole", "ranked", "across the year") — the
     * shape is visible, so saying it in words was decoration.
     */
    const scopePart = picked
      .map(({ scope, habit }) => {
        const f =
          scope.split == null
            ? null
            : (data.splitFields.get(habit.id) ?? []).find((x) => x.field === scope.split?.field);
        return f != null ? `${habit.name} by ${f.label.toLowerCase()}` : habit.name;
      })
      .join(" vs ");
    const periodPart = wins.length > 1 ? wins.map((w) => w.label).join(" · ") : wins[0].label;
    // ⚠ A FIFTH PART, user-ruled 2026-08-15 — the ruled SCOPE · MEASURE · PERIOD
    // · CHART order is untouched and this hangs off the end. A chart's bars are
    // rarely one per day: `grainFor` has always coarsened a long window down to
    // weeks, months or quarters, and it said so nowhere, so "Last 365 days ·
    // bar" drew four quarterly bars with nothing to explain them. Omitted for
    // hbar and donut, which read series TOTALS and have no buckets to describe.
    const grainPart =
      chartKind === "hbar" || chartKind === "donut" ? null : `shown by ${grain}`;
    const title = [scopePart, measure.label, periodPart, CHART_LABEL[chartKind], grainPart]
      .filter((p) => p != null)
      .join(" · ");

    // The ONE surviving caption: the Writing⇄Keyboard derive annotation, which
    // is a warning about the data rather than a description of the chart, and
    // is ruled to live here (2026-07-27, the words-overlap ruling).
    const habitKeys = new Set(picked.map((p) => p.habit.key));
    const keyboardTie =
      pick.column === "count" &&
      pick.unit === "words" &&
      habitKeys.has("writing") &&
      habitKeys.has("keyboard");
    chart = {
      kind: chartKind,
      title,
      caption: keyboardTie ? "Keyboard words derive from Writing" : null,
      bucketLabels,
      series,
      yMax,
      yTicks: ticks,
      sharedAxis: wins.length > 1,
    };
  }

  // The tiles section is independently switched off — the delta rides with
  // them, being a tile.
  return {
    complete: true,
    tiles: cfg.tiles ? tiles : [],
    delta: cfg.tiles ? delta : null,
    chart,
    allowed,
    error: null,
  };
}
