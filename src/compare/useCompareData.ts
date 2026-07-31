/**
 * Comparing Statistics — the FETCH layer. Cross-habit like cadence, so it
 * loads the whole store once (the growth spike proved this holds the <100 ms
 * budget at 15 years); every scope/measure/window change downstream is a
 * pure-TS recomputation, never a new query. A live query is cheap on a
 * dashboard (the 2026-07-26 perf lesson) — and this IS a dashboard-class
 * surface, not a form.
 *
 * Beyond the cadence fetch this also assembles the SPLIT-FIELD roster per
 * habit — the medium split is definition-driven, never hardcoded: the
 * entry-level `type` picklist (Reading/Media; via vocab_options) plus every
 * session-scope picklist def (writing_stage · coding_language · …). A habit
 * without fields shows no split control; new picklists appear here for free.
 */
import { useMemo } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { ENTRY_FIELD, type CmpData, type CmpEntry, type CmpHabit, type CmpSession, type SplitField } from "./compareSpec";

const habitsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("habits")
    .select([
      "id", "key", "name", "kind", "colour_slot", "icon", "archived",
      "measures_time", "measures_count", "count_unit", "sort_order",
    ])
    .where("isDeleted", "is not", 1)
    .orderBy("sort_order"),
);

const sessionsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("sessions")
    .select(["id", "habit_fk", "entry_fk", "day", "measure_kind", "value", "start", "end"])
    .where("isDeleted", "is not", 1),
);

const entriesQuery = evolu.createQuery((db) =>
  db
    .selectFrom("entries")
    // All three entry-level categorical columns — a split reads the one its
    // definition names (fandom/engine do NOT live in `type`).
    .select(["id", "habit_fk", "title", "type", "fandom", "gamedev_engine"])
    .where("isDeleted", "is not", 1),
);

/** Every subunit definition (entry + session scope) with its habit. */
const defsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("subunit_definitions")
    .select(["id", "habit_fk", "key", "label", "scope", "data_type"])
    .where("isDeleted", "is not", 1),
);

const vocabQuery = evolu.createQuery((db) =>
  db
    .selectFrom("vocab_options")
    .select(["definition_fk", "value", "sort_order"])
    .where("definition_fk", "is not", null)
    .where("isDeleted", "is not", 1)
    .orderBy("sort_order"),
);

const valuesQuery = evolu.createQuery((db) =>
  db
    .selectFrom("subunit_values")
    .innerJoin("subunit_definitions", "subunit_definitions.id", "subunit_values.definition_fk")
    .select([
      "subunit_values.session_fk as session_fk",
      "subunit_definitions.key as def_key",
      "subunit_values.value as value",
    ])
    .where("subunit_definitions.scope", "=", "session")
    .where("subunit_definitions.isDeleted", "is not", 1)
    .where("subunit_values.isDeleted", "is not", 1),
);

export function useCompareData(): CmpData {
  const habitRows = useQuery(habitsQuery);
  const sessionRows = useQuery(sessionsQuery);
  const entryRows = useQuery(entriesQuery);
  const defRows = useQuery(defsQuery);
  const vocabRows = useQuery(vocabQuery);
  const valueRows = useQuery(valuesQuery);

  const habits = useMemo<CmpHabit[]>(
    () =>
      habitRows
        .filter((h) => h.key != null && h.kind != null)
        .map((h) => ({
          id: h.id,
          key: h.key as string,
          name: (h.name as string) ?? (h.key as string),
          kind: h.kind as CmpHabit["kind"],
          colour: (h.colour_slot as string) ?? "habit-1",
          icon: (h.icon as string | null) ?? null,
          archived: h.archived === 1,
          measuresTime: h.measures_time === 1,
          measuresCount: h.measures_count === 1,
          countUnit: (h.count_unit as string | null) ?? null,
          sortOrder: (h.sort_order as number) ?? 0,
        })),
    [habitRows],
  );

  const sessions = useMemo<CmpSession[]>(
    () =>
      sessionRows
        .filter((r) => r.day != null && r.habit_fk != null && r.measure_kind != null)
        .map((r) => ({
          id: r.id,
          habitId: r.habit_fk as string,
          entryId: r.entry_fk,
          day: r.day as string,
          measure_kind: r.measure_kind as CmpSession["measure_kind"],
          value: r.value,
          start: r.start,
          end: r.end,
        })),
    [sessionRows],
  );

  const entries = useMemo<CmpEntry[]>(
    () =>
      entryRows
        .filter((e) => e.habit_fk != null && e.title != null)
        .map((e) => ({
          id: e.id,
          habitId: e.habit_fk as string,
          title: e.title as string,
          type: (e.type as string | null) ?? null,
          fandom: (e.fandom as string | null) ?? null,
          gamedev_engine: (e.gamedev_engine as string | null) ?? null,
        })),
    [entryRows],
  );

  const valueBySession = useMemo(() => {
    const m = new Map<string, Record<string, string>>();
    for (const r of valueRows) {
      if (r.session_fk == null || r.def_key == null) continue;
      const rec = m.get(r.session_fk as string) ?? {};
      rec[r.def_key as string] = (r.value as string) ?? "1";
      m.set(r.session_fk as string, rec);
    }
    return m;
  }, [valueRows]);

  const { splitFields, flagDefs } = useMemo(() => {
    const vocabByDef = new Map<string, string[]>();
    for (const v of vocabRows) {
      if (v.definition_fk == null || v.value == null) continue;
      const arr = vocabByDef.get(v.definition_fk as string) ?? [];
      arr.push(v.value as string);
      vocabByDef.set(v.definition_fk as string, arr);
    }
    // Observed session values fill in what vocab lost (retired values derive —
    // data minus vocab, the chunk-3 rule; here they just stay pickable).
    const observedByDef = new Map<string, Set<string>>();
    for (const r of valueRows) {
      if (r.def_key == null || r.value == null) continue;
      const set = observedByDef.get(r.def_key as string) ?? new Set<string>();
      set.add(r.value as string);
      observedByDef.set(r.def_key as string, set);
    }
    const fields = new Map<string, SplitField[]>();
    const flags = new Map<string, { key: string; label: string }[]>();
    for (const d of defRows) {
      if (d.habit_fk == null || d.key == null) continue;
      const habitId = d.habit_fk as string;
      const key = d.key as string;
      const label = (d.label as string) ?? key;
      if (d.data_type === "flag" && d.scope === "session") {
        const arr = flags.get(habitId) ?? [];
        arr.push({ key, label });
        flags.set(habitId, arr);
        continue;
      }
      if (d.data_type !== "picklist") continue;
      const entryLevel = d.scope === "entry";
      // Which `entries` column carries this attribute. The keystone gives each
      // its own plain column, so a definition key maps to one of three; an
      // unrecognised entry-level key is skipped rather than silently read off
      // `type` (which is what made Writing-by-fandom draw nothing).
      const entryColumn = !entryLevel
        ? undefined
        : key.endsWith("_type")
          ? ("type" as const)
          : key.endsWith("_fandom")
            ? ("fandom" as const)
            : key.endsWith("_engine")
              ? ("gamedev_engine" as const)
              : undefined;
      if (entryLevel && entryColumn == null) continue;
      const vocab = vocabByDef.get(d.id as string) ?? [];
      // Values present in DATA but absent from vocab still split (retired or
      // quick-added — the chunk-3 data-minus-vocab rule), entry side included.
      const observed = entryLevel
        ? [
            ...new Set(
              entries
                .filter((e) => e.habitId === habitId)
                .map((e) => e[entryColumn as "type" | "fandom" | "gamedev_engine"])
                .filter((v): v is string => v != null),
            ),
          ]
        : [...(observedByDef.get(key) ?? [])];
      const values = [...vocab, ...observed.filter((v) => !vocab.includes(v)).sort()];
      if (values.length === 0) continue; // an empty picklist (Gaming) mints no control
      const arr = fields.get(habitId) ?? [];
      arr.push({
        field: key,
        label,
        entryLevel,
        entryColumn,
        // Medium = entry `type` + the session categoricals ([[Glossary]]);
        // Fandom and Engine are entry attributes, NOT Mediums.
        isMedium: entryColumn === "type" || !entryLevel,
        values,
      });
      fields.set(habitId, arr);
    }
    // The ENTRY split — synthetic, one per entry-bearing habit, listed first
    // because it is the most concrete way to fan a project habit. Values are
    // entry IDS with a title lookup: titles are neither unique nor immutable.
    const byHabit = new Map<string, CmpEntry[]>();
    for (const e of entries) {
      const arr = byHabit.get(e.habitId) ?? [];
      arr.push(e);
      byHabit.set(e.habitId, arr);
    }
    for (const [habitId, list] of byHabit) {
      if (list.length === 0) continue;
      const sorted = [...list].sort((a, b) => a.title.localeCompare(b.title));
      const arr = fields.get(habitId) ?? [];
      arr.unshift({
        field: ENTRY_FIELD,
        label: "Entry",
        entryLevel: true,
        isMedium: false,
        values: sorted.map((e) => e.id),
        valueLabel: Object.fromEntries(sorted.map((e) => [e.id, e.title])),
        searchable: true,
      });
      fields.set(habitId, arr);
    }
    return { splitFields: fields, flagDefs: flags };
  }, [defRows, vocabRows, valueRows, entries]);

  return useMemo<CmpData>(
    () => ({
      habits,
      sessions,
      entries,
      valueBySession,
      splitFields,
      flagDefs,
    }),
    [habits, sessions, entries, valueBySession, splitFields, flagDefs],
  );
}
