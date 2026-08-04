/**
 * THE RECENT-ERRORS LOG (Build step 10, slice 5).
 *
 * [[App Health & Diagnostics]] § Recent errors, ruled 2026-07-03: errors
 * HAPPEN in [[Failure & Error UX]] (a toast, or inline where caused) and
 * **accumulate here** as a quiet bounded list. "The app has no notification
 * tray — this list is the only 'what went wrong while I wasn't looking'
 * record, and it is what the glance-dot summarizes."
 *
 * PER-DEVICE and deliberately not synced: an error is a thing that happened to
 * THIS machine (a failed fetch, a rejected write, an unreadable theme folder),
 * and a roster mixing both devices' failures would make neither legible.
 *
 * Bounded at 20, the ruled figure. localStorage rather than memory so the list
 * survives the relaunch that a crash forces — which is exactly the case it
 * exists for.
 *
 * TWO SOURCES, both existing: `showErrorToast` (every tier-③ background
 * failure already routes through it) and Evolu's `subscribeError` (the silent
 * mutation failures the 2026-07-23 lesson is about). Neither had anywhere to
 * accumulate before this.
 */

export interface LoggedError {
  /** Local ISO-ish timestamp, to the minute — enough to place it in a day. */
  at: string;
  message: string;
  /** Where it came from, for the row's second line. */
  source: string;
}

const KEY = "cibo.errorLog";
const CAP = 20;

const read = (): LoggedError[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as LoggedError[];
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e?.message === "string") : [];
  } catch {
    return [];
  }
};

const write = (rows: LoggedError[]): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(0, CAP)));
  } catch {
    /* quota — the log is a convenience, never a gate */
  }
};

type Listener = (rows: LoggedError[]) => void;
const listeners = new Set<Listener>();

export const recentErrors = (): LoggedError[] => read();

export function subscribeErrors(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const stamp = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function logError(message: string, source = "App"): void {
  const rows = read();
  const at = stamp();
  // Collapse an identical message repeating within the same minute: a failing
  // fetch in a loop would otherwise flush the whole bounded list and bury the
  // twenty things actually worth seeing.
  if (rows[0]?.message === message && rows[0]?.at === at) return;
  const next = [{ at, message, source }, ...rows].slice(0, CAP);
  write(next);
  for (const fn of listeners) fn(next);
}

export function clearErrors(): void {
  write([]);
  for (const fn of listeners) fn([]);
}

/** True when anything is logged — one half of the rail's health dot. */
export const hasErrors = (): boolean => read().length > 0;
