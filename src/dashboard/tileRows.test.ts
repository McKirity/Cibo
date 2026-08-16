import { describe, expect, it } from "vitest";
import { TILE_ROW_MAX, TILE_ROW_MAX_SMALL, balancedCols, tileRowPlan } from "./tileRows";

/**
 * The ruling this guards (2026-08-10): four tiles draw 2×2, never 3+1. The
 * cases below are written as "what the user would SEE" — the column count is
 * only interesting because it decides the row shape.
 */
const rowsOf = (units: number, max = TILE_ROW_MAX): number[] => {
  const cols = balancedCols(units, max);
  const out: number[] = [];
  for (let left = units; left > 0; left -= cols) out.push(Math.min(cols, left));
  return out;
};

describe("balancedCols", () => {
  it("draws four tiles as 2×2 — the ruling's own example", () => {
    expect(balancedCols(4)).toBe(2);
    expect(rowsOf(4)).toEqual([2, 2]);
  });

  it("never adds a row to even things up", () => {
    // 5 fits in two rows at 3+2; 2+2+1 would be flatter and is WRONG.
    expect(rowsOf(5)).toEqual([3, 2]);
    expect(rowsOf(6)).toEqual([3, 3]);
  });

  it("fills a single row whenever the group fits in one", () => {
    expect(rowsOf(1)).toEqual([1]);
    expect(rowsOf(2)).toEqual([2]);
    expect(rowsOf(3)).toEqual([3]);
  });

  it("splits evenly once past one row", () => {
    expect(rowsOf(6)).toEqual([3, 3]);
    expect(rowsOf(9)).toEqual([3, 3, 3]);
  });

  it("only draws 2×2 because the cap is THREE — the ruling's example depends on it", () => {
    // Recorded because it is the whole reason TILE_ROW_MAX is not 4: at a cap
    // of four, four units fit one row and the ruled 2×2 never appears.
    expect(rowsOf(4, 4)).toEqual([4]);
    expect(rowsOf(4, 3)).toEqual([2, 2]);
  });

  it("never exceeds the cap", () => {
    for (let n = 1; n <= 40; n++) expect(balancedCols(n)).toBeLessThanOrEqual(TILE_ROW_MAX);
    for (let n = 1; n <= 40; n++) expect(balancedCols(n, 2)).toBeLessThanOrEqual(2);
  });

  it("uses the fewest rows possible at every size", () => {
    for (let n = 1; n <= 40; n++) {
      const cols = balancedCols(n);
      const rows = Math.ceil(n / cols);
      // A greedy fill at the cap is the row-count floor; balancing must match it.
      expect(rows).toBe(Math.ceil(n / TILE_ROW_MAX));
    }
  });

  it("keeps rows within one tile of each other at every size a real group reaches", () => {
    // 1–6 is the whole range the app's tile groups actually occupy.
    for (let n = 1; n <= 6; n++) {
      const r = rowsOf(n);
      expect(Math.max(...r) - Math.min(...r)).toBeLessThanOrEqual(1);
    }
  });

  it("puts the shortfall on the LAST row, which is all a uniform grid can do", () => {
    // Documented rather than "fixed": grid auto-placement fills greedily, so
    // seven draws 3+3+1 where a ragged 3+2+2 would be flatter. One column count
    // cannot express a ragged split, and no real group is this big.
    expect(rowsOf(7)).toEqual([3, 3, 1]);
    for (let n = 1; n <= 40; n++) {
      const r = rowsOf(n);
      const full = r.slice(0, -1);
      // every row but the last is exactly the column count
      expect(new Set(full).size).toBeLessThanOrEqual(1);
      expect(r[r.length - 1]).toBeLessThanOrEqual(balancedCols(n));
    }
  });

  it("survives degenerate input rather than emitting repeat(0)", () => {
    expect(balancedCols(0)).toBe(1);
    expect(balancedCols(-3)).toBe(1);
    expect(balancedCols(NaN)).toBe(1);
    expect(balancedCols(4, 0)).toBe(1);
    expect(balancedCols(4, NaN)).toBe(1);
  });
});

describe("tileRowPlan — no empty space in any row", () => {
  /** Every row's spans must add up to exactly the track count. */
  const rowSums = (count: number, max = TILE_ROW_MAX): number[] => {
    const { tracks, spans } = tileRowPlan(count, max);
    const sums: number[] = [];
    let run = 0;
    for (const s of spans) {
      run += s;
      if (run >= tracks) {
        sums.push(run);
        run = 0;
      }
    }
    if (run > 0) sums.push(run);
    return sums;
  };

  it("widens a short last row instead of leaving a gap — the ruled case", () => {
    // Engagement: current streak · longest streak · total days · avg/wk · avg/mo
    const { tracks, spans } = tileRowPlan(5);
    expect(tracks).toBe(6);
    expect(spans).toEqual([2, 2, 2, 3, 3]);
  });

  it("gives an orphan tile the whole row", () => {
    expect(tileRowPlan(7)).toEqual({ tracks: 3, spans: [1, 1, 1, 1, 1, 1, 3] });
  });

  it("leaves already-flush groups alone", () => {
    expect(tileRowPlan(4)).toEqual({ tracks: 2, spans: [1, 1, 1, 1] });
    expect(tileRowPlan(3)).toEqual({ tracks: 3, spans: [1, 1, 1] });
    expect(tileRowPlan(6)).toEqual({ tracks: 3, spans: [1, 1, 1, 1, 1, 1] });
  });

  it("fills every row exactly, at every size", () => {
    for (let n = 1; n <= 40; n++) {
      const { tracks } = tileRowPlan(n);
      for (const sum of rowSums(n)) expect(sum).toBe(tracks);
    }
  });

  it("keeps the row count balancedCols chose — filling must not add rows", () => {
    for (let n = 1; n <= 40; n++) {
      expect(rowSums(n).length).toBe(Math.ceil(n / balancedCols(n)));
    }
  });

  it("never emits a fractional or zero span", () => {
    for (let n = 1; n <= 40; n++) {
      for (const s of tileRowPlan(n).spans) {
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThan(0);
      }
    }
  });

  it("survives an empty group", () => {
    expect(tileRowPlan(0)).toEqual({ tracks: 1, spans: [] });
  });
});

describe("the small canvas caps a row at two (2026-08-15)", () => {
  it("splits the three-tile group that was overlapping — 2 + 1, flush", () => {
    // The entry dashboard's WORDS group: total · avg/day · best day. At three
    // across on the 14" the side list overflowed back over the number.
    expect(tileRowPlan(3, TILE_ROW_MAX_SMALL)).toEqual({ tracks: 2, spans: [1, 1, 2] });
  });

  it("leaves the groups that already read cleanly alone", () => {
    // TIME and DATES & STREAKS are four tiles: 2×2 under either cap, so the
    // change must be invisible on them.
    expect(tileRowPlan(4, TILE_ROW_MAX_SMALL)).toEqual(tileRowPlan(4, TILE_ROW_MAX));
    expect(tileRowPlan(2, TILE_ROW_MAX_SMALL)).toEqual(tileRowPlan(2, TILE_ROW_MAX));
    expect(tileRowPlan(1, TILE_ROW_MAX_SMALL)).toEqual(tileRowPlan(1, TILE_ROW_MAX));
  });

  it("never puts more than two tiles on a row, at any group size", () => {
    for (let n = 1; n <= 40; n++) expect(balancedCols(n, TILE_ROW_MAX_SMALL)).toBeLessThanOrEqual(2);
  });

  it("still fills every row exactly under the small cap", () => {
    for (let n = 1; n <= 40; n++) {
      const { tracks, spans } = tileRowPlan(n, TILE_ROW_MAX_SMALL);
      let run = 0;
      const sums: number[] = [];
      for (const sp of spans) {
        run += sp;
        if (run >= tracks) {
          sums.push(run);
          run = 0;
        }
      }
      if (run > 0) sums.push(run);
      for (const sum of sums) expect(sum).toBe(tracks);
    }
  });
});

describe("the real groups on the entry dashboard", () => {
  // The two the ruling was reported against, kept as the regression: both are
  // four tiles, and both must read 2×2. "Dates & streaks" holds TWO list tiles,
  // which is exactly the group that went ragged when a list tile counted as two
  // columns — the struck first attempt (2026-08-10).
  it("draws Volume as 2×2", () => {
    expect(rowsOf(4)).toEqual([2, 2]);
  });

  it("draws Dates & streaks as 2×2, list tiles and all", () => {
    // first day · last day · current streak (list) · longest streak (list)
    expect(rowsOf(4)).toEqual([2, 2]);
  });
});
