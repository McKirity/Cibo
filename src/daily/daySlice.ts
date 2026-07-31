/**
 * THE DAY SLICE the two Daily fetch layers share (2026-07-30 dedup).
 *
 * `useDayData` (the form spine) and `useWallData` (the cover wall) read the
 * same day-scoped slice of the store — the day's sessions, their categorical
 * answers, and the `days` ledger row — and each carried its own copy of the
 * query builders and row-mapping stanzas. They live here ONCE; each hook keeps
 * only its own OUTPUT shape (the spine adds `catRowIds` for edits, the wall
 * adds `feed_snapshot` parsing and the rule-hit derivation).
 *
 * The shared queries select the UNION of what the two hooks read — `createdAt`
 * (the spine's bout order), `value_id` (the spine's edit handle) and
 * `feed_snapshot` (the wall's ephemeral capture) — so neither pays a second
 * fetch for a column the other needs.
 */
import { evolu } from "../db/evolu";
import { DateOnly } from "../db/schema";

// ── Query builders (one live query per day, memoized by the hooks) ───────────

export const daySessionsQuery = (dayKey: string) =>
  evolu.createQuery((db) =>
    db
      .selectFrom("sessions")
      .select([
        "id", "habit_fk", "entry_fk", "measure_kind", "value",
        "start", "end", "source", "createdAt",
      ])
      .where("isDeleted", "is not", 1)
      .where("day", "=", DateOnly.orThrow(dayKey))
      .orderBy("createdAt"),
  );

export const dayCatsQuery = (dayKey: string) =>
  evolu.createQuery((db) =>
    db
      .selectFrom("subunit_values")
      .innerJoin("sessions", "sessions.id", "subunit_values.session_fk")
      .innerJoin(
        "subunit_definitions",
        "subunit_definitions.id",
        "subunit_values.definition_fk",
      )
      .select([
        "subunit_values.id as value_id",
        "subunit_values.session_fk as session_fk",
        "subunit_definitions.key as def_key",
        "subunit_values.value as value",
      ])
      .where("sessions.day", "=", DateOnly.orThrow(dayKey))
      .where("sessions.isDeleted", "is not", 1)
      .where("subunit_values.isDeleted", "is not", 1),
  );

export const dayLedgerQuery = (dayKey: string) =>
  evolu.createQuery((db) =>
    db
      .selectFrom("days")
      .select(["id", "finalized", "feed_snapshot"])
      .where("isDeleted", "is not", 1)
      .where("date", "=", DateOnly.orThrow(dayKey)),
  );

// ── Row mappers (branding stripped once, the same nullable filters) ──────────

/** One day-scoped session row as both hooks consume it — a superset of the
 * wall's shape (`WallSession` simply never reads `createdAt`). */
export interface DaySliceSession {
  id: string;
  habit_fk: string;
  entry_fk: string | null;
  measure_kind: "time" | "count" | "range" | "none";
  value: number | null;
  start: string | null;
  end: string | null;
  source: string;
  /** Sort key — the write order inside a day. */
  createdAt: string;
}

export function mapDaySessions<
  R extends {
    id: string;
    habit_fk: string | null;
    entry_fk: string | null;
    measure_kind: string | null;
    value: number | null;
    start: string | null;
    end: string | null;
    source: string | null;
    createdAt: unknown;
  },
>(rows: ReadonlyArray<R>): DaySliceSession[] {
  return rows
    .filter((s) => s.habit_fk != null && s.measure_kind != null)
    .map((s) => ({
      id: s.id as string,
      habit_fk: s.habit_fk as string,
      entry_fk: (s.entry_fk as string | null) ?? null,
      measure_kind: s.measure_kind as DaySliceSession["measure_kind"],
      value: s.value,
      start: s.start,
      end: s.end,
      source: (s.source as string) ?? "manual",
      createdAt: String(s.createdAt),
    }));
}

export interface DayCats {
  /** session id → { definition key → stored value }. */
  cats: Map<string, Record<string, string>>;
  /**
   * `${session id}|${definition key}` → the subunit_values row id, so an edit
   * UPDATES the answer rather than stacking a second one, and a bout removal
   * can take its answers with it. The wall never edits and ignores this.
   */
  catRowIds: Map<string, string>;
}

export function mapDayCats<
  R extends {
    value_id: string;
    session_fk: string | null;
    def_key: string | null;
    value: string | null;
  },
>(rows: ReadonlyArray<R>): DayCats {
  const cats = new Map<string, Record<string, string>>();
  const catRowIds = new Map<string, string>();
  for (const r of rows) {
    if (r.session_fk == null || r.def_key == null) continue;
    const rec = cats.get(r.session_fk as string) ?? {};
    rec[r.def_key as string] = (r.value as string) ?? "";
    cats.set(r.session_fk as string, rec);
    catRowIds.set(`${r.session_fk as string}|${r.def_key as string}`, r.value_id as string);
  }
  return { cats, catRowIds };
}

/** The `days` ledger row, when the day carries bookkeeping. */
export interface DayLedgerRow {
  id: string;
  finalized: boolean;
}

export const mapDayLedger = <R extends { id: string; finalized: number | null }>(
  rows: ReadonlyArray<R>,
): DayLedgerRow | null => {
  const r = rows[0];
  return r ? { id: r.id as string, finalized: r.finalized === 1 } : null;
};
