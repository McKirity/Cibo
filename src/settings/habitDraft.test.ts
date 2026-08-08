import { describe, expect, it } from "vitest";
import type { DerivedRule } from "../db/schema";
import {
  canCommit,
  definitionKey,
  draftForKind,
  draftProblems,
  emptyDraft,
  fromDerivedRules,
  habitKeyFrom,
  toDerivedRules,
  toFlagDefinitions,
  toMeasureColumns,
  type DerivedDraft,
  type HabitDraft,
} from "./habitDraft";

/**
 * The creator's draft-to-storage bridge — the regression pin for bug
 * `creator-1` (Phase 2 step 2, fixed 2026-08-07).
 *
 * The bug: a "bundled flag" was written to `habits.derived_rules` as a rule
 * with template "flag". Nothing could ever read it back — a flag is not
 * computable from a session's two timestamps, so all three rule evaluators
 * skipped it — and the flag was silently unloggable and invisible everywhere.
 * The fix routes flags to `subunit_definitions` instead, where the log form and
 * the range dashboard already handle them.
 *
 * What these tests hold down is the SPLIT: computed checks go one way, ticked
 * flags go the other, and neither leaks into the other's channel.
 */
const rule = (r: Record<string, unknown>): DerivedRule => r as unknown as DerivedRule;

const time: DerivedDraft = {
  type: "time",
  name: "noon",
  endpoint: "end",
  dir: "before",
  time: "12:00",
};
const duration: DerivedDraft = { type: "duration", name: "8h", cmp: "atleast", hours: "8" };
const flag: DerivedDraft = { type: "flag", name: "Took Medication" };

describe("toDerivedRules — the computed half only", () => {
  it("translates the two computed templates", () => {
    expect(toDerivedRules([time, duration])).toEqual([
      { template: "timeOfDay", label: "noon", endpoint: "end", op: "before", time: "12:00" },
      { template: "duration", label: "8h", op: "gte", minutes: 480 },
    ]);
  });

  it("NEVER emits a flag rule — the whole of `creator-1`", () => {
    const out = toDerivedRules([time, flag, duration]);
    expect(out).toHaveLength(2);
    expect(out.some((r) => r.template === "flag")).toBe(false);
  });

  it("maps 'at most' to lte and converts hours to whole minutes", () => {
    expect(toDerivedRules([{ type: "duration", name: "short", cmp: "atmost", hours: "6.5" }])).toEqual(
      [{ template: "duration", label: "short", op: "lte", minutes: 390 }],
    );
  });

  it("drops unnamed drafts rather than storing junk", () => {
    expect(toDerivedRules([{ ...time, name: "   " }])).toEqual([]);
    expect(toDerivedRules([{ ...flag, name: "   " }])).toEqual([]);
  });

  /**
   * Bug `creator-2` (found by this very test, 2026-08-07). `Number("")` is 0,
   * not NaN, so an emptied hours box passed the `Number.isFinite` guard and
   * stored "span is at least 0 hours" — a check every session satisfies, drawn
   * as a permanently-100% donut.
   */
  it("refuses a duration check with no hours, rather than storing an always-true one", () => {
    expect(toDerivedRules([{ type: "duration", name: "bad", cmp: "atleast", hours: "" }])).toEqual([]);
    expect(toDerivedRules([{ type: "duration", name: "bad", cmp: "atleast", hours: "  " }])).toEqual(
      [],
    );
    expect(toDerivedRules([{ type: "duration", name: "bad", cmp: "atleast", hours: "abc" }])).toEqual(
      [],
    );
    expect(toDerivedRules([{ type: "duration", name: "bad", cmp: "atleast", hours: "-3" }])).toEqual(
      [],
    );
  });

  it("still allows a deliberate zero-hour target when it is actually typed", () => {
    expect(toDerivedRules([{ type: "duration", name: "any", cmp: "atmost", hours: "0" }])).toEqual([
      { template: "duration", label: "any", op: "lte", minutes: 0 },
    ]);
  });

  it("refuses a time-of-day check with no time", () => {
    expect(toDerivedRules([{ ...time, time: "  " }])).toEqual([]);
  });
});

describe("toFlagDefinitions — the stored half", () => {
  it("picks out only the flags, trimmed", () => {
    expect(toFlagDefinitions([time, { type: "flag", name: "  Vitamins  " }, duration])).toEqual([
      { label: "Vitamins", id: undefined },
    ]);
  });

  it("carries an existing definition id through, so an edit updates instead of duplicating", () => {
    expect(toFlagDefinitions([{ type: "flag", name: "Took Medication", id: "def-1" }])).toEqual([
      { label: "Took Medication", id: "def-1" },
    ]);
  });

  it("drops unnamed flags", () => {
    expect(toFlagDefinitions([{ type: "flag", name: "" }, { type: "flag", name: "  " }])).toEqual([]);
  });

  it("splits a mixed builder cleanly — nothing lands in both channels", () => {
    const drafts = [time, flag, duration];
    const rules = toDerivedRules(drafts);
    const flags = toFlagDefinitions(drafts);
    expect(rules).toHaveLength(2);
    expect(flags).toHaveLength(1);
    const ruleLabels = rules.map((r) => r.label as string);
    expect(ruleLabels).not.toContain("Took Medication");
    expect(flags.map((f) => f.label)).not.toContain("noon");
  });
});

describe("fromDerivedRules — the editor's pre-fill", () => {
  it("round-trips the computed two", () => {
    expect(fromDerivedRules(toDerivedRules([time, duration]))).toEqual([time, duration]);
  });

  it("drops a legacy flag rule left by the pre-fix creator", () => {
    // Such a row was inert from the day it was written; the flag is rebuilt
    // from the habit's definitions instead, so dropping it here is what clears
    // it from `derived_rules` on the next save.
    const stored = [
      rule({ template: "timeOfDay", label: "noon", endpoint: "end", op: "before", time: "12:00" }),
      rule({ template: "flag", label: "Vitamins" }),
    ];
    const drafts = fromDerivedRules(stored);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].type).toBe("time");
  });

  it("falls back sanely on a rule missing its parameters", () => {
    expect(fromDerivedRules([rule({ template: "duration", label: "x" })])).toEqual([
      { type: "duration", name: "x", cmp: "atleast", hours: "8" },
    ]);
  });
});

describe("draftProblems — the ruled gates", () => {
  const base = (o: Partial<HabitDraft> = {}): HabitDraft => ({
    ...emptyDraft("habit-1"),
    name: "Reading",
    kind: "simple",
    ...o,
  });

  it("passes a minimal valid draft", () => {
    expect(canCommit(draftProblems(base(), new Set()))).toBe(true);
  });

  it("blocks a missing or duplicate name, case-insensitively", () => {
    expect(draftProblems(base({ name: "  " }), new Set()).nameMissing).toBe(true);
    expect(draftProblems(base({ name: "Sleep" }), new Set(["sleep"])).nameTaken).toBe(true);
  });

  it("blocks a count measure with no unit", () => {
    const p = draftProblems(base({ measuresCount: true, countUnit: " " }), new Set());
    expect(p.unitMissing).toBe(true);
    expect(canCommit(p)).toBe(false);
  });

  it("blocks a measureless PROJECT but allows a measureless simple habit", () => {
    // Step 1's `schema-1` fix — the keystone's measureless-is-simple-only rule,
    // gated in the creator. A measureless project would refuse every session.
    expect(draftProblems(base({ kind: "project" }), new Set()).measureMissing).toBe(true);
    expect(draftProblems(base({ kind: "simple" }), new Set()).measureMissing).toBe(false);
    expect(
      draftProblems(base({ kind: "project", measuresTime: true }), new Set()).measureMissing,
    ).toBe(false);
  });

  it("treats an unnamed medium as a warning, never a block", () => {
    const p = draftProblems(base({ mediums: [{ name: "", values: [] }] }), new Set());
    expect(p.mediumUnnamed).toBe(true);
    expect(canCommit(p)).toBe(true);
  });
});

describe("key derivation", () => {
  it("namespaces a definition key by its habit", () => {
    expect(definitionKey("sleep", "Took Medication")).toBe("sleep_took_medication");
    expect(definitionKey("sleep", "  Med!  ")).toBe("sleep_med");
  });

  it("never yields an empty key", () => {
    expect(definitionKey("sleep", "!!!")).toBe("sleep_field");
    expect(habitKeyFrom("!!!")).toBe("habit");
  });

  it("slugs a habit name", () => {
    expect(habitKeyFrom("Video Games")).toBe("video-games");
  });
});

/**
 * The measure bridge — the regression pin for bug `creator-4` (Phase 2 step 2,
 * found by the static sweep 2026-08-08).
 *
 * The bug: the creator hides its measures step for `kind: "range"`, but `set()`
 * is a plain field merge with no cross-field reset — so ticking Time under
 * kind=simple and *then* switching to Range saved `measures_time: 1` onto a
 * range habit. The user could not see or untick it (the step is gone), and
 * neither validation gate looked: `validateHabitShape` returns ok immediately
 * for range, and `draftProblems` raises `measureMissing` for projects only.
 * Downstream the daily form drew a Time box beside the range picker.
 *
 * The fix routes the columns through `toMeasureColumns`, which is structurally
 * incapable of declaring a measure on a range habit — the same shape the flag
 * split took, and for the same reason: the guard belongs in the bridge, not in
 * a commit block where three sibling guards sit a line apart and the fourth was
 * missed.
 */
describe("toMeasureColumns — a range habit declares no other measure", () => {
  const draft = (o: Partial<HabitDraft> = {}): HabitDraft => ({
    ...emptyDraft("habit-1"),
    name: "Sleep",
    kind: "simple",
    ...o,
  });

  it("passes a simple habit's measures through untouched", () => {
    expect(toMeasureColumns(draft({ measuresTime: true }))).toEqual({
      measuresTime: true,
      measuresCount: false,
      countUnit: null,
    });
  });

  it("carries a count's trimmed unit label", () => {
    expect(
      toMeasureColumns(draft({ measuresCount: true, countUnit: "  words  " })),
    ).toEqual({ measuresTime: false, measuresCount: true, countUnit: "words" });
  });

  it("drops a unit label with no count measure behind it", () => {
    expect(toMeasureColumns(draft({ countUnit: "words" })).countUnit).toBe(null);
  });

  it("drops a blank unit label rather than storing whitespace", () => {
    expect(
      toMeasureColumns(draft({ measuresCount: true, countUnit: "   " })).countUnit,
    ).toBe(null);
  });

  // THE BUG ITSELF: ticks collected under another kind must not survive the
  // switch to range, because the step that would let you clear them is gone.
  it("refuses every measure on a range habit, however the draft got there", () => {
    expect(
      toMeasureColumns(
        draft({
          kind: "range",
          measuresTime: true,
          measuresCount: true,
          countUnit: "words",
        }),
      ),
    ).toEqual({ measuresTime: false, measuresCount: false, countUnit: null });
  });

  it("matches the seeded Sleep, which declares neither measure", () => {
    expect(toMeasureColumns(draft({ kind: "range" }))).toEqual({
      measuresTime: false,
      measuresCount: false,
      countUnit: null,
    });
  });
});

/**
 * Changing kind clears what the old kind declared — user-ruled 2026-08-08,
 * *"have everything clear every time I switch to a different habit type."*
 *
 * The ruling came out of the GUI tour for `creator-4`. That bug's stored-data
 * half had been fixed by sanitizing the write, and the user found why that was
 * not enough: the DRAFT still carried the old answers, so Simple → Range →
 * Simple showed Time still ticked. **Sanitizing the write makes the store
 * correct while leaving the screen lying about what it is about to save.**
 */
describe("draftForKind — a kind switch clears the old kind's declarations", () => {
  const filled = (o: Partial<HabitDraft> = {}): HabitDraft => ({
    ...emptyDraft("habit-1"),
    name: "Reading",
    kind: "simple",
    measuresTime: true,
    measuresCount: true,
    countUnit: "pages",
    mediums: [{ name: "Board", values: ["QK65"] }],
    entryAttrs: ["status"],
    derived: [{ type: "flag", name: "Took Medication" }],
    ...o,
  });

  // THE SYMPTOM THE USER REPORTED: the round trip must not leave Time ticked.
  it("clears measures on the way out AND on the way back", () => {
    const toRange = draftForKind(filled(), "range");
    expect(toRange.measuresTime).toBe(false);
    expect(toRange.measuresCount).toBe(false);
    const backToSimple = draftForKind(toRange, "simple");
    expect(backToSimple.measuresTime).toBe(false);
    expect(backToSimple.countUnit).toBe("");
  });

  it("clears every kind-scoped declaration, not just the measures", () => {
    const next = draftForKind(filled(), "range");
    expect(next.mediums).toEqual([]);
    expect(next.entryAttrs).toEqual([]);
    expect(next.derived).toEqual([]);
    expect(next.measureless).toBe(false);
  });

  it("keeps what means the same under every kind", () => {
    const next = draftForKind(filled({ icon: "moon" }), "project");
    expect(next.name).toBe("Reading");
    expect(next.icon).toBe("moon");
    expect(next.colourSlot).toBe("habit-1");
  });

  // A mis-click on the already-selected kind must not wipe a filled-in form.
  it("is a no-op when the kind does not actually change", () => {
    const d = filled();
    expect(draftForKind(d, "simple")).toBe(d);
  });

  it("sets the kind it was asked for", () => {
    expect(draftForKind(filled(), "range").kind).toBe("range");
  });
});

/**
 * The save gate judges the value that will actually be STORED. This closes the
 * dead-end found on the same tour: Count with no unit, then a switch to Range,
 * left `unitMissing` true with the unit field inside the block Range hides — a
 * permanently disabled Create button pointing at an invisible field.
 */
describe("draftProblems — the gate agrees with the write", () => {
  const stuck = (): HabitDraft => ({
    ...emptyDraft("habit-1"),
    name: "Sleep",
    kind: "range",
    measuresCount: true,
    countUnit: "",
  });

  it("does not demand a unit for a measure a range habit will not store", () => {
    const p = draftProblems(stuck(), new Set());
    expect(p.unitMissing).toBe(false);
    expect(canCommit(p)).toBe(true);
  });

  it("still demands a unit where the count is real", () => {
    const p = draftProblems(
      { ...emptyDraft("habit-1"), name: "Steps", kind: "simple", measuresCount: true },
      new Set(),
    );
    expect(p.unitMissing).toBe(true);
    expect(canCommit(p)).toBe(false);
  });
});
