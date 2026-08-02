/**
 * Genre vocab auto-add — the ruled seam ([[Importer Field Mapping]] § vocab
 * discipline): **only Calibre + AO3 import genres**, and an imported genre
 * value the picklist doesn't know is AUTO-ADDED to the habit's `*_genre`
 * picklist rather than tripping the Data Doctor's `unknown-vocab` lint.
 *
 * Matching is case-insensitive (the old `YouTube`/`Youtube` case-trap lesson:
 * one canonical casing per value — the first spelling seen wins and later
 * case-variants map onto it), but the STORED string keeps the source's casing.
 */
import { FiniteNumber, NonEmptyString100 } from "@evolu/common";
import { evolu } from "../db/evolu";
import type { HabitId, SubunitDefinitionId } from "../db/schema";

interface GenreVocabCache {
  defId: SubunitDefinitionId | null;
  /** lowercase → stored casing */
  values: Map<string, string>;
  count: number;
}

/** Per-habit cache — a 50-book Calibre batch must not re-query per item. */
const cacheByHabit = new Map<string, GenreVocabCache>();

const loadCache = async (habitId: HabitId, habitKey: string): Promise<GenreVocabCache> => {
  const hit = cacheByHabit.get(String(habitId));
  if (hit) return hit;
  const defs = await evolu.loadQuery(
    evolu.createQuery((db) =>
      db
        .selectFrom("subunit_definitions")
        .select(["id"])
        .where("habit_fk", "=", habitId)
        .where("key", "=", NonEmptyString100.orThrow(`${habitKey}_genre`))
        .where("isDeleted", "is not", 1),
    ),
  );
  const defId = (defs[0]?.id ?? null) as SubunitDefinitionId | null;
  const values = new Map<string, string>();
  let count = 0;
  if (defId != null) {
    const rows = await evolu.loadQuery(
      evolu.createQuery((db) =>
        db
          .selectFrom("vocab_options")
          .select(["value"])
          .where("definition_fk", "=", defId)
          .where("isDeleted", "is not", 1),
      ),
    );
    for (const r of rows) {
      const v = String(r.value);
      values.set(v.toLowerCase(), v);
    }
    count = rows.length;
  }
  const fresh: GenreVocabCache = { defId, values, count };
  cacheByHabit.set(String(habitId), fresh);
  return fresh;
};

/**
 * Map each imported genre onto its canonical picklist casing, inserting any
 * value the picklist lacks. Returns the canonical strings to write on the
 * entry. A habit with no `*_genre` definition passes the list through
 * untouched (nothing to reconcile against).
 */
export const ensureGenreVocab = async (
  habitId: HabitId,
  habitKey: string,
  genres: string[],
): Promise<string[]> => {
  if (genres.length === 0) return genres;
  const cache = await loadCache(habitId, habitKey);
  if (cache.defId == null) return genres;
  const out: string[] = [];
  for (const g of genres) {
    const trimmed = g.trim();
    if (trimmed === "") continue;
    const known = cache.values.get(trimmed.toLowerCase());
    if (known != null) {
      out.push(known);
      continue;
    }
    const res = evolu.insert("vocab_options", {
      definition_fk: cache.defId,
      value: NonEmptyString100.orThrow(trimmed.slice(0, 100)),
      sort_order: FiniteNumber.orThrow(cache.count + 1),
    });
    if (!res.ok) {
      console.error(`genre vocab auto-add rejected (${trimmed})`, res.error);
      // The entry still carries the genre — the lint can flag it later.
    } else {
      cache.count += 1;
      cache.values.set(trimmed.toLowerCase(), trimmed);
    }
    out.push(trimmed);
  }
  return [...new Set(out)];
};
