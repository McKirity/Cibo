/**
 * The whimsy tier's inputs — location and the user's dated events.
 *
 * Settings → Whimsy is the live editor (step 10); first-run setup's steps 1–2
 * FILL it (step 15). Cards read `WhimsyConfig` and never learn where it came
 * from.
 *
 * SYNCED since step 15 (2026-08-06) — the move the 2026-07-05 tag always
 * called for ("same person, same birthday, same house on both machines"),
 * parked on this step at the completeness audit. STORAGE follows the
 * doctor-mutes lesson, never one big JSON row (`app_meta.value` caps at 1000
 * chars, and a long event list would hit it SILENTLY): one `whimsy_config`
 * row for the scalars + one `whimsy_event:<id>` row per dated event (the
 * `cs_preset:<id>` shape). Reads stay SYNCHRONOUS over a cache primed at the
 * boot gate (`initWhimsyConfig`, bootstrap.tsx — the settings/store.ts
 * pattern); the gate awaits the prime, so no consumer can mount before it.
 *
 * WRITES ARE DEBOUNCED (~500 ms): Settings → Whimsy writes on every
 * keystroke, and Evolu's history never compacts — an unbuffered mutation per
 * keystroke is store growth with no reader. The in-memory config updates
 * synchronously (read-your-writes); only the store flush coalesces. A quit
 * inside the window can lose the last keystrokes — the autosave buffer's
 * surfaced-and-taken trade, at a far smaller stake. `flushWhimsyConfig()` is
 * the flush-now door (first-run's Finish takes it).
 *
 * One-way migration: the per-device `cibo.dev.whimsyConfig` key (2026-08-04 →
 * 08-06 era) imports at first prime if the store carries no config row.
 *
 * Location is stored as coordinates outright — no place names, no geocoding
 * ([[Calendar & Whimsy]] § config).
 */
import { NonEmptyString100, NonEmptyString1000 } from "@evolu/common";
import { evolu } from "../db/evolu";
import { pad2 } from "../metrics/clock";
import { deviceGet } from "../settings/deviceStore";

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
   * drawn face reads Fahrenheit; Settings → Whimsy's Temperature row owns it.
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

/** The retired per-device key — read once by the migration, never written. */
const LEGACY_DEVICE_KEY = "cibo.dev.whimsyConfig";

const SCALARS_KEY = "whimsy_config";
const EVENT_PREFIX = "whimsy_event:";

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

// ── the synced store (cache + rows) ─────────────────────────────────────────

/** Last state read FROM the store (row ids ride alongside for the writes). */
let cached: WhimsyConfig | null = null;
let scalarRowId: string | null = null;
const eventRowIds = new Map<string, string>();
/** Unflushed local edits — authoritative over `cached` while they exist. */
let pending: WhimsyConfig | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const whimsyQuery = evolu.createQuery((db) =>
  db
    .selectFrom("app_meta")
    .select(["id", "key", "value"])
    .where("key", "like", "whimsy%" as never)
    .where("isDeleted", "is not", 1),
);

const readIntoCache = (
  rows: readonly { id: unknown; key: unknown; value: unknown }[],
): void => {
  let scalars: Partial<WhimsyConfig> | null = null;
  const events: DatedEvent[] = [];
  scalarRowId = null;
  eventRowIds.clear();
  for (const r of rows) {
    const k = String(r.key);
    try {
      if (k === SCALARS_KEY) {
        scalars = JSON.parse(String(r.value)) as Partial<WhimsyConfig>;
        scalarRowId = String(r.id);
      } else if (k.startsWith(EVENT_PREFIX)) {
        const ev = JSON.parse(String(r.value)) as Omit<DatedEvent, "id">;
        const id = k.slice(EVENT_PREFIX.length);
        events.push({ id, label: String(ev.label ?? ""), date: String(ev.date ?? ""), recurring: ev.recurring === true });
        eventRowIds.set(id, String(r.id));
      }
    } catch {
      // one bad row must not take the config down — skip it
    }
  }
  cached =
    scalars == null
      ? null
      : { ...DEFAULT_CONFIG, ...scalars, events };
};

/** True once a real config row exists — first-run prefills only then. */
export const hasStoredWhimsyConfig = (): boolean => pending != null || cached != null;

export const loadWhimsyConfig = (): WhimsyConfig => pending ?? cached ?? DEFAULT_CONFIG;

export const saveWhimsyConfig = (c: WhimsyConfig): void => {
  pending = c;
  if (flushTimer != null) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushWhimsyConfig, 500);
};

/** Guard the row caps: key ≤ 100, value ≤ 1000 — orThrow must never throw. */
const evJson = (ev: DatedEvent): string =>
  JSON.stringify({ label: ev.label.slice(0, 200), date: ev.date, recurring: ev.recurring });

/** Write-now (the debounce's flush; first-run's Finish calls it directly). */
export const flushWhimsyConfig = (): void => {
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const c = pending;
  if (c == null) return;
  pending = null;

  // Scalars — one row, update-or-insert (the settings/store.ts shape).
  const scalars = JSON.stringify({
    lat: c.lat, lon: c.lon, label: c.label.slice(0, 200), birthdate: c.birthdate,
    tempUnit: c.tempUnit, cards: c.cards,
  });
  const sres = scalarRowId != null
    ? evolu.update("app_meta", { id: scalarRowId as never, value: NonEmptyString1000.orThrow(scalars) })
    : evolu.insert("app_meta", { key: NonEmptyString100.orThrow(SCALARS_KEY), value: NonEmptyString1000.orThrow(scalars) });
  if (!sres.ok) console.error("whimsy: config write failed", sres.error);
  else if (scalarRowId == null) scalarRowId = String((sres.value as { id: unknown }).id);

  // Events — one row each, diffed against the known rows.
  const live = new Set<string>();
  for (const ev of c.events) {
    live.add(ev.id);
    const rowId = eventRowIds.get(ev.id);
    const res = rowId != null
      ? evolu.update("app_meta", { id: rowId as never, value: NonEmptyString1000.orThrow(evJson(ev)) })
      : evolu.insert("app_meta", {
          key: NonEmptyString100.orThrow(`${EVENT_PREFIX}${ev.id}`.slice(0, 100)),
          value: NonEmptyString1000.orThrow(evJson(ev)),
        });
    if (!res.ok) console.error(`whimsy: event "${ev.id}" write failed`, res.error);
    else if (rowId == null) eventRowIds.set(ev.id, String((res.value as { id: unknown }).id));
  }
  for (const [id, rowId] of eventRowIds) {
    if (live.has(id)) continue;
    const res = evolu.update("app_meta", { id: rowId as never, isDeleted: 1 });
    if (!res.ok) console.error(`whimsy: event "${id}" delete failed`, res.error);
    else eventRowIds.delete(id);
  }
  cached = c;
};

/**
 * Boot wiring — prime the cache, run the one-way device-file migration, and
 * keep the cache following the store. The boot gate AWAITS this before any
 * consumer can mount, which is what keeps `loadWhimsyConfig` honestly sync.
 */
export async function initWhimsyConfig(): Promise<void> {
  try {
    readIntoCache(await evolu.loadQuery(whimsyQuery));
  } catch (e) {
    console.error("whimsy: cache prime failed", e);
  }
  // Migration: a device-file config from the 2026-08-04 era, no synced rows yet.
  if (cached == null) {
    try {
      const raw = deviceGet(LEGACY_DEVICE_KEY);
      if (raw != null && raw !== "") {
        const parsed = JSON.parse(raw) as Partial<WhimsyConfig>;
        pending = { ...DEFAULT_CONFIG, ...parsed, events: parsed.events ?? [] };
        flushWhimsyConfig();
      }
    } catch (e) {
      console.error("whimsy: device-file migration failed", e);
    }
  }
  // Any store change re-pulls (a handful of tiny rows — the store.ts doctrine).
  evolu.subscribeQuery(whimsyQuery)(() => {
    evolu.loadQuery(whimsyQuery).then(readIntoCache, () => undefined);
  });
}

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
