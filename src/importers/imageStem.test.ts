import { describe, expect, it } from "vitest";
import { imageStem } from "./imageStem";

/**
 * The image filename stem — user-ruled 2026-08-08.
 *
 * The bug it ends: cover files were named after the entry's DATABASE id, which
 * is stable for as long as the row lives — and the row is exactly what does not
 * survive a store wipe or a restore. Re-importing the same book minted a new
 * row, a new id and therefore a NEW FILE, leaving the old one stranded against
 * a row that no longer existed. One restore-and-reimport cycle doubles the
 * folder; it happened twice in one day and cost ~151 files of manual cleanup
 * each time.
 *
 * The fix names an imported entry's images after the entry's OWN identity,
 * which outlives any number of database rebuilds. Hand-made entries have no
 * external identity and keep the entry id — and they are never re-imported, so
 * they never had the problem.
 *
 * *Safe only because the sources are split.* The old TMDB collision — movie 500
 * and TV 500 both writing `tmdb-500.jpg` — was the recorded reason for entry-id
 * naming. It is spent: `tmdb-movie`/`tmdb-tv` and `anilist-anime`/`anilist-manga`
 * are distinct source keys, which is what makes `(source, external_id)` unique
 * in the schema and unique as a filename. All eight keys were checked.
 */
describe("imageStem — an imported entry is named by what outlives its row", () => {
  it("uses the external identity when the entry has one", () => {
    expect(imageStem("row-abc", "calibre", "6552ac24-8ebb")).toBe("calibre-6552ac24-8ebb");
  });

  // THE WHOLE POINT: the same book re-imported into a rebuilt store lands on
  // the same filename, so the write is an overwrite and not a second copy.
  it("is stable across a store rebuild — same book, different row, same name", () => {
    const before = imageStem("row-FIRST", "calibre", "6552ac24-8ebb");
    const after = imageStem("row-SECOND-after-restore", "calibre", "6552ac24-8ebb");
    expect(after).toBe(before);
  });

  it("keeps the entry id for a hand-made entry, which has no identity", () => {
    expect(imageStem("row-abc", null, null)).toBe("row-abc");
  });

  it("treats a half-identity as no identity — both halves or neither", () => {
    expect(imageStem("row-abc", "calibre", null)).toBe("row-abc");
    expect(imageStem("row-abc", null, "6552ac24")).toBe("row-abc");
    expect(imageStem("row-abc", "", "")).toBe("row-abc");
  });

  // The collision that justified entry-id naming, proved dead by the split.
  it("does not collide across TMDB's movie/TV split, nor AniList's", () => {
    expect(imageStem("a", "tmdb-movie", "500")).not.toBe(imageStem("b", "tmdb-tv", "500"));
    expect(imageStem("a", "anilist-anime", "1")).not.toBe(imageStem("b", "anilist-manga", "1"));
  });

  it("never lets a remote id escape into the path", () => {
    // External ids are numeric or hex in practice, but they are parsed out of
    // URLs and remote payloads, so nothing is trusted into a filename.
    const stem = imageStem("row", "ao3", "../../evil/../x y");
    expect(stem).not.toContain("/");
    expect(stem).not.toContain("\\");
    expect(stem).not.toContain("..");
    expect(stem).not.toContain(" ");
  });

  it("bounds the length, since a path has one", () => {
    expect(imageStem("row", "steam", "9".repeat(500)).length).toBeLessThan(120);
  });
});
