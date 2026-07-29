/**
 * Keyboard words derived from Writing (user-ruled 2026-07-23).
 *
 * The real-world tie: the user's typing IS their writing, on one keyboard a
 * day, so Keyboard's word count mirrors that day's Writing words landed on the
 * board in use. It was how the original Obsidian plugin worked; the clean-slate
 * rebuild had briefly made them independent measures. This restores the tie.
 *
 * The model the user chose:
 *  - A Keyboard word session starts DERIVED — its value equals that day's
 *    Writing word total, and it FOLLOWS Writing automatically (any change to
 *    the day's Writing words re-syncs it).
 *  - Hand-editing a Keyboard word count OVERRIDES it: the session flips to
 *    `manual` and is never touched by the auto-sync again.
 *  - A refresh control re-derives it: back to `manual`→`derived`, value pulled
 *    from Writing's current total.
 *
 * The `source` column carries this state (schema.ts): `derived` = following,
 * `manual` = overridden. No extra column.
 *
 * Invariant: at most ONE Keyboard word session per day (one board a day). The
 * seeder plants exactly one; the logging UI maintains it. If several derived
 * sessions ever share a day, every derived one takes the same day total (the
 * dashboard sums, so duplicates would double-count — the invariant prevents it).
 *
 * The evolu-touching functions take `evolu` as a parameter (not the singleton)
 * so the seeder, the log form, and the mock harness can all drive them.
 */
import { FiniteNumber, NonEmptyString100, type Evolu } from "@evolu/common";
import { DateOnly, Schema, type HabitId, type SessionId } from "./schema";

type CiboEvolu = Evolu<typeof Schema>;

export const KEYBOARD_KEY = "keyboard";
export const WRITING_KEY = "writing";

// ── Pure core (no evolu — the unit the mock harness verifies) ────────────────

/** A day's Writing word total = the sum of that day's Writing COUNT sessions. */
export const sumWritingWords = (
  countSessionValues: ReadonlyArray<number | null>,
): number => countSessionValues.reduce<number>((a, v) => a + (v ?? 0), 0);

/** Does the auto-sync touch this Keyboard session? Only while it is derived. */
export const followsWriting = (source: string | null): boolean =>
  source === "derived";

/**
 * The write a sync/refresh/override resolves to, or null for "leave alone".
 * `intent`: "sync" (auto-follow — only if still derived) · "refresh" (force
 * re-derive) · "override" (detach to a hand value).
 */
export const resolveKeyboardWrite = (
  intent: "sync" | "refresh" | "override",
  current: { source: string | null; value: number | null },
  writingWords: number,
  overrideValue?: number,
): { value: number; source: "derived" | "manual" } | null => {
  switch (intent) {
    case "sync":
      if (!followsWriting(current.source)) return null; // overridden — untouched
      if (current.value === writingWords) return null; // already in sync
      return { value: writingWords, source: "derived" };
    case "refresh":
      return { value: writingWords, source: "derived" };
    case "override":
      return { value: overrideValue ?? current.value ?? 0, source: "manual" };
  }
};

// ── Evolu glue (app + seeder) ────────────────────────────────────────────────

const habitIdByKey = async (
  evolu: CiboEvolu,
  key: string,
): Promise<HabitId | null> => {
  const rows = await evolu.loadQuery(
    evolu.createQuery((db) =>
      db
        .selectFrom("habits")
        .select(["id"])
        .where("key", "=", NonEmptyString100.orThrow(key))
        .where("isDeleted", "is not", 1),
    ),
  );
  return rows[0]?.id ?? null;
};

/** The day's Writing word total, straight from the store. */
export const writingWordsForDay = async (
  evolu: CiboEvolu,
  day: string,
): Promise<number> => {
  const writing = await habitIdByKey(evolu, WRITING_KEY);
  if (!writing) return 0;
  const rows = await evolu.loadQuery(
    evolu.createQuery((db) =>
      db
        .selectFrom("sessions")
        .select(["value"])
        .where("habit_fk", "=", writing)
        .where("day", "=", DateOnly.orThrow(day))
        .where("measure_kind", "=", "count")
        .where("isDeleted", "is not", 1),
    ),
  );
  return sumWritingWords(rows.map((r) => r.value));
};

/** The day's Keyboard word session(s) — normally one (one board a day). */
const keyboardSessionsForDay = async (
  evolu: CiboEvolu,
  day: string,
): Promise<Array<{ id: SessionId; value: number | null; source: string | null }>> => {
  const keyboard = await habitIdByKey(evolu, KEYBOARD_KEY);
  if (!keyboard) return [];
  const rows = await evolu.loadQuery(
    evolu.createQuery((db) =>
      db
        .selectFrom("sessions")
        .select(["id", "value", "source"])
        .where("habit_fk", "=", keyboard)
        .where("day", "=", DateOnly.orThrow(day))
        .where("measure_kind", "=", "count")
        .where("isDeleted", "is not", 1),
    ),
  );
  return rows.map((r) => ({ id: r.id, value: r.value, source: r.source }));
};

const writeKeyboard = (
  evolu: CiboEvolu,
  id: SessionId,
  w: { value: number; source: "derived" | "manual" },
): boolean => {
  const res = evolu.update("sessions", {
    id,
    value: FiniteNumber.orThrow(w.value),
    source: w.source,
  });
  if (!res.ok) console.error("derivedKeyboard: session update failed", res.error);
  return res.ok;
};

/**
 * Auto-follow: call after a day's Writing words change (create/edit/delete of a
 * Writing count session). Re-derives that day's Keyboard word session(s) that
 * are still `derived`; overridden ones are left untouched. Returns how many
 * sessions it updated.
 */
export const syncDerivedKeyboardForDay = async (
  evolu: CiboEvolu,
  day: string,
): Promise<number> => {
  const [words, sessions] = await Promise.all([
    writingWordsForDay(evolu, day),
    keyboardSessionsForDay(evolu, day),
  ]);
  let updated = 0;
  for (const s of sessions) {
    const w = resolveKeyboardWrite("sync", s, words);
    if (w && writeKeyboard(evolu, s.id, w)) updated++;
  }
  return updated;
};
