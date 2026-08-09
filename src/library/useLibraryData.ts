/**
 * The Library screen's FETCH layer — the useConsumptionData pattern: Evolu live
 * queries scoped to ONE consumption habit, SQL slices only, every aggregate
 * derived in TS. The same hook feeds the screen and both of its modals (the
 * creation modal needs the vocab + titles for the nudge; bulk edit needs the
 * per-entry session counts for the blast radius).
 */
import { useMemo } from "react";
import { useQuery } from "@evolu/react";
import { NonEmptyString100 } from "@evolu/common";
import { evolu } from "../db/evolu";
import {
  entryAttributesFromJson,
  stringListFromJson,
  type HabitId,
  type SubunitDefinitionId,
} from "../db/schema";
import type { LibEntry } from "./librarySpec";
import { orderedStatusVocab } from "./librarySpec";
import { entryMediumColumn } from "../db/entryMedium";

/** The ONE global status list — definition_fk empty, anchors seeded first. */
const statusVocabQuery = evolu.createQuery((db) =>
  db
    .selectFrom("vocab_options")
    .select(["value", "sort_order"])
    .where("definition_fk", "is", null)
    .where("isDeleted", "is not", 1)
    .orderBy("sort_order"),
);

export interface LibraryData {
  ready: boolean;
  habitId: HabitId | null;
  name: string;
  colourSlot: string;
  icon: string | null;
  /** "consumption" | "creation" (project habits only own libraries/entries). */
  subType: string | null;
  entries: LibEntry[];
  /**
   * Declared entry-level `type` picklist (empty = no Medium — the dashed
   * delta). Consumption only: a CREATION habit's entry-scope picklist is its
   * Fandom/Engine field, not a Medium (`writing_fandom` shares the shape).
   */
  typeVocab: string[];
  /** The habit's genre picklist values + the definition the quick-add writes to. */
  genreVocab: string[];
  genreDefinitionId: SubunitDefinitionId | null;
  /**
   * Creation's secondary identity field, definition-driven: the entry-scope
   * picklist's label ("Fandom" · "Engine"), its vocab, its definition id
   * (quick-add), and which entries column it writes (keyed off the
   * definition's key suffix — implementation, recorded).
   */
  creationField: {
    label: string;
    vocab: string[];
    definitionId: SubunitDefinitionId;
    column: "fandom" | "gamedev_engine";
  } | null;
  /** Global status list, dropdown order (anchors first). */
  statusVocab: string[];
  /** Whether the habit's entry bundle carries each modal-relevant attribute. */
  bundle: Set<string>;
}

/**
 * @param skipDerivation when true, the queries still subscribe (hook rules —
 *   the call site cannot be conditional) but the O(sessions) per-entry
 *   aggregation is not run. The library MODALS pass this: they take their data
 *   from the parent screen by prop and only call this hook to satisfy the rules
 *   of hooks, so before 2026-08-04 the whole derivation ran TWICE per store
 *   change — in exactly the surfaces (bulk apply, delete) where the store
 *   changes. Evolu dedupes the SQL; it does not dedupe our arithmetic.
 */
export function useLibraryData(habitKey: string, skipDerivation = false): LibraryData {
  const habitQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("habits")
          .select(["id", "name", "colour_slot", "icon", "sub_type", "entry_attributes"])
          .where("key", "=", NonEmptyString100.orThrow(habitKey))
          .where("isDeleted", "is not", 1),
      ),
    [habitKey],
  );
  const habitRows = useQuery(habitQuery);
  const habit = habitRows[0] ?? null;
  const habitId = (habit?.id ?? "-") as HabitId;

  const entriesQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("entries")
          .selectAll()
          .where("habit_fk", "=", habitId)
          .where("isDeleted", "is not", 1),
      ),
    [habitId],
  );
  const sessionsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("sessions")
          .select(["entry_fk", "day", "measure_kind", "value"])
          .where("habit_fk", "=", habitId)
          .where("isDeleted", "is not", 1),
      ),
    [habitId],
  );
  // Entry-scope definitions: `picklist` = the Medium type, `picklist-multi` =
  // genre. One query resolves both plus their vocab rows.
  const defsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("subunit_definitions")
          .select(["id", "key", "label", "data_type"])
          .where("habit_fk", "=", habitId)
          .where("scope", "=", "entry")
          .where("isDeleted", "is not", 1),
      ),
    [habitId],
  );
  const entryVocabQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("vocab_options")
          .innerJoin("subunit_definitions", "subunit_definitions.id", "vocab_options.definition_fk")
          .select([
            "vocab_options.value as value",
            "vocab_options.sort_order as sort_order",
            "subunit_definitions.data_type as data_type",
          ])
          .where("subunit_definitions.habit_fk", "=", habitId)
          .where("subunit_definitions.scope", "=", "entry")
          .where("subunit_definitions.isDeleted", "is not", 1)
          .where("vocab_options.isDeleted", "is not", 1)
          .orderBy("vocab_options.sort_order"),
      ),
    [habitId],
  );

  const entryRows = useQuery(entriesQuery);
  const sessionRows = useQuery(sessionsQuery);
  const defRows = useQuery(defsQuery);
  const vocabRows = useQuery(entryVocabQuery);
  const statusRows = useQuery(statusVocabQuery);

  const entries = useMemo<LibEntry[]>(() => {
    if (skipDerivation) return [];
    // Per-entry aggregates in one pass over the habit's sessions.
    const agg = new Map<string, { hours: number; lastDay: string | null; count: number }>();
    for (const s of sessionRows) {
      if (s.entry_fk == null || s.day == null) continue;
      const a = agg.get(s.entry_fk) ?? { hours: 0, lastDay: null, count: 0 };
      a.count += 1;
      if (s.measure_kind === "time" && s.value != null) a.hours += s.value / 60;
      if (a.lastDay == null || s.day > a.lastDay) a.lastDay = s.day;
      agg.set(s.entry_fk, a);
    }
    return entryRows.map((r) => {
      const a = agg.get(r.id) ?? { hours: 0, lastDay: null, count: 0 };
      return {
        id: r.id,
        title: (r.title as string | null) ?? "—",
        status: r.status as string | null,
        type: r.type as string | null,
        genre: decodeList(r.genre),
        priority: r.priority as number | null,
        rating: r.rating as number | null,
        purchased: r.purchased === 1,
        creators: decodeList(r.creators),
        studios: decodeList(r.studios),
        cover: r.cover as string | null,
        banner: r.banner as string | null,
        hours: a.hours,
        lastDay: a.lastDay,
        sessionCount: a.count,
        createdAt: String(r.createdAt ?? ""),
      };
    });
  }, [entryRows, sessionRows, skipDerivation]);

  const subType = (habit?.sub_type as string | null) ?? null;
  const picklistValues = useMemo(
    () =>
      vocabRows.flatMap((r) => (r.data_type === "picklist" && r.value != null ? [r.value as string] : [])),
    [vocabRows],
  );
  const typeVocab = useMemo(
    () => (subType === "consumption" ? picklistValues : []),
    [subType, picklistValues],
  );
  const genreVocab = useMemo(
    () =>
      vocabRows.flatMap((r) =>
        r.data_type === "picklist-multi" && r.value != null ? [r.value as string] : [],
      ),
    [vocabRows],
  );
  const genreDefinitionId = useMemo(
    () => (defRows.find((d) => d.data_type === "picklist-multi")?.id ?? null) as SubunitDefinitionId | null,
    [defRows],
  );
  const creationField = useMemo(() => {
    if (subType !== "creation") return null;
    const def = defRows.find((d) => d.data_type === "picklist");
    if (def?.id == null) return null;
    // The column comes from db/entryMedium.ts — the one owner of this
    // derivation since bug `vocab-1`. Same answer this made for itself; the
    // point is that the vocabulary rename now reads it from the same place.
    const column = entryMediumColumn("creation", String(def.data_type), String(def.key ?? ""));
    if (column !== "fandom" && column !== "gamedev_engine") return null;
    return {
      label: (def.label as string | null) ?? "Fandom",
      vocab: picklistValues,
      definitionId: def.id as SubunitDefinitionId,
      column,
    };
  }, [subType, defRows, picklistValues]);
  const statusVocab = useMemo(
    () =>
      orderedStatusVocab(
        statusRows.flatMap((r) =>
          r.value != null ? [{ value: r.value as string, sort_order: (r.sort_order as number) ?? 0 }] : [],
        ),
      ),
    [statusRows],
  );
  const bundle = useMemo(() => {
    const raw = habit?.entry_attributes;
    if (raw == null) return new Set<string>();
    try {
      return new Set<string>(entryAttributesFromJson(raw as never) as readonly string[]);
    } catch {
      return new Set<string>();
    }
  }, [habit]);

  return useMemo<LibraryData>(
    () => ({
      ready: habit != null,
      habitId: habit != null ? (habit.id as HabitId) : null,
      name: habit?.name ?? habitKey,
      // habit-1: the app-wide null-slot fallback (unified 2026-07-30 — this
      // read habit-2 while five other screens read habit-1).
      colourSlot: habit?.colour_slot ?? "habit-1",
      icon: (habit?.icon as string | null) ?? null,
      subType: (habit?.sub_type as string | null) ?? null,
      entries,
      typeVocab,
      genreVocab,
      genreDefinitionId,
      creationField,
      statusVocab,
      bundle,
    }),
    [
      habit,
      habitKey,
      entries,
      typeVocab,
      genreVocab,
      genreDefinitionId,
      creationField,
      statusVocab,
      bundle,
    ],
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
