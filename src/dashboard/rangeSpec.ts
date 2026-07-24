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
import { heatmapMonths, scoped, type HeatChip, type SessionRow } from "../metrics/shapes";
import { dayFromIndex, dayIndex, monthKey, weekStart, yearKey } from "../metrics/dates";
import { fmtDMY, groupInt, type DeltaChip } from "../metrics/format";
import type { TileSpec } from "./consumptionSpec";
import type { ScopeSel } from "./creationSpec";
import type { DerivedRule } from "../db/schema";

// ── Input ─────────────────────────────────────────────────────────────────────

/** A range session row — start/end local datetimes ride along. */
export interface RangeSessionRow extends SessionRow {
  start: string | null;
  end: string | null;
}

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
  masthead: {
    name: string;
    heat: HeatChip | null;
    archived: boolean;
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
    cells: { day: string | null; level: number; tip: string }[];
    months: { col: number; label: string }[];
    trio: TileSpec[];
  };
}

// ── Time helpers ──────────────────────────────────────────────────────────────

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_1 = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

const maxStr = (a: string, b: string) => (a >= b ? a : b);
const minStr = (a: string, b: string) => (a <= b ? a : b);

/** Minutes since the epoch-agnostic midnight of a "YYYY-MM-DDTHH:MM[:SS]". */
const clockMinutes = (dt: string): number =>
  Number(dt.slice(11, 13)) * 60 + Number(dt.slice(14, 16));

/** Absolute minute index of a local datetime (day index × 1440 + clock). */
const absMinutes = (dt: string): number => dayIndex(dt.slice(0, 10)) * 1440 + clockMinutes(dt);

export const durationMinutes = (s: RangeSessionRow): number =>
  s.start != null && s.end != null ? Math.max(0, absMinutes(s.end) - absMinutes(s.start)) : 0;

export const fmtHM = (clockMin: number): string => {
  const m = ((Math.round(clockMin) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

export const fmtDur = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
};

/**
 * Circular mean of clock times in minutes (wraps midnight — 23:30 and 00:30
 * average to 00:00, never 12:00). Null when the list is empty.
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
  const base = firstDay ?? today;
  const scopeFrom = empty ? today : isYear ? maxStr(`${sel.year}-01-01`, base) : base;
  const scopeTo = isYear ? minStr(`${sel.year}-12-31`, today) : today;
  const sessScoped = scoped(sessions, { from: scopeFrom, to: scopeTo }) as RangeSessionRow[];
  const nights = sessScoped.length;

  // ── Masthead ──
  const years: string[] = [];
  if (!empty)
    for (let y = Number(yearKey(firstDay!)); y <= Number(yearKey(today)); y++) years.push(String(y));
  const tabs = [{ key: "all", label: "All Time" }, ...years.reverse().map((y) => ({ key: y, label: y }))];
  // Nights-based heat: a nightly habit is judged by recent logging density.
  const last14 = scoped(sessions, { from: dayFromIndex(dayIndex(today) - 13), to: today }).length;
  const heat: HeatChip | null = empty
    ? null
    : input.archived
      ? "COLD"
      : last14 >= 9
        ? "HOT"
        : last14 >= 4
          ? "WARM"
          : last14 >= 1
            ? "COOLING"
            : "COLD";
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
      name: `${MON[i]} ${mk.slice(0, 4)}`,
      bed: bandOf(rows.map((s) => clockMinutes(s.start!))),
      wake: bandOf(rows.map((s) => clockMinutes(s.end!))),
      durationH: mDurs.length > 0 ? mDurs.reduce((a, b) => a + b, 0) / mDurs.length / 60 : null,
    };
  });

  // ── Flag panels — one per declared flag: derived rules first, stored after ──
  const panels: FlagPanelSpec[] = [];
  const pushPanel = (name: string, meta: string, days: number) => {
    const pct = nights > 0 ? Math.round((days / nights) * 100) : 0;
    panels.push({
      name,
      meta,
      days,
      pct,
      tip: `${name} · ${groupInt(days)} of ${groupInt(nights)} nights (${pct}%)`,
    });
  };
  for (const rule of input.derivedRules) {
    if (rule.template === "duration" && rule.minutes != null) {
      const target = rule.minutes;
      const hit = sessScoped.filter((s) =>
        rule.op === "lte" ? durationMinutes(s) <= target : durationMinutes(s) >= target,
      ).length;
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
      ).length;
      const verb = rule.endpoint === "start" ? "Down" : "Up";
      pushPanel(
        `${verb} ${rule.op === "after" ? "after" : "before"} ${rule.label}`,
        `the ${rule.label} check · derived`,
        hit,
      );
    }
  }
  for (const def of input.flagDefs) {
    const hit = sessScoped.filter((s) => input.flagBySession.get(s.id)?.[def.key] === "true").length;
    pushPanel(def.label, `the ${def.label.toLowerCase()} flag`, hit);
  }

  // ── Duration heatmap (53 weeks ending at the scope edge; drawn cutoffs
  //    6h/7h/8h) + the best/shortest/avg trio ──
  const durByDay = new Map<string, number>();
  for (const s of sessions) {
    const m = durationMinutes(s);
    if (m > 0) durByDay.set(s.day, (durByDay.get(s.day) ?? 0) + m);
  }
  const levelOf = (m: number): number => (m <= 0 ? 0 : m < 360 ? 1 : m < 420 ? 2 : m < 480 ? 3 : 4);
  const weeks53 = 53;
  const startIdx = dayIndex(weekStart(scopeTo)) - (weeks53 - 1) * 7;
  const endIdx = dayIndex(scopeTo);
  const fromIdx = isYear ? dayIndex(`${sel.year}-01-01`) : -Infinity;
  const cells: RangeModel["heatmap"]["cells"] = [];
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < weeks53; col++) {
      const idx = startIdx + col * 7 + row;
      if (idx > endIdx || idx < fromIdx) {
        cells.push({ day: null, level: -1, tip: "" });
        continue;
      }
      const day = dayFromIndex(idx);
      const m = durByDay.get(day) ?? 0;
      cells.push({
        day,
        level: levelOf(m),
        tip: `${fmtDMY(day)} · ${m > 0 ? fmtDur(m) : "not logged"}`,
      });
    }
  }
  const allDurs = sessions.map((s) => ({ day: s.day, min: durationMinutes(s) })).filter((d) => d.min > 0);
  const allBest = allDurs.reduce<{ day: string; min: number } | null>((b, d) => (!b || d.min > b.min ? d : b), null);
  const allShort = allDurs.reduce<{ day: string; min: number } | null>((b, d) => (!b || d.min < b.min ? d : b), null);
  const allAvg = allDurs.length > 0 ? allDurs.reduce((a, d) => a + d.min, 0) / allDurs.length : 0;
  const trio: TileSpec[] = [
    { label: "Best night", value: allBest ? fmtDur(allBest.min) : "—", subtitle: allBest ? fmtDMY(allBest.day) : undefined },
    { label: "Shortest night", value: allShort ? fmtDur(allShort.min) : "—", subtitle: allShort ? fmtDMY(allShort.day) : undefined },
    { label: "Avg night", value: allDurs.length > 0 ? fmtDur(allAvg) : "—", subtitle: `across ${groupInt(allDurs.length)} nights` },
  ];

  const avgBedAll = circularMeanMinutes(sessScoped.map((s) => clockMinutes(s.start!)));
  const avgWakeAll = circularMeanMinutes(sessScoped.map((s) => clockMinutes(s.end!)));

  return {
    colorVar,
    masthead: {
      name: input.name,
      heat,
      archived: input.archived,
      empty,
      sinceLive,
      tabs,
      activeKey: sel.kind === "all" ? "all" : sel.year,
    },
    statRow,
    charts: {
      months: chartMonths,
      avgBed: avgBedAll != null ? fmtHM(avgBedAll) : "—",
      avgWake: avgWakeAll != null ? fmtHM(avgWakeAll) : "—",
    },
    flags: { panels, noun: "nights" },
    heatmap: { cells, months: heatmapMonths(scopeTo), trio },
  };
}
