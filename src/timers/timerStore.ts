/**
 * Build step 7 — the timer STORE: one module-level singleton, because clocks
 * keep running wherever the user navigates. React reads it through
 * `useTimers()` (useSyncExternalStore); the ticker below owns boundary
 * detection (countdown-zero · pomodoro phase ends) so a clock finishes even
 * with no timer surface mounted.
 *
 * PERSISTENCE — per-device, never synced. localStorage stand-in (the Library's
 * approved precedent) until the per-device file lands: state is written on
 * every mutation and on a ~15 s heartbeat while running. The clean-close
 * invariant does the crash detection: every clean quit either had no clocks or
 * discarded them through the quit warning, so ANY persisted clock at launch is
 * a crash → the recovery queue (one dialog per clock, sequentially —
 * the multi-clock corner, ruled 2026-07-28). Crash gap never counted: the
 * recovered values are the last-persisted fold, allowed to lag ≤ one heartbeat.
 */
import { useSyncExternalStore } from "react";
import {
  advance,
  fold,
  resumeClock,
  type Clock,
  type TimerMode,
  type TrackedItem,
} from "./timerCore";
import { fireSignal, unlockAudio } from "./signal";
import { syncTray } from "./tray";
import { stagedCount } from "./logHandoff";

const STORAGE_KEY = "cibo-timer-state-v1";
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
      localStorage.removeItem(STORAGE_KEY);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ clocks: folded, savedAt: now }));
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
    const raw = localStorage.getItem(STORAGE_KEY);
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

const tick = () => {
  const now = Date.now();
  let changed = false;
  const clocks = state.clocks.map((c) => {
    const { clock, boundary } = advance(c, now);
    if (boundary != null) {
      changed = true;
      fireSignal(boundary);
      if (boundary !== "break-end") {
        // functionally a stop → the SAME management window (one block)
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

export const runClock = (id: number): void => {
  unlockAudio();
  patchClock(id, (c) => resumeClock(c, Date.now()));
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
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
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

export const getTimerState = (): TimerState => state;

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
