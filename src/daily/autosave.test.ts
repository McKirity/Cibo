import { describe, expect, it, vi } from "vitest";

/**
 * The auto-save interval's clamp — the second site of the blank-value defect
 * fixed 2026-08-08, found by sweeping the neighbours of the first
 * (`settings/store.ts`'s `clampInt`). Same shape, different blast radius: a
 * blank `autosave_minutes` row read as 0, clamped up to 1, and buffered every
 * write for **one minute instead of ten** — a plausible interval, silently
 * wrong, and nothing on screen would have said so.
 *
 * `autosave.ts` builds its query at module load, so the store is stubbed (the
 * `doctor.test.ts` precedent). The clamp itself touches nothing.
 */
vi.mock("../db/evolu", () => ({
  evolu: {
    createQuery: () => ({}),
    loadQuery: async () => [],
    insert: () => ({ ok: true, value: { id: "x" } }),
    update: () => ({ ok: true }),
  },
}));

const { clampInterval, AUTOSAVE_DEFAULT_MINUTES } = await import("./autosave");

describe("the auto-save interval clamp", () => {
  it("passes an in-range value through, as a number or as the stored string", () => {
    expect(clampInterval(10)).toBe(10);
    expect(clampInterval("25")).toBe(25);
  });

  it("clamps out-of-range to the nearer bound", () => {
    // A zero would mean 'save never'; an hour is past any session.
    expect(clampInterval(0)).toBe(1);
    expect(clampInterval(-5)).toBe(1);
    expect(clampInterval(120)).toBe(60);
  });

  it("falls back to ten minutes for an unreadable value", () => {
    for (const junk of ["abc", NaN, Infinity, null, undefined, {}] as unknown[])
      expect(clampInterval(junk)).toBe(AUTOSAVE_DEFAULT_MINUTES);
  });

  it("treats a BLANK stored value as unreadable, not as zero (the fix)", () => {
    // Before: Number("") → 0 → clamped to 1 → a one-minute buffer.
    for (const blank of ["", "   ", "\t"]) expect(clampInterval(blank)).toBe(AUTOSAVE_DEFAULT_MINUTES);
    expect(AUTOSAVE_DEFAULT_MINUTES).toBe(10);
  });

  it("rounds a fractional interval", () => {
    expect(clampInterval(9.4)).toBe(9);
    expect(clampInterval(9.6)).toBe(10);
  });
});
