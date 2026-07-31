/**
 * The Map's FETCH layer — three whole-store live queries (the browse screen is
 * dashboard-class: a live query is cheap here, per the recorded perf lesson).
 * SQL slices only; grouping/sorting derived in TS.
 *
 * - habits: active project habits in `sort_order` (the 2026-07-30 rulings:
 *   project-only per the drawn face; order = the rail/settings order).
 * - entries: id + title + habit_fk only — title-lines are all the Map renders.
 * - first logged day: ONE row (orderBy day, limit 1) → the Time trunk's floor.
 */
import { useMemo } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";

const habitsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("habits")
    .select(["id", "key", "name", "kind", "colour_slot", "icon", "archived"])
    .where("isDeleted", "is not", 1)
    .orderBy("sort_order"),
);

const entriesQuery = evolu.createQuery((db) =>
  db
    .selectFrom("entries")
    .select(["id", "title", "habit_fk"])
    .where("isDeleted", "is not", 1),
);

const firstDayQuery = evolu.createQuery((db) =>
  db
    .selectFrom("sessions")
    .select(["day"])
    .where("isDeleted", "is not", 1)
    .orderBy("day")
    .limit(1),
);

export interface MapHabit {
  id: string;
  key: string;
  name: string;
  colourSlot: string;
  icon: string | null;
}
export interface MapEntry {
  id: string;
  title: string;
}
export interface MapData {
  habits: MapHabit[];
  entriesByHabit: Map<string, MapEntry[]>;
  /** First-ever logged year; the current year when the store is empty. */
  firstYear: number;
}

export function useMapData(todayYear: number): MapData {
  const habitRows = useQuery(habitsQuery);
  const entryRows = useQuery(entriesQuery);
  const firstDayRows = useQuery(firstDayQuery);

  const habits = useMemo<MapHabit[]>(
    () =>
      habitRows
        .filter((h) => !h.archived && h.kind === "project" && h.key != null)
        .map((h) => ({
          id: h.id as string,
          key: h.key as string,
          name: (h.name as string | null) ?? "—",
          colourSlot: (h.colour_slot as string | null) ?? "habit-1",
          icon: (h.icon as string | null) ?? null,
        })),
    [habitRows],
  );

  const entriesByHabit = useMemo(() => {
    // Filter FIRST (2026-07-30): only listed habits' entries are grouped and
    // sorted — an archived habit's hundreds of titles used to be sorted and
    // then dropped by the render.
    const listed = new Set(habits.map((h) => h.id));
    const by = new Map<string, MapEntry[]>();
    for (const e of entryRows) {
      if (e.title == null || !listed.has(e.habit_fk as string)) continue;
      const list = by.get(e.habit_fk as string);
      const row = { id: e.id as string, title: e.title as string };
      if (list) list.push(row);
      else by.set(e.habit_fk as string, [row]);
    }
    // entries within a habit stay ALPHABETICAL as drawn (the ruling kept it)
    for (const list of by.values()) list.sort((a, b) => a.title.localeCompare(b.title));
    return by;
  }, [entryRows, habits]);

  const firstYear = useMemo(() => {
    const day = firstDayRows[0]?.day as string | undefined;
    return day != null ? Number(day.slice(0, 4)) : todayYear;
  }, [firstDayRows, todayYear]);

  return { habits, entriesByHabit, firstYear };
}
