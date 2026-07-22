/**
 * The vertical slice's FETCH layer (Aggregation & Metrics Engine): SQL only
 * slices — Evolu live queries scoped to the Gaming habit — and the database
 * aggregates nothing. Everything derived downstream is pure TS over these rows.
 *
 * One habit query resolves the id; sessions/entries hang off it; the finalized
 * `days` set feeds streak miss-detection. All live — a logged session re-fires
 * only these queries. Year-scoping happens in TS (no re-query), so scope-tab
 * switches never touch SQL.
 */
import { useMemo } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { NonEmptyString100 } from "@evolu/common";
import { stringListFromJson, type HabitId } from "../db/schema";
import type { EntryRow, SessionRow } from "../metrics/shapes";

const gamingHabitQuery = evolu.createQuery((db) =>
  db
    .selectFrom("habits")
    .select(["id", "name", "colour_slot"])
    .where("key", "=", NonEmptyString100.orThrow("gaming"))
    .where("isDeleted", "is not", 1),
);

const finalizedDaysQuery = evolu.createQuery((db) =>
  db
    .selectFrom("days")
    .select(["date"])
    .where("finalized", "=", 1)
    .where("isDeleted", "is not", 1),
);

export interface GamingData {
  ready: boolean;
  name: string;
  colourSlot: string;
  sessions: SessionRow[];
  entries: EntryRow[];
  finalized: Set<string>;
}

export function useGamingData(): GamingData {
  const habitRows = useQuery(gamingHabitQuery);
  const habit = habitRows[0] ?? null;
  const habitId = (habit?.id ?? "-") as HabitId;

  const sessionsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("sessions")
          .select(["id", "entry_fk", "day", "measure_kind", "value"])
          .where("habit_fk", "=", habitId)
          .where("isDeleted", "is not", 1),
      ),
    [habitId],
  );
  const entriesQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("entries")
          .select(["id", "title", "status", "genre", "rating"])
          .where("habit_fk", "=", habitId)
          .where("isDeleted", "is not", 1),
      ),
    [habitId],
  );

  const sessionRows = useQuery(sessionsQuery);
  const entryRows = useQuery(entriesQuery);
  const dayRows = useQuery(finalizedDaysQuery);

  // Evolu types every column nullable (any CRDT cell can be null); the schema's
  // own write types forbid a null `day`, so we guard and drop the impossible.
  const sessions = useMemo<SessionRow[]>(
    () =>
      sessionRows
        .filter((r): r is typeof r & { day: string } => r.day != null)
        .map((r) => ({
          id: r.id,
          entry_fk: r.entry_fk,
          day: r.day,
          measure_kind: r.measure_kind,
          value: r.value,
        })),
    [sessionRows],
  );

  const entries = useMemo<EntryRow[]>(
    () =>
      entryRows.map((r) => ({
        id: r.id,
        title: r.title ?? "—",
        status: r.status,
        genre: decodeGenre(r.genre),
        rating: r.rating,
      })),
    [entryRows],
  );

  const finalized = useMemo(
    () => new Set<string>(dayRows.flatMap((r) => (r.date != null ? [r.date as string] : []))),
    [dayRows],
  );

  return {
    ready: habit != null,
    name: habit?.name ?? "Gaming",
    colourSlot: habit?.colour_slot ?? "habit-2",
    sessions,
    entries,
    finalized,
  };
}

function decodeGenre(raw: unknown): string[] {
  if (raw == null) return [];
  try {
    return [...(stringListFromJson(raw as never) as readonly string[])];
  } catch {
    return [];
  }
}
