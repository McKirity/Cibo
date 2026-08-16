/**
 * The entry-dashboard **composition spec** (Build step 6 · chunk 5) — the fourth
 * and last dashboard cut. ONE builder serves both templates off the habit row:
 *
 *  - the consumption base (frozen `entry-dashboard-gaming.html`): identity rail
 *    (+ the shared edit mode) · conditional series strip · measure-grouped stat
 *    rows · the WAVE TIMELINE (the signature zone — the shape-10 catalog entry
 *    finally rendered) · trailing-53-week heatmap · the Year›Month day log;
 *  - the creation build-out (frozen `entry-dashboard-writing.html`): Fandom +
 *    arc bookends (the FINAL's rail BANNER band is deliberately NOT built —
 *    user-ruled 2026-08-06) · a words row with four-grain subtitle lists · the
 *    word-growth curve (milestone ladder + wave shading + bookend) · the
 *    story-vs-wiki pie · the Stage⇄Wiki distribution pair (reusing chunk 2's
 *    per-metric shape family) · Words⇄Time heatmap · the work-diary day log.
 *
 * Definition-driven, zero habit special-casing: sub_type + the declared measures
 * and session categoricals decide every delta, so a time-only creation entry
 * (Gamedev) falls out as the subtraction — no words/growth/pie, mini-split kept
 * as Discipline — with zero new code. Entry dashboards carry NO year scopes
 * (Dashboard Composition, the 2026-07-18 strip amendments).
 */
import {
  best,
  bestBucketBy,
  dayMinutes,
  distinctDays,
  erasForWaves,
  streaks,
  total,
  wavesForEntry,
  type SessionRow,
  type Wave,
} from "../metrics/shapes";
import { dayFromIndex, dayGap, dayIndex, monthKey, weekNum, weekStart, yearKey } from "../metrics/dates";
import {
  fmtDMY,
  fmtMonY,
  groupInt,
  hoursMinutes,
  hoursWhole,
  MONTHS_LONG,
  MONTHS_SHORT,
  stars,
} from "../metrics/format";
import type { TileSpec } from "./consumptionSpec";
import { CAT_SLOTS, dayCounts, initialism, longestRunOf, STATUS_CAT, streakTile } from "./specShared";
import {
  buildDistributions,
  buildCreationHeatmap,
  type CreationModel,
  type SessionDef,
} from "./creationSpec";

// ── Input ─────────────────────────────────────────────────────────────────────

export interface EntryIdentity {
  id: string;
  title: string;
  status: string | null;
  type: string | null;
  genre: string[];
  priority: number | null;
  rating: number | null;
  purchased: boolean | null;
  creators: string[];
  studios: string[];
  series: string | null;
  seriesOrder: number | null;
  description: string | null;
  source: string | null;
  externalId: string | null;
  fandom: string | null;
  engine: string | null;
  started: string | null;
  completed: string | null;
  /** Stored banner REFERENCE (root-relative) — re-added 2026-08-06 exactly as
   *  the 08-04 deletion note promised ("re-add it then"): the rail's real
   *  banner image, user-approved at the completion audit's fork pass. Null =
   *  the gradient stand-in, still a designed look. (Removed and restored again
   *  the same day — the Daily cover wall's creation banner TILE is a second
   *  consumer, and it is what makes the ref worth setting at all.) */
  banner: string | null;
  /** Stored cover REFERENCE (root-relative), null = the lettermark face. */
  cover: string | null;
}

/** A sibling entry (same habit) — the rating-context count + the series strip. */
export interface SiblingRow {
  id: string;
  title: string;
  status: string | null;
  rating: number | null;
  series: string | null;
  seriesOrder: number | null;
  // NO `type` (deleted 2026-08-04): `buildSeriesStrip` takes its noun from the
  // OWNING entry's type, never a sibling's, so this was mapped for nobody.
}

export interface EntryBuildInput {
  habitKey: string;
  habitName: string;
  colourSlot: string;
  subType: "consumption" | "creation";
  measuresCount: boolean;
  countUnit: string | null;
  /** Per-habit wave gap override (days); null = the global 30-day default. */
  waveGapDays: number | null;
  entry: EntryIdentity;
  sessions: SessionRow[]; // THIS entry's sessions only
  siblings: SiblingRow[];
  finalized: Set<string>;
  today: string;
  defs: SessionDef[];
  valueBySession: Map<string, Record<string, string>>;
}

// ── Model ─────────────────────────────────────────────────────────────────────

export interface RailFact {
  label: string;
  value: string;
  strong: boolean;
}

export interface RailSpec {
  /** The stored banner ref. The rail no longer DRAWS a banner (the band was
   *  removed 2026-08-06, user-ruled), but the rail's edit face is where a
   *  banner is SET — so the ref rides here for the replace path's old-file
   *  cleanup. Its display sites are the cover wall + the hero card. */
  bannerRef: string | null;
  coverLabel: string;
  /** The cover ref the rail paints over its lettermark box (step 8). */
  cover: string | null;
  eyebrow: { habit: string; type: string | null };
  title: string;
  byline: string | null;
  chips: string[];
  pill: { label: string; colorVar: string } | null;
  rating: { stars: string; value: string; context: string | null } | null;
  facts: RailFact[];
  description: string | null;
  provenance: string;
}

export interface SeriesStripSpec {
  title: string;
  note: string;
  prev: { entryId: string; title: string } | null;
  next: { entryId: string; title: string } | null;
}

/** One axis bucket with its day anchor + length — the lane's dayToX needs the
 *  calendar mapping, not just the value (the 2026-07-24 rework). */
export interface WaveBucket {
  v: number;
  s: string; // first day of the bucket
  len: number; // calendar days it covers
}

/** A wave's lane identity: its true number + span, drawn as a capsule. */
export interface LaneWave {
  n: number;
  start: string;
  end: string;
  days: number;
  tip: string;
}

export type WavePart =
  | { kind: "wave"; buckets: WaveBucket[]; waves: LaneWave[] }
  | { kind: "break"; label: string };

/** A chapter-track era span. Captions list eras PLAINLY — "Era N", no span or
 *  amount clauses (user-ruled 2026-07-24: the extra information threw off the
 *  labels; the figures live in the table). */
export interface EraSpan {
  n: number;
  start: string;
  end: string;
  waveNums: number[];
  label: string;
}

export interface WaveComp {
  label: string;
  segs: { pct: number; colorVar: string }[];
}

export interface TableFigs {
  days: string;
  amount: string;
  best: string;
  perDay: string;
}

/** The wave TABLE (ruled 2026-07-24 — replaces the card row; no blip fold:
 *  every wave gets a row, eras group + subtotal, interludes collapse into one
 *  expandable group row). */
export type WaveTableRow =
  | { kind: "era"; eraN: number; soloWave: number | null; waveNums: number[]; span: string; figs: TableFigs; comp: WaveComp | null }
  | { kind: "wave"; n: number; groupId: string | null; span: string; figs: TableFigs; comp: WaveComp | null }
  | { kind: "interludes"; groupId: string; count: number; waveNums: number[]; span: string; figs: TableFigs; comp: WaveComp | null };

export interface WavesSpec {
  count: number;
  countLabel: string; // "16 waves" — the standardized noun (user-ruled 2026-07-12)
  /** "3 eras · 9 interludes" — clauses dropped at zero (the era ruling); null when both are. */
  subLabel: string | null;
  parts: WavePart[];
  /** Bookend markers anchor to their TRUE day (2026-07-24 coherence pass —
   *  edge-pinning let the line drift from the data); the renderer flips the
   *  label geometrically when it nears the band edge. */
  markers: { day: string; label: string; colorVar: string }[];
  eras: EraSpan[];
  table: {
    amountHeader: string; // "Written" / "Played" / "Worked"
    perDayHeader: string; // "w / day" / "h / day"
    hasComp: boolean;
    rows: WaveTableRow[];
    foot: { left: string; span: string; figs: TableFigs };
  };
}

export interface GrowthSpec {
  /** Cumulative count points, x normalized 0–1 over the lifetime, y in units. */
  points: { x: number; y: number }[];
  vmax: number;
  /** The running total at the curve's end — labelled at the endpoint dot.
   *  LABEL ONLY (the `value` half was deleted 2026-08-04, unrendered). */
  total: { label: string };
  /** The computed even y-axis ticks. */
  rungs: { value: number; label: string }[];
  /** Accent dots where the curve crosses a rung. */
  crossings: { x: number; y: number }[];
  /** Wave spans (shaded) + inter-wave gaps (hatched), x-normalized. */
  shades: { x0: number; x1: number }[];
  hatches: { x0: number; x1: number }[];
  startedX: number | null;
}

export interface SplitSpec {
  slices: { label: string; value: string; pct: number; color: string }[];
}

export interface DayRowSpec {
  day: string;
  label: string; // "12 May 2026"
  val: string; // "5 h 10" / "900 w · 1 h 20"
  chips: string[];
  best: string | null; // "best day →" / "best words →" / "best time →"
}

export interface DayLogSpec {
  years: {
    label: string;
    sum: string;
    open: boolean;
    months: { label: string; sum: string; open: boolean; days: DayRowSpec[] }[];
  }[];
}

export interface EntryModel {
  colorVar: string;
  template: "consumption" | "creation";
  twoMeasure: boolean;
  rail: RailSpec;
  seriesStrip: SeriesStripSpec | null;
  statRows: { label: string; tall?: boolean; tiles: TileSpec[] }[];
  waves: WavesSpec;
  growth: GrowthSpec | null;
  split: SplitSpec | null;
  dist: CreationModel["dist"];
  heatmap: Omit<CreationModel["heatmap"], "trio">;
  daylog: DayLogSpec;
}

// ── Literals ──────────────────────────────────────────────────────────────────

/* (The rail-banner toggle — user-ruled 2026-07-23, "Build it, but I want the
 * option to disable it" — went with the band itself on 2026-08-06: the band is
 * gone unconditionally, so there is nothing left to toggle.) */

/** Presentation vocab for the story-vs-wiki pie (the 2026-07-18 in-canvas
 *  ruling: the labels read Novel / Wiki) — keyed by def key like HERO_NOUN;
 *  unknown defs fall back to their own label. */
const SPLIT_LABEL: Record<string, string> = {
  writing_stage: "Novel",
  writing_wiki: "Wiki",
};

const RATING_WORD = ["", "one", "two", "three", "four", "five"];
const MILESTONE_LADDER = [10_000, 25_000, 50_000, 75_000, 100_000, 250_000, 500_000, 1_000_000];

// ── Helpers ───────────────────────────────────────────────────────────────────
// initialism · dayCounts · streakTile · longestRunOf · STATUS_CAT · CAT_SLOTS
// live in ./specShared; the rail cover passes initialism's max = 12.

/** "50.4k" / "900" — one-decimal k above 10k, whole k above 100k. A SIBLING of
 *  specShared's `kFmt` (which rounds to whole k from 1000 up) — the drawn wave-
 *  table/day-log face keeps the finer steps, so the two do not merge. */
const kFmt1 = (v: number): string => {
  if (v >= 100_000) return `${Math.round(v / 1000)}k`;
  if (v >= 10_000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return groupInt(v);
};

/** The day-log's drawn duration form: "5 h 10" / "45 m". */
const logHours = (min: number): string => {
  const mm = Math.round(min);
  const h = Math.floor(mm / 60);
  return h > 0 ? `${h} h ${String(mm % 60).padStart(2, "0")}` : `${mm} m`;
};

/** Humanized lifespan: "4 yr 3 mo" · "8 mo" · "12 days". */
const lifespan = (from: string, to: string): string => {
  const days = dayGap(from, to) + 1;
  if (days < 60) return `${days} days`;
  const months = Math.round(days / 30.4375);
  if (months < 12) return `${months} mo`;
  const yr = Math.floor(months / 12);
  const mo = months % 12;
  return mo > 0 ? `${yr} yr ${mo} mo` : `${yr} yr`;
};

/** The axis-break's honesty label: "~2 yr" · "~1.5 yr" · "~2 mo" · "~5 wk". */
const gapLabel = (days: number): string => {
  const yrs = days / 365.25;
  if (yrs >= 0.95) {
    const half = Math.round(yrs * 2) / 2;
    return `~${half % 1 === 0 ? half.toFixed(0) : half.toFixed(1)} yr`;
  }
  const months = days / 30.4375;
  if (months >= 1.5) return `~${Math.round(months)} mo`;
  return `~${Math.round(days / 7)} wk`;
};

const qKey = (day: string): string =>
  `${yearKey(day)}-Q${Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1}`;
const fmtQtr = (qk: string): string => `${qk.slice(5)} ${qk.slice(0, 4)}`;

/** Grain-list value format for hour amounts (short form under 10 h). */
const hoursGrain = (min: number): string => (min < 600 ? hoursMinutes(min) : hoursWhole(min));

// ── The builder ───────────────────────────────────────────────────────────────

export function buildEntryDashboard(input: EntryBuildInput): EntryModel {
  const { entry, sessions, defs, valueBySession, today, finalized } = input;
  const colorVar = `--${input.colourSlot}`;
  const template = input.subType;
  const twoMeasure = template === "creation" && input.measuresCount;
  const unitWord = input.countUnit ?? "count"; // "words"
  const unitAbbr = unitWord.slice(0, 1); // "w"

  const days = [...new Set(sessions.map((s) => s.day))].sort();
  const firstDay = days[0] ?? null;
  const lastDay = days[days.length - 1] ?? null;
  const dayMin = dayMinutes(sessions);
  const dayCnt = dayCounts(sessions);

  const valOf = (sessionId: string, defKey: string): string | null =>
    valueBySession.get(sessionId)?.[defKey] ?? null;

  // ── Waves (shape 10, finally rendered) ──
  const gapDays = input.waveGapDays ?? 30;
  const waveList = wavesForEntry(sessions, gapDays);
  const waves = buildWaves(
    waveList,
    gapDays,
    input.habitKey,
    sessions,
    entry,
    template,
    twoMeasure,
    unitAbbr,
    defs,
    valOf,
    dayMin,
    dayCnt,
  );

  // ── Identity rail ──
  const rail = buildRail(input);

  // ── Series strip (conditional — consumption entries with `series` set) ──
  const seriesStrip = template === "consumption" ? buildSeriesStrip(entry, input.siblings) : null;

  // ── Stat rows ──
  const statRows =
    template === "consumption"
      ? buildConsumptionStrip(sessions, waveList, firstDay, lastDay, today, finalized, dayMin)
      : buildCreationStrip(
          sessions,
          twoMeasure,
          unitWord,
          firstDay,
          lastDay,
          today,
          finalized,
          dayMin,
          dayCnt,
          defs,
          valOf,
        );

  // ── Creation-only zones ──
  const growth = twoMeasure
    ? buildGrowth(entry, dayCnt, firstDay, lastDay, today, unitAbbr, waveList)
    : null;
  const split = twoMeasure ? buildSplit(sessions, defs, valOf, colorVar, unitAbbr) : null;
  const distModel =
    template === "creation"
      ? buildDistributions(defs, sessions, valOf, twoMeasure, unitWord, unitAbbr)
      : null;

  // ── Heatmap (53 weeks ending at the entry's LAST LOGGED DAY — no year scopes,
  //    no scope faces here; the Words⇄Time measure toggle rides twoMeasure) ──
  //
  // ⚠ THE WINDOW ENDS AT THE ENTRY, NOT AT TODAY (user-ruled 2026-08-15:
  // *"it starts all the way to the left instead of to the right… it needs to
  // start with the last time it was logged"*). It was a trailing window off
  // `today`, which is right for a HABIT — a habit is a thing you are still
  // doing — and wrong for an ENTRY, which has an end. A book finished in March
  // drew its whole reading history crushed against the left edge with five
  // months of blank to the right, and one finished over a year ago drew an
  // entirely empty grid: the face was showing how long ago the entry ended
  // rather than what happened while it ran.
  //
  // Nothing else needs to move — `buildCreationHeatmap` derives its month
  // labels from the same `end`, and cells past it are hidden by the shared grid
  // walk, so the last logged day lands on the right edge by construction.
  // `today` remains the fallback for an entry with no sessions at all, where
  // there is no last day to anchor to and the grid is empty either way.
  const heatmap = buildCreationHeatmap([], sessions, valOf, lastDay ?? today, null, twoMeasure, unitAbbr);

  // ── Day log ──
  const daylog = buildDayLog(sessions, template, twoMeasure, unitAbbr, dayMin, dayCnt, defs, valOf);

  return {
    colorVar,
    template,
    twoMeasure,
    rail,
    seriesStrip,
    statRows,
    waves,
    growth,
    split,
    dist: distModel,
    heatmap,
    daylog,
  };
}

// ── Zone builders ─────────────────────────────────────────────────────────────

function buildRail(input: EntryBuildInput): RailSpec {
  const { entry, siblings } = input;
  const creation = input.subType === "creation";

  const byline = [...entry.creators, ...entry.studios].join(" · ") || null;

  // Rating context: "One of 15 five-stars in Gaming" (habit-wide same-rating count).
  let ratingSpec: RailSpec["rating"] = null;
  if (!creation && entry.rating != null) {
    const same = siblings.filter((s) => s.rating === entry.rating).length;
    ratingSpec = {
      stars: stars(entry.rating),
      value: entry.rating.toFixed(1),
      context: `One of ${same} ${RATING_WORD[entry.rating]}-stars in ${input.habitName}`,
    };
  }

  const facts: RailFact[] = creation
    ? [
        { label: "Fandom", value: entry.fandom ?? "—", strong: entry.fandom != null },
        ...(entry.engine != null ? [{ label: "Engine", value: entry.engine, strong: true }] : []),
        { label: "Started", value: entry.started ? fmtDMY(entry.started) : "—", strong: entry.started != null },
        { label: "Completed", value: entry.completed ? fmtDMY(entry.completed) : "—", strong: entry.completed != null },
      ]
    : [
        { label: "Priority", value: entry.priority != null ? String(entry.priority) : "—", strong: entry.priority != null },
        { label: "Purchased", value: entry.purchased == null ? "—" : entry.purchased ? "Yes" : "No", strong: false },
        {
          label: "Series",
          value: entry.series ? `${entry.series}${entry.seriesOrder != null ? ` · #${entry.seriesOrder}` : ""}` : "—",
          strong: entry.series != null,
        },
      ];

  const provenance =
    entry.source != null
      ? `Source: ${entry.source}${entry.externalId != null ? ` · id ${entry.externalId}` : ""}`
      : "Source: manual";

  return {
    bannerRef: entry.banner,
    coverLabel: initialism(entry.title, 12),
    cover: entry.cover,
    eyebrow: { habit: input.habitName, type: entry.type },
    title: entry.title,
    byline,
    chips: creation ? [] : entry.genre,
    pill: entry.status ? { label: entry.status, colorVar: STATUS_CAT[entry.status] ?? "--cat-1" } : null,
    rating: ratingSpec,
    facts,
    description: entry.description,
    provenance,
  };
}

function buildSeriesStrip(entry: EntryIdentity, siblings: SiblingRow[]): SeriesStripSpec | null {
  if (entry.series == null) return null;
  const members = siblings
    .filter((s) => s.series === entry.series)
    .sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0));
  if (members.length < 2) return null;
  const idx = members.findIndex((m) => m.id === entry.id);
  const finished = members.filter((m) => m.status === "Finished").length;
  const noun = entry.type ?? "Part";
  return {
    title: entry.series,
    note: `${noun} ${entry.seriesOrder ?? idx + 1} of ${members.length} · ${finished} finished`,
    prev: idx > 0 ? { entryId: members[idx - 1].id, title: members[idx - 1].title } : null,
    next: idx >= 0 && idx < members.length - 1 ? { entryId: members[idx + 1].id, title: members[idx + 1].title } : null,
  };
}

function buildConsumptionStrip(
  sessions: SessionRow[],
  waves: Wave[],
  firstDay: string | null,
  lastDay: string | null,
  today: string,
  finalized: Set<string>,
  dayMin: Map<string, number>,
): EntryModel["statRows"] {
  const totMin = total(sessions).minutes;
  const daysActive = distinctDays(sessions);
  const bestDay = best(sessions, "day", "minutes");
  const played = new Set(sessions.map((s) => s.day));
  const st = firstDay ? streaks(firstDay, today, played, finalized) : { current: 0, currentRun: null, longest: 0, runs: [] };

  // The 2026-07-18 consumption-entry strip pass: Volume unchanged (wave-count ·
  // lifespan · best-day subtitles); First/Last day gain that day's hours.
  const volume: TileSpec[] = [
    {
      label: "Total hours",
      value: hoursWhole(totMin).replace(/h$/, ""),
      unit: "h",
      subtitle: `across ${waves.length} wave${waves.length === 1 ? "" : "s"}`,
    },
    {
      label: "Days active",
      value: groupInt(daysActive),
      subtitle: firstDay && lastDay ? `over ${lifespan(firstDay, lastDay)}` : undefined,
    },
    {
      label: "Avg hours / active day",
      value: hoursMinutes(daysActive > 0 ? totMin / daysActive : 0),
      subtitle: bestDay ? `best: ${hoursMinutes(bestDay.value)} · ${fmtDMY(bestDay.key)}` : undefined,
    },
    {
      label: "Best day",
      value: bestDay ? hoursMinutes(bestDay.value) : "—",
      subtitle: bestDay ? fmtDMY(bestDay.key) : undefined,
    },
  ];

  const dates: TileSpec[] = [
    {
      label: "First day",
      value: firstDay ? fmtDMY(firstDay) : "—",
      big: true,
      subtitle: firstDay ? hoursMinutes(dayMin.get(firstDay) ?? 0) : undefined,
    },
    {
      label: "Last day",
      value: lastDay ? fmtDMY(lastDay) : "—",
      big: true,
      subtitle: lastDay ? hoursMinutes(dayMin.get(lastDay) ?? 0) : undefined,
    },
    streakTile("Current streak", st.currentRun, st, true),
    streakTile("Longest streak", longestRunOf(st), st, false),
  ];

  return [
    { label: "Volume", tiles: volume },
    { label: "Dates & streaks", tall: true, tiles: dates },
  ];
}

function buildCreationStrip(
  sessions: SessionRow[],
  twoMeasure: boolean,
  unitWord: string,
  firstDay: string | null,
  lastDay: string | null,
  today: string,
  finalized: Set<string>,
  dayMin: Map<string, number>,
  dayCnt: Map<string, number>,
  defs: SessionDef[],
  valOf: (sessionId: string, defKey: string) => string | null,
): EntryModel["statRows"] {
  const totMin = total(sessions).minutes;
  const totCnt = sessions.reduce((a, s) => a + (s.measure_kind === "count" ? s.value ?? 0 : 0), 0);
  const daysActive = distinctDays(sessions);
  const spanDays = firstDay ? dayGap(firstDay, lastDay ?? firstDay) + 1 : 0;
  const played = new Set(sessions.map((s) => s.day));
  const st = firstDay ? streaks(firstDay, today, played, finalized) : { current: 0, currentRun: null, longest: 0, runs: [] };

  // Four-grain averages (the 2026-07-18 creation-entry pass: wk · mo · qtr · yr).
  const grains: { k: string; days: number }[] = [
    { k: "wk", days: 7 },
    { k: "mo", days: 30.4375 },
    { k: "qtr", days: 91.3125 },
    { k: "yr", days: 365.25 },
  ];
  const avgList = (totAmount: number, fmt: (v: number) => string) => ({
    dateLine: "",
    rows: grains.map((g) => ({
      k: g.k,
      v: spanDays > 0 ? fmt(totAmount / (spanDays / g.days)) : "—",
    })),
  });

  // Best-bucket lists per grain (wk N · Mon YYYY · Q# YYYY · YYYY).
  const bestList = (src: Map<string, number>, fmt: (v: number) => string) => {
    const bw = bestBucketBy(src, weekStart);
    const bm = bestBucketBy(src, monthKey);
    const bq = bestBucketBy(src, qKey);
    const by = bestBucketBy(src, yearKey);
    const rows: { k: string; v: string }[] = [];
    if (bw) rows.push({ k: `wk ${weekNum(bw.key).week}`, v: fmt(bw.value) });
    if (bm) rows.push({ k: fmtMonY(bm.key), v: fmt(bm.value) });
    if (bq) rows.push({ k: fmtQtr(bq.key), v: fmt(bq.value) });
    if (by) rows.push({ k: by.key, v: fmt(by.value) });
    return rows;
  };

  const bestDayT = best(sessions, "day", "minutes");
  const timeRow: TileSpec[] = [
    { label: "Total hours", value: hoursWhole(totMin).replace(/h$/, ""), unit: "h" },
    { label: "Days active", value: groupInt(daysActive) },
    {
      label: "Avg hours / day",
      value: hoursMinutes(daysActive > 0 ? totMin / daysActive : 0),
      list: avgList(totMin, hoursGrain),
    },
    {
      label: "Best day hours",
      value: bestDayT ? hoursMinutes(bestDayT.value) : "—",
      list: { dateLine: bestDayT ? fmtDMY(bestDayT.key) : "—", rows: bestList(dayMin, hoursGrain) },
    },
  ];

  const rows: EntryModel["statRows"] = [{ label: "Time", tall: true, tiles: timeRow }];

  if (twoMeasure) {
    // Per-def count split for the total's subtitle ("105.3k stage · 23.1k wiki").
    const perDef = defs
      .map((d) => ({
        label: d.label.toLowerCase(),
        v: sessions.reduce(
          (a, s) => a + (s.measure_kind === "count" && valOf(s.id, d.key) != null ? s.value ?? 0 : 0),
          0,
        ),
      }))
      .filter((x) => x.v > 0);
    const bdC = bestBucketBy(dayCnt, (d) => d);
    const capUnit = unitWord.charAt(0).toUpperCase() + unitWord.slice(1);
    rows.push({
      label: capUnit,
      tall: true,
      tiles: [
        {
          label: `Total ${unitWord}`,
          value: groupInt(totCnt),
          subtitle: perDef.length >= 2 ? perDef.map((x) => `${kFmt1(x.v)} ${x.label}`).join(" · ") : undefined,
        },
        {
          label: `Avg ${unitWord} / day`,
          value: groupInt(daysActive > 0 ? totCnt / daysActive : 0),
          list: avgList(totCnt, (v) => groupInt(v)),
        },
        {
          label: `Best day ${unitWord}`,
          value: bdC ? groupInt(bdC.value) : "—",
          list: { dateLine: bdC ? fmtDMY(bdC.key) : "—", rows: bestList(dayCnt, (v) => groupInt(v)) },
        },
      ],
    });
  }

  const firstSub = (d: string) =>
    twoMeasure
      ? `${groupInt(dayCnt.get(d) ?? 0)} w · ${hoursMinutes(dayMin.get(d) ?? 0)}`
      : hoursMinutes(dayMin.get(d) ?? 0);
  rows.push({
    label: "Dates & streaks",
    tall: true,
    tiles: [
      { label: "First day", value: firstDay ? fmtDMY(firstDay) : "—", big: true, subtitle: firstDay ? firstSub(firstDay) : undefined },
      { label: "Last day", value: lastDay ? fmtDMY(lastDay) : "—", big: true, subtitle: lastDay ? firstSub(lastDay) : undefined },
      streakTile("Current streak", st.currentRun, st, true),
      streakTile("Longest streak", longestRunOf(st), st, false),
    ],
  });

  return rows;
}

function buildWaves(
  waves: Wave[],
  gapDays: number,
  habitKey: string,
  sessions: SessionRow[],
  entry: EntryIdentity,
  template: "consumption" | "creation",
  twoMeasure: boolean,
  unitAbbr: string,
  defs: SessionDef[],
  valOf: (sessionId: string, defKey: string) => string | null,
  dayMin: Map<string, number>,
  dayCnt: Map<string, number>,
): WavesSpec {
  const primary = twoMeasure ? dayCnt : dayMin;
  const primaryDiv = twoMeasure ? 1 : 60; // hours on the band for time habits

  // Sorted-day + prefix-sum view of the primary map: the table's per-row
  // amount/best/sum reads slice by binary search instead of rescanning the
  // whole map per row (the pre-bucket pass, 2026-07-30).
  const primDays = [...primary.keys()].sort();
  const primVals = primDays.map((d) => primary.get(d)!);
  const primPrefix: number[] = [0];
  for (const v of primVals) primPrefix.push(primPrefix[primPrefix.length - 1] + v);
  const lb = (days: readonly string[], d: string): number => {
    let lo = 0;
    let hi = days.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (days[mid] < d) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const ub = (days: readonly string[], d: string): number => {
    let lo = 0;
    let hi = days.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (days[mid] <= d) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const sumIn = (start: string, end: string): number =>
    primPrefix[ub(primDays, end)] - primPrefix[lb(primDays, start)];
  const amountOf = (w: Wave): number => (twoMeasure ? sumIn(w.start, w.end) : w.minutes);
  // The active/"now" reading was STRUCK app-wide 2026-07-30 (user-ruled: "No.
  // Actually remove that from writing and other creation entries as well" —
  // asked whether consumption should gain the then-creation-only chip). No
  // Active chip, no "now" foot, no band now-cap; a span dates to its last
  // session month on both templates.

  // ── The era metric (ruled 2026-07-24) + the interlude count ──
  const eraList = erasForWaves(waves, amountOf, gapDays);
  const eraOf = new Map<number, (typeof eraList)[number]>();
  for (const e of eraList) for (let k = e.from; k <= e.to; k++) eraOf.set(k, e);
  const interludes = waves.length - eraList.reduce((a, e) => a + (e.to - e.from + 1), 0);

  const amtStr = (v: number): string =>
    twoMeasure ? `${kFmt1(v)} ${unitAbbr}` : hoursWhole(v).replace(/h$/, " h");
  const bestIn = (start: string, end: string): number => {
    let b = 0;
    for (let i = lb(primDays, start), n = ub(primDays, end); i < n; i++)
      if (primVals[i] > b) b = primVals[i];
    return b;
  };
  const bestStr = (v: number): string => (twoMeasure ? `${groupInt(v)} ${unitAbbr}` : hoursMinutes(v));
  const perDayStr = (amount: number, days: number): string =>
    twoMeasure ? groupInt(days > 0 ? amount / days : 0) : hoursMinutes(days > 0 ? amount / days : 0);
  const figsFor = (days: number, amount: number, best: number): TableFigs => ({
    days: `${days}`,
    amount: amtStr(amount),
    best: bestStr(best),
    perDay: perDayStr(amount, days),
  });

  // ── The band-floor ruling (2026-07-23): breaks only for LONG silences —
  // shorter gaps stay on a continuous axis; waves group into runs. ──
  const BREAK_FLOOR_DAYS = Math.max(180, gapDays * 6);
  const runs: { waves: Wave[]; firstIdx: number }[] = [];
  {
    let cur: Wave[] = [];
    let firstIdx = 0;
    waves.forEach((w, i) => {
      if (cur.length > 0 && dayGap(cur[cur.length - 1].end, w.start) >= BREAK_FLOOR_DAYS) {
        runs.push({ waves: cur, firstIdx });
        cur = [];
      }
      if (cur.length === 0) firstIdx = i;
      cur.push(w);
    });
    if (cur.length > 0) runs.push({ waves: cur, firstIdx });
  }

  // Buckets carry day anchors ({s, len}) so the lane's dayToX can map calendar
  // days to axis x (the 2026-07-24 rework); values divide to band units.
  const parts: WavePart[] = [];
  runs.forEach((run, ri) => {
    if (ri > 0) {
      const prev = runs[ri - 1].waves;
      parts.push({ kind: "break", label: gapLabel(dayGap(prev[prev.length - 1].end, run.waves[0].start)) });
    }
    const start = run.waves[0].start;
    const end = run.waves[run.waves.length - 1].end;
    // WEEK grain at every span (user-ruled 2026-07-24, third live batch —
    // "zoom in": month buckets at the 26px floor read as distant noise; weekly
    // ≈ 4× the axis density and the scroll carries the length, which is what
    // the scrolling-axis ruling is for. This answers the session's open
    // bucket-grain question for the ≤ ~5-year seed scale; a zoom control for
    // decade-old entries stays open).
    const buckets: WaveBucket[] = [];
    for (let ws = dayIndex(weekStart(start)); ws <= dayIndex(end); ws += 7) {
      let sum = 0;
      for (let k = 0; k < 7; k++) {
        const d = dayFromIndex(ws + k);
        if (d >= start && d <= end) sum += primary.get(d) ?? 0;
      }
      buckets.push({ v: sum / primaryDiv, s: dayFromIndex(ws), len: 7 });
    }
    const lane: LaneWave[] = run.waves.map((w, k) => {
      const n = run.firstIdx + k + 1;
      return {
        n,
        start: w.start,
        end: w.end,
        days: w.days,
        tip: `Wave ${n} · ${fmtWaveSpan(w)} · ${w.days} day${w.days === 1 ? "" : "s"} · ${amtStr(amountOf(w))}`,
      };
    });
    // The band's "now" cap died with the active reading (the 2026-07-30
    // strike) — the band's own month/year axis is the only end labelling.
    parts.push({
      kind: "wave",
      buckets: buckets.length > 0 ? buckets : [{ v: 0, s: start, len: 1 }],
      waves: lane,
    });
  });

  // ── Markers: creation = the stored arc bookends; consumption = first
  //    session — each anchored at its TRUE day ──
  const markers: WavesSpec["markers"] = [];
  if (template === "creation") {
    if (entry.started != null)
      markers.push({ day: entry.started, label: `▲ started ${fmtDMY(entry.started)}`, colorVar: "--verdict-done" });
    if (entry.completed != null)
      markers.push({ day: entry.completed, label: `■ completed ${fmtDMY(entry.completed)}`, colorVar: "--cat-4" });
  } else if (waves.length > 0) {
    markers.push({ day: waves[0].start, label: "◀ first session", colorVar: "--text-muted" });
  }

  // ── Chapter-track era spans (plain labels — the 2026-07-24 ruling) ──
  const eras: EraSpan[] = eraList.map((e) => ({
    n: e.n,
    start: e.start,
    end: e.end,
    waveNums: Array.from({ length: e.to - e.from + 1 }, (_, k) => e.from + k + 1),
    label: `Era ${e.n}`,
  }));

  // ── Merged categorical share (creation) — table composition cells ──
  // Tagged amounts flattened ONCE, day-sorted; compOf slices by binary search
  // instead of rescanning defs × sessions per table row (2026-07-30).
  const catRows: { day: string; val: string; slot: string; amount: number }[] = [];
  if (template === "creation" && defs.length > 0) {
    for (const d of defs) {
      const slot = new Map(d.vocab.map((v, i) => [v, CAT_SLOTS[i % CAT_SLOTS.length]]));
      for (const s of sessions) {
        const v = valOf(s.id, d.key);
        if (v == null) continue;
        const amount = twoMeasure
          ? s.measure_kind === "count"
            ? s.value ?? 0
            : 0
          : s.measure_kind === "time"
            ? s.value ?? 0
            : 0;
        if (amount === 0) continue;
        catRows.push({ day: s.day, val: v, slot: slot.get(v) ?? "--cat-1", amount });
      }
    }
    catRows.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  }
  const catDays = catRows.map((r) => r.day);
  const compOf = (start: string, end: string): WaveComp | null => {
    if (catRows.length === 0) return null;
    const share = new Map<string, { v: number; slot: string }>();
    for (let i = lb(catDays, start), n = ub(catDays, end); i < n; i++) {
      const r = catRows[i];
      const cur = share.get(r.val) ?? { v: 0, slot: r.slot };
      cur.v += r.amount;
      share.set(r.val, cur);
    }
    const tot = [...share.values()].reduce((a, x) => a + x.v, 0);
    if (tot === 0) return null;
    const ranked = [...share.entries()].sort((a, b) => b[1].v - a[1].v);
    return {
      label: `${Math.round((ranked[0][1].v / tot) * 100)}% ${ranked[0][0].toLowerCase()}`,
      segs: ranked.map(([, x]) => ({ pct: (x.v / tot) * 100, colorVar: x.slot })),
    };
  };

  // ── The wave table (ruled 2026-07-24 — no blip fold; eras group, interludes
  //    collapse into one expandable row) ──
  type Group = { type: "era" | "int"; era: (typeof eraList)[number] | null; items: { w: Wave; n: number }[] };
  const groups: Group[] = [];
  {
    let cur: Group | null = null;
    waves.forEach((w, i) => {
      const e = eraOf.get(i) ?? null;
      if (e != null) {
        if (cur == null || cur.era !== e) {
          cur = { type: "era", era: e, items: [] };
          groups.push(cur);
        }
      } else if (cur == null || cur.type !== "int") {
        cur = { type: "int", era: null, items: [] };
        groups.push(cur);
      }
      cur.items.push({ w, n: i + 1 });
    });
  }
  const rows: WaveTableRow[] = [];
  let gid = 0;
  for (const g of groups) {
    const s = g.items[0].w.start;
    const e = g.items[g.items.length - 1].w.end;
    const daysSum = g.items.reduce((a, it) => a + it.w.days, 0);
    const amountSum = g.items.reduce((a, it) => a + amountOf(it.w), 0);
    const bestV = g.items.reduce((a, it) => Math.max(a, bestIn(it.w.start, it.w.end)), 0);
    const figs = figsFor(daysSum, amountSum, bestV);
    const waveNums = g.items.map((it) => it.n);
    const groupSpan = `${fmtWaveSpan({ start: s, end: e })}`;
    if (g.type === "era") {
      const solo = g.items.length === 1;
      rows.push({
        kind: "era",
        eraN: g.era!.n,
        soloWave: solo ? g.items[0].n : null,
        waveNums,
        span: groupSpan,
        figs,
        comp: compOf(s, e),
      });
      if (!solo)
        for (const it of g.items)
          rows.push({
            kind: "wave",
            n: it.n,
            groupId: null,
            span: fmtWaveSpan(it.w),
            figs: figsFor(it.w.days, amountOf(it.w), bestIn(it.w.start, it.w.end)),
            comp: compOf(it.w.start, it.w.end),
          });
    } else {
      const id = `g${++gid}`;
      rows.push({
        kind: "interludes",
        groupId: id,
        count: g.items.length,
        waveNums,
        span: groupSpan,
        figs,
        comp: compOf(s, e),
      });
      for (const it of g.items)
        rows.push({
          kind: "wave",
          n: it.n,
          groupId: id,
          span: fmtWaveSpan(it.w),
          figs: figsFor(it.w.days, amountOf(it.w), bestIn(it.w.start, it.w.end)),
          comp: compOf(it.w.start, it.w.end),
        });
    }
  }

  const first = waves[0];
  const last = waves[waves.length - 1];
  const totalDays = new Set(sessions.map((s) => s.day)).size;
  const totalAmount = waves.reduce((a, w) => a + amountOf(w), 0);
  // Consumption verb is per-habit — Reading reads, Media watches, the rest play.
  const CONSUMPTION_VERB: Record<string, { past: string; header: string }> = {
    reading: { past: "read", header: "Read" },
    media: { past: "watched", header: "Watched" },
  };
  const consVerb = CONSUMPTION_VERB[habitKey] ?? { past: "played", header: "Played" };
  const verbPast = template === "creation" ? (twoMeasure ? "wrote" : "worked") : consVerb.past;
  const amountHeader = template === "creation" ? (twoMeasure ? "Written" : "Worked") : consVerb.header;
  const plur = (n: number, w: string): string => `${n} ${w}${n === 1 ? "" : "s"}`;
  const subClauses: string[] = [];
  if (eraList.length > 0) subClauses.push(plur(eraList.length, "era"));
  if (interludes > 0) subClauses.push(plur(interludes, "interlude"));

  return {
    count: waves.length,
    countLabel: plur(waves.length, "wave"),
    subLabel: subClauses.length > 0 ? subClauses.join(" · ") : null,
    parts,
    markers,
    eras,
    table: {
      amountHeader,
      perDayHeader: twoMeasure ? `${unitAbbr} / day` : "h / day",
      hasComp: template === "creation" && defs.length > 0,
      rows,
      foot: {
        left: `${plur(waves.length, "wave")}${eraList.length > 0 ? ` · ${plur(eraList.length, "era")}` : ""}`,
        span: first
          ? `${fmtMonY(monthKey(first.start))} – ${fmtMonY(monthKey(last.end))} · last ${verbPast} ${fmtDMY(last.end)}`
          : "—",
        figs: figsFor(totalDays, totalAmount, bestIn(first?.start ?? "0000", last?.end ?? "9999")),
      },
    },
  };
}

const fmtWaveSpan = (w: { start: string; end: string }): string => {
  const [fy, fm] = [yearKey(w.start), Number(w.start.slice(5, 7))];
  const [ty, tm] = [yearKey(w.end), Number(w.end.slice(5, 7))];
  if (fy === ty)
    return fm === tm
      ? `${MONTHS_SHORT[fm - 1]} ${fy}`
      : `${MONTHS_SHORT[fm - 1]} – ${MONTHS_SHORT[tm - 1]} ${fy}`;
  return `${MONTHS_SHORT[fm - 1]} ${fy} – ${MONTHS_SHORT[tm - 1]} ${ty}`;
};

function buildGrowth(
  entry: EntryIdentity,
  dayCnt: Map<string, number>,
  firstDay: string | null,
  lastDay: string | null,
  today: string,
  unitAbbr: string,
  waves: Wave[],
): GrowthSpec | null {
  if (firstDay == null || lastDay == null) return null;
  const x0 = entry.started != null && entry.started < firstDay ? entry.started : firstDay;
  const x1 = entry.completed == null ? today : lastDay > entry.completed ? lastDay : entry.completed;
  const span = Math.max(1, dayGap(x0, x1));
  const X = (d: string) => Math.min(1, Math.max(0, dayGap(x0, d) / span));

  // Weekly cumulative points.
  const points: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  let cum = 0;
  for (let ws = dayIndex(weekStart(x0)); ws <= dayIndex(x1); ws += 7) {
    for (let k = 0; k < 7; k++) {
      const d = dayFromIndex(ws + k);
      if (d >= x0 && d <= x1) cum += dayCnt.get(d) ?? 0;
    }
    points.push({ x: X(dayFromIndex(Math.min(ws + 6, dayIndex(x1)))), y: cum });
  }
  const totalCnt = cum;
  if (totalCnt <= 0) return null;

  const rungLabel = (v: number): string =>
    v >= 10_000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(Math.round(v));

  // A proper COMPUTED y-axis (2026-07-24): evenly-spaced "nice" ticks that
  // always reach the data — replaces the fixed milestone LADDER, which was a
  // set of achievement thresholds (10/25/50/75/100/250k…), not axis ticks: its
  // 100k→250k gap left a 100k–250k entry's top region unlabelled. Milestones
  // now live only as the accent crossing dots (below), layered on this axis.
  const step = niceStep(totalCnt, 6);
  const vmax = Math.ceil(totalCnt / step) * step;
  const rungs: { value: number; label: string }[] = [];
  for (let v = step; v <= vmax + 0.5; v += step) rungs.push({ value: v, label: rungLabel(v) });

  // Crossing dots: interpolate x where the curve passes each milestone it has
  // reached — the milestones become accent marks ON the curve, not the axis.
  const crossed = MILESTONE_LADDER.filter((r) => r <= totalCnt);
  const crossings: { x: number; y: number }[] = [];
  for (const r of crossed) {
    for (let i = 1; i < points.length; i++) {
      if (points[i - 1].y < r && points[i].y >= r) {
        const f = (r - points[i - 1].y) / (points[i].y - points[i - 1].y || 1);
        crossings.push({ x: points[i - 1].x + f * (points[i].x - points[i - 1].x), y: r });
        break;
      }
    }
  }

  // Wave shades + gap hatches over the same x domain — the BAND's own wave
  // spans (2026-07-30): re-clustering count-session days here produced a
  // different day set than the band's all-session waves, so the two zones
  // could visibly disagree.
  const shades = waves.map((w) => ({ x0: X(w.start), x1: X(w.end) }));
  const hatches = waves.slice(1).map((w, i) => ({ x0: X(waves[i].end), x1: X(w.start) }));

  return {
    points,
    vmax,
    total: { label: `${groupInt(totalCnt)} ${unitAbbr}` },
    rungs,
    crossings,
    shades,
    hatches,
    startedX: entry.started != null ? X(entry.started) : null,
  };
}

/** A "nice" round axis step (1 · 2 · 2.5 · 5 × 10^k) giving ≈`target` ticks up
 *  to `max` — the standard even-axis heuristic. */
function niceStep(max: number, target: number): number {
  const raw = Math.max(max, 1) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag; // 1 … 10
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

function buildSplit(
  sessions: SessionRow[],
  defs: SessionDef[],
  valOf: (sessionId: string, defKey: string) => string | null,
  colorVar: string,
  unitAbbr: string,
): SplitSpec | null {
  if (defs.length < 2) return null;
  // Count-measure total per DEF (each session's count lands with whichever def
  // tagged it — stage-or-wiki is required-one-of on writing sessions).
  const totals = defs.map((d) => ({
    def: d,
    v: sessions.reduce(
      (a, s) => a + (s.measure_kind === "count" && valOf(s.id, d.key) != null ? s.value ?? 0 : 0),
      0,
    ),
  }));
  const tot = totals.reduce((a, x) => a + x.v, 0);
  if (tot <= 0) return null;
  // Slice colours: the habit hue, then its window-background mixes at the
  // --heatmap-ramp complements — READ via the published --heat-bg-N dials
  // (src/theme/derived.ts; step 6a retired the 62/34/90 transcription). The
  // cycle order (full · stop-2 · stop-3 · stop-1) is the drawn face's.
  const MIXES = [null, "--heat-bg-2", "--heat-bg-3", "--heat-bg-1"] as const;
  return {
    slices: totals.map((x, i) => ({
      label: SPLIT_LABEL[x.def.key] ?? x.def.label,
      value: `${groupInt(x.v)} ${unitAbbr}`,
      pct: Math.round((x.v / tot) * 100),
      color:
        MIXES[i % MIXES.length] == null
          ? `var(${colorVar})`
          : `color-mix(in oklch, var(${colorVar}), var(--window-background) var(${MIXES[i % MIXES.length]}))`,
    })),
  };
}

function buildDayLog(
  sessions: SessionRow[],
  template: "consumption" | "creation",
  twoMeasure: boolean,
  unitAbbr: string,
  dayMin: Map<string, number>,
  dayCnt: Map<string, number>,
  defs: SessionDef[],
  valOf: (sessionId: string, defKey: string) => string | null,
): DayLogSpec {
  const days = [...new Set(sessions.map((s) => s.day))].sort().reverse();
  if (days.length === 0) return { years: [] };

  // Best markers: consumption = one best day (minutes); creation two-measure =
  // best time + best words (per-measure, the work-diary FINAL).
  let bestT: string | null = null;
  let bestTv = 0;
  for (const [d, v] of dayMin) if (v > bestTv) ((bestTv = v), (bestT = d));
  let bestC: string | null = null;
  let bestCv = 0;
  for (const [d, v] of dayCnt) if (v > bestCv) ((bestCv = v), (bestC = d));

  // Pre-bucketed day → chips (was an O(days × sessions) rescan per row).
  const chipsByDay = new Map<string, Set<string>>();
  for (const s of sessions) {
    for (const d of defs) {
      const v = valOf(s.id, d.key);
      if (v == null) continue;
      (chipsByDay.get(s.day) ?? chipsByDay.set(s.day, new Set()).get(s.day)!).add(v.toLowerCase());
    }
  }
  const chipsOf = (day: string): string[] => [...(chipsByDay.get(day) ?? [])];

  const rowVal = (day: string): string => {
    const t = logHours(dayMin.get(day) ?? 0);
    if (!twoMeasure) return t;
    return `${groupInt(dayCnt.get(day) ?? 0)} ${unitAbbr} · ${t}`;
  };

  const bestOf = (day: string): string | null => {
    if (template === "creation" && twoMeasure) {
      if (day === bestC) return `best ${unitAbbr === "w" ? "words" : "count"} →`;
      if (day === bestT) return "best time →";
      return null;
    }
    return day === bestT ? "best day →" : null;
  };

  const sumOf = (list: string[]): string => {
    const nDays = list.length;
    if (twoMeasure) {
      const w = list.reduce((a, d) => a + (dayCnt.get(d) ?? 0), 0);
      return `${kFmt1(w)} ${unitAbbr} · ${nDays} day${nDays === 1 ? "" : "s"}`;
    }
    const min = list.reduce((a, d) => a + (dayMin.get(d) ?? 0), 0);
    return `${groupInt(min / 60)} h · ${nDays} day${nDays === 1 ? "" : "s"}`;
  };

  const years: DayLogSpec["years"] = [];
  const byYear = new Map<string, string[]>();
  for (const d of days) (byYear.get(yearKey(d)) ?? byYear.set(yearKey(d), []).get(yearKey(d))!).push(d);
  const yearKeys = [...byYear.keys()]; // already desc (days sorted desc)
  yearKeys.forEach((y, yi) => {
    const yDays = byYear.get(y)!;
    const byMonth = new Map<string, string[]>();
    for (const d of yDays) (byMonth.get(monthKey(d)) ?? byMonth.set(monthKey(d), []).get(monthKey(d))!).push(d);
    const months = [...byMonth.entries()].map(([mk, list], mi) => ({
      label: MONTHS_LONG[Number(mk.slice(5)) - 1],
      sum: sumOf(list),
      open: yi === 0 && mi === 0,
      days: list.map((d) => ({
        day: d,
        label: `${d.slice(8)} ${MONTHS_SHORT[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`,
        val: rowVal(d),
        chips: chipsOf(d),
        best: bestOf(d),
      })),
    }));
    years.push({ label: y, sum: sumOf(yDays), open: yi === 0, months });
  });

  return { years };
}
