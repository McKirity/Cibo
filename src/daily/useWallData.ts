/**
 * The cover wall's FETCH layer — one finalized day, live.
 *
 * Live queries here, unlike the form spine's careful snapshot: "a live query is
 * cheap on a dashboard and expensive on a form" (the 2026-07-26 performance
 * lesson). The wall is a dashboard — nothing on it is typed into, so a
 * subscription costs one repaint on an edit and buys correctness for free.
 *
 * Everything is scoped to the day except the habit roster, because the wall
 * shows the FULL roster, logged or not: "a finalized day's misses are part of
 * the keepsake."
 */
import { useMemo } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { DateOnly, derivedRulesFromJson, type DerivedRule } from "../db/schema";
import { ruleHolds } from "./milestones";
import type { WallEntry, WallHabit, WallSession } from "./wallSpec";

const habitsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("habits")
    .select([
      "id", "key", "name", "kind", "sub_type", "colour_slot",
      "measures_time", "measures_count", "count_unit",
      "keepsake_snippet", "derived_rules", "sort_order",
    ])
    .where("isDeleted", "is not", 1)
    .where("archived", "=", 0)
    .orderBy("sort_order"),
);

const entriesQuery = evolu.createQuery((db) =>
  db
    .selectFrom("entries")
    .select(["id", "habit_fk", "title", "type", "cover", "banner", "rating"])
    .where("isDeleted", "is not", 1),
);

export interface WallData {
  ready: boolean;
  habits: WallHabit[];
  sessions: WallSession[];
  entries: WallEntry[];
  cats: Map<string, Record<string, string>>;
  ruleHits: Map<string, string[]>;
  /** The `days` ledger row — null until the day carries any bookkeeping. */
  dayRow: { id: string; finalized: boolean } | null;
}

export function useWallData(dayKey: string): WallData {
  const habitRows = useQuery(habitsQuery);
  const entryRows = useQuery(entriesQuery);

  const sessionsQuery = useMemo(
    () =>
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
      ),
    [dayKey],
  );
  const sessionRows = useQuery(sessionsQuery);

  const catsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("subunit_values")
          .innerJoin("sessions", "sessions.id", "subunit_values.session_fk")
          .innerJoin("subunit_definitions", "subunit_definitions.id", "subunit_values.definition_fk")
          .select([
            "subunit_values.session_fk as session_fk",
            "subunit_definitions.key as def_key",
            "subunit_values.value as value",
          ])
          .where("sessions.day", "=", DateOnly.orThrow(dayKey))
          .where("sessions.isDeleted", "is not", 1)
          .where("subunit_values.isDeleted", "is not", 1),
      ),
    [dayKey],
  );
  const catRows = useQuery(catsQuery);

  const dayQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("days")
          .select(["id", "finalized"])
          .where("isDeleted", "is not", 1)
          .where("date", "=", DateOnly.orThrow(dayKey)),
      ),
    [dayKey],
  );
  const dayRows = useQuery(dayQuery);

  const habits = useMemo<WallHabit[]>(
    () =>
      habitRows
        .filter((h) => h.kind != null && h.name != null)
        .map((h) => {
          let rules: DerivedRule[] = [];
          if (h.derived_rules != null) {
            try {
              rules = derivedRulesFromJson(h.derived_rules) as unknown as DerivedRule[];
            } catch {
              rules = [];
            }
          }
          return {
            id: h.id,
            key: (h.key as string | null) ?? null,
            name: h.name as string,
            kind: h.kind as WallHabit["kind"],
            sub_type: (h.sub_type as WallHabit["sub_type"]) ?? null,
            colour_slot: (h.colour_slot as string) ?? "habit-1",
            measures_time: h.measures_time === 1,
            measures_count: h.measures_count === 1,
            count_unit: (h.count_unit as string | null) ?? null,
            keepsake_snippet: (h.keepsake_snippet as string | null) ?? null,
            derived_rules: rules,
            sort_order: (h.sort_order as number | null) ?? null,
          };
        }),
    [habitRows],
  );

  const sessions = useMemo<WallSession[]>(
    () =>
      sessionRows
        .filter((s) => s.habit_fk != null && s.measure_kind != null)
        .map((s) => ({
          id: s.id,
          habit_fk: s.habit_fk as string,
          entry_fk: (s.entry_fk as string | null) ?? null,
          measure_kind: s.measure_kind as WallSession["measure_kind"],
          value: s.value,
          start: s.start,
          end: s.end,
          source: (s.source as string) ?? "manual",
        })),
    [sessionRows],
  );

  const entries = useMemo<WallEntry[]>(
    () =>
      entryRows
        .filter((e) => e.habit_fk != null && e.title != null)
        .map((e) => ({
          id: e.id,
          habit_fk: e.habit_fk as string,
          title: e.title as string,
          type: (e.type as string | null) ?? null,
          cover: (e.cover as string | null) ?? null,
          banner: (e.banner as string | null) ?? null,
          rating: (e.rating as number | null) ?? null,
        })),
    [entryRows],
  );

  const cats = useMemo(() => {
    const m = new Map<string, Record<string, string>>();
    for (const r of catRows) {
      if (r.session_fk == null || r.def_key == null) continue;
      const rec = m.get(r.session_fk as string) ?? {};
      rec[r.def_key as string] = (r.value as string) ?? "";
      m.set(r.session_fk as string, rec);
    }
    return m;
  }, [catRows]);

  // Which derived rules HELD, per session — the keepsake's `{{flags}}` token
  // list. Rules-as-data, evaluated by the one evaluator the milestones use.
  const ruleHits = useMemo(() => {
    const byHabit = new Map(habits.map((h) => [h.id, h.derived_rules]));
    const m = new Map<string, string[]>();
    for (const s of sessions) {
      const rules = byHabit.get(s.habit_fk) ?? [];
      if (rules.length === 0) continue;
      const hits = rules
        .filter((r) =>
          ruleHolds(r as DerivedRule, {
            id: s.id,
            habit_fk: s.habit_fk,
            entry_fk: s.entry_fk,
            day: dayKey,
            measure_kind: s.measure_kind,
            value: s.value,
            start: s.start,
            end: s.end,
            source: s.source,
          }),
        )
        .map((r) => (r as DerivedRule).label as string);
      if (hits.length > 0) m.set(s.id, hits);
    }
    return m;
  }, [habits, sessions, dayKey]);

  const dayRow = useMemo(() => {
    const r = dayRows[0];
    return r ? { id: r.id as string, finalized: r.finalized === 1 } : null;
  }, [dayRows]);

  return useMemo(
    () => ({
      ready: habitRows.length > 0,
      habits,
      sessions,
      entries,
      cats,
      ruleHits,
      dayRow,
    }),
    [habitRows.length, habits, sessions, entries, cats, ruleHits, dayRow],
  );
}
