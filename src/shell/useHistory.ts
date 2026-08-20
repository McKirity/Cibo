/**
 * Browser-style session history for the shell's view state.
 *
 * The app is a **lattice, not a tree** — a day reached from a habit dashboard
 * has two "parents" — so up-to-parent navigation is ambiguous. The honest model
 * is a stack that retraces the steps you actually took (Shell Mechanics § 1).
 *
 * Ruled there and implemented here: back AND forward · session-only (never
 * persisted across restarts, so this is plain in-memory state) · capped ~50.
 * Pulled ahead from Build step 9 on 2026-07-25 (user-ruled) because every screen
 * added on top of a missing history is a screen that has to be retro-wired.
 *
 * Overlays are deliberately NOT routes (the palette, Advanced Search, creation
 * modals, popovers) — they are transient state, so back never reopens a
 * half-finished modal. Nothing here should ever record one.
 */
import { useCallback, useMemo, useRef, useState } from "react";

/** The ruled cap. Once reached, the OLDEST entries fall off the front. */
export const HISTORY_CAP = 50;

/**
 * Shallow equality over own keys — enough for the flat view unions the shell
 * navigates with, and unlike `JSON.stringify` it does not care about key order
 * (two call sites building the same route with their fields in a different
 * order must still count as the same place).
 */
const shallowSame = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(rb, k) && Object.is(ra[k], rb[k]));
};

/** The stack and the cursor into it. Exported for the pure transitions below. */
export interface HistoryState<T> {
  stack: T[];
  index: number;
}

/**
 * Pure core — the transitions, lifted out of the hook so they can be exercised
 * without React (the `resolveKeyboardWrite` pattern). Each returns the SAME
 * object when nothing changes, so React bails out of the re-render.
 */
export function historyPush<T>(
  s: HistoryState<T>,
  next: T,
  same: (a: T, b: T) => boolean,
): HistoryState<T> {
  if (same(s.stack[s.index], next)) return s;
  const kept = s.stack.slice(0, s.index + 1); // a new branch drops the old forward
  kept.push(next);
  const over = kept.length - HISTORY_CAP;
  const stack = over > 0 ? kept.slice(over) : kept; // the cap eats the OLDEST
  return { stack, index: stack.length - 1 };
}

export function historyReplace<T>(
  s: HistoryState<T>,
  next: T,
  same: (a: T, b: T) => boolean,
): HistoryState<T> {
  if (same(s.stack[s.index], next)) return s;
  const stack = s.stack.slice();
  stack[s.index] = next;
  return { stack, index: s.index };
}

/** Step the cursor by `delta`, clamped — off either end is a no-op. */
export function historyGo<T>(s: HistoryState<T>, delta: number): HistoryState<T> {
  const next = s.index + delta;
  if (next < 0 || next > s.stack.length - 1) return s;
  return { stack: s.stack, index: next };
}

export interface History<T> {
  /** The entry currently on screen. */
  current: T;
  /**
   * Go somewhere new. Drops any forward entries (you took a different branch),
   * then pushes. Navigating to where you already are is a no-op — otherwise
   * clicking the same habit twice would stack a duplicate and "back" would look
   * broken.
   */
  navigate: (next: T) => void;
  /**
   * Swap the current entry in place, recording no new history. For corrections
   * the user did not ask for — e.g. the habit on screen is DELETED and the shell
   * bails out to Daily. Pushing there would leave a phantom entry that back
   * returns to, only to bail out again.
   *
   * ⚠ This read "gets archived" until 2026-08-19, which has been wrong since the
   * 2026-08-04 ruling made archived pages browsable AND editable — the bail-out
   * in Shell.tsx keys off a habit key ABSENT from the store, so only a delete
   * reaches it. The behaviour was always right; only the example was stale.
   */
  replace: (next: T) => void;
  back: () => void;
  forward: () => void;
  canBack: boolean;
  canForward: boolean;
}

export function useHistory<T>(
  initial: T,
  isSame: (a: T, b: T) => boolean = shallowSame,
): History<T> {
  const [state, setState] = useState<{ stack: T[]; index: number }>(() => ({
    stack: [initial],
    index: 0,
  }));

  // Latest-ref so the callbacks below stay identity-stable even if the caller
  // passes an inline comparator (the listener effects depend on them).
  const sameRef = useRef(isSame);
  sameRef.current = isSame;

  const navigate = useCallback((next: T) => {
    setState((s) => historyPush(s, next, sameRef.current));
  }, []);

  const replace = useCallback((next: T) => {
    setState((s) => historyReplace(s, next, sameRef.current));
  }, []);

  const back = useCallback(() => setState((s) => historyGo(s, -1)), []);
  const forward = useCallback(() => setState((s) => historyGo(s, +1)), []);

  // Memoized: the consuming shell destructures this every render, and a fresh
  // object each time would defeat downstream memos (the post-step-6 audit's
  // hook-identity lesson).
  return useMemo(
    () => ({
      current: state.stack[state.index],
      navigate,
      replace,
      back,
      forward,
      canBack: state.index > 0,
      canForward: state.index < state.stack.length - 1,
    }),
    [state, navigate, replace, back, forward],
  );
}
