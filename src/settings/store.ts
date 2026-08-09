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
 *    `dayCutoffHour()` · `backupDailyDays()`) — synchronous getters for the
 *    assembly hooks (useCadenceData · useEntryData · useMilestoneDay) whose
 *    spec layers are pure and take inputs, not subscriptions, plus the backup
 *    pipeline's retention read (backup/backup.ts). The cache is subscribed once at
 *    launch (`initSyncedSettings`, main.tsx). Staleness window: a dashboard
 *    reads the cache at MOUNT, and every navigation re-mounts (the shell keys
 *    per view), so a changed setting is live from the next navigation (the
 *    freshness doctrine the per-device file also follows).
 *
 * `week_start` IS WIRED (2026-08-04, the completeness audit's re-thread pass):
 * the cache pushes it into metrics/dates' week-start dial, which every week
 * boundary, calendar grid and week label reads. `quarter_scheme` was STRUCK
 * the same day, user-ruled ("We can strike quarters") — quarters are calendar,
 * fixed; the control is gone and any old synced row is simply unread.
 */
import { NonEmptyString100, NonEmptyString1000 } from "@evolu/common";
import { evolu } from "../db/evolu";
import { setWeekStartDow } from "../metrics/dates";

import { pad2 } from "../metrics/clock";
// ── keys · defaults · clamps ─────────────────────────────────────────────────

export const WEEK_START_KEY = "week_start"; // "monday" | "sunday"
export const DAY_CUTOFF_KEY = "day_cutoff_hours"; // whole hours past midnight, 0–12
export const WAVE_GAP_KEY = "wave_gap_default_days"; // the global wave-gap default
export const LIST_CAP_KEY = "dashboard_list_cap"; // cadence expansion "+ N more" cap
export const BACKUP_DAILY_DAYS_KEY = "backup_daily_days"; // the daily-backup retention window

export const WEEK_START_DEFAULT = "monday" as const;
export const DAY_CUTOFF_DEFAULT = 0; // midnight — [[Day Boundary & Logging Cutoff]]
export const WAVE_GAP_DEFAULT = 30; // days — [[Aggregation & Metrics Engine]]
export const LIST_CAP_DEFAULT = 10; // user-ruled 2026-07-23 ("Go with 10, make adjustable")
export const BACKUP_DAILY_DAYS_DEFAULT = 90; // "dials, not architecture" — [[Backups & Export]]

const SETTING_KEYS = [
  WEEK_START_KEY,
  DAY_CUTOFF_KEY,
  WAVE_GAP_KEY,
  LIST_CAP_KEY,
  BACKUP_DAILY_DAYS_KEY,
] as const;

/**
 * A stored setting → a usable number. OUT OF RANGE and UNREADABLE resolve
 * differently on purpose: an out-of-range value is something the user meant, so
 * it clamps to the nearer bound; an unreadable one falls back to the default.
 *
 * **A BLANK VALUE COUNTS AS UNREADABLE, NOT AS ZERO** (user-ruled 2026-08-08).
 * `Number("")` is 0, which is finite, so a blank row used to clamp to the LOWER
 * BOUND — a wave gap of 2 days where 30 was meant, a list cap of 3 where 10 was.
 * The app cannot write one (the column is branded non-empty), so this arrives
 * only by sync or corruption; the symptom is a plausible-looking wrong number
 * with nothing to point at. Third time this project has paid for `Number("")`
 * being 0 (`creator-2`, `seed-1`) — see also `clampInterval` in daily/autosave.ts,
 * which carries the same rule for the auto-save interval.
 */
const clampInt = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n =
    typeof v === "string" ? (v.trim() === "" ? NaN : Number(v)) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
};

/**
 * 0–12, whole hours past midnight — a cutoff past noon would hand more than
 * half the day to yesterday.
 *
 * *(Raised to 24 for a few minutes on 2026-08-09 and restored the same sitting:
 * the rule fires only while the current hour is below the cutoff, so at this
 * bound it can only be walked before noon. Noted because the constraint is
 * permanent — whoever walks the day-cutoff probe again needs a MORNING, or this
 * same temporary raise.)*
 */
export const clampDayCutoff = (h: number): number => clampInt(h, 0, 12, DAY_CUTOFF_DEFAULT);
export const clampWaveGap = (d: number): number => clampInt(d, 2, 365, WAVE_GAP_DEFAULT);
export const clampListCap = (n: number): number => clampInt(n, 3, 50, LIST_CAP_DEFAULT);
export const clampBackupDailyDays = (d: number): number =>
  clampInt(d, 7, 365, BACKUP_DAILY_DAYS_DEFAULT);

// ── the live query (Settings panes) ──────────────────────────────────────────

/** All settings rows in one query — the panes read it, writers need the ids. */
export const syncedSettingsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("app_meta")
    .select(["id", "key", "value"])
    .where("key", "in", SETTING_KEYS as unknown as never)
    .where("isDeleted", "is not", 1),
);

// `SettingRow` was DELETED 2026-08-04 — no consumer; panes read rows straight
// off `useQuery(syncedSettingsQuery)`.

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

const readIntoCache = (rows: readonly { key: unknown; value: unknown }[]): void => {
  cache.clear();
  for (const r of rows) cache.set(String(r.key), String(r.value));
  // Push the week-start dial down into the metrics layer (dates.ts) — the one
  // setting whose readers are pure helpers, not cache-calling hooks.
  setWeekStartDow(weekStart() === "sunday" ? 0 : 1);
};

/** Launch wiring (main.tsx): prime the cache and keep it following the store. */
export function initSyncedSettings(): void {
  const pull = () => {
    evolu.loadQuery(syncedSettingsQuery).then(readIntoCache, (e) => {
      console.error("settings: cache load failed", e);
    });
  };
  pull();
  // Evolu's subscribe fires on any store change; re-pulling a handful of tiny
  // rows is cheap and keeps this free of per-table bookkeeping.
  evolu.subscribeQuery(syncedSettingsQuery)(() => pull());
}

// `settingsCacheReady` + its `cacheReady` flag were DELETED 2026-08-04: nothing
// ever polled the getter, and the flag had no other reader.
export const weekStart = (): "monday" | "sunday" =>
  cache.get(WEEK_START_KEY) === "sunday" ? "sunday" : WEEK_START_DEFAULT;
export const dayCutoffHour = (): number =>
  clampDayCutoff(Number(cache.get(DAY_CUTOFF_KEY) ?? DAY_CUTOFF_DEFAULT));
export const waveGapDefault = (): number =>
  clampWaveGap(Number(cache.get(WAVE_GAP_KEY) ?? WAVE_GAP_DEFAULT));
export const dashboardListCap = (): number =>
  clampListCap(Number(cache.get(LIST_CAP_KEY) ?? LIST_CAP_DEFAULT));
export const backupDailyDays = (): number =>
  clampBackupDailyDays(Number(cache.get(BACKUP_DAILY_DAYS_KEY) ?? BACKUP_DAILY_DAYS_DEFAULT));

// ── the day-cutoff consumer ──────────────────────────────────────────────────

/**
 * The cutoff "sets logging DEFAULTS only" ([[Day Boundary & Logging Cutoff]] —
 * one global rule, local wall-clock, never retroactive): before the cutoff
 * hour, the day the app opens to for logging is still YESTERDAY. Consumers:
 * the shell's home target (launch + Ctrl+H). Every explicit door — the
 * calendar, catch-up, back-dating — always wins; nothing else moves.
 */
export const defaultLogDay = (now: Date = new Date()): string => {
  const d = new Date(now);
  if (d.getHours() < dayCutoffHour()) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
