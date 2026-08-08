/**
 * The entry dashboard's FETCH layer (chunk 5): SQL only slices — Evolu live
 * queries keyed by the ENTRY id — and the database aggregates nothing.
 *
 * Chain: the entry row resolves its habit; the habit row carries the template
 * (sub_type) + declarations; sessions hang off the entry; the habit's other
 * entries feed the rating-context count + the series strip; the session-scope
 * picklist defs + values (the creation categoricals) reuse chunk 2's fan-in.
 * All live — an edit-mode save re-fires only these queries.
 */
import { useMemo } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { waveGapDefault } from "../settings/store";
import { entryAttributesFromJson, stringListFromJson, type EntryId, type HabitId } from "../db/schema";
import type { SessionRow } from "../metrics/shapes";
import type { SessionDef } from "./creationSpec";
import type { EntryIdentity, SiblingRow } from "./entrySpec";


import { finalizedDaysQuery } from "./queries";
export interface EntryData {
  ready: boolean;
  habitKey: string;
  habitName: string;
  colourSlot: string;
  subType: "consumption" | "creation" | null;
  measuresCount: boolean;
  countUnit: string | null;
  waveGapDays: number | null;
  /** The habit's entry-attribute bundle (which fields the edit face offers). */
  bundle: string[];
  /** The habit's declared entry-level `type` vocab (the edit face's Type options). */
  typeVocab: string[];
  entry: EntryIdentity | null;
  /** The raw Evolu ids the edit mode writes against. */
  entryId: EntryId | null;
  sessions: SessionRow[];
  siblings: SiblingRow[];
  finalized: Set<string>;
  defs: SessionDef[];
  valueBySession: Map<string, Record<string, string>>;
}

export function useEntryData(entryId: string): EntryData {
  const eid = entryId as EntryId;

  const entryQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("entries")
          .selectAll()
          .where("id", "=", eid)
          .where("isDeleted", "is not", 1),
      ),
    [eid],
  );
  const entryRows = useQuery(entryQuery);
  const raw = entryRows[0] ?? null;
  const habitId = (raw?.habit_fk ?? "-") as HabitId;

  const habitQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("habits")
          .select([
            "id",
            "key",
            "name",
            "colour_slot",
            "sub_type",
            "measures_count",
            "count_unit",
            "wave_gap_days",
            "entry_attributes",
          ])
          .where("id", "=", habitId)
          .where("isDeleted", "is not", 1),
      ),
    [habitId],
  );
  const habitRows = useQuery(habitQuery);
  const habit = habitRows[0] ?? null;

  const sessionsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("sessions")
          .select(["id", "entry_fk", "day", "measure_kind", "value"])
          .where("entry_fk", "=", eid)
          .where("isDeleted", "is not", 1),
      ),
    [eid],
  );
  const siblingsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("entries")
          .select(["id", "title", "status", "rating", "series", "series_order", "type"])
          .where("habit_fk", "=", habitId)
          .where("isDeleted", "is not", 1),
      ),
    [habitId],
  );
  // Entry-level `type` picklist (the eyebrow + the edit face's Type select).
  const typeVocabQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("subunit_definitions")
          .innerJoin("vocab_options", "vocab_options.definition_fk", "subunit_definitions.id")
          .select(["vocab_options.value as value"])
          .where("subunit_definitions.habit_fk", "=", habitId)
          .where("subunit_definitions.scope", "=", "entry")
          .where("subunit_definitions.data_type", "=", "picklist")
          .where("subunit_definitions.isDeleted", "is not", 1)
          .where("vocab_options.isDeleted", "is not", 1)
          .orderBy("vocab_options.sort_order"),
      ),
    [habitId],
  );
  // Session-scope picklist defs + values — chunk 2's fan-in, filtered to this
  // entry's sessions in TS (the map covers the whole habit; lookups are by id).
  const defsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("subunit_definitions")
          .innerJoin("vocab_options", "vocab_options.definition_fk", "subunit_definitions.id")
          .select([
            "subunit_definitions.key as def_key",
            "subunit_definitions.label as def_label",
            "vocab_options.value as value",
          ])
          .where("subunit_definitions.habit_fk", "=", habitId)
          .where("subunit_definitions.scope", "=", "session")
          .where("subunit_definitions.data_type", "=", "picklist")
          .where("subunit_definitions.isDeleted", "is not", 1)
          .where("vocab_options.isDeleted", "is not", 1)
          // createdAt ties within a seed batch — the key tiebreaker is what
          // makes declaration order deterministic (see useDayData's note).
          .orderBy("subunit_definitions.createdAt")
          .orderBy("subunit_definitions.key")
          .orderBy("vocab_options.sort_order"),
      ),
    [habitId],
  );
  // Joined through sessions so only THIS entry's tagged values load (was the
  // whole habit's, filtered later in TS — 2026-07-30).
  const valuesQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("subunit_values")
          .innerJoin("subunit_definitions", "subunit_definitions.id", "subunit_values.definition_fk")
          .innerJoin("sessions", "sessions.id", "subunit_values.session_fk")
          .select([
            "subunit_values.session_fk as session_fk",
            "subunit_definitions.key as def_key",
            "subunit_values.value as value",
          ])
          .where("sessions.entry_fk", "=", eid)
          .where("sessions.isDeleted", "is not", 1)
          .where("subunit_definitions.scope", "=", "session")
          .where("subunit_definitions.isDeleted", "is not", 1)
          .where("subunit_values.isDeleted", "is not", 1),
      ),
    [eid],
  );

  const sessionRows = useQuery(sessionsQuery);
  const siblingRows = useQuery(siblingsQuery);
  const dayRows = useQuery(finalizedDaysQuery);
  const typeVocabRows = useQuery(typeVocabQuery);
  const defRows = useQuery(defsQuery);
  const valueRows = useQuery(valuesQuery);

  const entry = useMemo<EntryIdentity | null>(() => {
    if (raw == null || raw.title == null) return null;
    return {
      id: raw.id,
      title: raw.title,
      status: raw.status,
      type: raw.type,
      genre: decodeList(raw.genre),
      priority: raw.priority,
      rating: raw.rating,
      purchased: raw.purchased == null ? null : raw.purchased === 1,
      creators: decodeList(raw.creators),
      studios: decodeList(raw.studios),
      series: raw.series,
      seriesOrder: raw.series_order,
      description: raw.description,
      source: raw.source,
      externalId: raw.external_id,
      fandom: raw.fandom,
      engine: raw.gamedev_engine,
      started: raw.started,
      completed: raw.completed,
      banner: raw.banner,
      cover: raw.cover,
    };
  }, [raw]);

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

  const siblings = useMemo<SiblingRow[]>(
    () =>
      siblingRows.map((r) => ({
        id: r.id,
        title: r.title ?? "—",
        status: r.status,
        rating: r.rating,
        series: r.series,
        seriesOrder: r.series_order,
      })),
    [siblingRows],
  );

  const finalized = useMemo(
    () => new Set<string>(dayRows.flatMap((r) => (r.date != null ? [r.date as string] : []))),
    [dayRows],
  );

  const typeVocab = useMemo(
    () => typeVocabRows.flatMap((r) => (r.value != null ? [r.value as string] : [])),
    [typeVocabRows],
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

  const bundle = useMemo<string[]>(() => {
    if (habit?.entry_attributes == null) return [];
    try {
      return [...entryAttributesFromJson(habit.entry_attributes)];
    } catch {
      return [];
    }
  }, [habit]);

  // Memoize the wrapper object so its identity is stable across renders —
  // otherwise buildEntryDashboard (keyed on it) re-derives the whole model on
  // every render, including a pure railMode "Edit" toggle.
  return useMemo<EntryData>(
    () => ({
      ready: raw != null && habit != null && entry != null,
      habitKey: (habit?.key as string | null) ?? "",
      habitName: habit?.name ?? "—",
      colourSlot: habit?.colour_slot ?? "habit-1",
      subType: (habit?.sub_type as "consumption" | "creation" | null) ?? null,
      measuresCount: habit?.measures_count === 1,
      countUnit: (habit?.count_unit as string | null) ?? null,
      // Per-habit override, else the Settings global.
      waveGapDays: (habit?.wave_gap_days as number | null) ?? waveGapDefault(),
      bundle,
      typeVocab,
      entry,
      entryId: raw?.id ?? null,
      sessions,
      siblings,
      finalized,
      defs,
      valueBySession,
    }),
    [raw, habit, entry, bundle, typeVocab, sessions, siblings, finalized, defs, valueBySession],
  );
}

function decodeList(raw: unknown): string[] {
  if (raw == null) return [];
  try {
    return [...(stringListFromJson(raw as never) as readonly string[])];
  } catch {
    return [];
  }
}
