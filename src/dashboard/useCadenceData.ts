/**
 * The cadence dashboards' FETCH layer (chunk 4). Cadence is CROSS-habit, so
 * unlike the per-habit hooks this loads the whole store once — every habit,
 * every session, every entry, the finalized-day ledger, and the session
 * categorical values (the expansions split by stage/wiki/board/language).
 * Period scoping is a pure-TS filter downstream (scope switches never re-hit
 * SQL); the growth spike proved whole-store loads hold the <100 ms budget at
 * 15 years.
 */
import { useMemo } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { waveGapDefault } from "../settings/store";

const habitsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("habits")
    .select([
      "id", "key", "name", "kind", "sub_type", "colour_slot", "archived",
      "measures_time", "measures_count", "count_unit", "derived_rules", "sort_order",
      "wave_gap_days",
    ])
    .where("isDeleted", "is not", 1)
    .orderBy("sort_order"),
);

const sessionsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("sessions")
    // `source` rides along for Daily's milestone catalog, which must EXCLUDE
    // `derived` count sessions (Keyboard's word count IS Writing's, so counting
    // both would cross 100,000 words twice and say the same thing twice).
    .select(["id", "habit_fk", "entry_fk", "day", "measure_kind", "value", "start", "end", "source"])
    .where("isDeleted", "is not", 1),
);

const entriesQuery = evolu.createQuery((db) =>
  db
    .selectFrom("entries")
    .select(["id", "habit_fk", "title", "status", "rating"])
    .where("isDeleted", "is not", 1),
);

const daysQuery = evolu.createQuery((db) =>
  db.selectFrom("days").select(["date"]).where("finalized", "=", 1).where("isDeleted", "is not", 1),
);

const subunitValuesQuery = evolu.createQuery((db) =>
  db
    .selectFrom("subunit_values")
    .innerJoin("subunit_definitions", "subunit_definitions.id", "subunit_values.definition_fk")
    .select([
      "subunit_values.session_fk as session_fk",
      "subunit_definitions.key as def_key",
      "subunit_definitions.label as def_label",
      "subunit_definitions.data_type as data_type",
      "subunit_values.value as value",
    ])
    .where("subunit_definitions.scope", "=", "session")
    .where("subunit_definitions.isDeleted", "is not", 1)
    .where("subunit_values.isDeleted", "is not", 1),
);

export interface CadHabit {
  id: string;
  key: string;
  name: string;
  kind: "project" | "simple" | "range";
  subType: "consumption" | "creation" | null;
  colour: string; // "habit-N" slot name
  archived: boolean;
  measuresTime: boolean;
  measuresCount: boolean;
  countUnit: string | null;
  derivedRules: string | null; // raw JSON (range rules-as-data)
  sortOrder: number;
  /** Per-habit wave-gap override (null = the 30-day default) — the review's
   *  anniversaries/churn must cluster the same waves the entry dashboard does. */
  waveGapDays: number | null;
}

export interface CadSession {
  id: string;
  habitId: string;
  entryId: string | null;
  day: string;
  kind: "time" | "count" | "range" | "none";
  value: number | null;
  start: string | null;
  end: string | null;
  /** Provenance — Daily's milestone catalog filters on it. */
  source: string;
}

export interface CadEntry {
  id: string;
  habitId: string;
  title: string;
  status: string | null;
  rating: number | null;
}

export interface CadenceData {
  ready: boolean;
  habits: CadHabit[];
  sessions: CadSession[];
  entries: CadEntry[];
  finalized: Set<string>;
  /** session id → { def key → value } (labels via defLabels). */
  valueBySession: Map<string, Record<string, string>>;
  /** def key → display label ("writing_stage" → "Stage"). */
  defLabels: Map<string, string>;
  /** def key → is a flag (sleep `med`) rather than a picklist. */
  flagDefs: Set<string>;
}

export function useCadenceData(): CadenceData {
  const habitRows = useQuery(habitsQuery);
  const sessionRows = useQuery(sessionsQuery);
  const entryRows = useQuery(entriesQuery);
  const dayRows = useQuery(daysQuery);
  const valueRows = useQuery(subunitValuesQuery);

  const habits = useMemo<CadHabit[]>(
    () =>
      habitRows
        .filter((h) => h.key != null && h.kind != null)
        .map((h) => ({
          id: h.id,
          key: h.key as string,
          name: (h.name as string) ?? (h.key as string),
          kind: h.kind as CadHabit["kind"],
          subType: (h.sub_type as CadHabit["subType"]) ?? null,
          colour: (h.colour_slot as string) ?? "habit-1",
          archived: h.archived === 1,
          measuresTime: h.measures_time === 1,
          measuresCount: h.measures_count === 1,
          countUnit: (h.count_unit as string | null) ?? null,
          derivedRules: (h.derived_rules as string | null) ?? null,
          sortOrder: (h.sort_order as number) ?? 0,
          // Per-habit override, else the Settings global (step 10; the spec's
          // own `?? 30` stays as the final backstop).
          waveGapDays: (h.wave_gap_days as number | null) ?? waveGapDefault(),
        })),
    [habitRows],
  );

  const sessions = useMemo<CadSession[]>(
    () =>
      sessionRows
        .filter((r) => r.day != null && r.habit_fk != null && r.measure_kind != null)
        .map((r) => ({
          id: r.id,
          habitId: r.habit_fk as string,
          entryId: r.entry_fk,
          day: r.day as string,
          kind: r.measure_kind as CadSession["kind"],
          value: r.value,
          start: r.start,
          end: r.end,
          source: (r.source as string | null) ?? "manual",
        })),
    [sessionRows],
  );

  const entries = useMemo<CadEntry[]>(
    () =>
      entryRows
        .filter((e) => e.habit_fk != null && e.title != null)
        .map((e) => ({
          id: e.id,
          habitId: e.habit_fk as string,
          title: e.title as string,
          status: e.status as string | null,
          rating: (e.rating as number | null) ?? null,
        })),
    [entryRows],
  );

  const finalized = useMemo(
    () => new Set<string>(dayRows.flatMap((r) => (r.date != null ? [r.date as string] : []))),
    [dayRows],
  );

  const { valueBySession, defLabels, flagDefs } = useMemo(() => {
    const bySession = new Map<string, Record<string, string>>();
    const labels = new Map<string, string>();
    const flags = new Set<string>();
    for (const r of valueRows) {
      if (r.session_fk == null || r.def_key == null) continue;
      const key = r.def_key as string;
      labels.set(key, (r.def_label as string) ?? key);
      if (r.data_type === "flag") flags.add(key);
      const rec = bySession.get(r.session_fk as string) ?? {};
      rec[key] = (r.value as string) ?? "1";
      bySession.set(r.session_fk as string, rec);
    }
    return { valueBySession: bySession, defLabels: labels, flagDefs: flags };
  }, [valueRows]);

  // Memoize the wrapper object so its identity is stable across renders —
  // otherwise the cadence dashboard's whole-store build memo (keyed on it)
  // never hits and re-derives the cross-habit model on every render.
  return useMemo<CadenceData>(
    () => ({
      ready: habitRows.length > 0,
      habits,
      sessions,
      entries,
      finalized,
      valueBySession,
      defLabels,
      flagDefs,
    }),
    [habitRows.length, habits, sessions, entries, finalized, valueBySession, defLabels, flagDefs],
  );
}
