/**
 * The import modal's FETCH layer — a live query scoped to the door's habit:
 * the habit row (id + entry_attributes for the status seed) and the entry
 * slice the engine dedups/adopts against ([[Importer Field Mapping]]'s
 * `(source, external_id)` law + the adoption contract's backfill columns).
 * Live on purpose: covers landing mid-batch mark their result cards
 * in-library in real time.
 */
import { useMemo } from "react";
import { useQuery } from "@evolu/react";
import { NonEmptyString100 } from "@evolu/common";
import { evolu } from "../db/evolu";
import type { EntryId, HabitId } from "../db/schema";
import type { ExistingEntry } from "./engine";

export interface ImporterData {
  ready: boolean;
  habitId: HabitId | null;
  habitName: string;
  bundleHasStatus: boolean;
  existing: ExistingEntry[];
}

export function useImporterData(habitKey: string): ImporterData {
  const habitQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("habits")
          .select(["id", "name", "entry_attributes"])
          .where("key", "=", NonEmptyString100.orThrow(habitKey))
          .where("isDeleted", "is not", 1),
      ),
    [habitKey],
  );
  const habitRows = useQuery(habitQuery);
  const habit = habitRows[0] ?? null;
  const habitId = (habit?.id ?? null) as HabitId | null;

  const entriesQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("entries")
          .select([
            "id",
            "title",
            "source",
            "external_id",
            "cover",
            "description",
            "creators",
            "studios",
            "type",
            "genre",
            "series",
            "series_order",
            "words",
          ])
          .where("habit_fk", "=", (habitId ?? "never") as HabitId)
          .where("isDeleted", "is not", 1),
      ),
    [habitId],
  );
  const entryRows = useQuery(entriesQuery);

  return useMemo(() => {
    let bundleHasStatus = false;
    try {
      const raw = habit?.entry_attributes as string | null | undefined;
      bundleHasStatus = raw != null && (JSON.parse(raw) as string[]).includes("status");
    } catch {
      bundleHasStatus = false;
    }
    return {
      ready: habit != null,
      habitId,
      habitName: (habit?.name as string | null) ?? habitKey,
      bundleHasStatus,
      existing: entryRows.map((r) => ({
        id: r.id as EntryId,
        title: (r.title as string | null) ?? "",
        source: r.source as string | null,
        external_id: r.external_id as string | null,
        cover: r.cover as string | null,
        description: r.description as string | null,
        creators: r.creators as string | null,
        studios: r.studios as string | null,
        type: r.type as string | null,
        genre: r.genre as string | null,
        series: r.series as string | null,
        series_order: r.series_order as number | null,
        words: r.words as number | null,
      })),
    };
  }, [habit, habitId, habitKey, entryRows]);
}
