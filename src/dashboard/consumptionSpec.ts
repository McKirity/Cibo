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
  stars,
  type DeltaChip,
} from "../metrics/format";
import {
  activeDayDelta,
  bestWeekLabel,
  buildTrendWindow,
  CAT_SLOTS,
  initialism,
  lastMonthWithData,
  lastRunOf,
  longestRunOf,
  maxStr,
  monthlySpark,
  monthOverMonth,
  resolveScopeWindow,
  STATUS_CAT,
  streakTile,
  vsYear,
  yearOverYearDelta,
  yearTabs,
} from "./specShared";

// ── Model types (the spec the renderer walks) ─────────────────────────────────

export interface TileSpec {
  label: string;
  value: string;
  unit?: string;
  subtitle?: string;
  delta?: DeltaChip;
  /** Streak tiles: a date line above the value + a key/value subtitle table.
   *  Rows may carry an entryId (the merged-catalog hall's door — chunk 5). */
  list?: { dateLine: string; rows: { k: string; v: string; entryId?: string }[] };
  /** Heading-size value — name-valued tiles (the categorical family's
   *  Current-value) and the entry First/Last-day date tiles (`tv sm`). */
  big?: boolean;
}

export interface DistColumnSpec {
  title: string;
  meta?: string;
  rows: { label: string; value: string; pct: number; colorVar: string; tip: string }[];
}

export interface LeaderColumnSpec {
  title: string;
  meta?: string;
  rows?: { rank: number; title: string; value: string; pct: number; entryId?: string }[];
  hall?: { title: string; initial: string; entryId?: string; cover?: string | null }[];
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
   * catalog group + Distributions panel. hallTitle carries the type-specific
   * noun ("Channels" for YouTube, else "Titles") so the renderer never
   * hardcodes it.
   */
  mergedCatalog: { tile: TileSpec; dist: DistColumnSpec; hallTitle: string } | null;
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
  /** "Archiving ends any running streak" — the CURRENT streak tile reads 0
   *  while archived (user-ruled 2026-08-06, audit fork D — the minimal cut:
   *  streaks clamp, every other tile keeps its face per the 08-04 option-A
   *  ruling's silence on stats). The creation template's idiom, ported. */
  archived: boolean;
  sessions: SessionRow[];
  entries: EntryRow[];
  finalized: Set<string>;
  today: string;
  /** The habit's declared entry-level Medium picklist (empty = no sub-scope, no by-type panel). */
  typeVocab: string[];
  /** Distinct days ANY habit was active app-wide — the All-types "Total days active" reading. */
  appActiveDays: string[];
}

// status → categorical slot (matches the frozen Gaming FINAL's pills).
// The five seeded statuses are IMMUTABLE ANCHORS (user-ruled 2026-07-22): they
// can never be renamed or removed, so deriving semantics from the literal
// strings ("Finished"/"Dropped" → completion) is safe by ruling. User-ADDED
// statuses are legal (and removable); they render AFTER the anchors, coloured
// from the slots the anchors don't use — never silently dropped.
const STATUS_VOCAB_DISPLAY = ["Current", "Finished", "Dropped", "Planned", "Hiatus"];
const EXTRA_STATUS_SLOTS = CAT_SLOTS.filter((s) => !Object.values(STATUS_CAT).includes(s));

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
  // Keyed to the seeded Medium value — case-insensitive so a casing rename
  // ("Youtube" → "YouTube") doesn't silently revert the hall (2026-07-30).
  const isYouTube = typeFilter?.toLowerCase() === "youtube";
  const noun = isYouTube ? "channels" : "titles";
  const Noun = isYouTube ? "Channels" : "Titles";

  const fullFirst = sessions.map((s) => s.day).sort()[0] ?? null;
  const allDays = fSessions.map((s) => s.day).sort();
  const firstDay = allDays[0] ?? fullFirst;
  const empty = fullFirst == null;

  // Scope window bounds (clamped to the tracked span and to today).
  const isYear = sel.kind === "year";
  const { scopeFrom, scopeTo } = resolveScopeWindow(sel, firstDay, today, empty);

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
    // Archived → the running streak is ENDED, not live (fork D; the year
    // face's "Last streak" is historical and stands as-is).
    input.archived && !isYear
      ? { label: "Current streak", value: "0", unit: "d", subtitle: "archived — streaks ended" }
      : streakTile(isYear ? "Last streak" : "Current streak", isYear ? lastRunOf(st) : st.currentRun, st, true),
    streakTile("Longest streak", longestRunOf(st), st, false),
    {
      label: "Total days active",
      value: groupInt(totalDaysValue),
      subtitle: `of ${groupInt(totalDaysTracked)} tracked`,
    },
    {
      label: "Avg days / week",
      value: decimal1(weeks > 0 ? daysActive / weeks : 0),
      delta: vsYear(periodDelta(fSessions, dFrom, dTo, "week", "days"), isYear, isYear ? sel.year : ""),
      subtitle: bestWk ? `best: ${bestWk.value} · ${bestWeekLabel(bestWk.key)}` : undefined,
    },
    {
      label: "Avg days / month",
      value: decimal1(months > 0 ? daysActive / months : 0),
      delta: vsYear(periodDelta(fSessions, dFrom, dTo, "month", "days"), isYear, isYear ? sel.year : ""),
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
      delta: vsYear(activeDayDelta(fSessions, dFrom, dTo), isYear, isYear ? sel.year : ""),
      subtitle: bestDay ? `best: ${hoursMinutes(bestDay.value)} · ${fmtDMY(bestDay.key)}` : undefined,
    },
    {
      label: "Avg hours / week",
      value: hoursTrim1(weeks > 0 ? totMin / weeks : 0).replace(/h$/, ""),
      unit: "h",
      delta: vsYear(periodDelta(fSessions, dFrom, dTo, "week", "minutes"), isYear, isYear ? sel.year : ""),
      subtitle: bestWkMin ? `best: ${hoursWhole(bestWkMin.value)} · ${bestWeekLabel(bestWkMin.key)}` : undefined,
    },
    {
      label: "Avg hours / month",
      value: hoursTrim1(months > 0 ? totMin / months : 0).replace(/h$/, ""),
      unit: "h",
      delta: vsYear(periodDelta(fSessions, dFrom, dTo, "month", "minutes"), isYear, isYear ? sel.year : ""),
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
  // User-added statuses: anchors first in canonical order, extras after
  // (alphabetical until the vocab wiring carries a real sort_order).
  const extraStatuses = [
    ...new Set(
      ent
        .map((e) => e.status)
        .filter((s): s is string => s != null && STATUS_CAT[s] === undefined),
    ),
  ].sort();
  const statusSlot = new Map<string, string>(Object.entries(STATUS_CAT));
  extraStatuses.forEach((s, i) =>
    statusSlot.set(s, EXTRA_STATUS_SLOTS[i % EXTRA_STATUS_SLOTS.length]),
  );
  const statusRows = distribute(ent, (e) => e.status, {
    order: [...STATUS_VOCAB_DISPLAY, ...extraStatuses],
  });
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
    { title: "By status", rows: statusRows.map((r) => ({ label: r.key, value: String(r.value), pct: r.pct, colorVar: statusSlot.get(r.key) ?? "--cat-1", tip: `${r.key} · ${r.value} titles` })) },
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
                entryId: lr.entryId,
              })),
            },
          } as TileSpec,
          dist: shownDistributions[0],
          hallTitle: Noun,
        }
      : null;

  // ── Leaderboards ──
  const longestRuns = leaderboard(sessScoped, ent, "minutes", 5);
  const mostDays = leaderboard(sessScoped, ent, "days", 5);
  const hall = ent
    .filter((e) => e.rating === 5)
    .map((e) => ({ title: e.title, initial: initialism(e.title), entryId: e.id, cover: e.cover }));
  const leaderboards: LeaderColumnSpec[] = [
    { title: "Longest runs", rows: longestRuns.map((r, i) => ({ rank: i + 1, title: r.title, value: `${groupInt(r.value / 60)} h`, pct: r.pct, entryId: r.entryId })) },
    { title: "Most days", rows: mostDays.map((r, i) => ({ rank: i + 1, title: r.title, value: `${groupInt(r.value)} d`, pct: r.pct, entryId: r.entryId })) },
    { title: "5-star hall", meta: `${hall.length} titles`, hall },
  ];
  // Degradation: drop empty leaderboard columns (the 5-star hall hides when a
  // scope has nothing rated 5 — the wireframe's YouTube case).
  const shownLeaderboards = leaderboards.filter((c) =>
    c.hall ? c.hall.length > 0 : (c.rows?.length ?? 0) > 0,
  );

  // ── Trends ──
  // SCOPE-FOLLOWING (user-ruled 2026-07-22, live iteration — "the original
  // scope is completely wrong"; overrides the FINALs' always-trailing window,
  // both templates): a pinned year windows the 30-day line to that year's tail
  // and the heatmap to that calendar year; All Time keeps today's trailing
  // windows. The records trio stays all-time (the explicitly-ruled exception).
  const dm = dayMinutes(fSessions);
  const trendEnd = scopeTo; // today, or min(31 Dec of the pinned year, today)
  // Window buckets — All Time: trailing 30 days at DAY grain; a pinned year: the
  // whole year at WEEK grain with every-4th-week ISO ticks (the shared builder).
  const { buckets, xticks, windowLabel, grainNoun } = buildTrendWindow(isYear ? sel.year : "", isYear, trendEnd);
  const line = buckets.map((b) => b.reduce((a, d) => a + (dm.get(d) ?? 0), 0) / 60);
  const lineMax = Math.max(2, ...line);
  const vmax = Math.ceil(lineMax / 2) * 2;

  const sparkYear = isYear ? sel.year : yearKey(today);
  const spark = monthlySpark(dm, sparkYear, 60).map((s) => ({
    label: s.label,
    hours: s.value,
    monthVar: s.monthVar,
  }));
  const sparkMax = Math.max(1, ...spark.map((s) => s.hours));
  // spark delta: current vs previous month (percentage), within the spark year.
  const nowMonthIdx = isYear ? lastMonthWithData(spark.map((s) => s.hours)) : Number(today.slice(5, 7)) - 1;
  // Year scope → year-over-year (the 2026-07-22 ruling); All Time keeps the
  // month-over-month reading of the current year's spark.
  const sparkDelta = isYear
    ? yearOverYearDelta(dm, sel.year, trendEnd)
    : monthOverMonth(spark.map((s) => s.hours), nowMonthIdx);

  // ── Heatmap (53 weeks ending at the scope's edge — scope-following per the
  //    2026-07-22 ruling; cells outside a pinned year are hidden) ──
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
  const cells = heatmapCells(
    dm,
    trendEnd,
    53,
    (day) => dayDominantCat.get(day) ?? null,
    isYear ? `${sel.year}-01-01` : null,
  );
  const monthsHdr = heatmapMonths(trendEnd, 53, isYear ? `${sel.year}-01-01` : null);
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
  const { tabs } = yearTabs(fullFirst, today);
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
      caption: `${windowLabel} · hours / ${grainNoun}`,
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
// The streak/delta/trend helpers + categorical literals live in ./specShared
// (shared with the creation + simple specs); only consumption-specific bits stay.

const finTotal = (fin: EntryRow[], byEntry: Map<string, number>): number =>
  fin.reduce((a, e) => a + (byEntry.get(e.id) ?? 0), 0);
