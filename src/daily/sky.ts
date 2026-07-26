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
  /** Sun altitude right now, in degrees (negative = below the horizon). */
  altitudeDeg: number;
  /** 0 at solar midnight … 1 at solar noon — drives the sky gradient. */
  arcProgress: number;
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

export function sunInfo(dayKey: string, lat: number, lon: number, now: Date): SunInfo {
  const start = dayStart(dayKey);
  const times = SunCalc.getTimes(start, lat, lon);
  const today = dayLengthMinutes(start, lat, lon);
  const yesterday = dayLengthMinutes(new Date(start.getTime() - DAY_MS), lat, lon);
  const solarNoon = isValid(times.solarNoon) ? times.solarNoon : new Date(start.getTime() + DAY_MS / 2);

  // Progress around the solar day, peaking at noon — a triangle, not a clock
  // reading, so the gradient is symmetric about solar noon at any longitude.
  const fromNoon = Math.abs(now.getTime() - solarNoon.getTime());
  const arcProgress = Math.max(0, 1 - fromNoon / (DAY_MS / 2));

  return {
    state: today.state,
    sunrise: today.state === "normal" && isValid(times.sunrise) ? times.sunrise : null,
    sunset: today.state === "normal" && isValid(times.sunset) ? times.sunset : null,
    solarNoon,
    dayLengthMin: today.min,
    deltaMin: today.min - yesterday.min,
    altitudeDeg: (SunCalc.getPosition(now, lat, lon).altitude * 180) / Math.PI,
    arcProgress,
  };
}

export interface MoonInfo {
  /** 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter. */
  phase: number;
  /** Lit fraction of the disc, 0…1. */
  illumination: number;
  name: string;
  /** True in the southern hemisphere, where the lit limb appears mirrored. */
  mirrored: boolean;
  rise: Date | null;
  set: Date | null;
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
    rise: times.rise && isValid(times.rise) ? times.rise : null,
    set: times.set && isValid(times.set) ? times.set : null,
    alwaysUp: Boolean(times.alwaysUp),
    alwaysDown: Boolean(times.alwaysDown),
  };
}

export type Season = "Spring" | "Summer" | "Autumn" | "Winter";

export interface SeasonInfo {
  season: Season;
  /** 0…1 through the current season. */
  progress: number;
  nextName: Season;
  daysToNext: number;
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
  const nextNorth = endMark.north;

  return {
    season: southern ? flip[north] : north,
    progress: span > 0 ? Math.min(1, Math.max(0, through / span)) : 0,
    nextName: southern ? flip[nextNorth] : nextNorth,
    daysToNext: Math.max(0, Math.ceil((endMark.at.getTime() - d.getTime()) / DAY_MS)),
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
