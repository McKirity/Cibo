/**
 * THE GLOBAL MILESTONE LADDERS — storage (Build step 10, slice 4).
 *
 * The per-habit overrides already have a home (`habits.milestone_ladders`, the
 * 2026-07-26 column). The GLOBAL default had none: it shipped as the ruled
 * constants in `daily/milestones.ts` and nothing could move it. It lands in
 * `app_meta` as one JSON row — synced, being an aggregation rule rather than a
 * device fact, and keyed once because five subjects are one setting.
 *
 * The constants stay where they are and stay the FALLBACK: an absent row (or a
 * malformed one) resolves to `DEFAULT_LADDERS`, so the ruled figures remain the
 * app's floor and this row only ever overrides them.
 */
import { NonEmptyString100, NonEmptyString1000 } from "@evolu/common";
import { evolu } from "../db/evolu";
import {
  DEFAULT_LADDERS,
  setGlobalLadders,
  type Ladder,
  type LadderOverrides,
  type LadderSubject,
} from "../daily/milestones";

export const GLOBAL_LADDERS_KEY = "milestone_ladders_global";

export const globalLaddersQuery = evolu.createQuery((db) =>
  db
    .selectFrom("app_meta")
    .select(["id", "value"])
    .where("key", "=", GLOBAL_LADDERS_KEY as never)
    .where("isDeleted", "is not", 1),
);

const SUBJECTS: LadderSubject[] = ["days", "hours", "entryHours", "words", "sessions"];

/** Never-throwing decode — a malformed row is the ruled defaults, silently. */
export function laddersFrom(rows: readonly { value: unknown }[]): LadderOverrides {
  if (rows[0] == null) return {};
  try {
    const parsed = JSON.parse(String(rows[0].value)) as Record<string, unknown>;
    const out: LadderOverrides = {};
    for (const s of SUBJECTS) {
      const l = parsed[s] as Ladder | undefined;
      if (l != null && Array.isArray(l.bands)) out[s] = l;
    }
    return out;
  } catch {
    return {};
  }
}

/** The effective global ladder for a subject — the row, else the constant. */
export const globalLadders = (rows: readonly { value: unknown }[]): Record<LadderSubject, Ladder> => {
  const stored = laddersFrom(rows);
  return {
    days: stored.days ?? DEFAULT_LADDERS.days,
    hours: stored.hours ?? DEFAULT_LADDERS.hours,
    entryHours: stored.entryHours ?? DEFAULT_LADDERS.entryHours,
    words: stored.words ?? DEFAULT_LADDERS.words,
    sessions: stored.sessions ?? DEFAULT_LADDERS.sessions,
  };
};

/**
 * Launch wiring (main.tsx): push the stored global into milestones.ts's cache
 * and keep it following the store, so the derivation reads one value.
 */
export function initGlobalLadders(): void {
  const pull = () => {
    evolu.loadQuery(globalLaddersQuery).then(
      (rows) => setGlobalLadders(laddersFrom(rows)),
      (e) => console.error("ladders: load failed", e),
    );
  };
  pull();
  evolu.subscribeQuery(globalLaddersQuery)(() => pull());
}

export function writeGlobalLadders(
  rows: readonly { id: unknown }[],
  next: LadderOverrides,
): boolean {
  const value = JSON.stringify(next);
  const existing = rows[0];
  const res =
    existing != null
      ? Object.keys(next).length === 0
        ? evolu.update("app_meta", { id: existing.id as never, isDeleted: 1 })
        : evolu.update("app_meta", { id: existing.id as never, value: NonEmptyString1000.orThrow(value) })
      : Object.keys(next).length === 0
        ? { ok: true as const }
        : evolu.insert("app_meta", {
            key: NonEmptyString100.orThrow(GLOBAL_LADDERS_KEY),
            value: NonEmptyString1000.orThrow(value),
          });
  if (!res.ok) console.error("ladders: write failed", (res as { error?: unknown }).error);
  return res.ok;
}
