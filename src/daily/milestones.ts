/**
 * THE MILESTONE CATALOG — derived, never stored.
 *
 * Owning record: `Final/Daily state 1 (working day).md` § Amended 2026-07-26 (2nd),
 * where the user worked through [[Retrospectives & Insights]]'s five families one
 * by one. Everything below is a transcription of that section; nothing here is a
 * design call.
 *
 * The four structural rules it turns on:
 *
 *  1 · THE BANNER IS A COUNT HEADLINE, not one milestone. The threshold family
 *      alone fires ~0.7×/day over a 5-year store, so the drawn one-banner-one-
 *      milestone face would be present about half of all days. The banner counts;
 *      the full list lives on the cover wall's family cards (state 2).
 *  2 · A RECORD NEEDS SOMETHING TO BEAT — the first observation sets the bar
 *      SILENTLY, or a fresh install fires on every habit on day one.
 *  3 · A STREAK RECORD FIRES ON OVERTAKING, NEVER ON EXTENDING. It is the one
 *      record that does not self-throttle: once you are on your longest-ever run,
 *      every following day beats it — for a nightly habit, forever.
 *  4 · WHERE ABSENCE IS IMPOSSIBLE, THE SUBJECT GETS FINER. Sleep counts *days I
 *      got 8 hrs* and *days I didn't take meds* — and only those two, its third
 *      derived rule (`noon`) deliberately excluded. Keyboard counts the BOARD.
 *      Walking keeps attendance ("it's summer and too hot to go outside lmao").
 *
 * A milestone belongs to THE DAY IT WAS EARNED, not the day it was typed — so
 * this is a pure question about a day (sort by `day`, accumulate, ask whether a
 * ladder value was passed), and milestones re-derive identically forever. That
 * is why the wall card needs no snapshot and `feed_snapshot` gains no tenant.
 *
 * WHERE THE RULES LIVE. The ladders are DATA (`habits.milestone_ladders`, null =
 * the global default below); Settings → Tracking → Metrics edits them (step 10,
 * live — LadderEditor + ladderStore).
 * The SUBJECT SWAP stays code-side (`SUBJECT_SWAP`) — Sleep's half is
 * definition-driven off the range kind anyway, and Keyboard's cannot be:
 * "you type every day" is a fact about a life, not about a declaration.
 */
import type { DerivedRule } from "../db/schema";
import { dayFromIndex, dayGap, dayIndex } from "../metrics/dates";
import { groupInt, hoursMinutes } from "../metrics/format";
import { sessionMinutes } from "../metrics/shapes";

// ── Ladders ──────────────────────────────────────────────────────────────────

export type LadderSubject = "days" | "hours" | "entryHours" | "words" | "sessions";

/**
 * The ladder shape, unbranded — the decoded `milestone_ladders` column is
 * structurally assignable to it, and the harness can build one from literals.
 */
export interface Ladder {
  steps?: ReadonlyArray<number>;
  bands: ReadonlyArray<{ every: number; until?: number }>;
}
export type LadderOverrides = Partial<Record<LadderSubject, Ladder>>;

/**
 * The ruled defaults (user, exact figures). A ladder = an optional leading
 * `steps` list plus `bands` of `{every, until}`; a band with no `until` runs
 * forever. `entryHours` is the one subject every project habit overrides —
 * an hour means a different thing in a game, a book and a video — so the global
 * carries the general "an hour of a thing" shape (gaming's) for habits the user
 * creates later. *Implementation, not a ruling.*
 */
export const DEFAULT_LADDERS: Record<LadderSubject, Ladder> = {
  // every 10 to 100 · every 25 to 1,000 · every 100 after
  days: { bands: [{ every: 10, until: 100 }, { every: 25, until: 1000 }, { every: 100 }] },
  // every 25 to 1,000 · every 100 after
  hours: { bands: [{ every: 25, until: 1000 }, { every: 100 }] },
  // 2 · 5 · 10 · then every 10 to 100 · every 25 after
  entryHours: { steps: [2, 5, 10], bands: [{ every: 10, until: 100 }, { every: 25 }] },
  // 10k · 25k · then every 25k to 200k · every 50k after
  words: { steps: [10_000], bands: [{ every: 25_000, until: 200_000 }, { every: 50_000 }] },
  // every 100 — APP-WIDE, one running count across every habit
  sessions: { bands: [{ every: 100 }] },
};

/**
 * The ladder values strictly greater than `from` and at most `to`. Bounded by
 * `to`, so an unbounded trailing band terminates.
 */
export const ladderCrossings = (
  ladder: Ladder,
  from: number,
  to: number,
): number[] => {
  if (to <= from) return [];
  const hits: number[] = [];
  for (const s of ladder.steps ?? []) if (s > from && s <= to) hits.push(s);
  let floor = Math.max(...(ladder.steps ?? [0]), 0);
  for (const band of ladder.bands) {
    if (band.every <= 0) continue;
    const ceiling = band.until ?? Infinity;
    let v = Math.ceil((Math.max(from, floor) + 1e-9) / band.every) * band.every;
    while (v <= Math.min(to, ceiling)) {
      if (v > from && v > floor) hits.push(v);
      v += band.every;
    }
    if (band.until == null) break;
    floor = Math.max(floor, band.until);
  }
  return [...new Set(hits)].sort((a, b) => a - b);
};

/**
 * THE LIVE GLOBAL — set from the stored Settings row at launch (step 10, slice
 * 4), and the ruled constants above stay the fallback under it. A module-level
 * cache rather than a parameter because every `ladderFor` call sits inside the
 * pure derivation, and threading a fifth input through it would change every
 * shape's signature to carry a value that is the same for all of them.
 */
let globalOverride: Partial<Record<LadderSubject, Ladder>> = {};
export const setGlobalLadders = (next: Partial<Record<LadderSubject, Ladder>>): void => {
  globalOverride = next;
};
export const globalLadderFor = (subject: LadderSubject): Ladder =>
  globalOverride[subject] ?? DEFAULT_LADDERS[subject];

/** A habit's ladder for a subject: its own override, else the global. */
export const ladderFor = (
  overrides: LadderOverrides | null,
  subject: LadderSubject,
): Ladder => overrides?.[subject] ?? globalLadderFor(subject);

// ── The subject swap (code-side, ruled) ──────────────────────────────────────

type SwapSubject =
  | { id: string; label: string; rule: string; want: boolean }
  | { id: string; label: string; flag: string; want: boolean };

export const SUBJECT_SWAP: Record<
  string,
  { kind: "subjects"; subjects: SwapSubject[] } | { kind: "categorical"; defKey: string }
> = {
  // "for actual daily habits like sleep and keyboard, it doesn't track the days
  // done for those, but rather more specific units for them." Sleep's `noon`
  // rule is deliberately NOT a subject — the user named these two specifically.
  sleep: {
    kind: "subjects",
    subjects: [
      { id: "8h", label: "8 hrs", rule: "8h", want: true },
      { id: "nomeds", label: "no meds", flag: "sleep_med", want: false },
    ],
  },
  // "use streaks against the board themselves rather than the habit."
  keyboard: { kind: "categorical", defKey: "keyboard_board" },
};

/**
 * The definition keys the swap actually reads. The snapshot loader narrows its
 * categorical fetch to these instead of pulling every session categorical in
 * the store — derived from the table above so the two can never drift.
 */
export const swapDefKeys = (): string[] => {
  const keys = new Set<string>();
  for (const swap of Object.values(SUBJECT_SWAP)) {
    if (swap.kind === "categorical") keys.add(swap.defKey);
    else for (const sub of swap.subjects) if ("flag" in sub) keys.add(sub.flag);
  }
  return [...keys];
};

// ── Input rows ───────────────────────────────────────────────────────────────

export interface MHabit {
  id: string;
  key: string | null;
  name: string;
  kind: "project" | "simple" | "range";
  count_unit: string | null;
  ladders: LadderOverrides | null;
  derived_rules: ReadonlyArray<DerivedRule>;
  wave_gap_days: number | null;
}

export interface MSession {
  id: string;
  habit_fk: string;
  entry_fk: string | null;
  day: string;
  measure_kind: "time" | "count" | "range" | "none";
  value: number | null;
  start: string | null;
  end: string | null;
  source: string;
}

export interface MilestoneInput {
  day: string;
  habits: ReadonlyArray<MHabit>;
  sessions: ReadonlyArray<MSession>;
  /** session id → { definition key: value } — the board, the meds flag. */
  cats: ReadonlyMap<string, Readonly<Record<string, string>>>;
  entryTitle: ReadonlyMap<string, string>;
  /** Entries with a stored completion bookend, for "Nth entry finished". */
  entriesCompleted: ReadonlyArray<{ id: string; habit_fk: string; completed: string }>;
  /** The app's own start date (`app_meta`), for its anniversary. */
  appStart: string | null;
  /** Global wave gap threshold in days (30 until Settings exists). */
  waveGapDefault: number;
}

export type MilestoneFamily =
  | "threshold"
  | "record"
  | "anniversary"
  | "lifecycle"
  | "rank";

/**
 * A threshold's kind, for the wall card's SPLIT LIST. Thresholds carries two
 * things that are not comparable — COUNTS ("100th Gaming day") and
 * ACCUMULATIONS ("500 h of Reading") — and run together in one column they read
 * as one ranked list, which they are not. Every other family is unsplit.
 * *(Implementation of the exhibit's `.ms-list.split`; the family itself is the
 * ruling.)*
 */
export type ThresholdBucket = "count" | "total";

export interface MilestoneItem {
  family: MilestoneFamily;
  /**
   * The figure, as the wall card's `.ms-n` shows it ("100th", "500 h", "3h 20m").
   * EMPTY for an item that has no figure — every Rank change entry — which the
   * card lays out as a full-width sentence instead.
   */
  value: string;
  /** What the figure is about, as `.ms-t` shows it. Plain text, never HTML. */
  subject: string;
  /** Thresholds only. */
  bucket?: ThresholdBucket;
  /** The house form, `value` and `subject` joined — what the harness reads. */
  text: string;
}

/** One streak in progress, for the wall's single continuing-streaks card. */
export interface ContinuingStreak {
  value: string;
  subject: string;
  /** Marked with the gilt ★ rather than the words "— longest". */
  longest: boolean;
  /** Sort key; not rendered. */
  days: number;
}

export interface MilestoneDay {
  items: MilestoneItem[];
  /** Everything that is not a record — what the headline calls "milestones". */
  milestoneCount: number;
  recordCount: number;
  /** Streaks in progress. Rides along ONLY when the banner is already showing. */
  continuingStreaks: number;
  /**
   * The same streaks, named — the wall's continuing-streaks card lists them
   * where the banner only counts them. Longest first.
   */
  streaks: ContinuingStreak[];
  /** Empty when nothing fired — the banner is an event, not furniture. */
  headline: string;
}

// ── Small helpers ────────────────────────────────────────────────────────────
// minutes-of-a-session = metrics/shapes.sessionMinutes (2026-07-30 dedup).

const byDay = (a: MSession, b: MSession): number => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0);

const ordinal = (n: number): string => {
  const r = n % 100;
  if (r >= 11 && r <= 13) return `${groupInt(n)}th`;
  return `${groupInt(n)}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

/**
 * Rule results for one range session — the same templates rangeSpec evaluates.
 * Exported because the cover wall's keepsake `{{flags}}` asks the same question
 * of the same rules, and two copies of a rules-as-data evaluator would drift.
 */
export const ruleHolds = (rule: DerivedRule, s: MSession): boolean => {
  if (s.start == null || s.end == null) return false;
  if (rule.template === "duration" && rule.minutes != null) {
    const mins = sessionMinutes(s);
    return rule.op === "lte" ? mins <= rule.minutes : mins >= rule.minutes;
  }
  if (rule.template === "timeOfDay" && rule.time != null) {
    const dt = rule.endpoint === "start" ? s.start : s.end;
    const at = Number(dt.slice(11, 13)) * 60 + Number(dt.slice(14, 16));
    const [th, tm] = rule.time.split(":").map(Number);
    const target = th * 60 + tm;
    return rule.op === "after" ? at > target : at < target;
  }
  return false;
};

/**
 * A habit's DAY SUBJECTS — the things whose Nth day is worth marking. Normally
 * one (attendance); swapped to finer subjects where absence is impossible.
 * Each carries the sorted list of days on which it held.
 */
export const daySubjects = (
  habit: MHabit,
  rows: ReadonlyArray<MSession>,
  cats: MilestoneInput["cats"],
): Array<{ label: string; days: string[] }> => {
  const swap = habit.key != null ? SUBJECT_SWAP[habit.key] : undefined;
  // No internal re-sort (2026-07-30 dedup): every branch accumulates day SETS
  // and sorts the day lists it returns, so row order never mattered here — the
  // caller's once-per-derivation sort is the only one needed.

  if (swap?.kind === "categorical") {
    const byValue = new Map<string, Set<string>>();
    for (const s of rows) {
      const v = cats.get(s.id)?.[swap.defKey];
      if (v == null) continue;
      const set = byValue.get(v) ?? new Set<string>();
      set.add(s.day);
      byValue.set(v, set);
    }
    return [...byValue.entries()].map(([label, days]) => ({
      label,
      days: [...days].sort(),
    }));
  }

  if (swap?.kind === "subjects") {
    return swap.subjects.map((sub) => {
      const days = new Set<string>();
      for (const s of rows) {
        const held =
          "rule" in sub
            ? habit.derived_rules.some((r) => r.label === sub.rule && ruleHolds(r, s)) === sub.want
            : (cats.get(s.id)?.[sub.flag] === "true") === sub.want;
        if (held) days.add(s.day);
      }
      return { label: sub.label, days: [...days].sort() };
    });
  }

  const days = [...new Set(rows.map((s) => s.day))].sort();
  return [{ label: habit.name, days }];
};

/** The run of consecutive days ending at `day`, or 0 if `day` is not in the set. */
export const runEndingAt = (days: ReadonlyArray<string>, day: string): number => {
  const set = new Set(days);
  if (!set.has(day)) return 0;
  let n = 0;
  let idx = dayIndex(day);
  while (set.has(dayFromIndex(idx))) {
    n++;
    idx--;
  }
  return n;
};

/** The longest run anywhere in the set among days strictly before `day`. */
export const bestRunBefore = (days: ReadonlyArray<string>, day: string): number => {
  const before = days.filter((d) => d < day).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of before) {
    run = prev != null && dayGap(prev, d) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
};

/**
 * 3 · A STREAK RECORD FIRES ON OVERTAKING, NEVER ON EXTENDING. The previous
 * best is measured among the days before THIS RUN STARTED — measuring it among
 * "days before today" would always find the run's own prefix (run − 1) and so
 * fire every single day once you are on your longest-ever run, which is exactly
 * the failure this rule exists to prevent. `previousBest > 0` is rule 2: a
 * record needs something to beat, so the first-ever streak is silent.
 */
export const streakOvertaken = (days: ReadonlyArray<string>, day: string): number | null => {
  const run = runEndingAt(days, day);
  if (run < 2) return null;
  const runStart = dayFromIndex(dayIndex(day) - (run - 1));
  const previousBest = bestRunBefore(days, runStart);
  return previousBest > 0 && run === previousBest + 1 ? run : null;
};

// ── The five families ────────────────────────────────────────────────────────

/**
 * Build one item. `text` is DERIVED from the two halves rather than written
 * beside them, so the banner's count and the wall card's face can never
 * disagree about what fired.
 */
const item = (
  family: MilestoneFamily,
  value: string,
  subject: string,
  bucket?: ThresholdBucket,
): MilestoneItem => ({
  family,
  value,
  subject,
  ...(bucket ? { bucket } : {}),
  text: value === "" ? subject : `${value} ${subject}`,
});

/**
 * A day subject's display name. Where absence is impossible the subject got
 * finer (Sleep's "8 hrs", Keyboard's board), and on the wall those need their
 * habit back: "Sleep · 8 hrs" reads, "8 hrs" alone does not.
 */
const qualify = (habit: MHabit, label: string): string =>
  label === habit.name ? habit.name : `${habit.name} · ${label}`;

export function deriveMilestoneDay(input: MilestoneInput): MilestoneDay {
  const { day } = input;
  const items: MilestoneItem[] = [];
  const streaks: ContinuingStreak[] = [];
  const habitById = new Map(input.habits.map((h) => [h.id, h]));
  const rowsByHabit = new Map<string, MSession[]>();
  for (const s of input.sessions) {
    if (s.day > day) continue; // the future never earns a milestone
    const list = rowsByHabit.get(s.habit_fk) ?? [];
    list.push(s);
    rowsByHabit.set(s.habit_fk, list);
  }

  let continuingStreaks = 0;

  for (const habit of input.habits) {
    const rows = (rowsByHabit.get(habit.id) ?? []).slice().sort(byDay);
    if (rows.length === 0) continue;
    const today = rows.filter((s) => s.day === day);

    // ── Thresholds · Nth day (per SUBJECT) + the streak record + continuing ──
    for (const subject of daySubjects(habit, rows, input.cats)) {
      const named = qualify(habit, subject.label);
      const idx = subject.days.indexOf(day);
      if (idx >= 0) {
        const n = idx + 1;
        const crossed = ladderCrossings(ladderFor(habit.ladders, "days"), n - 1, n);
        for (const v of crossed) items.push(item("threshold", ordinal(v), named, "count"));
      }
      // 3 · the streak record fires on OVERTAKING, never on extending
      const run = runEndingAt(subject.days, day);
      if (run >= 2) {
        continuingStreaks++;
        const runStart = dayFromIndex(dayIndex(day) - (run - 1));
        streaks.push({
          value: `${groupInt(run)} d`,
          subject: named,
          longest: run > bestRunBefore(subject.days, runStart),
          days: run,
        });
      }
      const overtook = streakOvertaken(subject.days, day);
      if (overtook != null)
        items.push(item("record", `${groupInt(overtook)} d`, `longest ${named} streak`));
    }

    if (today.length === 0) continue;

    // ── Thresholds · the habit's Nth hour ────────────────────────────────────
    const totalBefore = rows.filter((s) => s.day < day).reduce((a, s) => a + sessionMinutes(s), 0);
    const totalNow = totalBefore + today.reduce((a, s) => a + sessionMinutes(s), 0);
    for (const v of ladderCrossings(
      ladderFor(habit.ladders, "hours"),
      totalBefore / 60,
      totalNow / 60,
    ))
      items.push(item("threshold", `${groupInt(v)} h`, habit.name, "total"));

    // ── Thresholds · the count measure (words) ───────────────────────────────
    // `source: derived` is EXCLUDED: Keyboard's word count IS Writing's, so
    // counting both would cross 100,000 words twice and say it twice.
    const counted = rows.filter((s) => s.measure_kind === "count" && s.source !== "derived");
    if (counted.length > 0) {
      const cBefore = counted.filter((s) => s.day < day).reduce((a, s) => a + (s.value ?? 0), 0);
      const cNow = counted.filter((s) => s.day <= day).reduce((a, s) => a + (s.value ?? 0), 0);
      for (const v of ladderCrossings(ladderFor(habit.ladders, "words"), cBefore, cNow))
        items.push(
          item(
            "threshold",
            `${groupInt(v)} ${habit.count_unit ?? "logged"}`,
            habit.name,
            "total",
          ),
        );
    }

    // ── Thresholds · the Nth hour of an ENTRY ────────────────────────────────
    if (habit.kind === "project") {
      const touched = new Set(today.map((s) => s.entry_fk).filter((e): e is string => e != null));
      for (const entryId of touched) {
        const mine = rows.filter((s) => s.entry_fk === entryId);
        const before = mine.filter((s) => s.day < day).reduce((a, s) => a + sessionMinutes(s), 0);
        const now = mine.filter((s) => s.day <= day).reduce((a, s) => a + sessionMinutes(s), 0);
        const title = input.entryTitle.get(entryId) ?? "an entry";
        for (const v of ladderCrossings(
          ladderFor(habit.ladders, "entryHours"),
          before / 60,
          now / 60,
        ))
          items.push(item("threshold", `${groupInt(v)} h`, title, "total"));
      }
    }

    // ── Records · best day + longest session (first observation SILENT) ──────
    const dayTotals = new Map<string, number>();
    for (const s of rows) dayTotals.set(s.day, (dayTotals.get(s.day) ?? 0) + sessionMinutes(s));
    const todayTotal = dayTotals.get(day) ?? 0;
    const priorDays = [...dayTotals.entries()].filter(([d]) => d < day);
    if (todayTotal > 0 && priorDays.length > 0) {
      const priorBest = Math.max(...priorDays.map(([, v]) => v));
      if (priorBest > 0 && todayTotal > priorBest)
        items.push(
          item("record", hoursMinutes(todayTotal), `best ${habit.name} day`),
        );
    }
    const priorSessions = rows.filter((s) => s.day < day).map(sessionMinutes);
    const todayLongest = Math.max(0, ...today.map(sessionMinutes));
    if (todayLongest > 0 && priorSessions.length > 0) {
      const priorBest = Math.max(...priorSessions);
      if (priorBest > 0 && todayLongest > priorBest)
        items.push(
          item("record", hoursMinutes(todayLongest), `longest ${habit.name} session`),
        );
    }

    // ── Lifecycle · waves started · the comeback · a habit revived ───────────
    const gapDays = habit.wave_gap_days ?? input.waveGapDefault;
    const habitDays = [...new Set(rows.map((s) => s.day))].sort();
    const earlier = habitDays.filter((d) => d < day);
    const previousDay = earlier.length > 0 ? earlier[earlier.length - 1] : null;
    if (previousDay != null && dayGap(previousDay, day) >= 180)
      items.push(
        item(
          "lifecycle",
          "",
          `${habit.name} revived after ${Math.round(dayGap(previousDay, day) / 30)} months`,
        ),
      );

    if (habit.kind === "project") {
      const touched = new Set(today.map((s) => s.entry_fk).filter((e): e is string => e != null));
      for (const entryId of touched) {
        const days = [...new Set(rows.filter((s) => s.entry_fk === entryId).map((s) => s.day))].sort();
        const i = days.indexOf(day);
        if (i <= 0) continue; // the entry's first day is not a "wave started"
        const gap = dayGap(days[i - 1], day);
        if (gap <= gapDays) continue; // same wave — nothing started
        // Which wave is this? Count the gaps that precede it.
        let waveNo = 1;
        for (let k = 1; k <= i; k++) if (dayGap(days[k - 1], days[k]) > gapDays) waveNo++;
        const title = input.entryTitle.get(entryId) ?? "an entry";
        items.push(item("lifecycle", ordinal(waveNo), `wave of ${title}`));
        if (gap >= 365)
          items.push(
            item("lifecycle", "", `${title} back after ${Math.floor(gap / 365)}y away`),
          );
      }

      // ── Rank change · the leaderboard OVERTAKE, top spot only ─────────────
      const totalsTo = (limit: string) => {
        const m = new Map<string, number>();
        for (const s of rows) {
          if (s.day > limit || s.entry_fk == null) continue;
          m.set(s.entry_fk, (m.get(s.entry_fk) ?? 0) + sessionMinutes(s));
        }
        return m;
      };
      const topOf = (m: Map<string, number>): string | null => {
        let best: string | null = null;
        let bestV = 0;
        // Ties break on entry id — map insertion order is not stable across
        // derivations, and a flipping top would mint spurious rank changes (2026-07-30).
        for (const [k, v] of m)
          if (v > bestV || (v === bestV && best != null && k < best)) ((bestV = v), (best = k));
        return best;
      };
      const beforeTop = topOf(totalsTo(previousDay ?? "0000-01-01"));
      const nowTop = topOf(totalsTo(day));
      if (beforeTop != null && nowTop != null && beforeTop !== nowTop)
        // "shorten" (user-ruled): a subject and a short predicate. The card
        // names BOTH parties, which is what the exhibit's Rank-change sentence
        // does; the banner only ever counts, so it never carries the sentence.
        items.push(
          item(
            "rank",
            "",
            `${input.entryTitle.get(nowTop) ?? "an entry"} passed ${
              input.entryTitle.get(beforeTop) ?? "an entry"
            } as most-played`,
          ),
        );
    }

    // ── Anniversaries · the habit's first session ───────────────────────────
    const first = habitDays[0];
    if (first != null && first.slice(5) === day.slice(5) && first < day) {
      const years = Number(day.slice(0, 4)) - Number(first.slice(0, 4));
      if (years >= 1)
        items.push(
          item(
            "anniversary",
            `${years} ${years === 1 ? "year" : "years"}`,
            `of ${habit.name}`,
          ),
        );
    }
  }

  // ── Thresholds · Nth session logged, APP-WIDE ("ALL sessions accumulating")
  const allBefore = input.sessions.filter((s) => s.day < day).length;
  const allNow = input.sessions.filter((s) => s.day <= day).length;
  for (const v of ladderCrossings(globalLadderFor("sessions"), allBefore, allNow))
    items.push(item("threshold", ordinal(v), "session logged", "count"));

  // ── Lifecycle · Nth entry finished ──────────────────────────────────────────
  const finishedToday = input.entriesCompleted.filter((e) => e.completed === day);
  for (const e of finishedToday) {
    const n = input.entriesCompleted.filter((o) => o.habit_fk === e.habit_fk && o.completed <= day).length;
    const habit = habitById.get(e.habit_fk);
    items.push(
      item(
        "lifecycle",
        ordinal(n),
        `${habit?.name ?? ""} finished — ${input.entryTitle.get(e.id) ?? "an entry"}`.trim(),
      ),
    );
  }

  // ── Anniversaries · the app's own start date ────────────────────────────────
  if (input.appStart != null && input.appStart.slice(5) === day.slice(5) && input.appStart < day) {
    const years = Number(day.slice(0, 4)) - Number(input.appStart.slice(0, 4));
    if (years >= 1)
      items.push(
        item(
          "anniversary",
          `${years} ${years === 1 ? "year" : "years"}`,
          "of tracking with Cibo",
        ),
      );
  }

  const recordCount = items.filter((i) => i.family === "record").length;
  const milestoneCount = items.length - recordCount;
  streaks.sort((a, b) => b.days - a.days || a.subject.localeCompare(b.subject));

  return {
    items,
    milestoneCount,
    recordCount,
    continuingStreaks,
    streaks,
    ...bannerText(milestoneCount, recordCount, continuingStreaks),
  };
}

/**
 * 1 · THE COUNT HEADLINE — uniform, counting even when the count is one
 * ("If we get specific, it quickly balloons out of control"). Empty when
 * nothing fired: the banner stays an EVENT, not furniture, and the streak count
 * rides along only when it is already showing.
 *
 * ONE LINE, no subtitle (user-ruled 2026-07-26). The drawn `.ms` subline
 * explained the machinery — "derived from the milestone catalog, never stored…"
 * — which is a note to a reader of the mockup, not to someone logging their day;
 * so the streak count, which was living there, moves into the sentence it
 * belongs in.
 */
export const bannerText = (
  milestones: number,
  records: number,
  streaks: number,
): { headline: string } => {
  if (milestones === 0 && records === 0) return { headline: "" };
  const clauses: string[] = [];
  if (milestones > 0)
    clauses.push(`met ${groupInt(milestones)} milestone${milestones === 1 ? "" : "s"}`);
  if (records > 0)
    clauses.push(`broke ${groupInt(records)} record${records === 1 ? "" : "s"}`);
  if (streaks > 0)
    clauses.push(`are continuing ${groupInt(streaks)} streak${streaks === 1 ? "" : "s"}`);
  const joined =
    clauses.length === 1
      ? clauses[0]
      : `${clauses.slice(0, -1).join(", ")} and ${clauses[clauses.length - 1]}`;
  return { headline: `You ${joined} today.` };
};
