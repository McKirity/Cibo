/**
 * The version-gated seed append (Habit Lifecycle & Creator): built-ins ship in
 * numbered batches; `app_meta` stores the applied seed version; only newer
 * batches run. Stable habit `key`s additionally block double-seeding (the
 * belt-and-braces guard for synced devices), and deleted habits never
 * resurrect (a key found on an `isDeleted` row still counts as present).
 *
 * Batch 1 = the canonical 11 habits (Habit Registry order + the three ruled
 * seed deltas recorded in the Data Layer step note), the global `status`
 * vocab, and the per-habit definition + vocab rows.
 *
 * ALL 11 habits arrive `archived` — activation is the first-run setup screen's
 * job, never the seeder's.
 */
import {
  FiniteNumber,
  NonEmptyString100,
  NonEmptyString1000,
  NonNegativeInt,
  type Evolu,
} from "@evolu/common";
import {
  Schema,
  derivedRulesToJson,
  entryAttributesToJson,
  type DerivedRule,
  type EntryAttribute,
} from "./schema";

// Brand constructors — seed values are compile-time constants, so orThrow is safe.
const s100 = (v: string) => NonEmptyString100.orThrow(v);
const s1000 = (v: string) => NonEmptyString1000.orThrow(v);
const num = (v: number) => FiniteNumber.orThrow(v);

export const SEED_VERSION = 1;

type CiboEvolu = Evolu<typeof Schema>;

// ── Batch 1 data ─────────────────────────────────────────────────────────────

interface DefinitionSeed {
  key: string;
  label: string;
  scope: "entry" | "session";
  data_type: "picklist" | "picklist-multi" | "flag";
  /** Vocab options in dropdown order; empty = anchor only (quick-add in use). */
  vocab: string[];
}

interface HabitSeed {
  key: string;
  name: string;
  kind: "project" | "simple" | "range";
  sub_type?: "consumption" | "creation";
  colour_slot: string;
  measures_time: boolean;
  measures_count: boolean;
  count_unit?: string;
  range_max_midnights?: number;
  entry_attributes?: EntryAttribute[];
  derived_rules?: DerivedRule[];
  definitions: DefinitionSeed[];
}

/** The keystone's fixed menu, in the consumption habits' canonical bundle. */
const CONSUMPTION_BUNDLE: EntryAttribute[] = [
  "status",
  "genre",
  "rating",
  "purchased",
  "priority",
];

/**
 * Registry order = canonical order = colour slots habit-1 … habit-11 =
 * seeded sort_order 1 … 11.
 */
const BATCH_1: HabitSeed[] = [
  {
    key: "writing",
    name: "Writing",
    kind: "project",
    sub_type: "creation",
    colour_slot: "habit-1",
    measures_time: true,
    measures_count: true,
    count_unit: "words",
    entry_attributes: ["status"],
    definitions: [
      {
        key: "writing_stage",
        label: "Stage",
        scope: "session",
        data_type: "picklist",
        vocab: ["Outline", "Summary", "Rough Draft", "Final Draft", "Submission"],
      },
      {
        key: "writing_wiki",
        label: "Wiki",
        scope: "session",
        data_type: "picklist",
        vocab: ["Characters", "Settings", "History", "Groups", "Concepts", "Objects"],
      },
      // Fandom anchor: writing only (user-ruled 2026-07-20). Values quick-add in use.
      { key: "writing_fandom", label: "Fandom", scope: "entry", data_type: "picklist", vocab: [] },
    ],
  },
  {
    key: "gaming",
    name: "Gaming",
    kind: "project",
    sub_type: "consumption",
    colour_slot: "habit-2",
    measures_time: true,
    measures_count: false,
    entry_attributes: CONSUMPTION_BUNDLE,
    definitions: [
      // No entry-level `type` — canon: gaming logs have no type.
      { key: "gaming_genre", label: "Genre", scope: "entry", data_type: "picklist-multi", vocab: [] },
    ],
  },
  {
    key: "reading",
    name: "Reading",
    kind: "project",
    sub_type: "consumption",
    colour_slot: "habit-3",
    measures_time: true,
    measures_count: false,
    entry_attributes: CONSUMPTION_BUNDLE,
    definitions: [
      {
        key: "reading_type",
        label: "Type",
        scope: "entry",
        data_type: "picklist",
        vocab: ["Novel", "Manga", "Anthology", "Short Story", "Comic"],
      },
      // Calibre imports curated genres and auto-adds them here.
      { key: "reading_genre", label: "Genre", scope: "entry", data_type: "picklist-multi", vocab: [] },
    ],
  },
  {
    key: "media",
    name: "Media",
    kind: "project",
    sub_type: "consumption",
    colour_slot: "habit-4",
    measures_time: true,
    measures_count: false,
    entry_attributes: CONSUMPTION_BUNDLE,
    definitions: [
      {
        key: "media_type",
        label: "Type",
        scope: "entry",
        data_type: "picklist",
        vocab: ["Youtube", "Anime", "Movie", "TV Show"],
      },
      { key: "media_genre", label: "Genre", scope: "entry", data_type: "picklist-multi", vocab: [] },
    ],
  },
  {
    key: "keyboard",
    name: "Keyboard",
    kind: "simple",
    colour_slot: "habit-5",
    measures_time: false,
    // Seed delta (user, 2026-07-05): Keyboard gains a count measure — it's typing.
    measures_count: true,
    count_unit: "words",
    definitions: [
      {
        key: "keyboard_board",
        label: "Board",
        scope: "session",
        data_type: "picklist",
        vocab: [
          "QK65 Classic",
          "Pavlov65",
          "Neo65 CU",
          "Neo60 Cu",
          "Neo65 Core Plus",
          "Dashing Run",
          "Tofu60 2.0",
          "Mode65",
          "Gingko65",
        ],
      },
    ],
  },
  {
    key: "sleep",
    name: "Sleep",
    kind: "range",
    colour_slot: "habit-6",
    measures_time: false,
    measures_count: false,
    range_max_midnights: 1,
    // Sleep's derived family, as rules-as-data (results computed, never stored).
    derived_rules: [
      { template: "timeOfDay", label: "noon", endpoint: "end", op: "before", time: "12:00" },
      { template: "duration", label: "8h", op: "gte", minutes: 480 },
    ] as DerivedRule[],
    definitions: [
      // Non-derivable stored flag (Subunits tri-split).
      { key: "sleep_med", label: "Med", scope: "session", data_type: "flag", vocab: [] },
    ],
  },
  {
    key: "walking",
    name: "Walking",
    kind: "simple",
    colour_slot: "habit-7",
    // Measureless — existence is the datum (legal: simple-only).
    measures_time: false,
    measures_count: false,
    definitions: [],
  },
  {
    key: "embroidery",
    name: "Embroidery",
    kind: "simple",
    colour_slot: "habit-8",
    measures_time: true,
    measures_count: false,
    definitions: [],
  },
  {
    key: "drawing",
    name: "Drawing",
    kind: "simple",
    colour_slot: "habit-9",
    measures_time: true,
    measures_count: false,
    definitions: [],
  },
  {
    key: "coding",
    name: "Coding",
    kind: "project",
    // Seed delta (user, 2026-07-13): re-cut project · creation; entries = coding projects.
    sub_type: "creation",
    colour_slot: "habit-10",
    measures_time: true,
    measures_count: false,
    entry_attributes: ["status"],
    definitions: [
      {
        key: "coding_language",
        label: "Language",
        scope: "session",
        data_type: "picklist",
        // Re-seeded per the same delta (Go dropped).
        vocab: ["JavaScript", "HTML", "CSS", "TypeScript", "C#", "Python", "Rust"],
      },
    ],
  },
  {
    key: "gamedev",
    name: "Gamedev",
    kind: "project",
    sub_type: "creation",
    colour_slot: "habit-11",
    measures_time: true,
    measures_count: false,
    // Seed delta (user, 2026-07-13): bundle opt-in = status + genre.
    entry_attributes: ["status", "genre"],
    definitions: [
      {
        key: "gamedev_type",
        label: "Type",
        scope: "session",
        data_type: "picklist",
        vocab: ["Mechanics", "Level Design", "Story", "Asset Creation", "UI"],
      },
      { key: "gamedev_genre", label: "Genre", scope: "entry", data_type: "picklist-multi", vocab: [] },
      { key: "gamedev_engine", label: "Engine", scope: "entry", data_type: "picklist", vocab: [] },
    ],
  },
];

/** The ONE global status list (definition_fk empty), in dropdown order. */
const GLOBAL_STATUS_VOCAB = ["Current", "Dropped", "Finished", "Hiatus", "Planned"];

// ── The gate + the append ────────────────────────────────────────────────────

export interface SeedResult {
  /** Version found before this run (0 = fresh store). */
  foundVersion: number;
  /** Whether any batch ran. */
  applied: boolean;
}

/**
 * Runs at every launch. Reads the applied seed version from app_meta, applies
 * only newer batches, records the new version. Safe to call repeatedly.
 */
export async function runSeed(evolu: CiboEvolu): Promise<SeedResult> {
  const metaQuery = evolu.createQuery((db) =>
    db
      .selectFrom("app_meta")
      .selectAll()
      .where("key", "=", s100("seed_version"))
      .where("isDeleted", "is not", 1),
  );
  const metaRows = await evolu.loadQuery(metaQuery);
  const liveMeta = metaRows[0];
  const foundVersion = liveMeta ? Number(liveMeta.value) : 0;

  if (foundVersion >= SEED_VERSION) return { foundVersion, applied: false };

  if (foundVersion < 1) await seedBatch1(evolu);
  // Future batches: if (foundVersion < 2) await seedBatch2(evolu); …

  if (liveMeta) {
    evolu.update("app_meta", { id: liveMeta.id, value: s1000(String(SEED_VERSION)) });
  } else {
    evolu.insert("app_meta", {
      key: s100("seed_version"),
      value: s1000(String(SEED_VERSION)),
    });
  }
  return { foundVersion, applied: true };
}

async function seedBatch1(evolu: CiboEvolu): Promise<void> {
  // Belt and braces: stable keys block double-seeding. Deliberately NOT
  // filtering isDeleted — a deleted habit's key still counts as present, so
  // deleted habits never resurrect.
  const existingQuery = evolu.createQuery((db) =>
    db.selectFrom("habits").select(["key"]),
  );
  const existing = await evolu.loadQuery(existingQuery);
  const existingKeys = new Set<string>(
    existing.map((r) => r.key).filter((k): k is NonNullable<typeof k> => k != null),
  );

  BATCH_1.forEach((habit, i) => {
    if (existingKeys.has(habit.key)) return;

    const inserted = evolu.insert("habits", {
      key: s100(habit.key),
      name: s100(habit.name),
      kind: habit.kind,
      sub_type: habit.sub_type ?? null,
      colour_slot: s100(habit.colour_slot),
      icon: null,
      measures_time: habit.measures_time ? 1 : 0,
      measures_count: habit.measures_count ? 1 : 0,
      count_unit: habit.count_unit != null ? s100(habit.count_unit) : null,
      range_max_midnights:
        habit.range_max_midnights != null
          ? NonNegativeInt.orThrow(habit.range_max_midnights)
          : null,
      entry_attributes: habit.entry_attributes
        ? entryAttributesToJson(habit.entry_attributes)
        : null,
      derived_rules: habit.derived_rules
        ? derivedRulesToJson(habit.derived_rules)
        : null,
      wave_gap_days: null,
      archived: 1, // ALL built-ins arrive archived.
      sort_order: num(i + 1), // Registry order.
    });
    if (!inserted.ok) {
      console.error(`Seed: habit "${habit.key}" failed`, inserted.error);
      return;
    }
    const habitId = inserted.value.id;

    for (const def of habit.definitions) {
      const defInserted = evolu.insert("subunit_definitions", {
        habit_fk: habitId,
        key: s100(def.key),
        label: s100(def.label),
        scope: def.scope,
        data_type: def.data_type,
      });
      if (!defInserted.ok) {
        console.error(`Seed: definition "${def.key}" failed`, defInserted.error);
        continue;
      }
      def.vocab.forEach((value, vi) => {
        evolu.insert("vocab_options", {
          definition_fk: defInserted.value.id,
          value: s100(value),
          sort_order: num(vi + 1),
        });
      });
    }
  });

  // The ONE global status list — definition_fk empty.
  GLOBAL_STATUS_VOCAB.forEach((value, i) => {
    evolu.insert("vocab_options", {
      definition_fk: null,
      value: s100(value),
      sort_order: num(i + 1),
    });
  });
}
