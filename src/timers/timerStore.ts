/**
 * Build step 7 — the timer STORE: one module-level singleton, because clocks
 * keep running wherever the user navigates. React reads it through
 * `useTimers()` (useSyncExternalStore); the ticker below owns boundary
 * detection (countdown-zero · pomodoro phase ends) so a clock finishes even
 * with no timer surface mounted.
 *
 * PERSISTENCE — per-device, never synced: the ruled ~15 s HEARTBEAT FILE
 * (timer-heartbeat.json via settings/deviceStore, 2026-08-04 — separate from
 * settings.json so the beat never churns it): state is written on
 * every mutation and on a ~15 s heartbeat while running. The clean-close
 * invariant does the crash detection: every clean quit either had no clocks or
 * discarded them through the quit warning, so ANY persisted clock at launch is
 * a crash → the recovery queue (one dialog per clock, sequentially —
 * the multi-clock corner, ruled 2026-07-28). Crash gap never counted: the
 * recovered values are the last-persisted fold, allowed to lag ≤ one heartbeat.
 * main.tsx awaits the device store BEFORE this module evaluates, so the
 * crash-detection IIFE below reads a primed cache synchronously.
 */
import { useSyncExternalStore } from "react";
import {
  advance,
  clockSpent,
  fold,
  pomoPlanDone,
  restartPomo,
  resumeClock,
  type Boundary,
  type Clock,
  type TimerMode,
  type TrackedItem,
} from "./timerCore";
import { fireSignal, unlockAudio } from "./signal";
import { syncTray } from "./tray";
import { stagedCount } from "./logHandoff";
import { timerGet, timerSet } from "../settings/deviceStore";

const HEARTBEAT_MS = 15_000;

export interface TimerState {
  clocks: Clock[];
  focusedId: number | null;
  /** the open management window's clock (a stop OR a pomodoro interval-end). */
  manageId: number | null;
  /** crash-recovered clocks awaiting their launch-moment dialog, FIFO. */
  recoveryQueue: Clock[];
}

let state: TimerState = { clocks: [], focusedId: null, manageId: null, recoveryQueue: [] };
let nextId = 1;
let version = 0;
const listeners = new Set<() => void>();

const emit = () => {
  version++;
  for (const l of listeners) l();
};

const persist = () => {
  try {
    if (state.clocks.length === 0 && state.recoveryQueue.length === 0) {
      timerSet(null);
      return;
    }
    const now = Date.now();
    // Snapshot with every span folded — last-persisted values, exactly what a
    // crash recovers. The un-restored recovery queue rides along AS RUNNING —
    // that is the honest state at the original crash, and it is what re-queues
    // them after a second crash mid-dialog (written paused they would classify
    // as deliberately paused and skip the ruled dialog, 2026-07-30).
    const folded = [
      ...state.clocks.map((c) => fold(c, now)),
      ...state.recoveryQueue.map((c) => ({ ...c, running: true })),
    ];
    timerSet(JSON.stringify({ clocks: folded, savedAt: now }));
  } catch {
    /* storage unavailable — timers still run, recovery just has nothing */
  }
};

const mutate = (fn: (s: TimerState) => TimerState) => {
  state = fn(state);
  persist();
  emit();
};

// ── launch: crash detection ──────────────────────────────────────────────────

(() => {
  // An HMR re-eval is not a crash: the dispose hook below persisted live state
  // and set this flag, so the persisted clocks restore straight onto the board.
  const hmr = (globalThis as { __ciboTimerHmr?: boolean }).__ciboTimerHmr === true;
  (globalThis as { __ciboTimerHmr?: boolean }).__ciboTimerHmr = false;
  try {
    const raw = timerGet();
    if (raw == null) return;
    const parsed = JSON.parse(raw) as { clocks?: Clock[] };
    const clocks = Array.isArray(parsed.clocks) ? parsed.clocks : [];
    if (clocks.length === 0) return;
    for (const c of clocks) c.id = nextId++;
    if (hmr) {
      // Re-anchor — an un-restored queue member persists running with no
      // resumedAt, and without one it would sit still despite `running`.
      for (const c of clocks) if (c.running && c.resumedAt == null) c.resumedAt = Date.now();
      state = { clocks, focusedId: clocks[0]?.id ?? null, manageId: null, recoveryQueue: [] };
      return;
    }
    for (const c of clocks) c.resumedAt = null; // the crash gap is never counted
    // A clock that was PAUSED at the crash holds nothing ambiguous — its fold
    // was deliberate — so it returns to the board silently. Running clocks get
    // the dialog.
    const paused = clocks.filter((c) => !c.running);
    const running = clocks.filter((c) => c.running).map((c) => ({ ...c, running: false }));
    state = {
      clocks: paused,
      focusedId: paused[0]?.id ?? null,
      manageId: null,
      recoveryQueue: running,
    };
  } catch {
    /* unreadable state — start clean */
  }
})();

// ── the ticker — boundaries + heartbeat + tray, display ticks for free ───────

let tickHandle: ReturnType<typeof setInterval> | null = null;
let lastBeat = 0;

/** Does this boundary stop the clock and hand it to the user? */
const opensManage = (b: Boundary): boolean => b === "countdown-zero" || b === "pomo-end";

/**
 * Walk a clock across EVERY boundary it has passed, not just the next one.
 *
 * Accrual is wall-clock, so a machine that slept through three pomodoro phases
 * wakes with all three already behind it. One boundary per 500 ms tick would
 * step through them in real time — three chimes, the ring visibly replaying a
 * cycle that is already over. This lands on the true phase in one tick and
 * reports the LAST boundary crossed, so exactly one signal sounds and a plan
 * that finished during the sleep opens its window immediately.
 *
 * The cap is a runaway guard, not a limit anyone should reach (a slept week at
 * a 25/5 pair is ~336 phases): past it the clock is left mid-catch-up and the
 * next tick continues, which degrades to the old one-per-tick behaviour rather
 * than freezing the ticker.
 */
const CATCH_UP_CAP = 512;

const advanceAll = (c: Clock, now: number): { clock: Clock; boundary: Boundary } => {
  let clock = c;
  let last: Boundary = null;
  for (let i = 0; i < CATCH_UP_CAP; i++) {
    const step = advance(clock, now);
    if (step.boundary == null) break;
    clock = step.clock;
    last = step.boundary;
  }
  return { clock, boundary: last };
};

const tick = () => {
  const now = Date.now();
  let changed = false;
  const clocks = state.clocks.map((c) => {
    const { clock, boundary } = advanceAll(c, now);
    if (boundary != null) {
      changed = true;
      fireSignal(boundary);
      if (opensManage(boundary)) {
        // the run is over → the management window (a stop and the last
        // interval's end are ONE block). A mid-plan work end and a break end
        // chime and roll on: no dialog (user-ruled 2026-08-08).
        state = { ...state, manageId: clock.id, focusedId: clock.id };
      }
    }
    return clock;
  });
  if (changed) {
    state = { ...state, clocks };
    persist();
    lastBeat = now;
  } else if (now - lastBeat >= HEARTBEAT_MS && clocks.some((c) => c.running)) {
    persist();
    lastBeat = now;
  }
  void syncTray(state.clocks, now);
  // display tick — subscribers repaint their readouts
  emit();
  // A boundary can pause the LAST running clock (countdown-zero, work-end) —
  // without this the 500 ms interval ran forever after one (2026-07-30).
  if (changed) syncTicker();
};

const syncTicker = () => {
  const need = state.clocks.some((c) => c.running);
  if (need && tickHandle == null) tickHandle = setInterval(tick, 500);
  if (!need && tickHandle != null) {
    clearInterval(tickHandle);
    tickHandle = null;
    void syncTray(state.clocks, Date.now());
  }
};

// keep the ticker honest around every mutation
const mutateAnd = (fn: (s: TimerState) => TimerState) => {
  mutate(fn);
  syncTicker();
};

// ── actions ──────────────────────────────────────────────────────────────────

export interface NewClockConfig {
  mode: TimerMode;
  tracked: Omit<TrackedItem, "baseMs">[];
  targetMs?: number | null;
  workMs?: number | null;
  breakMs?: number | null;
  /** pomodoro: how many work intervals to run (the ruled minimum is 2). */
  intervals?: number | null;
}

export const createClock = (cfg: NewClockConfig): void => {
  unlockAudio(); // a click — the gesture that lets the boundary chime sound later
  const now = Date.now();
  const clock: Clock = {
    id: nextId++,
    mode: cfg.mode,
    running: true,
    resumedAt: now,
    tracked: cfg.tracked.map((t) => ({ ...t, baseMs: 0 })),
    clockBaseMs: 0,
    targetMs: cfg.mode === "countdown" ? (cfg.targetMs ?? null) : null,
    workMs: cfg.mode === "pomodoro" ? (cfg.workMs ?? null) : null,
    breakMs: cfg.mode === "pomodoro" ? (cfg.breakMs ?? null) : null,
    intervals: cfg.mode === "pomodoro" ? (cfg.intervals ?? null) : null,
    phase: "work",
    interval: 1,
    phaseBaseMs: 0,
  };
  mutateAnd((s) => ({ ...s, clocks: [...s.clocks, clock], focusedId: clock.id }));
};

const patchClock = (id: number, fn: (c: Clock) => Clock) =>
  mutateAnd((s) => ({ ...s, clocks: s.clocks.map((c) => (c.id === id ? fn(c) : c)) }));

export const pauseClock = (id: number): void =>
  patchClock(id, (c) => ({ ...fold(c, Date.now()), running: false, resumedAt: null }));

/**
 * The board's Resume. A pomodoro whose plan is DONE cannot simply resume — its
 * work phase is already past its length, so it would boundary again on the
 * next tick and re-open the window in half a second. It routes to the
 * management window instead, which is where the re-run form lives.
 */
export const runClock = (id: number): void => {
  unlockAudio();
  const c = state.clocks.find((x) => x.id === id);
  if (c != null && pomoPlanDone(c)) {
    mutate((s) => ({ ...s, manageId: id, focusedId: id }));
    return;
  }
  patchClock(id, (x) => resumeClock(x, Date.now()));
};

/**
 * Pause all / Resume all (user-asked 2026-08-22): the board-wide pair. Pause
 * folds every running clock; Resume re-anchors every paused one that has
 * somewhere to go — a SPENT clock (a countdown at zero, a pomodoro past its
 * last interval) stays put, because resuming it would only re-open its
 * management window; it waits for its own Resume / "Run another set…".
 * No-ops when nothing qualifies, so the buttons can sit on the board freely.
 */
export const pauseAll = (): void => {
  if (!state.clocks.some((c) => c.running)) return;
  const now = Date.now();
  mutateAnd((s) => ({
    ...s,
    clocks: s.clocks.map((c) =>
      c.running ? { ...fold(c, now), running: false, resumedAt: null } : c,
    ),
  }));
};

export const canResumeAll = (clocks: Clock[]): boolean =>
  clocks.some((c) => !c.running && !clockSpent(c));

export const resumeAll = (): void => {
  if (!canResumeAll(state.clocks)) return;
  unlockAudio();
  const now = Date.now();
  mutateAnd((s) => ({
    ...s,
    clocks: s.clocks.map((c) =>
      !c.running && !clockSpent(c) ? resumeClock(c, now) : c,
    ),
  }));
};

/** A user stop: fold + pause + open the management window. */
export const stopClock = (id: number): void =>
  mutateAnd((s) => ({
    ...s,
    clocks: s.clocks.map((c) =>
      c.id === id ? { ...fold(c, Date.now()), running: false, resumedAt: null } : c,
    ),
    manageId: id,
    focusedId: id,
  }));

export const focusClock = (id: number): void => mutate((s) => ({ ...s, focusedId: id }));

export const closeManage = (): void => mutate((s) => ({ ...s, manageId: null }));

/** Resume out of the management window (a finished pomodoro work interval enters its break). */
export const resumeFromManage = (id: number): void => {
  unlockAudio();
  mutateAnd((s) => ({
    ...s,
    manageId: null,
    clocks: s.clocks.map((c) => (c.id === id ? resumeClock(c, Date.now()) : c)),
  }));
};

/**
 * Run another pomodoro plan on the same clock (user-ruled 2026-08-08 — what
 * "resume" means at the end of the last interval). The tracked set and every
 * accumulator carry over; only the plan is new.
 */
export const restartPomodoro = (
  id: number,
  cfg: { intervals: number; workMs: number; breakMs: number },
): void => {
  unlockAudio();
  mutateAnd((s) => ({
    ...s,
    manageId: null,
    clocks: s.clocks.map((c) => (c.id === id ? restartPomo(c, cfg, Date.now()) : c)),
  }));
};

/** Add units to a running set — a newly added item starts at 0 (the ruled rule). */
export const addTracked = (id: number, items: Omit<TrackedItem, "baseMs">[]): void =>
  patchClock(id, (c) => ({
    ...c,
    tracked: [...c.tracked, ...items.map((t) => ({ ...t, baseMs: 0 }))],
  }));

export const removeTracked = (id: number, index: number): void =>
  patchClock(id, (c) => ({ ...c, tracked: c.tracked.filter((_, i) => i !== index) }));

/**
 * Log ONE item (ruled 2026-07-28): hand its accumulator off and drop it from
 * the set. The caller (the manage window) stages the handoff — nothing here
 * writes.
 */
export const takeTracked = (id: number, index: number): TrackedItem | null => {
  const clock = state.clocks.find((c) => c.id === id);
  const item = clock?.tracked[index] ?? null;
  if (clock == null || item == null) return null;
  const folded = fold(clock, Date.now());
  const taken = folded.tracked[index];
  mutateAnd((s) => ({
    ...s,
    clocks: s.clocks.map((c) =>
      c.id === id ? { ...folded, tracked: folded.tracked.filter((_, i) => i !== index) } : c,
    ),
  }));
  return taken;
};

/**
 * Log ALL (ruled 2026-07-28): hand everything off and dissolve the clock.
 */
export const takeAllTracked = (id: number): TrackedItem[] => {
  const clock = state.clocks.find((c) => c.id === id);
  if (clock == null) return [];
  const folded = fold(clock, Date.now());
  mutateAnd((s) => {
    const clocks = s.clocks.filter((c) => c.id !== id);
    return {
      ...s,
      clocks,
      manageId: s.manageId === id ? null : s.manageId,
      focusedId: s.focusedId === id ? (clocks[0]?.id ?? null) : s.focusedId,
    };
  });
  return folded.tracked;
};

export const discardClock = (id: number): void =>
  mutateAnd((s) => {
    const clocks = s.clocks.filter((c) => c.id !== id);
    return {
      ...s,
      clocks,
      manageId: s.manageId === id ? null : s.manageId,
      focusedId: s.focusedId === id ? (clocks[0]?.id ?? null) : s.focusedId,
    };
  });

// ── crash recovery (launch-moment, one dialog per clock) ─────────────────────

const popRecovery = (s: TimerState): [Clock | null, Clock[]] => [
  s.recoveryQueue[0] ?? null,
  s.recoveryQueue.slice(1),
];

/** Continue — the clock resumes accruing from its last-persisted values. */
export const recoveryContinue = (): void => {
  unlockAudio();
  mutateAnd((s) => {
    const [head, rest] = popRecovery(s);
    if (head == null) return s;
    const revived = resumeClock({ ...head, running: false }, Date.now());
    return {
      ...s,
      recoveryQueue: rest,
      clocks: [...s.clocks, revived],
      focusedId: revived.id,
    };
  });
};

/** Log now — the management-window hand-off: restored paused, window open. */
export const recoveryLogNow = (): void =>
  mutateAnd((s) => {
    const [head, rest] = popRecovery(s);
    if (head == null) return s;
    return {
      ...s,
      recoveryQueue: rest,
      clocks: [...s.clocks, { ...head, running: false, resumedAt: null }],
      manageId: head.id,
      focusedId: head.id,
    };
  });

/** Discard — nothing was written, so there is nothing to undo. */
export const recoveryDiscard = (): void =>
  mutateAnd((s) => {
    const [head, rest] = popRecovery(s);
    if (head == null) return s;
    return { ...s, recoveryQueue: rest };
  });

// ── quit ─────────────────────────────────────────────────────────────────────

/**
 * Any unlogged accumulators? — the quit warning's trigger. STAGED hand-offs
 * count (2026-07-30): per-row Log moves minutes out of the store into the
 * in-memory handoff, and if that dissolved the last clock a quit would read
 * "clean" while the staged minutes evaporate.
 */
export const hasLiveClocks = (): boolean =>
  state.clocks.length > 0 || state.recoveryQueue.length > 0 || stagedCount() > 0;

/** Proceed on the quit warning: discard everything so the close is clean. */
export const discardAllForQuit = (): void => {
  state = { clocks: [], focusedId: null, manageId: null, recoveryQueue: [] };
  timerSet(null);
  emit();
  syncTicker();
};

// ── React binding ────────────────────────────────────────────────────────────

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getVersion = () => version;

/** Subscribe to the store; returns the (mutable) state + a monotonic version. */
export const useTimers = (): TimerState => {
  useSyncExternalStore(subscribe, getVersion);
  return state;
};

// `getTimerState` was DELETED 2026-08-04 — an imperative escape hatch with no
// caller; every reader uses `useTimers`, and `hasLiveClocks` reads `state`
// directly from inside this module.

// arm the ticker for crash-restored paused clocks (none run at launch, but the
// call is the honest place to normalise)
syncTicker();

// Dev only — Vite HMR re-evals this module: without this the old ticker leaks
// and the crash-detection IIFE reads the live clocks as a crash (2026-07-30).
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    persist();
    (globalThis as { __ciboTimerHmr?: boolean }).__ciboTimerHmr = true;
    if (tickHandle != null) clearInterval(tickHandle);
  });
}
