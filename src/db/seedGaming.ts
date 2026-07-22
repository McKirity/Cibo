/**
 * Build step 4a — the CRUDE Gaming seeder. THROWAWAY dev tooling.
 *
 * Its only job: plant enough realistic *volume* and *years* that the vertical
 * slice's <100 ms budget (step 4) measures something real, instead of the three
 * rows a human would hand-log. Correctness is explicitly NOT required (that is
 * the rich 5-year seeder's job, step 5); shape and scale are.
 *
 * Scope = Gaming only (user-ruled 2026-07-20 — full-scope seeding is a Hardening
 * pass). It writes through the same branded constructors the app uses, so it
 * cannot drift from the schema.
 *
 * What it plants (~5 years back to today):
 *  - ~40 game `entries` carrying the full consumption bundle the slice reads
 *    (status · genre[] · rating · purchased · priority);
 *  - ~1,500–1,800 time `sessions` linked to those entries, modelled as a
 *    "currently-playing" pointer that runs a game across a stretch then switches
 *    — which yields real streaks, gaps/misses, multi-session days, and (via the
 *    occasional revisit) replay clusters for the WAVES shape;
 *  - a finalized `days` row per past day in the range, so day-verdict / heatmap
 *    have finalize truth (finalized + no session = a real "didn't do").
 *
 * Deterministic: a seeded PRNG makes every run produce the identical dataset,
 * and `seedGamingCrude` clears its own prior output first, so it is idempotent.
 * Sessions are marked `source = "import"` — never hand-entered.
 *
 * Delete this module (and its dev-panel button) when step 5's rich seeder lands.
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
} from "./schema";

type CiboEvolu = Evolu<typeof Schema>;

const s100 = (v: string) => NonEmptyString100.orThrow(v);
const s1000 = (v: string) => NonEmptyString1000.orThrow(v);
const fin = (v: number) => FiniteNumber.orThrow(v);

// ── Seeded PRNG (mulberry32) — deterministic runs ─────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Date helpers ──────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Every calendar day from `start` to `end` inclusive, as "YYYY-MM-DD". */
function dayRange(start: Date, end: Date): string[] {
  const out: string[] = [];
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (d <= last) {
    out.push(ymd(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// ── The game catalog (~40) — titles + attributes the slice's shapes read ──────

interface GameSeed {
  title: string;
  genres: string[];
  rating: number | null;
  status: string; // from the global status vocab
  purchased: boolean;
  priority: number; // 0–3
}

const GAMES: GameSeed[] = [
  { title: "Hollow Knight", genres: ["Metroidvania", "Action"], rating: 5, status: "Finished", purchased: true, priority: 3 },
  { title: "Elden Ring", genres: ["Souls-like", "RPG", "Action"], rating: 5, status: "Finished", purchased: true, priority: 3 },
  { title: "Hades", genres: ["Roguelike", "Action"], rating: 5, status: "Finished", purchased: true, priority: 2 },
  { title: "Stardew Valley", genres: ["Simulation", "RPG"], rating: 4, status: "Current", purchased: true, priority: 1 },
  { title: "The Witcher 3", genres: ["RPG", "Adventure"], rating: 5, status: "Finished", purchased: true, priority: 3 },
  { title: "Dark Souls III", genres: ["Souls-like", "Action"], rating: 5, status: "Finished", purchased: true, priority: 2 },
  { title: "Celeste", genres: ["Platformer"], rating: 5, status: "Finished", purchased: true, priority: 2 },
  { title: "Slay the Spire", genres: ["Deckbuilder", "Roguelike"], rating: 4, status: "Current", purchased: true, priority: 1 },
  { title: "Disco Elysium", genres: ["RPG", "Adventure"], rating: 5, status: "Finished", purchased: true, priority: 3 },
  { title: "Sekiro", genres: ["Souls-like", "Action"], rating: 5, status: "Finished", purchased: true, priority: 2 },
  { title: "Cuphead", genres: ["Platformer", "Shooter"], rating: 4, status: "Dropped", purchased: true, priority: 1 },
  { title: "Bloodborne", genres: ["Souls-like", "Horror"], rating: 5, status: "Finished", purchased: false, priority: 3 },
  { title: "Outer Wilds", genres: ["Adventure", "Puzzle"], rating: 5, status: "Finished", purchased: true, priority: 3 },
  { title: "Return of the Obra Dinn", genres: ["Puzzle", "Adventure"], rating: 5, status: "Finished", purchased: true, priority: 2 },
  { title: "Factorio", genres: ["Simulation", "Strategy"], rating: 4, status: "Hiatus", purchased: true, priority: 1 },
  { title: "Dead Cells", genres: ["Roguelike", "Metroidvania"], rating: 4, status: "Finished", purchased: true, priority: 1 },
  { title: "Subnautica", genres: ["Survival", "Adventure"], rating: 5, status: "Finished", purchased: true, priority: 2 },
  { title: "Terraria", genres: ["Sandbox", "Adventure"], rating: 4, status: "Hiatus", purchased: true, priority: 1 },
  { title: "Hotline Miami", genres: ["Action", "Shooter"], rating: 4, status: "Finished", purchased: true, priority: 0 },
  { title: "Undertale", genres: ["RPG", "Adventure"], rating: 5, status: "Finished", purchased: true, priority: 2 },
  { title: "Doom Eternal", genres: ["Shooter", "Action"], rating: 4, status: "Finished", purchased: true, priority: 1 },
  { title: "Portal 2", genres: ["Puzzle", "Adventure"], rating: 5, status: "Finished", purchased: true, priority: 2 },
  { title: "Baldur's Gate 3", genres: ["RPG", "Strategy"], rating: 5, status: "Current", purchased: true, priority: 3 },
  { title: "Divinity: Original Sin 2", genres: ["RPG", "Strategy"], rating: 5, status: "Finished", purchased: true, priority: 2 },
  { title: "Nier: Automata", genres: ["Action", "RPG"], rating: 5, status: "Finished", purchased: true, priority: 2 },
  { title: "Death's Door", genres: ["Action", "Adventure"], rating: 4, status: "Finished", purchased: true, priority: 0 },
  { title: "Tunic", genres: ["Adventure", "Puzzle"], rating: 4, status: "Finished", purchased: true, priority: 1 },
  { title: "Vampire Survivors", genres: ["Roguelike", "Action"], rating: 4, status: "Current", purchased: true, priority: 0 },
  { title: "Rimworld", genres: ["Simulation", "Strategy"], rating: 4, status: "Hiatus", purchased: true, priority: 1 },
  { title: "Inscryption", genres: ["Deckbuilder", "Horror"], rating: 5, status: "Finished", purchased: true, priority: 2 },
  { title: "Katana Zero", genres: ["Action", "Platformer"], rating: 4, status: "Finished", purchased: true, priority: 0 },
  { title: "Ori and the Blind Forest", genres: ["Metroidvania", "Platformer"], rating: 4, status: "Finished", purchased: true, priority: 1 },
  { title: "Monster Hunter: World", genres: ["Action", "RPG"], rating: 4, status: "Dropped", purchased: true, priority: 1 },
  { title: "Risk of Rain 2", genres: ["Roguelike", "Shooter"], rating: 4, status: "Hiatus", purchased: true, priority: 0 },
  { title: "Pathologic 2", genres: ["Survival", "Horror"], rating: 4, status: "Dropped", purchased: true, priority: 1 },
  { title: "Gris", genres: ["Platformer", "Puzzle"], rating: 4, status: "Finished", purchased: true, priority: 0 },
  { title: "The Binding of Isaac", genres: ["Roguelike", "Action"], rating: 4, status: "Hiatus", purchased: true, priority: 1 },
  { title: "Signalis", genres: ["Horror", "Puzzle"], rating: 5, status: "Finished", purchased: true, priority: 2 },
  { title: "Pentiment", genres: ["Adventure", "RPG"], rating: 4, status: "Finished", purchased: true, priority: 1 },
  { title: "Lies of P", genres: ["Souls-like", "Action"], rating: 4, status: "Current", purchased: true, priority: 2 },
];

// ── Cleanup ───────────────────────────────────────────────────────────────────

async function loadGamingHabit(
  evolu: CiboEvolu,
): Promise<{ id: HabitId; archived: number | null } | null> {
  const q = evolu.createQuery((db) =>
    db
      .selectFrom("habits")
      .select(["id", "archived"])
      .where("key", "=", s100("gaming"))
      .where("isDeleted", "is not", 1),
  );
  const rows = await evolu.loadQuery(q);
  return rows[0] ?? null;
}

/**
 * Soft-deletes everything this seeder plants: Gaming's sessions + entries, and
 * ALL `days` rows (the ledger is global, but at step 4a nothing else writes it —
 * the app has finalized no real days). Safe to call with nothing seeded.
 */
export async function clearGamingSeed(evolu: CiboEvolu): Promise<{ removed: number }> {
  const gaming = await loadGamingHabit(evolu);
  let removed = 0;
  if (gaming) {
    const sessQ = evolu.createQuery((db) =>
      db
        .selectFrom("sessions")
        .select(["id"])
        .where("habit_fk", "=", gaming.id)
        .where("isDeleted", "is not", 1),
    );
    for (const r of await evolu.loadQuery(sessQ)) {
      evolu.update("sessions", { id: r.id, isDeleted: 1 });
      removed++;
    }
    const entQ = evolu.createQuery((db) =>
      db
        .selectFrom("entries")
        .select(["id"])
        .where("habit_fk", "=", gaming.id)
        .where("isDeleted", "is not", 1),
    );
    for (const r of await evolu.loadQuery(entQ)) {
      evolu.update("entries", { id: r.id, isDeleted: 1 });
      removed++;
    }
  }
  const dayQ = evolu.createQuery((db) =>
    db.selectFrom("days").select(["id"]).where("isDeleted", "is not", 1),
  );
  for (const r of await evolu.loadQuery(dayQ)) {
    evolu.update("days", { id: r.id, isDeleted: 1 });
    removed++;
  }
  return { removed };
}

// ── The seed ──────────────────────────────────────────────────────────────────

export interface GamingSeedResult {
  entries: number;
  sessions: number;
  days: number;
  clearedFirst: number;
}

/**
 * Idempotent: clears its own prior output, then plants the crude dataset and
 * activates Gaming (seeds arrive archived; the form + slice need it active).
 */
export async function seedGamingCrude(evolu: CiboEvolu): Promise<GamingSeedResult> {
  const gaming = await loadGamingHabit(evolu);
  if (!gaming) throw new Error("seedGamingCrude: the 'gaming' habit is not seeded yet (run batch 1).");

  const { removed: clearedFirst } = await clearGamingSeed(evolu);

  // Gaming must be active for the form / dashboard to see it.
  if (gaming.archived) evolu.update("habits", { id: gaming.id, archived: 0 });

  // ── Entries ──
  const rand = mulberry32(0x0c1b0); // fixed seed → deterministic dataset
  const entryIds: EntryId[] = [];
  let entryCount = 0;
  for (const g of GAMES) {
    const res = evolu.insert("entries", {
      habit_fk: gaming.id,
      title: s1000(g.title),
      status: s100(g.status),
      genre: stringListToJson(g.genres.map((x) => s1000(x))),
      rating: g.rating != null ? PositiveInt.orThrow(g.rating) : null,
      purchased: g.purchased ? 1 : 0,
      priority: NonNegativeInt.orThrow(g.priority),
    });
    if (!res.ok) {
      console.error(`seedGaming: entry "${g.title}" failed`, res.error);
      continue;
    }
    entryIds.push(res.value.id);
    entryCount++;
  }
  if (entryIds.length === 0) throw new Error("seedGaming: no entries inserted.");

  // ── Sessions: the "currently-playing" timeline ──
  const today = new Date();
  const start = new Date(today.getFullYear() - 5, today.getMonth(), today.getDate());
  const days = dayRange(start, today);

  let cur = 0; // index into entryIds
  let runLeft = 0;
  let sessionCount = 0;

  const pickNextGame = () => {
    // ~80% advance sequentially (guarantees full coverage); ~20% revisit an
    // earlier game after a gap → replay clusters (the WAVES shape).
    if (rand() < 0.2 && cur > 2) {
      cur = Math.floor(rand() * cur);
    } else {
      cur = (cur + 1) % entryIds.length;
    }
  };
  const newRun = () => 5 + Math.floor(rand() * 36); // 5–40 day play window

  runLeft = newRun();
  for (const day of days) {
    if (runLeft <= 0) {
      pickNextGame();
      runLeft = newRun();
    }
    // ~60% of days inside a run get played → realistic gaps/streaks/misses.
    if (rand() < 0.6) {
      const bouts = rand() < 0.22 ? 2 : 1; // some multi-session days
      for (let b = 0; b < bouts; b++) {
        const minutes = 20 + Math.floor(rand() * 160); // 20–180 min
        const res = evolu.insert("sessions", {
          habit_fk: gaming.id,
          entry_fk: entryIds[cur],
          day: DateOnly.orThrow(day),
          measure_kind: "time",
          value: fin(minutes),
          start: null,
          end: null,
          source: "import",
        });
        if (res.ok) sessionCount++;
        else console.error("seedGaming: session insert failed", res.error);
      }
    }
    runLeft--;
  }

  // ── Days ledger: finalize every past day in the range ──
  // finalized + no session = a real "didn't do"; the heatmap/verdict shapes read this.
  let dayCount = 0;
  for (let i = 0; i < days.length - 1; i++) {
    // exclude today — not yet finalized
    const res = evolu.insert("days", {
      date: DateOnly.orThrow(days[i]),
      finalized: 1,
      finalized_at: DateTimeLocal.orThrow(`${days[i]}T23:59`),
      feed_snapshot: null,
    });
    if (res.ok) dayCount++;
  }

  return { entries: entryCount, sessions: sessionCount, days: dayCount, clearedFirst };
}
