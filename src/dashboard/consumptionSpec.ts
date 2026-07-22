/**
 * The consumption habit-dashboard **composition spec** (Dashboard Composition,
 * hardened 2026-07-13: definitions → an explicit spec → a renderer that walks
 * it; derivation never smears into components). This builder is the consumption
 * TEMPLATE — Gaming instantiates it, and reading/media would produce the same
 * model shape from their own definitions. It composes the ten catalog shapes
 * (../metrics) into a plain data model the kit components render.
 *
 * Nothing here is Gaming-special beyond the inputs; the six zones and their
 * tiles are the template's, computed from the habit's declared attributes.
 */
import {
  best,
  dayMinutes,
  distinctDays,
  distribute,
  heatChip,
  heatmapCells,
  heatmapMonths,
  leaderboard,
  periodDelta,
  playedDaySet,
  scoped,
  streaks,
  total,
  type EntryRow,
  type HeatChip,
  type HeatmapCell,
  type Run,
  type SessionRow,
} from "../metrics/shapes";
import { dayFromIndex, dayGap, dayIndex, isoWeek, monthKey, yearKey } from "../metrics/dates";
import {
  decimal1,
  deltaChip,
  fmtDMY,
  fmtMonY,
  fmtRange,
  groupInt,
  hoursMinutes,
  hoursTrim1,
  hoursWhole,
  stars,
  type DeltaChip,
} from "../metrics/format";

// ── Model types (the spec the renderer walks) ─────────────────────────────────

export interface TileSpec {
  label: string;
  value: string;
  unit?: string;
  subtitle?: string;
  delta?: DeltaChip;
  /** Streak tiles: a date line above the value + a key/value subtitle table. */
  list?: { dateLine: string; rows: { k: string; v: string }[] };
  /** Best-record door tiles carry a date value line (kit-tile-stat `.tv.date`). */
  dateValue?: boolean;
}

export interface DistColumnSpec {
  title: string;
  meta?: string;
  rows: { label: string; value: string; pct: number; colorVar: string; tip: string }[];
}

export interface LeaderColumnSpec {
  title: string;
  meta?: string;
  rows?: { rank: number; title: string; value: string; pct: number }[];
  hall?: { title: string; initial: string }[];
}

export interface DashboardModel {
  colorVar: string;
  masthead: {
    name: string;
    heat: HeatChip | null;
    empty: boolean;
    sinceLive: string;
    tabs: { key: string; label: string }[];
    activeKey: string;
    /** The entry-level Medium sub-scope (Reading/Media) — empty for Gaming. */
    typeTabs: { key: string | null; label: string }[];
    activeType: string | null;
  };
  engagement: TileSpec[];
  volume: TileSpec[];
  catalog: TileSpec[];
  distributions: DistColumnSpec[];
  /**
   * The degradation-rule survivor merge (media-stats wireframe · Canvas C): when
   * the catalog collapses to one tile AND the distributions to one panel, they
   * relocate into a single "Catalog" zone. Non-null replaces the separate
   * catalog group + Distributions panel.
   */
  mergedCatalog: { tile: TileSpec; dist: DistColumnSpec } | null;
  leaderboards: LeaderColumnSpec[];
  trend: {
    caption: string;
    line: number[]; // hours per day, 30 values oldest→newest
    vmax: number;
    xticks: { i: number; label: string }[];
    sparkTitle: string;
    sparkDelta: DeltaChip | null;
    spark: { label: string; hours: number; monthVar: string }[];
    sparkMax: number;
  };
  heatmap: {
    cells: HeatmapCell[];
    months: { col: number; label: string }[];
    trio: TileSpec[];
    /** True when the habit declares a Medium vocab → the Intensity·By-Type toggle shows. */
    hasTypes: boolean;
    /** By-Type legend: the types in play (all, or the single pinned type), with their slots. */
    legend: { label: string; colorVar: string }[];
  };
}

// ── Scope descriptor ──────────────────────────────────────────────────────────

export type ScopeSel = { kind: "all" } | { kind: "year"; year: string };

export interface BuildInput {
  colourSlot: string; // "habit-2"
  name: string;
  sessions: SessionRow[];
  entries: EntryRow[];
  finalized: Set<string>;
  today: string;
  /** The habit's declared entry-level Medium picklist (empty = no sub-scope, no by-type panel). */
  typeVocab: string[];
  /** Distinct days ANY habit was active app-wide — the All-types "Total days active" reading. */
  appActiveDays: string[];
}

/** The categorical-palette slots, cycled for the by-type distribution + any open vocab. */
const CAT_SLOTS = ["--cat-1", "--cat-2", "--cat-3", "--cat-4", "--cat-5", "--cat-6", "--cat-7", "--cat-8"];

// status → categorical slot (matches the frozen Gaming FINAL's pills)
const STATUS_VOCAB_DISPLAY = ["Current", "Finished", "Dropped", "Planned", "Hiatus"];
const STATUS_CAT: Record<string, string> = {
  Current: "--cat-2",
  Finished: "--cat-4",
  Dropped: "--cat-6",
  Planned: "--cat-3",
  Hiatus: "--cat-8",
};
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const initialism = (title: string): string => {
  const words = title.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const s = words.length > 1 ? words.map((w) => w[0]).join("") : title.replace(/[^A-Za-z0-9]/g, "");
  return s.slice(0, 4).toUpperCase();
};

const bestWeekLabel = (weekStartDay: string): string => {
  const { week, year } = isoWeek(weekStartDay);
  return `wk ${week} · ${year}`;
};

export function buildConsumptionDashboard(
  input: BuildInput,
  sel: ScopeSel,
  typeFilter: string | null = null,
): DashboardModel {
  const { finalized, today } = input;
  const colorVar = `--${input.colourSlot}`;

  // Full (identity) sets — the masthead's tracking-since + year tabs + heat read
  // these, so the Medium sub-scope never rewrites the habit's identity line.
  const sessions = input.sessions;
  const entries = input.entries;

  // The Medium sub-scope (Reading/Media): every derived zone re-scopes to the
  // selected type; a null filter is the "All types" face. Gaming's typeVocab is
  // empty, so this is always a no-op there.
  const typeOfEntry = new Map(entries.map((e) => [e.id, e.type]));
  const fSessions = typeFilter
    ? sessions.filter((s) => s.entry_fk != null && typeOfEntry.get(s.entry_fk) === typeFilter)
    : sessions;
  const fEntries = typeFilter ? entries.filter((e) => e.type === typeFilter) : entries;

  // Type-specific nomenclature: a YouTube entry is a channel, not a title.
  const noun = typeFilter === "Youtube" ? "channels" : "titles";
  const Noun = typeFilter === "Youtube" ? "Channels" : "Titles";

  const fullFirst = sessions.map((s) => s.day).sort()[0] ?? null;
  const allDays = fSessions.map((s) => s.day).sort();
  const firstDay = allDays[0] ?? fullFirst;
  const empty = fullFirst == null;

  // Scope window bounds (clamped to the tracked span and to today).
  const isYear = sel.kind === "year";
  const base = firstDay ?? today;
  const scopeFrom = empty ? today : isYear ? maxStr(`${sel.year}-01-01`, base) : base;
  const scopeTo = isYear ? minStr(`${sel.year}-12-31`, today) : today;

  const sessScoped = scoped(fSessions, { from: scopeFrom, to: scopeTo });
  // Entries in scope: all (All Time) or those touched in the scoped window (year).
  const touched = new Set(sessScoped.map((s) => s.entry_fk).filter(Boolean) as string[]);
  const ent = isYear ? fEntries.filter((e) => touched.has(e.id)) : fEntries;

  const spanDays = dayGap(scopeFrom, scopeTo) + 1;
  const weeks = spanDays / 7;
  const months = spanDays / 30.4375;
  const played = playedDaySet(sessScoped);
  const st = streaks(scopeFrom, scopeTo, played, finalized);

  // Delta window: trailing year for All Time, the scoped year for a year scope.
  const dFrom = isYear ? scopeFrom : dayFromIndex(dayIndex(today) - 364);
  const dTo = isYear ? scopeTo : today;

  // ── Engagement row ──
  const daysActive = distinctDays(sessScoped);
  const trackedDays = spanDays;
  const bestWk = best(sessScoped, "week", "days");
  const bestMo = best(sessScoped, "month", "days");

  // "Total days active" reads app-wide on the All-types face (days ANY habit was
  // used — the app's activity), and narrows to this habit's days once a Medium
  // is pinned (user-ruled 2026-07-21). Non-Medium habits keep the habit reading.
  const isAllTypes = input.typeVocab.length > 0 && typeFilter == null;
  let totalDaysValue = daysActive;
  let totalDaysTracked = trackedDays;
  if (isAllTypes) {
    const appFirst = input.appActiveDays.length
      ? input.appActiveDays.reduce((a, b) => (a < b ? a : b))
      : today;
    const appFrom = isYear ? maxStr(`${sel.year}-01-01`, appFirst) : appFirst;
    totalDaysValue = input.appActiveDays.filter((d) => d >= appFrom && d <= scopeTo).length;
    totalDaysTracked = dayGap(appFrom, scopeTo) + 1;
  }

  const engagement: TileSpec[] = [
    streakTile(isYear ? "Last streak" : "Current streak", isYear ? lastRunOf(st) : st.currentRun, st, true),
    streakTile("Longest streak", longestRunOf(st), st, false),
    {
      label: "Total days active",
      value: groupInt(totalDaysValue),
      subtitle: `of ${groupInt(totalDaysTracked)} tracked`,
    },
    {
      label: "Avg days / week",
      value: decimal1(weeks > 0 ? daysActive / weeks : 0),
      delta: periodDelta(fSessions, dFrom, dTo, "week", "days") ?? undefined,
      subtitle: bestWk ? `best: ${bestWk.value} · ${bestWeekLabel(bestWk.key)}` : undefined,
    },
    {
      label: "Avg days / month",
      value: decimal1(months > 0 ? daysActive / months : 0),
      delta: periodDelta(fSessions, dFrom, dTo, "month", "days") ?? undefined,
      subtitle: bestMo ? `best: ${bestMo.value} · ${fmtMonY(bestMo.key)}` : undefined,
    },
  ];

  // ── Volume row ──
  const totMin = total(sessScoped).minutes;
  const titleCount = new Set(sessScoped.map((s) => s.entry_fk).filter(Boolean)).size;
  const bestDay = best(sessScoped, "day", "minutes");
  const bestWkMin = best(sessScoped, "week", "minutes");
  const bestMoMin = best(sessScoped, "month", "minutes");

  const volume: TileSpec[] = [
    { label: "Total hours", value: hoursWhole(totMin).replace(/h$/, ""), unit: "h", subtitle: `across ${groupInt(titleCount)} ${noun}` },
    {
      label: "Avg hours / active day",
      value: hoursMinutes(daysActive > 0 ? totMin / daysActive : 0),
      delta: activeDayDelta(fSessions, dFrom, dTo),
      subtitle: bestDay ? `best: ${hoursMinutes(bestDay.value)} · ${fmtDMY(bestDay.key)}` : undefined,
    },
    {
      label: "Avg hours / week",
      value: hoursTrim1(weeks > 0 ? totMin / weeks : 0).replace(/h$/, ""),
      unit: "h",
      delta: periodDelta(fSessions, dFrom, dTo, "week", "minutes") ?? undefined,
      subtitle: bestWkMin ? `best: ${hoursWhole(bestWkMin.value)} · ${bestWeekLabel(bestWkMin.key)}` : undefined,
    },
    {
      label: "Avg hours / month",
      value: hoursTrim1(months > 0 ? totMin / months : 0).replace(/h$/, ""),
      unit: "h",
      delta: periodDelta(fSessions, dFrom, dTo, "month", "minutes") ?? undefined,
      subtitle: bestMoMin ? `best: ${hoursWhole(bestMoMin.value)} · ${fmtMonY(bestMoMin.key)}` : undefined,
    },
  ];

  // ── Catalog row ──
  const fin = ent.filter((e) => e.status === "Finished");
  const drop = ent.filter((e) => e.status === "Dropped").length;
  const open = ent.filter((e) => e.status && !["Finished", "Dropped"].includes(e.status)).length;
  const withStatus = fin.length + drop + open;
  const finMinByEntry = new Map<string, number>();
  for (const s of sessScoped) if (s.entry_fk) finMinByEntry.set(s.entry_fk, (finMinByEntry.get(s.entry_fk) ?? 0) + (s.measure_kind === "time" ? s.value ?? 0 : 0));
  const longestFinished = fin
    .map((e) => ({ title: e.title, min: finMinByEntry.get(e.id) ?? 0 }))
    .sort((a, b) => b.min - a.min)[0];
  const rated = ent.filter((e) => e.rating != null);
  const avgRating = rated.length ? rated.reduce((a, e) => a + (e.rating ?? 0), 0) / rated.length : 0;

  // The degradation rule at the TILE tier (media-stats wireframe · Canvas C):
  // a tile hides when its metric is UNDEFINED in scope, not when it's zero. A
  // lifecycle-less Medium (YouTube channels — never Finished/Dropped, rarely
  // rated) has no completion, no avg-per-finished, no rating → those tiles drop
  // rather than showing "0%". "Titles tracked" always survives.
  const hasLifecycle = fin.length + drop > 0;
  const catalog: TileSpec[] = [];
  if (hasLifecycle) {
    catalog.push({ label: "Completion rate", value: `${Math.round((fin.length / withStatus) * 100)}`, unit: "%", subtitle: `${fin.length} finished · ${drop} dropped · ${open} open` });
  }
  if (fin.length > 0) {
    catalog.push({ label: "Avg hours / finished title", value: hoursWhole(finTotal(fin, finMinByEntry) / fin.length).replace(/h$/, ""), unit: "h", subtitle: longestFinished ? `longest: ${longestFinished.title} · ${hoursWhole(longestFinished.min)}` : undefined });
  }
  catalog.push({ label: `${Noun} tracked`, value: groupInt(ent.length) });
  if (rated.length) {
    catalog.push({ label: "Avg rating", value: avgRating.toFixed(1), unit: "★", subtitle: `n = ${rated.length} rated` });
  }

  // ── Distributions ──
  // By-type leads when the habit declares a Medium vocab AND no single type is
  // pinned (the Reading FINAL: four across on All types, three when scoped to
  // one type). Slot colours follow the declared vocab order.
  const typeSlot = new Map(input.typeVocab.map((t, i) => [t, CAT_SLOTS[i % CAT_SLOTS.length]]));
  const statusRows = distribute(ent, (e) => e.status, { order: STATUS_VOCAB_DISPLAY });
  const genreRows = distribute(ent, (e) => e.genre, { top: 6 });
  const ratingRows = distribute(ent, (e) => (e.rating != null ? stars(e.rating) : null), {
    order: [5, 4, 3, 2, 1].map(stars),
  });
  const distributions: DistColumnSpec[] = [];
  if (input.typeVocab.length > 0 && typeFilter == null) {
    const typeRows = distribute(ent, (e) => e.type, { order: input.typeVocab });
    distributions.push({
      title: "By type",
      rows: typeRows.map((r) => ({ label: r.key, value: String(r.value), pct: r.pct, colorVar: typeSlot.get(r.key) ?? "--cat-1", tip: `${r.key} · ${r.value} titles` })),
    });
  }
  distributions.push(
    { title: "By status", rows: statusRows.map((r) => ({ label: r.key, value: String(r.value), pct: r.pct, colorVar: STATUS_CAT[r.key] ?? "--cat-1", tip: `${r.key} · ${r.value} titles` })) },
    { title: "By genre", rows: genreRows.map((r) => ({ label: r.key, value: String(r.value), pct: r.pct, colorVar: "--cat-1", tip: `${r.key} · ${r.value} titles` })) },
    { title: "By rating", rows: ratingRows.map((r) => ({ label: r.key, value: String(r.value), pct: r.pct, colorVar: "--cat-3", tip: `${r.key} · ${r.value} titles` })) },
  );
  // The degradation rule (Dashboard Composition · the empty-states sheet §03):
  // a distribution over fewer than 2 distinct values doesn't render — the zone
  // compresses, survivors relocate; never skeletons. This is what a sparse
  // Medium (Media → YouTube: no ratings, one status) triggers.
  const shownDistributions = distributions.filter((d) => d.rows.length >= 2);

  // Survivor merge: a lone catalog tile + a lone distribution become one zone.
  // The count tile carries an in-tile LIST of every entry (channel) ranked by
  // total time, most first (the list-tile idiom — not a bar chart).
  const mergedCatalog =
    catalog.length === 1 && shownDistributions.length === 1
      ? {
          tile: {
            ...catalog[0],
            list: {
              dateLine: "",
              rows: leaderboard(sessScoped, ent, "minutes", ent.length).map((lr) => ({
                k: lr.title,
                v: `${groupInt(lr.value / 60)} h`,
              })),
            },
          } as TileSpec,
          dist: shownDistributions[0],
        }
      : null;

  // ── Leaderboards ──
  const longestRuns = leaderboard(sessScoped, ent, "minutes", 5);
  const mostDays = leaderboard(sessScoped, ent, "days", 5);
  const hall = ent.filter((e) => e.rating === 5).map((e) => ({ title: e.title, initial: initialism(e.title) }));
  const leaderboards: LeaderColumnSpec[] = [
    { title: "Longest runs", rows: longestRuns.map((r, i) => ({ rank: i + 1, title: r.title, value: `${groupInt(r.value / 60)} h`, pct: r.pct })) },
    { title: "Most days", rows: mostDays.map((r, i) => ({ rank: i + 1, title: r.title, value: `${groupInt(r.value)} d`, pct: r.pct })) },
    { title: "5-star hall", meta: `${hall.length} titles`, hall },
  ];
  // Degradation: drop empty leaderboard columns (the 5-star hall hides when a
  // scope has nothing rated 5 — the wireframe's YouTube case).
  const shownLeaderboards = leaderboards.filter((c) =>
    c.hall ? c.hall.length > 0 : (c.rows?.length ?? 0) > 0,
  );

  // ── Trends ──
  const dm = dayMinutes(fSessions);
  const line: number[] = [];
  for (let i = 29; i >= 0; i--) line.push((dm.get(dayFromIndex(dayIndex(today) - i)) ?? 0) / 60);
  const lineMax = Math.max(2, ...line);
  const vmax = Math.ceil(lineMax / 2) * 2;
  const xticks = [0, 10, 20, 29].map((i) => {
    const d = dayFromIndex(dayIndex(today) - (29 - i));
    return { i, label: `${Number(d.slice(8))} ${MON[Number(d.slice(5, 7)) - 1]}` };
  });

  const sparkYear = isYear ? sel.year : yearKey(today);
  const spark = MON.map((mo, i) => {
    const mk = `${sparkYear}-${String(i + 1).padStart(2, "0")}`;
    const hrs = ([...dm.entries()].filter(([d]) => monthKey(d) === mk).reduce((a, [, v]) => a + v, 0)) / 60;
    // Month slots are NAMED dials (--month-jan … --month-dec), not numbered.
    return { label: mo[0], hours: hrs, monthVar: `--month-${mo.toLowerCase()}` };
  });
  const sparkMax = Math.max(1, ...spark.map((s) => s.hours));
  // spark delta: current vs previous month (percentage), within the spark year.
  const nowMonthIdx = isYear ? lastMonthWithData(spark) : Number(today.slice(5, 7)) - 1;
  const sparkDelta = monthOverMonth(spark, nowMonthIdx);

  // ── Heatmap (trailing 53 weeks to today, scope-independent) ──
  // By-Type heatmap: each cell's dominant type by minutes → its categorical
  // slot (the FINAL's reference drawing). Built from the type-filtered sessions
  // so a scoped face is single-type. Empty when the habit has no Medium vocab.
  const dayDominantCat = new Map<string, string>();
  if (input.typeVocab.length > 0) {
    const perDay = new Map<string, Map<string, number>>();
    for (const s of fSessions) {
      if (s.measure_kind !== "time" || !s.entry_fk) continue;
      const t = typeOfEntry.get(s.entry_fk);
      if (t == null) continue;
      const byType = perDay.get(s.day) ?? perDay.set(s.day, new Map()).get(s.day)!;
      byType.set(t, (byType.get(t) ?? 0) + (s.value ?? 0));
    }
    for (const [day, byType] of perDay) {
      let bestType: string | null = null;
      let bestMin = -1;
      for (const [t, min] of byType) if (min > bestMin) ((bestMin = min), (bestType = t));
      if (bestType) dayDominantCat.set(day, typeSlot.get(bestType) ?? "--cat-1");
    }
  }
  const cells = heatmapCells(dm, today, 53, (day) => dayDominantCat.get(day) ?? null);
  const monthsHdr = heatmapMonths(today);
  const legendTypes = typeFilter ? [typeFilter] : input.typeVocab;
  const heatLegend = legendTypes.map((t) => ({ label: t, colorVar: typeSlot.get(t) ?? "--cat-1" }));
  const bDayAll = best(fSessions, "day", "minutes");
  const bWkAll = best(fSessions, "week", "minutes");
  const bMoAll = best(fSessions, "month", "minutes");
  const trio: TileSpec[] = [
    { label: "Best day", value: bDayAll ? hoursMinutes(bDayAll.value) : "—", subtitle: bDayAll ? fmtDMY(bDayAll.key) : undefined },
    { label: "Best week", value: bWkAll ? hoursWhole(bWkAll.value) : "—", subtitle: bWkAll ? `wk of ${fmtDMY(bWkAll.key)}` : undefined },
    { label: "Best month", value: bMoAll ? hoursWhole(bMoAll.value) : "—", subtitle: bMoAll ? fmtMonY(bMoAll.key) : undefined },
  ];

  // ── Masthead + scope tabs ──
  const years: string[] = [];
  if (!empty)
    for (let y = Number(yearKey(fullFirst!)); y <= Number(yearKey(today)); y++) years.push(String(y));
  const tabs = [{ key: "all", label: "All Time" }, ...years.reverse().map((y) => ({ key: y, label: y }))];
  const typeTabs =
    input.typeVocab.length > 0
      ? [{ key: null as string | null, label: "All types" }, ...input.typeVocab.map((t) => ({ key: t as string | null, label: t }))]
      : [];

  return {
    colorVar,
    masthead: {
      name: input.name,
      heat: empty ? null : heatChip(sessions, today),
      empty,
      sinceLive: empty
        ? "Tracking since — · no sessions logged yet"
        : `Tracking since ${fmtDMY(fullFirst!)} · ${hoursWhole(total(sessions).minutes)} all-time across ${groupInt(new Set(sessions.map((s) => s.entry_fk).filter(Boolean)).size)} titles`,
      tabs,
      activeKey: sel.kind === "all" ? "all" : sel.year,
      typeTabs,
      activeType: typeFilter,
    },
    engagement,
    volume,
    catalog: mergedCatalog ? [] : catalog,
    distributions: mergedCatalog ? [] : shownDistributions,
    mergedCatalog,
    leaderboards: shownLeaderboards,
    trend: {
      caption: "Last 30 days · hours / day",
      line,
      vmax,
      xticks,
      sparkTitle: `Hours by month · ${sparkYear}`,
      sparkDelta,
      spark,
      sparkMax,
    },
    heatmap: {
      cells,
      months: monthsHdr,
      trio,
      // The Intensity·By-Type toggle only exists on the All-types face — a
      // single pinned type has no meaningful by-type breakdown (user-ruled
      // 2026-07-21), so it collapses to Intensity only.
      hasTypes: input.typeVocab.length > 0 && typeFilter == null,
      legend: heatLegend,
    },
  };
}

// ── Local helpers ─────────────────────────────────────────────────────────────

const maxStr = (a: string, b: string) => (a >= b ? a : b);
const minStr = (a: string, b: string) => (a <= b ? a : b);

const finTotal = (fin: EntryRow[], byEntry: Map<string, number>): number =>
  fin.reduce((a, e) => a + (byEntry.get(e.id) ?? 0), 0);

const longestRunOf = (st: { runs: Run[] }): Run | null =>
  st.runs.reduce<Run | null>((b, r) => (!b || r.days > b.days ? r : b), null);

const lastRunOf = (st: { runs: Run[] }): Run | null => st.runs[st.runs.length - 1] ?? null;

/** A streak stat tile with a date line + a three-row prior/next streak table. */
function streakTile(label: string, run: Run | null, st: { runs: Run[]; currentRun: Run | null }, isCurrent: boolean): TileSpec {
  const value = run ? `${run.days}` : "0";
  const dateLine = run
    ? isCurrent && run === st.currentRun
      ? `since ${fmtDMY(run.start)}`
      : fmtRange(run.start, run.end)
    : "—";
  // Subtitle list: for current → recent prior runs; for longest → next top-3.
  const others = st.runs.filter((r) => r !== run);
  const picked = isCurrent
    ? [...others].sort((a, b) => b.end.localeCompare(a.end)).slice(0, 3)
    : [...others].sort((a, b) => b.days - a.days).slice(0, 3);
  return {
    label,
    value,
    unit: "d",
    list: { dateLine, rows: picked.map((r) => ({ k: fmtRange(r.start, r.end), v: `${r.days}d` })) },
  };
}

/** Avg-active-day delta in minutes (chip unit "m"), trailing window vs prior. */
function activeDayDelta(sessions: SessionRow[], from: string, to: string): DeltaChip | undefined {
  const avg = (f: string, t: string) => {
    const rows = scoped(sessions, { from: f, to: t });
    const d = distinctDays(rows);
    return d > 0 ? total(rows).minutes / d : 0;
  };
  const len = dayGap(from, to);
  const prevTo = dayFromIndex(dayIndex(from) - 1);
  const prevFrom = dayFromIndex(dayIndex(from) - 1 - len);
  if (scoped(sessions, { from: prevFrom, to: prevTo }).length === 0) return undefined;
  return deltaChip(avg(from, to) - avg(prevFrom, prevTo), "m");
}

const lastMonthWithData = (spark: { hours: number }[]): number => {
  for (let i = spark.length - 1; i >= 0; i--) if (spark[i].hours > 0) return i;
  return 0;
};

/** Month-over-month percentage chip ("▼ 27%"), or null with no prior month. */
function monthOverMonth(spark: { hours: number }[], idx: number): DeltaChip | null {
  if (idx <= 0) return null;
  const cur = spark[idx].hours;
  const prev = spark[idx - 1].hours;
  if (prev <= 0) return null;
  const pct = ((cur - prev) / prev) * 100;
  return { text: `${pct < 0 ? "▼" : "▲"} ${Math.abs(Math.round(pct))}% vs last month`, down: pct < 0 };
}
