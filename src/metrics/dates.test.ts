import { afterEach, describe, expect, it } from "vitest";
import {
  dayFromIndex,
  dayGap,
  dayIndex,
  eachDay,
  isoWeek,
  isoWeekMonday,
  isoWeeksInYear,
  monthGridCells,
  setWeekStartDow,
  weekDayLetters,
  weekNum,
  weekStart,
  weekThursday,
} from "./dates";

/**
 * Calendar math — matrix probes A4 (the week-start dial, both settings) and
 * A7 (leap days + year boundaries), plus the pin for `calendar-1`.
 *
 * `WEEK_START_DOW` is module-level state (the one deliberate crack in this
 * module's purity — see the file header), so every test that touches it resets
 * to the ruled Monday default afterwards. A leaked dial would make these tests
 * order-dependent, which is exactly the bug class they exist to catch.
 */
afterEach(() => setWeekStartDow(1));

/** getUTCDay for a day string — the reference the module's inlined math must match. */
const dow = (day: string): number => new Date(dayIndex(day) * 86_400_000).getUTCDay();

describe("day indices", () => {
  it("round-trips across a leap day", () => {
    for (const day of ["2024-02-28", "2024-02-29", "2024-03-01", "2023-02-28"])
      expect(dayFromIndex(dayIndex(day))).toBe(day);
  });

  it("counts the leap day in a February gap", () => {
    expect(dayGap("2024-02-28", "2024-03-01")).toBe(2); // leap year
    expect(dayGap("2023-02-28", "2023-03-01")).toBe(1); // common year
  });

  it("is signed, and zero for the same day", () => {
    expect(dayGap("2026-01-10", "2026-01-01")).toBe(-9);
    expect(dayGap("2026-01-01", "2026-01-01")).toBe(0);
  });

  it("walks a year boundary inclusively", () => {
    expect(eachDay("2025-12-30", "2026-01-02")).toEqual([
      "2025-12-30",
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
    ]);
  });

  it("returns a single day when from === to, and nothing when reversed", () => {
    expect(eachDay("2026-03-05", "2026-03-05")).toEqual(["2026-03-05"]);
    expect(eachDay("2026-03-05", "2026-03-04")).toEqual([]);
  });

  it("spans a whole leap year at the right length", () => {
    expect(eachDay("2024-01-01", "2024-12-31")).toHaveLength(366);
    expect(eachDay("2025-01-01", "2025-12-31")).toHaveLength(365);
  });
});

describe("ISO weeks", () => {
  it("numbers the year-boundary weeks by their Thursday", () => {
    // 2026-01-01 is a Thursday, so it carries week 1 of 2026 — and the days
    // before it in the same week belong to 2026 too, not to 2025.
    expect(dow("2026-01-01")).toBe(4);
    expect(isoWeek("2026-01-01")).toEqual({ week: 1, year: 2026 });
    expect(isoWeek("2025-12-29")).toEqual({ week: 1, year: 2026 });
    // 2023-01-01 is a Sunday — the tail of 2022's week 52.
    expect(isoWeek("2023-01-01")).toEqual({ week: 52, year: 2022 });
  });

  it("knows the 53-week years", () => {
    expect(isoWeeksInYear(2020)).toBe(53); // leap, Jan 1 Wednesday
    expect(isoWeeksInYear(2026)).toBe(53); // Jan 1 Thursday
    expect(isoWeeksInYear(2025)).toBe(52);
    expect(isoWeeksInYear(2024)).toBe(52);
  });

  it("inverts: isoWeekMonday lands back on the same week", () => {
    for (const [year, week] of [
      [2026, 1],
      [2024, 9],
      [2020, 53],
      [2025, 52],
    ] as const) {
      const mon = isoWeekMonday(year, week);
      expect(dow(mon)).toBe(1); // it really is a Monday
      expect(isoWeek(mon)).toEqual({ week, year });
    }
  });
});

describe("the week-start dial", () => {
  it("moves the week's first day, on both settings", () => {
    // 2026-08-07 is a Friday.
    expect(dow("2026-08-07")).toBe(5);
    setWeekStartDow(1);
    expect(weekStart("2026-08-07")).toBe("2026-08-03"); // Monday
    setWeekStartDow(0);
    expect(weekStart("2026-08-07")).toBe("2026-08-02"); // Sunday
  });

  it("is idempotent — a week start is its own week's start", () => {
    for (const d of [0, 1] as const) {
      setWeekStartDow(d);
      const ws = weekStart("2026-08-07");
      expect(weekStart(ws)).toBe(ws);
    }
  });

  it("always finds a real Thursday inside the configured week", () => {
    for (const d of [0, 1] as const) {
      setWeekStartDow(d);
      for (const day of ["2026-01-01", "2026-08-07", "2024-02-29", "2025-12-31"]) {
        const thu = weekThursday(day);
        expect(dow(thu)).toBe(4);
        expect(Math.abs(dayGap(weekStart(day), thu))).toBeLessThan(7);
      }
    }
  });

  it("labels a Monday-start week by its own ISO number (the identity case)", () => {
    setWeekStartDow(1);
    for (const day of ["2026-01-01", "2026-08-07", "2020-12-31"])
      expect(weekNum(day)).toEqual(isoWeek(day));
  });

  it("keeps ISO week NUMBERS ISO under a Sunday start — only the grouping moves", () => {
    setWeekStartDow(0);
    // The ruled behaviour: a Sunday-start week is labelled by the ISO week of
    // the Thursday it contains, so its six shared days keep their ISO number
    // and only the leading Sunday changes group.
    expect(weekNum("2026-08-07")).toEqual(isoWeek("2026-08-06"));
  });

  it("rotates the header letters to the configured start", () => {
    setWeekStartDow(1);
    expect(weekDayLetters()).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
    setWeekStartDow(0);
    expect(weekDayLetters()).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
  });
});

describe("month grid cells", () => {
  it("emits whole weeks that start on the configured day", () => {
    for (const d of [0, 1] as const) {
      setWeekStartDow(d);
      for (const [y, m0] of [
        [2026, 7],
        [2024, 1], // a leap February
        [2026, 0],
        [2025, 11],
      ] as const) {
        const cells = monthGridCells(y, m0);
        expect(cells.length % 7).toBe(0);
        expect(dow(cells[0].day)).toBe(d);
      }
    }
  });

  it("carries every day of the month exactly once, in order", () => {
    const cells = monthGridCells(2024, 1); // February 2024 — 29 days
    const inMonth = cells.filter((c) => !c.out).map((c) => c.day);
    expect(inMonth).toHaveLength(29);
    expect(inMonth[0]).toBe("2024-02-01");
    expect(inMonth[28]).toBe("2024-02-29");
    expect(new Set(inMonth).size).toBe(29);
  });

  it("marks pad cells as out-of-month and keeps them contiguous", () => {
    setWeekStartDow(1);
    const cells = monthGridCells(2026, 7); // August 2026 — the 1st is a Saturday
    const days = cells.map((c) => c.day);
    // Contiguous by construction: every cell is the previous cell + 1 day.
    for (let i = 1; i < days.length; i++) expect(dayGap(days[i - 1], days[i])).toBe(1);
    expect(cells.filter((c) => c.out).every((c) => !c.day.startsWith("2026-08"))).toBe(true);
  });

  /**
   * Regression pin for bug `calendar-1` (fixed 2026-08-07). The lead-cell count
   * was inlined as `(firstIdx + 4 - WEEK_START_DOW + 7) % 7`, an identity that
   * holds only for non-negative day indices — JavaScript's `%` takes the sign
   * of the dividend — so pre-1970 months emitted no pad cells and drew the 1st
   * in the first column whatever weekday it really was.
   *
   * This ran as `it.fails` while the bug stood, which is what turned the fix
   * into a green test rather than a silent edit.
   */
  it("aligns pre-1970 months to the right weekday, on both dial settings", () => {
    for (const d of [0, 1] as const) {
      setWeekStartDow(d);
      for (const [y, m0] of [
        [1969, 0],
        [1969, 4],
        [1932, 6], // comfortably negative, and a leap year
      ] as const) {
        const cells = monthGridCells(y, m0);
        expect(dow(cells[0].day)).toBe(d);
        expect(cells.length % 7).toBe(0);
        // The month's own days are all present and contiguous with their pads.
        const days = cells.map((c) => c.day);
        for (let i = 1; i < days.length; i++) expect(dayGap(days[i - 1], days[i])).toBe(1);
      }
    }
  });
});
