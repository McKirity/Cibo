/**
 * The range dashboard's FETCH layer (chunk 3 — Sleep, canon's sole range
 * habit). Range sessions carry their start/end local datetimes; the habit row
 * carries the `derived_rules` templates (rules-as-data — the RESULTS are
 * computed here-downstream, never stored); flag definitions (data_type "flag")
 * + their per-session answers mint the flag panels.
 */
import { useMemo } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { NonEmptyString100 } from "@evolu/common";
import { derivedRulesFromJson, type DerivedRule, type HabitId } from "../db/schema";
import type { FlagDef, RangeSessionRow } from "./rangeSpec";

export interface RangeData {
  ready: boolean;
  name: string;
  colourSlot: string;
  archived: boolean;
  sessions: RangeSessionRow[];
  flagDefs: FlagDef[];
  flagBySession: Map<string, Record<string, string>>;
  derivedRules: DerivedRule[];
}

export function useRangeData(habitKey: string): RangeData {
  const habitQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("habits")
          .select(["id", "name", "colour_slot", "archived", "derived_rules"])
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
          .select(["id", "entry_fk", "day", "measure_kind", "value", "start", "end"])
          .where("habit_fk", "=", habitId)
          .where("isDeleted", "is not", 1),
      ),
    [habitId],
  );
  const flagDefsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("subunit_definitions")
          .select(["key", "label"])
          .where("habit_fk", "=", habitId)
          .where("scope", "=", "session")
          .where("data_type", "=", "flag")
          .where("isDeleted", "is not", 1)
          .orderBy("createdAt"),
      ),
    [habitId],
  );
  const flagValuesQuery = useMemo(
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
          .where("subunit_definitions.data_type", "=", "flag")
          .where("subunit_definitions.isDeleted", "is not", 1)
          .where("subunit_values.isDeleted", "is not", 1),
      ),
    [habitId],
  );

  const sessionRows = useQuery(sessionsQuery);
  const flagDefRows = useQuery(flagDefsQuery);
  const flagValueRows = useQuery(flagValuesQuery);

  const sessions = useMemo<RangeSessionRow[]>(
    () =>
      sessionRows
        .filter((r): r is typeof r & { day: string } => r.day != null)
        .map((r) => ({
          id: r.id,
          entry_fk: r.entry_fk,
          day: r.day,
          measure_kind: r.measure_kind,
          value: r.value,
          start: r.start,
          end: r.end,
        })),
    [sessionRows],
  );

  const flagDefs = useMemo<FlagDef[]>(
    () =>
      flagDefRows
        .filter((r): r is typeof r & { key: string } => r.key != null)
        .map((r) => ({ key: r.key, label: (r.label as string) ?? r.key })),
    [flagDefRows],
  );

  const flagBySession = useMemo(() => {
    const m = new Map<string, Record<string, string>>();
    for (const r of flagValueRows) {
      if (r.session_fk == null || r.def_key == null || r.value == null) continue;
      const rec = m.get(r.session_fk as string) ?? {};
      rec[r.def_key as string] = r.value as string;
      m.set(r.session_fk as string, rec);
    }
    return m;
  }, [flagValueRows]);

  // The json codec's decode is a plain JSON.parse (the branded column already
  // validated at write time); guard anyway — a bad row must not blank the screen.
  const derivedRules = useMemo<DerivedRule[]>(() => {
    if (habit?.derived_rules == null) return [];
    try {
      return derivedRulesFromJson(habit.derived_rules) as unknown as DerivedRule[];
    } catch {
      return [];
    }
  }, [habit?.derived_rules]);

  return {
    ready: habit != null,
    name: habit?.name ?? habitKey,
    colourSlot: habit?.colour_slot ?? "habit-1",
    archived: habit?.archived === 1,
    sessions,
    flagDefs,
    flagBySession,
    derivedRules,
  };
}
