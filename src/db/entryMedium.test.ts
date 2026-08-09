/**
 * The entry-medium column derivation (bug `vocab-1`, 2026-08-09).
 *
 * PROVED TO FAIL FIRST, against the rule this replaced: the old key-suffix
 * test (`_type` / `_genre` / `_fandom` / `_engine`) was pasted in place of
 * `entryMediumColumn` and the "user-created" block below went red on every
 * assertion while the seeded block stayed green — which is the defect's exact
 * signature, and the reason it survived to Phase 2: the seeded habits are the
 * only ones anybody had renamed a value on.
 *
 * The seeded keys are transcribed from db/seed.ts rather than imported, so a
 * seed that quietly renames a definition fails HERE instead of letting these
 * pass vacuously (the seeder-fixture discipline — a fixture is a claim).
 */
import { describe, expect, it } from "vitest";
import { entryMediumColumn } from "./entryMedium";

describe("entryMediumColumn", () => {
  describe("the seeded habits — correct before the fix and after", () => {
    it("consumption picklists are the entry's Type", () => {
      expect(entryMediumColumn("consumption", "picklist", "reading_type")).toBe("type");
      expect(entryMediumColumn("consumption", "picklist", "media_type")).toBe("type");
    });

    it("genre is the JSON list, whatever the sub-type", () => {
      for (const key of ["gaming_genre", "reading_genre", "media_genre", "gamedev_genre"])
        expect(entryMediumColumn("consumption", "picklist-multi", key)).toBe("genre");
      expect(entryMediumColumn("creation", "picklist-multi", "gamedev_genre")).toBe("genre");
    });

    it("creation picklists are the fandom, except gamedev's engine", () => {
      expect(entryMediumColumn("creation", "picklist", "writing_fandom")).toBe("fandom");
      expect(entryMediumColumn("creation", "picklist", "gamedev_engine")).toBe("gamedev_engine");
    });
  });

  describe("the habits a user creates — the half the old rule got wrong", () => {
    /**
     * Keys are minted `<habitKey>_<label-slug>` (habitDraft.ts), and the label
     * is free text. Every one of these renamed its picklist and orphaned its
     * entries before the fix, because none of them ends in a magic suffix.
     */
    it("a consumption medium is the Type however it is LABELLED", () => {
      for (const key of ["anime_format", "podcasts_medium", "comics_kind", "films_field"])
        expect(entryMediumColumn("consumption", "picklist", key)).toBe("type");
    });

    it("a creation medium is the fandom however it is labelled", () => {
      expect(entryMediumColumn("creation", "picklist", "zines_series")).toBe("fandom");
    });

    it("the engine test reads the whole word, so a two-word label still lands", () => {
      // "Game Engine" → gamedev_game_engine. `endsWith("engine")`, not
      // `endsWith("_engine")` — mirroring the library, which always did.
      expect(entryMediumColumn("creation", "picklist", "gamedev_game_engine")).toBe(
        "gamedev_engine",
      );
    });
  });

  describe("the refusals — a null is an answer, and the caller must honour it", () => {
    it("a flag governs no entry column", () => {
      expect(entryMediumColumn("consumption", "flag", "sleep_med")).toBeNull();
      expect(entryMediumColumn("creation", "flag", "anything")).toBeNull();
    });

    it("a picklist on a habit with no sub-type governs none either", () => {
      // Simple and range habits carry no entries at all, so a picklist here is
      // a session-level definition reaching the wrong function.
      expect(entryMediumColumn(null, "picklist", "walking_mood")).toBeNull();
      expect(entryMediumColumn(undefined, "picklist", "coding_language")).toBeNull();
    });

    it("an unknown data_type is refused rather than guessed at", () => {
      expect(entryMediumColumn("consumption", "number", "reading_pages")).toBeNull();
      expect(entryMediumColumn("consumption", "", "reading_type")).toBeNull();
    });
  });
});
