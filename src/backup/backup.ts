/**
 * BACKUPS (Build step 12) — the TS orchestrator over src-tauri/backup.rs's
 * file primitives. Owning record: [[Backups & Export]] (as amended 2026-07-09
 * by the spike and 2026-07-21 by the growth spike). The rules enforced here:
 *
 * · TRIGGER — every clean close (closeGuard) + a ~7-day stale-check at launch.
 *   No scheduler: opening and closing the app IS the schedule.
 * · SLOT — one per calendar day (`YYYY-MM-DD-*`); a later close overwrites.
 * · ARTIFACTS — three, compressed, on INDEPENDENT retentions:
 *     JSON+CSV bundle  every slot, forever
 *     .db export       monthly keepers + last 30 dailies
 *     store copy       all dailies + all monthly keepers (= restore horizon)
 * · VERIFY — pinned ordering: verify UNCOMPRESSED (PRAGMA integrity_check ·
 *   JSON parse-back with row counts) → compress → RE-OPEN the archive.
 * · PROMOTE — temp-write into `.tmp/` then rename into the slot: a failed
 *   backup can never clobber the previous good one.
 * · RETENTION — dailies ~90 days; each month's last daily is promoted to the
 *   monthly keeper (`YYYY-MM-*`) rather than deleted; rotation works by
 *   FILENAME ONLY, never opening old files (the iCloud-eviction rule). The
 *   .db thinning spares each month's keeper-designate (the month's last
 *   daily), so a promoted keeper still carries its .db — the implementation
 *   choice that honours both retention clauses at once.
 *
 * The BACKUPS ROOT is `<cloud root>/backups/`; the cloud root itself is
 * step 14's picker, so until then the root is a dev-hosted stand-in on the
 * themes-root doctrine (the per-device settings file; the real source
 * replaces this, nothing else). Unset root = backups PAUSE + the health nag —
 * never a gate.
 */
import { invoke } from "@tauri-apps/api/core";
import { evolu } from "../db/evolu";
import { todayLocal } from "../metrics/clock";
import { showErrorToast } from "../shell/toast";
import { readAllTables, toCanonicalJson, toCsv, TABLES } from "./exporter";
import { deviceGet, deviceSet, inTauri } from "../settings/deviceStore";

// inTauri is imported from settings/deviceStore (the one declaration; it lives
// there because the boot shim needs a dependency-free module). Was a local copy.

// ── the root (step-14 stand-in) ──────────────────────────────────────────────

export const BACKUPS_ROOT_KEY = "cibo.dev.backupsRoot";

export const getBackupsRoot = (): string | null => deviceGet(BACKUPS_ROOT_KEY);
export const setBackupsRoot = (path: string | null): void => {
  deviceSet(BACKUPS_ROOT_KEY, path);
  emitRecord();
};

// ── the record (what health + the stale-check read) ──────────────────────────

export interface BackupRecord {
  at: string; // ISO
  slot: string;
  ok: boolean;
  error?: string;
  reason: BackupReason;
}
export type BackupReason = "close" | "manual" | "stale";

const RECORD_KEY = "cibo.backupRecord";
export const BACKUP_EVENT = "cibo:backup-record";

export const readBackupRecord = (): BackupRecord | null => {
  try {
    const raw = deviceGet(RECORD_KEY);
    return raw == null ? null : (JSON.parse(raw) as BackupRecord);
  } catch {
    return null;
  }
};
const writeRecord = (r: BackupRecord): void => {
  deviceSet(RECORD_KEY, JSON.stringify(r));
  emitRecord();
};
const emitRecord = (): void => {
  try {
    window.dispatchEvent(new CustomEvent(BACKUP_EVENT));
  } catch {
    /* non-DOM context */
  }
};

// ── names ────────────────────────────────────────────────────────────────────

const DAILY = /^(\d{4}-\d{2}-\d{2})(\.db\.zst|-export\.tar\.zst|-store\.tar\.zst)$/;
const MONTHLY = /^(\d{4}-\d{2})(\.db\.zst|-export\.tar\.zst|-store\.tar\.zst)$/;

const dbName = (id: string) => `${id}.db.zst`;
const exportName = (id: string) => `${id}-export.tar.zst`;
/** EXPORTED so restore.ts resolves the same filename this writes. It used to
 *  hand-build the string, which meant a rename here would have silently broken
 *  restore — the one path where a mismatch is unrecoverable. */
export const storeName = (id: string) => `${id}-store.tar.zst`;

export interface Slot {
  id: string; // YYYY-MM-DD or YYYY-MM
  monthly: boolean;
  hasStore: boolean;
  hasDb: boolean;
  hasExport: boolean;
}

/** Parse a directory listing into slots (filename-only, per the rotation rule). */
export function parseSlots(names: string[]): Slot[] {
  const map = new Map<string, Slot>();
  for (const n of names) {
    const m = n.match(DAILY) ?? n.match(MONTHLY);
    if (m == null) continue;
    const id = m[1];
    const monthly = m[1].length === 7;
    const s = map.get(id) ?? { id, monthly, hasStore: false, hasDb: false, hasExport: false };
    if (m[2] === "-store.tar.zst") s.hasStore = true;
    else if (m[2] === "-export.tar.zst") s.hasExport = true;
    else s.hasDb = true;
    map.set(id, s);
  }
  return [...map.values()].sort((a, b) => b.id.localeCompare(a.id));
}

export const listSlots = async (): Promise<Slot[]> => {
  const root = getBackupsRoot();
  if (root == null || !inTauri()) return [];
  const names = await invoke<string[]>("bk_list", { dir: root });
  return parseSlots(names);
};

// ── the pipeline ─────────────────────────────────────────────────────────────

const sep = (root: string): string => (root.includes("/") && !root.includes("\\") ? "/" : "\\");
/** EXPORTED with `storeName` — restore.ts must assemble paths identically. */
export const join = (root: string, name: string): string => `${root}${sep(root)}${name}`;

let running: Promise<BackupRecord> | null = null;

/** The one pipeline — close, Back up now, and the stale-check all run this. */
export function runBackup(reason: BackupReason): Promise<BackupRecord> {
  if (running != null) return running;
  running = doBackup(reason).finally(() => {
    running = null;
    // The completion tick. The record's own emit fires while `running` is
    // still set, so a listener that re-reads busy-state there sees "backing
    // up…" forever (found live 2026-08-03: Health's row only updated after a
    // remount). One more emit AFTER the flag clears closes the loop.
    emitRecord();
  });
  return running;
}

export const backupRunning = (): boolean => running != null;

async function doBackup(reason: BackupReason): Promise<BackupRecord> {
  const slot = todayLocal();
  const finish = (r: BackupRecord): BackupRecord => {
    writeRecord(r);
    // Tier 3 — a background failure's toast + the standing record in one call
    // (showErrorToast logs to the health list, which lights the rail dot). On
    // a close-time failure the toast goes unseen; the log is what survives.
    if (!r.ok) showErrorToast(`Backup failed — ${r.error ?? "unknown"}`, "Backups");
    return r;
  };
  const root = getBackupsRoot();
  if (root == null)
    return finish({ at: new Date().toISOString(), slot, ok: false, reason, error: "no backups folder set — backups are paused" });
  if (!inTauri())
    return finish({ at: new Date().toISOString(), slot, ok: false, reason, error: "backups need the app shell (not the browser dev server)" });

  try {
    const tmp = join(root, ".tmp");
    await invoke("bk_mkdirs", { dir: tmp });
    // Sweep a died-mid-run attempt's leftovers — a stranded stage is disk
    // spent on nothing, and promote-last means it was never load-bearing.
    for (const n of await invoke<string[]>("bk_list", { dir: tmp })) {
      await invoke("bk_remove", { path: join(tmp, n) });
    }

    // 1 · the plain-readable export — build, VERIFY UNCOMPRESSED (parse-back +
    // row counts against the just-read tables), bundle, re-open.
    const tables = await readAllTables();
    const exportedAt = new Date().toISOString();
    const json = toCanonicalJson(tables, exportedAt);
    const parsed = JSON.parse(json) as { tables: Record<string, unknown[]> };
    for (const t of TABLES) {
      if ((parsed.tables[t] ?? []).length !== tables[t].length)
        throw new Error(`export verify: ${t} row count mismatch`);
    }
    const exportTmp = join(tmp, exportName(slot));
    await invoke("bk_bundle_texts", {
      dest: exportTmp,
      files: [
        { name: `${slot}.json`, content: json },
        { name: `${slot}-sessions.csv`, content: toCsv(tables.sessions) },
        { name: `${slot}-entries.csv`, content: toCsv(tables.entries) },
      ],
    });
    await invoke("bk_verify_archive", { path: exportTmp });

    // 2 · the portable .db — exportDatabase() bytes → integrity_check
    // (uncompressed) → compress → re-open.
    const bytes = await evolu.exportDatabase();
    const dbRaw = await invoke<string>("bk_write_db", bytes);
    await invoke("bk_db_integrity", { path: dbRaw });
    const dbTmp = join(tmp, dbName(slot));
    await invoke("bk_compress_file", { src: dbRaw, dest: dbTmp });
    await invoke("bk_verify_archive", { path: dbTmp });

    // 3 · the store-directory copy — the only artifact that restores.
    const storePath = await invoke<string>("bk_store_path");
    const storeTmp = join(tmp, storeName(slot));
    await invoke("bk_tar_dir", { srcDir: storePath, dest: storeTmp });
    await invoke("bk_verify_archive", { path: storeTmp });

    // 4 · promote — verified artifacts rename into the day's slot (the last
    // close of the day wins; a failure above leaves yesterday's slot whole).
    await invoke("bk_promote", { from: exportTmp, to: join(root, exportName(slot)) });
    await invoke("bk_promote", { from: dbTmp, to: join(root, dbName(slot)) });
    await invoke("bk_promote", { from: storeTmp, to: join(root, storeName(slot)) });

    // 5 · rotation — by filename only; the newest slot is exempt by ruling.
    await prune(root, slot);

    return finish({ at: new Date().toISOString(), slot, ok: true, reason });
  } catch (e) {
    return finish({
      at: new Date().toISOString(),
      slot,
      ok: false,
      reason,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

// ── retention ────────────────────────────────────────────────────────────────

const DAILY_KEEP_DAYS = 90; // dials, not architecture ([[Backups & Export]])
const DB_KEEP_DAILIES = 30;

const dayMs = 86_400_000;
const cutoffDate = (today: string): string =>
  new Date(new Date(`${today}T00:00:00`).getTime() - DAILY_KEEP_DAYS * dayMs)
    .toISOString()
    .slice(0, 10);

async function prune(root: string, today: string): Promise<void> {
  const names = await invoke<string[]>("bk_list", { dir: root });
  const slots = parseSlots(names);
  const dailies = slots.filter((s) => !s.monthly);
  const keeperMonths = new Set(slots.filter((s) => s.monthly).map((s) => s.id));
  const cutoff = cutoffDate(today);

  // The keeper-designate: each month's LAST daily (also spared .db thinning).
  const lastOfMonth = new Map<string, string>();
  for (const s of dailies) {
    const m = s.id.slice(0, 7);
    const cur = lastOfMonth.get(m);
    if (cur == null || s.id > cur) lastOfMonth.set(m, s.id);
  }

  // Months whose every daily has expired: promote the last daily to the
  // monthly keeper (rename, never open); months with a keeper already just
  // shed their expired dailies.
  const monthsFullyExpired = new Set<string>();
  for (const [m, last] of lastOfMonth) {
    if (last < cutoff) monthsFullyExpired.add(m);
  }

  for (const s of dailies) {
    if (s.id === today || s.id >= cutoff) continue; // fresh slot exempt
    const m = s.id.slice(0, 7);
    const isKeeperDesignate =
      monthsFullyExpired.has(m) && !keeperMonths.has(m) && lastOfMonth.get(m) === s.id;
    if (isKeeperDesignate) {
      if (s.hasExport)
        await invoke("bk_promote", { from: join(root, exportName(s.id)), to: join(root, exportName(m)) });
      if (s.hasDb)
        await invoke("bk_promote", { from: join(root, dbName(s.id)), to: join(root, dbName(m)) });
      if (s.hasStore)
        await invoke("bk_promote", { from: join(root, storeName(s.id)), to: join(root, storeName(m)) });
      keeperMonths.add(m);
    } else {
      // JSON/CSV is "every slot, forever" — the expired daily's export stays.
      if (s.hasDb) await invoke("bk_remove", { path: join(root, dbName(s.id)) });
      if (s.hasStore) await invoke("bk_remove", { path: join(root, storeName(s.id)) });
    }
  }

  // .db thinning: last 30 dailies keep theirs; older dailies shed it unless
  // they are their month's keeper-designate.
  const surviving = (await invoke<string[]>("bk_list", { dir: root })).slice();
  const after = parseSlots(surviving).filter((s) => !s.monthly);
  after.sort((a, b) => b.id.localeCompare(a.id));
  for (let i = DB_KEEP_DAILIES; i < after.length; i++) {
    const s = after[i];
    if (!s.hasDb) continue;
    if (lastOfMonth.get(s.id.slice(0, 7)) === s.id) continue; // keeper-designate
    await invoke("bk_remove", { path: join(root, dbName(s.id)) });
  }
}

// ── the launch stale-check ───────────────────────────────────────────────────

const STALE_DAYS = 7;

/**
 * Crashes never fire the close hook, so a launch whose last GOOD backup is
 * older than ~7 days backs up on open instead. Deferred a few seconds — the
 * cold-open budget belongs to Daily, not to compression.
 */
export function launchStaleCheck(): void {
  if (!inTauri() || getBackupsRoot() == null) return;
  const rec = readBackupRecord();
  const lastGood = rec != null && rec.ok ? new Date(rec.at).getTime() : 0;
  if (Date.now() - lastGood < STALE_DAYS * dayMs) return;
  window.setTimeout(() => {
    void runBackup("stale");
  }, 5_000);
}

// ── misc doors ───────────────────────────────────────────────────────────────

export const revealBackupsFolder = async (): Promise<void> => {
  const root = getBackupsRoot();
  if (root != null && inTauri()) await invoke("bk_reveal", { path: root });
};
