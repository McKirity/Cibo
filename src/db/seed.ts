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
  String as EvoluString,
  type Evolu,
} from "@evolu/common";
import { KEEPSAKE_SEEDS } from "./keepsakeSeeds";
import {
  Schema,
  derivedRulesToJson,
  entryAttributesToJson,
  milestoneLaddersToJson,
  type DerivedRule,
  type EntryAttribute,
  type MilestoneLadders,
} from "./schema";

// Brand constructors — seed values are compile-time constants, so orThrow is safe.
const s100 = (v: string) => NonEmptyString100.orThrow(v);
const s1000 = (v: string) => NonEmptyString1000.orThrow(v);
const num = (v: number) => FiniteNumber.orThrow(v);

export const SEED_VERSION = 6;

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
        vocab: ["Novel", "Manga", "Fanfiction", "Short Story", "Comic"],
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
    // Seed delta (user, 2026-07-22): DOWNGRADED to simple — the habit tracks a
    // language-learning journey, not projects; it never had real entries (the
    // keystone's project hard test = "has entries"). Supersedes the 2026-07-13
    // project·creation re-cut. Existing stores migrate via seedBatch3.
    kind: "simple",
    colour_slot: "habit-10",
    measures_time: true,
    measures_count: false,
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
  if (foundVersion < 2) await seedBatch2(evolu);
  // There is no batch-3 step: the coding downgrade shipped as batch 3 but its
  // habits write was dropped silently while the gate still recorded version 3,
  // stranding the store (diagnosed 2026-07-23 from evolu_history). Batch 4
  // re-runs the same idempotent flip, verified this time.
  if (foundVersion < 4) await seedBatch4(evolu);
  if (foundVersion < 5) await seedBatch5(evolu);
  if (foundVersion < 6) await seedBatch6(evolu);
  // Future batches: if (foundVersion < 7) await seedBatch7(evolu); …

  // A batch that throws above skips this on purpose: the gate must never
  // record a version whose batch didn't verifiably land.
  const recorded = liveMeta
    ? evolu.update("app_meta", { id: liveMeta.id, value: s1000(String(SEED_VERSION)) })
    : evolu.insert("app_meta", {
        key: s100("seed_version"),
        value: s1000(String(SEED_VERSION)),
      });
  if (!recorded.ok) console.error("Seed: recording seed_version failed", recorded.error);
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

  // Track write outcomes: if ANY insert is rejected we throw at the end so
  // runSeed never records the version on a partial batch (the batch-3 latch
  // lesson — an unchecked drop must not be mistaken for a completed seed).
  let ok = true;

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
      milestone_ladders: ENTRY_HOUR_LADDERS[habit.key]
        ? milestoneLaddersToJson(ENTRY_HOUR_LADDERS[habit.key] as unknown as MilestoneLadders)
        : null,
      // The six non-project habits' cover-wall art. Project habits get none,
      // ever — their tiles ARE their entry art.
      keepsake_snippet: keepsakeFor(habit.key),
      archived: 1, // ALL built-ins arrive archived.
      sort_order: num(i + 1), // Registry order.
    });
    if (!inserted.ok) {
      console.error(`Seed: habit "${habit.key}" failed`, inserted.error);
      ok = false;
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
        ok = false;
        continue;
      }
      def.vocab.forEach((value, vi) => {
        const vr = evolu.insert("vocab_options", {
          definition_fk: defInserted.value.id,
          value: s100(value),
          sort_order: num(vi + 1),
        });
        if (!vr.ok) {
          console.error(`Seed: vocab "${def.key}/${value}" failed`, vr.error);
          ok = false;
        }
      });
    }
  });

  // The ONE global status list — definition_fk empty.
  GLOBAL_STATUS_VOCAB.forEach((value, i) => {
    const vr = evolu.insert("vocab_options", {
      definition_fk: null,
      value: s100(value),
      sort_order: num(i + 1),
    });
    if (!vr.ok) {
      console.error(`Seed: status vocab "${value}" failed`, vr.error);
      ok = false;
    }
  });

  // Hold the gate: a rejected write means the batch is incomplete, so throw and
  // let runSeed skip recording the version — the batch retries next launch.
  if (!ok) throw new Error("Seed batch 1: one or more writes were rejected");
}

/**
 * Batch 2 (2026-07-21) — rename the Reading `type` option Anthology →
 * Fanfiction (user-ruled). The managed-vocab rename = an atomic value update
 * (the design's rename pattern), so it self-heals already-seeded stores; a
 * fresh store seeds Fanfiction directly at batch 1 and this finds nothing to
 * rename (idempotent). Entries store the string, so any entry carrying the old
 * value is updated too — none exist in the seeds, but the rule holds in general.
 */
async function seedBatch2(evolu: CiboEvolu): Promise<void> {
  const defQuery = evolu.createQuery((db) =>
    db
      .selectFrom("subunit_definitions")
      .select(["id"])
      .where("key", "=", s100("reading_type"))
      .where("isDeleted", "is not", 1),
  );
  const defId = (await evolu.loadQuery(defQuery))[0]?.id;
  if (defId == null) return;

  const optQuery = evolu.createQuery((db) =>
    db
      .selectFrom("vocab_options")
      .select(["id"])
      .where("definition_fk", "=", defId)
      .where("value", "=", s100("Anthology"))
      .where("isDeleted", "is not", 1),
  );
  let ok = true;
  for (const o of await evolu.loadQuery(optQuery)) {
    const r = evolu.update("vocab_options", { id: o.id, value: s100("Fanfiction") });
    if (!r.ok) {
      console.error("Seed batch 2: vocab rename failed", r.error);
      ok = false;
    }
  }

  const entryQuery = evolu.createQuery((db) =>
    db
      .selectFrom("entries")
      .select(["id"])
      .where("type", "=", s100("Anthology"))
      .where("isDeleted", "is not", 1),
  );
  for (const e of await evolu.loadQuery(entryQuery)) {
    const r = evolu.update("entries", { id: e.id, type: s100("Fanfiction") });
    if (!r.ok) {
      console.error("Seed batch 2: entry type rename failed", r.error);
      ok = false;
    }
  }

  // Hold the gate on a rejected rename (same principle as batch 1/4).
  if (!ok) throw new Error("Seed batch 2: one or more renames were rejected");
}

/**
 * Batch 4 (2026-07-23) — Coding DOWNGRADED project·creation → simple
 * (user-ruled 2026-07-22: it tracks a language-learning journey, not projects;
 * the keystone's project hard test is "has entries" and it has none intended).
 * A fresh store seeds simple directly at batch 1; this flips an existing
 * store's habit row (idempotent — finds nothing to change on re-run). Any
 * dev-seeded coding entries are left to the rich seeder's self-clear; real
 * installs never had a way to create them.
 *
 * This is batch 3 re-armed: the original run's habits write was silently
 * dropped (Evolu discards a whole mutation batch on validation error and
 * reports worker failures only to the unread error store) while the version
 * gate latched at 3, making every later fix unreachable. Hence the paranoia
 * here: the update Result is checked, the write is awaited via onComplete
 * (fires only after the worker commits), and the row is re-read — a throw
 * keeps runSeed from recording the version, so the batch retries next launch.
 */
async function seedBatch4(evolu: CiboEvolu): Promise<void> {
  const habitQuery = evolu.createQuery((db) =>
    db
      .selectFrom("habits")
      .select(["id", "kind"])
      .where("key", "=", s100("coding"))
      .where("isDeleted", "is not", 1),
  );
  for (const h of await evolu.loadQuery(habitQuery)) {
    if (h.kind === "simple") continue;
    await new Promise<void>((resolve, reject) => {
      const r = evolu.update(
        "habits",
        { id: h.id, kind: "simple", sub_type: null, entry_attributes: null },
        { onComplete: () => resolve() },
      );
      if (!r.ok) {
        console.error("Seed batch 4: coding downgrade rejected", r.error);
        reject(new Error("Seed batch 4: coding downgrade failed validation"));
      }
    });
  }
  for (const h of await evolu.loadQuery(habitQuery)) {
    if (h.kind !== "simple") {
      throw new Error(`Seed batch 4: coding kind still reads "${h.kind}" after flip`);
    }
  }
}

/**
 * The per-habit ENTRY-HOUR ladders (user-ruled 2026-07-26, exact figures) —
 * "an hour means a different thing in a game, a book and a video", which is
 * precisely why these are DATA rather than a code-side habit-keyed table. Every
 * other subject uses the global default; a habit absent from this map inherits
 * it wholesale, which is the right default for a habit the user creates later.
 *
 * Owning record: `Final/Daily state 1 (working day).md` § the threshold ladders.
 * Editable from Settings → Tracking → Metrics when that screen is built at
 * step 10 — the dashboard list cap's precedent exactly.
 */
const ENTRY_HOUR_LADDERS: Record<string, { entryHours: { steps?: number[]; bands: Array<{ every: number; until?: number }> } }> = {
  // 2 · 5 · 10 · then every 10 to 100 · every 25 after
  gaming: { entryHours: { steps: [2, 5, 10], bands: [{ every: 10, until: 100 }, { every: 25 }] } },
  // 2 · 5 · 10 · 15 · then every 5 after
  reading: { entryHours: { steps: [2, 5, 10, 15], bands: [{ every: 5 }] } },
  // 5 · 10 · 20 · 50 · then every 25 after
  media: { entryHours: { steps: [5, 10, 20, 50], bands: [{ every: 25 }] } },
  // every 100 — "these are very long running projects"
  writing: { entryHours: { bands: [{ every: 100 }] } },
  gamedev: { entryHours: { bands: [{ every: 100 }] } },
};

/**
 * Batch 5 (2026-07-26) — plant the ruled entry-hour ladders on the five project
 * habits. A fresh store gets them at batch 1 (the column is written there too);
 * this fills an already-seeded store. Idempotent: a habit that already carries a
 * ladder is skipped.
 *
 * Follows the batch-4 pattern exactly — check the Result, await `onComplete`
 * (which fires only after the worker commits), re-read the row, and throw so
 * runSeed never records a version whose writes did not verifiably land.
 */
async function seedBatch5(evolu: CiboEvolu): Promise<void> {
  const habitQuery = evolu.createQuery((db) =>
    db
      .selectFrom("habits")
      .select(["id", "key", "milestone_ladders"])
      .where("isDeleted", "is not", 1),
  );
  const rows = await evolu.loadQuery(habitQuery);
  for (const h of rows) {
    const key = h.key;
    if (key == null) continue;
    const ladders = ENTRY_HOUR_LADDERS[key];
    if (ladders == null || h.milestone_ladders != null) continue;
    await new Promise<void>((resolve, reject) => {
      const r = evolu.update(
        "habits",
        { id: h.id, milestone_ladders: milestoneLaddersToJson(ladders as unknown as MilestoneLadders) },
        { onComplete: () => resolve() },
      );
      if (!r.ok) {
        console.error(`Seed batch 5: ladder for "${key}" rejected`, r.error);
        reject(new Error(`Seed batch 5: ladder for "${key}" failed validation`));
      }
    });
  }
  for (const h of await evolu.loadQuery(habitQuery)) {
    if (h.key != null && ENTRY_HOUR_LADDERS[h.key] != null && h.milestone_ladders == null) {
      throw new Error(`Seed batch 5: "${h.key}" still carries no ladder after the write`);
    }
  }
}

/** The keepsake snippet a built-in habit ships with; project habits get none. */
const keepsakeFor = (key: string): typeof EvoluString.Type | null => {
  const seed = KEEPSAKE_SEEDS.find((s) => s.key === key);
  return seed ? EvoluString.orThrow(seed.snippet) : null;
};

/**
 * Batch 6 (2026-07-27) — plant the six pre-seeded KEEPSAKE SNIPPETS on the
 * non-project habits (Sleep · Keyboard · Walking · Embroidery · Drawing ·
 * Coding). A fresh store gets them at batch 1 (the column is written there too);
 * this fills an already-seeded store.
 *
 * Idempotent, and deliberately NON-DESTRUCTIVE: a habit that already carries a
 * snippet is skipped, because from step 10 that snippet may be the user's own
 * and a seed batch must never overwrite authored art.
 *
 * Follows the batch-4 pattern exactly — check the `Result`, await `onComplete`
 * (which fires only after the worker commits), re-read the row, and throw so
 * runSeed never records a version whose writes did not verifiably land.
 */
async function seedBatch6(evolu: CiboEvolu): Promise<void> {
  const habitQuery = evolu.createQuery((db) =>
    db
      .selectFrom("habits")
      .select(["id", "key", "keepsake_snippet"])
      .where("isDeleted", "is not", 1),
  );
  const rows = await evolu.loadQuery(habitQuery);
  for (const h of rows) {
    const key = h.key;
    if (key == null || h.keepsake_snippet != null) continue;
    const seed = KEEPSAKE_SEEDS.find((s) => s.key === key);
    if (seed == null) continue;
    await new Promise<void>((resolve, reject) => {
      const r = evolu.update(
        "habits",
        { id: h.id, keepsake_snippet: EvoluString.orThrow(seed.snippet) },
        { onComplete: () => resolve() },
      );
      if (!r.ok) {
        console.error(`Seed batch 6: keepsake for "${key}" rejected`, r.error);
        reject(new Error(`Seed batch 6: keepsake for "${key}" failed validation`));
      }
    });
  }
  for (const h of await evolu.loadQuery(habitQuery)) {
    if (
      h.key != null &&
      KEEPSAKE_SEEDS.some((s) => s.key === h.key) &&
      h.keepsake_snippet == null
    ) {
      throw new Error(`Seed batch 6: "${h.key}" still carries no keepsake after the write`);
    }
  }
}
