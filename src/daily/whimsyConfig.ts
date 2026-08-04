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
import { pad2 } from "../metrics/clock";

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
  /** Drives the lifetime card and the horoscope sign. */
  birthdate: string | null;
  /**
   * The weather card's DISPLAY unit — the snapshot stores Celsius canonically
   * (network-tier fork A's rider, 2026-07-27). Defaults to °F because the
   * drawn face reads Fahrenheit; a real Settings row owns this at step 10.
   */
  tempUnit: "F" | "C";
  events: DatedEvent[];
  /**
   * Per-card visibility, keyed by the Settings → Whimsy roster: `sky` (sun ·
   * weather · season · tonight), `almanac` (fact · holiday · time progress),
   * `moon` · `tarot` · `horoscope` · `otd` · `quote` · `word`. An absent key
   * is ON — only an explicit `false` hides a card, so configs written before
   * the field existed change nothing.
   */
  cards?: Record<string, boolean>;
}

/** The one read the cards go through — absent key = on. */
export const cardOn = (cfg: WhimsyConfig, key: string): boolean => cfg.cards?.[key] !== false;

const KEY = "cibo.dev.whimsyConfig";

/** A neutral, unremarkable default: London. Nothing here is a ruling. */
export const DEFAULT_CONFIG: WhimsyConfig = {
  lat: 51.5074,
  lon: -0.1278,
  label: "London",
  birthdate: "1995-06-15",
  tempUnit: "F",
  events: [
    { id: "e1", label: "Birthday", date: "1995-06-15", recurring: true },
    { id: "e2", label: "New Year", date: "2026-01-01", recurring: true },
    { id: "e3", label: "Dentist", date: "2026-09-14", recurring: false },
    { id: "e4", label: "Passport renewal", date: "2027-02-03", recurring: false },
    { id: "e5", label: "Quarterly review with the whole department", date: "2026-10-01", recurring: true },
    { id: "e6", label: "Trip to Kyoto", date: "2026-11-22", recurring: false },
    { id: "e7", label: "Moved into the flat", date: "2019-04-08", recurring: false },
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
  const birthdate = `${year}-${pad2(month)}-${pad2(day)}`;

  return {
    lat: place.lat,
    lon: place.lon,
    label: `${place.label} — ${place.why}`,
    birthdate,
    tempUnit: Math.random() < 0.5 ? "F" : "C",
    events: randomEvents(birthdate),
  };
}

/**
 * Labels chosen to stress the layout, not to look tidy: the countdown card
 * ellipsises long names and collapses past its visible cap, and neither
 * behaviour shows up against three short words.
 */
const EVENT_LABELS = [
  "Birthday",
  "Anniversary",
  "Moving day",
  "Deadline",
  "Launch",
  "Concert",
  "Exam",
  "The big trip",
  "Dentist",
  "Passport renewal",
  "Quarterly review with the whole department",
  "Hades II — 1.0 release, finally, after all this time",
  "Trip to Kyoto",
  "Vet appointment",
  "Insurance renewal",
];

/** A spread of near, far, past and edge-case dates. */
const eventDate = (): string => {
  const now = new Date();
  const roll = Math.random();
  if (roll < 0.2) return pick(EDGE_DATES);
  // a past one-shot — these must DISAPPEAR from the chart, so generate them
  if (roll < 0.35) {
    const d = new Date(now.getTime() - (30 + Math.floor(Math.random() * 2000)) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const d = new Date(now.getTime() + (1 + Math.floor(Math.random() * 400)) * 86_400_000);
  return d.toISOString().slice(0, 10);
};

/**
 * A deliberately variable pile: 3–9 events, so a randomise run lands on the
 * roomy two-row form, the dense form and the "+N more" collapse across a few
 * presses rather than always the same shape.
 */
function randomEvents(birthdate: string): DatedEvent[] {
  const n = 3 + Math.floor(Math.random() * 7);
  const pool = [...EVENT_LABELS];
  const out: DatedEvent[] = [{ id: "r0", label: "Birthday", date: birthdate, recurring: true }];
  for (let i = 1; i < n; i++) {
    const label = pool.length > 0 ? pool.splice(Math.floor(Math.random() * pool.length), 1)[0] : `Event ${i}`;
    out.push({ id: `r${i}`, label, date: eventDate(), recurring: Math.random() < 0.4 });
  }
  return out;
}

export const PLACE_PRESETS = PLACES;
