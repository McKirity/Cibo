/**
 * The whimsy NETWORK TIER's IO half — the fetchers and the `Days.feed_snapshot`
 * persistence. The pure half (shapes, parsing, WMO vocabulary, curve geometry)
 * lives in `feedData.ts`.
 *
 * THE RULING ([[Calendar & Whimsy]] § Locking the ephemeral): snapshot-at-FETCH,
 * not at finalize — "when the app is open on day X and pulls X's horoscope, it
 * persists it immediately; the wall composes from the persisted copy. Days the
 * app never opened have no horoscope card — honest and unrecoverable by
 * design." Fetch on app open for the CURRENT day only, no background polling,
 * and whimsy fails SILENT — a dead feed hides the card; it never toasts, never
 * enters the recent-errors list, never lights the glance-dot.
 *
 * WHY `ensureTodayFeeds` COMPUTES ITS OWN DAY. Daily renders arbitrary days,
 * but the fetch moment only ever exists for today — a past day's snapshot is
 * whatever was captured then, and a future day is a dead route. Taking a day
 * parameter would invite exactly the back-fill the ruling forbids.
 *
 * THE FETCH PATH. `@tauri-apps/plugin-http`'s fetch executes RUST-SIDE — the
 * webview never talks to the network ([[Importer Runtime & External Access]]),
 * and the two hosts are explicit capability-allowlist entries
 * (`src-tauri/capabilities/default.json`), never a wildcard.
 *
 * SOURCES (network-tier forks A/B/C, user-ruled 2026-07-27):
 *  · weather — Open-Meteo (keyless; bare coordinates in, per the no-geocoding
 *    ruling). Values snapshot in CELSIUS canonically; the display unit is a
 *    view concern (`WhimsyConfig.tempUnit` until the real Settings row).
 *  · horoscope — the old plugin's keyless API, which moved:
 *    `horoscope-app-api.vercel.app` now 308-redirects to `freehoroscopeapi.com`
 *    (verified live 2026-07-27), so the new host is fetched directly. The
 *    response field renamed `horoscope_data` → `horoscope`; both are read.
 *  · tarot — LOCAL. The bundled deck draws and the draw is snapshotted; see
 *    `tarotDeck.ts` for why local satisfies the ephemerality ruling.
 */
import { evolu } from "../db/evolu";
import { DateOnly } from "../db/schema";
import { String as EvoluString } from "@evolu/common";
import { drawCard } from "./tarotDeck";
import { sunSign } from "./almanac";
import { parseFeedSnapshot, type FeedSnapshot, type HoroscopeSnap, type WeatherSnap } from "./feedData";
import type { WhimsyConfig } from "./whimsyConfig";

// ── The fetchers ─────────────────────────────────────────────────────────────

const todayLocal = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * The Rust-side fetch, resolved lazily: importing `@tauri-apps/plugin-http` at
 * module top would crash outside a Tauri runtime, and whimsy-fails-silent
 * means a missing runtime is just another silent absence.
 */
const rustFetch = async (url: string): Promise<unknown | null> => {
  try {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    const res = await tauriFetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
};

const fetchWeather = async (lat: number, lon: number): Promise<WeatherSnap | null> => {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    "&current=temperature_2m,weather_code" +
    "&hourly=temperature_2m" +
    "&daily=temperature_2m_max,temperature_2m_min" +
    "&forecast_days=2&timezone=auto";
  const json = (await rustFetch(url)) as {
    current?: { temperature_2m?: number; weather_code?: number };
    hourly?: { temperature_2m?: number[] };
    daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] };
  } | null;
  const temp = json?.current?.temperature_2m;
  const code = json?.current?.weather_code;
  const hourly = json?.hourly?.temperature_2m;
  const hi = json?.daily?.temperature_2m_max?.[0];
  const lo = json?.daily?.temperature_2m_min?.[0];
  if (
    typeof temp !== "number" ||
    typeof code !== "number" ||
    !Array.isArray(hourly) ||
    hourly.length < 25 ||
    typeof hi !== "number" ||
    typeof lo !== "number"
  ) {
    return null;
  }
  // 25 points: today's 24 local hours + tomorrow's midnight closes the 12a–12a axis.
  const hourlyC = hourly.slice(0, 25).map((v) => (typeof v === "number" && Number.isFinite(v) ? v : temp));
  return { tempC: temp, hiC: hi, loC: lo, code, hourlyC, hour: new Date().getHours() };
};

const fetchHoroscope = async (birthdate: string | null): Promise<HoroscopeSnap | null> => {
  const sign = sunSign(birthdate);
  if (sign == null) return null;
  const url =
    "https://freehoroscopeapi.com/api/v1/get-horoscope/daily" +
    `?sign=${encodeURIComponent(sign.name.toLowerCase())}&day=TODAY`;
  const json = (await rustFetch(url)) as {
    data?: { horoscope?: string; horoscope_data?: string };
  } | null;
  const text = json?.data?.horoscope ?? json?.data?.horoscope_data;
  if (typeof text !== "string" || text.trim() === "") return null;
  return { sign: sign.name, text: text.trim() };
};

// ── Snapshot persistence — read-merge-write on the sparse ledger ─────────────

const dayRowQuery = (day: string) =>
  evolu.createQuery((db) =>
    db
      .selectFrom("days")
      .select(["id", "feed_snapshot"])
      .where("isDeleted", "is not", 1)
      .where("date", "=", DateOnly.orThrow(day)),
  );

/**
 * Merge the additions into the day's snapshot and persist. The row is re-read
 * immediately before writing so two capture moments in one session compose
 * instead of clobbering. Silent on failure — the cards stay in their waiting
 * state.
 */
const writeSnapshot = async (day: string, additions: FeedSnapshot): Promise<void> => {
  try {
    const rows = await evolu.loadQuery(dayRowQuery(day));
    const row = rows[0] ?? null;
    const merged: FeedSnapshot = {
      ...parseFeedSnapshot(row?.feed_snapshot != null ? String(row.feed_snapshot) : null),
      ...additions,
    };
    const json = EvoluString.orThrow(JSON.stringify(merged));
    // Evolu mutations fail SILENTLY — check every Result (the 2026-07-23 lesson).
    const res = row
      ? evolu.update("days", { id: row.id as never, feed_snapshot: json })
      : // "A row exists once a day has bookkeeping — finalized OR a snapshot":
        // the snapshot alone legitimately births the row, unfinalized.
        evolu.insert("days", { date: DateOnly.orThrow(day), finalized: 0, feed_snapshot: json });
    if (!res.ok) console.warn("feeds: snapshot write failed", res.error);
  } catch (e) {
    console.warn("feeds: snapshot write failed", e);
  }
};

// ── The capture moment ───────────────────────────────────────────────────────

/** Failed network attempts retry no sooner than this (per card, per day). */
const RETRY_MS = 15 * 60_000;

const attempted = new Map<string, number>();
let inFlight: Promise<void> | null = null;

const shouldTry = (day: string, card: string, now: number): boolean => {
  const at = attempted.get(`${day}:${card}`);
  return at == null || now - at >= RETRY_MS;
};

/**
 * The tier's one entry point: capture today's ephemeral content if it is not
 * already captured. Called when Daily mounts (the launch screen, so this IS
 * fetch-on-app-open) — re-mounting is the natural retry, throttled above;
 * there is no polling.
 */
export const ensureTodayFeeds = async (config: WhimsyConfig): Promise<void> => {
  if (inFlight != null) return inFlight;
  const run = (async () => {
    const day = todayLocal();
    const now = Date.now();
    try {
      const rows = await evolu.loadQuery(dayRowQuery(day));
      const have = parseFeedSnapshot(
        rows[0]?.feed_snapshot != null ? String(rows[0].feed_snapshot) : null,
      );

      const additions: FeedSnapshot = {};

      // Tarot is local and infallible — the draw IS its fetch moment.
      if (have.tarot == null) additions.tarot = drawCard();

      if (have.weather == null && shouldTry(day, "weather", now)) {
        attempted.set(`${day}:weather`, now);
        const w = await fetchWeather(config.lat, config.lon);
        if (w != null) additions.weather = w;
      }

      if (have.horoscope == null && config.birthdate != null && shouldTry(day, "horoscope", now)) {
        attempted.set(`${day}:horoscope`, now);
        const h = await fetchHoroscope(config.birthdate);
        if (h != null) additions.horoscope = h;
      }

      if (Object.keys(additions).length > 0) await writeSnapshot(day, additions);
    } catch (e) {
      // Whimsy fails silent — log for the dev console, surface nothing.
      console.warn("feeds: capture failed", e);
    }
  })();
  inFlight = run.finally(() => {
    inFlight = null;
  });
  return inFlight;
};

/** Dev-panel affordance: wipe today's snapshot and re-arm the throttle. */
export const devClearTodayFeeds = async (): Promise<void> => {
  const day = todayLocal();
  attempted.clear();
  const rows = await evolu.loadQuery(dayRowQuery(day));
  const row = rows[0];
  if (row == null) return;
  const res = evolu.update("days", { id: row.id as never, feed_snapshot: null });
  if (!res.ok) console.warn("feeds: dev clear failed", res.error);
};
