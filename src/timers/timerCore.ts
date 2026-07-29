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
 *  - a pomodoro work-interval boundary is functionally a STOP (the same
 *    management window; stop-window ≡ interval-window, one block);
 *  - exclusivity: one clock per simple habit, per ENTRY for project habits
 *    (the entry is picked at join).
 *
 * Timer state is per-device, never synced (Design Outline §8).
 */

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
  /** accumulated ms, EXCLUDING the live running span (folded base). */
  baseMs: number;
}

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
  /** pomodoro: the user-set pair (defaults 25/5 until step 10's Settings row). */
  workMs: number | null;
  breakMs: number | null;
  phase: "work" | "break";
  /** 1-based work-interval index (the cycle dots + "Interval N"). */
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

export type Boundary = "countdown-zero" | "work-end" | "break-end" | null;

/**
 * Advance a clock across a phase boundary if one has been reached.
 *  - countdown at zero: functionally a stop — fold + pause (the caller opens
 *    the management window and sounds the signal);
 *  - pomodoro work end: fold + pause — SAME (stop ≡ interval-end, one window);
 *  - pomodoro break end: roll into the next work interval, still running.
 */
export const advance = (clock: Clock, now: number): { clock: Clock; boundary: Boundary } => {
  const c = clock;
  if (!c.running) return { clock: c, boundary: null };
  if (c.mode === "countdown" && c.targetMs != null && clockMs(c, now) >= c.targetMs) {
    const f = fold(c, now);
    return { clock: { ...f, running: false, resumedAt: null }, boundary: "countdown-zero" };
  }
  if (c.mode === "pomodoro") {
    const len = c.phase === "work" ? c.workMs : c.breakMs;
    if (len != null && phaseMs(c, now) >= len) {
      const f = fold(c, now);
      if (c.phase === "work")
        return { clock: { ...f, running: false, resumedAt: null }, boundary: "work-end" };
      return {
        clock: { ...f, phase: "work", interval: f.interval + 1, phaseBaseMs: 0, resumedAt: now },
        boundary: "break-end",
      };
    }
  }
  return { clock: c, boundary: null };
};

/**
 * Resume out of the management window. If a pomodoro sits at a finished work
 * interval, resuming ENTERS THE BREAK (the window opened "before the next
 * interval counts down"); otherwise it just re-anchors and runs.
 */
export const resumeClock = (c: Clock, now: number): Clock => {
  if (
    c.mode === "pomodoro" &&
    c.phase === "work" &&
    c.workMs != null &&
    c.phaseBaseMs >= c.workMs
  )
    return { ...c, phase: "break", phaseBaseMs: 0, running: true, resumedAt: now };
  return { ...c, running: true, resumedAt: now };
};

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

/** h:mm:ss above an hour, m:ss below (the drawn readout shapes). */
export const fmtMs = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
};

/** "25:00"-style mm:ss (config chips; grows to h:mm:ss above an hour). */
export const fmtTarget = (ms: number): string => {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
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

/** An accumulator handed to the log form: whole minutes, floor 1. */
export const handoffMinutes = (ms: number): number => Math.max(1, Math.round(ms / 60000));
