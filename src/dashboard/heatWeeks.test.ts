import { describe, expect, it } from "vitest";
import { heatFitWeeks, heatWeeks, trimHeatCols } from "./heatWeeks";

describe("heatFitWeeks — the count that cannot scroll", () => {
  // The measured case: the entry panel's cells column on the 14".
  it("fits what the minimum allows and no more", () => {
    // 43 × 16 + 42 × 2 = 772 ≤ 782; 44 would need 806.
    expect(heatFitWeeks(782, 16, 2)).toBe(43);
  });

  it("is conservative at an exact fit rather than optimistic", () => {
    // 772 is the exact width of 43 columns — a sub-pixel short and it scrolls.
    expect(heatFitWeeks(772, 16, 2)).toBe(42);
    expect(heatFitWeeks(773, 16, 2)).toBe(43);
  });

  it("every count it returns actually fits", () => {
    for (let px = 20; px <= 2000; px += 7) {
      const n = heatFitWeeks(px, 16, 2);
      if (n > 0) expect(n * 16 + (n - 1) * 2).toBeLessThanOrEqual(px);
    }
  });

  it("returns nothing for an unmeasured box", () => {
    expect(heatFitWeeks(0, 16, 2)).toBe(0);
    expect(heatFitWeeks(NaN, 16, 2)).toBe(0);
  });
});

describe("heatWeeks — fill the box, never scroll it", () => {
  it("draws what fits", () => {
    expect(heatWeeks({ fitWeeks: 43, maxWeeks: 53 })).toBe(43);
  });

  it("never exceeds the year the grid is built at", () => {
    expect(heatWeeks({ fitWeeks: 400, maxWeeks: 53 })).toBe(53);
  });

  it("keeps the full face until the box has been measured", () => {
    expect(heatWeeks({ fitWeeks: 0, maxWeeks: 53 })).toBe(53);
  });

  it("does NOT shrink to a short entry's own history — the corrected reading", () => {
    // A two-session entry gets the same full block as any other, mostly empty,
    // which is what the 2K face draws. Capping at the span left a seven-column
    // heatmap adrift in a panel five times its width.
    expect(heatWeeks({ fitWeeks: 43, maxWeeks: 53 })).toBe(43);
  });

  it("floors at one column", () => {
    expect(heatWeeks({ fitWeeks: 1, maxWeeks: 53 })).toBe(1);
  });
});

describe("trimHeatCols — drops from the FRONT, keeping the anchor on the right", () => {
  // A 5-column × 7-row grid, row-major, each cell labelled "r,c".
  const grid = Array.from({ length: 35 }, (_, i) => `${Math.floor(i / 5)},${i % 5}`);

  it("keeps the last N columns of every row", () => {
    const out = trimHeatCols(grid, 5, 2);
    expect(out).toHaveLength(14);
    expect(out.slice(0, 2)).toEqual(["0,3", "0,4"]); // row 0 keeps cols 3–4
    expect(out.slice(12)).toEqual(["6,3", "6,4"]);   // row 6 likewise
  });

  it("keeps the grid row-major so the CSS fill order still holds", () => {
    const out = trimHeatCols(grid, 5, 3);
    for (let row = 0; row < 7; row++)
      for (let col = 0; col < 3; col++) expect(out[row * 3 + col]).toBe(`${row},${col + 2}`);
  });

  it("is a no-op at or above the full width", () => {
    expect(trimHeatCols(grid, 5, 5)).toEqual(grid);
    expect(trimHeatCols(grid, 5, 9)).toEqual(grid);
  });

  it("refuses a grid whose length does not match, rather than scrambling it", () => {
    expect(trimHeatCols(grid.slice(0, 30), 5, 2)).toHaveLength(30);
  });
});
