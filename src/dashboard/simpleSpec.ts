/**
 * The simple habit-dashboard **composition spec** (Dashboard Composition §
 * Simple + range; frozen references `walking-stats.html` (measureless floor) ·
 * `embroidery-stats.html` / `walking-steps-stats.html` (measured duration /
 * count) · `keyboard-stats.html` (categorical fill)).
 *
 * The FLAVOR is derived from the declarations, never stored (user-ruled
 * 2026-07-23): no measure → measureless · measures only → measured · measures
 * + ≥1 session categorical → categorical. Drawing/Coding have no FINALs of
 * their own — Drawing translates from Embroidery, Coding from Keyboard (the
 * user's ruling at chunk 3: "pretty much identical to keyboard, just swap it
 * over"). Zero habit special-casing anywhere in this file.
 *
 * Retired categorical values are DERIVED: a value present in session data but
 * absent from the live vocab is retired ("vocab churn is data" — the frozen
 * Keyboard screen draws retired boards beside current ones).
 */
import {
  best,
  bestAmount,
  daysHeatChip,
  dayMinutes,
  distinctDays,
  heatChip,
  heatmapGrid,
  heatmapMonths,
  periodDelta,
  periodDeltaBy,
  playedDaySet,
  scoped,
  streaks,
  heatLevel,
  type HeatChip,
  type Run,
  type SessionRow,
} from "../metrics/shapes";
import { dayFromIndex, dayGap, dayIndex, monthKey, yearKey } from "../metrics/dates";
import {
  decimal1,
  deltaChip,
  fmtDMY,
  fmtMonY,
  groupInt,
  hoursMinutes,
  hoursTrim1,
  hoursWhole,
  type DeltaChip,
} from "../metrics/format";
import type { TileSpec } from "./consumptionSpec";
import type {
  CreationModel,
  DistPanelSpec,
  ScopeSel,
  SessionDef,
  ShapeChart,
  TrendSeries,
} from "./creationSpec";
import {
  amountActiveDayDelta,
  archivedEmptyMessage,
  bestWeekLabel,
  buildTrendWindow,
  CAT_SLOTS,
  countAmountOf,
  dayCounts,
  intDeltaChip,
  kFmt,
  lastMonthWithData,
  lastRunOf,
  longestRunOf,
  MON,
  MON_1,
  monthlySpark,
  monthOverMonth,
  resolveScopeWindow,
  statDelta,
  streakTile,
  vsYear,
  yearOverYearDelta,
  yearTabs,
} from "./specShared";

export type { ScopeSel } from "./creationSpec";

// ── Input ─────────────────────────────────────────────────────────────────────

export type SimpleFlavor = "measureless" | "measured" | "categorical";

export interface SimpleBuildInput {
  habitKey: string;
  colourSlot: string;
  name: string;
  archived: boolean;
  measuresTime: boolean;
  measuresCount: boolean;
  countUnit: string | null;
  sessions: SessionRow[];
  finalized: Set<string>;
  today: string;
  defs: SessionDef[];
  valueBySession: Map<string, Record<string, string>>;
}

// ── Model ─────────────────────────────────────────────────────────────────────

export interface SimpleModel {
  colorVar: string;
  flavor: SimpleFlavor;
  masthead: {
    name: string;
    heat: HeatChip | null;
    archived: boolean;
    empty: boolean;
    sinceLive: string;
    tabs: { key: string; label: string }[];
    activeKey: string;
  };
  /** Measureless: the binary attendance grid + the bundled 6-tile row. */
  attendance: {
    cells: { day: string | null; on: boolean; tip: string }[];
    months: { col: number; label: string }[];
    tiles: TileSpec[];
  } | null;
  /** Measureless: the days-per-period spark (scope-following axis). */
  dayspark: {
    delta: DeltaChip | null;
    deltaNote: string;
    bars: { label: string; value: number; tip: string }[];
    max: number;
  } | null;
  /** Measured + categorical: the At-a-glance rows. */
  statRows: { label: string; tall?: boolean; tiles: TileSpec[] }[] | null;
  /** Categorical: the split always-visible Days/<measure> panels. */
  dist: { title: string; panels: DistPanelSpec[] } | null;
  /** Measured + categorical: the trend zone (same shape the creation renderer walks). */
  trend: CreationModel["trend"] | null;
  /** Measured + categorical: measure-intensity heatmap (+ per-value filter when categorical). */
  heatmap: {
    /** The categorical's label for the filter select, or null (no filter). */
    filterLabel: string | null;
    options: { value: string; label: string }[];
    cells: { day: string | null; level: number; value: string | null; tip: string }[];
    months: { col: number; label: string }[];
    trio: TileSpec[];
  } | null;
}

// ── Local literals (CAT_SLOTS/MON/MON_1/kFmt/bestWeekLabel/dayCounts + the
//    streak/delta/scope helpers live in ./specShared; the best/delta/heatmap
//    shapes in ../metrics/shapes) ───────────────────────────────────────────

/** Big totals: ≥1M reads "1.20" + unit "M" (the drawn Keyboard/steps idiom). */
const mSplit = (v: number): { v: string; u?: string } =>
  v >= 1e6 ? { v: (v / 1e6).toFixed(2), u: "M" } : { v: groupInt(v) };

// ── Primary-measure plumbing ──────────────────────────────────────────────────
// The primary measure = count when declared, else time (the locked rule). All
// derived zones (dist splits · trend · heatmap · spark) read the primary.

type MeasureKindKey = "time" | "count";

interface Measure {
  kind: MeasureKindKey;
  /** "words" / "steps" / "hours" — the row label + caption noun. */
  noun: string;
  /** Tile-value abbreviation ("w" · "st" · "h"). */
  abbr: string;
  dayAmounts: (rows: SessionRow[]) => Map<string, number>;
  amountOf: (s: SessionRow) => number;
  fmt: (v: number) => string;
  fmtLong: (v: number) => string;
}

function makeMeasure(kind: MeasureKindKey, countUnit: string | null): Measure {
  if (kind === "count") {
    const noun = countUnit ?? "count";
    return {
      kind,
      noun,
      abbr: noun.slice(0, 1),
      dayAmounts: dayCounts,
      amountOf: countAmountOf,
      fmt: (v) => groupInt(v),
      fmtLong: (v) => `${groupInt(v)} ${noun}`,
    };
  }
  return {
    kind,
    noun: "hours",
    abbr: "h",
    dayAmounts: dayMinutes,
    amountOf: (s) => (s.measure_kind === "time" ? s.value ?? 0 : 0),
    fmt: (v) => hoursMinutes(v),
    fmtLong: (v) => hoursMinutes(v),
  };
}

// The hour-unit delta faces (conformed 2026-07-30, preserved through the
// catalog migration): a period-rate delta on an hours tile reads in HOURS —
// deltaChip(d/60, "h"), the drawn "▲ 0.4h" — while the per-active-day delta
// reads in per-day MINUTES — deltaChip(d, "m"), the drawn "▲ 3m" scale.
const hourRateChip = (d: number): DeltaChip => deltaChip(d / 60, "h");
const perDayMinChip = (d: number): DeltaChip => deltaChip(d, "m");

// bestAmount · periodDeltaBy · daysHeatChip live in ../metrics/shapes;
// streakTile · longestRunOf · lastRunOf · vsYear · yearOverYearDelta ·
// monthOverMonth · lastMonthWithData · amountActiveDayDelta · statDelta all
// live in ./specShared.

// ── The builder ───────────────────────────────────────────────────────────────

export function buildSimpleDashboard(input: SimpleBuildInput, sel: ScopeSel): SimpleModel {
  const { finalized, today, defs, valueBySession } = input;
  const colorVar = `--${input.colourSlot}`;
  const hasMeasure = input.measuresTime || input.measuresCount;
  const flavor: SimpleFlavor = !hasMeasure ? "measureless" : defs.length > 0 ? "categorical" : "measured";
  const primary = makeMeasure(input.measuresCount ? "count" : "time", input.countUnit);
  // The one categorical the tile family mints off (Keyboard's board · Coding's
  // language); distributions/trends iterate every def, the tiles read the first.
  const catDef = flavor === "categorical" ? defs[0] : null;

  const sessions = input.sessions;
  const allDaysSorted = sessions.map((s) => s.day).sort();
  const firstDay = allDaysSorted[0] ?? null;
  const lastDay = allDaysSorted[allDaysSorted.length - 1] ?? null;
  const empty = firstDay == null;
  const archivedOn = input.archived ? lastDay : null;

  // ── Scope window (clamped to the tracked span and to today) ──
  const isYear = sel.kind === "year";
  const { scopeFrom, scopeTo } = resolveScopeWindow(sel, firstDay, today, empty);
  const sessScoped = scoped(sessions, { from: scopeFrom, to: scopeTo });

  const spanDays = dayGap(scopeFrom, scopeTo) + 1;
  const weeks = spanDays / 7;
  const months = spanDays / 30.4375;
  const played = playedDaySet(sessScoped);
  const st = streaks(scopeFrom, scopeTo, played, finalized);
  const daysActive = distinctDays(sessScoped);

  const dFrom = isYear ? scopeFrom : dayFromIndex(dayIndex(today) - 364);
  const dTo = isYear ? scopeTo : today;

  // ── Categorical ground truth: values, slots, retirement, day dominance ──
  const dataValuesAll = new Set<string>();
  if (catDef) for (const s of sessions) {
    const v = valueBySession.get(s.id)?.[catDef.key];
    if (v != null) dataValuesAll.add(v);
  }
  const vocabSet = new Set(catDef?.vocab ?? []);
  const retired = [...dataValuesAll].filter((v) => !vocabSet.has(v)).sort();
  const valueOrder = [...(catDef?.vocab ?? []), ...retired];
  const slotOf = new Map(valueOrder.map((v, i) => [v, CAT_SLOTS[i % CAT_SLOTS.length]]));

  /** day → dominant value (by primary amount, session-count tiebreak), all-time. */
  const dominantByDay = new Map<string, string>();
  if (catDef) {
    const perDay = new Map<string, Map<string, number>>();
    for (const s of sessions) {
      const v = valueBySession.get(s.id)?.[catDef.key];
      if (v == null) continue;
      const byVal = perDay.get(s.day) ?? perDay.set(s.day, new Map()).get(s.day)!;
      byVal.set(v, (byVal.get(v) ?? 0) + Math.max(primary.amountOf(s), 1));
    }
    for (const [day, byVal] of perDay) {
      let bestV: { v: string; a: number } | null = null;
      for (const [v, a] of byVal) if (!bestV || a > bestV.a) bestV = { v, a };
      if (bestV) dominantByDay.set(day, bestV.v);
    }
  }
  const valueOfRun =
    catDef == null
      ? null
      : (run: Run): string | null => {
          const tally = new Map<string, number>();
          for (let i = dayIndex(run.start); i <= dayIndex(run.end); i++) {
            const v = dominantByDay.get(dayFromIndex(i));
            if (v != null) tally.set(v, (tally.get(v) ?? 0) + 1);
          }
          let out: { v: string; n: number } | null = null;
          for (const [v, n] of tally) if (!out || n > out.n) out = { v, n };
          return out?.v ?? null;
        };

  /** Per-value aggregation over a session slice. */
  interface ValAgg {
    days: Set<string>;
    amount: number;
  }
  const aggValues = (rows: SessionRow[]): Map<string, ValAgg> => {
    const m = new Map<string, ValAgg>();
    if (!catDef) return m;
    for (const s of rows) {
      const v = valueBySession.get(s.id)?.[catDef.key];
      if (v == null) continue;
      const a = m.get(v) ?? m.set(v, { days: new Set(), amount: 0 }).get(v)!;
      a.days.add(s.day);
      a.amount += primary.amountOf(s);
    }
    return m;
  };
  const aggScoped = aggValues(sessScoped);
  const usedInScope = [...aggScoped.keys()];

  // ── Masthead ──
  const { years, tabs } = yearTabs(firstDay, today);
  const totPrimaryAll = sessions.reduce((a, s) => a + primary.amountOf(s), 0);
  const allDaysCount = distinctDays(sessions);
  const totalWord =
    flavor === "measureless"
      ? `${groupInt(allDaysCount)} days logged`
      : primary.kind === "count"
        ? `${totPrimaryAll >= 1e6 ? `${(totPrimaryAll / 1e6).toFixed(2)} M` : groupInt(totPrimaryAll)} ${primary.noun}`
        : `${hoursWhole(totPrimaryAll)} across ${groupInt(sessions.length)} sessions`;
  const sinceLive = empty
    ? `Tracking since — · no sessions logged yet`
    : `Tracking since ${fmtDMY(firstDay!)} · ${totalWord} all-time` +
      (archivedOn ? ` · archived ${fmtDMY(archivedOn)}` : "");
  const heat = empty
    ? null
    : input.archived
      ? "COLD"
      : input.measuresTime
        ? heatChip(sessions, today)
        : daysHeatChip(sessions, today);

  const masthead: SimpleModel["masthead"] = {
    name: input.name,
    heat,
    archived: input.archived,
    empty,
    sinceLive,
    tabs,
    activeKey: sel.kind === "all" ? "all" : sel.year,
  };

  // ── MEASURELESS: attendance + dayspark, nothing else ──
  if (flavor === "measureless") {
    const playedAll = playedDaySet(sessions);
    const cells = heatmapGrid<NonNullable<SimpleModel["attendance"]>["cells"][number]>(
      scopeTo,
      (day) => {
        const on = playedAll.has(day);
        return { day, on, tip: `${fmtDMY(day)} · ${on ? "logged" : "not logged"}` };
      },
      () => ({ day: null, on: false, tip: "" }),
      { from: isYear ? `${(sel as { year: string }).year}-01-01` : null },
    );

    const bestWk = best(sessScoped, "week", "days");
    const bestMo = best(sessScoped, "month", "days");
    const currentStreakTile: TileSpec = input.archived
      ? { label: "Current streak", value: "0", unit: "d", subtitle: "archived — streaks ended" }
      : streakTile(isYear ? "Last streak" : "Current streak", isYear ? lastRunOf(st) : st.currentRun, st, !isYear, null);
    const tiles: TileSpec[] = [
      currentStreakTile,
      streakTile("Longest streak", longestRunOf(st), st, false, null),
      { label: "Days logged", value: groupInt(daysActive), subtitle: `of ${groupInt(spanDays)} tracked` },
      {
        label: "Avg days / week",
        value: decimal1(weeks > 0 ? daysActive / weeks : 0),
        delta: vsYear(periodDelta(sessions, dFrom, dTo, "week", "days"), isYear, isYear ? sel.year : ""),
        subtitle: bestWk ? `best: ${bestWk.value} · ${bestWeekLabel(bestWk.key)}` : undefined,
      },
      {
        label: "Avg days / month",
        value: decimal1(months > 0 ? daysActive / months : 0),
        delta: vsYear(periodDelta(sessions, dFrom, dTo, "month", "days"), isYear, isYear ? sel.year : ""),
        subtitle: bestMo ? `best: ${bestMo.value} · ${fmtMonY(bestMo.key)}` : undefined,
      },
      {
        label: "Best month",
        value: bestMo ? `${bestMo.value}` : "—",
        unit: bestMo ? "d" : undefined,
        subtitle: bestMo ? fmtMonY(bestMo.key) : undefined,
      },
    ];

    // Days-per-period spark: All Time = one bar per tracked year · a pinned
    // year = 12 monthly bars. The zone never rearranges — only axis + delta.
    let bars: NonNullable<SimpleModel["dayspark"]>["bars"];
    let delta: DeltaChip | null = null;
    let deltaNote = "";
    if (!isYear) {
      const yearsAsc = [...years]; // `years` is built ascending and no longer mutated for the tabs
      bars = yearsAsc.map((y) => {
        const v = distinctDays(scoped(sessions, { from: `${y}-01-01`, to: `${y}-12-31` }));
        return { label: y, value: v, tip: `${y} · ${groupInt(v)} days` };
      });
      const curYear = yearKey(today);
      const prevYear = String(Number(curYear) - 1);
      const sameSpanEnd = dayFromIndex(dayIndex(`${prevYear}-01-01`) + dayGap(`${curYear}-01-01`, today));
      const cur = distinctDays(scoped(sessions, { from: `${curYear}-01-01`, to: today }));
      const prev = distinctDays(scoped(sessions, { from: `${prevYear}-01-01`, to: sameSpanEnd }));
      if (prev > 0 || cur > 0) {
        const d = cur - prev;
        delta = { text: `${d < 0 ? "▼" : "▲"} ${groupInt(Math.abs(d))} days`, down: d < 0 };
        deltaNote = "this year vs last";
      }
    } else {
      bars = MON.map((mo, i) => {
        const mk = `${sel.year}-${String(i + 1).padStart(2, "0")}`;
        const v = distinctDays(sessScoped.filter((s) => monthKey(s.day) === mk));
        return { label: MON_1[i], value: v, tip: `${mo} ${sel.year} · ${v > 0 ? `${v} days` : "—"}` };
      });
      const idx = lastMonthWithData(bars.map((b) => b.value));
      if (idx > 0 && bars[idx - 1].value > 0) {
        const d = bars[idx].value - bars[idx - 1].value;
        delta = { text: `${d < 0 ? "▼" : "▲"} ${groupInt(Math.abs(d))} days`, down: d < 0 };
        deltaNote = "this month vs last";
      }
    }
    const max = Math.max(1, ...bars.map((b) => b.value));

    return {
      colorVar,
      flavor,
      masthead,
      attendance: { cells, months: heatmapMonths(scopeTo, 53, isYear ? `${(sel as { year: string }).year}-01-01` : null), tiles },
      dayspark: { delta, deltaNote, bars, max },
      statRows: null,
      dist: null,
      trend: null,
      heatmap: null,
    };
  }

  // ── MEASURED + CATEGORICAL: the stat rows ──
  const unitCap = primary.noun.charAt(0).toUpperCase() + primary.noun.slice(1);
  const totPrimary = sessScoped.reduce((a, s) => a + primary.amountOf(s), 0);
  const bestDayA = bestAmount(sessScoped, "day", primary.amountOf);
  const bestWkA = bestAmount(sessScoped, "week", primary.amountOf);
  const bestMoA = bestAmount(sessScoped, "month", primary.amountOf);

  // Engagement — the categorical family trades both attendance-average tiles
  // for their per-value forms (Dashboard Composition, ruled 2026-07-17/18).
  const currentStreakTile: TileSpec = input.archived
    ? { label: "Current streak", value: "0", unit: "d", subtitle: "archived — streaks ended" }
    : streakTile(
        isYear ? "Last streak" : "Current streak",
        isYear ? lastRunOf(st) : st.currentRun,
        st,
        !isYear,
        valueOfRun,
      );
  const engagement: TileSpec[] = [
    currentStreakTile,
    streakTile("Longest streak", longestRunOf(st), st, false, valueOfRun),
    { label: "Days active", value: groupInt(daysActive), subtitle: `of ${groupInt(spanDays)} tracked` },
  ];
  if (catDef) {
    const lc = catDef.label.toLowerCase();
    const topByDays = [...aggScoped.entries()].sort((a, b) => b[1].days.size - a[1].days.size)[0] ?? null;
    engagement.push({
      label: `Avg days / ${lc}`,
      value: groupInt(usedInScope.length > 0 ? daysActive / usedInScope.length : 0),
      subtitle: topByDays ? `best: ${topByDays[0]} · ${groupInt(topByDays[1].days.size)}d` : undefined,
    });
    // Avg days/value/month: per month, distinct active days ÷ values used that
    // month, averaged over the window's months with data.
    const perMonthRatio = (f: string, t: string): number | null => {
      const rows = scoped(sessions, { from: f, to: t });
      const byMonth = new Map<string, { days: Set<string>; vals: Set<string> }>();
      for (const s of rows) {
        const v = valueBySession.get(s.id)?.[catDef.key];
        const mk = monthKey(s.day);
        const m = byMonth.get(mk) ?? byMonth.set(mk, { days: new Set(), vals: new Set() }).get(mk)!;
        m.days.add(s.day);
        if (v != null) m.vals.add(v);
      }
      const ratios = [...byMonth.values()]
        .filter((m) => m.vals.size > 0)
        .map((m) => m.days.size / m.vals.size);
      return ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
    };
    const bestMonthRatio = ((): { v: number; mk: string } | null => {
      const byMonth = new Map<string, { days: Set<string>; vals: Set<string> }>();
      for (const s of sessScoped) {
        const v = valueBySession.get(s.id)?.[catDef.key];
        const mk = monthKey(s.day);
        const m = byMonth.get(mk) ?? byMonth.set(mk, { days: new Set(), vals: new Set() }).get(mk)!;
        m.days.add(s.day);
        if (v != null) m.vals.add(v);
      }
      let out: { v: number; mk: string } | null = null;
      for (const [mk, m] of byMonth) {
        if (m.vals.size === 0) continue;
        const r = m.days.size / m.vals.size;
        if (!out || r > out.v) out = { v: r, mk };
      }
      return out;
    })();
    const ratioNow = perMonthRatio(scopeFrom, scopeTo);
    engagement.push({
      label: `Avg days / ${lc} / month`,
      value: ratioNow != null ? decimal1(ratioNow) : "—",
      delta: vsYear(statDelta(perMonthRatio, dFrom, dTo), isYear, isYear ? sel.year : ""),
      subtitle: bestMonthRatio ? `best: ${Math.round(bestMonthRatio.v)} · ${fmtMonY(bestMonthRatio.mk)}` : undefined,
    });
  } else {
    // Only this branch reads the attendance bests — derived here, not above
    // (the categorical branch never needs them).
    const bestWk = best(sessScoped, "week", "days");
    const bestMo = best(sessScoped, "month", "days");
    engagement.push(
      {
        label: "Avg days / week",
        value: decimal1(weeks > 0 ? daysActive / weeks : 0),
        delta: vsYear(periodDelta(sessions, dFrom, dTo, "week", "days"), isYear, isYear ? sel.year : ""),
        subtitle: bestWk ? `best: ${bestWk.value} · ${bestWeekLabel(bestWk.key)}` : undefined,
      },
      {
        label: "Avg days / month",
        value: decimal1(months > 0 ? daysActive / months : 0),
        delta: vsYear(periodDelta(sessions, dFrom, dTo, "month", "days"), isYear, isYear ? sel.year : ""),
        subtitle: bestMo ? `best: ${bestMo.value} · ${fmtMonY(bestMo.key)}` : undefined,
      },
    );
  }

  // Measure row — categorical flavor swaps the /week + /month averages for the
  // per-value pair (avg per value · top value by measure), the drawn Keyboard row.
  const isCount = primary.kind === "count";
  const totSplit = mSplit(totPrimary);
  const totalTile: TileSpec = {
    label: isCount ? `Total ${primary.noun}` : "Total hours",
    value: isCount ? totSplit.v : hoursWhole(totPrimary).replace(/h$/, ""),
    unit: isCount ? totSplit.u : "h",
    subtitle: catDef
      ? `across ${groupInt(usedInScope.length)} active ${catDef.label.toLowerCase()}s`
      : isCount
        ? `across ${groupInt(daysActive)} active days`
        : `across ${groupInt(sessScoped.length)} sessions`,
  };
  const avgActiveTile: TileSpec = {
    label: `Avg ${primary.noun} / active day`,
    value: isCount
      ? groupInt(daysActive > 0 ? totPrimary / daysActive : 0)
      : hoursMinutes(daysActive > 0 ? totPrimary / daysActive : 0),
    delta: vsYear(
      amountActiveDayDelta(sessions, primary.amountOf, dFrom, dTo, isCount ? intDeltaChip : perDayMinChip),
      isYear,
      isYear ? sel.year : "",
    ),
    subtitle: bestDayA ? `best: ${primary.fmt(bestDayA.value)} · ${fmtDMY(bestDayA.key)}` : undefined,
  };
  let measureTiles: TileSpec[];
  if (catDef) {
    const lc = catDef.label.toLowerCase();
    const ranked = [...aggScoped.entries()].sort((a, b) => b[1].amount - a[1].amount);
    const withAmount = ranked.filter(([, a]) => a.amount > 0);
    const topAmt = withAmount[0] ?? null;
    const lowAmt = withAmount[withAmount.length - 1] ?? null;
    measureTiles = [
      totalTile,
      {
        label: `Avg ${primary.noun} / ${lc}`,
        value: isCount
          ? kFmt(withAmount.length > 0 ? totPrimary / withAmount.length : 0)
          : hoursTrim1(withAmount.length > 0 ? totPrimary / withAmount.length : 0),
        subtitle:
          topAmt && lowAmt && topAmt !== lowAmt
            ? `${isCount ? kFmt(topAmt[1].amount) : hoursWhole(topAmt[1].amount)} top · ${isCount ? kFmt(lowAmt[1].amount) : hoursWhole(lowAmt[1].amount)} lowest`
            : undefined,
      },
      {
        label: `Top ${lc} by ${primary.noun}`,
        value: topAmt ? (isCount ? kFmt(topAmt[1].amount) : hoursWhole(topAmt[1].amount)) : "—",
        list: topAmt
          ? {
              dateLine: topAmt[0],
              rows: withAmount.slice(0, 4).map(([name, a]) => ({
                k: name,
                v: isCount ? kFmt(a.amount) : hoursWhole(a.amount),
              })),
            }
          : undefined,
      },
      avgActiveTile,
    ];
  } else {
    measureTiles = [
      totalTile,
      avgActiveTile,
      {
        label: `Avg ${primary.noun} / week`,
        value: isCount
          ? groupInt(weeks > 0 ? totPrimary / weeks : 0)
          : hoursTrim1(weeks > 0 ? totPrimary / weeks : 0).replace(/h$/, ""),
        unit: isCount ? undefined : "h",
        subtitle: bestWkA
          ? `best: ${isCount ? groupInt(bestWkA.value) : hoursMinutes(bestWkA.value)} · ${bestWeekLabel(bestWkA.key)}`
          : undefined,
      },
      {
        label: `Avg ${primary.noun} / month`,
        value: isCount
          ? groupInt(months > 0 ? totPrimary / months : 0)
          : hoursTrim1(months > 0 ? totPrimary / months : 0).replace(/h$/, ""),
        unit: isCount ? undefined : "h",
        delta: vsYear(
          periodDeltaBy(sessions, dFrom, dTo, "month", primary.amountOf, isCount ? intDeltaChip : hourRateChip),
          isYear,
          isYear ? sel.year : "",
        ),
        subtitle: bestMoA
          ? `best: ${isCount ? groupInt(bestMoA.value) : hoursWhole(bestMoA.value)} · ${fmtMonY(bestMoA.key)}`
          : undefined,
      },
    ];
  }

  const statRows: NonNullable<SimpleModel["statRows"]> = [
    { label: "Engagement", tall: true, tiles: engagement },
    { label: isCount ? unitCap : "Time", tiles: measureTiles },
  ];

  // Categorical-metrics row (values tracked · current value · top by days ·
  // avg unique per month) — the drawn Boards row, worded off the def's label.
  if (catDef) {
    const lc = catDef.label.toLowerCase();
    const tracked = valueOrder.length;
    // In-use share: the scope year's used values (All Time reads the current year).
    const shareYear = isYear ? sel.year : yearKey(today);
    const usedShareYear = new Set<string>();
    for (const s of scoped(sessions, { from: `${shareYear}-01-01`, to: `${shareYear}-12-31` })) {
      const v = valueBySession.get(s.id)?.[catDef.key];
      if (v != null) usedShareYear.add(v);
    }
    const share = tracked > 0 ? Math.round((usedShareYear.size / tracked) * 100) : 0;

    // Current value + the last-three list ("since"/"to" months).
    const lastUsed = new Map<string, string>();
    for (const s of sessScoped) {
      const v = valueBySession.get(s.id)?.[catDef.key];
      if (v == null) continue;
      const prev = lastUsed.get(v);
      if (prev == null || s.day > prev) lastUsed.set(v, s.day);
    }
    const byLastUsed = [...lastUsed.entries()].sort((a, b) => b[1].localeCompare(a[1]));
    const currentVal = byLastUsed[0] ?? null;
    let sinceDay: string | null = null;
    if (currentVal) {
      const lastOther = byLastUsed.length > 1 ? byLastUsed[1][1] : null;
      const ownDays = sessScoped
        .filter((s) => valueBySession.get(s.id)?.[catDef.key] === currentVal[0])
        .map((s) => s.day)
        .sort();
      sinceDay = lastOther == null ? ownDays[0] ?? null : ownDays.find((d) => d > lastOther) ?? currentVal[1];
    }
    const topByDays = [...aggScoped.entries()].sort((a, b) => b[1].days.size - a[1].days.size);

    // Avg unique values per month + the peak month.
    const uniqByMonth = new Map<string, Set<string>>();
    for (const s of sessScoped) {
      const v = valueBySession.get(s.id)?.[catDef.key];
      if (v == null) continue;
      const mk = monthKey(s.day);
      (uniqByMonth.get(mk) ?? uniqByMonth.set(mk, new Set()).get(mk)!).add(v);
    }
    const uniqCounts = [...uniqByMonth.entries()];
    const avgUniq =
      uniqCounts.length > 0 ? uniqCounts.reduce((a, [, s]) => a + s.size, 0) / uniqCounts.length : 0;
    const peak = uniqCounts.sort((a, b) => b[1].size - a[1].size)[0] ?? null;

    const capLabel = catDef.label.charAt(0).toUpperCase() + catDef.label.slice(1);
    statRows.push({
      label: `${capLabel}s`,
      tiles: [
        {
          label: `${capLabel}s tracked`,
          value: `${tracked}`,
          subtitle: `in use this year: ${usedShareYear.size} of ${tracked} · ${share}%`,
        },
        {
          label: `Current ${lc}`,
          value: currentVal?.[0] ?? "—",
          big: true,
          list: currentVal
            ? {
                dateLine: sinceDay ? `since ${fmtMonY(monthKey(sinceDay))}` : "—",
                rows: byLastUsed.slice(1, 4).map(([name, d]) => ({ k: name, v: `to ${fmtMonY(monthKey(d))}` })),
              }
            : undefined,
        },
        {
          label: `Top ${lc} by days`,
          value: topByDays[0] ? `${groupInt(topByDays[0][1].days.size)}` : "—",
          unit: topByDays[0] ? "d" : undefined,
          list: topByDays[0]
            ? {
                dateLine: topByDays[0][0],
                rows: topByDays.slice(0, 4).map(([name, a]) => ({ k: name, v: `${groupInt(a.days.size)}d` })),
              }
            : undefined,
        },
        {
          label: `Avg unique ${lc}s / month`,
          value: decimal1(avgUniq),
          subtitle: peak ? `peak ${peak[1].size} · ${fmtMonY(peak[0])}` : undefined,
        },
      ],
    });
  }

  // ── Distribution (categorical): TWO always-visible panels — Days hbars +
  //    <measure> vbars, orientation distinguishing the amounts (as drawn) ──
  let dist: SimpleModel["dist"] = null;
  if (catDef) {
    const rows = [...aggScoped.entries()].map(([name, a]) => ({
      name,
      colorVar: slotOf.get(name) ?? "--cat-1",
      days: a.days.size,
      amount: a.amount,
      retired: !vocabSet.has(name),
    }));
    if (rows.length >= 2) {
      const daysRanked = [...rows].sort((a, b) => b.days - a.days);
      const daysMax = daysRanked[0]?.days || 1;
      const hbars: ShapeChart = {
        kind: "hbars",
        rows: daysRanked.map((r) => ({
          label: r.name,
          value: groupInt(r.days),
          pct: (r.days / daysMax) * 100,
          colorVar: r.colorVar,
          tip: `${r.name} · ${groupInt(r.days)} days${r.retired ? " (retired)" : ""}`,
        })),
      };
      const amtRanked = [...rows].sort((a, b) => b.amount - a.amount);
      const amtMax = amtRanked[0]?.amount || 1;
      const vbars: ShapeChart = {
        kind: "vbars",
        cols: amtRanked.map((r) => ({
          label: r.name,
          value: isCount ? kFmt(r.amount) : hoursWhole(r.amount),
          pct: (r.amount / amtMax) * 100,
          colorVar: r.colorVar,
          tip: `${r.name} · ${isCount ? `${groupInt(r.amount)} ${primary.noun}` : hoursWhole(r.amount)}${r.retired ? " (retired)" : ""}`,
        })),
      };
      const panels: DistPanelSpec[] = [
        { title: "Days", tabs: null, initial: "days", charts: { days: hbars } },
        {
          title: isCount ? unitCap : "Time",
          tabs: null,
          initial: isCount ? "count" : "time",
          charts: isCount ? { count: vbars } : { time: vbars },
        },
      ];
      dist = { title: `By ${catDef.label.toLowerCase()}`, panels };
    }
  }

  // ── Trend (scope-following window · week grain under a pinned year) ──
  const dayAmtAll = primary.dayAmounts(sessions);
  const trendEnd = scopeTo;
  const { buckets, xticks, windowLabel, grainNoun } = buildTrendWindow(isYear ? sel.year : "", isYear, trendEnd);
  const sumOf = (m: Map<string, number>, days: string[]) => days.reduce((a, d) => a + (m.get(d) ?? 0), 0);
  const div = isCount ? 1 : 60;
  const series: TrendSeries[] = [
    {
      key: "primary",
      label: isCount ? unitCap : "Time",
      caption: `${windowLabel} · ${isCount ? primary.noun : "hours"} / ${grainNoun}`,
      unit: isCount ? "" : "h",
      kind: "line",
      line: buckets.map((b) => sumOf(dayAmtAll, b) / div),
    },
  ];
  if (catDef) {
    const perValue = new Map<string, Map<string, number>>();
    for (const s of sessions) {
      const v = valueBySession.get(s.id)?.[catDef.key];
      if (v == null) continue;
      const amount = primary.amountOf(s) / div;
      if (amount === 0) continue;
      const byDay = perValue.get(v) ?? perValue.set(v, new Map()).get(v)!;
      byDay.set(s.day, (byDay.get(s.day) ?? 0) + amount);
    }
    series.push({
      key: `stack-${catDef.key}`,
      label: `Stacked by ${catDef.label.toLowerCase()}`,
      caption: `${windowLabel} · ${isCount ? primary.noun : "hours"} / ${grainNoun}, stacked by ${catDef.label.toLowerCase()}`,
      unit: isCount ? "" : "h",
      kind: "stacked",
      bands: valueOrder
        .filter((v) => perValue.has(v))
        .map((v) => ({
          name: v,
          colorVar: slotOf.get(v) ?? "--cat-1",
          values: buckets.map((b) => b.reduce((a, day) => a + (perValue.get(v)!.get(day) ?? 0), 0)),
        })),
    });
  }

  const sparkYear = isYear ? sel.year : yearKey(today);
  const sparkUnit = isCount ? ` ${primary.abbr}` : " h";
  const spark = monthlySpark(dayAmtAll, sparkYear, div).map((s) => ({
    label: s.label,
    value: s.value,
    monthVar: s.monthVar,
    tip: `${s.month} ${sparkYear} · ${s.value > 0 ? `${groupInt(s.value)}${sparkUnit}` : "—"}`,
  }));
  const sparkMax = Math.max(1, ...spark.map((s) => s.value));
  const nowMonthIdx = isYear ? lastMonthWithData(spark.map((s) => s.value)) : Number(today.slice(5, 7)) - 1;
  const windowEmpty = buckets.every((b) => sumOf(dayAmtAll, b) === 0);
  const archivedEmpty = archivedEmptyMessage(input.archived, windowEmpty, isYear, isYear ? sel.year : "", archivedOn);
  const trend: CreationModel["trend"] = {
    series,
    xticks,
    sparkTitle: `${isCount ? unitCap : "Hours"} by month · ${sparkYear}`,
    sparkDelta: input.archived
      ? null
      : isYear
        ? yearOverYearDelta(dayAmtAll, sel.year, trendEnd, div)
        : monthOverMonth(spark.map((s) => s.value), nowMonthIdx),
    spark,
    sparkMax,
    archivedEmpty,
  };

  // ── Heatmap (measure intensity; per-value filter select when categorical) ──
  // Count intensity buckets are data-relative (quartiles of nonzero daily
  // amounts) — canonical minute cutoffs only exist for time.
  const nonzero = [...dayAmtAll.values()].filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p: number) => nonzero[Math.min(nonzero.length - 1, Math.floor(p * nonzero.length))] ?? 1;
  const cutoffs = [q(0.25), q(0.5), q(0.75)];
  const levelOf = (v: number): number =>
    !isCount
      ? heatLevel(v)
      : v <= 0
        ? 0
        : v < cutoffs[0]
          ? 1
          : v < cutoffs[1]
            ? 2
            : v < cutoffs[2]
              ? 3
              : 4;
  const hcells = heatmapGrid<NonNullable<SimpleModel["heatmap"]>["cells"][number]>(
    trendEnd,
    (day) => {
      const amt = dayAmtAll.get(day) ?? 0;
      const v = dominantByDay.get(day) ?? null;
      return {
        day,
        level: levelOf(amt),
        value: v,
        tip:
          amt > 0
            ? `${fmtDMY(day)} · ${primary.fmtLong(amt)}${v ? ` · ${v}` : ""}`
            : `${fmtDMY(day)} · no session`,
      };
    },
    () => ({ day: null, level: -1, value: null, tip: "" }),
    { from: isYear ? `${sel.year}-01-01` : null },
  );
  const recDay = bestAmount(sessions, "day", primary.amountOf);
  const recWk = bestAmount(sessions, "week", primary.amountOf);
  const recMo = bestAmount(sessions, "month", primary.amountOf);
  const trio: TileSpec[] = [
    {
      label: "Best day",
      value: recDay ? primary.fmt(recDay.value) : "—",
      subtitle: recDay ? fmtDMY(recDay.key) : undefined,
    },
    {
      label: "Best week",
      value: recWk ? (isCount ? kFmt(recWk.value) : hoursWhole(recWk.value)) : "—",
      subtitle: recWk ? `wk of ${fmtDMY(recWk.key)}` : undefined,
    },
    {
      label: "Best month",
      value: recMo ? (isCount ? kFmt(recMo.value) : hoursWhole(recMo.value)) : "—",
      subtitle: recMo ? fmtMonY(recMo.key) : undefined,
    },
  ];
  const heatmap: SimpleModel["heatmap"] = {
    filterLabel: catDef?.label ?? null,
    options: catDef
      ? [
          { value: "", label: `All ${catDef.label.toLowerCase()}s` },
          ...valueOrder.map((v) => ({ value: v, label: vocabSet.has(v) ? v : `${v} · retired` })),
        ]
      : [],
    cells: hcells,
    months: heatmapMonths(trendEnd, 53, isYear ? `${sel.year}-01-01` : null),
    trio,
  };

  return {
    colorVar,
    flavor,
    masthead,
    attendance: null,
    dayspark: null,
    statRows,
    dist,
    trend,
    heatmap,
  };
}
