/**
 * The milestone banner's data, as a DEBOUNCED SNAPSHOT rather than a live
 * subscription.
 *
 * Why not `useCadenceData()`, which already loads the whole store: because this
 * is Daily, and Daily is where you type. A live whole-store subscription on the
 * app's front door re-runs every one of its queries — ~8,500 sessions and their
 * categorical values — on EVERY mutation, and the strips commit a mutation each
 * time you leave a field. That is the lag; the derivation itself measures 4.6 ms
 * on a 13k-session store, so the cost was never the arithmetic.
 *
 * A count headline does not need to be live to the millisecond: it re-reads
 * shortly after the day's rows change, which is invisible in use. Milestones
 * re-derive identically forever (ruled: a milestone belongs to the day it was
 * earned), so a snapshot can never be *wrong*, only briefly behind.
 *
 * The categorical load is narrowed to the keys the subject swap actually reads
 * (the board, the meds flag) instead of every session categorical in the store.
 */
import { useEffect, useState } from "react";
import { evolu } from "../db/evolu";
import { milestoneLaddersFromJson, parseDerivedRules } from "../db/schema";
import {
  deriveMilestoneDay,
  swapDefKeys,
  type LadderOverrides,
  type MHabit,
  type MilestoneDay,
  type MSession,
} from "./milestones";

const habitsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("habits")
    .select([
      "id", "key", "name", "kind", "count_unit",
      "milestone_ladders", "wave_gap_days", "derived_rules",
    ])
    .where("isDeleted", "is not", 1),
);

const sessionsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("sessions")
    .select(["id", "habit_fk", "entry_fk", "day", "measure_kind", "value", "start", "end", "source"])
    .where("isDeleted", "is not", 1),
);

const entriesQuery = evolu.createQuery((db) =>
  db
    .selectFrom("entries")
    .select(["id", "habit_fk", "title", "completed"])
    .where("isDeleted", "is not", 1),
);

const swapValuesQuery = evolu.createQuery((db) =>
  db
    .selectFrom("subunit_values")
    .innerJoin("subunit_definitions", "subunit_definitions.id", "subunit_values.definition_fk")
    .select([
      "subunit_values.session_fk as session_fk",
      "subunit_definitions.key as def_key",
      "subunit_values.value as value",
    ])
    .where("subunit_definitions.key", "in", swapDefKeys() as never[])
    .where("subunit_definitions.isDeleted", "is not", 1)
    .where("subunit_values.isDeleted", "is not", 1),
);

const appStartQuery = evolu.createQuery((db) =>
  db
    .selectFrom("app_meta")
    .select(["value"])
    .where("key", "=", "app_started" as never)
    .where("isDeleted", "is not", 1),
);

const parseLadders = (raw: string | null): LadderOverrides | null => {
  if (raw == null) return null;
  try {
    return milestoneLaddersFromJson(raw as never) as unknown as LadderOverrides;
  } catch {
    return null;
  }
};

/**
 * `revision` is any cheap string that changes when the day's rows change — the
 * caller already holds them, so it costs nothing to build. A change schedules a
 * re-read; the first read runs immediately.
 */
export function useMilestoneDay(dayKey: string, revision: string): MilestoneDay | null {
  const [result, setResult] = useState<MilestoneDay | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const [habitRows, sessionRows, entryRows, swapRows, metaRows] = await Promise.all([
        evolu.loadQuery(habitsQuery),
        evolu.loadQuery(sessionsQuery),
        evolu.loadQuery(entriesQuery),
        evolu.loadQuery(swapValuesQuery),
        evolu.loadQuery(appStartQuery),
      ]);
      if (cancelled) return;

      const habits: MHabit[] = habitRows
        .filter((h) => h.kind != null && h.name != null)
        .map((h) => ({
          id: h.id,
          key: (h.key as string | null) ?? null,
          name: h.name as string,
          kind: h.kind as MHabit["kind"],
          count_unit: (h.count_unit as string | null) ?? null,
          ladders: parseLadders(h.milestone_ladders as string | null),
          derived_rules: parseDerivedRules(h.derived_rules),
          wave_gap_days: (h.wave_gap_days as number | null) ?? null,
        }));

      const sessions: MSession[] = sessionRows
        .filter((s) => s.day != null && s.habit_fk != null && s.measure_kind != null)
        .map((s) => ({
          id: s.id,
          habit_fk: s.habit_fk as string,
          entry_fk: (s.entry_fk as string | null) ?? null,
          day: s.day as string,
          measure_kind: s.measure_kind as MSession["measure_kind"],
          value: s.value,
          start: s.start,
          end: s.end,
          source: (s.source as string) ?? "manual",
        }));

      const cats = new Map<string, Record<string, string>>();
      for (const r of swapRows) {
        if (r.session_fk == null || r.def_key == null) continue;
        const rec = cats.get(r.session_fk as string) ?? {};
        rec[r.def_key as string] = (r.value as string) ?? "";
        cats.set(r.session_fk as string, rec);
      }

      setResult(
        deriveMilestoneDay({
          day: dayKey,
          habits,
          sessions,
          cats,
          entryTitle: new Map(
            entryRows.flatMap((e) => (e.title != null ? [[e.id as string, e.title as string]] : [])),
          ),
          entriesCompleted: entryRows
            .filter((e) => e.completed != null && e.habit_fk != null)
            .map((e) => ({
              id: e.id as string,
              habit_fk: e.habit_fk as string,
              completed: e.completed as string,
            })),
          appStart: (metaRows[0]?.value as string | undefined) ?? null,
          waveGapDefault: 30,
        }),
      );
    };

    // First read is immediate; a change to the day's rows schedules the next one
    // far enough out that a burst of field commits reads the store once.
    const delay = result == null ? 0 : 600;
    const t = setTimeout(() => void run(), delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey, revision]);

  return result;
}
