/**
 * THE DAILY FORM'S AUTO-SAVE BUFFER — user-ruled 2026-07-27.
 *
 * "I want to set up an auto-save system where it auto saves upon closing or
 * after a certain amount of time, say ten minutes. I also want to be able to
 * adjust the auto save interval in settings."
 *
 * WHAT THIS CHANGES, recorded because it touches a frozen clause. The screen
 * note's Direction section describes the strips as "a chevron expands one in
 * place; nothing is unsaved", and the first build took that literally: every
 * field committed the moment you left it. That is what made moving between
 * habits feel heavy — each commit invalidates the day's live queries and
 * schedules the milestone snapshot's whole-store re-read. Writes are now
 * BUFFERED and flushed on a timer, on close, and on demand.
 *
 * WHAT IT COSTS, so nobody rediscovers it as a bug: a crash between flushes
 * loses up to one interval of logging, and there is no recovery path for it —
 * the ~15 s heartbeat file recovers a RUNNING TIMER, not form data
 * ([[App Lifecycle & OS Integration]] — crash-only recovery, timers only).
 * Flush-on-close covers the normal path, because close = quit, always.
 *
 * Ruling 1 is untouched: these are still "unofficial saves that remember any
 * changes to the form but don't turn it into the cover wall". Only their
 * TIMING moved. Finalize remains the official save, and it flushes first.
 *
 * The buffer is keyed and LAST-WRITE-WINS: editing the same field five times
 * before a flush writes once. That is most of the win — it collapses a burst of
 * typing into a single mutation batch.
 */
import { useCallback, useEffect, useState } from "react";
import { NonEmptyString100, NonEmptyString1000 } from "@evolu/common";
import { evolu } from "../db/evolu";

export type PendingRun = () => { ok: boolean; reason?: string };

interface Pending {
  key: string;
  run: PendingRun;
}

let queue: Pending[] = [];
const listeners = new Set<(n: number) => void>();

const notify = () => {
  for (const l of listeners) l(queue.length);
};

/**
 * Buffer a write. `key` identifies the FIELD, not the edit: re-queuing the same
 * key replaces the earlier run in place, keeping its position in the order so a
 * bout's creation still precedes the edits that depend on it.
 */
export const queueWrite = (key: string, run: PendingRun): void => {
  const at = queue.findIndex((p) => p.key === key);
  if (at >= 0) queue[at] = { key, run };
  else queue.push({ key, run });
  notify();
};

/** Drop a buffered write without running it — a draft discarded before a flush. */
export const dropQueued = (keyPrefix: string): void => {
  const before = queue.length;
  queue = queue.filter((p) => !p.key.startsWith(keyPrefix));
  if (queue.length !== before) notify();
};

export const pendingCount = (): number => queue.length;

export const subscribePending = (fn: (n: number) => void): (() => void) => {
  listeners.add(fn);
  fn(queue.length);
  return () => {
    listeners.delete(fn);
  };
};

/**
 * Run everything buffered, in order. Returns the first failure's reason, if any
 * — a failed write is DROPPED rather than retried forever, and reported, which
 * is the four-tier model's tier 2/3 split: the caller decides where it surfaces.
 *
 * Synchronous on purpose: `beforeunload` cannot await, and this is the last
 * chance the day's work gets.
 */
export const flushWrites = (): { ok: true } | { ok: false; reason: string } => {
  if (queue.length === 0) return { ok: true };
  const running = queue;
  queue = [];
  notify();
  let failure: string | null = null;
  for (const p of running) {
    try {
      const res = p.run();
      if (!res.ok && failure == null) failure = res.reason ?? "A change could not be saved.";
    } catch (e) {
      if (failure == null) failure = String(e);
    }
  }
  return failure == null ? { ok: true } : { ok: false, reason: failure };
};

// ── The interval setting ─────────────────────────────────────────────────────

/**
 * Ten minutes, the user's own figure. Held in `app_meta` rather than the local
 * per-device file because it is a PREFERENCE, and preferences sync
 * ([[Sync & Per-Device Settings]] — appearance levers and machine facts are
 * local; preferences are not). Settings → Data builds the control at step 10;
 * until then the dev panel stands in, exactly as it does for the whimsy config.
 */
export const AUTOSAVE_DEFAULT_MINUTES = 10;
export const AUTOSAVE_KEY = "autosave_minutes";

/** Clamped: a zero would mean "save never", and an hour is past any session. */
export const clampInterval = (minutes: number): number =>
  !Number.isFinite(minutes) ? AUTOSAVE_DEFAULT_MINUTES : Math.min(60, Math.max(1, Math.round(minutes)));

export const autosaveQuery = evolu.createQuery((db) =>
  db
    .selectFrom("app_meta")
    .select(["id", "value"])
    .where("key", "=", AUTOSAVE_KEY as never)
    .where("isDeleted", "is not", 1),
);

/** Write the interval. Checked, like every mutation — Evolu fails silently. */
export const setAutosaveMinutes = (
  existing: { id: string } | null,
  minutes: number,
): boolean => {
  const value = String(clampInterval(minutes));
  const res = existing
    ? evolu.update("app_meta", { id: existing.id as never, value: NonEmptyString1000.orThrow(value) })
    : evolu.insert("app_meta", {
        key: NonEmptyString100.orThrow(AUTOSAVE_KEY),
        value: NonEmptyString1000.orThrow(value),
      });
  if (!res.ok) console.error("autosave: interval write failed", res.error);
  return res.ok;
};

// ── The hook ─────────────────────────────────────────────────────────────────

/**
 * Drives the buffer: an interval flush, plus every exit the app actually has.
 *
 * `beforeunload` is the one that matters — close = quit, always, so the webview
 * unloads on the way out and this is where a clean shutdown's flush happens. It
 * must stay SYNCHRONOUS; nothing may be awaited inside it.
 *
 * `visibilitychange` is belt and braces: alt-tabbing away is the moment a user
 * is most likely to walk off and later kill the app.
 */
export function useAutosave(
  minutes: number,
  onError: (reason: string) => void,
  /**
   * Runs after a flush that actually wrote something — the transaction
   * boundary. Its one tenant is the Keyboard→Writing auto-follow, which MUST
   * read the store after the buffered Writing rows have landed, never from
   * inside a queued write.
   */
  afterFlush?: () => void,
): { flushNow: () => void; pending: number } {
  const [pending, setPending] = useState(pendingCount());

  useEffect(() => subscribePending(setPending), []);

  const flushNow = useCallback(() => {
    const had = pendingCount() > 0;
    const res = flushWrites();
    if (!res.ok) onError(res.reason);
    // A tick, on purpose: Evolu batches mutations in a microtask, so a query
    // sent inside this one would be sent BEFORE the batch reached the worker.
    if (had && afterFlush) setTimeout(afterFlush, 0);
  }, [onError, afterFlush]);

  useEffect(() => {
    const ms = clampInterval(minutes) * 60_000;
    const timer = setInterval(flushNow, ms);
    const onHide = () => {
      if (document.visibilityState === "hidden") flushNow();
    };
    // `beforeunload` cannot await, so this one stays bare: the writes land, and
    // the derive sync catches up at next launch's first flush.
    const onUnload = () => flushWrites();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
      // Unmounting the form is leaving it: navigating away from Daily must not
      // be a way to lose the day's work.
      flushWrites();
    };
  }, [minutes, flushNow]);

  return { flushNow, pending };
}
