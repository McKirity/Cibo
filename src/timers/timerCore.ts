/**
 * Build step 7 — the accumulator machinery, PURE half.
 *
 * The recording contract ([[Timers]] · [[Timer Modes & Formats]], restated):
 * every mode is a different clock FACE over the same accumulator machinery.
 * A clock = ONE mode + its own tracked set with per-item accumulators;
 * multiple clocks run concurrently. FORM-FIRST — nothing in this module ever
 * writes a session; stopping hands accumulators to the log form.
 *
 * Accrual is WALL-CLOCK, not tick-counting: every accumulator is a folded
 * base plus (now − resumedAt) while accruing, so a starved interval never
 * loses time and the display tick is purely cosmetic.
 *
 * Rulings carried here:
 *  - countdown records ACTUAL ELAPSED, never the target;
 *  - the pomodoro accumulated total sums WORK intervals only — breaks tick the
 *    phase clock but never an accumulator;
 *  - A POMODORO RUNS A SET NUMBER OF INTERVALS (user-ruled 2026-08-08,
 *    AMENDING the 2026-07-03 "an interval end is functionally a stop" ruling):
 *    1 interval = 1 work period, breaks sit BETWEEN intervals only — never
 *    first, never last — so N intervals schedule N−1 breaks. A work end that
 *    is not the last chimes and rolls STRAIGHT into the break; a break end
 *    chimes and rolls straight into the next interval. Only the LAST
 *    interval's end opens the management window. The minimum is TWO
 *    (user-ruled: "there's no point in just one interval").
 *  - exclusivity: one clock per simple habit, per ENTRY for project habits
 *    (the entry is picked at join).
 *
 * Timer state is per-device, never synced (Design Outline §8).
 */
import { pad2 } from "../metrics/clock";

export type TimerMode = "stopwatch" | "countdown" | "pomodoro";

export interface TrackedItem {
  habitId: string;
  habitKey: string;
  habitName: string;
  /** habit kind — "project" needs an entry at join; others are habit-exclusive. */
  habitKind: string;
  /** colour slot name, e.g. "habit-2" (rendered as `var(--habit-2)`). */
  colourSlot: string;
  entryId: string | null;
  entryTitle: string | null;
  /**
   * Session-scope categorical answers picked AT JOIN (2026-08-20, user-ruled
   * — Coding's language), keyed by definition key, travelling with the item
   * into the hand-off so the landed bout is complete. The entry's precedent,
   * extended: "the log step confirms rather than first attaches it."
   * ABSENT on a clock persisted by an older build — read as no answers.
   */
  cats?: Record<string, string>;
  /** accumulated ms, EXCLUDING the live running span (folded base). */
  baseMs: number;
}

/** The picked categorical values as one " · "-joined caption ("" when none). */
export const catsLabel = (item: Pick<TrackedItem, "cats">): string =>
  Object.values(item.cats ?? {})
    .filter((v) => v !== "")
    .join(" · ");

export interface Clock {
  id: number;
  mode: TimerMode;
  running: boolean;
  /** epoch ms of the last resume — null while paused. */
  resumedAt: number | null;
  tracked: TrackedItem[];
  /** The clock's own elapsed accumulator — the hero readout. Work-only for pomodoro. */
  clockBaseMs: number;
  /** countdown: the target length. */
  targetMs: number | null;
  /** pomodoro: the user-set pair (Settings → Timers owns the defaults). */
  workMs: number | null;
  breakMs: number | null;
  /**
   * pomodoro: how many WORK intervals the run is planned for (≥ 2 — the ruled
   * minimum). Breaks are the gaps between them, so the plan is
   * work·break·work…·work and never opens or closes on a break.
   *
   * NULL is the legacy shape — a clock persisted by a build older than
   * 2026-08-08, recovered from the heartbeat file. It has no plan, so every
   * work end is treated as the last one: exactly the pre-amendment behaviour,
   * which is the honest thing to give a clock that was started under it.
   */
  intervals: number | null;
  phase: "work" | "break";
  /** 1-based work-interval index (the cycle dots + "Interval N of M"). */
  interval: number;
  /** elapsed in the CURRENT phase, excluding the live span (folded base). */
  phaseBaseMs: number;
}

/** Does time currently flow into the accumulators? (Breaks never accrue.) */
export const accrues = (c: Clock): boolean =>
  c.running && (c.mode !== "pomodoro" || c.phase === "work");

/** The live running span in ms (0 while paused). */
export const liveSpan = (c: Clock, now: number): number =>
  c.running && c.resumedAt != null ? Math.max(0, now - c.resumedAt) : 0;

/** A tracked item's live accumulated ms. */
export const itemMs = (c: Clock, item: TrackedItem, now: number): number =>
  item.baseMs + (accrues(c) ? liveSpan(c, now) : 0);

/** The clock's own live elapsed ms (the hero readout; work-only for pomodoro). */
export const clockMs = (c: Clock, now: number): number =>
  c.clockBaseMs + (accrues(c) ? liveSpan(c, now) : 0);

/** The current PHASE's live elapsed ms — breaks advance this, accumulators no. */
export const phaseMs = (c: Clock, now: number): number => c.phaseBaseMs + liveSpan(c, now);

/** Countdown / pomodoro-interval remaining ms (the depleting ring). */
export const remainingMs = (c: Clock, now: number): number => {
  if (c.mode === "countdown" && c.targetMs != null)
    return Math.max(0, c.targetMs - clockMs(c, now));
  if (c.mode === "pomodoro") {
    const len = c.phase === "work" ? c.workMs : c.breakMs;
    if (len != null) return Math.max(0, len - phaseMs(c, now));
  }
  return 0;
};

/**
 * Fold the live span into every base and re-anchor. The one mutation-shaped
 * helper — returns a NEW clock; callers own the state swap. Used on pause,
 * on stop, on every persist snapshot and at phase boundaries.
 */
export const fold = (c: Clock, now: number): Clock => {
  const s = liveSpan(c, now);
  if (s === 0) return { ...c, resumedAt: c.running ? now : null };
  const grows = accrues(c);
  return {
    ...c,
    tracked: grows ? c.tracked.map((t) => ({ ...t, baseMs: t.baseMs + s })) : c.tracked,
    clockBaseMs: grows ? c.clockBaseMs + s : c.clockBaseMs,
    phaseBaseMs: c.phaseBaseMs + s,
    resumedAt: c.running ? now : null,
  };
};

export type Boundary = "countdown-zero" | "work-end" | "break-end" | "pomo-end" | null;

/** The ruled floor on a pomodoro plan (user, 2026-08-08). */
export const MIN_INTERVALS = 2;

/** Is this work interval the last one the plan calls for? (A legacy plan-less
 *  clock answers YES at every work end — see `Clock.intervals`.) */
const isLastInterval = (c: Clock): boolean =>
  c.intervals == null || c.interval >= c.intervals;

/**
 * Has a pomodoro finished the interval it was planned for? True only while it
 * sits paused past the end of its LAST work interval — the one state the
 * management window offers a re-run out of rather than a plain Resume.
 */
export const pomoPlanDone = (c: Clock): boolean =>
  c.mode === "pomodoro" &&
  c.phase === "work" &&
  c.workMs != null &&
  c.phaseBaseMs >= c.workMs &&
  isLastInterval(c);

/**
 * Advance a clock across a phase boundary if one has been reached.
 *  - countdown at zero: functionally a stop — fold + pause (the caller opens
 *    the management window and sounds the signal);
 *  - pomodoro work end, more intervals to come: chime and roll STRAIGHT into
 *    the break, still running — no dialog (the 2026-08-08 amendment);
 *  - pomodoro break end: chime and roll into the next work interval;
 *  - pomodoro LAST work end: fold + pause — the one boundary that opens the
 *    management window.
 */
export const advance = (clock: Clock, now: number): { clock: Clock; boundary: Boundary } => {
  const c = clock;
  if (!c.running) return { clock: c, boundary: null };
  if (c.mode === "countdown" && c.targetMs != null && clockMs(c, now) >= c.targetMs) {
    // fold at the instant it hit zero, not at the tick that noticed
    const f = fold(c, now - (clockMs(c, now) - c.targetMs));
    return { clock: { ...f, running: false, resumedAt: null }, boundary: "countdown-zero" };
  }
  if (c.mode === "pomodoro") {
    const len = c.phase === "work" ? c.workMs : c.breakMs;
    if (len != null && phaseMs(c, now) >= len) {
      /*
       * THE BOUNDARY INSTANT, not the tick instant. A tick lands up to 500 ms
       * late — and after a machine sleeps, minutes or hours late. Folding at
       * `now` would credit that overshoot to the phase that just ENDED (sleep
       * counted as work) and then start the next phase from zero at the tick,
       * so every boundary shed its own lateness and the clock drifted.
       *
       * Folding at `now − overshoot` credits each phase exactly its own
       * length and re-anchors THERE, which leaves the overshoot sitting in
       * the new phase's live span — so a caller looping `advance` at one
       * fixed `now` walks the whole sleep, phase by phase, with every span
       * landing in the phase that actually owns it (breaks still never
       * accrue: `fold` asks `accrues` per phase).
       */
      const at = now - (phaseMs(c, now) - len);
      const f = fold(c, at);
      if (c.phase === "break")
        return {
          clock: { ...f, phase: "work", interval: f.interval + 1, phaseBaseMs: 0 },
          boundary: "break-end",
        };
      if (isLastInterval(c))
        return { clock: { ...f, running: false, resumedAt: null }, boundary: "pomo-end" };
      return {
        clock: { ...f, phase: "break", phaseBaseMs: 0 },
        boundary: "work-end",
      };
    }
  }
  return { clock: c, boundary: null };
};

/**
 * Resume out of the management window — a plain re-anchor.
 *
 * The old "a finished work interval resumes INTO the break" branch is GONE:
 * breaks now start themselves at the boundary, so the only clock that can sit
 * paused past a work end is one whose plan is DONE, and that one is re-run
 * through `restartPomo` (the user picks a fresh count and pair) rather than
 * resumed.
 */
export const resumeClock = (c: Clock, now: number): Clock => ({
  ...c,
  running: true,
  resumedAt: now,
});

/**
 * Start a fresh pomodoro plan on an existing clock — the ruled answer to
 * "resume" at the end of the last interval (user, 2026-08-08: *"it prompts me
 * to set another amount of intervals + work time + breaks"*).
 *
 * The ACCUMULATORS SURVIVE: this is the same clock over the same tracked set,
 * still heading for one summed session per item, which is exactly what makes
 * it a re-run rather than a new clock. Only the plan resets.
 */
export const restartPomo = (
  c: Clock,
  cfg: { intervals: number; workMs: number; breakMs: number },
  now: number,
): Clock => ({
  ...c,
  intervals: Math.max(MIN_INTERVALS, Math.round(cfg.intervals)),
  workMs: cfg.workMs,
  breakMs: cfg.breakMs,
  phase: "work",
  interval: 1,
  phaseBaseMs: 0,
  running: true,
  resumedAt: now,
});

/** Exclusivity — the units already spoken for across every clock. */
export const takenUnits = (
  clocks: Clock[],
): { habitIds: Set<string>; entryIds: Set<string> } => {
  const habitIds = new Set<string>();
  const entryIds = new Set<string>();
  for (const c of clocks)
    for (const t of c.tracked) {
      if (t.habitKind === "project") {
        if (t.entryId != null) entryIds.add(t.entryId);
      } else habitIds.add(t.habitId);
    }
  return { habitIds, entryIds };
};

// ── formatting ───────────────────────────────────────────────────────────────

/** h:mm:ss above an hour, m:ss below (the drawn readout shapes).
 * Near-twin of `fmtTarget` below, deliberately NOT merged: this one FLOORS
 * (a live readout must never show a second that hasn't elapsed). */
export const fmtMs = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
};

/** "25:00"-style mm:ss (config chips; grows to h:mm:ss above an hour).
 * Near-twin of `fmtMs` above, deliberately NOT merged: this one ROUNDS — a
 * configured target is a nominal length, and flooring would show "24:59"
 * for a 25-minute target off any sub-second float residue. */
export const fmtTarget = (ms: number): string => {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
};

/** Parse "25", "25:00" or "1:30:00" into ms (null on nonsense). */
export const parseTarget = (raw: string): number | null => {
  const parts = raw.trim().split(":").map((x) => x.trim());
  if (parts.length === 0 || parts.length > 3 || parts.some((x) => x === "" || !/^\d+$/.test(x)))
    return null;
  const nums = parts.map(Number);
  let seconds = 0;
  if (parts.length === 1) seconds = nums[0] * 60; // a bare number reads as minutes
  else if (parts.length === 2) seconds = nums[0] * 60 + nums[1];
  else seconds = nums[0] * 3600 + nums[1] * 60 + nums[2];
  if (seconds <= 0) return null;
  return seconds * 1000;
};

/**
 * Parse the pomodoro interval count (null on nonsense OR below the ruled
 * minimum of 2). Deliberately NOT clamping a "1" up to 2: a typed 1 is a
 * statement, and answering it by silently running two intervals would be the
 * gate lying about what it will do — the field reads invalid instead.
 */
export const parseIntervals = (raw: string): number | null => {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= MIN_INTERVALS ? n : null;
};

/** An accumulator handed to the log form: whole minutes, floor 1. */
export const handoffMinutes = (ms: number): number => Math.max(1, Math.round(ms / 60000));

/** A clock mode's display name — the board, the tray and the modals all show it. */
export const modeLabel = (m: TimerMode): string =>
  m === "stopwatch" ? "Stopwatch" : m === "countdown" ? "Countdown" : "Pomodoro";
