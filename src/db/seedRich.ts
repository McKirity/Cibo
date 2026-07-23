/**
 * Build step 5 — the RICH fake-data seeder. A faithful ~5-year dataset across
 * all 11 canonical habits, the thing every later dashboard (step 6) is built
 * and iterated against. Replaces the throwaway Gaming-only crude seeder (4a).
 *
 * Unlike 4a, correctness matters here: realistic streaks, gaps, misses,
 * multi-session days, replay **waves**, per-session categoricals, and lived-in
 * habit **lifecycles**. Still deterministic (seeded PRNG) and idempotent
 * (self-clears its prior output), still throwaway dev tooling driven from a
 * dev-panel button.
 *
 * Habit lifecycles (user-ruled 2026-07-21):
 *  - CONSTANTS, active the whole span: Writing · Gaming · Reading · Media · Sleep.
 *  - Created later, active: Embroidery · Walking · Drawing · Keyboard.
 *  - Started → archived (stops, currently archived): Gamedev.
 *  - Started → archived → restarted (a missing middle year, active now): Coding.
 *
 * Writes through the branded constructors, so it cannot drift from the schema.
 * It also fills the empty per-habit picklists (genres · fandom · engine) so the
 * library filters and distribution panels have real vocab.
 */
import {
  FiniteNumber,
  NonEmptyString100,
  NonEmptyString1000,
  NonNegativeInt,
  PositiveInt,
  type Evolu,
} from "@evolu/common";
import {
  DateOnly,
  DateTimeLocal,
  Schema,
  stringListToJson,
  type EntryId,
  type HabitId,
  type SubunitDefinitionId,
} from "./schema";

type CiboEvolu = Evolu<typeof Schema>;

const s100 = (v: string) => NonEmptyString100.orThrow(v);
const s1000 = (v: string) => NonEmptyString1000.orThrow(v);
const fin = (v: number) => FiniteNumber.orThrow(v);
const nni = (v: number) => NonNegativeInt.orThrow(Math.max(0, Math.round(v)));
const pi = (v: number) => PositiveInt.orThrow(Math.max(1, Math.round(v)));

// ── Seeded PRNG (mulberry32) ──────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let RAND = mulberry32(0x51ced);
const rnd = () => RAND();
const rint = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
const chance = (p: number) => rnd() < p;

// ── Date helpers (local-midnight, DST-safe) ───────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (h: number, m: number) => `${pad(h)}:${pad(m)}`;

const TODAY = new Date();

/** The dataset span in years. 5 = the step-5 dataset (unchanged default). The
 *  Longevity growth spike re-configures it to ~15 to stress store size + query
 *  latency; see `spikeGrowth.ts`. */
export const DEFAULT_SPAN_YEARS = 5;

// Span state is mutable so one seeder can serve both the 5y dataset and the
// spike's 15y run; `configureSpan` is called at the top of `seedRich`, so it can
// never be read stale. (`dayAt`/`ago` read these at call time.)
let START = new Date(TODAY.getFullYear() - DEFAULT_SPAN_YEARS, TODAY.getMonth(), TODAY.getDate());
let TOTAL = Math.round((TODAY.getTime() - START.getTime()) / 86_400_000); // ~1826 at 5y

/** Day string at an offset (days) from the span start. */
const dayAt = (off: number): string =>
  ymd(new Date(START.getFullYear(), START.getMonth(), START.getDate() + off));

/** days-ago → offset from START. */
const ago = (days: number) => Math.max(0, TOTAL - days);

type Window = [from: number, to: number];

// ── Lifecycle windows (offsets from START) ────────────────────────────────────

let WINDOWS: Record<string, Window[]> = {};

/**
 * Recompute the span and every lifecycle window. The "created N days ago" habits
 * stay anchored to *today* whatever the span; only the FULL-span constants
 * (writing · gaming · reading · media · sleep) stretch with it — which is what
 * makes a 15-year run ≈3× the dominant session volume.
 */
function configureSpan(years: number): void {
  START = new Date(TODAY.getFullYear() - years, TODAY.getMonth(), TODAY.getDate());
  TOTAL = Math.round((TODAY.getTime() - START.getTime()) / 86_400_000);
  const FULL: Window[] = [[0, TOTAL]];
  WINDOWS = {
    writing: FULL,
    gaming: FULL,
    reading: FULL,
    media: FULL,
    sleep: FULL,
    embroidery: [[ago(1400), TOTAL]], // created ~3.8y ago
    walking: [[ago(1170), TOTAL]], // created ~3.2y ago
    drawing: [[ago(890), TOTAL]], // created ~2.4y ago
    keyboard: [[ago(560), TOTAL]], // created ~1.5y ago
    gamedev: [[ago(1650), ago(730)]], // started ~4.5y, archived ~2y ago
    coding: [
      [ago(1750), ago(1300)], // ~2021-10 → 2022-12
      [ago(900), TOTAL], // ~2024-01 → today  (2023 is the missing year)
    ],
  };
}
configureSpan(DEFAULT_SPAN_YEARS);
/** Which habits end active (all except the started-then-archived Gamedev). */
const STAYS_ACTIVE = new Set([
  "writing", "gaming", "reading", "media", "sleep",
  "embroidery", "walking", "drawing", "keyboard", "coding",
]);

// ── Catalogs ──────────────────────────────────────────────────────────────────

interface Consumable {
  title: string;
  type?: string; // reading/media Medium
  genres: string[];
  rating: number | null;
  status: string;
  purchased?: boolean;
  series?: string;
  seriesOrder?: number;
  words?: number;
}

const GAMES: Consumable[] = [
  { title: "Hollow Knight", genres: ["Metroidvania", "Action"], rating: 5, status: "Finished", purchased: true },
  { title: "Elden Ring", genres: ["Souls-like", "RPG", "Action"], rating: 5, status: "Finished", purchased: true },
  { title: "Hades", genres: ["Roguelike", "Action"], rating: 5, status: "Finished", purchased: true },
  { title: "Stardew Valley", genres: ["Simulation", "RPG"], rating: 4, status: "Current", purchased: true },
  { title: "The Witcher 3", genres: ["RPG", "Adventure"], rating: 5, status: "Finished", purchased: true },
  { title: "Dark Souls III", genres: ["Souls-like", "Action"], rating: 5, status: "Finished", purchased: true },
  { title: "Celeste", genres: ["Platformer"], rating: 5, status: "Finished", purchased: true },
  { title: "Slay the Spire", genres: ["Deckbuilder", "Roguelike"], rating: 4, status: "Current", purchased: true },
  { title: "Disco Elysium", genres: ["RPG", "Adventure"], rating: 5, status: "Finished", purchased: true },
  { title: "Sekiro", genres: ["Souls-like", "Action"], rating: 5, status: "Finished", purchased: true },
  { title: "Cuphead", genres: ["Platformer", "Shooter"], rating: 4, status: "Dropped", purchased: true },
  { title: "Bloodborne", genres: ["Souls-like", "Horror"], rating: 5, status: "Finished", purchased: false },
  { title: "Outer Wilds", genres: ["Adventure", "Puzzle"], rating: 5, status: "Finished", purchased: true },
  { title: "Return of the Obra Dinn", genres: ["Puzzle", "Adventure"], rating: 5, status: "Finished", purchased: true },
  { title: "Factorio", genres: ["Simulation", "Strategy"], rating: 4, status: "Hiatus", purchased: true },
  { title: "Dead Cells", genres: ["Roguelike", "Metroidvania"], rating: 4, status: "Finished", purchased: true },
  { title: "Subnautica", genres: ["Survival", "Adventure"], rating: 5, status: "Finished", purchased: true },
  { title: "Terraria", genres: ["Sandbox", "Adventure"], rating: 4, status: "Hiatus", purchased: true },
  { title: "Undertale", genres: ["RPG", "Adventure"], rating: 5, status: "Finished", purchased: true },
  { title: "Doom Eternal", genres: ["Shooter", "Action"], rating: 4, status: "Finished", purchased: true },
  { title: "Baldur's Gate 3", genres: ["RPG", "Strategy"], rating: 5, status: "Current", purchased: true },
  { title: "Nier: Automata", genres: ["Action", "RPG"], rating: 5, status: "Finished", purchased: true },
  { title: "Tunic", genres: ["Adventure", "Puzzle"], rating: 4, status: "Finished", purchased: true },
  { title: "Vampire Survivors", genres: ["Roguelike", "Action"], rating: 4, status: "Current", purchased: true },
  { title: "Rimworld", genres: ["Simulation", "Strategy"], rating: 4, status: "Hiatus", purchased: true },
  { title: "Inscryption", genres: ["Deckbuilder", "Horror"], rating: 5, status: "Finished", purchased: true },
  { title: "Katana Zero", genres: ["Action", "Platformer"], rating: 4, status: "Finished", purchased: true },
  { title: "Signalis", genres: ["Horror", "Puzzle"], rating: 5, status: "Finished", purchased: true },
  { title: "Pentiment", genres: ["Adventure", "RPG"], rating: 4, status: "Finished", purchased: true },
  { title: "Lies of P", genres: ["Souls-like", "Action"], rating: 4, status: "Current", purchased: true },
];

const BOOKS: Consumable[] = [
  { title: "The Fifth Season", type: "Novel", genres: ["Fantasy", "Sci-Fi"], rating: 5, status: "Finished", series: "The Broken Earth", seriesOrder: 1, words: 170000 },
  { title: "The Obelisk Gate", type: "Novel", genres: ["Fantasy"], rating: 4, status: "Finished", series: "The Broken Earth", seriesOrder: 2, words: 165000 },
  { title: "The Stone Sky", type: "Novel", genres: ["Fantasy"], rating: 5, status: "Finished", series: "The Broken Earth", seriesOrder: 3, words: 160000 },
  { title: "Piranesi", type: "Novel", genres: ["Fantasy", "Mystery"], rating: 5, status: "Finished", words: 90000 },
  { title: "Project Hail Mary", type: "Novel", genres: ["Sci-Fi"], rating: 5, status: "Finished", words: 180000 },
  { title: "Dune", type: "Novel", genres: ["Sci-Fi"], rating: 5, status: "Finished", words: 190000 },
  { title: "The Left Hand of Darkness", type: "Novel", genres: ["Sci-Fi"], rating: 4, status: "Finished", words: 100000 },
  { title: "Chainsaw Man Vol. 1", type: "Manga", genres: ["Action", "Horror"], rating: 4, status: "Current", series: "Chainsaw Man", seriesOrder: 1 },
  { title: "Berserk Vol. 1", type: "Manga", genres: ["Dark Fantasy", "Action"], rating: 5, status: "Current", series: "Berserk", seriesOrder: 1 },
  { title: "Vinland Saga Vol. 1", type: "Manga", genres: ["Historical", "Action"], rating: 5, status: "Current", series: "Vinland Saga", seriesOrder: 1 },
  { title: "Blame! Master Edition 1", type: "Manga", genres: ["Sci-Fi", "Cyberpunk"], rating: 5, status: "Finished", series: "Blame!", seriesOrder: 1 },
  { title: "Frieren Vol. 1", type: "Manga", genres: ["Fantasy", "Adventure"], rating: 5, status: "Current", series: "Frieren", seriesOrder: 1 },
  { title: "The Name of the Wind", type: "Novel", genres: ["Fantasy"], rating: 4, status: "Finished", series: "Kingkiller", seriesOrder: 1, words: 250000 },
  { title: "A Memory Called Empire", type: "Novel", genres: ["Sci-Fi"], rating: 4, status: "Finished", words: 160000 },
  { title: "The House in the Cerulean Sea", type: "Novel", genres: ["Fantasy"], rating: 4, status: "Finished", words: 130000 },
  { title: "Children of Time", type: "Novel", genres: ["Sci-Fi"], rating: 5, status: "Finished", words: 200000 },
  { title: "Annihilation", type: "Novel", genres: ["Sci-Fi", "Horror"], rating: 4, status: "Finished", series: "Southern Reach", seriesOrder: 1, words: 70000 },
  { title: "Klara and the Sun", type: "Novel", genres: ["Sci-Fi"], rating: 4, status: "Dropped", words: 120000 },
  { title: "The Priory of the Orange Tree", type: "Novel", genres: ["Fantasy"], rating: 3, status: "Hiatus", words: 300000 },
  { title: "Gideon the Ninth", type: "Novel", genres: ["Sci-Fi", "Fantasy"], rating: 5, status: "Finished", series: "The Locked Tomb", seriesOrder: 1, words: 130000 },
  { title: "Uzumaki", type: "Manga", genres: ["Horror"], rating: 5, status: "Finished", words: undefined },
  { title: "Goodbye Eri", type: "Manga", genres: ["Drama"], rating: 4, status: "Finished" },
  { title: "The Three-Body Problem", type: "Novel", genres: ["Sci-Fi"], rating: 4, status: "Finished", series: "Remembrance", seriesOrder: 1, words: 150000 },
  { title: "Circe", type: "Novel", genres: ["Fantasy", "Mythology"], rating: 5, status: "Finished", words: 130000 },
  { title: "Recursion", type: "Novel", genres: ["Sci-Fi", "Thriller"], rating: 4, status: "Finished", words: 110000 },
  // Fanfiction (the reading type renamed from Anthology, user-ruled 2026-07-21) — gives the
  // By-type distribution + heatmap a third Medium with its own status/rating spread.
  { title: "All the Young Dudes", type: "Fanfiction", genres: ["Drama", "Romance"], rating: 5, status: "Finished", words: 526000 },
  { title: "Manacled", type: "Fanfiction", genres: ["Dark Fantasy", "Romance"], rating: 4, status: "Finished", words: 370000 },
  { title: "Wax and Wane", type: "Fanfiction", genres: ["Slice of Life"], rating: 4, status: "Current" },
  { title: "The Nightmare Verses", type: "Fanfiction", genres: ["Horror"], rating: 3, status: "Dropped" },
];

const MEDIA: Consumable[] = [
  { title: "Frieren: Beyond Journey's End", type: "Anime", genres: ["Fantasy", "Adventure"], rating: 5, status: "Finished" },
  { title: "Cyberpunk: Edgerunners", type: "Anime", genres: ["Sci-Fi", "Action"], rating: 5, status: "Finished" },
  { title: "Vinland Saga", type: "Anime", genres: ["Historical", "Action"], rating: 5, status: "Current" },
  { title: "Mushishi", type: "Anime", genres: ["Slice of Life", "Supernatural"], rating: 5, status: "Finished" },
  { title: "Made in Abyss", type: "Anime", genres: ["Adventure", "Horror"], rating: 4, status: "Hiatus" },
  { title: "Dune", type: "Movie", genres: ["Sci-Fi"], rating: 5, status: "Finished" },
  { title: "Dune: Part Two", type: "Movie", genres: ["Sci-Fi"], rating: 5, status: "Finished" },
  { title: "Everything Everywhere All at Once", type: "Movie", genres: ["Sci-Fi", "Drama"], rating: 5, status: "Finished" },
  { title: "Blade Runner 2049", type: "Movie", genres: ["Sci-Fi"], rating: 5, status: "Finished" },
  { title: "Parasite", type: "Movie", genres: ["Thriller", "Drama"], rating: 5, status: "Finished" },
  { title: "The Northman", type: "Movie", genres: ["Action", "Historical"], rating: 4, status: "Finished" },
  { title: "Arcane", type: "TV Show", genres: ["Fantasy", "Action"], rating: 5, status: "Finished" },
  { title: "Severance", type: "TV Show", genres: ["Sci-Fi", "Thriller"], rating: 5, status: "Current" },
  { title: "The Bear", type: "TV Show", genres: ["Drama"], rating: 4, status: "Current" },
  { title: "Chernobyl", type: "TV Show", genres: ["Drama", "Historical"], rating: 5, status: "Finished" },
  { title: "Andor", type: "TV Show", genres: ["Sci-Fi"], rating: 5, status: "Finished" },
  { title: "Dark", type: "TV Show", genres: ["Sci-Fi", "Thriller"], rating: 5, status: "Finished" },
  { title: "Twin Peaks", type: "TV Show", genres: ["Mystery", "Drama"], rating: 4, status: "Dropped" },
  { title: "Kurzgesagt", type: "Youtube", genres: ["Science"], rating: null, status: "Current" },
  { title: "Tom Scott", type: "Youtube", genres: ["Science", "Travel"], rating: null, status: "Current" },
  { title: "Jacob Geller", type: "Youtube", genres: ["Video Essay"], rating: null, status: "Current" },
  { title: "Noclip", type: "Youtube", genres: ["Documentary", "Gaming"], rating: null, status: "Current" },
  { title: "Adam Ragusea", type: "Youtube", genres: ["Cooking"], rating: null, status: "Current" },
  { title: "Summoning Salt", type: "Youtube", genres: ["Gaming", "Documentary"], rating: null, status: "Current" },
  { title: "Oppenheimer", type: "Movie", genres: ["Drama", "Historical"], rating: 5, status: "Finished" },
];

interface Creation {
  title: string;
  fandom?: string; // writing
  engine?: string; // gamedev
  genres?: string[]; // gamedev
  status: string;
  startedAgo: number; // days ago
  completedAgo?: number; // days ago; omit for ongoing
}

const WRITING_PROJECTS: Creation[] = [
  { title: "The Hollow Cathedral", fandom: "Original", status: "Current", startedAgo: 1700 },
  { title: "Gray Horizon (fanfic)", fandom: "Blame!", status: "Finished", startedAgo: 1500, completedAgo: 900 },
  { title: "Salt & Cipher", fandom: "Original", status: "Hiatus", startedAgo: 1100 },
  { title: "Letters to the Netsphere", fandom: "Blame!", status: "Current", startedAgo: 500 },
];

const CODING_PROJECTS: Creation[] = [
  { title: "cibo", status: "Current", startedAgo: 700 },
  { title: "pixel-forge", status: "Finished", startedAgo: 1720, completedAgo: 1350 },
  { title: "dotfiles", status: "Current", startedAgo: 1700 },
  { title: "netsphere-sim", status: "Hiatus", startedAgo: 820 },
  { title: "quicklog", status: "Dropped", startedAgo: 1600, completedAgo: 1400 },
];

const GAMEDEV_PROJECTS: Creation[] = [
  { title: "Depthcrawler", engine: "Godot", genres: ["Roguelike", "Dungeon Crawler"], status: "Hiatus", startedAgo: 1640 },
  { title: "Tiny Orchard", engine: "Unity", genres: ["Simulation", "Cozy"], status: "Dropped", startedAgo: 1200, completedAgo: 760 },
  { title: "Signal Lost", engine: "Godot", genres: ["Horror", "Puzzle"], status: "Current", startedAgo: 980 },
];

const WRITING_STAGES = ["Outline", "Summary", "Rough Draft", "Final Draft", "Submission"];
const WRITING_WIKI = ["Characters", "Settings", "History", "Groups", "Concepts", "Objects"];
const CODING_LANGS = ["JavaScript", "HTML", "CSS", "TypeScript", "C#", "Python", "Rust"];
const GAMEDEV_TYPES = ["Mechanics", "Level Design", "Story", "Asset Creation", "UI"];
const KEYBOARD_BOARDS = ["QK65 Classic", "Pavlov65", "Neo65 CU", "Neo60 Cu", "Neo65 Core Plus", "Dashing Run", "Tofu60 2.0", "Mode65", "Gingko65"];

// ── DB context (ids resolved from the batch-1 seed) ───────────────────────────

interface Ctx {
  evolu: CiboEvolu;
  habitId: Map<string, HabitId>;
  /** (habitKey → (defKey → definitionId)). */
  defId: Map<string, Map<string, SubunitDefinitionId>>;
  /** (definitionId → set of existing option values), to add-if-missing. */
  vocab: Map<string, Set<string>>;
  counts: { entries: number; sessions: number; days: number; subunits: number };
}

async function loadCtx(evolu: CiboEvolu): Promise<Ctx> {
  const habits = await evolu.loadQuery(
    evolu.createQuery((db) => db.selectFrom("habits").select(["id", "key"]).where("isDeleted", "is not", 1)),
  );
  const habitId = new Map<string, HabitId>();
  for (const h of habits) if (h.key) habitId.set(h.key, h.id);

  const defs = await evolu.loadQuery(
    evolu.createQuery((db) => db.selectFrom("subunit_definitions").select(["id", "habit_fk", "key"]).where("isDeleted", "is not", 1)),
  );
  const keyOfHabit = new Map<string, string>();
  for (const [k, id] of habitId) keyOfHabit.set(id, k);
  const defId = new Map<string, Map<string, SubunitDefinitionId>>();
  for (const d of defs) {
    if (d.habit_fk == null || d.key == null) continue;
    const hk = keyOfHabit.get(d.habit_fk);
    if (!hk) continue;
    if (!defId.has(hk)) defId.set(hk, new Map());
    defId.get(hk)!.set(d.key, d.id);
  }

  const opts = await evolu.loadQuery(
    evolu.createQuery((db) => db.selectFrom("vocab_options").select(["definition_fk", "value"]).where("isDeleted", "is not", 1)),
  );
  const vocab = new Map<string, Set<string>>();
  for (const o of opts) {
    if (o.value == null) continue;
    const k = o.definition_fk ?? "__global__";
    if (!vocab.has(k)) vocab.set(k, new Set());
    vocab.get(k)!.add(o.value);
  }

  return { evolu, habitId, defId, vocab, counts: { entries: 0, sessions: 0, days: 0, subunits: 0 } };
}

// ── Insert helpers ────────────────────────────────────────────────────────────

const addVocab = (ctx: Ctx, hk: string, defKey: string, value: string) => {
  const did = ctx.defId.get(hk)?.get(defKey);
  if (!did) return;
  const seen = ctx.vocab.get(did) ?? new Set<string>();
  if (seen.has(value)) return;
  ctx.evolu.insert("vocab_options", { definition_fk: did, value: s100(value), sort_order: fin(seen.size + 1) });
  seen.add(value);
  ctx.vocab.set(did, seen);
};

const insertSession = (
  ctx: Ctx,
  habit: HabitId,
  entry: EntryId | null,
  day: string,
  measure: { kind: "time" | "count"; value: number } | { kind: "range"; start: string; end: string } | { kind: "none" },
  source: "manual" | "timer" | "import",
): EntryId extends never ? never : ReturnType<CiboEvolu["insert"]> => {
  const base = {
    habit_fk: habit,
    entry_fk: entry,
    day: DateOnly.orThrow(day),
    source,
  } as const;
  let res;
  if (measure.kind === "time" || measure.kind === "count")
    res = ctx.evolu.insert("sessions", { ...base, measure_kind: measure.kind, value: fin(measure.value), start: null, end: null });
  else if (measure.kind === "range")
    res = ctx.evolu.insert("sessions", { ...base, measure_kind: "range", value: null, start: DateTimeLocal.orThrow(measure.start), end: DateTimeLocal.orThrow(measure.end) });
  else res = ctx.evolu.insert("sessions", { ...base, measure_kind: "none", value: null, start: null, end: null });
  if (res.ok) ctx.counts.sessions++;
  return res as never;
};

const addSubunit = (ctx: Ctx, sessionId: unknown, hk: string, defKey: string, value: string) => {
  const did = ctx.defId.get(hk)?.get(defKey);
  if (!did || sessionId == null) return;
  const r = ctx.evolu.insert("subunit_values", {
    session_fk: sessionId as never,
    definition_fk: did as never,
    value: s1000(value),
  });
  if (r.ok) ctx.counts.subunits++;
};

// ── Session-timeline model ────────────────────────────────────────────────────
// A "currently-engaged" pointer per habit: run an entry/project for a stretch,
// then switch (occasionally revisiting an earlier one → replay waves).

function walkWindows(windows: Window[], onDay: (day: string, off: number) => void) {
  for (const [from, to] of windows) for (let off = from; off <= to; off++) onDay(dayAt(off), off);
}

interface EntryRef {
  id: EntryId;
  meta: Consumable | Creation;
}

/** Consumption habit: waves over its entries, time sessions, replays. */
function seedConsumption(ctx: Ctx, hk: string, entries: EntryRef[], playProb: number, source: "import" | "manual") {
  const habit = ctx.habitId.get(hk)!;
  if (entries.length === 0) return;
  let cur = 0;
  let runLeft = rint(6, 30);
  walkWindows(WINDOWS[hk], (day) => {
    if (runLeft <= 0) {
      // The cursor CYCLES FORWARD through every entry (each one gets runs — the
      // old backward-biased switch starved the tail of the array, e.g. YouTube).
      cur = (cur + 1) % entries.length;
      runLeft = rint(6, 30);
    }
    if (chance(playProb)) {
      // ~18% of bouts revisit an earlier entry (a replay wave) WITHOUT stalling
      // the forward cursor, so late entries stay covered.
      const target = chance(0.18) && cur > 2 ? Math.floor(rnd() * cur) : cur;
      const bouts = chance(0.2) ? 2 : 1;
      for (let b = 0; b < bouts; b++) insertSession(ctx, habit, entries[target].id, day, { kind: "time", value: rint(20, 180) }, source);
    }
    runLeft--;
  });
}

/**
 * Media — TYPE-AWARE (the media-stats wireframe: YouTube is the dominant Medium,
 * a "watch whenever" habit with no lifecycle). YouTube channels get frequent,
 * short daily sessions across the whole span → the biggest share of hours + the
 * most active days. Anime/Movie/TV are burst-watched over a forward cursor
 * (each show for a stretch, then move on).
 */
function seedMedia(ctx: Ctx, entries: EntryRef[]) {
  const habit = ctx.habitId.get("media")!;
  if (entries.length === 0) return;
  const isYt = (e: EntryRef) => (e.meta as Consumable).type === "Youtube";
  const yt = entries.filter(isYt);
  const shows = entries.filter((e) => !isYt(e));

  // YouTube: watch-whenever — ~58% of days, 1–2 short bouts (8–45 min) per day.
  if (yt.length > 0) {
    walkWindows(WINDOWS.media, (day) => {
      if (!chance(0.58)) return;
      const bouts = chance(0.3) ? 2 : 1;
      for (let b = 0; b < bouts; b++) insertSession(ctx, habit, pick(yt).id, day, { kind: "time", value: rint(8, 45) }, "import");
    });
  }

  // Anime/Movie/TV: burst-watch a title for a stretch, forward-cycle through all.
  if (shows.length > 0) {
    let cur = 0;
    let runLeft = rint(8, 24);
    walkWindows(WINDOWS.media, (day) => {
      if (runLeft <= 0) {
        cur = (cur + 1) % shows.length;
        runLeft = rint(8, 24);
      }
      if (chance(0.5)) {
        const target = chance(0.15) && cur > 2 ? Math.floor(rnd() * cur) : cur;
        const bouts = chance(0.2) ? 2 : 1;
        for (let b = 0; b < bouts; b++) insertSession(ctx, habit, shows[target].id, day, { kind: "time", value: rint(20, 150) }, "import");
      }
      runLeft--;
    });
  }
}

/** Creation (time-only, e.g. Coding/Gamedev): project bursts + a session categorical. */
function seedCreationTime(ctx: Ctx, hk: string, projects: EntryRef[], defKey: string, values: string[], playProb: number) {
  const habit = ctx.habitId.get(hk)!;
  if (projects.length === 0) return;
  let cur = 0;
  let runLeft = rint(8, 24);
  walkWindows(WINDOWS[hk], (day) => {
    if (runLeft <= 0) {
      cur = (cur + 1) % projects.length;
      runLeft = rint(8, 24);
    }
    if (chance(playProb)) {
      const r = insertSession(ctx, habit, projects[cur].id, day, { kind: "time", value: rint(25, 150) }, "manual");
      addSubunit(ctx, (r as { ok: boolean; value?: { id: unknown } }).value?.id, hk, defKey, pick(values));
    }
    runLeft--;
  });
}

/** Writing: time + words sessions per day, stage-or-wiki required on each. */
function seedWriting(ctx: Ctx, projects: EntryRef[], playProb: number) {
  const hk = "writing";
  const habit = ctx.habitId.get(hk)!;
  if (projects.length === 0) return;
  let cur = 0;
  let runLeft = rint(10, 30);
  walkWindows(WINDOWS[hk], (day) => {
    if (runLeft <= 0) {
      cur = (cur + 1) % projects.length;
      runLeft = rint(10, 30);
    }
    if (chance(playProb)) {
      // one-of stage/wiki for the day
      const useWiki = chance(0.35);
      const catKey = useWiki ? "writing_wiki" : "writing_stage";
      const catVal = useWiki ? pick(WRITING_WIKI) : pick(WRITING_STAGES);
      const t = insertSession(ctx, habit, projects[cur].id, day, { kind: "time", value: rint(25, 160) }, "manual");
      addSubunit(ctx, (t as { value?: { id: unknown } }).value?.id, hk, catKey, catVal);
      const w = insertSession(ctx, habit, projects[cur].id, day, { kind: "count", value: rint(150, 2200) }, "manual");
      addSubunit(ctx, (w as { value?: { id: unknown } }).value?.id, hk, catKey, catVal);
    }
    runLeft--;
  });
}

/** Simple duration (Embroidery/Drawing): attendance + time. */
function seedSimpleTime(ctx: Ctx, hk: string, playProb: number, lo: number, hi: number) {
  const habit = ctx.habitId.get(hk)!;
  walkWindows(WINDOWS[hk], (day) => {
    if (chance(playProb)) insertSession(ctx, habit, null, day, { kind: "time", value: rint(lo, hi) }, "manual");
  });
}

/** Keyboard: count (words) + board categorical. */
function seedKeyboard(ctx: Ctx, playProb: number) {
  const hk = "keyboard";
  const habit = ctx.habitId.get(hk)!;
  let board = pick(KEYBOARD_BOARDS);
  let runLeft = rint(20, 60);
  walkWindows(WINDOWS[hk], (day) => {
    if (runLeft <= 0) {
      board = pick(KEYBOARD_BOARDS);
      runLeft = rint(20, 60);
    }
    if (chance(playProb)) {
      const r = insertSession(ctx, habit, null, day, { kind: "count", value: rint(400, 5000) }, "manual");
      addSubunit(ctx, (r as { value?: { id: unknown } }).value?.id, hk, "keyboard_board", board);
    }
    runLeft--;
  });
}

/** Walking: measureless attendance. */
function seedWalking(ctx: Ctx, playProb: number) {
  const hk = "walking";
  const habit = ctx.habitId.get(hk)!;
  walkWindows(WINDOWS[hk], (day) => {
    if (chance(playProb)) insertSession(ctx, habit, null, day, { kind: "none" }, "manual");
  });
}

/** Sleep: nightly range (bed prev evening → wake this morning) + med flag. */
function seedSleep(ctx: Ctx, playProb: number) {
  const hk = "sleep";
  const habit = ctx.habitId.get(hk)!;
  walkWindows(WINDOWS[hk], (day, off) => {
    if (off === 0) return; // needs a previous evening
    if (!chance(playProb)) return;
    const prev = dayAt(off - 1);
    const bed = hm(rint(21, 23), rint(0, 59)); // 21:00–23:59 previous evening
    const wake = hm(rint(6, 8), rint(0, 59)); // 06:00–08:59 this morning
    const r = insertSession(ctx, habit, null, day, { kind: "range", start: `${prev}T${bed}`, end: `${day}T${wake}` }, "manual");
    if (chance(0.15)) addSubunit(ctx, (r as { value?: { id: unknown } }).value?.id, hk, "sleep_med", "true");
  });
}

// ── Entry creation ────────────────────────────────────────────────────────────

function makeConsumables(ctx: Ctx, hk: string, cat: Consumable[], source: string, genreDefKey: string, typeDefKey?: string): EntryRef[] {
  const habit = ctx.habitId.get(hk)!;
  const refs: EntryRef[] = [];
  cat.forEach((c, i) => {
    for (const g of c.genres) addVocab(ctx, hk, genreDefKey, g);
    const res = ctx.evolu.insert("entries", {
      habit_fk: habit,
      title: s1000(c.title),
      status: s100(c.status),
      genre: stringListToJson(c.genres.map((x) => s1000(x))),
      rating: c.rating != null ? pi(c.rating) : null,
      purchased: c.purchased != null ? (c.purchased ? 1 : 0) : null,
      priority: nni(rint(0, 3)),
      type: c.type ? s100(c.type) : null,
      series: c.series ? s1000(c.series) : null,
      series_order: c.seriesOrder != null ? pi(c.seriesOrder) : null,
      words: c.words != null ? nni(c.words) : null,
      source: s100(source),
      external_id: s100(`${source}-${i + 1}`),
    });
    void typeDefKey;
    if (res.ok) {
      ctx.counts.entries++;
      refs.push({ id: res.value.id, meta: c });
    }
  });
  return refs;
}

function makeCreations(ctx: Ctx, hk: string, cat: Creation[]): EntryRef[] {
  const habit = ctx.habitId.get(hk)!;
  const refs: EntryRef[] = [];
  for (const c of cat) {
    if (c.fandom) addVocab(ctx, hk, "writing_fandom", c.fandom);
    if (c.engine) addVocab(ctx, hk, "gamedev_engine", c.engine);
    if (c.genres) for (const g of c.genres) addVocab(ctx, hk, "gamedev_genre", g);
    const res = ctx.evolu.insert("entries", {
      habit_fk: habit,
      title: s1000(c.title),
      status: s100(c.status),
      genre: c.genres ? stringListToJson(c.genres.map((x) => s1000(x))) : null,
      fandom: c.fandom ? s100(c.fandom) : null,
      gamedev_engine: c.engine ? s100(c.engine) : null,
      started: DateOnly.orThrow(dayAt(ago(c.startedAgo))),
      completed: c.completedAgo != null ? DateOnly.orThrow(dayAt(ago(c.completedAgo))) : null,
    });
    if (res.ok) {
      ctx.counts.entries++;
      refs.push({ id: res.value.id, meta: c });
    }
  }
  return refs;
}

// ── Clear (idempotent) ────────────────────────────────────────────────────────

export async function clearRichSeed(evolu: CiboEvolu): Promise<{ removed: number }> {
  let removed = 0;
  for (const table of ["subunit_values", "sessions", "entries", "days"] as const) {
    const rows = await evolu.loadQuery(
      evolu.createQuery((db) => db.selectFrom(table).select(["id"]).where("isDeleted", "is not", 1)),
    );
    for (const r of rows) {
      evolu.update(table, { id: r.id as never, isDeleted: 1 } as never);
      removed++;
    }
  }
  return { removed };
}

/** Rename the Reading `type` vocab option Anthology → Fanfiction (idempotent). */
async function normalizeReadingType(evolu: CiboEvolu): Promise<void> {
  const defRows = await evolu.loadQuery(
    evolu.createQuery((db) =>
      db
        .selectFrom("subunit_definitions")
        .select(["id"])
        .where("key", "=", s100("reading_type"))
        .where("isDeleted", "is not", 1),
    ),
  );
  const defId = defRows[0]?.id;
  if (defId == null) return;
  const optRows = await evolu.loadQuery(
    evolu.createQuery((db) =>
      db
        .selectFrom("vocab_options")
        .select(["id"])
        .where("definition_fk", "=", defId)
        .where("value", "=", s100("Anthology"))
        .where("isDeleted", "is not", 1),
    ),
  );
  for (const o of optRows) evolu.update("vocab_options", { id: o.id, value: s100("Fanfiction") });
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export interface RichSeedResult {
  entries: number;
  sessions: number;
  days: number;
  subunits: number;
  clearedFirst: number;
  /** The span this run generated (years), and its day count. */
  spanYears: number;
  spanDays: number;
}

export async function seedRich(
  evolu: CiboEvolu,
  spanYears: number = DEFAULT_SPAN_YEARS,
): Promise<RichSeedResult> {
  configureSpan(spanYears); // must precede every dayAt/ago/WINDOWS read below
  RAND = mulberry32(0x51ced); // reset → identical dataset every run
  const { removed: clearedFirst } = await clearRichSeed(evolu);
  const ctx = await loadCtx(evolu);
  if (ctx.habitId.size === 0) throw new Error("seedRich: habits not seeded yet (run batch 1).");

  // Activate the habits that should be active now; archive Gamedev.
  for (const [key, id] of ctx.habitId) {
    evolu.update("habits", { id, archived: STAYS_ACTIVE.has(key) ? 0 : 1 });
  }

  // Belt-and-braces: ensure the Reading `type` vocab reads Fanfiction, not the
  // old Anthology, even on dev stores where the version-gated batch-2 rename
  // didn't apply (this is the path the user actually re-runs). Idempotent.
  await normalizeReadingType(evolu);

  // ── Entries ──
  const games = makeConsumables(ctx, "gaming", GAMES, "steam", "gaming_genre");
  const books = makeConsumables(ctx, "reading", BOOKS, "calibre", "reading_genre", "reading_type");
  const media = makeConsumables(ctx, "media", MEDIA, "tmdb", "media_genre", "media_type");
  const writing = makeCreations(ctx, "writing", WRITING_PROJECTS);
  const coding = makeCreations(ctx, "coding", CODING_PROJECTS);
  const gamedev = makeCreations(ctx, "gamedev", GAMEDEV_PROJECTS);

  // ── Sessions ──
  seedConsumption(ctx, "gaming", games, 0.5, "import");
  seedConsumption(ctx, "reading", books, 0.42, "manual");
  seedMedia(ctx, media);
  seedWriting(ctx, writing, 0.36);
  seedCreationTime(ctx, "coding", coding, "coding_language", CODING_LANGS, 0.44);
  seedCreationTime(ctx, "gamedev", gamedev, "gamedev_type", GAMEDEV_TYPES, 0.34);
  seedSimpleTime(ctx, "embroidery", 0.24, 20, 120);
  seedSimpleTime(ctx, "drawing", 0.3, 15, 150);
  seedKeyboard(ctx, 0.62);
  seedWalking(ctx, 0.45);
  seedSleep(ctx, 0.92);

  // ── Days ledger: finalize every past day in the whole span ──
  for (let off = 0; off < TOTAL; off++) {
    const d = dayAt(off);
    const r = evolu.insert("days", { date: DateOnly.orThrow(d), finalized: 1, finalized_at: DateTimeLocal.orThrow(`${d}T23:59`), feed_snapshot: null });
    if (r.ok) ctx.counts.days++;
  }

  return { ...ctx.counts, clearedFirst, spanYears, spanDays: TOTAL };
}
