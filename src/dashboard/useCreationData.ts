/**
 * The creation dashboards' FETCH layer (chunk 2 — Writing · Coding · Gamedev),
 * the sibling of `useConsumptionData`: SQL only slices — Evolu live queries
 * scoped to ONE creation habit by its stable `key` — and the database
 * aggregates nothing. Everything derived downstream is pure TS.
 *
 * Creation deltas from the consumption hook: entries carry the creation bundle
 * (status · fandom · engine · the stored `started`/`completed` arc bookends),
 * and the categoricals are SESSION-scope (writing_stage / writing_wiki /
 * coding_language / gamedev_type) — fetched as the habit's session picklist
 * definitions (+ their vocab, declared order) plus every subunit_value row of
 * this habit's sessions, joined into a per-session map in TS.
 */
import { useMemo } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { NonEmptyString100 } from "@evolu/common";
import { type HabitId } from "../db/schema";
import type { SessionRow } from "../metrics/shapes";
import type { CreationEntryRow, SessionDef } from "./creationSpec";

const finalizedDaysQuery = evolu.createQuery((db) =>
  db
    .selectFrom("days")
    .select(["date"])
    .where("finalized", "=", 1)
    .where("isDeleted", "is not", 1),
);

export interface CreationData {
  ready: boolean;
  name: string;
  colourSlot: string;
  archived: boolean;
  /** True when the habit declares BOTH duration and count (Writing) — mints the words + efficiency rows. */
  measuresCount: boolean;
  /** The author-set count unit label ("words"); null for time-only habits. */
  countUnit: string | null;
  sessions: SessionRow[];
  entries: CreationEntryRow[];
  finalized: Set<string>;
  /** The habit's session-scope picklist definitions, with vocab in declared order. */
  defs: SessionDef[];
  /** sessionId → { defKey → value } for every tagged session. */
  valueBySession: Map<string, Record<string, string>>;
}

export function useCreationData(habitKey: string): CreationData {
  const habitQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("habits")
          .select(["id", "name", "colour_slot", "archived", "measures_count", "count_unit"])
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
          .select(["id", "title", "status", "fandom", "gamedev_engine", "started", "completed"])
          .where("habit_fk", "=", habitId)
          .where("isDeleted", "is not", 1),
      ),
    [habitId],
  );
  // The session-scope picklist definitions + their vocab (declared order) — the
  // categorical panels, trend stacks, and heatmap scopes all mint off these.
  const defsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("subunit_definitions")
          .innerJoin("vocab_options", "vocab_options.definition_fk", "subunit_definitions.id")
          .select([
            "subunit_definitions.key as def_key",
            "subunit_definitions.label as def_label",
            "subunit_definitions.createdAt as def_created",
            "vocab_options.value as value",
            "vocab_options.sort_order as sort_order",
          ])
          .where("subunit_definitions.habit_fk", "=", habitId)
          .where("subunit_definitions.scope", "=", "session")
          .where("subunit_definitions.data_type", "=", "picklist")
          .where("subunit_definitions.isDeleted", "is not", 1)
          .where("vocab_options.isDeleted", "is not", 1)
          // Definition order first (declaration order — Stage before Wiki, as
          // the FINAL draws), THEN vocab order within each. Ordering by vocab
          // sort_order alone interleaved the definitions, so panel order — and
          // whichever panel got a given default — was effectively arbitrary.
          .orderBy("subunit_definitions.createdAt")
          .orderBy("vocab_options.sort_order"),
      ),
    [habitId],
  );
  // Every categorical answer on this habit's sessions (joined via the
  // definition's habit_fk — one query, per-session fan-in happens in TS).
  const valuesQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("subunit_values")
          .innerJoin(
            "subunit_definitions",
            "subunit_definitions.id",
            "subunit_values.definition_fk",
          )
          .select([
            "subunit_values.session_fk as session_fk",
            "subunit_definitions.key as def_key",
            "subunit_values.value as value",
          ])
          .where("subunit_definitions.habit_fk", "=", habitId)
          .where("subunit_definitions.scope", "=", "session")
          .where("subunit_definitions.isDeleted", "is not", 1)
          .where("subunit_values.isDeleted", "is not", 1),
      ),
    [habitId],
  );

  const sessionRows = useQuery(sessionsQuery);
  const entryRows = useQuery(entriesQuery);
  const dayRows = useQuery(finalizedDaysQuery);
  const defRows = useQuery(defsQuery);
  const valueRows = useQuery(valuesQuery);

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

  const entries = useMemo<CreationEntryRow[]>(
    () =>
      entryRows.map((r) => ({
        id: r.id,
        title: r.title ?? "—",
        status: r.status,
        fandom: r.fandom,
        engine: r.gamedev_engine,
        started: r.started,
        completed: r.completed,
      })),
    [entryRows],
  );

  const finalized = useMemo(
    () => new Set<string>(dayRows.flatMap((r) => (r.date != null ? [r.date as string] : []))),
    [dayRows],
  );

  const defs = useMemo<SessionDef[]>(() => {
    const byKey = new Map<string, SessionDef>();
    for (const r of defRows) {
      if (r.def_key == null || r.value == null) continue;
      const def =
        byKey.get(r.def_key as string) ??
        byKey
          .set(r.def_key as string, {
            key: r.def_key as string,
            label: (r.def_label as string) ?? (r.def_key as string),
            vocab: [],
          })
          .get(r.def_key as string)!;
      def.vocab.push(r.value as string);
    }
    return [...byKey.values()];
  }, [defRows]);

  const valueBySession = useMemo(() => {
    const m = new Map<string, Record<string, string>>();
    for (const r of valueRows) {
      if (r.session_fk == null || r.def_key == null || r.value == null) continue;
      const rec = m.get(r.session_fk as string) ?? {};
      rec[r.def_key as string] = r.value as string;
      m.set(r.session_fk as string, rec);
    }
    return m;
  }, [valueRows]);

  return {
    ready: habit != null,
    name: habit?.name ?? habitKey,
    colourSlot: habit?.colour_slot ?? "habit-1",
    archived: habit?.archived === 1,
    measuresCount: habit?.measures_count === 1,
    countUnit: (habit?.count_unit as string | null) ?? null,
    sessions,
    entries,
    finalized,
    defs,
    valueBySession,
  };
}
