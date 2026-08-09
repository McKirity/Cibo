import { describe, expect, it, vi } from "vitest";

/**
 * The synced-settings CLAMPS — the layer that decides what a dashboard reads
 * when a stored value is out of range or unreadable. This is `seed-1`'s family:
 * these rows arrive by sync, so a value the UI could never produce can still
 * turn up, and the failure mode is a silently wrong number rather than an error.
 *
 * `store.ts` builds its Evolu query at module load, so importing it pulls in the
 * live store — the same entanglement `doctor.test.ts` records, and stubbed the
 * same way. The clamps themselves touch nothing.
 *
 * ⚠ WHAT IS *NOT* REACHABLE FROM HERE: the day cutoff's actual behaviour. The
 * module cache has no writable seam (`readIntoCache` is private), so a test can
 * only ever see the shipped default of 0 — at which `defaultLogDay` can never
 * shift a day by construction. **The "before the cutoff, the log day is still
 * yesterday" rule is therefore live-only**, and belongs to the Settings tour.
 */
vi.mock("../db/evolu", () => ({
  evolu: {
    createQuery: () => ({}),
    loadQuery: async () => [],
    insert: () => ({ ok: true, value: { id: "x" } }),
    update: () => ({ ok: true }),
    subscribeQuery: () => () => {},
    getQueryRows: () => [],
  },
}));

const {
  clampBackupDailyDays,
  clampDayCutoff,
  clampListCap,
  clampWaveGap,
  dayCutoffHour,
  defaultLogDay,
  BACKUP_DAILY_DAYS_DEFAULT,
  DAY_CUTOFF_DEFAULT,
  LIST_CAP_DEFAULT,
  WAVE_GAP_DEFAULT,
} = await import("./store");

describe("the synced-setting clamps", () => {
  it("passes an in-range value through untouched", () => {
    expect(clampDayCutoff(4)).toBe(4);
    expect(clampWaveGap(30)).toBe(30);
    expect(clampListCap(10)).toBe(10);
    expect(clampBackupDailyDays(90)).toBe(90);
  });

  it("clamps to the nearer bound rather than falling back to the default", () => {
    // Out of range is a value the user meant; unreadable is not. They resolve
    // differently on purpose, and confusing the two would silently discard a
    // deliberate setting.
    expect(clampDayCutoff(-3)).toBe(0);
    expect(clampDayCutoff(13)).toBe(12);
    expect(clampWaveGap(1)).toBe(2);
    expect(clampWaveGap(999)).toBe(365);
    expect(clampListCap(2)).toBe(3);
    expect(clampListCap(51)).toBe(50);
    expect(clampBackupDailyDays(6)).toBe(7);
    expect(clampBackupDailyDays(400)).toBe(365);
  });

  it("falls back to the documented default for an unreadable value", () => {
    // The `seed-1` shape: a non-numeric arriving by sync must not become NaN and
    // poison every comparison downstream.
    for (const junk of ["abc", NaN, Infinity, -Infinity, null, undefined, {}] as unknown[]) {
      expect(clampDayCutoff(junk)).toBe(DAY_CUTOFF_DEFAULT);
      expect(clampWaveGap(junk)).toBe(WAVE_GAP_DEFAULT);
      expect(clampListCap(junk)).toBe(LIST_CAP_DEFAULT);
      expect(clampBackupDailyDays(junk)).toBe(BACKUP_DAILY_DAYS_DEFAULT);
    }
  });

  it("rounds a fractional value to a whole one", () => {
    expect(clampWaveGap(30.4)).toBe(30);
    expect(clampWaveGap(30.6)).toBe(31);
  });

  it("accepts the stored STRING form, since these arrive from a text column", () => {
    expect(clampWaveGap("45")).toBe(45);
    expect(clampDayCutoff("6")).toBe(6);
  });

  it("treats a BLANK value as unreadable, not as zero (fixed 2026-08-08)", () => {
    // `Number("")` is 0 — finite — so a blank row used to clamp to the LOWER
    // BOUND rather than fall back: a wave gap of 2 days where 30 was meant, a
    // list cap of 3 where 10 was. It read as a plausible setting with nothing to
    // point at. This test was written against the old behaviour first and seen
    // to fail on the fix, which is what proves it observes the rule at all.
    //
    // ⚠ `settings-2` (2026-08-09): this test passed for a day while the rule it
    // proves was dead in the app — every call site wrapped the value in
    // `Number(...)` before the clamp could see the string. The clamps now take
    // `unknown` and every reader passes the RAW stored value; a `Number()`
    // around a clamp argument is the regression to refuse in review, because
    // no unit test can reach the module-private cache those readers consume.
    for (const blank of ["", "   ", "\t"]) {
      expect(clampDayCutoff(blank)).toBe(DAY_CUTOFF_DEFAULT);
      expect(clampWaveGap(blank)).toBe(WAVE_GAP_DEFAULT);
      expect(clampListCap(blank)).toBe(LIST_CAP_DEFAULT);
      expect(clampBackupDailyDays(blank)).toBe(BACKUP_DAILY_DAYS_DEFAULT);
    }
  });

  it("still reads a real zero as zero — the fix must not swallow a typed 0", () => {
    // The cutoff's whole legal range starts at 0, so "blank" and "0" must stay
    // distinguishable. They differ only in the string, not in the number.
    expect(clampDayCutoff("0")).toBe(0);
    expect(clampDayCutoff(0)).toBe(0);
  });
});

describe("the day cutoff, at the shipped default", () => {
  it("defaults to midnight", () => {
    expect(DAY_CUTOFF_DEFAULT).toBe(0);
    expect(dayCutoffHour()).toBe(0);
  });

  it("never shifts the log day at a zero cutoff, at any hour", () => {
    // With no cutoff configured, the logging day is simply today — including in
    // the small hours, which is the window a mis-signed comparison would break.
    expect(defaultLogDay(new Date(2026, 0, 14, 0, 30))).toBe("2026-01-14");
    expect(defaultLogDay(new Date(2026, 0, 14, 12, 0))).toBe("2026-01-14");
    expect(defaultLogDay(new Date(2026, 0, 14, 23, 59))).toBe("2026-01-14");
  });

  it("formats a single-digit month and day with leading zeros", () => {
    expect(defaultLogDay(new Date(2026, 2, 5, 9, 0))).toBe("2026-03-05");
  });

  it("rolls the year over correctly on the last day", () => {
    expect(defaultLogDay(new Date(2025, 11, 31, 22, 0))).toBe("2025-12-31");
  });
});
