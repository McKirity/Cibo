import { describe, expect, it, vi } from "vitest";

/**
 * `doctor.ts` builds its queries at module load, so importing it pulls in the
 * live Evolu instance. The checks under test never touch it — they are pure
 * over a snapshot — so the store module is stubbed to nothing.
 *
 * That this stub is needed at all is worth noticing: the pure half of the
 * doctor is entangled with the store layer only by module-level query
 * construction, not by the checks themselves.
 */
vi.mock("./evolu", () => ({
  evolu: {
    createQuery: () => ({}),
    loadQuery: async () => [],
    insert: () => ({ ok: true, value: { id: "x" } }),
    update: () => ({ ok: true }),
  },
}));

const {
  orphanSessions,
  unknownVocab,
  impossibleRange,
  overMaxSpan,
  futureDated,
  missingCover,
  unknownIcon,
  isOsJunk,
  CHECK_SPECS,
} = await import("./doctor");
type Snapshot = import("./doctor").Snapshot;

/**
 * Matrix probe J1 — **the ERROR tier, which has never fired in the app's life.**
 *
 * The standing note assumed the first real error finding would be what tested
 * it. It won't be: two of the three error checks guard against states the write
 * layer already refuses (`validateRangeSpan` rejects `end <= start` on both
 * write paths; deleting an entry cascades to its sessions), so **normal use
 * cannot produce one**. They exist for rows arriving by sync or corruption.
 * A synthetic snapshot is the only way to exercise them without hand-editing
 * the store — so that is what this does.
 *
 * `unknown-vocab` is the exception and stays a live probe too: removing a
 * picklist value that rows still use is a supported action, so it is reachable
 * through the UI, and the GUI tour covers it end to end including its fix.
 */

type Habit = Snapshot["habits"][number];
type Entry = Snapshot["entries"][number];
type Session = Snapshot["sessions"][number];

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: "h1",
  key: "sleep",
  name: "Sleep",
  kind: "range",
  subType: null,
  icon: null,
  maxMidnights: 1,
  ...over,
});

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: "e1",
  habitId: "h1",
  title: "A Thing",
  status: null,
  type: null,
  genre: [],
  fandom: null,
  engine: null,
  cover: "images/gaming/e1.jpg",
  source: null,
  externalId: null,
  ...over,
});

const session = (over: Partial<Session> = {}): Session => ({
  id: "s1",
  habitId: "h1",
  entryId: null,
  day: "2026-08-07",
  measure: "range",
  start: "2026-08-06T23:00",
  end: "2026-08-07T07:00",
  ...over,
});

const snap = (over: Partial<Snapshot> = {}): Snapshot => {
  const habits = over.habits ?? [habit()];
  const entries = over.entries ?? [];
  return {
    habits,
    entries,
    sessions: over.sessions ?? [],
    defs: over.defs ?? [],
    vocab: over.vocab ?? new Map(),
    values: over.values ?? [],
    habitById: new Map(habits.map((h) => [h.id, h])),
    entryById: new Map(entries.map((e) => [e.id, e])),
  };
};

describe("the check roster", () => {
  it("is the ruled ten, with exactly three at error severity", () => {
    expect(CHECK_SPECS).toHaveLength(10);
    const errors = CHECK_SPECS.filter((c) => c.severity === "error").map((c) => c.id);
    expect(errors.sort()).toEqual(["impossible-range", "orphan-session", "unknown-vocab"]);
  });

  it("keeps every id unique — mute keys are namespaced by it", () => {
    expect(new Set(CHECK_SPECS.map((c) => c.id)).size).toBe(CHECK_SPECS.length);
  });
});

// ── The error tier ───────────────────────────────────────────────────────────

describe("orphan-session (error)", () => {
  it("is silent when the entry exists, and when the session has none", () => {
    expect(
      orphanSessions(snap({ entries: [entry()], sessions: [session({ entryId: "e1" })] })),
    ).toEqual([]);
    expect(orphanSessions(snap({ sessions: [session({ entryId: null })] }))).toEqual([]);
  });

  it("catches a session pointing at a vanished entry, and offers to delete it", () => {
    const found = orphanSessions(snap({ entries: [], sessions: [session({ entryId: "gone" })] }));
    expect(found).toHaveLength(1);
    expect(found[0].line).toMatch(/no longer exists/i);
    expect(found[0].action).toEqual({ kind: "delete-session", id: "s1" });
    expect(found[0].actionLabel).toBe("Delete session");
    // The finding must be able to take the user somewhere.
    expect(found[0].target).toEqual({ kind: "day", date: "2026-08-07" });
  });

  it("names the habit in its context, and survives the habit being gone too", () => {
    const [f] = orphanSessions(snap({ sessions: [session({ entryId: "gone" })] }));
    expect(f.context).toContain("Sleep");
    const [g] = orphanSessions(
      snap({ habits: [], sessions: [session({ entryId: "gone", habitId: "vanished" })] }),
    );
    expect(g.context).toContain("Unknown habit");
  });
});

describe("impossible-range (error)", () => {
  it("passes an ordinary night", () => {
    expect(impossibleRange(snap({ sessions: [session()] }))).toEqual([]);
  });

  it("catches an end BEFORE its start", () => {
    const found = impossibleRange(
      snap({ sessions: [session({ start: "2026-08-07T07:00", end: "2026-08-06T23:00" })] }),
    );
    expect(found).toHaveLength(1);
    expect(found[0].line).toMatch(/before it starts/i);
  });

  it("catches a zero-length range — 'at or before', not merely 'before'", () => {
    const found = impossibleRange(
      snap({ sessions: [session({ start: "2026-08-07T07:00", end: "2026-08-07T07:00" })] }),
    );
    expect(found).toHaveLength(1);
  });

  it("offers no repair, because the app cannot guess which endpoint is wrong", () => {
    const [f] = impossibleRange(
      snap({ sessions: [session({ start: "2026-08-07T07:00", end: "2026-08-06T23:00" })] }),
    );
    expect(f.action).toBeNull();
    expect(f.target).toEqual({ kind: "day", date: "2026-08-07" });
  });

  it("ignores non-range sessions and half-filled bounds", () => {
    expect(
      impossibleRange(snap({ sessions: [session({ measure: "time", start: null, end: null })] })),
    ).toEqual([]);
    expect(impossibleRange(snap({ sessions: [session({ end: null })] }))).toEqual([]);
  });
});

describe("unknown-vocab (error)", () => {
  const def = {
    id: "d1",
    habitId: "h1",
    key: "coding_language",
    label: "Language",
    scope: "session",
    dataType: "picklist",
  };

  it("passes a value that is still in its list", () => {
    expect(
      unknownVocab(
        snap({
          defs: [def],
          vocab: new Map([["d1", new Set(["Rust", "Go"])]]),
          values: [{ id: "v1", sessionId: "s1", defId: "d1", value: "Rust" }],
          sessions: [session()],
        }),
      ),
    ).toEqual([]);
  });

  it("catches a value that left its list", () => {
    const found = unknownVocab(
      snap({
        defs: [def],
        vocab: new Map([["d1", new Set(["Go"])]]),
        values: [{ id: "v1", sessionId: "s1", defId: "d1", value: "Rust" }],
        sessions: [session()],
      }),
    );
    expect(found).toHaveLength(1);
    expect(found[0].line).toContain("Rust");
  });

  it("stays silent when the list is EMPTY — an unconfigured list is not a violation", () => {
    // Otherwise every row of a habit whose picklist was never filled would be
    // an error, which would bury the real ones.
    expect(
      unknownVocab(
        snap({
          defs: [def],
          vocab: new Map([["d1", new Set()]]),
          values: [{ id: "v1", sessionId: "s1", defId: "d1", value: "Rust" }],
          sessions: [session()],
        }),
      ),
    ).toEqual([]);
  });

  it("never judges a FLAG's stored value against a picklist", () => {
    expect(
      unknownVocab(
        snap({
          defs: [{ ...def, key: "sleep_med", dataType: "flag" }],
          vocab: new Map([["d1", new Set(["yes"])]]),
          values: [{ id: "v1", sessionId: "s1", defId: "d1", value: "true" }],
          sessions: [session()],
        }),
      ),
    ).toEqual([]);
  });
});

// ── Warning tier, lightly ────────────────────────────────────────────────────

describe("the warning tier", () => {
  it("over-max-span fires past the habit's cap and not at it", () => {
    const ok = overMaxSpan(snap({ sessions: [session()] })); // 1 midnight, cap 1
    expect(ok).toEqual([]);
    const bad = overMaxSpan(
      snap({ sessions: [session({ start: "2026-08-05T23:00", end: "2026-08-07T07:00" })] }),
    );
    expect(bad).toHaveLength(1);
    expect(bad[0].line).toMatch(/2 midnights/);
  });

  it("over-max-span says nothing about a habit with no cap", () => {
    expect(
      overMaxSpan(
        snap({
          habits: [habit({ maxMidnights: null })],
          sessions: [session({ start: "2026-08-01T23:00", end: "2026-08-07T07:00" })],
        }),
      ),
    ).toEqual([]);
  });

  it("future-dated fires only beyond today, and offers deletion (the recorded deviation)", () => {
    expect(futureDated(snap({ sessions: [session({ day: "2020-01-01" })] }))).toEqual([]);
    const found = futureDated(snap({ sessions: [session({ day: "2999-01-01" })] }));
    expect(found).toHaveLength(1);
    expect(found[0].action).toEqual({ kind: "delete-session", id: "s1" });
    // A future day is a dead route, so there is deliberately nowhere to jump.
    expect(found[0].target).toBeNull();
  });

  it("missing-cover fires per entry and is mutable per row", () => {
    const found = missingCover(snap({ entries: [entry({ cover: null }), entry({ id: "e2" })] }));
    expect(found).toHaveLength(1);
    expect(found[0].muteKey).toContain("e1");
  });

  it("unknown-icon accepts a real lucide name and rejects an invented one", () => {
    expect(unknownIcon(snap({ habits: [habit({ icon: "moon" })] }))).toEqual([]);
    expect(unknownIcon(snap({ habits: [habit({ icon: null })] }))).toEqual([]);
    const found = unknownIcon(snap({ habits: [habit({ icon: "not-a-real-icon" })] }));
    expect(found).toHaveLength(1);
    expect(found[0].line).toContain("not-a-real-icon");
  });
});

/**
 * The orphan sweep's OS-junk filter (`doctor-1`'s step-4 rider, 2026-08-09).
 * Without it, the day a Mac first opens the images tree every habit folder
 * grows a permanent orphan finding for its `.DS_Store`.
 */
describe("isOsJunk", () => {
  it("skips OS bookkeeping files by name, case-insensitively", () => {
    expect(isOsJunk(".DS_Store")).toBe(true);
    expect(isOsJunk(".ds_store")).toBe(true);
    expect(isOsJunk("Thumbs.db")).toBe(true);
    expect(isOsJunk("desktop.ini")).toBe(true);
    // AppleDouble sidecars pair with ANY filename, so they match by prefix.
    expect(isOsJunk("._cover.jpg")).toBe(true);
  });

  it("never skips a real image — the app's own naming cannot collide", () => {
    expect(isOsJunk("steam-440.jpg")).toBe(false);
    expect(isOsJunk("tmdb-movie-500.png")).toBe(false);
    // A name merely CONTAINING a junk name is not junk.
    expect(isOsJunk("ds_store.png")).toBe(false);
  });
});
