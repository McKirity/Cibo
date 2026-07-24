/**
 * The simple dashboards' FETCH layer (chunk 3 — Embroidery · Drawing ·
 * Keyboard · Coding · Walking), the entry-less sibling of `useCreationData`:
 * SQL only slices, everything derived downstream is pure TS. The FLAVOR
 * (measureless · measured · categorical) is computed downstream from what this
 * returns — measures off the habit row, categoricals off the session picklist
 * definitions — never stored, never keyed off the habit.
 */
import { useMemo } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { NonEmptyString100 } from "@evolu/common";
import { type HabitId } from "../db/schema";
import type { SessionRow } from "../metrics/shapes";
import type { SessionDef } from "./creationSpec";

const finalizedDaysQuery = evolu.createQuery((db) =>
  db
    .selectFrom("days")
    .select(["date"])
    .where("finalized", "=", 1)
    .where("isDeleted", "is not", 1),
);

export interface SimpleData {
  ready: boolean;
  name: string;
  colourSlot: string;
  archived: boolean;
  measuresTime: boolean;
  measuresCount: boolean;
  countUnit: string | null;
  sessions: SessionRow[];
  finalized: Set<string>;
  defs: SessionDef[];
  valueBySession: Map<string, Record<string, string>>;
}

export function useSimpleData(habitKey: string): SimpleData {
  const habitQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("habits")
          .select(["id", "name", "colour_slot", "archived", "measures_time", "measures_count", "count_unit"])
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
            "vocab_options.sort_order as sort_order",
          ])
          .where("subunit_definitions.habit_fk", "=", habitId)
          .where("subunit_definitions.scope", "=", "session")
          .where("subunit_definitions.data_type", "=", "picklist")
          .where("subunit_definitions.isDeleted", "is not", 1)
          .where("vocab_options.isDeleted", "is not", 1)
          .orderBy("subunit_definitions.createdAt")
          .orderBy("vocab_options.sort_order"),
      ),
    [habitId],
  );
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
    measuresTime: habit?.measures_time === 1,
    measuresCount: habit?.measures_count === 1,
    countUnit: (habit?.count_unit as string | null) ?? null,
    sessions,
    finalized,
    defs,
    valueBySession,
  };
}
