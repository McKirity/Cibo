/**
 * WHICH ENTRY COLUMN AN ENTRY-SCOPE DEFINITION GOVERNS — the one owner of a
 * question three surfaces were each answering on their own (bug `vocab-1`,
 * 2026-08-09).
 *
 * An entry-level medium is a `subunit_definitions` row, but its VALUES do not
 * live in the definition tail: they live in a plain column on `entries`. Which
 * column is not stored anywhere — it is derived from the habit's `sub_type` and
 * the definition's `data_type`:
 *
 *   picklist-multi          → `genre`          (a JSON list, any sub-type)
 *   picklist + consumption  → `type`           (the Medium — capped at one)
 *   picklist + creation     → `fandom`, or `gamedev_engine` when the key says so
 *
 * THE DEFECT THIS CLOSES: the vocabulary rename asked the question a fourth
 * way — by KEY SUFFIX (`_type` / `_genre` / `_fandom` / `_engine`) — and
 * returned "no column" when the guess missed. Definition keys are minted
 * `<habitKey>_<label-slug>` (habitDraft.ts), so every seeded habit matched and
 * every habit the USER creates missed: a consumption medium labelled "Format"
 * mints `myhabit_format`, and renaming one of its values updated the picklist
 * while leaving every entry holding the old string. Silently — the only trace
 * was the Data Doctor later reporting `unknown-vocab` against the ENTRIES,
 * pointing at the damage rather than at the rename that caused it. The owning
 * ruling is explicit ([[Vocab & Status]] § Storage & edit semantics): "the set
 * value + every referencing row in one transaction — renames never orphan."
 *
 * The rule itself is unchanged; only its number of authors is. The library
 * (useLibraryData) and the Data Doctor (`unknownVocab`) were both already
 * correct and now read it from here.
 *
 * Pure and dependency-free on purpose — it is the kind of derivation this
 * project has twice found wrong at one site and right at its neighbours, so it
 * carries its own tests.
 */

/** The `entries` column an entry-scope definition's values are stored in. */
export type EntryMediumColumn = "type" | "fandom" | "gamedev_engine" | "genre";

/**
 * The column, or `null` when the definition governs none — which is a real
 * answer, not a shrug: a `flag` has no entry column, and neither does a
 * picklist on a habit whose sub-type cannot carry one. A caller that WRITES
 * must treat `null` as a refusal rather than as "nothing to do".
 *
 * `subType` is the habit's stored `sub_type`; `dataType` and `key` are the
 * definition's. `key` is consulted for exactly one thing — telling gamedev's
 * engine apart from a fandom — and never to identify the medium itself.
 */
export const entryMediumColumn = (
  subType: string | null | undefined,
  dataType: string,
  key: string,
): EntryMediumColumn | null => {
  if (dataType === "picklist-multi") return "genre";
  if (dataType !== "picklist") return null; // a flag has no entry column
  if (subType === "consumption") return "type";
  // Creation's single entry picklist is the fandom, except gamedev's engine.
  // The test is `endsWith("engine")`, not `endsWith("_engine")`, so a definition
  // labelled "Game Engine" (key `gamedev_game_engine`) still lands correctly —
  // this mirrors the library, which has always tested it that way.
  if (subType === "creation") return key.endsWith("engine") ? "gamedev_engine" : "fandom";
  return null;
};
