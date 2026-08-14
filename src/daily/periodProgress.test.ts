/**
 * The five-period arithmetic. Written to FAIL against the old implementation —
 * the claims that matter are the ones it got wrong:
 *   · a back-dated day must not read 100% because it is not today
 *   · nothing prints 100% before its period ends
 *   · 0 prints as 0
 *   · a DST day's denominator is its REAL length, not 86_400_000
 *
 * ⚠ These run in the machine's local zone. The DST cases are written for a zone
 * that observes it (America/Los_Angeles here) and SKIP THEMSELVES where the
 * offsets are equal, rather than asserting something the zone cannot produce —
 * a test that silently passes in UTC would be worse than no test.
 */
import { describe, it, expect } from "vitest";
import { periodProgress, pct, isoWeekNumber } from "./periodProgress";

const at = (s: string) => new Date(s);

describe("periodProgress — the one rule", () => {
  it("reads a partial day partially, at the instant given", () => {
    // 21:31 on 2026-08-01 — the mint's own state.
    const p = periodProgress("2026-08-01", at("2026-08-01T21:31:00"), 1);
    expect(pct(p.day)).toBe(89);
    expect(p.day).toBeGreaterThan(0.89);
    expect(p.day).toBeLessThan(0.9);
  });

  it("⚠ does NOT read 100% for a back-dated day merely because it is not today", () => {
    // The old rule fell back to a whole DAY_MS whenever the day was not today,
    // so every catch-up day drew a finished ring. Measured at 09:00 ON that day,
    // the answer is 37%, whatever `now` happens to be elsewhere.
    const p = periodProgress("2026-07-04", at("2026-07-04T09:00:00"), 1);
    expect(pct(p.day)).toBe(37);
  });

  it("clamps a genuinely elapsed day to 100 and a future one to 0", () => {
    expect(pct(periodProgress("2026-07-04", at("2026-08-01T12:00:00"), 1).day)).toBe(100);
    expect(pct(periodProgress("2026-09-01", at("2026-08-01T12:00:00"), 1).day)).toBe(0);
  });

  it("floors, never rounds — nothing prints 100 before its period ends", () => {
    // 23:50 on 31 December: the year is 99.98% gone and must still print 99.
    const p = periodProgress("2026-12-31", at("2026-12-31T23:50:00"), 1);
    expect(pct(p.year)).toBe(99);
    expect(pct(p.quarter)).toBe(99);
    expect(pct(p.month)).toBe(99);
    expect(pct(p.day)).toBe(99);
  });

  it("prints 0 as 0 at the first instant of a period", () => {
    const p = periodProgress("2026-01-01", at("2026-01-01T00:00:00"), 1);
    expect(pct(p.day)).toBe(0);
    expect(pct(p.month)).toBe(0);
    expect(pct(p.quarter)).toBe(0);
    expect(pct(p.year)).toBe(0);
  });

  it("takes the week start from the dial", () => {
    // 2026-08-01 is a Saturday. Monday-start: it is day 6 of 7, so ~85% through.
    // Sunday-start: it is day 7 of 7, so ~99% through.
    const mon = periodProgress("2026-08-01", at("2026-08-01T21:31:00"), 1);
    const sun = periodProgress("2026-08-01", at("2026-08-01T21:31:00"), 0);
    expect(pct(mon.week)).toBe(84);
    expect(pct(sun.week)).toBe(98);
  });

  it("measures a DST day against its REAL length, not 86_400_000", () => {
    // Spring forward 2026-03-08 (US): a 23-hour day. At 12:00 exactly 12 real
    // hours minus the lost one have passed — 11h of 23 — so 47%, not 50%.
    const start = new Date(2026, 2, 8);
    const next = new Date(2026, 2, 9);
    const hours = (next.getTime() - start.getTime()) / 3_600_000;
    if (hours === 24) return; // zone does not observe DST — nothing to assert
    const p = periodProgress("2026-03-08", at("2026-03-08T12:00:00"), 1);
    expect(hours).toBe(23);
    expect(pct(p.day)).toBe(47);
    // the constant-denominator answer, which this must NOT produce
    expect(pct(p.day)).not.toBe(50);
  });

  it("gives every period a real length, so the five are one rule", () => {
    const p = periodProgress("2026-02-15", at("2026-02-15T12:00:00"), 1);
    // February 2026 has 28 days; noon on the 15th is 14.5/28.
    expect(pct(p.month)).toBe(51);
  });
  it("matches the handoff's acceptance row exactly", () => {
    // The design session's own table, for Sat 1 August 2026 21:31 — the state
    // every drawn figure on the mint page was measured at. If this row moves,
    // the exhibit and the app have stopped agreeing about the same instant.
    const p = periodProgress("2026-08-01", at("2026-08-01T21:31:00"), 1);
    expect([pct(p.day), pct(p.week), pct(p.month), pct(p.quarter), pct(p.year)])
      .toEqual([89, 84, 2, 34, 58]);
    expect(p.weekNumber).toBe(31);
    expect(p.quarter1).toBe(3);
  });
});

describe("isoWeekNumber", () => {
  it("labels a week by its Thursday, regardless of the dial", () => {
    expect(isoWeekNumber(new Date(2026, 7, 1))).toBe(31); // Sat 1 Aug 2026
    expect(isoWeekNumber(new Date(2026, 0, 1))).toBe(1);
  });

  it("handles the year boundary the way ISO does", () => {
    // 2027-01-01 is a Friday, so it belongs to ISO week 53 of 2026.
    expect(isoWeekNumber(new Date(2027, 0, 1))).toBe(53);
  });
});
