/**
 * The form spine's FETCH layer — one day's slice of the store, live.
 *
 * The strips are a LIVE EDITOR over the day's real sessions (ruling 1: Finalize
 * is the only official save; every other write is unofficial and immediate), so
 * everything here is a live query: a write repaints without a refresh, and
 * "unsaved" never exists in the drafting sense.
 *
 * Scoped to the day on purpose. The milestone banner needs the whole store, and
 * it gets it from `useMilestoneDay`'s debounced snapshot loader rather than a
 * live subscription here (a live whole-store query on a form is the lag bug).
 *
 * The day-scoped queries + row mappers are shared with the cover wall's fetch
 * layer — `daySlice.ts` (2026-07-30 dedup); this hook keeps only its own
 * output shape (habits with their declarations, the entry pool, catRowIds).
 */
import { useMemo } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { parseDerivedRules } from "../db/schema";
import {
  dayCatsQuery,
  dayLedgerQuery,
  daySessionsQuery,
  mapDayCats,
  mapDayLedger,
  mapDaySessions,
} from "./daySlice";
import type { SpineDefinition, SpineHabit, SpineSession, SubunitMap } from "./spineSpec";

const habitsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("habits")
    .select([
      "id", "key", "name", "kind", "sub_type", "colour_slot", "icon",
      "measures_time", "measures_count", "count_unit", "range_max_midnights",
      "entry_attributes", "derived_rules", "sort_order",
    ])
    .where("isDeleted", "is not", 1)
    .where("archived", "=", 0)
    .orderBy("sort_order"),
);

/** Session-scope definitions + their vocab, in definition then dropdown order. */
const definitionsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("subunit_definitions")
    .select(["id", "habit_fk", "key", "label", "data_type", "createdAt"])
    .where("scope", "=", "session")
    .where("isDeleted", "is not", 1)
    // Declaration order — Stage before Wiki, as the FINAL draws. `createdAt`
    // alone does NOT deliver it: a seed batch inserts a habit's definitions in
    // one synchronous transaction, so their timestamps TIE and SQLite breaks
    // the tie however it likes — which is how Writing's Kind switch came up
    // Wiki-first. The key tiebreaker makes the order deterministic (the table
    // carries no declaration-order column to read instead).
    .orderBy("createdAt")
    .orderBy("key"),
);

const vocabQuery = evolu.createQuery((db) =>
  db
    .selectFrom("vocab_options")
    .select(["definition_fk", "value", "sort_order"])
    .where("isDeleted", "is not", 1)
    .orderBy("sort_order"),
);

/** Every entry of every project habit — the type-ahead picker's pool. */
const entriesQuery = evolu.createQuery((db) =>
  db
    .selectFrom("entries")
    .select(["id", "habit_fk", "title", "type"])
    .where("isDeleted", "is not", 1)
    .orderBy("title"),
);

export interface DayEntry {
  id: string;
  habitId: string;
  title: string;
  /** Rendered as an inline tag only where the habit declares a type. */
  type: string | null;
}

export interface DayData {
  habits: SpineHabit[];
  /** habit id → its session-scope definitions (picklists then flags, as declared). */
  defsByHabit: Map<string, SpineDefinition[]>;
  /** The day's sessions, every habit. */
  sessions: SpineSession[];
  /** session id → { definition key → stored value }. */
  cats: Map<string, SubunitMap>;
  /** `${session id}|${definition key}` → the subunit_values row id. */
  catRowIds: Map<string, string>;
  /** habit id → its entries. */
  entriesByHabit: Map<string, DayEntry[]>;
  /** The `days` ledger row, when the day carries bookkeeping. */
  dayRow: { id: string; finalized: boolean } | null;
}

export function useDayData(dayKey: string): DayData {
  const habitRows = useQuery(habitsQuery);
  const defRows = useQuery(definitionsQuery);
  const vocabRows = useQuery(vocabQuery);
  const entryRows = useQuery(entriesQuery);

  const sessionsQuery = useMemo(() => daySessionsQuery(dayKey), [dayKey]);
  const sessionRows = useQuery(sessionsQuery);

  const catsQuery = useMemo(() => dayCatsQuery(dayKey), [dayKey]);
  const catRows = useQuery(catsQuery);

  const dayQuery = useMemo(() => dayLedgerQuery(dayKey), [dayKey]);
  const dayRows = useQuery(dayQuery);

  const habits = useMemo<SpineHabit[]>(
    () =>
      habitRows
        .filter((h) => h.kind != null && h.name != null)
        .map((h) => ({
          id: h.id,
          key: (h.key as string | null) ?? null,
          name: h.name as string,
          kind: h.kind as SpineHabit["kind"],
          sub_type: (h.sub_type as SpineHabit["sub_type"]) ?? null,
          colour_slot: (h.colour_slot as string) ?? "habit-1",
          icon: (h.icon as string | null) ?? null,
          measures_time: h.measures_time === 1,
          measures_count: h.measures_count === 1,
          count_unit: (h.count_unit as string | null) ?? null,
          range_max_midnights: (h.range_max_midnights as number | null) ?? null,
          entry_attributes: (h.entry_attributes as string | null) ?? null,
          derived_rules: parseDerivedRules(h.derived_rules),
          sort_order: (h.sort_order as number | null) ?? null,
        })),
    [habitRows],
  );

  const defsByHabit = useMemo(() => {
    const vocabByDef = new Map<string, string[]>();
    for (const v of vocabRows) {
      if (v.definition_fk == null || v.value == null) continue;
      const list = vocabByDef.get(v.definition_fk as string) ?? [];
      list.push(v.value as string);
      vocabByDef.set(v.definition_fk as string, list);
    }
    const out = new Map<string, SpineDefinition[]>();
    for (const d of defRows) {
      if (d.habit_fk == null || d.key == null) continue;
      const list = out.get(d.habit_fk as string) ?? [];
      list.push({
        id: d.id,
        key: d.key as string,
        label: (d.label as string) ?? (d.key as string),
        data_type: d.data_type as SpineDefinition["data_type"],
        vocab: vocabByDef.get(d.id) ?? [],
      });
      out.set(d.habit_fk as string, list);
    }
    return out;
  }, [defRows, vocabRows]);

  const sessions = useMemo<SpineSession[]>(() => mapDaySessions(sessionRows), [sessionRows]);

  const { cats, catRowIds } = useMemo(() => mapDayCats(catRows), [catRows]);

  const entriesByHabit = useMemo(() => {
    const m = new Map<string, DayEntry[]>();
    for (const e of entryRows) {
      if (e.habit_fk == null || e.title == null) continue;
      const list = m.get(e.habit_fk as string) ?? [];
      list.push({
        id: e.id,
        habitId: e.habit_fk as string,
        title: e.title as string,
        type: (e.type as string | null) ?? null,
      });
      m.set(e.habit_fk as string, list);
    }
    return m;
  }, [entryRows]);

  const dayRow = useMemo(() => mapDayLedger(dayRows), [dayRows]);

  return useMemo<DayData>(
    () => ({
      habits,
      defsByHabit,
      sessions,
      cats,
      catRowIds,
      entriesByHabit,
      dayRow,
    }),
    [habits, defsByHabit, sessions, cats, catRowIds, entriesByHabit, dayRow],
  );
}
