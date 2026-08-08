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

export const SEED_VERSION = 10;

type CiboEvolu = Evolu<typeof Schema>;

/**
 * The batch-4 pattern's WRITE step, extracted 2026-07-30 (it existed as five
 * hand-copied stanzas): issue ONE mutation whose `onComplete` resolves only
 * after the worker commits, check its `Result` synchronously, and REJECT on a
 * failed validation — so the awaiting batch throws and runSeed never records
 * a version whose write did not land. The pattern's other half — the re-read
 * past the optimistic layer — stays at each call site, because what to verify
 * is per-batch. Gate semantics are unchanged: resolve ⇔ worker commit,
 * reject ⇔ rejected Result, and a reject propagates out of the batch.
 */
const verifiedUpdate = (
  issue: (opts: { onComplete: () => void }) => { ok: boolean; error?: unknown },
  label: string,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const r = issue({ onComplete: () => resolve() });
    if (!r.ok) {
      console.error(`${label} rejected`, r.error);
      reject(new Error(`${label} failed validation`));
    }
  });

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
      // The label is the flag panel's HEADER and the stem of its subtitle
      // ("Nights I took medication"), so it reads as a completed action rather
      // than a noun — user-ruled 2026-08-07. Renamed from "Med" by batch 10.
      { key: "sleep_med", label: "Took Medication", scope: "session", data_type: "flag", vocab: [] },
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
 * The stored `seed_version` as a number — **absent OR unreadable reads as 0**
 * (finding `seed-1`, 2026-08-08).
 *
 * This was a bare `Number(value)`, and `Number()` yields **NaN** for anything
 * that does not parse. Every comparison against NaN is false, so a garbled row
 * used to slip past the `>= SEED_VERSION` early return, then past every
 * `foundVersion < N` guard — **running no batch at all** — and fall through to
 * the recording step, stamping the store as fully migrated while it carried
 * none of them. That is exactly the batch-3 / batch-7 failure class (a version
 * recorded for batches that did not land), arriving through the one door this
 * file did not watch: not a lost write, but a value that will not parse. Such a
 * row reaches the store by sync or corruption rather than through the UI.
 *
 * Failing toward RE-RUNNING is the safe direction: every batch is written to be
 * idempotent and verifies itself before the gate records a version, so a
 * needless re-run costs a little work and a wrong skip is unrecoverable.
 */
export function parseSeedVersion(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
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
  const foundVersion = parseSeedVersion(liveMeta?.value);

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
  if (foundVersion < 7) await seedBatch7(evolu);
  // Batch 7 LATCHED WITHOUT LANDING on the dev store (2026-07-27, the batch-3
  // class re-manifested): its first run fired via a mid-session Vite reload —
  // the fresh Evolu client raced the old page's worker teardown, the icon
  // transaction was lost, the OPTIMISTIC reads satisfied the batch's own
  // verification, and the version write (a separate transaction) landed after.
  // Verified offline against the raw store: seed_version=7 present, four of
  // the seven icon names absent. Batch 8 re-runs the same idempotent plant.
  if (foundVersion < 8) await seedBatch8(evolu);
  if (foundVersion < 9) await seedBatch9(evolu);
  if (foundVersion < 10) await seedBatch10(evolu);
  // Future batches: if (foundVersion < 11) await seedBatch11(evolu); …

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

  // Commit signals (the batch-4 pattern, retrofitted 2026-07-30): `onComplete`
  // fires only after the worker commits, and every mutation issued in this
  // synchronous pass rides ONE transaction — so any resolved signal means the
  // whole batch reached the store. Without this, the re-read below would be
  // satisfied by the optimistic layer even for a lost transaction (the batch-7
  // lesson), and a fresh install hit by the loss would be permanently stranded
  // with the gate latched over zero habits.
  const commits: Array<Promise<void>> = [];
  const commitSignal = (): (() => void) => {
    let done!: () => void;
    commits.push(new Promise<void>((res) => (done = res)));
    return done;
  };

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
    }, { onComplete: commitSignal() });
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

  // The ONE global status list — definition_fk empty. Deduped against existing
  // rows so a retried batch (thrown before its version recorded) never plants
  // duplicate statuses — the habit-key guard's twin (added 2026-07-30).
  const statusQuery = evolu.createQuery((db) =>
    db.selectFrom("vocab_options").select(["value"]).where("definition_fk", "is", null),
  );
  const existingStatus = new Set<string>(
    (await evolu.loadQuery(statusQuery)).map((r) => String(r.value)),
  );
  GLOBAL_STATUS_VOCAB.forEach((value, i) => {
    if (existingStatus.has(value)) return;
    const vr = evolu.insert("vocab_options", {
      definition_fk: null,
      value: s100(value),
      sort_order: num(i + 1),
    }, { onComplete: commitSignal() });
    if (!vr.ok) {
      console.error(`Seed: status vocab "${value}" failed`, vr.error);
      ok = false;
    }
  });

  // Hold the gate: a rejected write means the batch is incomplete, so throw and
  // let runSeed skip recording the version — the batch retries next launch.
  if (!ok) throw new Error("Seed batch 1: one or more writes were rejected");

  // Wait for the worker commit, then re-read PAST the optimistic layer and
  // verify every canonical key actually landed — a throw holds the gate.
  await Promise.all(commits);
  const after = await evolu.loadQuery(existingQuery);
  const afterKeys = new Set<string>(after.map((r) => String(r.key)));
  for (const habit of BATCH_1) {
    if (!afterKeys.has(habit.key)) {
      throw new Error(`Seed batch 1: habit "${habit.key}" missing after commit`);
    }
  }
  const statusAfter = new Set<string>(
    (await evolu.loadQuery(statusQuery)).map((r) => String(r.value)),
  );
  for (const value of GLOBAL_STATUS_VOCAB) {
    if (!statusAfter.has(value)) {
      throw new Error(`Seed batch 1: status "${value}" missing after commit`);
    }
  }
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
  // The batch-4 pattern (retrofitted 2026-07-30, via verifiedUpdate): check
  // the Result, await `onComplete` (fires only after the worker commits),
  // re-read past the optimistic layer, throw to hold the gate.
  for (const o of await evolu.loadQuery(optQuery)) {
    await verifiedUpdate(
      (opts) => evolu.update("vocab_options", { id: o.id, value: s100("Fanfiction") }, opts),
      "Seed batch 2: vocab rename",
    );
  }

  const entryQuery = evolu.createQuery((db) =>
    db
      .selectFrom("entries")
      .select(["id"])
      .where("type", "=", s100("Anthology"))
      .where("isDeleted", "is not", 1),
  );
  for (const e of await evolu.loadQuery(entryQuery)) {
    await verifiedUpdate(
      (opts) => evolu.update("entries", { id: e.id, type: s100("Fanfiction") }, opts),
      "Seed batch 2: entry type rename",
    );
  }

  // Re-read: any row still carrying the old value means the rename didn't land.
  if ((await evolu.loadQuery(optQuery)).length > 0) {
    throw new Error("Seed batch 2: Anthology vocab row still present after commit");
  }
  if ((await evolu.loadQuery(entryQuery)).length > 0) {
    throw new Error("Seed batch 2: Anthology entries still present after commit");
  }
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
    await verifiedUpdate(
      (opts) =>
        evolu.update(
          "habits",
          { id: h.id, kind: "simple", sub_type: null, entry_attributes: null },
          opts,
        ),
      "Seed batch 4: coding downgrade",
    );
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
    await verifiedUpdate(
      (opts) =>
        evolu.update(
          "habits",
          { id: h.id, milestone_ladders: milestoneLaddersToJson(ladders as unknown as MilestoneLadders) },
          opts,
        ),
      `Seed batch 5: ladder for "${key}"`,
    );
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
    await verifiedUpdate(
      (opts) =>
        evolu.update(
          "habits",
          { id: h.id, keepsake_snippet: EvoluString.orThrow(seed.snippet) },
          opts,
        ),
      `Seed batch 6: keepsake for "${key}"`,
    );
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

/**
 * Batch 7 (2026-07-27, user-ruled at the Comparing Statistics GUI pass):
 * ICONS AS DATA — the seven lucide names the frozen frame draws in the rail,
 * planted onto `habits.icon`. Until now the assignments existed only as
 * mockup DOM (which dies by law), so the column stayed null and every surface
 * wore the lettermark fallback. Non-destructive on the keepsake pattern: a
 * habit already carrying an icon is skipped (from step 10 it may be the
 * user's own pick). The archived four (embroidery · drawing · coding ·
 * gamedev) have NO drawn assignment and stay lettermarks by ruling.
 * Renderer + roster: src/shell/habitIcons.tsx.
 */
const ICON_SEEDS: { key: string; icon: string }[] = [
  { key: "writing", icon: "pencil" },
  { key: "gaming", icon: "gamepad-2" },
  { key: "reading", icon: "book-open" },
  { key: "media", icon: "clapperboard" },
  { key: "keyboard", icon: "keyboard" },
  { key: "sleep", icon: "moon" },
  { key: "walking", icon: "footprints" },
  // The archived four (batch 9, user-ruled "add in icons for those as well"):
  // the OLD PLUGIN's assignments (Homepage.tsx HABIT_ICON_BY_KEY), except
  // Drawing — its old "pencil" belongs to Writing under the frozen frame.
  { key: "embroidery", icon: "scissors" },
  { key: "drawing", icon: "brush" },
  { key: "coding", icon: "code" },
  { key: "gamedev", icon: "joystick" },
];

async function plantIcons(evolu: CiboEvolu, batch: string): Promise<void> {
  const habitQuery = evolu.createQuery((db) =>
    db
      .selectFrom("habits")
      .select(["id", "key", "icon"])
      .where("isDeleted", "is not", 1),
  );
  const rows = await evolu.loadQuery(habitQuery);
  for (const h of rows) {
    const key = h.key;
    if (key == null || h.icon != null) continue;
    const seed = ICON_SEEDS.find((s) => s.key === key);
    if (seed == null) continue;
    await verifiedUpdate(
      (opts) => evolu.update("habits", { id: h.id, icon: s100(seed.icon) }, opts),
      `Seed ${batch}: icon for "${key}"`,
    );
  }
  for (const h of await evolu.loadQuery(habitQuery)) {
    if (h.key != null && ICON_SEEDS.some((s) => s.key === h.key) && h.icon == null) {
      throw new Error(`Seed ${batch}: "${h.key}" still carries no icon after the write`);
    }
  }
}

async function seedBatch7(evolu: CiboEvolu): Promise<void> {
  await plantIcons(evolu, "batch 7");
}

/** The batch-7 re-arm (see the gate comment) — the same idempotent plant. */
async function seedBatch8(evolu: CiboEvolu): Promise<void> {
  await plantIcons(evolu, "batch 8");
}

/**
 * Batch 9: the archived four join ICON_SEEDS (user-ruled 2026-07-27). The
 * plant is the same null-filling routine — stores already at version 8 pick
 * up only the four new rows.
 */
async function seedBatch9(evolu: CiboEvolu): Promise<void> {
  await plantIcons(evolu, "batch 9");
}

/**
 * Batch 10 (2026-08-07) — rename Sleep's `sleep_med` flag from "Med" to
 * "Took Medication" (user-ruled at the completion audit's GUI pass).
 *
 * WHY A SEED BATCH AND NOT A CODE CONSTANT: the flag panel's header and
 * subtitle are built from the definition's own label, with zero habit
 * special-casing — the range dashboard has no idea which habit it is drawing.
 * So the wording IS data, and a data change on an already-seeded store is a
 * version-gated batch. A fresh store gets the new label at batch 1.
 *
 * The batch-4 pattern exactly: check the Result, await `onComplete`, re-read
 * the row, and throw so runSeed never records a version whose write did not
 * verifiably land. Idempotent — a definition already carrying the new label is
 * skipped, and the key never moves (`sleep_med` addresses every stored answer).
 */
async function seedBatch10(evolu: CiboEvolu): Promise<void> {
  await ensureSleepMedLabel(evolu, "batch 10");
}

const MED_OLD_LABEL = "Med";
const MED_NEW_LABEL = "Took Medication";

/**
 * The rename itself, written as an ALWAYS-RUN RECONCILER rather than trusting
 * the version gate — the project's own rule: version-gate what must run ONCE,
 * reconcile-at-launch what is idempotent. A label rename is idempotent, and
 * this gate has now latched-without-landing three times (batches 3, 7, 9), so
 * a rename that only ever fires once is a rename that can silently not happen.
 *
 * NARROWLY SCOPED ON PURPOSE, the `ensureHabitIcons` discipline: it rewrites
 * the label ONLY when it still reads the exact old string. Anything else —
 * including a label the user has since changed themselves — is left alone, so
 * the reconciler can never fight a deliberate edit. Never throws from the
 * launch path; a failure just retries next launch and says so.
 */
export async function ensureSleepMedLabel(evolu: CiboEvolu, why: string): Promise<void> {
  try {
    const defQuery = evolu.createQuery((db) =>
      db
        .selectFrom("subunit_definitions")
        .select(["id", "label"])
        .where("key", "=", s100("sleep_med"))
        .where("isDeleted", "is not", 1),
    );
    const stale = (await evolu.loadQuery(defQuery)).filter((d) => d.label === MED_OLD_LABEL);
    if (stale.length === 0) return;
    console.info(`Sleep med label: renaming ${stale.length} (${why})`);
    for (const d of stale) {
      await verifiedUpdate(
        (opts) => evolu.update("subunit_definitions", { id: d.id, label: s100(MED_NEW_LABEL) }, opts),
        `Sleep med label (${why})`,
      );
    }
  } catch (e) {
    console.error("Sleep med label: reconciliation failed (will retry next launch)", e);
  }
}

/**
 * The ALWAYS-RUN reconciler (2026-07-27, after the version gate latched TWICE
 * over lost icon transactions — batches 7 and 9, both first-fired by a
 * mid-session Vite reload). The plant is naturally idempotent (it fills nulls
 * only), so it does not need one-shot semantics: any launch that finds a
 * canonical habit icon-less re-plants it, and a lost transaction heals at the
 * next launch BY CONSTRUCTION. Aligned with [[Iconography]]'s own ruling — a
 * blank icon is never deliberate, "only forgotten". Called from main.tsx
 * after runSeed; never throws (a failed launch-fill just tries again next
 * launch, and the log says what happened).
 */
export async function ensureHabitIcons(evolu: CiboEvolu): Promise<void> {
  try {
    const q = evolu.createQuery((db) =>
      db
        .selectFrom("habits")
        .select(["key", "icon"])
        .where("isDeleted", "is not", 1),
    );
    const rows = await evolu.loadQuery(q);
    const missing = rows
      .filter((h) => h.key != null && h.icon == null && ICON_SEEDS.some((s) => s.key === h.key))
      .map((h) => h.key as string);
    if (missing.length === 0) return;
    console.info(`Icons: planting ${missing.length} missing (${missing.join(", ")})`);
    await plantIcons(evolu, "ensure");
    console.info("Icons: plant verified in-page (durability confirmed at next launch)");
  } catch (e) {
    console.error("Icons: launch reconciliation failed (will retry next launch)", e);
  }
}
