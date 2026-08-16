import { afterEach, describe, expect, it } from "vitest";
import { setWeekStartDow } from "../metrics/dates";
import { resolveWindow, type ResolvedWindow } from "../kit/periodWindow";
import {
  AVG_SCOPES,
  avgScopeAllowed,
  effectiveAvgScope,
  periodsInWindow,
  windowBuckets,
} from "./compareSpec";

/**
 * Matrix probe **A8** — Comparing Statistics' Average divides by **calendar
 * periods SPANNED, not active ones** (the 2026-07-27 ruling, recorded in this
 * module's own header). The interesting case is a partial first period: a
 * window opening mid-January still spends a whole January in the divisor, so an
 * average is honest about the calendar rather than flattered by it.
 *
 * The divisor never sees the sessions — it is derived from the window and the
 * scope alone. That is the ruling made structural: there is no code path by
 * which an inactive month could be dropped from the count.
 *
 * Worth recording: **nothing here needed a stub.** `compareSpec` reaches only
 * `metrics/` and `kit/periodWindow`, so the whole comparison spec is importable
 * in a node environment — the purity check the runner's config describes,
 * passing.
 */
afterEach(() => setWeekStartDow(1));

const win = (from: string, to: string): ResolvedWindow => ({
  from,
  to,
  label: `${from} → ${to}`,
  days: 0, // unread by the divisor — it walks from/to
});

describe("Average's divisor — calendar periods spanned", () => {
  it("counts a partial first AND last period in full", () => {
    // 15 Jan → 10 Mar touches January, February and March. Two of the three are
    // partial; the divisor is 3 regardless. This is the whole ruling.
    expect(periodsInWindow(win("2026-01-15", "2026-03-10"), "month")).toBe(3);
  });

  it("counts a month with no activity in it, because it cannot see activity", () => {
    // Identical window, identical answer — there is no sessions argument.
    expect(periodsInWindow(win("2026-01-31", "2026-03-01"), "month")).toBe(3);
  });

  it("counts one period for a window inside a single month", () => {
    expect(periodsInWindow(win("2026-01-02", "2026-01-30"), "month")).toBe(1);
    expect(periodsInWindow(win("2026-01-15", "2026-01-15"), "month")).toBe(1);
  });

  it("counts two months for a two-day window that straddles a month end", () => {
    // The sharpest form of the ruling: 2 days, divisor 2.
    expect(periodsInWindow(win("2026-01-31", "2026-02-01"), "month")).toBe(2);
  });

  it("counts days one-for-one at day scope", () => {
    expect(periodsInWindow(win("2026-01-01", "2026-01-31"), "day")).toBe(31);
    expect(periodsInWindow(win("2026-01-01", "2026-01-01"), "day")).toBe(1);
  });

  it("counts quarters and years across their boundaries", () => {
    expect(periodsInWindow(win("2026-03-31", "2026-04-01"), "quarter")).toBe(2);
    expect(periodsInWindow(win("2026-01-01", "2026-12-31"), "quarter")).toBe(4);
    expect(periodsInWindow(win("2025-12-31", "2026-01-01"), "year")).toBe(2);
    expect(periodsInWindow(win("2026-01-01", "2026-12-31"), "year")).toBe(1);
  });

  it("counts whole weeks at week scope", () => {
    // Mon 5 Jan → Sun 18 Jan is exactly two Monday-start weeks.
    expect(periodsInWindow(win("2026-01-05", "2026-01-18"), "week")).toBe(2);
  });

  it("FOLLOWS THE WEEK-START DIAL — the same two days span 2 weeks or 1", () => {
    // Sun 4 Jan → Mon 5 Jan. Under the Monday default those are different
    // weeks; under a Sunday start they are the same one. An average per week is
    // therefore dial-dependent by design, exactly as bucketing is (probe A4).
    const twoDays = win("2026-01-04", "2026-01-05");
    expect(periodsInWindow(twoDays, "week")).toBe(2);
    setWeekStartDow(0);
    expect(periodsInWindow(twoDays, "week")).toBe(1);
  });

  it("never returns zero, so a caller can always divide by it", () => {
    // A reversed window yields no buckets; the floor of 1 is what keeps a
    // degenerate window from producing Infinity on screen. `resolveWindow`
    // refuses to build one, so this guards the shape, not a reachable state.
    expect(periodsInWindow(win("2026-03-10", "2026-01-15"), "month")).toBe(1);
  });
});

describe("window buckets", () => {
  it("emits each period key once, in chronological order", () => {
    expect(windowBuckets(win("2026-01-15", "2026-03-10"), "month")).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });

  it("labels quarters from the month, not from a 90-day count", () => {
    expect(windowBuckets(win("2026-01-01", "2026-12-31"), "quarter")).toEqual([
      "2026-Q1",
      "2026-Q2",
      "2026-Q3",
      "2026-Q4",
    ]);
  });

  it("walks a leap February without dropping or repeating a bucket", () => {
    expect(windowBuckets(win("2024-02-28", "2024-03-01"), "day")).toEqual([
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
    ]);
  });
});

describe("window resolution — the divisor's input", () => {
  it("expands a month shorthand to whole day bounds", () => {
    // A wrong end-of-month here would silently change every Average on screen.
    expect(resolveWindow({ mode: "month", from: "2026-01", to: "2026-02" }, "2026-06-01")).toMatchObject({
      from: "2026-01-01",
      to: "2026-02-28",
    });
  });

  it("gets February right in a leap year", () => {
    expect(resolveWindow({ mode: "month", from: "2024-02", to: "2024-02" }, "2026-06-01")).toMatchObject({
      from: "2024-02-01",
      to: "2024-02-29",
    });
  });

  it("expands a year shorthand and a relative window", () => {
    expect(resolveWindow({ mode: "year", from: 2025, to: 2026 }, "2026-06-01")).toMatchObject({
      from: "2025-01-01",
      to: "2026-12-31",
    });
    // "Last 7 days" is inclusive of today — 7 days total, not 8.
    expect(resolveWindow({ mode: "rel", days: 7 }, "2026-06-10")).toMatchObject({
      from: "2026-06-04",
      to: "2026-06-10",
    });
  });

  it("refuses a reversed or incomplete range rather than resolving one backwards", () => {
    expect(resolveWindow({ mode: "daterange", from: "2026-03-01", to: "2026-01-01" }, "2026-06-01")).toBeNull();
    expect(resolveWindow({ mode: "daterange", from: null, to: "2026-01-01" }, "2026-06-01")).toBeNull();
    expect(resolveWindow({ mode: "month", from: "2026-05", to: "2026-01" }, "2026-06-01")).toBeNull();
    expect(resolveWindow({ mode: "none" }, "2026-06-01")).toBeNull();
  });

  it("resolves a month window into the period count that divides it", () => {
    // End to end: the picker's shorthand → the divisor. Jan–Mar 2026 = 3.
    const w = resolveWindow({ mode: "month", from: "2026-01", to: "2026-03" }, "2026-06-01");
    expect(w).not.toBeNull();
    expect(periodsInWindow(w!, "month")).toBe(3);
  });
});

describe("average scope gates on the window's length (2026-08-15)", () => {
  it("offers day up to 90 days and not past it", () => {
    expect(avgScopeAllowed("day", 90)).toBe(true);
    expect(avgScopeAllowed("day", 91)).toBe(false);
    expect(avgScopeAllowed("day", 365)).toBe(false);
  });

  it("offers week up to 365 days and not past it", () => {
    expect(avgScopeAllowed("week", 365)).toBe(true);
    expect(avgScopeAllowed("week", 366)).toBe(false);
  });

  it("never gates month, quarter or year", () => {
    for (const s of ["month", "quarter", "year"] as const)
      for (const d of [1, 90, 365, 5000]) expect(avgScopeAllowed(s, d)).toBe(true);
  });

  it("falls back to the FINEST scope the window still allows", () => {
    expect(effectiveAvgScope("day", 30)).toBe("day"); // legal, untouched
    expect(effectiveAvgScope("day", 365)).toBe("week");
    expect(effectiveAvgScope("day", 366)).toBe("month");
    expect(effectiveAvgScope("week", 366)).toBe("month");
  });

  it("never coarsens a scope that is already legal", () => {
    for (const s of AVG_SCOPES)
      for (const d of [1, 89, 90, 91, 365, 366, 4000])
        if (avgScopeAllowed(s, d)) expect(effectiveAvgScope(s, d)).toBe(s);
  });

  it("always returns something the window allows", () => {
    for (const s of AVG_SCOPES)
      for (const d of [1, 90, 91, 365, 366, 4000])
        expect(avgScopeAllowed(effectiveAvgScope(s, d), d)).toBe(true);
  });
});
