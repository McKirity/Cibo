/**
 * The app-enforced rules the DB cannot hold (keystone § Keys, indexes,
 * uniqueness): under a synced CRDT store two devices can each write offline,
 * so the DB cannot block a collision at write time. The app checks on write
 * (these functions), the Data Doctor lints for escapes, and repair is manual.
 *
 * Pure functions over already-loaded rows — no Evolu dependency, so every
 * later step (forms, importers, the creator) calls the same checks.
 */
import type { DerivedRule, MeasureKind } from "./schema";

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

const ok: ValidationResult = { ok: true };
const fail = (reason: string): ValidationResult => ({ ok: false, reason });

// ── Uniqueness (app-enforced) ────────────────────────────────────────────────

/** Habit display names are hard-unique (case-insensitive, trimmed). */
export const validateHabitName = (
  name: string,
  existingNames: ReadonlyArray<string>,
  /** When editing, the habit's own current name (excluded from the check). */
  ownCurrentName?: string,
): ValidationResult => {
  const normalized = name.trim().toLowerCase();
  if (normalized.length === 0) return fail("Habit name cannot be empty.");
  const clash = existingNames.some(
    (n) =>
      n.trim().toLowerCase() === normalized &&
      n.trim().toLowerCase() !== ownCurrentName?.trim().toLowerCase(),
  );
  return clash ? fail(`A habit named "${name.trim()}" already exists.`) : ok;
};

/** `habits.key` is unique among built-ins (seed batches match on it). */
export const validateHabitKey = (
  key: string,
  existingKeys: ReadonlyArray<string | null>,
): ValidationResult =>
  existingKeys.includes(key)
    ? fail(`A habit with key "${key}" already exists.`)
    : ok;

/**
 * Entry `(source, external_id)` unique together; both-empty exempt —
 * unlimited manual entries.
 */
export const validateEntryExternalIdentity = (
  source: string | null,
  externalId: string | null,
  existingPairs: ReadonlyArray<{ source: string | null; external_id: string | null }>,
): ValidationResult => {
  if (source == null && externalId == null) return ok; // manual entry — exempt
  if (source == null || externalId == null)
    return fail("External identity needs both source and external_id, or neither.");
  const clash = existingPairs.some(
    (p) => p.source === source && p.external_id === externalId,
  );
  return clash
    ? fail(`An entry with identity (${source}, ${externalId}) already exists.`)
    : ok;
};

/** One `days` row per date. */
export const validateDayDate = (
  date: string,
  existingDates: ReadonlyArray<string>,
): ValidationResult =>
  existingDates.includes(date)
    ? fail(`A day row for ${date} already exists.`)
    : ok;

// ── The session single-measure rule ──────────────────────────────────────────

export interface SessionMeasureInput {
  measure_kind: MeasureKind;
  value: number | null;
  start: string | null;
  end: string | null;
}

/**
 * A session carries EXACTLY one measure, and its columns must match its
 * discriminator: time/count → value only; range → start+end only; none →
 * nothing. `none` is an explicit statement, never "a row that forgot".
 */
export const validateSessionMeasure = (s: SessionMeasureInput): ValidationResult => {
  switch (s.measure_kind) {
    case "time":
    case "count":
      if (s.value == null) return fail(`A ${s.measure_kind} session needs a value.`);
      if (s.start != null || s.end != null)
        return fail(`A ${s.measure_kind} session must not carry start/end.`);
      return s.value >= 0 ? ok : fail("A measure value cannot be negative.");
    case "range":
      if (s.value != null) return fail("A range session must not carry a value.");
      if (s.start == null || s.end == null)
        return fail("A range session needs both start and end.");
      return ok;
    case "none":
      if (s.value != null || s.start != null || s.end != null)
        return fail("A measureless session carries no measure columns.");
      return ok;
  }
};

// ── Habit-shape rules ────────────────────────────────────────────────────────

export interface HabitShapeInput {
  kind: "project" | "simple" | "range";
  measures_time: boolean;
  measures_count: boolean;
  count_unit: string | null;
}

/**
 * Measureless (both measures off) is legal for `simple` ONLY — a project habit
 * always declares at least one measure; range implies its own. Count habits
 * need a unit label (a creator gate).
 */
export const validateHabitShape = (h: HabitShapeInput): ValidationResult => {
  if (h.kind === "range") return ok; // kind = range implies its measure
  if (!h.measures_time && !h.measures_count && h.kind !== "simple")
    return fail("Measureless is simple-only — a project habit declares at least one measure.");
  if (h.measures_count && (h.count_unit == null || h.count_unit.trim() === ""))
    return fail("A count measure needs a unit label.");
  return ok;
};

/**
 * A session's shape must match its habit: `entry_fk` required for project
 * habits (and only them), and the measure must be one the habit declares.
 */
export const validateSessionAgainstHabit = (
  habit: {
    kind: "project" | "simple" | "range";
    measures_time: boolean;
    measures_count: boolean;
  },
  session: { entry_fk: string | null; measure_kind: MeasureKind },
): ValidationResult => {
  if (habit.kind === "project" && session.entry_fk == null)
    return fail("A project habit's session requires an entry.");
  if (habit.kind !== "project" && session.entry_fk != null)
    return fail("Only project habits' sessions link an entry.");
  switch (session.measure_kind) {
    case "time":
      return habit.measures_time ? ok : fail("This habit does not measure time.");
    case "count":
      return habit.measures_count ? ok : fail("This habit does not measure a count.");
    case "range":
      return habit.kind === "range" ? ok : fail("Only range habits record ranges.");
    case "none":
      return !habit.measures_time && !habit.measures_count && habit.kind === "simple"
        ? ok
        : fail("A measureless session is only valid on a measureless simple habit.");
  }
};

/**
 * A range session may cross at most the habit's declared number of midnights
 * (Sleep = 1). Dates are local wall-clock strings ("YYYY-MM-DDTHH:MM").
 */
export const validateRangeSpan = (
  start: string,
  end: string,
  rangeMaxMidnights: number,
): ValidationResult => {
  if (end <= start) return fail("A range must end after it starts.");
  const startDay = start.slice(0, 10);
  const endDay = end.slice(0, 10);
  const midnights = Math.round(
    (Date.parse(endDay) - Date.parse(startDay)) / 86_400_000,
  );
  return midnights <= rangeMaxMidnights
    ? ok
    : fail(`This range crosses ${midnights} midnights (max ${rangeMaxMidnights}).`);
};

/** `derived_rules` only ever lives on range habits; template params must cohere. */
export const validateDerivedRules = (
  kind: "project" | "simple" | "range",
  rules: ReadonlyArray<DerivedRule> | null,
): ValidationResult => {
  if (rules == null || rules.length === 0) return ok;
  if (kind !== "range")
    return fail("Derived rules are range-only; other derivations stay code.");
  for (const r of rules) {
    if (r.template === "timeOfDay" && (r.endpoint == null || r.op == null || r.time == null))
      return fail(`Rule "${r.label}": a time-of-day check needs endpoint, op, and time.`);
    if (r.template === "duration" && (r.op == null || r.minutes == null))
      return fail(`Rule "${r.label}": a duration check needs op and minutes.`);
  }
  return ok;
};
