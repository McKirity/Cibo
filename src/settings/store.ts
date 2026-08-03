/**
 * SYNCED settings — the `app_meta` tier (Build step 10, slice 1).
 *
 * One row per setting, key → value-as-string, exactly the autosave interval's
 * shape (src/daily/autosave.ts — the precedent this module generalizes; that
 * key stays where it was born, this module only ADDS keys). Synced because
 * these are PREFERENCES ([[Sync & Per-Device Settings]] — preferences travel;
 * appearance levers and machine facts stay in settings/local.ts).
 *
 * TWO READ PATHS, deliberately:
 *  - `useSyncedSettings()` — the live query, for the Settings panes (they
 *    need row ids to write against).
 *  - the module CACHE (`waveGapDefault()` · `dashboardListCap()` ·
 *    `dayCutoffHour()`) — synchronous getters for the assembly hooks
 *    (useCadenceData · useEntryData · useMilestoneDay) whose spec layers are
 *    pure and take inputs, not subscriptions. The cache is subscribed once at
 *    launch (`initSyncedSettings`, main.tsx). Staleness window: a dashboard
 *    reads the cache at MOUNT, and every navigation re-mounts (the shell keys
 *    per view), so a changed setting is live from the next navigation — the
 *    same freshness the localStorage stand-ins already have.
 *
 * Consumers NOT yet wired (slice 1, recorded honestly): `week_start` and
 * `quarter_scheme` persist but nothing reads them — the aggregation layer is
 * built Monday/calendar throughout ([[Aggregation & Metrics Engine]] defaults)
 * and re-threading period boundaries is its own pass. The controls write real
 * rows so that pass changes readers, not storage.
 */
import { NonEmptyString100, NonEmptyString1000 } from "@evolu/common";
import { evolu } from "../db/evolu";

// ── keys · defaults · clamps ─────────────────────────────────────────────────

export const WEEK_START_KEY = "week_start"; // "monday" | "sunday"
export const QUARTER_SCHEME_KEY = "quarter_scheme"; // "calendar" (the only ruled scheme)
export const DAY_CUTOFF_KEY = "day_cutoff_hours"; // whole hours past midnight, 0–12
export const WAVE_GAP_KEY = "wave_gap_default_days"; // the global wave-gap default
export const LIST_CAP_KEY = "dashboard_list_cap"; // cadence expansion "+ N more" cap

export const WEEK_START_DEFAULT = "monday";
export const QUARTER_SCHEME_DEFAULT = "calendar";
export const DAY_CUTOFF_DEFAULT = 0; // midnight — [[Day Boundary & Logging Cutoff]]
export const WAVE_GAP_DEFAULT = 30; // days — [[Aggregation & Metrics Engine]]
export const LIST_CAP_DEFAULT = 10; // user-ruled 2026-07-23 ("Go with 10, make adjustable")

const SETTING_KEYS = [
  WEEK_START_KEY,
  QUARTER_SCHEME_KEY,
  DAY_CUTOFF_KEY,
  WAVE_GAP_KEY,
  LIST_CAP_KEY,
] as const;

const clampInt = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
};

export const clampDayCutoff = (h: number): number => clampInt(h, 0, 12, DAY_CUTOFF_DEFAULT);
export const clampWaveGap = (d: number): number => clampInt(d, 2, 365, WAVE_GAP_DEFAULT);
export const clampListCap = (n: number): number => clampInt(n, 3, 50, LIST_CAP_DEFAULT);

// ── the live query (Settings panes) ──────────────────────────────────────────

/** All settings rows in one query — the panes read it, writers need the ids. */
export const syncedSettingsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("app_meta")
    .select(["id", "key", "value"])
    .where("key", "in", SETTING_KEYS as unknown as never)
    .where("isDeleted", "is not", 1),
);

export interface SettingRow {
  id: string;
  key: string;
  value: string;
}

/**
 * Write a setting. Update-or-insert against the loaded rows — and CHECK the
 * Result: Evolu mutations fail silently (the 2026-07-23 lesson).
 */
export const writeSyncedSetting = (
  rows: readonly { id: unknown; key: unknown }[],
  key: string,
  value: string,
): boolean => {
  const existing = rows.find((r) => String(r.key) === key);
  const res = existing
    ? evolu.update("app_meta", {
        id: existing.id as never,
        value: NonEmptyString1000.orThrow(value),
      })
    : evolu.insert("app_meta", {
        key: NonEmptyString100.orThrow(key),
        value: NonEmptyString1000.orThrow(value),
      });
  if (!res.ok) console.error(`settings: writing ${key} failed`, res.error);
  return res.ok;
};

// ── the module cache (assembly-hook readers) ─────────────────────────────────

const cache = new Map<string, string>();
let cacheReady = false;

const readIntoCache = (rows: readonly { key: unknown; value: unknown }[]): void => {
  cache.clear();
  for (const r of rows) cache.set(String(r.key), String(r.value));
  cacheReady = true;
};

/** Launch wiring (main.tsx): prime the cache and keep it following the store. */
export function initSyncedSettings(): void {
  const pull = () => {
    evolu.loadQuery(syncedSettingsQuery).then(readIntoCache, (e) => {
      console.error("settings: cache load failed", e);
    });
  };
  pull();
  // Evolu's subscribe fires on any store change; re-pulling five tiny rows is
  // cheap and keeps this free of per-table bookkeeping.
  evolu.subscribeQuery(syncedSettingsQuery)(() => pull());
}

export const settingsCacheReady = (): boolean => cacheReady;
export const weekStart = (): "monday" | "sunday" =>
  cache.get(WEEK_START_KEY) === "sunday" ? "sunday" : "monday";
export const dayCutoffHour = (): number =>
  clampDayCutoff(Number(cache.get(DAY_CUTOFF_KEY) ?? DAY_CUTOFF_DEFAULT));
export const waveGapDefault = (): number =>
  clampWaveGap(Number(cache.get(WAVE_GAP_KEY) ?? WAVE_GAP_DEFAULT));
export const dashboardListCap = (): number =>
  clampListCap(Number(cache.get(LIST_CAP_KEY) ?? LIST_CAP_DEFAULT));

// ── the day-cutoff consumer ──────────────────────────────────────────────────

/**
 * The cutoff "sets logging DEFAULTS only" ([[Day Boundary & Logging Cutoff]] —
 * one global rule, local wall-clock, never retroactive): before the cutoff
 * hour, the day the app opens to for logging is still YESTERDAY. Consumers:
 * the shell's home target (launch + Ctrl+Home). Every explicit door — the
 * calendar, catch-up, back-dating — always wins; nothing else moves.
 */
export const defaultLogDay = (now: Date = new Date()): string => {
  const d = new Date(now);
  if (d.getHours() < dayCutoffHour()) d.setDate(d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
