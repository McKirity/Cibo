/**
 * THROWAWAY — the Evolu store-growth spike (Longevity & Future-Proofing, Tier 1).
 *
 * Answers two things the design cannot predict, and which decide whether Cibo can
 * run for 10–15 years without degrading:
 *
 *  1. **Latency at volume** — does a dashboard still fetch + derive inside the
 *     <100 ms budget at ~15-year scale (≈3× the dominant session volume)?
 *  2. **Growth under churn** — Evolu is a CRDT store and "delete" is a soft
 *     `isDeleted` row, so history + tombstones accumulate. Re-running the rich
 *     seeder clears (soft-deletes everything) then re-inserts, which is exactly
 *     the churn a decade of real edits produces. Does the store keep growing, or
 *     does Evolu compact?
 *
 * The read: if `exportBytes` and `tombstoned` climb on every reseed and never
 * drop, Evolu is not compacting → the longevity concern is real and the
 * alternatives roster earns its keep. If they plateau, we can stop worrying.
 *
 * DELETE this file, its dev panel, and `seedRich`'s `spanYears` param once the
 * question is answered and the findings are recorded.
 */
import { NonEmptyString100 } from "@evolu/common";
import { evolu } from "./evolu";
import { stringListFromJson, type HabitId } from "./schema";
import {
  best,
  dayMinutes,
  distinctDays,
  distribute,
  heatmapCells,
  leaderboard,
  playedDaySet,
  streaks,
  total,
  type EntryRow,
  type SessionRow,
} from "../metrics/shapes";

// ── Store size + tombstone census ─────────────────────────────────────────────

/** Every table that accumulates rows. `habits`/`subunit_definitions` are seeded
 *  once and included only so the census is complete. */
const TABLES = [
  "sessions",
  "subunit_values",
  "entries",
  "days",
  "vocab_options",
  "subunit_definitions",
  "habits",
] as const;

export interface TableCensus {
  table: string;
  live: number;
  total: number;
  tombstoned: number;
}

export interface StoreMeasurement {
  /** Size of `exportDatabase()`'s SQLite bytes — the portable-data proxy. */
  exportBytes: number;
  tables: TableCensus[];
  totalRows: number;
  totalTombstones: number;
}

export async function measureStore(): Promise<StoreMeasurement> {
  const tables: TableCensus[] = [];
  let totalRows = 0;
  let totalTombstones = 0;

  for (const table of TABLES) {
    // No isDeleted filter = every row, tombstones included.
    const all = await evolu.loadQuery(
      evolu.createQuery((db) => db.selectFrom(table).select(["id"])),
    );
    const live = await evolu.loadQuery(
      evolu.createQuery((db) =>
        db.selectFrom(table).select(["id"]).where("isDeleted", "is not", 1),
      ),
    );
    const tombstoned = all.length - live.length;
    tables.push({ table, live: live.length, total: all.length, tombstoned });
    totalRows += all.length;
    totalTombstones += tombstoned;
  }

  const exported = (await evolu.exportDatabase()) as unknown;
  const exportBytes =
    exported instanceof Uint8Array
      ? exported.byteLength
      : exported instanceof ArrayBuffer
        ? exported.byteLength
        : 0;

  return { exportBytes, tables, totalRows, totalTombstones };
}

// ── Dashboard fetch + derive timing ───────────────────────────────────────────

export interface DashboardMeasurement {
  habitKey: string;
  sessions: number;
  entries: number;
  /** ms to pull the slices out of SQLite. */
  queryMs: number;
  /** ms to run the derivation shapes over them (the pure-TS half). */
  deriveMs: number;
  totalMs: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function decodeGenre(raw: unknown): string[] {
  if (raw == null) return [];
  try {
    return [...(stringListFromJson(raw as never) as readonly string[])];
  } catch {
    return [];
  }
}

/**
 * Mirrors what a consumption dashboard actually does — the same slices
 * `useConsumptionData` fetches, then a representative sweep of the ten-shape
 * catalog — so the number is comparable to the <100 ms budget.
 */
export async function measureDashboard(habitKey: string): Promise<DashboardMeasurement> {
  const t0 = performance.now();

  const habitRows = await evolu.loadQuery(
    evolu.createQuery((db) =>
      db
        .selectFrom("habits")
        .select(["id"])
        .where("key", "=", NonEmptyString100.orThrow(habitKey))
        .where("isDeleted", "is not", 1),
    ),
  );
  const habitId = habitRows[0]?.id as HabitId | undefined;
  if (habitId == null) throw new Error(`spike: habit "${habitKey}" not found`);

  const sessionRows = await evolu.loadQuery(
    evolu.createQuery((db) =>
      db
        .selectFrom("sessions")
        .select(["id", "entry_fk", "day", "measure_kind", "value"])
        .where("habit_fk", "=", habitId)
        .where("isDeleted", "is not", 1),
    ),
  );
  const entryRows = await evolu.loadQuery(
    evolu.createQuery((db) =>
      db
        .selectFrom("entries")
        .select(["id", "title", "status", "genre", "rating", "type"])
        .where("habit_fk", "=", habitId)
        .where("isDeleted", "is not", 1),
    ),
  );
  const dayRows = await evolu.loadQuery(
    evolu.createQuery((db) =>
      db
        .selectFrom("days")
        .select(["date"])
        .where("finalized", "=", 1)
        .where("isDeleted", "is not", 1),
    ),
  );

  const t1 = performance.now();

  const sessions: SessionRow[] = sessionRows
    .filter((r): r is typeof r & { day: string } => r.day != null)
    .map((r) => ({
      id: r.id,
      entry_fk: r.entry_fk,
      day: r.day,
      measure_kind: r.measure_kind,
      value: r.value,
    }));
  const entries: EntryRow[] = entryRows.map((r) => ({
    id: r.id,
    title: r.title ?? "—",
    status: r.status,
    genre: decodeGenre(r.genre),
    rating: r.rating,
    type: r.type,
  }));
  const finalized = new Set<string>(
    dayRows.flatMap((r) => (r.date != null ? [r.date as string] : [])),
  );

  // A representative sweep of the shape catalog — the work a dashboard does.
  const today = todayStr();
  const dm = dayMinutes(sessions);
  const played = playedDaySet(sessions);
  const from = sessions.length > 0 ? sessions.reduce((a, s) => (s.day < a ? s.day : a), sessions[0].day) : today;
  void total(sessions);
  void distinctDays(sessions);
  void best(sessions, "day", "minutes");
  void best(sessions, "month", "minutes");
  void streaks(from, today, played, finalized);
  void distribute(entries, (e) => (e.status ?? null) as string | null);
  void distribute(entries, (e) => e.genre);
  void leaderboard(sessions, entries, "minutes", 5);
  void heatmapCells(dm, today, 53);

  const t2 = performance.now();

  return {
    habitKey,
    sessions: sessions.length,
    entries: entries.length,
    queryMs: Math.round((t1 - t0) * 10) / 10,
    deriveMs: Math.round((t2 - t1) * 10) / 10,
    totalMs: Math.round((t2 - t0) * 10) / 10,
  };
}

// ── One-shot run + report ─────────────────────────────────────────────────────

const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(2)} MB`;

/** Measures the store + the three consumption dashboards, and returns a
 *  human-readable report (also logged to the console for copy/paste). */
export async function runSpikeMeasurement(): Promise<string> {
  const store = await measureStore();
  const dashboards: DashboardMeasurement[] = [];
  for (const key of ["gaming", "reading", "media"]) {
    try {
      dashboards.push(await measureDashboard(key));
    } catch (e) {
      console.warn(`spike: skipped ${key}`, e);
    }
  }

  const lines = [
    `STORE  export=${mb(store.exportBytes)} (${store.exportBytes} bytes)`,
    `       rows=${store.totalRows} total · tombstoned=${store.totalTombstones}`,
    ...store.tables.map(
      (t) => `       ${t.table.padEnd(22)} live=${t.live}  total=${t.total}  tomb=${t.tombstoned}`,
    ),
    ...dashboards.map(
      (d) =>
        `DASH   ${d.habitKey.padEnd(8)} sessions=${d.sessions} entries=${d.entries}  ` +
        `query=${d.queryMs}ms derive=${d.deriveMs}ms TOTAL=${d.totalMs}ms`,
    ),
  ];
  const report = lines.join("\n");
  console.log(`\n=== CIBO GROWTH SPIKE ===\n${report}\n`);
  return report;
}
