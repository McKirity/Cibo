import { describe, expect, it } from "vitest";
import type { DerivedRule } from "./schema";
import {
  validateDayDate,
  validateDerivedRules,
  validateEntryExternalIdentity,
  validateHabitKey,
  validateHabitName,
  validateHabitShape,
  validateRangeSpan,
  validateSessionAgainstHabit,
  validateSessionMeasure,
} from "./validate";

/**
 * Matrix probe A9 — every validator, both polarities.
 *
 * Six of these nine had no callers when step 1 audited them (`debt-roster-4`),
 * and the ruled resolution is "unit tests + call-site adoption" — tests first,
 * because a validator that is tested is cheap to adopt and a validator that is
 * wrong is worth knowing about before anyone adopts it.
 *
 * Rules are cast to `DerivedRule` the way the seed does (`seed.ts:230`): the
 * stored shape's `label` is a branded `NonEmptyString100`, which a literal
 * cannot satisfy, and inventing a constructor here would test the brand rather
 * than the rule.
 */
const rule = (r: Record<string, unknown>): DerivedRule => r as unknown as DerivedRule;

describe("validateHabitName", () => {
  it("refuses empty and whitespace-only names", () => {
    expect(validateHabitName("", []).ok).toBe(false);
    expect(validateHabitName("   ", []).ok).toBe(false);
  });

  it("accepts a name nothing else holds", () => {
    expect(validateHabitName("Reading", ["Sleep", "Gaming"]).ok).toBe(true);
  });

  it("is case- and whitespace-insensitive about collisions", () => {
    expect(validateHabitName("sleep", ["Sleep"]).ok).toBe(false);
    expect(validateHabitName("  SLEEP  ", ["Sleep"]).ok).toBe(false);
    expect(validateHabitName("Sleep", ["  sleep  "]).ok).toBe(false);
  });

  it("lets an edit keep its own name, but not take another's", () => {
    expect(validateHabitName("Sleep", ["Sleep", "Gaming"], "Sleep").ok).toBe(true);
    expect(validateHabitName("Gaming", ["Sleep", "Gaming"], "Sleep").ok).toBe(false);
  });
});

describe("validateHabitKey", () => {
  it("passes a fresh key and refuses a taken one", () => {
    expect(validateHabitKey("reading", ["sleep", "gaming"]).ok).toBe(true);
    expect(validateHabitKey("sleep", ["sleep", "gaming"]).ok).toBe(false);
  });

  it("tolerates the nulls user-made habits carry", () => {
    expect(validateHabitKey("reading", [null, "sleep", null]).ok).toBe(true);
  });
});

describe("validateEntryExternalIdentity", () => {
  const pairs = [
    { source: "steam", external_id: "620" },
    { source: "tmdb-movie", external_id: "603" },
  ];

  it("exempts manual entries — unlimited null pairs", () => {
    expect(validateEntryExternalIdentity(null, null, pairs).ok).toBe(true);
    expect(
      validateEntryExternalIdentity(null, null, [{ source: null, external_id: null }]).ok,
    ).toBe(true);
  });

  it("refuses a half-set identity in either direction", () => {
    expect(validateEntryExternalIdentity("steam", null, pairs).ok).toBe(false);
    expect(validateEntryExternalIdentity(null, "620", pairs).ok).toBe(false);
  });

  it("refuses an exact duplicate pair", () => {
    expect(validateEntryExternalIdentity("steam", "620", pairs).ok).toBe(false);
  });

  it("keeps the tmdb movie/TV split legal — same id, different source", () => {
    // The ruled reason the source is part of the key at all.
    expect(validateEntryExternalIdentity("tmdb-tv", "603", pairs).ok).toBe(true);
  });
});

describe("validateDayDate", () => {
  it("allows one row per date and no more", () => {
    expect(validateDayDate("2026-08-07", ["2026-08-06"]).ok).toBe(true);
    expect(validateDayDate("2026-08-06", ["2026-08-06"]).ok).toBe(false);
  });
});

describe("validateSessionMeasure — exactly one measure", () => {
  const s = (o: Partial<Parameters<typeof validateSessionMeasure>[0]>) =>
    validateSessionMeasure({
      measure_kind: "time",
      value: null,
      start: null,
      end: null,
      ...o,
    });

  it("accepts a clean time or count session", () => {
    expect(s({ measure_kind: "time", value: 45 }).ok).toBe(true);
    expect(s({ measure_kind: "count", value: 3 }).ok).toBe(true);
  });

  it("accepts zero but refuses a negative measure", () => {
    expect(s({ measure_kind: "count", value: 0 }).ok).toBe(true);
    expect(s({ measure_kind: "time", value: -1 }).ok).toBe(false);
  });

  it("refuses a time/count session with no value, or with range bounds", () => {
    expect(s({ measure_kind: "time", value: null }).ok).toBe(false);
    expect(s({ measure_kind: "time", value: 45, start: "2026-08-07T22:00" }).ok).toBe(false);
    expect(s({ measure_kind: "count", value: 1, end: "2026-08-07T06:00" }).ok).toBe(false);
  });

  it("requires both bounds and no value on a range session", () => {
    expect(
      s({ measure_kind: "range", start: "2026-08-06T23:00", end: "2026-08-07T07:00" }).ok,
    ).toBe(true);
    expect(s({ measure_kind: "range", start: "2026-08-06T23:00" }).ok).toBe(false);
    expect(
      s({ measure_kind: "range", value: 480, start: "2026-08-06T23:00", end: "2026-08-07T07:00" })
        .ok,
    ).toBe(false);
  });

  it("keeps a measureless session genuinely empty", () => {
    expect(s({ measure_kind: "none" }).ok).toBe(true);
    expect(s({ measure_kind: "none", value: 0 }).ok).toBe(false);
    expect(s({ measure_kind: "none", start: "2026-08-07T09:00" }).ok).toBe(false);
  });
});

describe("validateHabitShape — measureless is simple-only", () => {
  const h = (o: Partial<Parameters<typeof validateHabitShape>[0]>) =>
    validateHabitShape({
      kind: "simple",
      measures_time: false,
      measures_count: false,
      count_unit: null,
      ...o,
    });

  it("lets a simple habit be measureless, and refuses a measureless project", () => {
    expect(h({ kind: "simple" }).ok).toBe(true);
    expect(h({ kind: "project" }).ok).toBe(false);
  });

  it("exempts range — the kind implies its own measure", () => {
    expect(h({ kind: "range" }).ok).toBe(true);
  });

  it("requires a unit label for a count measure", () => {
    expect(h({ measures_count: true, count_unit: null }).ok).toBe(false);
    expect(h({ measures_count: true, count_unit: "   " }).ok).toBe(false);
    expect(h({ measures_count: true, count_unit: "pages" }).ok).toBe(true);
  });

  it("does not ask a time-only habit for a unit", () => {
    expect(h({ kind: "project", measures_time: true }).ok).toBe(true);
  });
});

describe("validateSessionAgainstHabit", () => {
  const project = { kind: "project" as const, measures_time: true, measures_count: false };
  const simpleMeasured = { kind: "simple" as const, measures_time: true, measures_count: false };
  const simpleBare = { kind: "simple" as const, measures_time: false, measures_count: false };
  const range = { kind: "range" as const, measures_time: false, measures_count: false };

  it("requires an entry for a project habit's session, and only there", () => {
    expect(validateSessionAgainstHabit(project, { entry_fk: "e1", measure_kind: "time" }).ok).toBe(
      true,
    );
    expect(validateSessionAgainstHabit(project, { entry_fk: null, measure_kind: "time" }).ok).toBe(
      false,
    );
    expect(
      validateSessionAgainstHabit(simpleMeasured, { entry_fk: "e1", measure_kind: "time" }).ok,
    ).toBe(false);
  });

  it("refuses a measure the habit does not declare", () => {
    expect(
      validateSessionAgainstHabit(project, { entry_fk: "e1", measure_kind: "count" }).ok,
    ).toBe(false);
    expect(
      validateSessionAgainstHabit(simpleMeasured, { entry_fk: null, measure_kind: "time" }).ok,
    ).toBe(true);
  });

  it("keeps ranges on range habits", () => {
    expect(validateSessionAgainstHabit(range, { entry_fk: null, measure_kind: "range" }).ok).toBe(
      true,
    );
    expect(
      validateSessionAgainstHabit(simpleMeasured, { entry_fk: null, measure_kind: "range" }).ok,
    ).toBe(false);
  });

  it("allows a measureless session only on a measureless simple habit", () => {
    expect(validateSessionAgainstHabit(simpleBare, { entry_fk: null, measure_kind: "none" }).ok).toBe(
      true,
    );
    // The rule that makes the creator's gate load-bearing: a habit that declares
    // a measure may not log "nothing happened, but it counted".
    expect(
      validateSessionAgainstHabit(simpleMeasured, { entry_fk: null, measure_kind: "none" }).ok,
    ).toBe(false);
    expect(validateSessionAgainstHabit(range, { entry_fk: null, measure_kind: "none" }).ok).toBe(
      false,
    );
  });
});

describe("validateRangeSpan", () => {
  it("requires the end to follow the start", () => {
    expect(validateRangeSpan("2026-08-07T07:00", "2026-08-06T23:00", 1).ok).toBe(false);
    expect(validateRangeSpan("2026-08-07T07:00", "2026-08-07T07:00", 1).ok).toBe(false);
  });

  it("counts midnights, not hours — Sleep's one-midnight rule", () => {
    expect(validateRangeSpan("2026-08-06T23:00", "2026-08-07T07:00", 1).ok).toBe(true);
    expect(validateRangeSpan("2026-08-06T23:00", "2026-08-08T07:00", 1).ok).toBe(false);
  });

  it("allows a same-day range even at zero midnights", () => {
    expect(validateRangeSpan("2026-08-07T13:00", "2026-08-07T15:00", 0).ok).toBe(true);
    expect(validateRangeSpan("2026-08-06T23:00", "2026-08-07T01:00", 0).ok).toBe(false);
  });

  it("is DST-proof — a spring-forward night still crosses exactly one midnight", () => {
    // US spring-forward 2026-03-08 and fall-back 2026-11-01. The check parses
    // date-only strings, which ES defines as UTC, so no local offset leaks in.
    expect(validateRangeSpan("2026-03-07T23:00", "2026-03-08T07:00", 1).ok).toBe(true);
    expect(validateRangeSpan("2026-10-31T23:00", "2026-11-01T07:00", 1).ok).toBe(true);
  });

  it("counts a leap-day crossing as one midnight", () => {
    expect(validateRangeSpan("2024-02-28T23:00", "2024-02-29T07:00", 1).ok).toBe(true);
    expect(validateRangeSpan("2024-02-28T23:00", "2024-03-01T07:00", 1).ok).toBe(false);
  });
});

describe("validateDerivedRules — range-only, params must cohere", () => {
  const timeOfDay = rule({
    template: "timeOfDay",
    label: "noon",
    endpoint: "end",
    op: "before",
    time: "12:00",
  });
  const duration = rule({ template: "duration", label: "8h", op: "gte", minutes: 480 });

  it("passes an absent or empty rule list on any kind", () => {
    expect(validateDerivedRules("simple", null).ok).toBe(true);
    expect(validateDerivedRules("project", []).ok).toBe(true);
  });

  it("refuses rules on a non-range habit", () => {
    // The `schema-3` hole step 1 closed: a draft that collected rules under
    // kind=range and then switched must not carry them.
    expect(validateDerivedRules("simple", [timeOfDay]).ok).toBe(false);
    expect(validateDerivedRules("project", [duration]).ok).toBe(false);
  });

  it("accepts Sleep's seeded family", () => {
    expect(validateDerivedRules("range", [timeOfDay, duration]).ok).toBe(true);
  });

  it("catches an incomplete time-of-day rule", () => {
    expect(validateDerivedRules("range", [rule({ template: "timeOfDay", label: "noon" })]).ok).toBe(
      false,
    );
    expect(
      validateDerivedRules("range", [
        rule({ template: "timeOfDay", label: "noon", endpoint: "end", op: "before" }),
      ]).ok,
    ).toBe(false);
  });

  it("catches an incomplete duration rule", () => {
    expect(validateDerivedRules("range", [rule({ template: "duration", label: "8h" })]).ok).toBe(
      false,
    );
    expect(
      validateDerivedRules("range", [rule({ template: "duration", label: "8h", op: "gte" })]).ok,
    ).toBe(false);
  });

  /**
   * The third template takes no parameters, so the validator is RIGHT to accept
   * it bare — which localizes bug `creator-1`: the write path and its validation
   * are both sound, and the defect is purely that no evaluator reads the
   * template back. Kept as a regression pin for whichever fix shape is ruled.
   */
  it("accepts a bare bundled flag — the gap in `creator-1` is downstream of here", () => {
    expect(validateDerivedRules("range", [rule({ template: "flag", label: "Vitamins" })]).ok).toBe(
      true,
    );
  });
});
