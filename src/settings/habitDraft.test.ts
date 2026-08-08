import { describe, expect, it } from "vitest";
import type { DerivedRule } from "../db/schema";
import {
  canCommit,
  definitionKey,
  draftProblems,
  emptyDraft,
  fromDerivedRules,
  habitKeyFrom,
  toDerivedRules,
  toFlagDefinitions,
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
