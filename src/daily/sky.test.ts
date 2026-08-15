/**
 * The sun card's altitude model (2026-08-13, Phase 2 step 4).
 *
 * `sunAltitude` is the card's ONLY input — height, both sky stops, the land,
 * the star scatter and the concealment at night all derive from it — so an
 * error here is invisible in code review and total on screen. Each guard was
 * reverted and the suite re-run: the polar-night guard to the bare ratio (broad
 * daylight on the darkest day of the year), the past-day branch to read `now`,
 * and the horizon pin to geometric zero.
 *
 * ⚠ THE THIRD REVERT IS WHY THIS FILE IS WORTH READING. It did NOT go red — and
 * the reason was not a weak test but a real defect underneath it: the pin was
 * written in radians against a library that answers in degrees, so removing it
 * changed nothing because it had never done anything. The fail-first pass is
 * what surfaced it; a green suite would have shipped the bug and the test that
 * blessed it. See the crossing block below.
 *
 * Everything is asserted RELATIVE to the day's own events rather than against
 * clock times, so the file is honest in any machine timezone.
 */
import { describe, expect, it } from "vitest";
import { nextSunrise, sunAltitude, sunInfo, sunReadingInstant, sunStateSentence } from "./sky";

// London and Svalbard: one ordinary latitude and one that has neither event.
const LDN = { lat: 51.5, lon: -0.13 };
const SVB = { lat: 78.2, lon: 15.6 };
// Three more for the crossing test alone — the property must hold where the
// day's span is shortest, longest-lived and southern, not only where it is easy.
const REY = { lat: 64.1, lon: -21.9 };
const SIN = { lat: 1.35, lon: 103.8 };
const SYD = { lat: -33.9, lon: 151.2 };

describe("sunAltitude", () => {
  it("reads exactly 1 at solar noon", () => {
    const sun = sunInfo("2026-05-04", LDN.lat, LDN.lon);
    expect(sunAltitude(sun, LDN.lat, LDN.lon, sun.solarNoon)).toBeCloseTo(1, 6);
  });

  // ⚠ THIS BLOCK EXISTS BECAUSE ITS FIRST DRAFT REFUSED TO FAIL. Written with a
  // 0.01 tolerance, it passed with the horizon pin REMOVED — so it asserted
  // nothing about the one property it was written for, and it was covering a
  // units bug (the offset was in radians against a library that answers in
  // degrees, 57× too small to matter). The tolerance was the tell: a pin that
  // makes a crossing EXACT should be tested as exact, and a bound loose enough
  // to survive its own removal is decoration.
  it.each([
    ["London, May", "2026-05-04", LDN],
    ["London, winter solstice", "2026-12-21", LDN],
    ["Reykjavik, winter solstice", "2026-12-21", REY], // shortest span: worst case
    ["Singapore, equinox", "2026-03-20", SIN], // near-constant span: the other extreme
    ["Sydney, midsummer", "2026-12-21", SYD], // southern hemisphere
  ])("crosses zero exactly at both events — %s", (_n, day, at) => {
    const sun = sunInfo(day, at.lat, at.lon);
    expect(Math.abs(sunAltitude(sun, at.lat, at.lon, sun.sunrise!))).toBeLessThan(1e-6);
    expect(Math.abs(sunAltitude(sun, at.lat, at.lon, sun.sunset!))).toBeLessThan(1e-6);
  });

  it("goes negative between sunset and the next sunrise", () => {
    const sun = sunInfo("2026-05-04", LDN.lat, LDN.lon);
    const midnight = new Date(sun.sunset!.getTime() + 3 * 3_600_000);
    expect(sunAltitude(sun, LDN.lat, LDN.lon, midnight)).toBeLessThan(0);
  });

  it("climbs monotonically from sunrise to solar noon", () => {
    const sun = sunInfo("2026-05-04", LDN.lat, LDN.lon);
    const span = sun.solarNoon.getTime() - sun.sunrise!.getTime();
    let prev = -Infinity;
    for (let i = 0; i <= 10; i++) {
      const alt = sunAltitude(sun, LDN.lat, LDN.lon, new Date(sun.sunrise!.getTime() + (span * i) / 10));
      expect(alt).toBeGreaterThan(prev);
      prev = alt;
    }
    expect(prev).toBeCloseTo(1, 6);
  });

  it("stays above zero all day under midnight sun, with no special case", () => {
    const sun = sunInfo("2026-06-21", SVB.lat, SVB.lon);
    expect(sun.state).toBe("midnight-sun");
    for (let h = 0; h < 24; h++) {
      const at = new Date(sun.solarNoon.getTime() + h * 3_600_000);
      expect(sunAltitude(sun, SVB.lat, SVB.lon, at)).toBeGreaterThan(0);
    }
  });

  it("stays NEGATIVE all day under polar night — the sign-flip guard", () => {
    // Without the guard the divisor is negative too, so a negative altitude over
    // a negative span comes out POSITIVE and the darkest day of the year draws
    // as broad daylight. This is the assertion that catches it.
    const sun = sunInfo("2026-12-21", SVB.lat, SVB.lon);
    expect(sun.state).toBe("polar-night");
    for (let h = 0; h < 24; h++) {
      const at = new Date(sun.solarNoon.getTime() + h * 3_600_000);
      expect(sunAltitude(sun, SVB.lat, SVB.lon, at)).toBeLessThan(0);
    }
  });

  it("never leaves the -1…1 band, so the disc cannot fly off the field", () => {
    const sun = sunInfo("2026-12-21", SVB.lat, SVB.lon);
    expect(sunAltitude(sun, SVB.lat, SVB.lon, sun.solarNoon)).toBeGreaterThanOrEqual(-1);
    expect(sunAltitude(sun, SVB.lat, SVB.lon, sun.solarNoon)).toBeLessThanOrEqual(1);
  });
});

describe("sunReadingInstant", () => {
  it("reads a past day at ITS sunset, not at the live clock", () => {
    const sun = sunInfo("2020-05-04", LDN.lat, LDN.lon);
    expect(sunReadingInstant(sun, "2020-05-04", new Date()).getTime()).toBe(sun.sunset!.getTime());
  });

  it("falls back to solar noon when the day has no sunset to read", () => {
    const sun = sunInfo("2020-06-21", SVB.lat, SVB.lon);
    expect(sun.sunset).toBeNull();
    expect(sunReadingInstant(sun, "2020-06-21", new Date()).getTime()).toBe(sun.solarNoon.getTime());
  });

  it("a past day lands the card exactly on the horizon, countdown at zero", () => {
    const sun = sunInfo("2020-05-04", LDN.lat, LDN.lon);
    const at = sunReadingInstant(sun, "2020-05-04", new Date());
    expect(Math.abs(sunAltitude(sun, LDN.lat, LDN.lon, at))).toBeLessThan(1e-6);
  });
});

describe("nextSunrise", () => {
  it("returns the next sunrise strictly after the instant given", () => {
    const sun = sunInfo("2026-05-04", LDN.lat, LDN.lon);
    const at = new Date(sun.sunset!.getTime() + 3_600_000);
    const rise = nextSunrise(LDN.lat, LDN.lon, at)!;
    expect(rise.getTime()).toBeGreaterThan(at.getTime());
    // The wait is a night, not a day: never more than ~24h at this latitude.
    expect(rise.getTime() - at.getTime()).toBeLessThan(24 * 3_600_000);
  });

  it("gives up rather than guessing when no sunrise is in reach", () => {
    const sun = sunInfo("2026-12-21", SVB.lat, SVB.lon);
    expect(nextSunrise(SVB.lat, SVB.lon, sun.solarNoon)).toBeNull();
  });
});

describe("sunStateSentence", () => {
  it("names both horizon crossings by their shape, not their altitude", () => {
    expect(sunStateSentence("normal", 0, true)).toMatch(/^Sunrise\./);
    expect(sunStateSentence("normal", 0, false)).toMatch(/^Sunset\./);
  });

  it("tells morning from afternoon at an altitude that occurs twice", () => {
    // The one thing altitude alone cannot say, and the reason `rising` is passed.
    expect(sunStateSentence("normal", 0.58, true)).not.toBe(sunStateSentence("normal", 0.58, false));
  });

  it("says night whenever the sun is down", () => {
    expect(sunStateSentence("normal", -0.6, false)).toMatch(/^Night\./);
  });

  it("gives each polar state its own sentence", () => {
    expect(sunStateSentence("midnight-sun", 0.28, true)).toMatch(/^Midnight sun\./);
    expect(sunStateSentence("polar-night", -1, false)).toMatch(/^Polar night\./);
  });
});
