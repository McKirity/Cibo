/**
 * The consumption dashboards' FETCH layer (Aggregation & Metrics Engine),
 * generalized from the step-4 slice's `useGamingData`: SQL only slices — Evolu
 * live queries scoped to ONE consumption habit, keyed by the habit's stable
 * `key` (gaming · reading · media) — and the database aggregates nothing.
 * Everything derived downstream is pure TS over these rows.
 *
 * One habit query resolves the id + its declared entry-level `type` vocab (the
 * Medium sub-scope, empty for Gaming); sessions/entries hang off the id; the
 * finalized `days` set feeds streak miss-detection. All live — a logged session
 * re-fires only these queries. Year- and type-scoping happen in TS (no
 * re-query), so scope-tab switches never touch SQL.
 */
import { useMemo } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { NonEmptyString100 } from "@evolu/common";
import { stringListFromJson, type HabitId } from "../db/schema";
import type { EntryRow, SessionRow } from "../metrics/shapes";

const finalizedDaysQuery = evolu.createQuery((db) =>
  db
    .selectFrom("days")
    .select(["date"])
    .where("finalized", "=", 1)
    .where("isDeleted", "is not", 1),
);

// App-wide activity: the day of every session across ALL habits (deduped in TS)
// — the "Total days active · All types" reading (days the app itself was used).
const appActiveDaysQuery = evolu.createQuery((db) =>
  db.selectFrom("sessions").select(["day"]).where("isDeleted", "is not", 1),
);

export interface ConsumptionData {
  ready: boolean;
  name: string;
  colourSlot: string;
  sessions: SessionRow[];
  entries: EntryRow[];
  finalized: Set<string>;
  /** The habit's declared entry-level `type` picklist, in dropdown order (empty = no Medium sub-scope). */
  typeVocab: string[];
  /** Distinct days ANY habit was active, app-wide (the All-types "Total days active"). */
  appActiveDays: string[];
}

export function useConsumptionData(habitKey: string): ConsumptionData {
  const habitQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("habits")
          .select(["id", "name", "colour_slot"])
          .where("key", "=", NonEmptyString100.orThrow(habitKey))
          .where("isDeleted", "is not", 1),
      ),
    [habitKey],
  );
  const habitRows = useQuery(habitQuery);
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
          .select(["id", "title", "status", "genre", "rating", "type"])
          .where("habit_fk", "=", habitId)
          .where("isDeleted", "is not", 1),
      ),
    [habitId],
  );
  // The declared entry-level `type` picklist (definition-driven — the Medium
  // sub-scope + the "By type" distribution both key off this vocab).
  const typeVocabQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("subunit_definitions")
          .innerJoin("vocab_options", "vocab_options.definition_fk", "subunit_definitions.id")
          .select(["vocab_options.value as value", "vocab_options.sort_order as sort_order"])
          .where("subunit_definitions.habit_fk", "=", habitId)
          .where("subunit_definitions.scope", "=", "entry")
          .where("subunit_definitions.data_type", "=", "picklist")
          .where("subunit_definitions.isDeleted", "is not", 1)
          .where("vocab_options.isDeleted", "is not", 1)
          .orderBy("vocab_options.sort_order"),
      ),
    [habitId],
  );

  const sessionRows = useQuery(sessionsQuery);
  const entryRows = useQuery(entriesQuery);
  const dayRows = useQuery(finalizedDaysQuery);
  const typeVocabRows = useQuery(typeVocabQuery);
  const appDayRows = useQuery(appActiveDaysQuery);

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
        type: r.type,
      })),
    [entryRows],
  );

  const finalized = useMemo(
    () => new Set<string>(dayRows.flatMap((r) => (r.date != null ? [r.date as string] : []))),
    [dayRows],
  );

  const typeVocab = useMemo(
    () => typeVocabRows.flatMap((r) => (r.value != null ? [r.value as string] : [])),
    [typeVocabRows],
  );

  const appActiveDays = useMemo(
    () => [...new Set(appDayRows.flatMap((r) => (r.day != null ? [r.day as string] : [])))],
    [appDayRows],
  );

  return {
    ready: habit != null,
    name: habit?.name ?? habitKey,
    colourSlot: habit?.colour_slot ?? "habit-2",
    sessions,
    entries,
    finalized,
    typeVocab,
    appActiveDays,
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
