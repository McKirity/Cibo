/**
 * The search overlay's FETCH layer — one hook feeding BOTH faces (the simple
 * palette's index and Advanced Search's condition engine). Whole-store slice
 * fetches on the dashboard pattern; the overlay mounts on summon, so nothing
 * subscribes while the palette is closed. Every aggregate derives in TS.
 *
 * Scope: ACTIVE habits only — an archived habit's dashboard is a dead route
 * (the shell bails out of it), so neither the teleport nor the result doors
 * may offer one.
 */
import { useMemo } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { stringListFromJson } from "../db/schema";
import { sessionMinutes } from "../metrics/shapes";
import type { ASData, ASEntry, ASHabit, ASSession } from "./advancedSpec";

const habitsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("habits")
    .select([
      "id", "key", "name", "kind", "sub_type", "colour_slot", "icon",
      "archived", "measures_time", "measures_count", "count_unit", "sort_order",
    ])
    .where("isDeleted", "is not", 1)
    .orderBy("sort_order"),
);

const entriesQuery = evolu.createQuery((db) =>
  db
    .selectFrom("entries")
    .select([
      "id", "habit_fk", "title", "status", "type", "genre", "priority",
      "rating", "purchased", "creators", "studios", "series",
    ])
    .where("isDeleted", "is not", 1),
);

const sessionsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("sessions")
    .select(["habit_fk", "entry_fk", "day", "measure_kind", "value", "start", "end"])
    .where("isDeleted", "is not", 1),
);

const finalizedQuery = evolu.createQuery((db) =>
  db
    .selectFrom("days")
    .select(["date"])
    .where("finalized", "=", 1)
    .where("isDeleted", "is not", 1),
);

/** The ONE global status list (definition_fk empty — the library's pattern). */
const statusVocabQuery = evolu.createQuery((db) =>
  db
    .selectFrom("vocab_options")
    .select(["value", "sort_order"])
    .where("definition_fk", "is", null)
    .where("isDeleted", "is not", 1)
    .orderBy("sort_order"),
);

/** Every entry-scope picklist value app-wide (type = picklist · genre = multi). */
const entryVocabQuery = evolu.createQuery((db) =>
  db
    .selectFrom("vocab_options")
    .innerJoin("subunit_definitions", "subunit_definitions.id", "vocab_options.definition_fk")
    .select(["vocab_options.value as value", "subunit_definitions.data_type as data_type"])
    .where("subunit_definitions.scope", "=", "entry")
    .where("subunit_definitions.isDeleted", "is not", 1)
    .where("vocab_options.isDeleted", "is not", 1),
);

const decodeList = (raw: unknown): string[] => {
  if (raw == null) return [];
  try {
    return [...(stringListFromJson(raw as never) as readonly string[])];
  } catch {
    return [];
  }
};

export interface SearchData extends ASData {
  /** Recency-of-activity per habit id / entry id — the ranker's last tiebreak. */
  habitRecency: Map<string, string>;
  entryRecency: Map<string, string>;
  /** Definition-driven condition menus: vocab ∪ data (retired values derived). */
  statusVocab: string[];
  typeVocab: string[];
  genreVocab: string[];
}

export function useSearchData(): SearchData {
  const habitRows = useQuery(habitsQuery);
  const entryRows = useQuery(entriesQuery);
  const sessionRows = useQuery(sessionsQuery);
  const finalizedRows = useQuery(finalizedQuery);
  const statusRows = useQuery(statusVocabQuery);
  const vocabRows = useQuery(entryVocabQuery);

  const habits = useMemo<ASHabit[]>(
    () =>
      habitRows
        .filter((h) => !h.archived)
        .map((h) => ({
          id: h.id,
          key: h.key as string | null,
          name: (h.name as string | null) ?? "—",
          // habit-1: the app-wide null-slot fallback (unified 2026-07-30).
          colourSlot: (h.colour_slot as string | null) ?? "habit-1",
          icon: h.icon as string | null,
          kind: (h.kind as string | null) ?? "simple",
          subType: h.sub_type as string | null,
          measuresTime: h.measures_time === 1,
          measuresCount: h.measures_count === 1,
          countUnit: h.count_unit as string | null,
        })),
    [habitRows],
  );

  const activeIds = useMemo(() => new Set(habits.map((h) => h.id as string)), [habits]);

  const entries = useMemo<ASEntry[]>(
    () =>
      entryRows
        .filter((e) => e.habit_fk != null && activeIds.has(e.habit_fk as string))
        .map((e) => ({
          id: e.id,
          habitId: e.habit_fk as string,
          title: (e.title as string | null) ?? "—",
          status: e.status as string | null,
          type: e.type as string | null,
          genre: decodeList(e.genre),
          priority: e.priority as number | null,
          rating: e.rating as number | null,
          purchased: e.purchased === 1,
          creators: decodeList(e.creators),
          studios: decodeList(e.studios),
          series: e.series as string | null,
        })),
    [entryRows, activeIds],
  );

  const sessions = useMemo<ASSession[]>(
    () =>
      sessionRows.flatMap((s) => {
        if (s.day == null || s.habit_fk == null) return [];
        // A range session stores value:null — derive its minutes here (the
        // canonical shapes.sessionMinutes) so the pure layer reads one shape
        // (see ASSession.value). Count rows keep their own unit value.
        const value =
          s.measure_kind === "range"
            ? sessionMinutes({
                measure_kind: "range",
                value: null,
                start: s.start as string | null,
                end: s.end as string | null,
              })
            : (s.value as number | null);
        return [
          {
            habitId: s.habit_fk as string,
            entryId: s.entry_fk as string | null,
            day: s.day as string,
            measureKind: s.measure_kind as string | null,
            value,
          },
        ];
      }),
    [sessionRows],
  );

  const finalizedDays = useMemo(
    () => new Set(finalizedRows.flatMap((r) => (r.date != null ? [r.date as string] : []))),
    [finalizedRows],
  );

  const { habitRecency, entryRecency } = useMemo(() => {
    const hr = new Map<string, string>();
    const er = new Map<string, string>();
    for (const s of sessions) {
      const prev = hr.get(s.habitId);
      if (prev == null || s.day > prev) hr.set(s.habitId, s.day);
      if (s.entryId != null) {
        const pe = er.get(s.entryId);
        if (pe == null || s.day > pe) er.set(s.entryId, s.day);
      }
    }
    return { habitRecency: hr, entryRecency: er };
  }, [sessions]);

  const statusVocab = useMemo(
    () => statusRows.flatMap((r) => (r.value != null ? [r.value as string] : [])),
    [statusRows],
  );
  const { typeVocab, genreVocab } = useMemo(() => {
    const types = new Set<string>();
    const genres = new Set<string>();
    for (const r of vocabRows) {
      if (r.value == null) continue;
      if (r.data_type === "picklist") types.add(r.value as string);
      if (r.data_type === "picklist-multi") genres.add(r.value as string);
    }
    // data-minus-vocab: retired/quick-added values still filter (chunk-3 rule)
    for (const e of entries) {
      if (e.type != null) types.add(e.type);
      for (const g of e.genre) genres.add(g);
    }
    return {
      typeVocab: [...types].sort((a, b) => a.localeCompare(b)),
      genreVocab: [...genres].sort((a, b) => a.localeCompare(b)),
    };
  }, [vocabRows, entries]);

  return useMemo<SearchData>(
    () => ({
      habits,
      entries,
      sessions,
      finalizedDays,
      habitRecency,
      entryRecency,
      statusVocab,
      typeVocab,
      genreVocab,
    }),
    [habits, entries, sessions, finalizedDays, habitRecency, entryRecency, statusVocab, typeVocab, genreVocab],
  );
}
