/**
 * The weather card's arithmetic (2026-08-12 re-mint, Phase 2 step 4).
 *
 * Two pure pieces, both of which the CSS is inert without: the curve's
 * normalised level (`--wx-lvl`) and the lede's next turning point. Each guard
 * was reverted and the suite re-run before these were trusted — the minimum
 * span removed, the level returned as a viewBox coordinate, and the lede's
 * target made the day's extreme instead of the next turn.
 */
import { describe, expect, it } from "vitest";
import { buildWxCurve, WX_BOX, WX_MIN_SPAN_C, wxLede } from "./feedData";

/**
 * The curve's share of the box height.
 *
 * ⚠ `lvl` IS A FRACTION OF THE BOX, NOT OF THE CURVE, and the difference bit
 * once already while writing these tests. 0 and 1 are the box's floor and
 * ceiling; the curve is inset inside them by `yTop`/`yBot`, so the hottest hour
 * of the day reads ~0.87 and the coldest ~0.09, never 1 and 0. That is correct
 * and load-bearing — the marker is placed against the BOX in CSS
 * (`top: calc(100% - lvl * 100%)`), so any reading of `lvl` that assumed the
 * curve's own extremes would sit the marker off its curve.
 */
const INNER = (WX_BOX.yBot - WX_BOX.yTop) / WX_BOX.h;

/** 25 hourly samples — today's 24 local hours plus tomorrow's midnight. */
const series = (f: (h: number) => number): number[] => Array.from({ length: 25 }, (_, i) => f(i));

/** A plain day: 12° at midnight rising to 24° at 15:00, falling after. */
const DAY = series((h) => (h <= 15 ? 12 + h * 0.8 : 24 - (h - 15) * 0.7));

describe("buildWxCurve", () => {
  it("runs the curve edge to edge, so the axis and the plot share one x-space", () => {
    // The old box inset the curve 10 units each side while the axis did not.
    expect(WX_BOX.x0).toBe(0);
    expect(WX_BOX.x1).toBe(WX_BOX.w);
    const c = buildWxCurve(DAY, 12)!;
    expect(c.linePath.startsWith("M 0.0 ")).toBe(true);
    expect(c.linePath).toContain(" 240.0 ");
    expect(c.areaPath.endsWith(`L 240 ${WX_BOX.h} L 0 ${WX_BOX.h} Z`)).toBe(true);
  });

  it("returns the level as a fraction of the BOX, 0 floor to 1 ceiling", () => {
    // Not a viewBox coordinate: CSS reads `100% - lvl * 100%`, so a y value
    // here would place the marker upside down and off the curve.
    const hottest = buildWxCurve(DAY, 15)!.lvl!;
    const coldest = buildWxCurve(DAY, 0)!.lvl!;
    expect(hottest).toBeGreaterThan(coldest);
    for (const l of [hottest, coldest]) {
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(1);
    }
  });

  it("draws a flat day FLAT — the minimum plotted span", () => {
    // A 1.4° fog day normalised to its own range draws the identical dramatic
    // swing as a 12° one. Floored, its curve must stay near the middle.
    const flat = series((h) => (h < 12 ? 19.6 : 21.0));
    const lo = buildWxCurve(flat, 0)!.lvl!;
    const hi = buildWxCurve(flat, 23)!.lvl!;
    expect(hi - lo).toBeLessThan(0.35); // unfloored this is the curve's full sweep
    expect(lo).toBeGreaterThan(0.2);
    expect(hi).toBeLessThan(0.8);
    // and the floor is the DECLARED one, not an accident of these numbers: the
    // data spans 1.4 of the floored 6, scaled by the curve's share of the box.
    expect(hi - lo).toBeCloseTo((1.4 / WX_MIN_SPAN_C) * INNER, 3);
  });

  it("still uses the real range once the day is wider than the floor", () => {
    // The day's high reaches the CURVE's ceiling — which is not the box's. See
    // INNER: `lvl` is measured on the box, and the curve is inset within it.
    expect(buildWxCurve(DAY, 15)!.lvl!).toBeCloseTo(1 - WX_BOX.yTop / WX_BOX.h, 6);
    expect(buildWxCurve(DAY, 0)!.lvl!).toBeCloseTo(1 - WX_BOX.yBot / WX_BOX.h, 6);
  });

  it("has no level when there is no observation to place", () => {
    expect(buildWxCurve(DAY, null)!.lvl).toBeNull();
  });

  it("refuses a series it cannot draw", () => {
    expect(buildWxCurve([], 0)).toBeNull();
    expect(buildWxCurve([12], 0)).toBeNull();
  });
});

describe("wxLede", () => {
  it("names the CHANGE and the next turning point, not the day's extreme", () => {
    const l = wxLede(DAY, 8, "C")!;
    expect(l.atHour).toBeCloseTo(15, 1);
    expect(l.delta).toBeGreaterThan(0);
  });

  it("shrinks through the morning while the target holds — the whole reading", () => {
    // Written as "up to 24 by 15:00" the clause printed identically at every
    // hour, silently undoing the property the card was rebuilt for.
    const early = wxLede(DAY, 4, "C")!;
    const mid = wxLede(DAY, 8, "C")!;
    const late = wxLede(DAY, 13, "C")!;
    expect(early.delta).toBeGreaterThan(mid.delta);
    expect(mid.delta).toBeGreaterThan(late.delta);
    expect(new Set([early.atHour, mid.atHour, late.atHour]).size).toBe(1);
  });

  it("turns negative once the high has passed", () => {
    const l = wxLede(DAY, 18, "C")!;
    expect(l.delta).toBeLessThan(0);
  });

  it("is bounded by the plotted window — the open ruling, asserted", () => {
    // Midnight-to-midnight cannot name an hour it does not draw, so an evening
    // card reports the window's end rather than tomorrow's 04:00 low. This is
    // the state mint § 11 flags; if the rolling window is ever ruled in, this
    // assertion is the one that should change.
    const l = wxLede(DAY, 18, "C")!;
    expect(l.atHour).toBeLessThanOrEqual(24);
  });

  it("says nothing when there is nothing ahead, or nothing to say", () => {
    expect(wxLede(DAY, 24, "C")).toBeNull();
    expect(wxLede(series(() => 20), 6, "C")).toBeNull(); // dead flat
  });

  it("reports the delta in DISPLAY degrees, not always Celsius", () => {
    // Rounding in the wrong unit prints "6" beside Fahrenheit figures.
    const c = wxLede(DAY, 8, "C")!;
    const f = wxLede(DAY, 8, "F")!;
    expect(f.delta).toBeGreaterThan(c.delta);
  });
});
