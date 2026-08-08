import { beforeAll, describe, expect, it } from "vitest";
import { clearRichSeed, seedRich } from "./seedRich";

/**
 * Matrix probes A10–A12 — the third ruled pure core: the rich seeder's
 * determinism, idempotence and invariants.
 *
 * The seeder is not pure (it writes through Evolu), so it runs here against a
 * FAKE store that answers its three setup queries and captures every write.
 * That is enough for what was ruled: determinism and the invariants are
 * properties of the *generated dataset*, and the dataset is exactly what the
 * captured inserts are.
 *
 * WHAT THIS DELIBERATELY DOES NOT CLAIM. The fake does not implement
 * `isDeleted`, so true idempotence — re-seeding a real populated store and
 * ending with one dataset, not two — is only *proxied* here. That check belongs
 * to the live full-scope re-run, which is the step's own precondition.
 *
 * The fixtures are the 13 subunit definitions the seeder actually asks for,
 * taken from its own call sites rather than invented. A missing definition
 * would make the seeder skip those writes silently, so `writes something for
 * every fixture` is asserted below — a vacuous run must not read as a pass.
 */

const HABITS = [
  "writing",
  "gaming",
  "reading",
  "media",
  "sleep",
  "embroidery",
  "walking",
  "drawing",
  "keyboard",
  "gamedev",
  "coding",
] as const;

/** Entry-bearing habits — a session of theirs REQUIRES an entry, and only theirs. */
const PROJECT = new Set(["writing", "gaming", "reading", "media", "gamedev"]);
const RANGE = new Set(["sleep"]);

/** Every definition key the seeder reads, by owning habit. */
const DEF_KEYS = [
  "writing_wiki",
  "writing_stage",
  "writing_fandom",
  "coding_language",
  "keyboard_board",
  "sleep_med",
  "gamedev_engine",
  "gamedev_genre",
  "gamedev_type",
  "reading_type",
  "gaming_genre",
  "reading_genre",
  "media_genre",
] as const;

interface Write {
  table: string;
  values: Record<string, unknown>;
}

interface Fake {
  evolu: never;
  inserts: Write[];
  updates: Write[];
}

function fakeStore(): Fake {
  const inserts: Write[] = [];
  const updates: Write[] = [];
  const rows: Record<string, Record<string, unknown>[]> = {
    habits: HABITS.map((key) => ({ id: `h-${key}`, key })),
    subunit_definitions: DEF_KEYS.map((key) => ({
      id: `d-${key}`,
      habit_fk: `h-${key.split("_")[0]}`,
      key,
    })),
    vocab_options: [],
    sessions: [],
    entries: [],
    days: [],
    subunit_values: [],
  };
  let n = 0;

  // A chainable stand-in for the query builder: every method returns itself, so
  // only `selectFrom`'s table name survives — which is all `loadQuery` needs.
  const chain = (): Record<string, () => unknown> => {
    const c: Record<string, () => unknown> = {};
    for (const m of ["select", "selectAll", "where", "orderBy", "limit", "innerJoin", "leftJoin"])
      c[m] = () => c;
    return c;
  };

  const evolu = {
    createQuery: (fn: (db: { selectFrom: (t: string) => unknown }) => unknown) => {
      let table = "";
      fn({
        selectFrom: (t: string) => {
          table = t;
          return chain();
        },
      });
      return { table };
    },
    loadQuery: async (q: { table: string }) => rows[q.table] ?? [],
    insert: (table: string, values: Record<string, unknown>) => {
      const id = `${table}-${++n}`;
      inserts.push({ table, values });
      (rows[table] ??= []).push({ id, ...values });
      return { ok: true as const, value: { id } };
    },
    update: (table: string, values: Record<string, unknown>) => {
      updates.push({ table, values });
      return { ok: true as const };
    },
  };

  return { evolu: evolu as unknown as never, inserts, updates };
}

/**
 * Runs at the SHIPPING span by default (5 years, `DEFAULT_SPAN_YEARS`).
 *
 * These ran at 2 years until 2026-08-08, when two fixture-coverage assertions
 * failed overnight with no code change: the seeder's window is "today minus N
 * years", so it slides daily, and **Gamedev's lifecycle window — it is the
 * started-then-archived habit, active only in the past — fell off the back of a
 * 2-year span.** The test had been sitting on a cliff edge and one day's slide
 * pushed it over.
 *
 * The lesson is not "widen the span until it passes": it is that a fixture
 * exercising lifecycle coverage must run at the configuration that actually
 * ships, or it is testing a dataset no one will ever have.
 */
const run = async (span = 5) => {
  const f = fakeStore();
  const result = await seedRich(f.evolu, span);
  return { ...f, result };
};

const of = (w: Write[], table: string) => w.filter((x) => x.table === table).map((x) => x.values);

/** "YYYY-MM-DDTHH:MM" → whole midnights crossed. */
const midnights = (start: string, end: string) =>
  Math.round((Date.parse(end.slice(0, 10)) - Date.parse(start.slice(0, 10))) / 86_400_000);

describe("seedRich", () => {
  let first: Awaited<ReturnType<typeof run>>;

  beforeAll(async () => {
    first = await run();
  });

  it("actually seeds — a vacuous run must not read as a pass", () => {
    expect(first.result.sessions).toBeGreaterThan(100);
    expect(first.result.entries).toBeGreaterThan(0);
    expect(first.result.days).toBeGreaterThan(300);
    expect(first.result.subunits).toBeGreaterThan(0);
    expect(of(first.inserts, "sessions").length).toBe(first.result.sessions);
  });

  /**
   * The guard on fixture drift: if a definition key ever stops matching the
   * seeder's call sites, its writes vanish silently and every other assertion
   * in this file still passes.
   *
   * The two channels are the subunit tri-split showing through. SESSION-level
   * definitions ("what was this bout") land as `subunit_values`; ENTRY-level
   * ones (genre · type · fandom · engine) are identity, stored on the entry's
   * own columns, and the definition exists only to own the PICKLIST — so the
   * seeder touches it through `vocab_options`. A definition referenced by
   * neither is a fixture that has come untethered.
   *
   * `reading_type` is the documented exception: the seeder only ever READS it,
   * to rename the Anthology option to Fanfiction, and that rename correctly
   * no-ops on a store whose vocab is empty. It stays in the fixtures because
   * the seeder queries for it.
   */
  const READ_ONLY_DEFS = new Set(["reading_type"]);

  it("references every fixture definition through one channel or the other", () => {
    const viaValues = new Set(of(first.inserts, "subunit_values").map((v) => String(v.definition_fk)));
    const viaVocab = new Set(of(first.inserts, "vocab_options").map((v) => String(v.definition_fk)));
    const unused = DEF_KEYS.filter(
      (k) => !READ_ONLY_DEFS.has(k) && !viaValues.has(`d-${k}`) && !viaVocab.has(`d-${k}`),
    );
    expect(unused).toEqual([]);
  });

  it("writes a per-bout answer for every SESSION-level definition", () => {
    const sessionDefs = [
      "writing_wiki",
      "writing_stage",
      "coding_language",
      "keyboard_board",
      "sleep_med",
      "gamedev_type",
    ];
    const used = new Set(of(first.inserts, "subunit_values").map((v) => String(v.definition_fk)));
    expect(sessionDefs.filter((k) => !used.has(`d-${k}`))).toEqual([]);
  });

  it("fills the empty picklists so filters and distribution panels have vocab", () => {
    const vocab = of(first.inserts, "vocab_options");
    expect(vocab.length).toBeGreaterThan(0);
    for (const v of vocab) expect(String(v.value).trim()).not.toBe("");
  });

  // ── A10 · determinism ──────────────────────────────────────────────────────

  it("is deterministic — two fresh runs produce byte-identical writes", async () => {
    const second = await run();
    expect(JSON.stringify(second.inserts)).toBe(JSON.stringify(first.inserts));
  });

  it("resets its PRNG per run, so a differently-sized run cannot poison the next", async () => {
    await run(2); // consumes a different amount of randomness
    const after = await run();
    expect(JSON.stringify(after.inserts)).toBe(JSON.stringify(first.inserts));
  });

  it("scales with the span rather than ignoring it", async () => {
    const short = await run(2);
    expect(short.result.spanYears).toBe(2);
    expect(short.result.days).toBeLessThan(first.result.days);
    expect(short.result.sessions).toBeLessThan(first.result.sessions);
  });

  // ── A11 · idempotence (proxied — see the file header) ──────────────────────

  it("clears its prior output before re-seeding", async () => {
    const f = fakeStore();
    const one = await seedRich(f.evolu, 2);
    expect(one.clearedFirst).toBe(0); // nothing to clear on a virgin store
    const two = await seedRich(f.evolu, 2);
    expect(two.clearedFirst).toBeGreaterThan(0); // the second run saw the first
    expect(two.sessions).toBe(one.sessions); // and rebuilt the same dataset
    expect(two.entries).toBe(one.entries);
  });

  it("clearRichSeed sweeps every table it owns and no others", async () => {
    const f = fakeStore();
    await seedRich(f.evolu, 2);
    f.updates.length = 0;
    await clearRichSeed(f.evolu);
    const swept = new Set(f.updates.map((u) => u.table));
    expect([...swept].sort()).toEqual(["days", "entries", "sessions", "subunit_values"]);
    expect(f.updates.every((u) => u.values.isDeleted === 1)).toBe(true);
  });

  // ── A12 · invariants ───────────────────────────────────────────────────────

  describe("invariants", () => {
    it("never writes a session without a real habit", () => {
      const ids = new Set(HABITS.map((k) => `h-${k}`));
      for (const s of of(first.inserts, "sessions")) expect(ids.has(String(s.habit_fk))).toBe(true);
    });

    it("links an entry on project habits' sessions, and only there", () => {
      for (const s of of(first.inserts, "sessions")) {
        const key = String(s.habit_fk).slice(2);
        if (PROJECT.has(key)) expect(s.entry_fk, `${key} session`).not.toBeNull();
        else expect(s.entry_fk, `${key} session`).toBeNull();
      }
    });

    it("carries exactly one measure per session, matching its discriminator", () => {
      for (const s of of(first.inserts, "sessions")) {
        const kind = String(s.measure_kind);
        if (kind === "range") {
          expect(s.value).toBeNull();
          expect(s.start).not.toBeNull();
          expect(s.end).not.toBeNull();
        } else if (kind === "none") {
          expect(s.value).toBeNull();
          expect(s.start).toBeNull();
          expect(s.end).toBeNull();
        } else {
          expect(kind === "time" || kind === "count").toBe(true);
          expect(typeof s.value).toBe("number");
          expect(s.value as number).toBeGreaterThanOrEqual(0);
          expect(s.start).toBeNull();
          expect(s.end).toBeNull();
        }
      }
    });

    it("records ranges only on the range habit, ending after they start, within one midnight", () => {
      const ranges = of(first.inserts, "sessions").filter((s) => s.measure_kind === "range");
      expect(ranges.length).toBeGreaterThan(0);
      for (const s of ranges) {
        expect(RANGE.has(String(s.habit_fk).slice(2))).toBe(true);
        const start = String(s.start);
        const end = String(s.end);
        expect(end > start).toBe(true);
        expect(midnights(start, end)).toBeLessThanOrEqual(1);
      }
    });

    it("owns every range session to its END date (the keystone's rule)", () => {
      for (const s of of(first.inserts, "sessions").filter((x) => x.measure_kind === "range"))
        expect(s.day).toBe(String(s.end).slice(0, 10));
    });

    it("writes well-formed day strings on every session and day row", () => {
      const shape = /^\d{4}-\d{2}-\d{2}$/;
      for (const s of of(first.inserts, "sessions")) expect(String(s.day)).toMatch(shape);
      for (const d of of(first.inserts, "days")) expect(String(d.date)).toMatch(shape);
    });

    it("writes one days-ledger row per date, never a duplicate", () => {
      const dates = of(first.inserts, "days").map((d) => String(d.date));
      expect(new Set(dates).size).toBe(dates.length);
    });

    it("keeps every subunit value pointed at a definition that exists", () => {
      const defs = new Set(DEF_KEYS.map((k) => `d-${k}`));
      for (const v of of(first.inserts, "subunit_values")) {
        expect(defs.has(String(v.definition_fk))).toBe(true);
        expect(v.session_fk).not.toBeNull();
      }
    });

    it("gives every entry a title and a habit", () => {
      const ids = new Set(HABITS.map((k) => `h-${k}`));
      for (const e of of(first.inserts, "entries")) {
        expect(String(e.title).trim()).not.toBe("");
        expect(ids.has(String(e.habit_fk))).toBe(true);
      }
    });
  });
});
