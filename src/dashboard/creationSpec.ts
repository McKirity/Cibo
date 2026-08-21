/**
 * The creation habit-dashboard **composition spec** (Dashboard Composition —
 * the deep-tracker template; frozen references `writing-stats.html` +
 * `gamedev-stats.html`). Definition-driven, zero habit special-casing:
 *
 *  - measures mint the stat rows — time-only habits (Coding · Gamedev) get
 *    Engagement + Time; a duration+count habit (Writing) grows the count row
 *    AND the efficiency family automatically (user-ruled 2026-07-22: the
 *    efficiency row exists ONLY when a habit tracks more than one measure);
 *  - session categoricals mint the distribution panels, the stacked trend
 *    series, and the heatmap scopes;
 *  - "Days replaces Sessions" everywhere (writing records are day-granularity);
 *  - the archived state (Gamedev) is derived, never special-cased: the chip +
 *    since-suffix + streaks-ended tile + the honestly-empty trend come from the
 *    habit's `archived` flag and the data simply stopping.
 *
 * Efficiency floor: a day/week/month must carry ≥ 30 timed minutes to qualify
 * for the efficiency family (the FINAL's drawn floor, ratified at Build).
 */
import {
  best,
  bestAmount,
  dayMinutes,
  distinctDays,
  heatChip,
  HEATMAP_WEEKS,
  heatmapGrid,
  heatmapMonths,
  periodDelta,
  periodDeltaBy,
  playedDaySet,
  scoped,
  streaks,
  total,
  heatLevel,
  type HeatChip,
  type SessionRow,
} from "../metrics/shapes";
import { dayFromIndex, dayGap, dayIndex, yearKey } from "../metrics/dates";
import {
  decimal1,
  fmtDMY,
  fmtMonY,
  groupInt,
  hoursMinutes,
  hoursTrim1,
  hoursWhole,
  type DeltaChip,
} from "../metrics/format";
import type { TileSpec } from "./consumptionSpec";
import {
  activeDayDelta,
  archivedEmptyMessage,
  bestWeekLabel,
  buildTrendWindow,
  CAT_SLOTS,
  countAmountOf,
  dayCounts,
  grainKey,
  initialism,
  intDeltaChip,
  kFmt,
  lastMonthWithData,
  lastRunOf,
  longestRunOf,
  monthlySpark,
  monthOverMonth,
  resolveScopeWindow,
  STATUS_CAT,
  streakTile,
  vsYear,
  yearOverYearDelta,
  yearTabs,
} from "./specShared";

// ── Input row shapes ──────────────────────────────────────────────────────────

export interface CreationEntryRow {
  id: string;
  title: string;
  status: string | null;
  fandom: string | null;
  engine: string | null;
  /** The stored arc bookends (creation stores them; consumption derives). */
  started: string | null;
  completed: string | null;
  /** Banner ref — the masthead's art CYCLES through these (user-ruled
   *  2026-08-06: "just cycle through the banners chosen for entry" — the
   *  habit-level art is DERIVED from its entries, no habit column minted).
   *  It is ALSO the hero card's own background, per the FINAL. */
  banner: string | null;
  /** Cover ref — the hero card's cover column. */
  cover: string | null;
}

/** One session-scope picklist definition (writing_stage · gamedev_type · …). */
export interface SessionDef {
  key: string;
  label: string;
  vocab: string[];
}

export type ScopeSel = { kind: "all" } | { kind: "year"; year: string };

export interface CreationBuildInput {
  habitKey: string;
  colourSlot: string;
  name: string;
  archived: boolean;
  measuresCount: boolean;
  countUnit: string | null;
  sessions: SessionRow[];
  entries: CreationEntryRow[];
  finalized: Set<string>;
  today: string;
  defs: SessionDef[];
  valueBySession: Map<string, Record<string, string>>;
}

// ── Model types (the spec the renderer walks) ─────────────────────────────────

export type DistMetricKey = "days" | "count" | "time" | "rate";

export interface DistShapeRow {
  label: string;
  value: string;
  pct: number; // 0–100 of the shape's max/axis
  colorVar: string;
  tip: string;
}

/** One distribution chart in its metric's ruled shape (kit-bars-distribution,
 *  per-metric shape family): Days = ranked horizontal bars · count = vertical
 *  bars · Time = donut (legal: session categoricals are required-one-of
 *  single-valued, so hours partition) · rate = lollipop (rates don't sum). */
export type ShapeChart =
  /** `twoCol`: the rows flow down two balanced columns (user-ruled 2026-08-18
   *  for the simple categorical split — sole tenant; default stays one). */
  | { kind: "hbars"; rows: DistShapeRow[]; twoCol?: boolean }
  | { kind: "vbars"; cols: DistShapeRow[] }
  | {
      kind: "donut";
      totalValue: string;
      totalLabel: string;
      stops: { colorVar: string; from: number; to: number }[]; // % of the wheel
      legend: { label: string; colorVar: string; value: string; pct: number }[];
      tip: string;
    }
  | { kind: "lols"; rows: DistShapeRow[]; axisMaxLabel: string };

export interface DistPanelSpec {
  title: string;
  /** 4-way metric toggle (duration+count habits); null = a static single-shape panel. */
  tabs: { key: DistMetricKey; label: string }[] | null;
  initial: DistMetricKey;
  charts: Partial<Record<DistMetricKey, ShapeChart>>;
}

export interface TrendSeries {
  key: string;
  label: string;
  caption: string;
  /** y-axis suffix ("" for counts/rates, "h" for hours). */
  unit: string;
  kind: "line" | "dots" | "stacked";
  line?: number[]; // 30 values, oldest→newest
  bands?: { name: string; colorVar: string; values: number[] }[];
}

export interface HeroTile {
  v: string;
  u?: string;
  l: string;
}

export interface HeroSpec {
  /** The entry-dashboard door (chunk 5). */
  entryId: string;
  title: string;
  initial: string;
  /** The card's art refs (2026-08-06). `writing-stats.html`'s kit-card-hero
   *  contract: the BANNER *is* the card's background (masked dissolve, scrim
   *  under the text column), and `.hcover` is the same hatch+lettermark box the
   *  entry rail uses — so both take real art, the lettermark being the fallback
   *  and never the only face. Both were drawn before anything wrote a ref, so
   *  the card had painted its placeholder unconditionally until now. */
  cover: string | null;
  banner: string | null;
  pill: { label: string; colorVar: string } | null;
  /** The creation secondary field: Writing = Fandom, Gamedev = Engine, else absent. */
  secondary: { label: string; value: string } | null;
  cols: number; // hstats grid tracks (4 two-measure · 3 single)
  tiles: HeroTile[];
  sparks: { label: string; colorVar: string; values: number[]; flat: boolean }[];
  arc: {
    dotVar: string;
    started: string; // formatted, or "—"
    end:
      | { kind: "ongoing" }
      | { kind: "hiatus"; since: string }
      | { kind: "completed"; date: string };
  };
}

export interface CreationHeatCell {
  day: string | null; // null = future (hidden)
  levels: { time: number; count: number };
  /** Exact-value tooltips per measure ("2h 10m" / "1,240 w"). */
  exact: { time: string; count: string };
  /** Per-def dominant value for the By-<def> faces, per measure. */
  cats: Record<string, { time: { slot: string; name: string } | null; count: { slot: string; name: string } | null }>;
}

export interface CreationModel {
  colorVar: string;
  masthead: {
    name: string;
    heat: HeatChip | null;
    archived: boolean;
    empty: boolean;
    sinceLive: string;
    tabs: { key: string; label: string }[];
    activeKey: string;
  };
  statRows: { label: string; tall?: boolean; tiles: TileSpec[] }[];
  dist: { panelTitle: string; panels: DistPanelSpec[] } | null;
  trend: {
    series: TrendSeries[];
    xticks: { i: number; label: string }[];
    sparkTitle: string;
    sparkDelta: DeltaChip | null;
    spark: { label: string; value: number; monthVar: string; tip: string }[];
    sparkMax: number;
    archivedEmpty: string | null;
  };
  heatmap: {
    scopes: { key: string; label: string }[]; // "intensity" + one per def
    measures: { key: "count" | "time"; label: string }[] | null;
    cells: CreationHeatCell[];
    months: { col: number; label: string }[];
    /** The window's last day. The entry face re-derives its month strip from
     *  this after trimming the column count (dashboard/heatWeeks); the habit
     *  face ignores it and stays a full year. */
    end: string;
    legends: Record<string, { label: string; colorVar: string }[]>;
    trio: TileSpec[];
    measureNoun: { count: string; time: string };
  };
  heroes: { title: string; cards: HeroSpec[] };
}

// ── Local literals (CAT_SLOTS/STATUS_CAT/MON live in ./specShared) ────────────

/** The panel-title noun for the hero library (presentation vocab; the FINALs
 *  draw "Stories" for Writing, "Projects" for Gamedev). */
const HERO_NOUN: Record<string, { panel: string; noun: string }> = {
  writing: { panel: "Stories", noun: "stories" },
};
const heroNoun = (key: string) => HERO_NOUN[key] ?? { panel: "Projects", noun: "projects" };

/** The efficiency family's qualifying floor (drawn 30 m/day; ratified at Build). */
const EFF_FLOOR_MIN = 30;

/** A day's count-measure intensity bucket 0–4 (presentation cutoffs, the count
 *  sibling of `heatLevel`). */
const countLevel = (v: number): number =>
  v <= 0 ? 0 : v < 500 ? 1 : v < 1500 ? 2 : v < 3500 ? 3 : 4;

type Grain = "day" | "week" | "month";

/** The count best-bucket (`bestAmount` + `countAmountOf`, curried locally). */
const bestCount = (sessions: SessionRow[], grain: Grain) =>
  bestAmount(sessions, grain, countAmountOf);

// streakTile · longestRunOf · lastRunOf · vsYear · yearOverYearDelta ·
// activeDayDelta · lastMonthWithData · monthOverMonth all live in ./specShared;
// the count period delta is shapes' periodDeltaBy + countAmountOf/intDeltaChip.

// ── The builder ───────────────────────────────────────────────────────────────

export function buildCreationDashboard(input: CreationBuildInput, sel: ScopeSel): CreationModel {
  const { finalized, today, defs, valueBySession } = input;
  const colorVar = `--${input.colourSlot}`;
  const twoMeasure = input.measuresCount;
  const unitWord = input.countUnit ?? "count"; // "words"
  const unitAbbr = unitWord.slice(0, 1); // "w" — the drawn tile/axis abbreviation
  const noun = heroNoun(input.habitKey);

  const sessions = input.sessions;
  const entries = input.entries;

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

  // Delta window: trailing year for All Time, the scoped year for a year scope.
  const dFrom = isYear ? scopeFrom : dayFromIndex(dayIndex(today) - 364);
  const dTo = isYear ? scopeTo : today;

  // Per-session categorical lookup, split by def.
  const valOf = (sessionId: string, defKey: string): string | null =>
    valueBySession.get(sessionId)?.[defKey] ?? null;

  // ── Engagement row ──
  const bestWk = best(sessScoped, "week", "days");
  const bestMo = best(sessScoped, "month", "days");
  const currentStreakTile: TileSpec = input.archived
    ? { label: "Current streak", value: "0", unit: "d", subtitle: "archived — streaks ended" }
    : streakTile(isYear ? "Last streak" : "Current streak", isYear ? lastRunOf(st) : st.currentRun, st, !isYear);
  const engagement: TileSpec[] = [
    currentStreakTile,
    streakTile("Longest streak", longestRunOf(st), st, false),
    { label: "Total days active", value: groupInt(daysActive), subtitle: `of ${groupInt(spanDays)} tracked` },
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
  ];

  // ── Time row ──
  const totMin = total(sessScoped).minutes;
  const entryCount = new Set(sessScoped.map((s) => s.entry_fk).filter(Boolean)).size;
  const bestDayMin = best(sessScoped, "day", "minutes");
  const bestWkMin = best(sessScoped, "week", "minutes");
  const bestMoMin = best(sessScoped, "month", "minutes");
  const timeRow: TileSpec[] = [
    { label: "Total hours", value: hoursWhole(totMin).replace(/h$/, ""), unit: "h", subtitle: `across ${groupInt(entryCount)} ${noun.noun}` },
    {
      label: "Avg hours / active day",
      value: hoursMinutes(daysActive > 0 ? totMin / daysActive : 0),
      delta: vsYear(activeDayDelta(sessions, dFrom, dTo), isYear, isYear ? sel.year : ""),
      subtitle: bestDayMin ? `best: ${hoursMinutes(bestDayMin.value)} · ${fmtDMY(bestDayMin.key)}` : undefined,
    },
    {
      label: "Avg hours / week",
      value: hoursTrim1(weeks > 0 ? totMin / weeks : 0).replace(/h$/, ""),
      unit: "h",
      delta: vsYear(periodDelta(sessions, dFrom, dTo, "week", "minutes"), isYear, isYear ? sel.year : ""),
      subtitle: bestWkMin ? `best: ${hoursWhole(bestWkMin.value)} · ${bestWeekLabel(bestWkMin.key)}` : undefined,
    },
    {
      label: "Avg hours / month",
      value: hoursTrim1(months > 0 ? totMin / months : 0).replace(/h$/, ""),
      unit: "h",
      delta: vsYear(periodDelta(sessions, dFrom, dTo, "month", "minutes"), isYear, isYear ? sel.year : ""),
      subtitle: bestMoMin ? `best: ${hoursWhole(bestMoMin.value)} · ${fmtMonY(bestMoMin.key)}` : undefined,
    },
  ];

  const statRows: CreationModel["statRows"] = [
    { label: "Engagement", tall: true, tiles: engagement },
    { label: "Time", tiles: timeRow },
  ];

  // ── Count + efficiency rows (duration+count habits only — user-ruled) ──
  const totCount = sessScoped.reduce((a, s) => a + (s.measure_kind === "count" ? s.value ?? 0 : 0), 0);
  if (twoMeasure) {
    // Per-def count split for the total's subtitle ("271k stage · 209k wiki").
    const perDef = defs
      .map((d) => ({
        label: d.label.toLowerCase(),
        v: sessScoped.reduce(
          (a, s) => a + (s.measure_kind === "count" && valOf(s.id, d.key) != null ? s.value ?? 0 : 0),
          0,
        ),
      }))
      .filter((x) => x.v > 0);
    const bestDayC = bestCount(sessScoped, "day");
    const bestWkC = bestCount(sessScoped, "week");
    const bestMoC = bestCount(sessScoped, "month");
    const capUnit = unitWord.charAt(0).toUpperCase() + unitWord.slice(1); // "Words"
    statRows.push({
      label: capUnit,
      tiles: [
        {
          label: `Total ${unitWord}`,
          value: groupInt(totCount),
          subtitle: perDef.length >= 2 ? perDef.map((x) => `${kFmt(x.v)} ${x.label}`).join(" · ") : undefined,
        },
        {
          label: `Avg ${unitWord} / active day`,
          value: groupInt(daysActive > 0 ? totCount / daysActive : 0),
          subtitle: bestDayC ? `best: ${groupInt(bestDayC.value)} · ${fmtDMY(bestDayC.key)}` : undefined,
        },
        {
          label: `Avg ${unitWord} / week`,
          value: groupInt(weeks > 0 ? totCount / weeks : 0),
          delta: vsYear(
            periodDeltaBy(sessions, dFrom, dTo, "week", countAmountOf, intDeltaChip),
            isYear,
            isYear ? sel.year : "",
          ),
          subtitle: bestWkC ? `best: ${groupInt(bestWkC.value)} · ${bestWeekLabel(bestWkC.key)}` : undefined,
        },
        {
          label: `Avg ${unitWord} / month`,
          value: groupInt(months > 0 ? totCount / months : 0),
          delta: vsYear(
            periodDeltaBy(sessions, dFrom, dTo, "month", countAmountOf, intDeltaChip),
            isYear,
            isYear ? sel.year : "",
          ),
          subtitle: bestMoC ? `best: ${groupInt(bestMoC.value)} · ${fmtMonY(bestMoC.key)}` : undefined,
        },
      ],
    });

    // Efficiency (words/h) — qualified behind the ≥30-timed-minute floor.
    const dayMin = dayMinutes(sessScoped);
    const dayCnt = dayCounts(sessScoped);
    const effDays = [...dayMin.entries()].filter(([, m]) => m >= EFF_FLOOR_MIN).map(([d]) => d);
    const effWords = effDays.reduce((a, d) => a + (dayCnt.get(d) ?? 0), 0);
    const effHours = effDays.reduce((a, d) => a + (dayMin.get(d) ?? 0), 0) / 60;
    const bestEff = (grain: Grain): { key: string; rate: number } | null => {
      const min = new Map<string, number>();
      const cnt = new Map<string, number>();
      for (const [d, m] of dayMin) {
        const k = grainKey(d, grain);
        min.set(k, (min.get(k) ?? 0) + m);
        cnt.set(k, (cnt.get(k) ?? 0) + (dayCnt.get(d) ?? 0));
      }
      let out: { key: string; rate: number } | null = null;
      for (const [k, m] of min) {
        if (m < EFF_FLOOR_MIN) continue;
        const rate = (cnt.get(k) ?? 0) / (m / 60);
        if (!out || rate > out.rate) out = { key: k, rate };
      }
      return out;
    };
    const bd = bestEff("day");
    const bw = bestEff("week");
    const bm = bestEff("month");
    const rateUnit = `${unitAbbr}/h`;
    statRows.push({
      label: "Efficiency",
      tiles: [
        {
          label: "Avg efficiency",
          value: groupInt(effHours > 0 ? effWords / effHours : 0),
          unit: rateUnit,
          subtitle: `over ${groupInt(effDays.length)} days`,
        },
        { label: "Most efficient day", value: bd ? groupInt(bd.rate) : "—", unit: bd ? rateUnit : undefined, subtitle: bd ? fmtDMY(bd.key) : undefined },
        { label: "Most efficient week", value: bw ? groupInt(bw.rate) : "—", unit: bw ? rateUnit : undefined, subtitle: bw ? bestWeekLabel(bw.key) : undefined },
        { label: "Most efficient month", value: bm ? groupInt(bm.rate) : "—", unit: bm ? rateUnit : undefined, subtitle: bm ? fmtMonY(bm.key) : undefined },
      ],
    });
  }

  // ── Distributions ──
  // Per def, per metric: days = distinct tagged days · count = summed count
  // values · time = tagged hours · rate = count/hours. Slot colours cycle the
  // categorical palette in declared vocab order (the Build convention).
  const dist = buildDistributions(defs, sessScoped, valOf, twoMeasure, unitWord, unitAbbr);

  // ── Trends ──
  // SCOPE-FOLLOWING (user-ruled 2026-07-22, live iteration — "the original
  // scope is completely wrong"; overrides the FINALs' always-trailing window):
  // a pinned year windows the 30-day line to that year's tail and the heatmap
  // to that calendar year; All Time keeps today's trailing windows. The
  // records trio stays all-time (the explicitly-ruled exception).
  const dayMinAll = dayMinutes(sessions);
  const dayCntAll = dayCounts(sessions);
  const trendEnd = scopeTo; // today, or min(31 Dec of the pinned year, today)
  // Window buckets — All Time: trailing 30 days at DAY grain; a pinned year: the
  // whole year at WEEK grain with every-4th-week ISO ticks (the shared builder).
  const { buckets, xticks, windowLabel, grainNoun } = buildTrendWindow(isYear ? sel.year : "", isYear, trendEnd);
  const sumOf = (m: Map<string, number>, days: string[]) =>
    days.reduce((a, d) => a + (m.get(d) ?? 0), 0);
  const lineOf = (m: Map<string, number>, div = 1) => buckets.map((b) => sumOf(m, b) / div);
  const series: TrendSeries[] = [];
  if (twoMeasure) {
    series.push({
      key: "count",
      label: unitWord.charAt(0).toUpperCase() + unitWord.slice(1),
      caption: `${windowLabel} · ${unitWord} / ${grainNoun}`,
      unit: "",
      kind: "line",
      line: lineOf(dayCntAll),
    });
  }
  series.push({
    key: "time",
    label: "Time",
    caption: `${windowLabel} · hours / ${grainNoun}`,
    unit: "h",
    kind: "line",
    line: lineOf(dayMinAll, 60),
  });
  if (twoMeasure) {
    series.push({
      key: "eff",
      label: "Efficiency",
      caption: `${windowLabel} · ${unitWord} / hour${isYear ? " by week" : ""}`,
      unit: "",
      kind: "dots",
      // The ruled rider (2026-07-19): no-time buckets plot 0, not a gap. At
      // week grain the efficiency floor applies per bucket (≥30 timed min).
      line: buckets.map((b) => {
        const m = sumOf(dayMinAll, b);
        const ok = isYear ? m >= EFF_FLOOR_MIN : m > 0;
        return ok ? Math.round(sumOf(dayCntAll, b) / (m / 60)) : 0;
      }),
    });
  }
  // One stacked series per categorical, over the primary measure.
  for (const d of defs) {
    const slot = new Map(d.vocab.map((v, i) => [v, CAT_SLOTS[i % CAT_SLOTS.length]]));
    const perValue = new Map<string, Map<string, number>>(); // value → day → amount
    for (const s of sessions) {
      const v = valOf(s.id, d.key);
      if (v == null) continue;
      const amount = twoMeasure
        ? s.measure_kind === "count"
          ? s.value ?? 0
          : 0
        : s.measure_kind === "time"
          ? (s.value ?? 0) / 60
          : 0;
      if (amount === 0) continue;
      const byDay = perValue.get(v) ?? perValue.set(v, new Map()).get(v)!;
      byDay.set(s.day, (byDay.get(s.day) ?? 0) + amount);
    }
    series.push({
      key: `stack-${d.key}`,
      label: `Stacked by ${d.label}`,
      caption: `${windowLabel} · ${twoMeasure ? unitWord : "hours"} / ${grainNoun}, stacked by ${d.label.toLowerCase()}`,
      unit: twoMeasure ? "" : "h",
      kind: "stacked",
      bands: d.vocab
        .filter((v) => perValue.has(v))
        .map((v) => ({
          name: v,
          colorVar: slot.get(v) ?? "--cat-1",
          values: buckets.map((b) => b.reduce((a, day) => a + (perValue.get(v)!.get(day) ?? 0), 0)),
        })),
    });
  }

  const sparkYear = isYear ? sel.year : yearKey(today);
  const sparkSrc = twoMeasure ? dayCntAll : dayMinAll;
  const sparkDiv = twoMeasure ? 1 : 60;
  const sparkUnit = twoMeasure ? ` ${unitAbbr}` : " h";
  const spark = monthlySpark(sparkSrc, sparkYear, sparkDiv).map((s) => ({
    label: s.label,
    value: s.value,
    monthVar: s.monthVar,
    tip: `${s.month} ${sparkYear} · ${s.value > 0 ? `${groupInt(s.value)}${sparkUnit}` : "—"}`,
  }));
  const sparkMax = Math.max(1, ...spark.map((s) => s.value));
  const nowMonthIdx = isYear ? lastMonthWithData(spark.map((s) => s.value)) : Number(today.slice(5, 7)) - 1;
  const windowEmpty = buckets.every(
    (b) => sumOf(dayMinAll, b) === 0 && sumOf(dayCntAll, b) === 0,
  );
  const archivedEmpty = archivedEmptyMessage(input.archived, windowEmpty, isYear, isYear ? sel.year : "", archivedOn);

  // ── Heatmap (53 weeks ending at the scope's edge; cells outside a pinned
  //    year hidden; scope faces per def; measure faces when two) ──
  const heatmap = buildHeatmap(
    defs,
    sessions,
    valOf,
    trendEnd,
    isYear ? `${sel.year}-01-01` : null,
    twoMeasure,
    unitAbbr,
  );
  const bDayP = twoMeasure ? bestCount(sessions, "day") : best(sessions, "day", "minutes");
  const bWkP = twoMeasure ? bestCount(sessions, "week") : best(sessions, "week", "minutes");
  const bMoP = twoMeasure ? bestCount(sessions, "month") : best(sessions, "month", "minutes");
  const fmtP = (v: number) => (twoMeasure ? groupInt(v) : hoursMinutes(v));
  const trio: TileSpec[] = [
    { label: "Best day", value: bDayP ? fmtP(bDayP.value) : "—", unit: twoMeasure && bDayP ? unitAbbr : undefined, subtitle: bDayP ? fmtDMY(bDayP.key) : undefined },
    { label: "Best week", value: bWkP ? (twoMeasure ? groupInt(bWkP.value) : hoursWhole(bWkP.value)) : "—", unit: twoMeasure && bWkP ? unitAbbr : undefined, subtitle: bWkP ? `wk of ${fmtDMY(bWkP.key)}` : undefined },
    { label: "Best month", value: bMoP ? (twoMeasure ? groupInt(bMoP.value) : hoursWhole(bMoP.value)) : "—", unit: twoMeasure && bMoP ? unitAbbr : undefined, subtitle: bMoP ? fmtMonY(bMoP.key) : undefined },
  ];

  // ── Heroes (the library — identity, never year-scoped) ──
  const heroes = buildHeroes(entries, sessions, today, twoMeasure, unitWord, unitAbbr, colorVar);

  // ── Masthead ──
  const { tabs } = yearTabs(firstDay, today);
  const totalAll = twoMeasure
    ? `${groupInt(sessions.reduce((a, s) => a + (s.measure_kind === "count" ? s.value ?? 0 : 0), 0))} ${unitWord}`
    : hoursWhole(total(sessions).minutes);
  const entryTotal = entries.length;
  const sinceLive = empty
    ? `Tracking since — · no sessions logged yet`
    : `Tracking since ${fmtDMY(firstDay!)} · ${totalAll} all-time across ${groupInt(entryTotal)} ${noun.noun}` +
      (archivedOn ? ` · archived ${fmtDMY(archivedOn)}` : "");

  return {
    colorVar,
    masthead: {
      name: input.name,
      heat: empty ? null : input.archived ? "COLD" : heatChip(sessions, today),
      archived: input.archived,
      empty,
      sinceLive,
      tabs,
      activeKey: sel.kind === "all" ? "all" : sel.year,
    },
    statRows,
    dist,
    trend: {
      series,
      xticks,
      sparkTitle: `${twoMeasure ? unitWord.charAt(0).toUpperCase() + unitWord.slice(1) : "Hours"} by month · ${sparkYear}`,
      sparkDelta: input.archived
        ? null
        : isYear
          ? yearOverYearDelta(sparkSrc, sel.year, trendEnd, sparkDiv)
          : monthOverMonth(spark.map((s) => s.value), nowMonthIdx),
      spark,
      sparkMax,
      archivedEmpty,
    },
    heatmap: { ...heatmap, trio },
    heroes: { title: noun.panel, cards: heroes },
  };
}

// ── Zone builders ─────────────────────────────────────────────────────────────

/** Exported for the entry dashboard (chunk 5) — the same per-metric shape
 *  family renders the entry-scoped Stage⇄Wiki pair / Discipline mini-split. */
export function buildDistributions(
  defs: SessionDef[],
  sessScoped: SessionRow[],
  valOf: (sessionId: string, defKey: string) => string | null,
  twoMeasure: boolean,
  unitWord: string,
  unitAbbr: string,
): CreationModel["dist"] {
  if (defs.length === 0) return null;

  const chartsFor = (def: SessionDef): Partial<Record<DistMetricKey, ShapeChart>> => {
    const slot = new Map(def.vocab.map((v, i) => [v, CAT_SLOTS[i % CAT_SLOTS.length]]));
    interface Agg {
      days: Set<string>;
      count: number;
      minutes: number;
    }
    const agg = new Map<string, Agg>();
    for (const s of sessScoped) {
      const v = valOf(s.id, def.key);
      if (v == null) continue;
      const a = agg.get(v) ?? agg.set(v, { days: new Set(), count: 0, minutes: 0 }).get(v)!;
      a.days.add(s.day);
      if (s.measure_kind === "count") a.count += s.value ?? 0;
      if (s.measure_kind === "time") a.minutes += s.value ?? 0;
    }
    const rows = [...agg.entries()].map(([name, a]) => ({
      name,
      colorVar: slot.get(name) ?? "--cat-1",
      days: a.days.size,
      count: a.count,
      hours: a.minutes / 60,
      rate: a.minutes > 0 ? a.count / (a.minutes / 60) : 0,
    }));
    if (rows.length === 0) return {};

    const ranked = (metric: (r: (typeof rows)[number]) => number) =>
      [...rows].sort((a, b) => metric(b) - metric(a));

    const daysRows = ranked((r) => r.days);
    const daysMax = daysRows[0]?.days || 1;
    const hbars: ShapeChart = {
      kind: "hbars",
      rows: daysRows.map((r) => ({
        label: r.name,
        value: groupInt(r.days),
        pct: (r.days / daysMax) * 100,
        colorVar: r.colorVar,
        tip: `${r.name} · ${groupInt(r.days)} d`,
      })),
    };

    const timeRows = ranked((r) => r.hours).filter((r) => r.hours > 0);
    const totH = timeRows.reduce((a, r) => a + r.hours, 0);
    let acc = 0;
    const donut: ShapeChart = {
      kind: "donut",
      totalValue: `${groupInt(totH)} h`,
      totalLabel: `${def.label.toLowerCase()} total`,
      tip: `${def.label.toLowerCase()} time · ${groupInt(totH)} h total`,
      stops: timeRows.map((r) => {
        const from = acc;
        acc += totH > 0 ? (r.hours / totH) * 100 : 0;
        return { colorVar: r.colorVar, from, to: acc };
      }),
      legend: timeRows.map((r) => ({
        label: r.name,
        colorVar: r.colorVar,
        value: `${groupInt(r.hours)} h`,
        pct: totH > 0 ? Math.round((r.hours / totH) * 100) : 0,
      })),
    };

    const charts: Partial<Record<DistMetricKey, ShapeChart>> = { days: hbars, time: donut };
    if (twoMeasure) {
      const countRows = ranked((r) => r.count);
      const countMax = countRows[0]?.count || 1;
      charts.count = {
        kind: "vbars",
        cols: countRows.map((r) => ({
          label: r.name,
          value: groupInt(r.count),
          pct: (r.count / countMax) * 100,
          colorVar: r.colorVar,
          tip: `${r.name} · ${groupInt(r.count)} ${unitAbbr}`,
        })),
      };
      const rateRows = ranked((r) => r.rate);
      const axisMax = niceAxisMax(rateRows[0]?.rate ?? 0);
      charts.rate = {
        kind: "lols",
        rows: rateRows.map((r) => ({
          label: r.name,
          value: groupInt(r.rate),
          pct: Math.min(100, (r.rate / axisMax) * 100),
          colorVar: r.colorVar,
          tip: `${r.name} · ${groupInt(r.rate)} ${unitAbbr}/h`,
        })),
        axisMaxLabel: `${groupInt(axisMax)} ${unitAbbr}/h`,
      };
    }
    return charts;
  };

  if (twoMeasure) {
    // One toggling panel per categorical (the writing FINAL: By stage · By wiki,
    // each cycling Days · Words · Time · Words/h; initial faces differ so both
    // orientations are visible at rest).
    const capUnit = unitWord.charAt(0).toUpperCase() + unitWord.slice(1);
    const panels = defs
      .map((def): DistPanelSpec | null => {
        const charts = chartsFor(def);
        if (!charts.days || (charts.days.kind === "hbars" && charts.days.rows.length < 2)) return null;
        return {
          title: `By ${def.label}`,
          tabs: [
            { key: "days", label: "Days" },
            { key: "count", label: capUnit },
            { key: "time", label: "Time" },
            { key: "rate", label: `${unitWord.slice(0, 1).toUpperCase() + unitWord.slice(1, unitWord.length > 4 ? 5 : unitWord.length)}/h` },
          ],
          // Every panel opens on its FIRST tab (user-ruled 2026-07-22),
          // overriding the FINAL's differing initial faces (drawn so both bar
          // orientations showed at rest).
          initial: "days",
          charts,
        };
      })
      .filter((p): p is DistPanelSpec => p != null);
    return panels.length > 0 ? { panelTitle: "Distributions", panels } : null;
  }

  // Single-measure: ONE categorical zone, its two metric states drawn side by
  // side (the gamedev FINAL: Days bars ⇄ Time donut, no toggle).
  const def = defs[0];
  const charts = chartsFor(def);
  if (!charts.days || (charts.days.kind === "hbars" && charts.days.rows.length < 2)) return null;
  return {
    panelTitle: `By ${def.label}`,
    panels: [
      { title: "Days", tabs: null, initial: "days", charts: { days: charts.days } },
      { title: "Time", tabs: null, initial: "time", charts: { time: charts.time } },
    ],
  };
}

export { buildHeatmap as buildCreationHeatmap };

/** Round up to a clean lollipop axis MAX (1/2/5 × 10^k). NOT merged with
 *  entrySpec's `niceStep` (a tick STEP with a 2.5 rung) or CreationDashboard's
 *  `niceCeil` (hour-scale floor of 2) — the three serve different drawn axes
 *  and produce different values for the same input. */
function niceAxisMax(v: number): number {
  if (v <= 0) return 100;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (v <= m * pow) return m * pow;
  return 10 * pow;
}

/** Exported (as buildCreationHeatmap) for the entry dashboard (chunk 5) — the
 *  entry face passes defs=[] (no scope faces) + its own sessions, keeping the
 *  Words⇄Time measure toggle on two-measure habits. */
function buildHeatmap(
  defs: SessionDef[],
  sessions: SessionRow[],
  valOf: (sessionId: string, defKey: string) => string | null,
  end: string, // the window's last day (today, or the pinned year's clamped end)
  from: string | null, // hide cells before this day (a pinned year's Jan 1)
  twoMeasure: boolean,
  unitAbbr: string,
): Omit<CreationModel["heatmap"], "trio"> {
  const dayMin = dayMinutes(sessions);
  const dayCnt = dayCounts(sessions);

  // Per def · per day · per measure: the dominant vocab value.
  interface DayAgg {
    min: number;
    cnt: number;
  }
  const domSlot: Record<string, Map<string, { time: { slot: string; name: string } | null; count: { slot: string; name: string } | null }>> = {};
  const legends: CreationModel["heatmap"]["legends"] = {};
  for (const def of defs) {
    const slot = new Map(def.vocab.map((v, i) => [v, CAT_SLOTS[i % CAT_SLOTS.length]]));
    legends[def.key] = def.vocab.map((v) => ({ label: v, colorVar: slot.get(v) ?? "--cat-1" }));
    const perDay = new Map<string, Map<string, DayAgg>>();
    for (const s of sessions) {
      const v = valOf(s.id, def.key);
      if (v == null) continue;
      const byVal = perDay.get(s.day) ?? perDay.set(s.day, new Map()).get(s.day)!;
      const a = byVal.get(v) ?? byVal.set(v, { min: 0, cnt: 0 }).get(v)!;
      if (s.measure_kind === "time") a.min += s.value ?? 0;
      if (s.measure_kind === "count") a.cnt += s.value ?? 0;
    }
    const m = new Map<string, { time: { slot: string; name: string } | null; count: { slot: string; name: string } | null }>();
    for (const [day, byVal] of perDay) {
      let bT: { name: string; v: number } | null = null;
      let bC: { name: string; v: number } | null = null;
      for (const [name, a] of byVal) {
        if (a.min > (bT?.v ?? 0)) bT = { name, v: a.min };
        if (a.cnt > (bC?.v ?? 0)) bC = { name, v: a.cnt };
      }
      m.set(day, {
        time: bT ? { slot: slot.get(bT.name) ?? "--cat-1", name: bT.name } : null,
        count: bC ? { slot: slot.get(bC.name) ?? "--cat-1", name: bC.name } : null,
      });
    }
    domSlot[def.key] = m;
  }

  // 53×7 grid ending at the window edge (the shared catalog walk); cells past
  // the end OR before a pinned year's Jan 1 are hidden.
  const cells = heatmapGrid<CreationHeatCell>(
    end,
    (day) => {
      const min = dayMin.get(day) ?? 0;
      const cnt = dayCnt.get(day) ?? 0;
      const cats: CreationHeatCell["cats"] = {};
      for (const def of defs) cats[def.key] = domSlot[def.key].get(day) ?? { time: null, count: null };
      return {
        day,
        levels: { time: heatLevel(min), count: countLevel(cnt) },
        exact: {
          time: min > 0 ? hoursMinutes(min) : "no session",
          count: cnt > 0 ? `${groupInt(cnt)} ${unitAbbr}` : "no session",
        },
        cats,
      };
    },
    () => ({ day: null, levels: { time: -1, count: -1 }, exact: { time: "", count: "" }, cats: {} }),
    { from },
  );

  return {
    scopes: [{ key: "intensity", label: "Intensity" }, ...defs.map((d) => ({ key: d.key, label: `By ${d.label}` }))],
    measures: twoMeasure
      ? [
          { key: "count", label: "Words" },
          { key: "time", label: "Time" },
        ]
      : null,
    cells,
    months: heatmapMonths(end, HEATMAP_WEEKS, from),
    end,
    legends,
    measureNoun: { count: "words", time: "time" },
  };
}

function buildHeroes(
  entries: CreationEntryRow[],
  sessions: SessionRow[],
  today: string,
  twoMeasure: boolean,
  unitWord: string,
  unitAbbr: string,
  colorVar: string,
): HeroSpec[] {
  const byEntry = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    if (s.entry_fk == null) continue;
    (byEntry.get(s.entry_fk) ?? byEntry.set(s.entry_fk, []).get(s.entry_fk)!).push(s);
  }
  const last30 = Array.from({ length: 30 }, (_, i) => dayFromIndex(dayIndex(today) - 29 + i));

  const cards = entries.map((e): HeroSpec & { _sort: string } => {
    const ss = byEntry.get(e.id) ?? [];
    const min = total(ss).minutes;
    const cnt = ss.reduce((a, s) => a + (s.measure_kind === "count" ? s.value ?? 0 : 0), 0);
    const days = distinctDays(ss);
    const lastDay = ss.map((s) => s.day).sort()[ss.length - 1] ?? null;
    const dMin = dayMinutes(ss);
    const dCnt = dayCounts(ss);
    const lastLabel = lastDay == null ? "—" : lastDay === today ? "today" : fmtDMY(lastDay);

    const bestDayC = bestCount(ss, "day");
    const bestDayT = best(ss, "day", "minutes");
    const tiles: HeroTile[] = twoMeasure
      ? [
          { v: groupInt(cnt), l: `total ${unitWord}` },
          { v: groupInt(min / 60), u: "h", l: "total hours" },
          { v: groupInt(days), l: "days active" },
          { v: lastLabel, l: "last active" },
          { v: groupInt(days > 0 ? cnt / days : 0), l: `avg ${unitWord} / day` },
          { v: hoursMinutes(days > 0 ? min / days : 0), l: "avg hours / day" },
          { v: bestDayC ? groupInt(bestDayC.value) : "—", u: bestDayC ? unitAbbr : undefined, l: `best day (${unitWord})` },
          { v: bestDayT ? decimal1(bestDayT.value / 60) : "—", u: bestDayT ? "h" : undefined, l: "best day (hours)" },
        ]
      : [
          { v: groupInt(min / 60), u: "h", l: "total time" },
          { v: groupInt(days), l: "days active" },
          { v: lastLabel, l: "last worked" },
        ];

    const timeSpark = last30.map((d) => (dMin.get(d) ?? 0) / 60);
    const sparks: HeroSpec["sparks"] = [];
    if (twoMeasure) {
      const countSpark = last30.map((d) => dCnt.get(d) ?? 0);
      sparks.push({
        label: unitWord.charAt(0).toUpperCase() + unitWord.slice(1),
        colorVar,
        values: countSpark,
        flat: countSpark.every((v) => v === 0),
      });
      sparks.push({ label: "Time", colorVar: "--text-secondary", values: timeSpark, flat: timeSpark.every((v) => v === 0) });
    } else {
      sparks.push({ label: "Time", colorVar, values: timeSpark, flat: timeSpark.every((v) => v === 0) });
    }

    // Arc footer (stored bookends; Hiatus = the between-waves derived state).
    const started = e.started ? fmtDMY(e.started) : "—";
    let arc: HeroSpec["arc"];
    if (e.completed != null) {
      arc = { dotVar: "--cat-4", started, end: { kind: "completed", date: fmtDMY(e.completed) } };
    } else if (e.status === "Hiatus") {
      arc = { dotVar: "--text-muted", started, end: { kind: "hiatus", since: lastDay ? fmtDMY(lastDay) : "—" } };
    } else {
      arc = { dotVar: "--verdict-done", started, end: { kind: "ongoing" } };
    }

    return {
      entryId: e.id,
      title: e.title,
      initial: initialism(e.title),
      cover: e.cover,
      banner: e.banner,
      pill: e.status ? { label: e.status, colorVar: STATUS_CAT[e.status] ?? "--cat-1" } : null,
      secondary: e.fandom
        ? { label: "Fandom", value: e.fandom }
        : e.engine
          ? { label: "Engine", value: e.engine }
          : null,
      cols: twoMeasure ? 4 : 3,
      tiles,
      sparks,
      arc,
      _sort: lastDay ?? "",
    };
  });

  // Current-first, then most recently active (the ruled ordering).
  cards.sort((a, b) => {
    const ac = a.pill?.label === "Current" ? 0 : 1;
    const bc = b.pill?.label === "Current" ? 0 : 1;
    if (ac !== bc) return ac - bc;
    return b._sort.localeCompare(a._sort);
  });
  return cards.map(({ _sort, ...c }) => c);
}
