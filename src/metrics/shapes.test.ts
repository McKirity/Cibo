import { afterEach, describe, expect, it } from "vitest";
import { setWeekStartDow, weekStart } from "./dates";
import {
  ERA_DEFAULTS,
  best,
  bestAmount,
  bestBucketBy,
  dayMinutes,
  dayVerdict,
  daysHeatChip,
  distinctDays,
  distribute,
  erasForWaves,
  heatChip,
  heatLevel,
  heatmapCells,
  heatmapGrid,
  heatmapMonths,
  inScope,
  leaderboard,
  periodDelta,
  playedDaySet,
  priorWindow,
  scoped,
  sessionMinutes,
  streaks,
  total,
  wavesForEntry,
  type EntryRow,
  type SessionRow,
  type Wave,
} from "./shapes";

/**
 * The derived-metric catalog — matrix probes **A1** (every shape, known input →
 * hand-computed output), **A2** (streaks: unknown passes through, finalized-empty
 * breaks), **A5** (waves at the default gap and a per-habit override), **A6**
 * (eras at their boundaries), and the `heatmapGrid` half of **A7**.
 *
 * Every expected value here is computed by hand in the test's own comment, never
 * by re-running the implementation's arithmetic in a different shape — a test
 * that recomputes what it is testing only proves the code is self-consistent.
 *
 * `weekStart` reads the module-level week-start dial, so anything that buckets by
 * week resets it (the discipline `dates.test.ts` established).
 */
afterEach(() => setWeekStartDow(1));

let seq = 0;
/** A time session by default — the spine's common case. */
const sess = (day: string, value: number | null, extra: Partial<SessionRow> = {}): SessionRow => ({
  id: `s${++seq}`,
  entry_fk: null,
  day,
  measure_kind: "time",
  value,
  ...extra,
});

const entry = (id: string, extra: Partial<EntryRow> = {}): EntryRow => ({
  id,
  title: id.toUpperCase(),
  status: null,
  genre: [],
  rating: null,
  type: null,
  ...extra,
});

// ── Primitives ────────────────────────────────────────────────────────────────

describe("sessionMinutes", () => {
  it("reads a time row's value, and treats a null value as zero", () => {
    expect(sessionMinutes({ measure_kind: "time", value: 45 })).toBe(45);
    expect(sessionMinutes({ measure_kind: "time", value: null })).toBe(0);
  });

  it("spans a range row's bounds to whole minutes", () => {
    // 2026-06-10 22:00 → 2026-06-11 06:30 = 8h30m = 510 min. June deliberately:
    // no DST transition sits in it in either hemisphere, so the wall-clock span
    // and the real elapsed span agree whatever TZ the runner is in.
    expect(
      sessionMinutes({
        measure_kind: "range",
        value: null,
        start: "2026-06-10T22:00",
        end: "2026-06-11T06:30",
      }),
    ).toBe(510);
  });

  it("rounds a range to the nearest whole minute", () => {
    // 40 seconds rounds up to 1; 20 seconds rounds down to 0.
    expect(
      sessionMinutes({ measure_kind: "range", value: null, start: "2026-06-10T22:00:00", end: "2026-06-10T22:00:40" }),
    ).toBe(1);
    expect(
      sessionMinutes({ measure_kind: "range", value: null, start: "2026-06-10T22:00:00", end: "2026-06-10T22:00:20" }),
    ).toBe(0);
  });

  it("floors a reversed range at zero rather than returning a negative", () => {
    expect(
      sessionMinutes({ measure_kind: "range", value: null, start: "2026-06-11T06:30", end: "2026-06-10T22:00" }),
    ).toBe(0);
  });

  it("yields zero for an unparseable datetime instead of NaN", () => {
    // NaN would poison every sum it entered — the guard compare/ paid for.
    expect(
      sessionMinutes({ measure_kind: "range", value: null, start: "not-a-date", end: "2026-06-11T06:30" }),
    ).toBe(0);
  });

  it("yields zero for a range missing a bound, and for count/none/null kinds", () => {
    expect(sessionMinutes({ measure_kind: "range", value: null, start: "2026-06-10T22:00", end: null })).toBe(0);
    expect(sessionMinutes({ measure_kind: "count", value: 12 })).toBe(0);
    expect(sessionMinutes({ measure_kind: "none", value: null })).toBe(0);
    expect(sessionMinutes({ measure_kind: null, value: 9 })).toBe(0);
  });
});

describe("scoping", () => {
  it("is inclusive at both bounds and open where a bound is null", () => {
    expect(inScope("2026-01-01", { from: "2026-01-01", to: "2026-01-31" })).toBe(true);
    expect(inScope("2026-01-31", { from: "2026-01-01", to: "2026-01-31" })).toBe(true);
    expect(inScope("2025-12-31", { from: "2026-01-01", to: "2026-01-31" })).toBe(false);
    expect(inScope("2026-02-01", { from: "2026-01-01", to: "2026-01-31" })).toBe(false);
    expect(inScope("1999-01-01", { from: null, to: "2026-01-31" })).toBe(true);
    expect(inScope("2099-01-01", { from: "2026-01-01", to: null })).toBe(true);
  });

  it("returns the SAME array reference when the scope is fully open", () => {
    // The memoization fast-path: an all-time scope must not clone the row list.
    const rows = [sess("2026-01-01", 30)];
    expect(scoped(rows, { from: null, to: null })).toBe(rows);
  });
});

describe("dayMinutes", () => {
  it("sums multiple bouts on one day into a single entry", () => {
    const m = dayMinutes([sess("2026-01-01", 30), sess("2026-01-01", 45), sess("2026-01-02", 10)]);
    expect(m.get("2026-01-01")).toBe(75);
    expect(m.get("2026-01-02")).toBe(10);
    expect(m.size).toBe(2);
  });
});

// ── Shape 1 · Total ───────────────────────────────────────────────────────────

describe("shape 1 · total", () => {
  it("sums minutes and counts rows independently", () => {
    // 30 + 45 + 0 (null) + 0 (a count row) = 75 minutes across 4 sessions.
    const t = total([
      sess("2026-01-01", 30),
      sess("2026-01-02", 45),
      sess("2026-01-03", null),
      sess("2026-01-04", 12, { measure_kind: "count" }),
    ]);
    expect(t).toEqual({ minutes: 75, count: 4 });
  });

  it("is zero on both axes for no sessions", () => {
    expect(total([])).toEqual({ minutes: 0, count: 0 });
  });
});

// ── Shape 2 · Distinct days ───────────────────────────────────────────────────

describe("shape 2 · distinct days", () => {
  it("counts calendar days, not sessions", () => {
    const rows = [sess("2026-01-01", 30), sess("2026-01-01", 30), sess("2026-01-02", 30)];
    expect(distinctDays(rows)).toBe(2);
    expect(playedDaySet(rows)).toEqual(new Set(["2026-01-01", "2026-01-02"]));
  });

  it("counts a day whose sessions carry no minutes at all", () => {
    // A measureless habit's whole record is existence — it must still be a day.
    expect(distinctDays([sess("2026-01-01", null, { measure_kind: "none" })])).toBe(1);
  });
});

// ── Shape 3 · Best ────────────────────────────────────────────────────────────

/**
 * 2026-01-01 is a Thursday, so 2026-01-05 is a Monday — the week bucket for
 * Jan 5/6/7 under the ruled Monday start. Asserted rather than assumed, because
 * every "best week" figure below depends on it.
 */
const BEST_ROWS = [
  sess("2026-01-05", 60),
  sess("2026-01-06", 30),
  sess("2026-01-07", 30),
  sess("2026-02-10", 100),
];

describe("shape 3 · best", () => {
  it("has the week anchor these fixtures assume", () => {
    expect(weekStart("2026-01-07")).toBe("2026-01-05");
    expect(weekStart("2026-02-10")).toBe("2026-02-09");
  });

  it("picks the richest day by minutes", () => {
    // 2026-02-10's single 100 beats every individual January day (60/30/30).
    expect(best(BEST_ROWS, "day", "minutes")).toEqual({ key: "2026-02-10", value: 100 });
  });

  it("picks the richest month by minutes — the aggregate, not the biggest day", () => {
    // Jan = 60+30+30 = 120 · Feb = 100. The month with the smaller best DAY wins.
    expect(best(BEST_ROWS, "month", "minutes")).toEqual({ key: "2026-01", value: 120 });
  });

  it("picks the richest bucket by distinct days", () => {
    // Jan holds 3 distinct days, Feb holds 1.
    expect(best(BEST_ROWS, "month", "days")).toEqual({ key: "2026-01", value: 3 });
  });

  it("buckets by week and by year", () => {
    expect(best(BEST_ROWS, "week", "minutes")).toEqual({ key: "2026-01-05", value: 120 });
    expect(best(BEST_ROWS, "year", "minutes")).toEqual({ key: "2026", value: 220 });
  });

  it("returns null for no sessions", () => {
    expect(best([], "day", "minutes")).toBeNull();
    expect(best([], "day", "days")).toBeNull();
  });

  it("breaks a tie toward the first bucket encountered", () => {
    // Strictly-greater comparison, so ties are stable in session order. Worth
    // pinning: a "best day" that flipped between renders would read as a bug.
    const tied = [sess("2026-01-01", 50), sess("2026-01-02", 50)];
    expect(best(tied, "day", "minutes")?.key).toBe("2026-01-01");
  });
});

describe("shape 3 · best, generalized", () => {
  it("sums an arbitrary per-session amount into buckets", () => {
    const rows = [
      sess("2026-01-05", null, { measure_kind: "count", value: 4 }),
      sess("2026-01-06", null, { measure_kind: "count", value: 6 }),
      sess("2026-02-10", null, { measure_kind: "count", value: 7 }),
    ];
    // Jan = 4+6 = 10 beats Feb = 7.
    expect(bestAmount(rows, "month", (s) => s.value ?? 0)).toEqual({ key: "2026-01", value: 10 });
  });

  it("returns null when every amount is zero, rather than a zero-valued bucket", () => {
    // The ruled behaviour: an all-zero window omits the subtitle entirely.
    const rows = [sess("2026-01-05", 0), sess("2026-01-06", 0)];
    expect(bestAmount(rows, "month", (s) => s.value ?? 0)).toBeNull();
  });

  it("re-buckets a day-summed map under an arbitrary keyer", () => {
    // The same figures as `best`'s month case, reached from the other side:
    // Jan = 60+30+30 = 120 · Feb = 100. The map-keyed sibling must agree.
    const src = new Map([
      ["2026-01-05", 60],
      ["2026-01-06", 30],
      ["2026-01-07", 30],
      ["2026-02-10", 100],
    ]);
    expect(bestBucketBy(src, (d) => d.slice(0, 7))).toEqual({ key: "2026-01", value: 120 });
  });
});

// ── Shape 4 · Day verdict ─────────────────────────────────────────────────────

describe("shape 4 · day verdict", () => {
  const played = new Set(["2026-01-01", "2026-01-03"]);
  const finalized = new Set(["2026-01-01", "2026-01-02", "2026-01-03"]);

  it("reads done when a session exists", () => {
    expect(dayVerdict("2026-01-01", played, finalized)).toBe("done");
  });

  it("reads missed only when the day is finalized AND empty", () => {
    expect(dayVerdict("2026-01-02", played, finalized)).toBe("missed");
  });

  it("reads unknown when the day is neither played nor finalized", () => {
    expect(dayVerdict("2026-01-09", played, finalized)).toBe("unknown");
  });

  it("lets a session win over the finalize flag", () => {
    // Finalized + present is still done — finalize is bookkeeping, not a verdict.
    expect(dayVerdict("2026-01-03", played, finalized)).toBe("done");
  });
});

// ── Shape 5 · Streaks (probe A2) ──────────────────────────────────────────────

describe("shape 5 · streaks", () => {
  it("lets an unknown day pass through without breaking or counting", () => {
    // Jan 1 done · Jan 2 unknown · Jan 3 done → ONE run spanning Jan 1–3, but
    // `days` counts DONE days, so it is 2, not the 3-day calendar span.
    const st = streaks("2026-01-01", "2026-01-03", new Set(["2026-01-01", "2026-01-03"]), new Set());
    expect(st.runs).toEqual([{ start: "2026-01-01", end: "2026-01-03", days: 2 }]);
    expect(st.current).toBe(2);
    expect(st.longest).toBe(2);
  });

  it("breaks a run on a finalized-empty day", () => {
    // done done | MISSED | done done done  → runs of 2 and 3.
    const played = new Set(["2026-01-01", "2026-01-02", "2026-01-04", "2026-01-05", "2026-01-06"]);
    const finalized = new Set([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
      "2026-01-05",
      "2026-01-06",
    ]);
    const st = streaks("2026-01-01", "2026-01-10", played, finalized);
    expect(st.runs).toEqual([
      { start: "2026-01-01", end: "2026-01-02", days: 2 },
      { start: "2026-01-04", end: "2026-01-06", days: 3 },
    ]);
    expect(st.longest).toBe(3);
    // Jan 7–10 are unknown, so the last run is still alive.
    expect(st.current).toBe(3);
    expect(st.currentRun).toEqual({ start: "2026-01-04", end: "2026-01-06", days: 3 });
  });

  it("kills the CURRENT streak when a confirmed miss sits after the last run", () => {
    // The run ends Jan 2; Jan 5 is finalized-empty. Longest survives, current does not.
    const st = streaks(
      "2026-01-01",
      "2026-01-10",
      new Set(["2026-01-01", "2026-01-02"]),
      new Set(["2026-01-01", "2026-01-02", "2026-01-05"]),
    );
    expect(st.longest).toBe(2);
    expect(st.current).toBe(0);
    expect(st.currentRun).toBeNull();
  });

  it("keeps the current streak alive across a trailing run of unknown days", () => {
    // Nothing is finalized after Jan 2, so the silence is 'not yet logged',
    // never 'missed' — the pass-through rule at the window's edge.
    const st = streaks(
      "2026-01-01",
      "2026-01-31",
      new Set(["2026-01-01", "2026-01-02"]),
      new Set(["2026-01-01", "2026-01-02"]),
    );
    expect(st.current).toBe(2);
  });

  it("returns an empty result for a window with nothing in it", () => {
    const st = streaks("2026-01-01", "2026-01-10", new Set(), new Set());
    expect(st).toEqual({ current: 0, currentRun: null, longest: 0, runs: [] });
  });

  it("counts a single done day as a one-day streak", () => {
    const st = streaks("2026-01-01", "2026-01-01", new Set(["2026-01-01"]), new Set());
    expect(st.current).toBe(1);
    expect(st.longest).toBe(1);
  });

  it("ignores days outside the window entirely", () => {
    // A run that started before `from` is only counted from `from` onward — the
    // window is the question being asked, not a filter over a longer answer.
    const played = new Set(["2025-12-28", "2025-12-29", "2026-01-01"]);
    const st = streaks("2026-01-01", "2026-01-05", played, new Set());
    expect(st.runs).toEqual([{ start: "2026-01-01", end: "2026-01-01", days: 1 }]);
  });
});

// ── Shape 6 · Heat ────────────────────────────────────────────────────────────

describe("shape 6 · heat level", () => {
  it("sits on its exact cutoffs", () => {
    // 0 · <30 · <90 · <190 · else — the boundaries are where an off-by-one lives.
    expect([0, 1, 29, 30, 89, 90, 189, 190, 1000].map(heatLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("treats a negative as empty rather than as level 1", () => {
    expect(heatLevel(-5)).toBe(0);
  });
});

describe("shape 6 · heat chips", () => {
  const today = "2026-01-14";

  it("averages the trailing 14 days INCLUSIVE of both ends", () => {
    // The window is today−13 … today. A session on 2026-01-01 is the 14th day
    // back and counts; 2025-12-31 is the 15th and does not.
    expect(heatChip([sess("2026-01-01", 1680)], today)).toBe("HOT"); // 1680/14 = 120
    expect(heatChip([sess("2025-12-31", 1680)], today)).toBe("COLD"); // outside → 0
  });

  it("lands on each chip's lower bound", () => {
    // /14 per day: 120 → HOT · 45 → WARM · 15 → COOLING · below → COLD.
    expect(heatChip([sess(today, 120 * 14)], today)).toBe("HOT");
    expect(heatChip([sess(today, 45 * 14)], today)).toBe("WARM");
    expect(heatChip([sess(today, 15 * 14)], today)).toBe("COOLING");
    expect(heatChip([sess(today, 15 * 14 - 1)], today)).toBe("COLD");
    expect(heatChip([], today)).toBe("COLD");
  });

  it("counts DISTINCT days for the minutes-less habits", () => {
    const days = (n: number) =>
      Array.from({ length: n }, (_, i) => sess(`2026-01-${String(i + 1).padStart(2, "0")}`, null, {
        measure_kind: "none",
      }));
    expect(daysHeatChip(days(9), today)).toBe("HOT");
    expect(daysHeatChip(days(4), today)).toBe("WARM");
    expect(daysHeatChip(days(1), today)).toBe("COOLING");
    expect(daysHeatChip([], today)).toBe("COLD");
  });

  it("does not let repeat bouts on one day inflate the days chip", () => {
    const sameDay = [sess(today, null), sess(today, null), sess(today, null), sess(today, null)];
    expect(daysHeatChip(sameDay, today)).toBe("COOLING"); // 1 distinct day, not 4
  });
});

// ── Shape 7 · Distribution + leaderboard ──────────────────────────────────────

describe("shape 7 · distribute", () => {
  it("tallies, ranks descending, and scales pct to the row set's max", () => {
    const rows = distribute(
      [
        entry("a", { status: "Current" }),
        entry("b", { status: "Current" }),
        entry("c", { status: "Finished" }),
      ],
      (e) => e.status,
    );
    expect(rows).toEqual([
      { key: "Current", value: 2, pct: 100 },
      { key: "Finished", value: 1, pct: 50 },
    ]);
  });

  it("flat-maps a multi-value key so one entry can score several rows", () => {
    const rows = distribute(
      [entry("a", { genre: ["RPG", "Indie"] }), entry("b", { genre: ["RPG"] })],
      (e) => e.genre,
    );
    expect(rows.map((r) => [r.key, r.value])).toEqual([
      ["RPG", 2],
      ["Indie", 1],
    ]);
  });

  it("skips a null key and an empty multi-value list", () => {
    const rows = distribute([entry("a", { status: null }), entry("b", { status: "Current" })], (e) => e.status);
    expect(rows).toEqual([{ key: "Current", value: 1, pct: 100 }]);
    expect(distribute([entry("a", { genre: [] })], (e) => e.genre)).toEqual([]);
  });

  it("DROPS a value absent from an explicit order — the behaviour worth knowing", () => {
    // With `order` given, the row set is filtered to it. A user-added status that
    // is not in the passed vocab therefore vanishes rather than sorting last.
    const rows = distribute(
      [entry("a", { status: "Current" }), entry("b", { status: "Homebrew" })],
      (e) => e.status,
      { order: ["Current", "Finished"] },
    );
    expect(rows.map((r) => r.key)).toEqual(["Current"]);
  });

  it("honours the order's sequence, not the tally", () => {
    const rows = distribute(
      [entry("a", { status: "Finished" }), entry("b", { status: "Finished" }), entry("c", { status: "Current" })],
      (e) => e.status,
      { order: ["Current", "Finished"] },
    );
    // Current has fewer, but the vocab order wins.
    expect(rows.map((r) => [r.key, r.value])).toEqual([
      ["Current", 1],
      ["Finished", 2],
    ]);
  });

  it("caps at `top` and returns nothing for no items", () => {
    const many = ["a", "b", "c"].map((k, i) =>
      Array.from({ length: 3 - i }, (_, j) => entry(`${k}${j}`, { status: k })),
    ).flat();
    expect(distribute(many, (e) => e.status, { top: 2 }).map((r) => r.key)).toEqual(["a", "b"]);
    expect(distribute([], (e) => e.status)).toEqual([]);
  });
});

describe("shape 7 · leaderboard", () => {
  const entries = [entry("e1", { title: "Alpha" }), entry("e2", { title: "Beta" })];
  const rows = [
    sess("2026-01-01", 60, { entry_fk: "e1" }),
    sess("2026-01-02", 30, { entry_fk: "e1" }),
    sess("2026-01-01", 45, { entry_fk: "e2" }),
    sess("2026-01-03", 999), // no entry — a simple habit's bout
  ];

  it("ranks entries by minutes and scales pct to the leader", () => {
    // Alpha 90 · Beta 45 → 100% and 50%. The entry-less 999 never appears.
    expect(leaderboard(rows, entries, "minutes")).toEqual([
      { entryId: "e1", title: "Alpha", value: 90, pct: 100 },
      { entryId: "e2", title: "Beta", value: 45, pct: 50 },
    ]);
  });

  it("ranks by distinct days when asked", () => {
    expect(leaderboard(rows, entries, "days").map((r) => [r.title, r.value])).toEqual([
      ["Alpha", 2],
      ["Beta", 1],
    ]);
  });

  it("falls back to an em-dash for a session pointing at a missing entry", () => {
    // The orphan-session state the Data Doctor exists to catch: it must render,
    // not throw.
    const orphan = [sess("2026-01-01", 10, { entry_fk: "gone" })];
    expect(leaderboard(orphan, entries, "minutes")[0]).toMatchObject({ title: "—", value: 10 });
  });

  it("caps at `top`, and returns nothing rather than dividing by zero", () => {
    expect(leaderboard(rows, entries, "minutes", 1)).toHaveLength(1);
    expect(leaderboard([], entries, "minutes")).toEqual([]);
  });
});

// ── Shape 8 · Period delta ────────────────────────────────────────────────────

describe("shape 8 · period delta", () => {
  it("puts the prior window immediately before, at equal length", () => {
    // Jan 8–14 is 7 days, so the prior window is Jan 1–7 — adjacent, not overlapping.
    expect(priorWindow("2026-01-08", "2026-01-14")).toEqual({ from: "2026-01-01", to: "2026-01-07" });
  });

  it("handles a single-day window", () => {
    expect(priorWindow("2026-01-08", "2026-01-08")).toEqual({ from: "2026-01-07", to: "2026-01-07" });
  });

  it("returns null when the prior window holds no sessions (the no-prior-period law)", () => {
    const rows = [sess("2026-01-10", 120)];
    expect(periodDelta(rows, "2026-01-08", "2026-01-14", "week", "minutes")).toBeNull();
  });

  it("reports the rise between two equal windows, in hours", () => {
    // Current Jan 8–14 = 120 min · prior Jan 1–7 = 60 min. At week grain both
    // windows are exactly one bucket, so the rate IS the total: +60 min = +1h.
    const rows = [sess("2026-01-10", 120), sess("2026-01-03", 60)];
    expect(periodDelta(rows, "2026-01-08", "2026-01-14", "week", "minutes")).toEqual({
      text: "▲ 1h",
      down: false,
    });
  });

  it("marks a fall as down", () => {
    const rows = [sess("2026-01-10", 60), sess("2026-01-03", 120)];
    expect(periodDelta(rows, "2026-01-08", "2026-01-14", "week", "minutes")).toEqual({
      text: "▼ 1h",
      down: true,
    });
  });

  it("compares distinct-day counts on the days metric", () => {
    // 2 active days this week vs 1 last week → +1, unitless.
    const rows = [
      sess("2026-01-10", 10),
      sess("2026-01-11", 10),
      sess("2026-01-03", 10),
    ];
    expect(periodDelta(rows, "2026-01-08", "2026-01-14", "week", "days")).toEqual({
      text: "▲ 1",
      down: false,
    });
  });
});

// ── Shape 9 · Heatmap grid (probe A7) ─────────────────────────────────────────

describe("shape 9 · heatmap grid", () => {
  const visibleDays = (end: string, weeks: number, from: string | null = null): string[] =>
    heatmapGrid<string | null>(end, (d) => d, () => null, { weeks, from }).filter((d): d is string => d != null);

  it("emits exactly weeks × 7 cells", () => {
    expect(heatmapGrid("2026-01-14", (d) => d, () => null, { weeks: 53 })).toHaveLength(371);
    expect(heatmapGrid("2026-01-14", (d) => d, () => null, { weeks: 4 })).toHaveLength(28);
  });

  it("fills row-major — a whole weekday row across all weeks before the next", () => {
    // Row 0 is the week-start column; consecutive cells in a row are 7 days apart.
    const cells = heatmapGrid<string | null>("2026-01-14", (d) => d, () => null, { weeks: 4 });
    expect(cells[0]).toBe("2025-12-22"); // weekStart(2026-01-14) = 2026-01-12, minus 3 weeks
    expect(cells[1]).toBe("2025-12-29");
    expect(cells[4]).toBe("2025-12-23"); // the next ROW starts at index weeks(4)
  });

  it("hides every cell after `end`", () => {
    // 2026-01-14 is a Wednesday, so its week's Thu/Fri/Sat/Sun are future.
    // ⚠ The LATEST day is not the last element: the walk is row-major, so the
    // array ends on the final Sunday row — which for a mid-week `end` belongs
    // to the PREVIOUS week (here 2026-01-11). Sort before asking for a maximum.
    const days = visibleDays("2026-01-14", 4);
    const sorted = [...days].sort();
    expect(sorted[sorted.length - 1]).toBe("2026-01-14");
    expect(days[days.length - 1]).toBe("2026-01-11");
    expect(days).toHaveLength(24); // 28 cells − 4 future
  });

  it("covers a contiguous ascending span with no gaps and no repeats", () => {
    const days = visibleDays("2026-01-14", 8);
    const sorted = [...days].sort();
    expect(new Set(days).size).toBe(days.length);
    for (let i = 1; i < sorted.length; i++)
      expect(Date.parse(sorted[i]) - Date.parse(sorted[i - 1])).toBe(86_400_000);
  });

  it("walks a leap day and a year boundary exactly once each", () => {
    const days = visibleDays("2024-03-02", 53);
    expect(days.filter((d) => d === "2024-02-29")).toHaveLength(1);
    expect(days.filter((d) => d === "2024-01-01")).toHaveLength(1);
    expect(days.filter((d) => d === "2023-12-31")).toHaveLength(1);
  });

  it("hides cells before a pinned `from` — a pinned year's Jan 1", () => {
    // Again row-major: `days[0]` is the earliest MONDAY, not the earliest day.
    const days = visibleDays("2026-03-01", 53, "2026-01-01");
    expect([...days].sort()[0]).toBe("2026-01-01");
    expect(days.some((d) => d < "2026-01-01")).toBe(false);
  });
});

describe("shape 9 · heatmap cells", () => {
  it("carries minutes, its level, and a null catVar without a resolver", () => {
    const cells = heatmapCells(new Map([["2026-01-14", 95]]), "2026-01-14", 1);
    const hit = cells.find((c) => c.day === "2026-01-14");
    expect(hit).toEqual({ day: "2026-01-14", minutes: 95, level: 3, catVar: null });
  });

  it("reads an unlogged day as zero minutes at level 0, never as future", () => {
    const cells = heatmapCells(new Map(), "2026-01-14", 1);
    const past = cells.find((c) => c.day === "2026-01-12");
    expect(past).toMatchObject({ minutes: 0, level: 0 });
  });

  it("marks future cells with level −1 and a null day", () => {
    const cells = heatmapCells(new Map(), "2026-01-14", 1);
    expect(cells.filter((c) => c.level === -1).every((c) => c.day === null)).toBe(true);
    expect(cells.filter((c) => c.level === -1)).toHaveLength(4); // Thu–Sun of that week
  });

  it("applies a categorical resolver when given one", () => {
    const cells = heatmapCells(new Map([["2026-01-14", 10]]), "2026-01-14", 1, (d) =>
      d === "2026-01-14" ? "cat-2" : null,
    );
    expect(cells.find((c) => c.day === "2026-01-14")?.catVar).toBe("cat-2");
  });

  it("labels the header at each month change, in column order", () => {
    const months = heatmapMonths("2026-03-02", 10);
    expect(months.map((m) => m.label)).toEqual(["Dec", "Jan", "Feb", "Mar"]);
    expect(months.map((m) => m.col)).toEqual([...months.map((m) => m.col)].sort((a, b) => a - b));
  });
});

// ── Shape 10 · Waves (probe A5) ───────────────────────────────────────────────

describe("shape 10 · waves", () => {
  it("returns nothing for no sessions", () => {
    expect(wavesForEntry([])).toEqual([]);
  });

  it("reads a single day as a one-day wave", () => {
    expect(wavesForEntry([sess("2026-01-01", 60)])).toEqual([
      { start: "2026-01-01", end: "2026-01-01", days: 1, minutes: 60 },
    ]);
  });

  it("keeps a gap EQUAL to the threshold inside one wave", () => {
    // The break is `> gapDays`, so a 30-day gap at the 30-day default does NOT
    // split. This boundary is the whole behaviour of the dial.
    const w = wavesForEntry([sess("2026-01-01", 60), sess("2026-01-31", 60)], 30);
    expect(w).toHaveLength(1);
    expect(w[0]).toEqual({ start: "2026-01-01", end: "2026-01-31", days: 2, minutes: 120 });
  });

  it("splits one day past the threshold", () => {
    const w = wavesForEntry([sess("2026-01-01", 60), sess("2026-02-01", 60)], 30);
    expect(w).toHaveLength(2);
    expect(w.map((x) => x.start)).toEqual(["2026-01-01", "2026-02-01"]);
  });

  it("reads a replay as a second wave at the default threshold", () => {
    // A play in January, then a return in June — the replay case the shape exists for.
    const w = wavesForEntry(
      [sess("2026-01-01", 60), sess("2026-01-02", 90), sess("2026-06-10", 45), sess("2026-06-11", 30)],
      30,
    );
    expect(w).toEqual([
      { start: "2026-01-01", end: "2026-01-02", days: 2, minutes: 150 },
      { start: "2026-06-10", end: "2026-06-11", days: 2, minutes: 75 },
    ]);
  });

  it("splits differently under a per-habit gap override", () => {
    // The same rows: one wave at the 30-day default, two at a 7-day override.
    const rows = [sess("2026-01-01", 60), sess("2026-01-15", 60)];
    expect(wavesForEntry(rows, 30)).toHaveLength(1);
    expect(wavesForEntry(rows, 7)).toHaveLength(2);
  });

  it("counts a day once however many bouts it holds, but sums all their minutes", () => {
    const w = wavesForEntry([sess("2026-01-01", 60), sess("2026-01-01", 30)], 30);
    expect(w[0]).toEqual({ start: "2026-01-01", end: "2026-01-01", days: 1, minutes: 90 });
  });

  it("does not depend on the order the sessions arrive in", () => {
    const forward = wavesForEntry([sess("2026-01-01", 10), sess("2026-06-01", 10)], 30);
    const reversed = wavesForEntry([sess("2026-06-01", 10), sess("2026-01-01", 10)], 30);
    expect(reversed).toEqual(forward);
  });
});

// ── Shape 11 · Eras (probe A6) ────────────────────────────────────────────────

const wave = (start: string, end: string, days: number, minutes: number): Wave => ({
  start,
  end,
  days,
  minutes,
});
const byMinutes = (w: Wave): number => w.minutes;

describe("shape 11 · eras", () => {
  it("returns nothing for no waves", () => {
    expect(erasForWaves([], byMinutes, 30)).toEqual([]);
  });

  it("refuses to seed a single-session habit", () => {
    // 1 day < seedDays (5), so there is no era — an entry played once is not an era.
    expect(erasForWaves([wave("2026-01-01", "2026-01-01", 1, 60)], byMinutes, 30)).toEqual([]);
  });

  it("refuses to seed a wave under the day floor even when it is the only one", () => {
    // 4 days, and 100% of the amount — the share gate passes, the days gate does not.
    expect(erasForWaves([wave("2026-01-01", "2026-01-04", 4, 600)], byMinutes, 30)).toEqual([]);
  });

  it("seeds a lone dense wave into era 1", () => {
    const eras = erasForWaves([wave("2026-01-01", "2026-01-10", 10, 600)], byMinutes, 30);
    expect(eras).toEqual([
      { from: 0, to: 0, start: "2026-01-01", end: "2026-01-10", n: 1, days: 10, amount: 600 },
    ]);
  });

  it("absorbs a close, equally dense neighbour into one era", () => {
    // Silence Jan 10 → Jan 15 is 5 days, well under the 60-day rest ceiling
    // (gapDays 30 × joinMult 2). Merged density = 20 logged / 24 span = 0.83,
    // clearing both the 0.12 floor and 0.8 × the seed's 1.0 density.
    const eras = erasForWaves(
      [wave("2026-01-01", "2026-01-10", 10, 600), wave("2026-01-15", "2026-01-24", 10, 600)],
      byMinutes,
      30,
    );
    expect(eras).toHaveLength(1);
    expect(eras[0]).toEqual({
      from: 0,
      to: 1,
      start: "2026-01-01",
      end: "2026-01-24",
      n: 1,
      days: 20,
      amount: 1200,
    });
  });

  it("leaves a sparse straggler as an interlude rather than diluting the era", () => {
    // Jan 10 → Mar 1 is 50 days, INSIDE the 60-day rest ceiling — so the join is
    // rejected by the density gate alone: 11 logged over a 60-day merged span is
    // 0.18, which clears the 0.12 floor but not 0.8 × the era's 1.0 density.
    const eras = erasForWaves(
      [wave("2026-01-01", "2026-01-10", 10, 600), wave("2026-03-01", "2026-03-01", 1, 10)],
      byMinutes,
      30,
    );
    expect(eras).toHaveLength(1);
    expect(eras[0]).toMatchObject({ from: 0, to: 0, end: "2026-01-10", days: 10 });
  });

  it("keeps two eras apart across one long gap", () => {
    // 142 days of silence — past the rest ceiling, so no absorption is even
    // attempted, and both waves seed on their own.
    const eras = erasForWaves(
      [wave("2026-01-01", "2026-01-10", 10, 600), wave("2026-06-01", "2026-06-10", 10, 600)],
      byMinutes,
      30,
    );
    expect(eras.map((e) => [e.n, e.start, e.end])).toEqual([
      [1, "2026-01-01", "2026-01-10"],
      [2, "2026-06-01", "2026-06-10"],
    ]);
  });

  it("numbers eras chronologically, whatever order they seeded in", () => {
    const eras = erasForWaves(
      [
        wave("2026-01-01", "2026-01-10", 10, 100), // seeds second (smaller share, later in the scan? no — index order)
        wave("2026-06-01", "2026-06-20", 20, 900),
      ],
      byMinutes,
      30,
    );
    expect(eras.map((e) => e.n)).toEqual([1, 2]);
    expect(eras[0].start < eras[1].start).toBe(true);
  });

  it("refuses to seed a wave below the share floor", () => {
    // The small wave holds 600/(600+100000) ≈ 0.6% of the amount, under the 5%
    // seedShare — so a long-but-trivial stretch never becomes an era of its own.
    const eras = erasForWaves(
      [wave("2026-01-01", "2026-01-10", 10, 600), wave("2026-06-01", "2026-06-30", 30, 100_000)],
      byMinutes,
      30,
    );
    expect(eras).toHaveLength(1);
    expect(eras[0].start).toBe("2026-06-01");
  });

  it("carries the documented defaults", () => {
    // Pinned because every expectation above is computed against these numbers.
    expect(ERA_DEFAULTS).toEqual({
      seedDays: 5,
      seedShare: 0.05,
      densityFloor: 0.12,
      diluteRatio: 0.8,
      joinMult: 2,
    });
  });
});
