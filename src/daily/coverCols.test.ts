/**
 * `coverColsFor` — the cover's width allowance as a share of the wall.
 *
 * The claims that matter: the DRAWN fifteen must return exactly what the corpus
 * drew (3 and 2), or the small-canvas rule has quietly re-composed the desktop;
 * and the nine-column wall must hand a big cover 2, which is the whole point of
 * the change.
 */
import { describe, it, expect } from "vitest";
import { coverColsFor } from "./wallSpec";
import { WALL_COLS } from "./wallPack";

describe("coverColsFor", () => {
  it("returns the drawn spans unchanged on the drawn wall", () => {
    expect(coverColsFor(true, WALL_COLS)).toBe(3);
    expect(coverColsFor(false, WALL_COLS)).toBe(2);
  });

  it("gives a big cover two columns on the nine-column wall", () => {
    // 3 * 9 / 15 = 1.8 -> 2. The share is held (2/9 ≈ 22% vs the drawn 20%)
    // instead of a third of the wall going to one poster.
    expect(coverColsFor(true, 9)).toBe(2);
  });

  it("never lets a cover fall below two columns", () => {
    // 2 * 9 / 15 = 1.2 rounds to 1; the floor is what stops a cover becoming a
    // sliver on any wall narrow enough to ask.
    expect(coverColsFor(false, 9)).toBe(2);
    expect(coverColsFor(false, 4)).toBe(2);
    expect(coverColsFor(true, 2)).toBe(2);
  });

  it("scales back up on a wider wall than the drawn one", () => {
    expect(coverColsFor(true, 20)).toBe(4);
    expect(coverColsFor(false, 20)).toBe(3);
  });
});
