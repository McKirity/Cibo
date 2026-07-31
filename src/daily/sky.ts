/**
 * The sky cards' math — sun, moon, season, tonight's sky.
 *
 * Pure functions over (date, lat, lon). Nothing here touches the network or the
 * store, so every card in this tier is recomputable for ANY date, forever —
 * which is exactly why [[Calendar & Whimsy]] classes them "pure-function" and
 * exempts them from snapshot-at-fetch.
 *
 * Orbital positions come from `suncalc` rather than hand-rolled ephemeris: the
 * failure mode of getting it slightly wrong is invisible (twenty minutes off
 * still *looks* right), so a tested implementation is worth the one dependency.
 *
 * THE CASE THAT BREAKS NAIVE CODE: above the arctic / below the antarctic
 * circle the sun may not rise or set at all, and suncalc returns an Invalid Date
 * for `sunrise`/`sunset` rather than throwing. Every consumer here handles that
 * branch explicitly — it is the reason the dev randomiser is weighted toward
 * polar fixtures.
 */
// Namespace import: suncalc is CJS with named exports and no `default`, so a
// default import resolves to undefined under a plain esbuild bundle (Vite's
// interop hides this — the verification harness is what caught it).
import * as SunCalc from "suncalc";
import { pad2 } from "../metrics/clock";

const DAY_MS = 86_400_000;

/**
 * suncalc 2.x returns `null` for a rise/set that does not occur (and ships its
 * own typings saying so — they shadow `@types/suncalc`, which is stale and
 * claims a bare `Date`; that package is deliberately NOT installed). Older
 * builds returned an Invalid Date instead, so both are rejected here.
 */
const isValid = (d: Date | null | undefined): d is Date =>
  d instanceof Date && !Number.isNaN(d.getTime());

/** Local midnight for a `YYYY-MM-DD` day key — all sky math is anchored here. */
export const dayStart = (dayKey: string): Date => {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
};

export type SunState = "normal" | "midnight-sun" | "polar-night";

export interface SunInfo {
  state: SunState;
  /** Null in both polar states — there is no event to show. */
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
  /** Daylight in minutes: 1440 under midnight sun, 0 under polar night. */
  dayLengthMin: number;
  /** Signed change against the previous day, in minutes. */
  deltaMin: number;
}

const dayLengthMinutes = (date: Date, lat: number, lon: number): { min: number; state: SunState } => {
  const t = SunCalc.getTimes(date, lat, lon);
  if (isValid(t.sunrise) && isValid(t.sunset)) {
    return { min: Math.max(0, (t.sunset.getTime() - t.sunrise.getTime()) / 60000), state: "normal" };
  }
  // No rise/set today: the sun is either up all day or down all day. suncalc
  // says which outright via alwaysUp/alwaysDown; they are optional, so fall back
  // to the sign of the altitude at solar noon (the moment of maximum altitude).
  if (t.alwaysUp) return { min: 1440, state: "midnight-sun" };
  if (t.alwaysDown) return { min: 0, state: "polar-night" };
  const noon = isValid(t.solarNoon) ? t.solarNoon : new Date(date.getTime() + DAY_MS / 2);
  const alt = SunCalc.getPosition(noon, lat, lon).altitude;
  return alt > 0 ? { min: 1440, state: "midnight-sun" } : { min: 0, state: "polar-night" };
};

// Purely date-shaped since the skyGradient orphans died (2026-07-30 dedup):
// the ticking disc reads `sunArcPoint(sun, now)`, so nothing here needs a clock.
export function sunInfo(dayKey: string, lat: number, lon: number): SunInfo {
  const start = dayStart(dayKey);
  const times = SunCalc.getTimes(start, lat, lon);
  const today = dayLengthMinutes(start, lat, lon);
  const yesterday = dayLengthMinutes(new Date(start.getTime() - DAY_MS), lat, lon);
  const solarNoon = isValid(times.solarNoon) ? times.solarNoon : new Date(start.getTime() + DAY_MS / 2);

  return {
    state: today.state,
    sunrise: today.state === "normal" && isValid(times.sunrise) ? times.sunrise : null,
    sunset: today.state === "normal" && isValid(times.sunset) ? times.sunset : null,
    solarNoon,
    dayLengthMin: today.min,
    deltaMin: today.min - yesterday.min,
  };
}

/**
 * Format an instant in the LOCATION's local time, not the machine's.
 *
 * Sun and moon events belong to the coordinates, not to the observer's laptop.
 * In real use the two coincide, so this is invisible — but the dev panel can
 * put the coordinates half a world away, and then machine-local rendering
 * produces nonsense like "rise 21:13 / set 12:59" (rise after set), which is
 * what it did.
 *
 * Uses LOCAL MEAN TIME from longitude (15° per hour) rather than a political
 * timezone: no tz database, no DST guesswork, and for "when is the sun up here"
 * it is the honest answer — solar events are a function of longitude, not of
 * which government drew the boundary.
 */
export const atLocation = (d: Date, lon: number): string => {
  const shifted = new Date(d.getTime() + lon * 240_000); // 4 min per degree
  return `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
};

/**
 * Where the sun disc sits ON the drawn arc.
 *
 * The FINAL draws the path as a quadratic Bézier in a 400x168 viewBox:
 *   M6 150 Q200 -90 394 150
 * so the disc must be evaluated on that same curve, not floated near it.
 *
 * The parameter is the fraction of DAYLIGHT elapsed — from this location's own
 * sunrise to its own sunset — which is what makes the disc actually track the
 * coordinates. (The first implementation used `1 - |now - solarNoon| / 12h`,
 * which barely moves when longitude changes and is symmetric about noon, so
 * morning and afternoon landed on the same spot. It looked static because it
 * very nearly was.)
 */
/**
 * THE SUN ARC, defined once.
 *
 * The drawn path and the disc's position are the same curve, so they are
 * derived from one set of constants rather than written out twice — two copies
 * would drift the moment either is tuned.
 *
 * SHRUNK AND RAISED from the FINAL's `M6 150 Q200 -90 394 150` (user-ruled
 * 2026-07-26). The decoration layer reserves `--frame-clear-whimsy` inside every
 * whimsy card for an ornamental frame, and the art field bleeds to the card's
 * inner edges — so the frame band overlaps the field at the sides and, most
 * of all, along the BOTTOM, which is exactly where the horizon rule and the
 * rise/set labels sit.
 *
 * Two moves, in order:
 *   1. shrink  — control point -90 -> -44 and feet drawn in 6/394 -> 30/370, so
 *                the disc (32px + a 6px glow, ~22px of reach) clears the side
 *                bands and does not ride into the top of the field.
 *   2. raise   — the whole group lifted 14 units (150 -> 136), taking the
 *                horizon, both feet and the apex with it, so the bottom band
 *                has room to be painted under nothing.
 *
 * `.sun-end`'s bottom offset is raised in step (daily.css) — it is measured
 * from the same edge and would otherwise stay behind while the rule moved.
 */
export const SUN_ARC = {
  w: 400,
  h: 168,
  x0: 30,
  y0: 136,
  /** Control point. */
  cx: 200,
  cy: -44,
  x1: 370,
  y1: 136,
  /** The horizon rule the feet sit on. */
  horizon: 136,
} as const;

/** The `d` attribute for the drawn arc — same curve the disc is placed on. */
export const sunArcPath = (): string =>
  `M${SUN_ARC.x0} ${SUN_ARC.y0} Q${SUN_ARC.cx} ${SUN_ARC.cy} ${SUN_ARC.x1} ${SUN_ARC.y1}`;

export interface SunArcPoint {
  /** Percentages within the field box. */
  xPct: number;
  yPct: number;
  /** False during polar night — there is no disc to draw. */
  visible: boolean;
}

export function sunArcPoint(sun: SunInfo, now: Date): SunArcPoint {
  let t: number;
  if (sun.state === "polar-night") {
    return { xPct: 0, yPct: 0, visible: false };
  } else if (sun.state === "midnight-sun") {
    // No rise or set: run the parameter over the whole solar day so the disc
    // still travels, anchored so it peaks at solar noon.
    const fromNoon = (now.getTime() - sun.solarNoon.getTime()) / DAY_MS;
    t = Math.min(1, Math.max(0, fromNoon + 0.5));
  } else if (sun.sunrise && sun.sunset) {
    const span = sun.sunset.getTime() - sun.sunrise.getTime();
    t = span > 0 ? (now.getTime() - sun.sunrise.getTime()) / span : 0;
    t = Math.min(1, Math.max(0, t)); // parked at the horizon outside daylight
  } else {
    t = 0.5;
  }

  // Evaluate the same quadratic Bézier the path is drawn from.
  const u = 1 - t;
  const A = SUN_ARC;
  const x = u * u * A.x0 + 2 * u * t * A.cx + t * t * A.x1;
  const y = u * u * A.y0 + 2 * u * t * A.cy + t * t * A.y1;
  return { xPct: (x / A.w) * 100, yPct: (y / A.h) * 100, visible: true };
}

export interface MoonInfo {
  /** 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter. */
  phase: number;
  /** Lit fraction of the disc, 0…1. */
  illumination: number;
  name: string;
  /** True in the southern hemisphere, where the lit limb appears mirrored. */
  mirrored: boolean;
  /** The moon can stay up (or down) all day at high latitudes. */
  alwaysUp: boolean;
  alwaysDown: boolean;
}

const PHASE_NAMES = [
  "New moon",
  "Waxing crescent",
  "First quarter",
  "Waxing gibbous",
  "Full moon",
  "Waning gibbous",
  "Last quarter",
  "Waning crescent",
];

/** Name the phase by eighths, with the four exact points given a tight window. */
const phaseName = (phase: number): string => {
  const p = ((phase % 1) + 1) % 1;
  const idx = Math.round(p * 8) % 8;
  return PHASE_NAMES[idx];
};

export function moonInfo(dayKey: string, lat: number, lon: number): MoonInfo {
  const start = dayStart(dayKey);
  const noon = new Date(start.getTime() + DAY_MS / 2); // sample mid-day, not midnight
  const illum = SunCalc.getMoonIllumination(noon);
  const times = SunCalc.getMoonTimes(start, lat, lon);
  return {
    phase: illum.phase,
    illumination: illum.fraction,
    name: phaseName(illum.phase),
    mirrored: lat < 0,
    alwaysUp: Boolean(times.alwaysUp),
    alwaysDown: Boolean(times.alwaysDown),
  };
}

export type Season = "Spring" | "Summer" | "Autumn" | "Winter";

export interface SeasonInfo {
  season: Season;
  daysToNext: number;
  /** 1-based day within the season — the FINAL reads "day 14 of 93". */
  dayIndex: number;
  /** Total days in this season. */
  length: number;
  /** Northern-hemisphere season at the same instant — the band's colours are
   *  keyed to the calendar quarter, not to the observer's felt season. */
  northern: Season;
}

/**
 * Astronomical seasons, hemisphere-aware. Solstice/equinox dates drift a day
 * either way across years; fixed boundaries are within a day and this is a
 * whimsy card, not an almanac of record.
 */
export function seasonInfo(dayKey: string, lat: number): SeasonInfo {
  const d = dayStart(dayKey);
  const year = d.getFullYear();
  const marks: Array<{ at: Date; north: Season }> = [
    { at: new Date(year, 2, 20), north: "Spring" },
    { at: new Date(year, 5, 21), north: "Summer" },
    { at: new Date(year, 8, 22), north: "Autumn" },
    { at: new Date(year, 11, 21), north: "Winter" },
  ];
  const flip: Record<Season, Season> = { Spring: "Autumn", Summer: "Winter", Autumn: "Spring", Winter: "Summer" };
  const southern = lat < 0;

  // Walk backwards to the most recent boundary, wrapping into last December.
  let idx = -1;
  for (let i = marks.length - 1; i >= 0; i--) {
    if (d.getTime() >= marks[i].at.getTime()) {
      idx = i;
      break;
    }
  }
  const startMark = idx === -1 ? { at: new Date(year - 1, 11, 21), north: "Winter" as Season } : marks[idx];
  const endMark = idx === -1 ? marks[0] : idx === marks.length - 1 ? { at: new Date(year + 1, 2, 20), north: "Spring" as Season } : marks[idx + 1];

  const span = endMark.at.getTime() - startMark.at.getTime();
  const through = d.getTime() - startMark.at.getTime();
  const north = startMark.north;

  const length = Math.round(span / DAY_MS);
  return {
    season: southern ? flip[north] : north,
    daysToNext: Math.max(0, Math.ceil((endMark.at.getTime() - d.getTime()) / DAY_MS)),
    // round, not floor: the span crosses DST changes, so the diff is ±1h off
    // a whole day for part of the year (almanac.dayOfYear's fix, same class).
    dayIndex: Math.round(through / DAY_MS) + 1,
    length,
    northern: north,
  };
}

/**
 * The season band's five segments — the year cut at the solstices/equinoxes,
 * flex-weighted by their real day counts, exactly as the FINAL draws it. The
 * boundary year opens and closes on the same (winter) segment, which is why
 * there are five rather than four.
 */
export interface SeasonBand {
  segments: Array<{ days: number; monthVar: string; current: boolean }>;
  /** Percentage across the year for the "today" marker. */
  todayPct: number;
  ticks: Array<{ label: string; pct: number }>;
}

/** `northern` lets a caller that already holds `seasonInfo(...)` pass its
 * `.northern` reading instead of paying a second derivation (2026-07-30 dedup);
 * the field is hemisphere-independent, so either call yields the same value. */
export function seasonBand(dayKey: string, lat: number, northern?: Season): SeasonBand {
  const d = dayStart(dayKey);
  const year = d.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const nextJan1 = new Date(year + 1, 0, 1);
  const total = (nextJan1.getTime() - jan1.getTime()) / DAY_MS;
  const bounds = [
    new Date(year, 2, 20),
    new Date(year, 5, 21),
    new Date(year, 8, 22),
    new Date(year, 11, 21),
  ];
  const dayCount = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY_MS);
  const nowNorth = northern ?? seasonInfo(dayKey, Math.abs(lat)).northern; // northern reading drives colour
  const segs: Array<{ days: number; monthVar: string; season: Season }> = [
    { days: dayCount(jan1, bounds[0]), monthVar: "--month-jan", season: "Winter" },
    { days: dayCount(bounds[0], bounds[1]), monthVar: "--month-apr", season: "Spring" },
    { days: dayCount(bounds[1], bounds[2]), monthVar: "--month-jul", season: "Summer" },
    { days: dayCount(bounds[2], bounds[3]), monthVar: "--month-oct", season: "Autumn" },
    { days: dayCount(bounds[3], nextJan1), monthVar: "--month-jan", season: "Winter" },
  ];
  const pct = (x: Date) => ((x.getTime() - jan1.getTime()) / DAY_MS / total) * 100;
  return {
    segments: segs.map((s) => ({ days: s.days, monthVar: s.monthVar, current: s.season === nowNorth })),
    todayPct: pct(d),
    ticks: [
      { label: "Mar 20", pct: pct(bounds[0]) },
      { label: "Jun 21", pct: pct(bounds[1]) },
      { label: "Sep 22", pct: pct(bounds[2]) },
      { label: "Dec 21", pct: pct(bounds[3]) },
    ],
  };
}

/**
 * Tonight's sky — the prominent constellations for the month, filtered by what
 * the latitude can actually see. Deliberately a small curated table: this is an
 * ambient card, not a planetarium, and a real star catalogue would dwarf every
 * other bundled dataset.
 *
 * `minLat`/`maxLat` are the rough visibility band for the observer's latitude.
 */
const CONSTELLATIONS: Array<{ name: string; months: number[]; minLat: number; maxLat: number }> = [
  { name: "Orion", months: [12, 1, 2, 3], minLat: -75, maxLat: 75 },
  { name: "Taurus", months: [11, 12, 1, 2], minLat: -60, maxLat: 85 },
  { name: "Gemini", months: [1, 2, 3], minLat: -60, maxLat: 85 },
  { name: "Canis Major", months: [1, 2, 3], minLat: -85, maxLat: 60 },
  { name: "Leo", months: [3, 4, 5], minLat: -65, maxLat: 85 },
  { name: "Virgo", months: [4, 5, 6], minLat: -75, maxLat: 75 },
  { name: "Boötes", months: [5, 6, 7], minLat: -50, maxLat: 90 },
  { name: "Scorpius", months: [6, 7, 8], minLat: -90, maxLat: 45 },
  { name: "Sagittarius", months: [7, 8, 9], minLat: -90, maxLat: 55 },
  { name: "Cygnus", months: [8, 9, 10], minLat: -40, maxLat: 90 },
  { name: "Lyra", months: [7, 8, 9], minLat: -40, maxLat: 90 },
  { name: "Pegasus", months: [9, 10, 11], minLat: -60, maxLat: 90 },
  { name: "Andromeda", months: [10, 11, 12], minLat: -40, maxLat: 90 },
  { name: "Cassiopeia", months: [10, 11, 12, 1], minLat: -20, maxLat: 90 },
  { name: "Ursa Major", months: [3, 4, 5, 6], minLat: -30, maxLat: 90 },
  { name: "Crux", months: [4, 5, 6], minLat: -90, maxLat: 25 },
  { name: "Centaurus", months: [4, 5, 6], minLat: -90, maxLat: 25 },
  { name: "Carina", months: [2, 3, 4], minLat: -90, maxLat: 20 },
];

/**
 * The moon disc's terminator, as the frozen FINAL draws it: a half disc plus an
 * ellipse whose x-radius is the *cosine* of the phase. `rx = r · |1 − 2f|`, and
 * the ellipse is unioned with the lit half when the moon is gibbous, subtracted
 * when it is crescent — which is exactly what the sweep flag switches.
 *
 * My first attempt slid a rectangular shadow across the disc by `(1 − lit)`,
 * which renders a gibbous moon nearly black. This is the real construction.
 */
export interface MoonDiscPaths {
  /** The always-lit half. */
  half: string;
  /** The terminator ellipse. */
  terminator: string;
  /** Ellipse x-radius, for reference/testing. */
  rx: number;
}

export function moonDiscPaths(illumination: number, phase: number, r = 60, cx = 66, cy = 66): MoonDiscPaths {
  const f = Math.max(0, Math.min(1, illumination));
  const waxing = phase < 0.5;
  const rx = Math.abs(1 - 2 * f) * r;
  const top = cy - r;
  const bottom = cy + r;
  // Waxing shows the lit half on the right; waning on the left.
  const halfSweep = waxing ? 1 : 0;
  // Gibbous (>50% lit) bulges the terminator outward, crescent cuts inward.
  const gibbous = f > 0.5;
  const termSweep = gibbous ? (waxing ? 0 : 1) : waxing ? 1 : 0;
  return {
    half: `M${cx} ${top} A${r} ${r} 0 0 ${halfSweep} ${cx} ${bottom} Z`,
    terminator: `M${cx} ${top} A${rx.toFixed(1)} ${r} 0 0 ${termSweep} ${cx} ${bottom} Z`,
    rx,
  };
}

export function tonightsSky(dayKey: string, lat: number): string[] {
  const month = dayStart(dayKey).getMonth() + 1;
  const visible = CONSTELLATIONS.filter(
    (c) => c.months.includes(month) && lat >= c.minLat && lat <= c.maxLat,
  ).map((c) => c.name);
  // Circumpolar fallbacks — at extreme latitudes the seasonal table can come up
  // empty, and an empty card is worse than a always-true one.
  if (visible.length === 0) return lat >= 0 ? ["Ursa Minor", "Cassiopeia"] : ["Crux", "Centaurus"];
  return visible.slice(0, 4);
}
