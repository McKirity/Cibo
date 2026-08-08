import { describe, expect, it } from "vitest";
import { parseSeedVersion, SEED_VERSION } from "./seed";

/**
 * The seed gate's version read — the regression pin for bug `seed-1` (Phase 2
 * step 2, found by the static sweep 2026-08-08).
 *
 * The bug: `runSeed` read `Number(liveMeta.value)`, and `Number()` yields NaN
 * for anything that does not parse. **Every comparison against NaN is false**,
 * so a garbled `seed_version` slipped past the `>= SEED_VERSION` early return,
 * then past every `foundVersion < N` guard — running NO batch — and fell
 * through to the recording step, which stamped the store as fully migrated
 * while it carried none of them. The next launch then took the early return,
 * leaving the store permanently and silently stranded.
 *
 * That is the batch-3 / batch-7 failure class — a version recorded for batches
 * that did not land — arriving through the one door this file did not watch.
 * The guard against a lost write was thorough; the guard against an unreadable
 * value was absent.
 *
 * `seed.ts` takes its Evolu client as a parameter rather than importing the
 * singleton, which is what lets this file be imported by a test at all.
 */
describe("parseSeedVersion — a version that cannot be read is version 0", () => {
  it("reads a stored version", () => {
    expect(parseSeedVersion("7")).toBe(7);
    expect(parseSeedVersion(7)).toBe(7);
  });

  it("treats a fresh store (no row) as 0", () => {
    expect(parseSeedVersion(undefined)).toBe(0);
    expect(parseSeedVersion(null)).toBe(0);
  });

  // THE BUG ITSELF: each of these used to produce NaN, and NaN skipped every
  // batch while still satisfying the code that records the version.
  it("never returns NaN, whatever the row holds", () => {
    for (const v of ["", "  ", "ten", "7.x", "v7", {}, [1, 2], NaN, Infinity]) {
      const parsed = parseSeedVersion(v);
      expect(Number.isFinite(parsed)).toBe(true);
    }
  });

  it("fails toward RE-RUNNING, never toward skipping", () => {
    // The direction is the whole point: every batch is idempotent and verifies
    // itself, so a needless re-run is cheap and a wrong skip is unrecoverable.
    for (const v of ["", "ten", "v7", NaN, -3]) {
      expect(parseSeedVersion(v)).toBeLessThan(SEED_VERSION);
    }
  });

  it("refuses a negative version, which would also skip nothing but means nothing", () => {
    expect(parseSeedVersion("-1")).toBe(0);
  });

  it("still short-circuits a fully-migrated store", () => {
    expect(parseSeedVersion(String(SEED_VERSION))).toBe(SEED_VERSION);
  });
});
