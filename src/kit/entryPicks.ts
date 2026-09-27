/**
 * RECENT ENTRY PICKS — per-picker pick ledgers (user-ruled 2026-09-27):
 * an entry picker lists the entries you last picked THERE first, most recent
 * on top. Two tenants, each with its OWN ledger — a pick counts only in the
 * picker it was made in:
 *  - `timer` — the tracked-set picker; recorded when a clock actually takes
 *    the entry (Start, or adding it to a running clock), never on a mere click
 *    inside the list, so a changed mind reorders nothing.
 *  - `daily` — the log form's Title field; recorded on the pick (row, Enter,
 *    or the quick-create door).
 * Pure recency — no status tier ("just most recently selected for now").
 * Entries never picked keep the picker's own fallback order beneath.
 *
 * Storage is the per-device settings file, like the palette's recents:
 * device texture, not synced data ("stay per machine").
 */
import { deviceGet, deviceSet } from "../settings/deviceStore";

export type PickLedger = "timer" | "daily";

const KEYS: Record<PickLedger, string> = {
  timer: "cibo.picks.timer",
  daily: "cibo.picks.daily",
};

/** One list across every habit; an entry aged off the end just falls back. */
const CAP = 200;

/** Entry ids, most recently picked first. */
export function readPicks(ledger: PickLedger): string[] {
  try {
    const raw = deviceGet(KEYS[ledger]);
    if (raw == null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Moves `ids` to the front (first id = most recent); returns the new ledger. */
export function recordPicks(ledger: PickLedger, ids: readonly string[]): string[] {
  const current = readPicks(ledger);
  if (ids.length === 0) return current;
  const fresh = new Set(ids);
  const next = [...fresh, ...current.filter((id) => !fresh.has(id))].slice(0, CAP);
  try {
    deviceSet(KEYS[ledger], JSON.stringify(next));
  } catch {
    // per-device sugar — never worth an error surface
  }
  return next;
}

/**
 * Picked entries first in ledger order; the rest keep their incoming order
 * (the picker's fallback), so the caller sorts its fallback BEFORE this.
 */
export function byRecentPick<T extends { id: string }>(list: readonly T[], picks: readonly string[]): T[] {
  const rank = new Map<string, number>();
  picks.forEach((id, i) => rank.set(id, i));
  const picked = list.filter((e) => rank.has(e.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  const rest = list.filter((e) => !rank.has(e.id));
  return [...picked, ...rest];
}
