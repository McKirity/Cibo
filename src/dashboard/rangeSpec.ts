/**
 * The range habit-dashboard **composition spec** (Dashboard Composition §
 * Simple + range; frozen reference `sleep-stats.html` — canon's sole range
 * habit). The simple chassis PLUS the range chart family, the one new content
 * tier: a range stat row (avg duration · avg bedtime as a CIRCULAR MEAN · avg
 * wake · best · shortest) · the bed & wake dual band over a night-centric
 * time-of-day axis · the duration line with the 8-hour reference band
 * (INFORMATION, not a target) · one flag panel per declared flag
 * (definition-minted: stored flags + the habit's derived_rules) · the duration
 * heatmap. The range charts are ruled Sleep-only screen composition — not kit
 * blocks — but everything here still derives off the declarations.
 *
 * Owning-day rule (data, not zones): a range session's owning day = its END
 * date; duration = end − start.
 */
import {
  daysHeatChip,
  heatmapGrid,
  heatmapMonths,
  scoped,
  type HeatChip,
  type SessionRow,
} from "../metrics/shapes";
import { clockMinutes, circularMeanMinutes, durationMinutes, fmtHM } from "../metrics/clockMath";
import { monthKey } from "../metrics/dates";
import { fmtDMY, groupInt, MONTHS_SHORT, type DeltaChip } from "../metrics/format";
import { MON_1, resolveScopeWindow, yearTabs } from "./specShared";
import type { TileSpec } from "./consumptionSpec";
import type { ScopeSel } from "./creationSpec";
import type { DerivedRule } from "../db/schema";

// ── Input ─────────────────────────────────────────────────────────────────────

/** A range session row — start/end local datetimes ride along. */
export interface RangeSessionRow extends SessionRow {
  start: string | null;
  end: string | null;
}

/**
 * The unit a range habit is counted in. The range family is ruled Sleep-only
 * screen composition, so this is a constant rather than a dial — but it is
 * named once because the flag panels' subtitles are built from it.
 */
const NIGHTS = "nights";

/** One declared flag definition (data_type "flag" — Sleep's `med`). */
export interface FlagDef {
  key: string;
  label: string;
}

export interface RangeBuildInput {
  habitKey: string;
  colourSlot: string;
  name: string;
  archived: boolean;
  sessions: RangeSessionRow[];
  today: string;
  flagDefs: FlagDef[];
  /** sessionId → { defKey → "true"/"false" } for flag answers. */
  flagBySession: Map<string, Record<string, string>>;
  derivedRules: DerivedRule[];
}

// ── Model ─────────────────────────────────────────────────────────────────────

export interface RangeChartMonth {
  label: string; // "J" … "D"
  name: string; // "Jan 2026"
  bed: { e: number; a: number; l: number } | null; // decimal clock hours
  wake: { e: number; a: number; l: number } | null;
  durationH: number | null; // avg hours that month
}

export interface FlagPanelSpec {
  name: string;
  meta: string;
  days: number;
  pct: number;
  tip: string;
}

export interface RangeModel {
  colorVar: string;
  /**
   * NO `archived` FIELD, DELIBERATELY (user-ruled 2026-08-04: "leave it bare").
   * The range template is the one habit dashboard that wears no archived
   * marker — Shell's shared `.archband` excludes it by construction, and the
   * simple/creation `.archchip` is not adopted here. The flag was computed and
   * never rendered until this ruling; it is now simply not produced. Do not
   * re-flag the absence as a gap. `input.archived` still feeds the COLD heat
   * chip below, which is a different reading.
   */
  masthead: {
    name: string;
    heat: HeatChip | null;
    empty: boolean;
    sinceLive: string;
    tabs: { key: string; label: string }[];
    activeKey: string;
  };
  statRow: { label: string; tiles: TileSpec[] };
  charts: {
    months: RangeChartMonth[];
    avgBed: string; // "23:41"
    avgWake: string;
  };
  flags: { panels: FlagPanelSpec[]; noun: string };
  heatmap: {
    views: HeatView[];
    months: { col: number; label: string }[];
    trio: TileSpec[];
  };
}

/** One square. `level` -1 = outside the window (drawn hidden), 0 = no session. */
export interface HeatCell {
  day: string | null;
  level: number;
  tip: string;
}

/**
 * A heatmap readout. Duration is the founding one; every declared flag mints
 * another beside it (user-ruled 2026-08-07, "add an up before noon and med
 * view to the heatmaps") — definition-driven like the donuts, so a habit that
 * declares a third flag gets a third view with no code change.
 *
 * `ramp` is what the two kinds of view differ by: duration spends the full
 * four-step heat ramp, a flag has only yes/no and spends TWO levels — top for
 * met, lowest for not — leaving an unlogged night blank. Reading a binary
 * answer across four shades would invent precision the data does not have.
 */
export interface HeatView {
  key: string;
  label: string;
  ramp: boolean;
  cells: HeatCell[];
}

// ── Time helpers ──────────────────────────────────────────────────────────────
// clockMinutes · durationMinutes · fmtHM · circularMeanMinutes live in
// ../metrics/clockMath (this file's contracts named that module).

/** "7h 42m" with the hour ALWAYS present ("0h 45m") — the drawn night-duration
 *  face; deliberately not format's `hoursMinutes` (which drops a zero hour). */
export const fmtDur = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
};

/** Night-centric hours-since-18:00 (0..24) for the bed & wake chart axis. */
export const h18 = (clockHours: number): number => (((clockHours - 18) % 24) + 24) % 24;

// ── The builder ───────────────────────────────────────────────────────────────

export function buildRangeDashboard(input: RangeBuildInput, sel: ScopeSel): RangeModel {
  const { today } = input;
  const colorVar = `--${input.colourSlot}`;
  const sessions = input.sessions.filter((s) => s.start != null && s.end != null);

  const allDaysSorted = sessions.map((s) => s.day).sort();
  const firstDay = allDaysSorted[0] ?? null;
  const empty = firstDay == null;

  const isYear = sel.kind === "year";
  const { scopeFrom, scopeTo } = resolveScopeWindow(sel, firstDay, today, empty);
  const sessScoped = scoped(sessions, { from: scopeFrom, to: scopeTo }) as RangeSessionRow[];
  const nights = sessScoped.length;

  // ── Masthead ──
  const { tabs } = yearTabs(firstDay, today);
  // Nights-based heat: a nightly habit is judged by recent logging density
  // (the catalog's days-based chip — one range session per night by validity).
  const heat: HeatChip | null = empty
    ? null
    : input.archived
      ? "COLD"
      : daysHeatChip(sessions, today);
  const sinceLive = empty
    ? `Tracking since — · no nights logged yet`
    : `Tracking since ${fmtDMY(firstDay!)} · ${groupInt(sessions.length)} nights all-time`;

  // ── The range stat row ──
  const durs = sessScoped.map((s) => ({ day: s.day, min: durationMinutes(s) })).filter((d) => d.min > 0);
  const avgDur = durs.length > 0 ? durs.reduce((a, d) => a + d.min, 0) / durs.length : 0;
  const bedMean = circularMeanMinutes(sessScoped.map((s) => clockMinutes(s.start!)));
  const wakeMean = circularMeanMinutes(sessScoped.map((s) => clockMinutes(s.end!)));
  const bestN = durs.reduce<{ day: string; min: number } | null>((b, d) => (!b || d.min > b.min ? d : b), null);
  const shortN = durs.reduce<{ day: string; min: number } | null>((b, d) => (!b || d.min < b.min ? d : b), null);

  // Avg-duration YoY chip under a year scope (the drawn "▲ 9m" — minutes).
  let avgDelta: DeltaChip | undefined;
  if (isYear) {
    const prevYear = String(Number(sel.year) - 1);
    const prev = scoped(sessions, { from: `${prevYear}-01-01`, to: `${prevYear}-12-31` }) as RangeSessionRow[];
    const prevDurs = prev.map(durationMinutes).filter((m) => m > 0);
    if (prevDurs.length > 0 && durs.length > 0) {
      const d = avgDur - prevDurs.reduce((a, b) => a + b, 0) / prevDurs.length;
      avgDelta = {
        text: `${d < 0 ? "▼" : "▲"} ${Math.abs(Math.round(d))}m vs ${prevYear}`,
        down: d < 0,
      };
    }
  }

  const statRow: RangeModel["statRow"] = {
    label: "Range",
    tiles: [
      { label: "Avg duration", value: fmtDur(avgDur), delta: avgDelta },
      { label: "Avg bedtime", value: bedMean != null ? fmtHM(bedMean) : "—" },
      { label: "Avg wake", value: wakeMean != null ? fmtHM(wakeMean) : "—" },
      {
        label: "Best night",
        value: bestN ? fmtDur(bestN.min) : "—",
        subtitle: bestN ? fmtDMY(bestN.day) : undefined,
      },
      {
        label: "Shortest night",
        value: shortN ? fmtDur(shortN.min) : "—",
        subtitle: shortN ? fmtDMY(shortN.day) : undefined,
      },
    ],
  };

  // ── The two range charts: 12 monthly buckets, scope-following (a pinned
  //    year = its calendar months; All Time = the trailing 12 months) ──
  const monthKeys: string[] = [];
  if (isYear) {
    for (let i = 0; i < 12; i++) monthKeys.push(`${sel.year}-${String(i + 1).padStart(2, "0")}`);
  } else {
    const y = Number(today.slice(0, 4));
    const m = Number(today.slice(5, 7));
    for (let i = 11; i >= 0; i--) {
      const mm = m - i;
      const yy = y + Math.floor((mm - 1) / 12);
      const mmm = ((mm - 1 + 120) % 12) + 1;
      monthKeys.push(`${yy}-${String(mmm).padStart(2, "0")}`);
    }
  }
  const byMonth = new Map<string, RangeSessionRow[]>();
  for (const s of sessions) {
    const mk = monthKey(s.day);
    (byMonth.get(mk) ?? byMonth.set(mk, []).get(mk)!).push(s);
  }
  const bandOf = (mins: number[]): { e: number; a: number; l: number } | null => {
    if (mins.length === 0) return null;
    const mean = circularMeanMinutes(mins);
    if (mean == null) return null;
    // Extremes measured in night-centric space so "earliest" is honest across
    // the midnight wrap (23:10 is earlier than 00:40).
    const pos = mins.map((m) => h18(m / 60));
    const e = Math.min(...pos);
    const l = Math.max(...pos);
    return { e: (e + 18) % 24, a: mean / 60, l: (l + 18) % 24 };
  };
  const chartMonths: RangeChartMonth[] = monthKeys.map((mk) => {
    const rows = byMonth.get(mk) ?? [];
    const i = Number(mk.slice(5, 7)) - 1;
    const mDurs = rows.map(durationMinutes).filter((m) => m > 0);
    return {
      label: MON_1[i],
      name: `${MONTHS_SHORT[i]} ${mk.slice(0, 4)}`,
      bed: bandOf(rows.map((s) => clockMinutes(s.start!))),
      wake: bandOf(rows.map((s) => clockMinutes(s.end!))),
      durationH: mDurs.length > 0 ? mDurs.reduce((a, b) => a + b, 0) / mDurs.length / 60 : null,
    };
  });

  // ── Flag panels — one per declared flag: derived rules first, stored after ──
  //
  // Each panel now hands back the MATCHING SESSIONS rather than a bare count,
  // because the heatmap's flag views (2026-08-07) are built from the same
  // predicate. One evaluation, two readouts — the donut says how often, the
  // heatmap says which nights, and neither can drift from the other.
  const panels: FlagPanelSpec[] = [];
  const flagHitDays: { name: string; days: Set<string> }[] = [];
  const pushPanel = (name: string, meta: string, matched: RangeSessionRow[]) => {
    const days = matched.length;
    const pct = nights > 0 ? Math.round((days / nights) * 100) : 0;
    panels.push({
      name,
      meta,
      days,
      pct,
      tip: `${name} · ${groupInt(days)} of ${groupInt(nights)} nights (${pct}%)`,
    });
    flagHitDays.push({ name, days: new Set(matched.map((s) => s.day)) });
  };
  for (const rule of input.derivedRules) {
    if (rule.template === "duration" && rule.minutes != null) {
      const target = rule.minutes;
      const hit = sessScoped.filter((s) =>
        rule.op === "lte" ? durationMinutes(s) <= target : durationMinutes(s) >= target,
      );
      const hrs = `${Math.round(target / 60)}h`;
      pushPanel(
        rule.op === "lte" ? `Under ${hrs} nights` : `${hrs}+ nights`,
        `${hrs} or ${rule.op === "lte" ? "less" : "more"} · derived`,
        hit,
      );
    } else if (rule.template === "timeOfDay" && rule.time != null) {
      const [th, tm] = rule.time.split(":").map(Number);
      const target = th * 60 + tm;
      const endpointOf = (s: RangeSessionRow) => clockMinutes(rule.endpoint === "start" ? s.start! : s.end!);
      const hit = sessScoped.filter((s) =>
        rule.op === "after" ? endpointOf(s) > target : endpointOf(s) < target,
      );
      const verb = rule.endpoint === "start" ? "Down" : "Up";
      pushPanel(
        `${verb} ${rule.op === "after" ? "after" : "before"} ${rule.label}`,
        `the ${rule.label} check · derived`,
        hit,
      );
    }
  }
  // A stored flag's HEADER is its definition label and its subtitle is built
  // from the same string — "Took Medication" → "Nights I took medication"
  // (user-ruled 2026-08-07). The label is therefore authored as a completed
  // action, which is what makes one template read for every flag a habit ever
  // declares; nothing here knows which habit it is drawing, and the old
  // "the <label> flag" wording described the machinery rather than the night.
  for (const def of input.flagDefs) {
    const hit = sessScoped.filter((s) => input.flagBySession.get(s.id)?.[def.key] === "true");
    pushPanel(def.label, `${NIGHTS[0].toUpperCase()}${NIGHTS.slice(1)} I ${def.label.toLowerCase()}`, hit);
  }

  // ── Duration heatmap (53 weeks ending at the scope edge; drawn cutoffs
  //    6h/7h/8h) + the best/shortest/avg trio ──
  const durByDay = new Map<string, number>();
  for (const s of sessions) {
    const m = durationMinutes(s);
    if (m > 0) durByDay.set(s.day, (durByDay.get(s.day) ?? 0) + m);
  }
  const levelOf = (m: number): number => (m <= 0 ? 0 : m < 360 ? 1 : m < 420 ? 2 : m < 480 ? 3 : 4);
  const gridOf = (fill: (day: string) => HeatCell): HeatCell[] =>
    heatmapGrid<HeatCell>(scopeTo, fill, () => ({ day: null, level: -1, tip: "" }), {
      from: isYear ? `${sel.year}-01-01` : null,
    });
  // A night the habit was logged at all — the third state the flag views need,
  // since "did not take it" and "did not sleep here" must not draw the same.
  const loggedDays = new Set(sessScoped.map((s) => s.day));
  const views: HeatView[] = [
    {
      key: "duration",
      label: "Duration",
      ramp: true,
      cells: gridOf((day) => {
        const m = durByDay.get(day) ?? 0;
        return { day, level: levelOf(m), tip: `${fmtDMY(day)} · ${m > 0 ? fmtDur(m) : "not logged"}` };
      }),
    },
    ...flagHitDays.map((f) => ({
      key: f.name,
      label: f.name,
      ramp: false,
      cells: gridOf((day) => {
        if (!loggedDays.has(day)) return { day, level: 0, tip: `${fmtDMY(day)} · not logged` };
        const on = f.days.has(day);
        return { day, level: on ? 4 : 1, tip: `${fmtDMY(day)} · ${f.name}: ${on ? "yes" : "no"}` };
      }),
    })),
  ];
  const allDurs = sessions.map((s) => ({ day: s.day, min: durationMinutes(s) })).filter((d) => d.min > 0);
  const allBest = allDurs.reduce<{ day: string; min: number } | null>((b, d) => (!b || d.min > b.min ? d : b), null);
  const allShort = allDurs.reduce<{ day: string; min: number } | null>((b, d) => (!b || d.min < b.min ? d : b), null);
  const allAvg = allDurs.length > 0 ? allDurs.reduce((a, d) => a + d.min, 0) / allDurs.length : 0;
  const trio: TileSpec[] = [
    { label: "Best night", value: allBest ? fmtDur(allBest.min) : "—", subtitle: allBest ? fmtDMY(allBest.day) : undefined },
    { label: "Shortest night", value: allShort ? fmtDur(allShort.min) : "—", subtitle: allShort ? fmtDMY(allShort.day) : undefined },
    { label: "Avg night", value: allDurs.length > 0 ? fmtDur(allAvg) : "—", subtitle: `across ${groupInt(allDurs.length)} nights` },
  ];

  return {
    colorVar,
    masthead: {
      name: input.name,
      heat,
      empty,
      sinceLive,
      tabs,
      activeKey: sel.kind === "all" ? "all" : sel.year,
    },
    statRow,
    charts: {
      // The stat row's circular means, reused — the legend and the tiles read
      // the same scoped population (this was computed twice under misleading
      // "…All" names).
      months: chartMonths,
      avgBed: bedMean != null ? fmtHM(bedMean) : "—",
      avgWake: wakeMean != null ? fmtHM(wakeMean) : "—",
    },
    flags: { panels, noun: NIGHTS },
    heatmap: { views, months: heatmapMonths(scopeTo), trio },
  };
}
