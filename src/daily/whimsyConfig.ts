/**
 * The whimsy tier's inputs — location and the user's dated events.
 *
 * THIS IS A STAND-IN SOURCE, not a stand-in shape. First-run setup's steps 1–2
 * (important dates · coordinates) collect exactly this, and Settings edits it
 * later — but both are step 15 / step 10, so until then a dev panel writes it
 * (the same substitution the dev habit-activation panel already makes). When
 * those land they replace the SOURCE and nothing else: cards read `WhimsyConfig`
 * and never learn where it came from.
 *
 * Location is stored as coordinates outright — no place names, no geocoding
 * ([[Calendar & Whimsy]] § config). Per-device by nature, so the dev store is
 * localStorage; the real one is the per-device settings file.
 */

export interface DatedEvent {
  id: string;
  label: string;
  /** `YYYY-MM-DD`. The year matters for anniversaries and countdowns alike. */
  date: string;
  /** Recurring events are remembered by month/day; one-shots by the full date. */
  recurring: boolean;
}

export interface WhimsyConfig {
  /** Degrees, −90…90. */
  lat: number;
  /** Degrees, −180…180. */
  lon: number;
  /** Purely a dev-panel affordance so a random fixture is recognisable. */
  label: string;
  /** Drives the lifetime card (and, once network lands, the horoscope sign). */
  birthdate: string | null;
  events: DatedEvent[];
}

const KEY = "cibo.dev.whimsyConfig";

/** A neutral, unremarkable default: London. Nothing here is a ruling. */
export const DEFAULT_CONFIG: WhimsyConfig = {
  lat: 51.5074,
  lon: -0.1278,
  label: "London",
  birthdate: "1995-06-15",
  events: [
    { id: "e1", label: "Birthday", date: "1995-06-15", recurring: true },
    { id: "e2", label: "New Year", date: "2026-01-01", recurring: true },
  ],
};

export const loadWhimsyConfig = (): WhimsyConfig => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<WhimsyConfig>;
    // Merge over the default so a stored config written by an older panel
    // shape can never leave a card reading `undefined`.
    return { ...DEFAULT_CONFIG, ...parsed, events: parsed.events ?? [] };
  } catch {
    return DEFAULT_CONFIG;
  }
};

export const saveWhimsyConfig = (c: WhimsyConfig): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* private mode / quota — dev tooling, so failing to persist is survivable */
  }
};

/**
 * Adversarial fixtures for the randomiser.
 *
 * Uniform-random coordinates almost never land anywhere interesting, and the
 * sky cards fail at the EXTREMES: above the arctic circle the sun does not rise
 * or set for part of the year, so sunrise/sunset are NaN and a naive day-length
 * line renders garbage. The equator has almost no seasonal swing; the date line
 * catches longitude sign errors. Stress testing should hit these on purpose.
 */
const PLACES: Array<{ label: string; lat: number; lon: number; why: string }> = [
  { label: "Longyearbyen", lat: 78.22, lon: 15.65, why: "polar night + midnight sun — no sunrise/sunset for weeks" },
  { label: "Tromsø", lat: 69.65, lon: 18.96, why: "just inside the arctic circle" },
  { label: "Reykjavík", lat: 64.15, lon: -21.94, why: "extreme day-length swing, never quite polar" },
  { label: "Quito", lat: -0.18, lon: -78.47, why: "equator — almost no seasonal variation" },
  { label: "Pontianak", lat: 0.0, lon: 109.33, why: "latitude exactly 0" },
  { label: "Ushuaia", lat: -54.8, lon: -68.3, why: "far south — seasons inverted" },
  { label: "Apia", lat: -13.83, lon: -171.77, why: "just east of the date line" },
  { label: "Suva", lat: -18.14, lon: 178.44, why: "just west of the date line" },
  { label: "McMurdo", lat: -77.85, lon: 166.67, why: "antarctic — the southern polar case" },
  { label: "Singapore", lat: 1.35, lon: 103.82, why: "equatorial, densely ordinary" },
  { label: "London", lat: 51.51, lon: -0.13, why: "the boring baseline" },
];

/** Dates that break things: leap day, the solstices, the equinoxes, year ends. */
const EDGE_DATES = [
  "2024-02-29", // leap day
  "2026-06-21", // summer solstice
  "2026-12-21", // winter solstice
  "2026-03-20", // vernal equinox
  "2026-09-22", // autumnal equinox
  "2026-01-01",
  "2026-12-31",
];

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

/**
 * A random fixture. Biased HARD toward the adversarial places above — a
 * uniformly random point on the globe is almost always dull ocean at a
 * temperate latitude, which is exactly the case that already works.
 */
export function randomWhimsyConfig(): WhimsyConfig {
  const uniform = Math.random() < 0.2;
  const place = uniform
    ? {
        label: "random point",
        lat: Math.round((Math.random() * 180 - 90) * 100) / 100,
        lon: Math.round((Math.random() * 360 - 180) * 100) / 100,
        why: "uniform random",
      }
    : pick(PLACES);

  const year = 1940 + Math.floor(Math.random() * 70);
  const month = 1 + Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * 28);
  const p = (n: number) => String(n).padStart(2, "0");
  const birthdate = `${year}-${p(month)}-${p(day)}`;

  const events: DatedEvent[] = [
    { id: "r1", label: "Birthday", date: birthdate, recurring: true },
    { id: "r2", label: pick(["Anniversary", "Moving day", "First session", "The big trip"]), date: pick(EDGE_DATES), recurring: Math.random() < 0.5 },
    { id: "r3", label: pick(["Deadline", "Launch", "Concert", "Exam"]), date: pick(EDGE_DATES), recurring: false },
  ];

  return { lat: place.lat, lon: place.lon, label: `${place.label} — ${place.why}`, birthdate, events };
}

export const PLACE_PRESETS = PLACES;
