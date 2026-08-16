/**
 * Cross-habit cadence shapes (Build step 6 chunk 4). The cadence dashboards
 * are the app's first CROSS-habit surfaces (Dashboard Composition § Cadence
 * chassis): every prior shape derives one habit's stream; these fold all
 * habits into per-day verdicts, the five-stage completion levels, and the
 * shared verdict-stat block. Pure functions over already-fetched rows — no
 * Evolu, no clock ("today" is always passed in).
 *
 * Charter laws implemented here:
 *  - Done-counts read against FINALIZED DAYS ONLY (4/5, never 4/7 while the
 *    weekend is unknown).
 *  - The five-stage completion derivation (Decoration Layer § the stamps,
 *    pointed at by Dashboard Composition): stage 0 = exactly 0% done, four
 *    even bands above. ONE derivation shared by the calendar heat and any
 *    future stamps.
 *  - Week-majority geometry (RATIFIED 2026-07-23): a quarter/year owns the
 *    weeks it holds by majority — a week belongs to the period holding its
 *    Thursday (≥4 of its days). Spilled-in days draw as ghost cells; spilled
 *    days still count in every day-granular number.
 *
 * Mechanics choices (not rulings — flagged in the doc log):
 *  - A day is COMPLETE when ≥1 habit was done on it (it wasn't a gap); a GAP
 *    day is finalized with zero habits done. Days-complete + gap-days =
 *    finalized days.
 *  - Week-grain row intensity = min(3, days done that week) (the drawn
 *    "0–3 days done" ramp). Month-grain = 0 / 1–9 / 10–19 / 20+ days.
 */
import {
  dayFromIndex,
  dayIndex,
  eachDay,
  weekNum,
  weekStart,
  weekThursday,
} from "./dates";
import { MONTHS_LONG, MONTHS_SHORT } from "./format";

export type CadenceScale = "week" | "month" | "quarter" | "year";

/** Alias of the format module's MONTHS_SHORT (kept exported — external
 *  consumers address months through this name). */
export const MONTH_ABBR: readonly string[] = MONTHS_SHORT;

/** The month slot dial for a "YYYY-MM-DD"/"YYYY-MM" key ("--month-jun"). */
export const monthSlot = (dayOrMonth: string): string =>
  `--month-${MONTH_ABBR[Number(dayOrMonth.slice(5, 7)) - 1].toLowerCase()}`;

// ── Period bounds ─────────────────────────────────────────────────────────────

export interface PeriodBounds {
  scale: CadenceScale;
  /** Inclusive calendar bounds ("YYYY-MM-DD"). */
  from: string;
  to: string;
  /** Display identity — "June 2026" · "Q2 2026" · "2026" · "Week 25 · 2026". */
  label: string;
  /** ISO week numbers the period owns by majority (weeks holding its Thursday). */
  weekNums: { first: number; last: number };
  /** Day-of-year bounds ("days 152–181"). */
  dayOfYear: { first: number; last: number };
  /** Anchors for prev/next navigation (a day inside each neighbour). */
  prevAnchor: string;
  nextAnchor: string;
  /** Containment doors upward (month → quarter+year · quarter → year). */
  upAnchors: { scale: CadenceScale; label: string }[];
}

const daysInMonth = (y: number, m: number): number =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();

const doy = (day: string): number => {
  const y = Number(day.slice(0, 4));
  return dayIndex(day) - dayIndex(`${y}-01-01`) + 1;
};

/** The DISPLAY week number of a day's (configured) week — dates.weekNum's
 *  number half (ISO number of the week's Thursday; identical to the plain ISO
 *  number under Monday start). The week-year variant is `dates.weekNum`. */
export const isoWeekNum = (day: string): number => weekNum(day).week;

/**
 * Majority-owned week numbers for [from, to] — a week belongs to the
 * period holding its THURSDAY (the ratified week-majority geometry; the
 * Thursday follows the configured week start via dates.weekThursday). Fixed
 * 2026-07-30: the headers used the endpoints' own ISO weeks, which at year
 * edges read "weeks 1–1" (Dec 31 2024 is week 1 of 2025) and claimed weeks a
 * month does not own.
 */
const ownedWeekNums = (from: string, to: string): { first: number; last: number } => {
  const firstThu = weekThursday(from) >= from ? weekThursday(from) : dayFromIndex(dayIndex(weekThursday(from)) + 7);
  const lastThu = weekThursday(to) <= to ? weekThursday(to) : dayFromIndex(dayIndex(weekThursday(to)) - 7);
  return { first: isoWeekNum(firstThu), last: isoWeekNum(lastThu) };
};

export const quarterOf = (day: string): number =>
  Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1;

/** The period containing `anchor` at `scale`. */
export function periodBounds(scale: CadenceScale, anchor: string): PeriodBounds {
  const y = Number(anchor.slice(0, 4));
  const m = Number(anchor.slice(5, 7));
  let from: string, to: string, label: string;
  let prevAnchor: string, nextAnchor: string;
  const up: PeriodBounds["upAnchors"] = [];

  if (scale === "week") {
    from = weekStart(anchor);
    to = dayFromIndex(dayIndex(from) + 6);
    // The week-YEAR, not the week-start's calendar year — the week of Mon
    // 2024-12-30 is "Week 1 · 2025", never "Week 1 · 2024" (fixed 2026-07-30;
    // weekNum carries the pair under either week start).
    label = `Week ${weekNum(anchor).week} · ${weekNum(anchor).year}`;
    prevAnchor = dayFromIndex(dayIndex(from) - 7);
    nextAnchor = dayFromIndex(dayIndex(from) + 7);
    up.push(
      { scale: "month", label: MONTH_ABBR[Number(anchor.slice(5, 7)) - 1] },
      // The quarter door was missing from the drawn header (month + year only);
      // user-ruled in 2026-07-31: a week doors to every containing period.
      { scale: "quarter", label: `Q${quarterOf(anchor)}` },
      { scale: "year", label: anchor.slice(0, 4) },
    );
  } else if (scale === "month") {
    from = `${anchor.slice(0, 7)}-01`;
    to = `${anchor.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
    label = `${MONTHS_LONG[m - 1]} ${y}`;
    prevAnchor = dayFromIndex(dayIndex(from) - 1);
    nextAnchor = dayFromIndex(dayIndex(to) + 1);
    up.push(
      { scale: "quarter", label: `Q${quarterOf(anchor)}` },
      { scale: "year", label: String(y) },
    );
  } else if (scale === "quarter") {
    const q = quarterOf(anchor);
    const m0 = (q - 1) * 3 + 1;
    from = `${y}-${String(m0).padStart(2, "0")}-01`;
    to = `${y}-${String(m0 + 2).padStart(2, "0")}-${String(daysInMonth(y, m0 + 2)).padStart(2, "0")}`;
    label = `Q${q} ${y}`;
    prevAnchor = dayFromIndex(dayIndex(from) - 1);
    nextAnchor = dayFromIndex(dayIndex(to) + 1);
    up.push({ scale: "year", label: String(y) });
  } else {
    from = `${y}-01-01`;
    to = `${y}-12-31`;
    label = String(y);
    prevAnchor = `${y - 1}-06-15`;
    // The neighbour's FIRST day, not its middle: `nextDead` compares this
    // anchor against today, and a mid-year anchor deadened the door to the
    // current year until June (fixed 2026-07-30).
    nextAnchor = `${y + 1}-01-01`;
  }

  return {
    scale, from, to, label,
    weekNums: ownedWeekNums(from, to),
    dayOfYear: { first: doy(from), last: doy(to) },
    prevAnchor, nextAnchor, upAnchors: up,
  };
}

/**
 * The week-start days a period owns by MAJORITY (its Thursday inside the
 * bounds) — the ratified week-majority geometry. Weeks render whole; days
 * outside [from,to] are ghost cells.
 */
export function majorityWeeks(bounds: PeriodBounds): string[] {
  const out: string[] = [];
  let ws = weekStart(bounds.from);
  // step forward until past the period
  while (ws <= bounds.to) {
    // weekThursday, never `ws + 3` — the offset is 3 only under a Monday start
    // (4 under Sunday), and `ownedWeekNums` above already reads the dial. A
    // hardcoded +3 made this test a WEDNESDAY under Sunday start, so the
    // ribbon's columns disagreed with the header's own week numbers.
    const thu = weekThursday(ws);
    if (thu >= bounds.from && thu <= bounds.to) out.push(ws);
    ws = dayFromIndex(dayIndex(ws) + 7);
  }
  return out;
}

// ── Cross-habit day verdicts ──────────────────────────────────────────────────

/**
 * The five-stage completion level: 0 = exactly zero habits done, then four
 * even bands of done/active. Shared by the verdict heat (g1–g4) and the
 * finalize stamps. `active` ≤ 0 → 0.
 */
export function completionStage(done: number, active: number): number {
  if (done <= 0 || active <= 0) return 0;
  const pct = done / active;
  return pct <= 0.25 ? 1 : pct <= 0.5 ? 2 : pct <= 0.75 ? 3 : 4;
}

export interface CrossDay {
  day: string;
  /** Habits done this day (of the roster). */
  done: number;
  finalized: boolean;
  future: boolean;
  /** 0–4 (only meaningful when finalized or done > 0). */
  stage: number;
}

/**
 * Per-day cross-habit verdicts over [from,to]. `playedByHabit` = one played
 * day-set per roster habit; `finalized` = the finalized-day set; days after
 * `today` are future (dead routes).
 */
export function crossDays(
  from: string,
  to: string,
  playedByHabit: ReadonlyArray<ReadonlySet<string>>,
  finalized: ReadonlySet<string>,
  today: string,
): CrossDay[] {
  const active = playedByHabit.length;
  return eachDay(from, to).map((day) => {
    const done = playedByHabit.reduce((a, s) => a + (s.has(day) ? 1 : 0), 0);
    return {
      day,
      done,
      finalized: finalized.has(day),
      future: day > today,
      stage: completionStage(done, active),
    };
  });
}

// ── The verdict-stat block (six tiles, identical at all four scales) ─────────

export interface VerdictStats {
  /** Days complete (≥1 habit) of finalized days + the share. */
  complete: number;
  finalized: number;
  completePct: number; // 0–100, rounded
  avgHabitsPerDay: number | null; // over finalized days; null when none
  totalMinutes: number;
  topHabit: { name: string; minutes: number } | null;
  longestStreak: { days: number; start: string; end: string } | null;
  /** Gap days (finalized, zero habits), dated, chronological. */
  gapDays: string[];
  bestDay: { day: string; done: number; active: number } | null;
}

/**
 * The six-tile block. `minutesByHabit` = [habit name, minutes-in-period];
 * streak = consecutive complete (≥1 habit) days, unknown pass-through.
 */
export function verdictStats(
  days: CrossDay[],
  minutesByHabit: ReadonlyArray<readonly [string, number]>,
  activeCount: number,
): VerdictStats {
  const fin = days.filter((d) => d.finalized);
  const complete = fin.filter((d) => d.done > 0).length;
  const gapDays = fin.filter((d) => d.done === 0).map((d) => d.day);
  const doneSum = fin.reduce((a, d) => a + d.done, 0);

  // Longest streak of complete days; unfinalized (unknown) passes through.
  let longest: VerdictStats["longestStreak"] = null;
  let run: { start: string; end: string; days: number } | null = null;
  for (const d of days) {
    if (d.future) break;
    if (d.done > 0) {
      if (!run) run = { start: d.day, end: d.day, days: 1 };
      else { run.end = d.day; run.days++; }
    } else if (d.finalized) {
      if (run && (!longest || run.days > longest.days)) longest = run;
      run = null;
    }
  }
  if (run && (!longest || run.days > longest.days)) longest = run;

  let best: VerdictStats["bestDay"] = null;
  for (const d of fin)
    if (d.done > 0 && (!best || d.done > best.done))
      best = { day: d.day, done: d.done, active: activeCount };

  const totalMinutes = minutesByHabit.reduce((a, [, m]) => a + m, 0);
  let topHabit: VerdictStats["topHabit"] = null;
  for (const [name, minutes] of minutesByHabit)
    if (minutes > 0 && (!topHabit || minutes > topHabit.minutes)) topHabit = { name, minutes };

  return {
    complete,
    finalized: fin.length,
    completePct: fin.length > 0 ? Math.round((complete / fin.length) * 100) : 0,
    avgHabitsPerDay: fin.length > 0 ? Math.round((doneSum / fin.length) * 10) / 10 : null,
    totalMinutes,
    topHabit,
    longestStreak: longest,
    gapDays,
    bestDay: best,
  };
}

// ── Row-cell grains ───────────────────────────────────────────────────────────

export type DayCellState = "d" | "m" | "u" | "f"; // done · missed · unknown · future

/**
 * Day-grain verdict cells for one habit over the period's days.
 *
 * ⚠ FINALIZE IS TESTED BEFORE THE LOG, user-ruled 2026-08-15. It used to be the
 * other way round — `played.has(day)` came first — so a day you had logged
 * against but never closed drew as DONE, and an open day showed a scatter of
 * finished-looking cells among its unfinalized ones. Whether a habit was done
 * is not settled until the day is: *"that entire cell column should be red"*.
 *
 * The four states, in the order they are decided:
 *   f — future, and TODAY while it is still unfinalized. A day you are in has
 *       not been missed; the same clause the month verdict panel took.
 *   u — a PAST day left unfinalized. The whole column, every habit, because it
 *       is a fact about the day and not about any one habit.
 *   d — finalized and logged.
 *   m — finalized and not logged: the decided "didn't".
 */
export function dayCells(
  days: ReadonlyArray<{ day: string; finalized: boolean; future: boolean }>,
  played: ReadonlySet<string>,
  today: string,
): DayCellState[] {
  return days.map((d) =>
    d.future || (d.day === today && !d.finalized)
      ? "f"
      : !d.finalized
        ? "u"
        : played.has(d.day)
          ? "d"
          : "m",
  );
}

/** Week-grain intensity 0–3 (days done per majority-owned week, capped). */
export function weekIntensity(
  weekStarts: ReadonlyArray<string>,
  played: ReadonlySet<string>,
  bounds: { from: string; to: string },
): number[] {
  return weekStarts.map((ws) => {
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const d = dayFromIndex(dayIndex(ws) + i);
      if (d >= bounds.from && d <= bounds.to && played.has(d)) n++;
    }
    return Math.min(3, n);
  });
}

/** Month-grain intensity 0–3 for the 12 months of a year. */
export function monthIntensity(year: string, played: ReadonlySet<string>): number[] {
  const perMonth = new Array(12).fill(0);
  for (const d of played) if (d.slice(0, 4) === year) perMonth[Number(d.slice(5, 7)) - 1]++;
  return perMonth.map((n) => (n === 0 ? 0 : n < 10 ? 1 : n < 20 ? 2 : 3));
}

// ── Composition ───────────────────────────────────────────────────────────────

export interface CompositionRow {
  habitKey: string;
  name: string;
  colour: string;
  minutes: number;
  pct: number; // vs the max row
}

/** Ranked hours bars — duration habits only (the caption strip is dead). */
export function composition(
  rows: ReadonlyArray<{ habitKey: string; name: string; colour: string; minutes: number }>,
): CompositionRow[] {
  const withTime = rows.filter((r) => r.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  const max = withTime[0]?.minutes || 1;
  return withTime.map((r) => ({ ...r, pct: (r.minutes / max) * 100 }));
}

/** Stacked composition — minutes per habit per bucket (yearly's toggle). */
export function stackedComposition(
  buckets: ReadonlyArray<string>, // bucket keys ("YYYY-MM" or week-start days)
  bucketOf: (day: string) => string,
  perHabitDayMinutes: ReadonlyArray<{ colour: string; dayMin: ReadonlyMap<string, number> }>,
): { totals: number[]; segs: { colour: string; minutes: number }[][] } {
  const idx = new Map(buckets.map((b, i) => [b, i]));
  const segs: { colour: string; minutes: number }[][] = buckets.map(() => []);
  for (const h of perHabitDayMinutes) {
    const per = new Array(buckets.length).fill(0);
    for (const [day, min] of h.dayMin) {
      const i = idx.get(bucketOf(day));
      if (i != null) per[i] += min;
    }
    per.forEach((minutes, i) => {
      if (minutes > 0) segs[i].push({ colour: h.colour, minutes });
    });
  }
  return { totals: segs.map((s) => s.reduce((a, x) => a + x.minutes, 0)), segs };
}

