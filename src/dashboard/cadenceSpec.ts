/**
 * The cadence chassis composition spec (Build step 6 chunk 4) — spec-then-
 * render for all four scales (weekly · monthly · quarterly · yearly) over ONE
 * shared model. Monthly defines the chassis (the frozen
 * `monthly-cadence.html`); the other scales compose over it per their FINALs:
 * weekly SUBTRACTS (strip headliner · milestone cards · no composition, no
 * review), quarterly swaps the headliner for the 13-week ribbon + week-grain
 * rows, yearly grows the ribbon to 53 weeks + month-grain rows + the stacked
 * composition toggle + the year-in-review.
 *
 * Everything is definition-driven off the habit rows — no habit-key branch
 * anywhere. The expansion shapes derive: project → entry strips · Writing's
 * card-within-card falls out of "two measures + categoricals" · categorical
 * simple → per-value strips · range → ranges line + flag strips · measureless/
 * measured simples don't expand ("the mini-cells say it all").
 *
 * Chunk-4 rulings implemented (2026-07-23):
 *  - Week-majority geometry (ratified): majority-owned weeks, ghost cells,
 *    spilled days still counted day-granularly.
 *  - The expansion list cap: 10 by default (Settings → Tracking → Metrics),
 *    longest-first; the dashed "+ N more" expander closes the list.
 *  - The yearly heat wears the theme base accent (ratified `--accent`).
 *  - The measure micro-bars draw REAL per-bucket amounts (the FINAL's
 *    pseudo-random heights were annotated "illustrative texture, not drawn
 *    data").
 */
import {
  composition,
  crossDays,
  dayCells,
  isoWeekNum,
  majorityWeeks,
  MONTH_ABBR,
  monthIntensity,
  monthSlot,
  periodBounds,
  quarterOf,
  stackedComposition,
  verdictStats,
  weekIntensity,
  type CadenceScale,
  type CompositionRow,
  type CrossDay,
  type DayCellState,
  type PeriodBounds,
} from "../metrics/cadence";
import { dayFromIndex, dayIndex, monthKey, weekStart, weekStartDow, weekThursday } from "../metrics/dates";
import {
  circularMeanMinutes,
  clockMinutes as minOfDay,
  durationMinutes as rangeMinutes,
  fmtHM as fmtClock,
} from "../metrics/clockMath";
import { escapeHtml, groupInt, MONTHS_LONG } from "../metrics/format";
import { maxStr } from "./specShared";
import { streaks, wavesForEntry, type SessionRow } from "../metrics/shapes";
import type { CadenceData, CadHabit, CadSession } from "./useCadenceData";

// ── Model types ───────────────────────────────────────────────────────────────

export interface VerdictCellVM {
  day: string | null; // null = blank/ghost filler
  label: string; // the day number ("17") or ""
  cls: string; // g1..g4 · gap · unf · blank · ghost · future
  tip: string | null;
  best: boolean;
  /** Habits done (null = unknown/future) + the roster size — the strip face prints them. */
  done: number | null;
  active: number;
}

export interface RibbonColVM {
  weekNum: number;
  /** 7, Mon-first. `day` is null for a spilled ghost cell — it belongs to the
   *  neighbouring period, so it is not this ribbon's door. */
  cells: { cls: string; tip: string | null; day: string | null }[];
  /** A section boundary follows this column (quarterly: month · yearly: quarter). */
  monthTick: boolean;
}

export interface StatTileVM {
  label: string;
  value: string;
  unit: string | null;
  sub: string;
  door: boolean;
  /** The day the door opens — live since Daily state 2 landed (2026-07-27). */
  doorDay?: string | null;
}

export interface StripVM {
  title: string;
  door: boolean; // entries are doors; vocab values are not
  /** The door's destination — set exactly when `door` is true (entry strips). */
  entryId?: string;
  total: string;
  best: string;
  cells: DayCellState[] | null; // engaged marks at the row grain ("d"/"e"/"u"/"f")
  inner?: boolean; // writing card-within-card inner line
}

export interface HabitRowVM {
  key: string;
  name: string;
  colour: string;
  total: string;
  totalSub: string | null;
  best: string;
  cells: { states: DayCellState[] } | { intensities: number[] };
  done: string; // "22/28"
  expandable: boolean;
  expansion: null | {
    storyCard: null | { groups: { heading: string; strips: StripVM[] }[]; story: StripVM[] };
    /** ALL ranked strips; the renderer shows `cap` and the "+ N more" expander reveals the rest. */
    strips: StripVM[];
    cap: number;
    more: number; // strips.length − cap (0 when everything fits)
    sleepLine: null | SleepLineVM;
    measureStrip: null | { label: string; bars: number[] }; // 0–1 normalized
  };
}

export interface SleepLineVM {
  bedLabel: string;
  wakeLabel: string;
  bed: { left: number; width: number; avg: number }; // % of the axis
  wake: { left: number; width: number; avg: number };
  ticks: { left: number; label: string }[];
}

export interface ReviewColVM {
  label: string;
  lines: { html: string }[]; // pre-composed text with <b>/door spans
}

export interface MilestoneVM {
  title: string;
  when: string;
  kind: "landmark" | "crossing";
}

export interface CadenceModel {
  scale: CadenceScale;
  bounds: PeriodBounds;
  header: {
    id: string;
    ctx: string;
    finalized: string; // "28 of 30 days finalized"
    up: { scale: CadenceScale; label: string }[];
    prevTip: string;
    nextTip: string;
    nextDead: boolean;
  };
  /** The per-scale heat ink (a CSS value for `--heat-ink`). */
  heatInk: string;
  verdict:
    | { kind: "calendar"; lead: number; cells: VerdictCellVM[] }
    | { kind: "strip"; cells: VerdictCellVM[] }
    | { kind: "ribbon"; cols: RibbonColVM[]; monthLabels: { label: string; col: number }[] | null };
  stats: StatTileVM[];
  compositionRows: CompositionRow[] | null;
  stacked: null | {
    monthly: { totals: number[]; segs: { colour: string; minutes: number }[][] };
    weekly: { totals: number[]; segs: { colour: string; minutes: number }[][] };
    legend: { name: string; colour: string; minutes: number }[];
    monthLabels: string[];
    /** ISO week number per weekly bar — the x axis the weekly view had none of
     *  (2026-08-10). Every bar carries its number; the renderer thins them. */
    weekLabels: number[];
  };
  milestoneCards: MilestoneVM[] | null; // weekly only
  review: ReviewColVM[] | null; // month/quarter/year
  reviewTitle: string | null;
  rows: HabitRowVM[];
  cellHeaders: { kind: "daynums"; count: number } | { kind: "weeknums"; nums: number[] } | { kind: "months" };
  bestColLabel: string;
  rowLegendSleep: boolean;
}

export interface CadenceOptions {
  /** The expansion list cap (Settings → Tracking → Metrics; default 10). */
  listCap?: number;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

const fmtH = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} m`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")} m`;
};
const fmtHShort = (min: number): string => `${Math.round(min / 60)} h`;
const dayLabel = (day: string): string =>
  `${MONTH_ABBR[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
/** A day's own weekday NAME — independent of the week-start setting. */
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayName = (day: string): string => DAY_NAMES[new Date(dayIndex(day) * 86_400_000).getUTCDay()];
/** A day's COLUMN under the configured week start (0 = the start column). */
const dow = (day: string): number =>
  (new Date(dayIndex(day) * 86_400_000).getUTCDay() - weekStartDow() + 7) % 7;

// minOfDay / rangeMinutes / fmtClock / the circular mean live in
// ../metrics/clockMath (imported under their old local names above; the mean's
// rounded/null canonicalization is documented in that module's header).

// ── The builder ───────────────────────────────────────────────────────────────

export function buildCadenceModel(
  data: CadenceData,
  scale: CadenceScale,
  anchor: string,
  today: string,
  opts: CadenceOptions = {},
): CadenceModel {
  const listCap = opts.listCap ?? 10;
  const bounds = periodBounds(scale, anchor);
  const inPeriod = (d: string) => d >= bounds.from && d <= bounds.to;
  // Computed ONCE and threaded through (ribbon · stacked · headers · rows ·
  // expansions all read it — this was re-derived ~6× per build).
  const ownedWeeks = majorityWeeks(bounds);

  // ── The roster: active now OR with sessions in the period ──
  const sessionsByHabit = new Map<string, CadSession[]>();
  for (const s of data.sessions) {
    (sessionsByHabit.get(s.habitId) ?? sessionsByHabit.set(s.habitId, []).get(s.habitId)!).push(s);
  }
  const roster = data.habits.filter(
    (h) => !h.archived || (sessionsByHabit.get(h.id) ?? []).some((s) => inPeriod(s.day)),
  );

  const periodSessions = new Map<string, CadSession[]>();
  const playedByHabit = new Map<string, Set<string>>();
  for (const h of roster) {
    const rows = (sessionsByHabit.get(h.id) ?? []).filter((s) => inPeriod(s.day));
    periodSessions.set(h.id, rows);
    playedByHabit.set(h.id, new Set(rows.map((s) => s.day)));
  }

  // ── Cross-habit day verdicts + the stat block ──
  const days = crossDays(
    bounds.from, bounds.to,
    roster.map((h) => playedByHabit.get(h.id)!),
    data.finalized, today,
  );
  const activeCount = roster.length;

  const habitMinutes = new Map<string, number>();
  for (const h of roster) {
    let min = 0;
    for (const s of periodSessions.get(h.id)!) if (s.kind === "time") min += s.value ?? 0;
    habitMinutes.set(h.id, min);
  }
  const statsRaw = verdictStats(
    days,
    roster.map((h) => [h.name, habitMinutes.get(h.id) ?? 0] as const),
    activeCount,
  );

  const dayTips = new Map<string, string>();
  for (const d of days) {
    dayTips.set(
      d.day,
      d.future
        ? ""
        : !d.finalized
          ? `${dayName(d.day)} ${dayLabel(d.day)} · unfinalized — unknown`
          : d.done === 0
            ? `${dayName(d.day)} ${dayLabel(d.day)} · gap day · 0 habits`
            : `${dayName(d.day)} ${dayLabel(d.day)} · ${d.done} of ${activeCount} habits`,
    );
  }
  const bestDay = statsRaw.bestDay?.day ?? null;

  const cellCls = (d: CrossDay): string =>
    d.future ? "blank future" : !d.finalized ? "unf" : d.done === 0 ? "gap" : `g${d.stage}`;

  // ── The verdict zone per scale ──
  let verdict: CadenceModel["verdict"];
  let heatInk: string;
  const dayCellVM = (d: CrossDay): VerdictCellVM => ({
    day: d.day,
    label: String(Number(d.day.slice(8, 10))),
    cls: cellCls(d),
    tip: dayTips.get(d.day) || null,
    best: d.day === bestDay,
    done: d.future || !d.finalized ? null : d.done,
    active: activeCount,
  });
  if (scale === "month") {
    heatInk = `var(${monthSlot(bounds.from)})`;
    verdict = { kind: "calendar", lead: dow(bounds.from), cells: days.map(dayCellVM) };
  } else if (scale === "week") {
    heatInk = `var(${monthSlot(bounds.from)})`;
    verdict = { kind: "strip", cells: days.map(dayCellVM) };
  } else {
    // quarter · year — the continuous ribbon over majority-owned weeks
    heatInk =
      scale === "quarter"
        ? `color-mix(in oklch, var(${monthSlot(`${bounds.from.slice(0, 4)}-${String((quarterOf(bounds.from) - 1) * 3 + 2).padStart(2, "0")}`)}), var(--window-background) var(--quarter-wash-mix))`
        : "var(--accent)"; // RATIFIED 2026-07-23 — the year wears the theme base accent
    const weeks = ownedWeeks;
    const byDay = new Map(days.map((d) => [d.day, d]));
    // A week's owner section = its Thursday's month (quarterly ticks) or
    // quarter (yearly ticks); the tick draws AFTER the section's last column.
    // The dial's Thursday, never `ws + 3` (see metrics/cadence.majorityWeeks):
    // under a Sunday start the offset is 4, and a hardcoded 3 put every
    // quarterly month tick and every yearly month label on the wrong week.
    const thuOf = (ws: string) => weekThursday(ws);
    const sectionOf = (ws: string) =>
      scale === "quarter" ? thuOf(ws).slice(5, 7) : String(quarterOf(thuOf(ws)));
    const cols: RibbonColVM[] = weeks.map((ws, i) => {
      const cells = Array.from({ length: 7 }, (_, j) => {
        const day = dayFromIndex(dayIndex(ws) + j);
        const d = byDay.get(day);
        if (!d) return { cls: "ghost", tip: null, day: null }; // spilled (rides the neighbour period)
        if (d.future) return { cls: "blank", tip: null, day: null };
        if (!d.finalized) return { cls: "unf", tip: dayTips.get(day) || null, day };
        // Stage 0 (finalized, nothing logged) wears the calendar's gap face,
        // never the lowest wash — user-ruled 2026-07-30: "the ribbons should
        // distinguish gap days".
        if (d.stage === 0) return { cls: "gap", tip: dayTips.get(day) || null, day };
        return { cls: `i${d.stage - 1}`, tip: dayTips.get(day) || null, day };
      });
      const next = weeks[i + 1];
      return {
        weekNum: isoWeekNum(ws),
        cells,
        monthTick: next != null && sectionOf(next) !== sectionOf(ws),
      };
    });
    // Yearly month labels ALIGN to their sections (ruled at the chunk-4 GUI
    // pass — the FINAL's even spread drifts off the real week columns): each
    // label sits at the column of the first week its month owns.
    let monthLabels: { label: string; col: number }[] | null = null;
    if (scale === "year") {
      monthLabels = [];
      for (let mo = 1; mo <= 12; mo++) {
        const idx = weeks.findIndex((ws) => Number(thuOf(ws).slice(5, 7)) === mo);
        if (idx >= 0) monthLabels.push({ label: MONTH_ABBR[mo - 1].toUpperCase(), col: idx });
      }
    }
    verdict = { kind: "ribbon", cols, monthLabels };
  }

  // ── The six stat tiles ──
  const s = statsRaw;
  const stats: StatTileVM[] = [
    {
      label: "Days complete",
      value: String(s.complete),
      unit: `/${s.finalized}`,
      sub: s.finalized > 0 ? `${s.completePct}% complete` : "",
      door: false,
    },
    {
      label: "Avg habits / day",
      value: s.avgHabitsPerDay != null ? s.avgHabitsPerDay.toFixed(1) : "—",
      unit: null,
      sub: "",
      door: false,
    },
    {
      label: "Total hours",
      value: String(Math.round(s.totalMinutes / 60)),
      unit: "h",
      sub: s.topHabit ? `most: ${s.topHabit.name} · ${fmtHShort(s.topHabit.minutes)}` : "",
      door: false,
    },
    {
      label: "Longest streak",
      value: s.longestStreak ? String(s.longestStreak.days) : "0",
      unit: "d",
      sub: s.longestStreak
        ? `${dayLabel(s.longestStreak.start)} – ${dayLabel(s.longestStreak.end)}`
        : "",
      door: false,
    },
    {
      label: "Gap days",
      value: String(s.gapDays.length),
      unit: null,
      sub:
        s.gapDays.length === 0
          ? ""
          : s.gapDays.length <= 3
            ? s.gapDays.map(dayLabel).join(" · ")
            : `${s.gapDays.slice(0, 3).map(dayLabel).join(" · ")} + ${s.gapDays.length - 3} more`,
      door: false,
    },
    {
      label: "Best day",
      value: s.bestDay ? dayLabel(s.bestDay.day) : "—",
      unit: null,
      sub: s.bestDay ? `${s.bestDay.done} of ${s.bestDay.active} habits` : "",
      door: s.bestDay != null,
      doorDay: s.bestDay?.day ?? null,
    },
  ];

  // ── Composition (month and up) ──
  const compositionRows =
    scale === "week"
      ? null
      : composition(
          roster.map((h) => ({
            habitKey: h.key,
            name: h.name,
            colour: h.colour,
            minutes: habitMinutes.get(h.id) ?? 0,
          })),
        );

  let stacked: CadenceModel["stacked"] = null;
  if (scale === "year") {
    const y = bounds.from.slice(0, 4);
    const monthBuckets = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`);
    const weekBuckets = ownedWeeks;
    const perHabit = roster
      .filter((h) => (habitMinutes.get(h.id) ?? 0) > 0)
      .map((h) => {
        const dayMin = new Map<string, number>();
        for (const sess of periodSessions.get(h.id)!)
          if (sess.kind === "time") dayMin.set(sess.day, (dayMin.get(sess.day) ?? 0) + (sess.value ?? 0));
        return { colour: h.colour, name: h.name, dayMin };
      });
    stacked = {
      monthly: stackedComposition(monthBuckets, (d) => monthKey(d), perHabit),
      weekly: stackedComposition(weekBuckets, (d) => weekStart(d), perHabit),
      weekLabels: weekBuckets.map(isoWeekNum),
      legend: perHabit
        .map((h) => ({
          name: h.name,
          colour: h.colour,
          minutes: [...h.dayMin.values()].reduce((a, b) => a + b, 0),
        }))
        .sort((a, b) => b.minutes - a.minutes),
      monthLabels: MONTH_ABBR.map((m) => m.toUpperCase()),
    };
  }

  // ── Review layer ──
  const entryTitle = new Map(data.entries.map((e) => [e.id, e.title]));
  const milestones = deriveMilestones(roster, sessionsByHabit, entryTitle, bounds, data);
  let review: ReviewColVM[] | null = null;
  let reviewTitle: string | null = null;
  let milestoneCards: MilestoneVM[] | null = null;

  if (scale === "week") {
    milestoneCards = milestones.slice(0, 4);
  } else {
    const records = deriveRecords(roster, sessionsByHabit, bounds, data.finalized);
    const anniversaries = deriveAnniversaries(roster, sessionsByHabit, entryTitle, bounds);
    reviewTitle =
      scale === "month"
        ? `${bounds.label.split(" ")[0]} in review`
        : `${bounds.label} in review`;
    if (scale === "year") {
      const finished = deriveFinished(roster, sessionsByHabit, data, bounds);
      review = [
        { label: "Records", lines: records },
        { label: "Arcs & churn", lines: deriveChurn(roster, sessionsByHabit, data, bounds) },
        { label: "Finished · the 5★ club", lines: finished },
      ];
    } else {
      review = [
        { label: "Milestones", lines: milestones.map((m) => ({ html: m.title })) },
        { label: "Records", lines: records },
        { label: "Anniversaries", lines: anniversaries },
      ];
    }
  }

  // ── Habit rows ──
  const rows = roster.map((h) =>
    buildHabitRow(h, periodSessions.get(h.id)!, playedByHabit.get(h.id)!, days, bounds, scale, data, entryTitle, listCap, ownedWeeks),
  );

  // ── Header ──
  const finalizedInPeriod = days.filter((d) => d.finalized).length;
  const periodDays = days.length;
  const header: CadenceModel["header"] = {
    id: bounds.label,
    ctx:
      scale === "year"
        ? `weeks ${bounds.weekNums.first}–${bounds.weekNums.last} · ${periodDays} days`
        : scale === "quarter"
          ? `${MONTHS_LONG[(quarterOf(bounds.from) - 1) * 3]} – ${MONTHS_LONG[(quarterOf(bounds.from) - 1) * 3 + 2]} · weeks ${bounds.weekNums.first}–${bounds.weekNums.last} · days ${bounds.dayOfYear.first}–${bounds.dayOfYear.last}`
          : scale === "month"
            ? `weeks ${bounds.weekNums.first}–${bounds.weekNums.last} · days ${bounds.dayOfYear.first}–${bounds.dayOfYear.last}`
            : `${dayLabel(bounds.from)} – ${dayLabel(bounds.to)} · days ${bounds.dayOfYear.first}–${bounds.dayOfYear.last}`,
    finalized: `${finalizedInPeriod} of ${periodDays} days finalized`,
    up: bounds.upAnchors,
    prevTip: `Previous ${scale}`,
    nextTip: `Next ${scale}`,
    nextDead: bounds.nextAnchor > today,
  };

  return {
    scale,
    bounds,
    header,
    heatInk,
    verdict,
    stats,
    compositionRows: scale === "year" ? null : compositionRows,
    stacked,
    milestoneCards,
    review,
    reviewTitle,
    rows,
    cellHeaders:
      scale === "month"
        ? { kind: "daynums", count: periodDays }
        : scale === "week"
          ? { kind: "daynums", count: 7 }
          : scale === "quarter"
            ? { kind: "weeknums", nums: ownedWeeks.map(isoWeekNum) }
            : { kind: "months" },
    bestColLabel:
      scale === "quarter" ? "best week" : scale === "year" ? "best month · week" : "best day",
    rowLegendSleep: roster.some((h) => h.kind === "range"),
  };
}

// ── Habit rows ────────────────────────────────────────────────────────────────

function buildHabitRow(
  h: CadHabit,
  sessions: CadSession[],
  played: Set<string>,
  days: CrossDay[],
  bounds: PeriodBounds,
  scale: CadenceScale,
  data: CadenceData,
  entryTitle: Map<string, string>,
  listCap: number,
  ownedWeeks: string[],
): HabitRowVM {
  const finDays = days.filter((d) => d.finalized).length;
  const doneDays = days.filter((d) => d.finalized && played.has(d.day)).length;

  // Native totals
  let minutes = 0, words = 0, count = 0;
  const nights: number[] = [];
  for (const s of sessions) {
    if (s.kind === "time") minutes += s.value ?? 0;
    else if (s.kind === "count") { words += s.value ?? 0; count += s.value ?? 0; }
    else if (s.kind === "range") nights.push(rangeMinutes(s));
  }
  const isRange = h.kind === "range";
  const measureless = !h.measuresTime && !h.measuresCount && !isRange;
  const countPrimary = h.measuresCount; // count is primary when both declared

  let total: string, totalSub: string | null = null;
  if (isRange) {
    const avg = nights.length > 0 ? nights.reduce((a, b) => a + b, 0) / nights.length : null;
    total = avg != null ? `avg ${fmtH(avg)}` : "—";
  } else if (measureless) {
    total = String(sessions.length);
    totalSub = "sessions";
  } else if (countPrimary) {
    total = `${groupInt(words)} ${h.countUnit?.[0] ?? "w"}`;
    if (h.measuresTime && minutes > 0) totalSub = `· ${fmtHShort(minutes)}`;
  } else {
    total = fmtH(minutes);
  }

  // Best day (native amount) / best week / best month.
  //
  // THE PREFIX IS GONE (user-ruled 2026-08-10, at the 14" walk): the cells read
  // "Jul 23 · 2,006 w", not "best Jul 23 · 2,006 w". The COLUMN HEADER already
  // says BEST DAY, so every row was repeating its own column name — and on the
  // small canvas that column is the one paying for the day cells, so the word
  // was costing width it could not afford.
  //
  // ⚠ The range family's "most" went with it. It read "most Jul 28 · 11 h 22 m"
  // where the others said "best", which is a real distinction — you do not have
  // a *best* night's sleep, you have the one with the most. It is dropped only
  // because the header names the column for both, so neither word was carrying
  // the meaning any more; surfaced here rather than deleted quietly, since the
  // wording was deliberate.
  const amtByDay = new Map<string, number>();
  for (const s of sessions) {
    const amt = isRange ? rangeMinutes(s) : countPrimary ? (s.kind === "count" ? s.value ?? 0 : 0) : s.kind === "time" ? s.value ?? 0 : 0;
    if (measureless) amtByDay.set(s.day, (amtByDay.get(s.day) ?? 0) + 1);
    else amtByDay.set(s.day, (amtByDay.get(s.day) ?? 0) + amt);
  }
  const fmtAmt = (v: number): string =>
    isRange || (!countPrimary && !measureless) ? fmtH(v) : measureless ? `${v}×` : `${groupInt(v)} ${h.countUnit?.[0] ?? "w"}`;
  let best = "—";
  if (!measureless && amtByDay.size > 0) {
    if (scale === "quarter") {
      const byWeek = new Map<string, number>();
      for (const [d, v] of amtByDay) byWeek.set(weekStart(d), (byWeek.get(weekStart(d)) ?? 0) + v);
      const bw = [...byWeek.entries()].sort((a, b) => b[1] - a[1])[0];
      best = `wk ${isoWeekNum(bw[0])} · ${fmtAmt(bw[1])}`;
    } else if (scale === "year") {
      const byMonth = new Map<string, number>();
      const byWeek = new Map<string, number>();
      for (const [d, v] of amtByDay) {
        byMonth.set(monthKey(d), (byMonth.get(monthKey(d)) ?? 0) + v);
        byWeek.set(weekStart(d), (byWeek.get(weekStart(d)) ?? 0) + v);
      }
      const bm = [...byMonth.entries()].sort((a, b) => b[1] - a[1])[0];
      const bw = [...byWeek.entries()].sort((a, b) => b[1] - a[1])[0];
      best = `${MONTH_ABBR[Number(bm[0].slice(5)) - 1]} · wk ${isoWeekNum(bw[0])}`;
    } else {
      const bd = [...amtByDay.entries()].sort((a, b) => b[1] - a[1])[0];
      best = `${dayLabel(bd[0])} · ${fmtAmt(bd[1])}`;
    }
  }

  // Cells at the scale's grain
  let cells: HabitRowVM["cells"];
  if (scale === "quarter") {
    cells = { intensities: weekIntensity(ownedWeeks, played, bounds) };
  } else if (scale === "year") {
    cells = { intensities: monthIntensity(bounds.from.slice(0, 4), played) };
  } else if (isRange) {
    // Sleep's day cells are QUALITY marks — filled = 8h+ night (the FINAL's rule)
    const goodDays = new Set(sessions.filter((s) => s.kind === "range" && rangeMinutes(s) >= 480).map((s) => s.day));
    cells = {
      states: days.map((d) =>
        d.future ? "f" : goodDays.has(d.day) ? "d" : played.has(d.day) ? "m" : d.finalized ? "m" : "u",
      ),
    };
  } else {
    cells = { states: dayCells(days, played) };
  }

  // ── Expansion ──
  const isCategorical =
    h.kind === "simple" &&
    sessions.some((s) => {
      const rec = data.valueBySession.get(s.id);
      return rec != null && Object.keys(rec).some((k) => !data.flagDefs.has(k));
    });
  const expandable = h.kind === "project" || isCategorical || isRange;

  let expansion: HabitRowVM["expansion"] = null;
  if (expandable) {
    expansion = buildExpansion(h, sessions, days, bounds, scale, data, entryTitle, listCap, countPrimary, amtByDay, fmtAmt, ownedWeeks);
  }

  return {
    key: h.key,
    name: h.name,
    colour: h.colour,
    total,
    totalSub,
    best,
    cells,
    done: `${doneDays}/${finDays}`,
    expandable,
    expansion,
  };
}

// Occupancy marks at the row grain for a subset of sessions.
function occupancy(
  subset: CadSession[],
  days: CrossDay[],
  bounds: PeriodBounds,
  scale: CadenceScale,
  ownedWeeks: string[],
): DayCellState[] {
  const set = new Set(subset.map((s) => s.day));
  if (scale === "quarter")
    return ownedWeeks.map((ws) => {
      for (let i = 0; i < 7; i++) if (set.has(dayFromIndex(dayIndex(ws) + i))) return "d" as DayCellState;
      return "e" as DayCellState;
    });
  if (scale === "year") {
    const y = bounds.from.slice(0, 4);
    return Array.from({ length: 12 }, (_, i) => {
      const mk = `${y}-${String(i + 1).padStart(2, "0")}`;
      for (const d of set) if (monthKey(d) === mk) return "d" as DayCellState;
      return "e" as DayCellState;
    });
  }
  return days.map((d) => (d.future ? "f" : set.has(d.day) ? "d" : d.finalized ? "e" : "u")) as DayCellState[];
}

function buildExpansion(
  h: CadHabit,
  sessions: CadSession[],
  days: CrossDay[],
  bounds: PeriodBounds,
  scale: CadenceScale,
  data: CadenceData,
  entryTitle: Map<string, string>,
  listCap: number,
  countPrimary: boolean,
  amtByDay: Map<string, number>,
  fmtAmt: (v: number) => string,
  ownedWeeks: string[],
): NonNullable<HabitRowVM["expansion"]> {
  const isRange = h.kind === "range";

  // The measure micro-bars — REAL per-bucket amounts (replaces the FINAL's
  // pseudo-random texture), normalized to the period max.
  let measureStrip: { label: string; bars: number[] } | null = null;
  if (!isRange && (h.measuresTime || h.measuresCount)) {
    let buckets: number[];
    let unitLabel: string;
    if (scale === "quarter") {
      const byWeek = ownedWeeks.map((ws) => {
        let v = 0;
        for (let i = 0; i < 7; i++) v += amtByDay.get(dayFromIndex(dayIndex(ws) + i)) ?? 0;
        return v;
      });
      buckets = byWeek;
      unitLabel = countPrimary ? `${cap(h.countUnit ?? "count")} / week` : "Hours / week";
    } else if (scale === "year") {
      const y = bounds.from.slice(0, 4);
      buckets = Array.from({ length: 12 }, (_, i) => {
        const mk = `${y}-${String(i + 1).padStart(2, "0")}`;
        let v = 0;
        for (const [d, a] of amtByDay) if (monthKey(d) === mk) v += a;
        return v;
      });
      unitLabel = countPrimary ? `${cap(h.countUnit ?? "count")} / month` : "Hours / month";
    } else {
      buckets = days.map((d) => (d.future ? 0 : amtByDay.get(d.day) ?? 0));
      unitLabel = countPrimary ? `${cap(h.countUnit ?? "count")} / day` : "Minutes / day";
    }
    const max = Math.max(1, ...buckets);
    measureStrip = { label: unitLabel, bars: buckets.map((v) => v / max) };
  }

  // Strip sorting — the ratified cap: longest-first by time, else the habit's
  // own measure, else day count.
  const stripAmount = (subset: CadSession[]): number => {
    const t = subset.reduce((a, s) => a + (s.kind === "time" ? s.value ?? 0 : 0), 0);
    if (t > 0) return t;
    const c = subset.reduce((a, s) => a + (s.kind === "count" ? s.value ?? 0 : 0), 0);
    if (c > 0) return c;
    return new Set(subset.map((s) => s.day)).size;
  };

  const stripFor = (title: string, subset: CadSession[], door: boolean, inner = false, entryId?: string): StripVM => {
    let t = 0, w = 0;
    const perDay = new Map<string, number>();
    for (const s of subset) {
      if (s.kind === "time") t += s.value ?? 0;
      if (s.kind === "count") w += s.value ?? 0;
      const amt = countPrimary ? (s.kind === "count" ? s.value ?? 0 : 0) : s.kind === "time" ? s.value ?? 0 : 0;
      perDay.set(s.day, (perDay.get(s.day) ?? 0) + amt);
    }
    const both = h.measuresTime && h.measuresCount && w > 0 && t > 0;
    const totalTxt = both
      ? `${groupInt(w)} ${h.countUnit?.[0] ?? "w"} · ${fmtHShort(t)}`
      : countPrimary && w > 0
        ? `${groupInt(w)} ${h.countUnit?.[0] ?? "w"}`
        : t > 0
          ? fmtH(t)
          : `${new Set(subset.map((s) => s.day)).size} days`;
    let bestTxt = "—";
    if (perDay.size > 0 && scale !== "quarter" && scale !== "year") {
      const bd = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];
      if (bd[1] > 0) bestTxt = `${dayLabel(bd[0])} · ${fmtAmt(bd[1])}`;
    }
    return { title, door, entryId, total: totalTxt, best: bestTxt, cells: occupancy(subset, days, bounds, scale, ownedWeeks), inner };
  };

  // ── Project → entry strips (Writing = card-within-card) ──
  if (h.kind === "project") {
    const byEntry = new Map<string, CadSession[]>();
    for (const s of sessions) {
      if (s.entryId == null) continue;
      (byEntry.get(s.entryId) ?? byEntry.set(s.entryId, []).get(s.entryId)!).push(s);
    }
    const ranked = [...byEntry.entries()].sort((a, b) => stripAmount(b[1]) - stripAmount(a[1]));

    // Writing's shape: two measures + session categoricals → card-within-card
    const catKeys = new Set<string>();
    for (const s of sessions) {
      const rec = data.valueBySession.get(s.id);
      if (rec) for (const k of Object.keys(rec)) if (!data.flagDefs.has(k)) catKeys.add(k);
    }
    if (h.measuresTime && h.measuresCount && catKeys.size > 0 && ranked.length > 0) {
      const [topEntry, topSessions] = ranked[0];
      const story = [stripFor(`${entryTitle.get(topEntry) ?? "—"} — the story`, topSessions, true, false, topEntry)];
      const groups = [...catKeys].map((key) => {
        const byValue = new Map<string, CadSession[]>();
        for (const s of topSessions) {
          const v = data.valueBySession.get(s.id)?.[key];
          if (v == null) continue;
          (byValue.get(v) ?? byValue.set(v, []).get(v)!).push(s);
        }
        return {
          heading: data.defLabels.get(key) ?? key,
          strips: [...byValue.entries()]
            .sort((a, b) => stripAmount(b[1]) - stripAmount(a[1]))
            .map(([v, ss]) => stripFor(v, ss, false, true)),
        };
      }).filter((g) => g.strips.length > 0);
      const rest = ranked.slice(1).map(([id, ss]) => stripFor(entryTitle.get(id) ?? "—", ss, true, false, id));
      return {
        storyCard: { story, groups },
        strips: rest,
        cap: listCap - 1,
        more: Math.max(0, rest.length - (listCap - 1)),
        sleepLine: null,
        measureStrip,
      };
    }

    const strips = ranked.map(([id, ss]) => stripFor(entryTitle.get(id) ?? "—", ss, true, false, id));
    return { storyCard: null, strips, cap: listCap, more: Math.max(0, strips.length - listCap), sleepLine: null, measureStrip };
  }

  // ── Range → ranges line + flag strips ──
  if (isRange) {
    const rangeSessions = sessions.filter((s) => s.kind === "range" && s.start != null && s.end != null);
    let sleepLine: SleepLineVM | null = null;
    if (rangeSessions.length > 0) {
      const beds = rangeSessions.map((s) => minOfDay(s.start!));
      const wakes = rangeSessions.map((s) => minOfDay(s.end!));
      // The night-centric axis: 20:00 → 12:00 (16 h window). Daytime bed/wake
      // times (12:00–20:00) are legal — they pin to the axis edge rather than
      // escaping the canvas (2026-07-30).
      const AXIS_START = 20 * 60, AXIS_LEN = 16 * 60;
      const clampPct = (p: number) => Math.min(100, Math.max(0, p));
      const pos = (m: number) => clampPct((((m - AXIS_START + 1440) % 1440) / AXIS_LEN) * 100);
      // ?? 0 preserves the old degenerate-case face (a fully-cancelling set
      // read 0 = midnight before the clockMath canonicalization).
      const bedAvg = circularMeanMinutes(beds) ?? 0;
      const wakeAvg = circularMeanMinutes(wakes) ?? 0;
      const bedLo = Math.min(...beds.map((b) => (b - AXIS_START + 1440) % 1440));
      const bedHi = Math.max(...beds.map((b) => (b - AXIS_START + 1440) % 1440));
      const wakeLo = Math.min(...wakes.map((b) => (b - AXIS_START + 1440) % 1440));
      const wakeHi = Math.max(...wakes.map((b) => (b - AXIS_START + 1440) % 1440));
      const bedLeft = clampPct((bedLo / AXIS_LEN) * 100);
      const wakeLeft = clampPct((wakeLo / AXIS_LEN) * 100);
      sleepLine = {
        bedLabel: `BED · ${fmtClock(bedLo + AXIS_START)} – ${fmtClock(bedHi + AXIS_START)} · avg ${fmtClock(bedAvg)}`,
        wakeLabel: `WAKE · ${fmtClock(wakeLo + AXIS_START)} – ${fmtClock(wakeHi + AXIS_START)} · avg ${fmtClock(wakeAvg)}`,
        bed: { left: bedLeft, width: Math.min(100 - bedLeft, Math.max(2, ((bedHi - bedLo) / AXIS_LEN) * 100)), avg: pos(bedAvg) },
        wake: { left: wakeLeft, width: Math.min(100 - wakeLeft, Math.max(2, ((wakeHi - wakeLo) / AXIS_LEN) * 100)), avg: pos(wakeAvg) },
        ticks: Array.from({ length: 9 }, (_, i) => ({
          left: (i / 8) * 100,
          label: fmtClock(AXIS_START + (i * AXIS_LEN) / 8),
        })),
      };
    }
    // Flag strips: the derived rules (8h+ · up-before-noon) + stored flags (med)
    const strips: StripVM[] = [];
    const nightsCount = rangeSessions.length;
    const eightPlus = rangeSessions.filter((s) => rangeMinutes(s) >= 480);
    if (nightsCount > 0)
      strips.push({ title: "8 h+ nights", door: false, total: `${eightPlus.length} of ${nightsCount}`, best: "—", cells: occupancy(eightPlus, days, bounds, scale, ownedWeeks) });
    const beforeNoon = rangeSessions.filter((s) => minOfDay(s.end!) < 12 * 60);
    if (nightsCount > 0)
      strips.push({ title: "up before noon", door: false, total: `${beforeNoon.length} of ${nightsCount}`, best: "—", cells: occupancy(beforeNoon, days, bounds, scale, ownedWeeks) });
    for (const flagKey of data.flagDefs) {
      const flagged = rangeSessions.filter((s) => data.valueBySession.get(s.id)?.[flagKey] != null);
      if (flagged.length > 0)
        strips.push({ title: (data.defLabels.get(flagKey) ?? flagKey).toLowerCase(), door: false, total: `${flagged.length} nights`, best: "—", cells: occupancy(flagged, days, bounds, scale, ownedWeeks) });
    }
    return { storyCard: null, strips, cap: strips.length, more: 0, sleepLine, measureStrip: null };
  }

  // ── Categorical simple → per-value strips ──
  const byValue = new Map<string, CadSession[]>();
  for (const s of sessions) {
    const rec = data.valueBySession.get(s.id);
    if (!rec) continue;
    for (const [k, v] of Object.entries(rec)) {
      if (data.flagDefs.has(k)) continue;
      (byValue.get(v) ?? byValue.set(v, []).get(v)!).push(s);
    }
  }
  const ranked = [...byValue.entries()].sort((a, b) => stripAmount(b[1]) - stripAmount(a[1]));
  const strips = ranked.map(([v, ss]) => stripFor(v, ss, false));
  return { storyCard: null, strips, cap: listCap, more: Math.max(0, strips.length - listCap), sleepLine: null, measureStrip };
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// ── Review derivations ────────────────────────────────────────────────────────
// Deliberately modest: real, deterministic, honestly-empty when quiet (the
// weekly band is "absent most weeks" by design).

const LANDMARKS = [100, 250, 500, 750, 1000, 1500, 2000, 3000, 5000];

function deriveMilestones(
  roster: CadHabit[],
  allByHabit: Map<string, CadSession[]>,
  entryTitle: Map<string, string>,
  bounds: PeriodBounds,
  data: CadenceData,
): MilestoneVM[] {
  const out: MilestoneVM[] = [];
  for (const h of roster) {
    const all = (allByHabit.get(h.id) ?? []).slice().sort((a, b) => (a.day < b.day ? -1 : 1));
    // Nth-day landmarks crossed inside the period
    const seen = new Set<string>();
    let n = 0;
    for (const s of all) {
      if (seen.has(s.day)) continue;
      seen.add(s.day);
      n++;
      if (LANDMARKS.includes(n) && s.day >= bounds.from && s.day <= bounds.to) {
        out.push({
          title: `Reached the <b>${n}th ${escapeHtml(h.name)} day</b>, on <b>${dayLabel(s.day)}</b>.`,
          when: `${dayName(s.day)} · ${dayLabel(s.day)}`,
          kind: "landmark",
        });
      }
    }
    // Entry cumulative word crossings (creation entries, 25k multiples)
    if (h.measuresCount && h.kind === "project") {
      const byEntry = new Map<string, CadSession[]>();
      for (const s of all) if (s.entryId) (byEntry.get(s.entryId) ?? byEntry.set(s.entryId, []).get(s.entryId)!).push(s);
      for (const [id, ss] of byEntry) {
        let cum = 0;
        let lastMark = 0;
        for (const s of ss) {
          if (s.kind !== "count") continue;
          cum += s.value ?? 0;
          const mark = Math.floor(cum / 25_000) * 25_000;
          if (mark > lastMark && mark >= 25_000) {
            lastMark = mark;
            if (s.day >= bounds.from && s.day <= bounds.to)
              out.push({
                title: `<b>${escapeHtml(entryTitle.get(id) ?? "—")}</b> crossed <b>${groupInt(mark)} ${escapeHtml(h.countUnit ?? "words")}</b>.`,
                when: `${dayName(s.day)} · ${dayLabel(s.day)}`,
                kind: "crossing",
              });
          }
        }
      }
    }
  }
  // Finished entries (status Finished + last session in period)
  if (bounds.scale === "quarter" || bounds.scale === "month") {
    const rosterById = new Map(roster.map((h) => [h.id, h]));
    const finishedTitles: string[] = [];
    for (const e of data.entries) {
      if (e.status !== "Finished") continue;
      const habit = rosterById.get(e.habitId);
      if (!habit) continue;
      const ss = (allByHabit.get(e.habitId) ?? []).filter((s) => s.entryId === e.id);
      if (ss.length === 0) continue;
      const last = ss.reduce((a, s) => (s.day > a ? s.day : a), ss[0].day);
      if (last >= bounds.from && last <= bounds.to) finishedTitles.push(entryTitle.get(e.id) ?? "—");
    }
    if (finishedTitles.length > 0)
      out.push({
        title: `Finished <b>${finishedTitles.slice(0, 3).map(escapeHtml).join("</b> · <b>")}</b>${finishedTitles.length > 3 ? ` + ${finishedTitles.length - 3} more` : ""}.`,
        when: "",
        kind: "landmark",
      });
  }
  return out.slice(0, 6);
}

function deriveRecords(
  roster: CadHabit[],
  allByHabit: Map<string, CadSession[]>,
  bounds: PeriodBounds,
  finalized: Set<string>,
): { html: string }[] {
  const out: { html: string }[] = [];
  for (const h of roster) {
    const all = allByHabit.get(h.id) ?? [];
    if (all.length === 0) continue;
    const countPrimary = h.measuresCount;
    // Best month ever landing inside this period
    const byMonth = new Map<string, number>();
    for (const s of all) {
      const amt = countPrimary ? (s.kind === "count" ? s.value ?? 0 : 0) : s.kind === "time" ? s.value ?? 0 : 0;
      if (amt > 0) byMonth.set(monthKey(s.day), (byMonth.get(monthKey(s.day)) ?? 0) + amt);
    }
    if (byMonth.size > 1) {
      const [bestM, bestV] = [...byMonth.entries()].sort((a, b) => b[1] - a[1])[0];
      const inside = `${bestM}-15` >= bounds.from && `${bestM}-01` <= bounds.to;
      if (inside && bestV > 0) {
        const amount = countPrimary ? `${groupInt(bestV)} ${escapeHtml(h.countUnit ?? "")}` : fmtHShort(bestV);
        const monthName = bounds.scale === "month" ? "" : `${MONTH_ABBR[Number(bestM.slice(5)) - 1]}, `;
        out.push({ html: `Best <b>${escapeHtml(h.name)}</b> month ever — <b>${monthName}${amount}</b>.` });
      }
    }
    // All-time-longest streak ending inside this period — SHAPE 5's counter
    // (unknown days pass through), never a local re-count: this section used
    // strict calendar-consecutive runs and could disagree with the habit
    // dashboards' streak tiles (user-ruled 2026-08-06, audit fork E).
    const playedSet = new Set(all.map((s) => s.day));
    const played = [...playedSet].sort();
    const st = streaks(played[0], maxStr(played[played.length - 1], bounds.to), playedSet, finalized);
    let bestRun = 0, bestEnd = "";
    for (const r of st.runs) if (r.days > bestRun) { bestRun = r.days; bestEnd = r.end; }
    if (bestRun >= 7 && bestEnd >= bounds.from && bestEnd <= bounds.to)
      out.push({ html: `Longest <b>${escapeHtml(h.name)}</b> streak — <b>${bestRun} days</b>.` });
  }
  return out.slice(0, 4);
}

/** The anniversary of `day` in `year` — Feb 29 clamps to Feb 28 in non-leap
 *  years (the nearest real day; plain string surgery mints an impossible date
 *  3 years in 4, so a leap-day wave start would never fire) (2026-07-30). */
const anniversaryOf = (day: string, year: number): string => {
  if (day.slice(5) !== "02-29") return `${year}${day.slice(4)}`;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return leap ? `${year}-02-29` : `${year}-02-28`;
};

function deriveAnniversaries(
  roster: CadHabit[],
  allByHabit: Map<string, CadSession[]>,
  entryTitle: Map<string, string>,
  bounds: PeriodBounds,
): { html: string }[] {
  const out: { html: string }[] = [];
  for (const h of roster) {
    if (h.kind !== "project") continue;
    const byEntry = new Map<string, SessionRow[]>();
    for (const s of allByHabit.get(h.id) ?? [])
      if (s.entryId)
        (byEntry.get(s.entryId) ?? byEntry.set(s.entryId, []).get(s.entryId)!).push({
          id: s.id, entry_fk: s.entryId, day: s.day, measure_kind: s.kind, value: s.value,
        });
    for (const [id, ss] of byEntry) {
      const waves = wavesForEntry(ss, h.waveGapDays ?? 30);
      if (waves.length === 0) continue;
      const start = waves[0].start;
      for (let years = 1; years <= 10; years++) {
        const ann = anniversaryOf(start, Number(start.slice(0, 4)) + years);
        if (ann >= bounds.from && ann <= bounds.to) {
          out.push({
            html: `${years === 1 ? "One year" : `${years} years`} since <b>${escapeHtml(entryTitle.get(id) ?? "—")}</b> wave 1.`,
          });
        }
      }
    }
  }
  return out.slice(0, 3);
}

function deriveChurn(
  roster: CadHabit[],
  allByHabit: Map<string, CadSession[]>,
  data: CadenceData,
  bounds: PeriodBounds,
): { html: string }[] {
  const out: { html: string }[] = [];
  const y = bounds.from.slice(0, 4);
  for (const h of roster) {
    if (h.kind !== "simple") continue;
    // Per categorical value: first-ever / last-ever appearance inside the year
    const firstSeen = new Map<string, string>();
    const lastSeen = new Map<string, string>();
    for (const s of allByHabit.get(h.id) ?? []) {
      const rec = data.valueBySession.get(s.id);
      if (!rec) continue;
      for (const [k, v] of Object.entries(rec)) {
        if (data.flagDefs.has(k)) continue;
        if (!firstSeen.has(v) || s.day < firstSeen.get(v)!) firstSeen.set(v, s.day);
        if (!lastSeen.has(v) || s.day > lastSeen.get(v)!) lastSeen.set(v, s.day);
      }
    }
    for (const [v, first] of firstSeen) {
      const last = lastSeen.get(v)!;
      const arrived = first.slice(0, 4) === y;
      const retired = last.slice(0, 4) === y && last < `${y}-11-01` && first.slice(0, 4) !== y;
      if (arrived && retired) continue;
      if (arrived)
        out.push({ html: `<b>${escapeHtml(v)}</b> arrived (${MONTH_ABBR[Number(first.slice(5, 7)) - 1]}).` });
      else if (retired)
        out.push({ html: `<b>${escapeHtml(v)}</b> retired (${MONTH_ABBR[Number(last.slice(5, 7)) - 1]}).` });
    }
  }
  // Entry waves spanning months inside the year
  for (const h of roster) {
    if (h.kind !== "project") continue;
    const byEntry = new Map<string, SessionRow[]>();
    for (const s of allByHabit.get(h.id) ?? [])
      if (s.entryId)
        (byEntry.get(s.entryId) ?? byEntry.set(s.entryId, []).get(s.entryId)!).push({
          id: s.id, entry_fk: s.entryId, day: s.day, measure_kind: s.kind, value: s.value,
        });
    const titleById = new Map(data.entries.map((e) => [e.id, e.title]));
    for (const [id, ss] of byEntry) {
      // Number waves BEFORE filtering so the label names the entry's real wave
      // number, not its index in the in-year ≥20-day subset (2026-07-30).
      const waves = wavesForEntry(ss, h.waveGapDays ?? 30)
        .map((w, i) => ({ w, n: i + 1 }))
        .filter(({ w }) => w.start.slice(0, 4) === y && w.days >= 20);
      for (const { w, n } of waves) {
        const title = titleById.get(id) ?? "—";
        out.push({
          html: `<b>${escapeHtml(title)}</b> wave ${n} — <b>${MONTH_ABBR[Number(w.start.slice(5, 7)) - 1]} – ${MONTH_ABBR[Number(w.end.slice(5, 7)) - 1]}</b>.`,
        });
        break; // one per entry
      }
    }
  }
  return out.slice(0, 4);
}

function deriveFinished(
  roster: CadHabit[],
  allByHabit: Map<string, CadSession[]>,
  data: CadenceData,
  bounds: PeriodBounds,
): { html: string }[] {
  const out: { html: string }[] = [];
  const rosterById = new Map(roster.map((h) => [h.id, h]));
  const finished: { title: string; habit: string }[] = [];
  const fiveStar: string[] = [];
  for (const e of data.entries) {
    const habit = rosterById.get(e.habitId);
    if (!habit) continue;
    const ss = (allByHabit.get(e.habitId) ?? []).filter((s) => s.entryId === e.id);
    if (ss.length === 0) continue;
    const last = ss.reduce((a, s) => (s.day > a ? s.day : a), ss[0].day);
    const inYear = last >= bounds.from && last <= bounds.to;
    if (!inYear) continue;
    if (e.status === "Finished") finished.push({ title: e.title, habit: habit.name });
    if (e.rating === 5) fiveStar.push(e.title);
  }
  if (finished.length > 0) {
    const byHabit = new Map<string, number>();
    for (const f of finished) byHabit.set(f.habit, (byHabit.get(f.habit) ?? 0) + 1);
    const parts = [...byHabit.entries()].map(([habitName, n]) => `${n} ${habitName.toLowerCase()}`);
    out.push({ html: `<b>${finished.length} entries</b> finished — ${parts.join(" · ")}.` });
  }
  if (fiveStar.length > 0)
    out.push({
      html: `The <b>5★ club</b> grew by ${fiveStar.length} — <b>${fiveStar.slice(0, 3).map(escapeHtml).join("</b> · <b>")}</b>${fiveStar.length > 3 ? ` + ${fiveStar.length - 3} more` : ""}.`,
    });
  return out;
}

