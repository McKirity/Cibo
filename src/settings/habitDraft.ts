/**
 * THE HABIT DRAFT — the creator/editor's model, kept apart from its markup so
 * the gates and the derivations are testable and stated once (Build step 10,
 * slice 3).
 *
 * Owning rulings: [[Habit Creator]] (the model + the 2026-07-13 ceiling
 * reversal) · [[Habit Lifecycle & Creator]] (immutability) ·
 * `Final/habit-creator.html` (the drawn face this fills).
 */
import type { DerivedRule, EntryAttribute } from "../db/schema";
import type { LadderOverrides } from "../daily/milestones";

export type HabitKind = "simple" | "project" | "range";
export type SubType = "consumption" | "creation";

/** A minted categorical + its values. Level is DERIVED, never asked. */
export interface MediumDraft {
  name: string;
  values: string[];
  /** Existing definition row, when editing — absent means "mint on save". */
  id?: string;
  key?: string;
}

/** The three ruled rule templates, in the shape the drawn builder collects. */
export type DerivedDraft =
  | { type: "time"; name: string; endpoint: "start" | "end"; dir: "before" | "after"; time: string }
  | { type: "duration"; name: string; cmp: "atleast" | "atmost"; hours: string }
  | { type: "flag"; name: string; measure: "measureless" | "time" | "count"; unit: string };

export interface HabitDraft {
  name: string;
  kind: HabitKind | null;
  subType: SubType;
  measuresTime: boolean;
  measuresCount: boolean;
  measureless: boolean;
  countUnit: string;
  /** Range only. Sleep's rule is the seed default. */
  maxMidnights: number;
  mediums: MediumDraft[];
  entryAttrs: EntryAttribute[];
  derived: DerivedDraft[];
  icon: string | null;
  colourSlot: string;
  keepsakeSnippet: string | null;
  /** Per-habit override of the global wave gap (editor only; null = inherit). */
  waveGapDays: number | null;
  /** Per-subject ladder overrides (editor only; an absent subject inherits). */
  ladders: LadderOverrides;
}

export const emptyDraft = (colourSlot: string): HabitDraft => ({
  name: "",
  kind: null,
  subType: "consumption",
  measuresTime: false,
  measuresCount: false,
  measureless: false,
  countUnit: "",
  maxMidnights: 1,
  mediums: [],
  entryAttrs: [],
  derived: [],
  icon: null,
  colourSlot,
  keepsakeSnippet: null,
  waveGapDays: null,
  ladders: {},
});

// ── derivations ──────────────────────────────────────────────────────────────

/**
 * The medium LEVEL, derived and never asked ([[Habit Creator]] § the ceiling):
 * importer-fed → entry-level, and it IS the habit's `type`, capped at one;
 * by-hand and simple → session-level, uncapped. Range mints no mediums.
 */
export const mediumLevel = (draft: HabitDraft): "entry" | "session" =>
  draft.kind === "project" && draft.subType === "consumption" ? "entry" : "session";

export const mediumsAllowed = (draft: HabitDraft): boolean => draft.kind !== "range" && draft.kind != null;

/** Entry-level mediums cap at ONE — a second would be a schema change. */
export const mediumCap = (draft: HabitDraft): number =>
  mediumLevel(draft) === "entry" ? 1 : Infinity;

/**
 * The simple flavor, shown back as confirmation but never asked and never
 * stored (2026-07-23 — [[Glossary]] § Categorical habit).
 */
export const simpleFlavor = (draft: HabitDraft): "measureless" | "measured" | "categorical" | null => {
  if (draft.kind !== "simple") return null;
  if (draft.mediums.length > 0) return "categorical";
  if (draft.measuresTime || draft.measuresCount) return "measured";
  return "measureless";
};

/** Slug for a minted definition's stable key, namespaced by habit. */
export const definitionKey = (habitKey: string, label: string): string => {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${habitKey}_${slug === "" ? "field" : slug}`;
};

/**
 * A habit KEY for a hand-made habit. "No `key` field, ever — stable keys
 * belong to built-ins/seeds only", so the user never sees or types this; it is
 * derived from the name purely because the column is non-null and every
 * consumer routes by it. Collisions are resolved by the caller against the
 * live roster.
 */
export const habitKeyFrom = (name: string): string => {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "habit" : slug;
};

// ── gates ────────────────────────────────────────────────────────────────────

export interface DraftProblems {
  /** Blocks Create/Save. */
  nameMissing: boolean;
  nameTaken: boolean;
  kindMissing: boolean;
  unitMissing: boolean;
  /** Non-blocking, but worth saying. */
  mediumUnnamed: boolean;
}

/**
 * The ruled gate roster is **name + kind + unit-when-count**; icon, artwork
 * and colour never gate ([[Habit Creator]] § Validation). Name is hard-unique
 * among habits, case-insensitive — "two same-named habits have no legitimate
 * reading".
 */
export function draftProblems(
  draft: HabitDraft,
  takenNames: ReadonlySet<string>,
): DraftProblems {
  const name = draft.name.trim();
  return {
    nameMissing: name === "",
    nameTaken: name !== "" && takenNames.has(name.toLowerCase()),
    kindMissing: draft.kind == null,
    unitMissing: draft.measuresCount && draft.countUnit.trim() === "",
    mediumUnnamed: draft.mediums.some((m) => m.name.trim() === ""),
  };
}

export const canCommit = (p: DraftProblems): boolean =>
  !p.nameMissing && !p.nameTaken && !p.kindMissing && !p.unitMissing;

// ── the derived-rule bridge ──────────────────────────────────────────────────

/**
 * Draft rules → the stored `derived_rules` shape. The drawn builder collects
 * `flag` rules alongside the two computed checks, but the STORED rule union
 * only carries the two computed templates plus `flag`; a bundled flag whose
 * measure is time/count is a MEASURE the habit declares, not a rule, so only
 * its label survives here (the measure rides the habit's own columns).
 */
export function toDerivedRules(drafts: readonly DerivedDraft[]): DerivedRule[] {
  const out: DerivedRule[] = [];
  for (const d of drafts) {
    const label = d.name.trim();
    if (label === "") continue;
    if (d.type === "time") {
      out.push({
        template: "timeOfDay",
        label,
        endpoint: d.endpoint,
        op: d.dir,
        time: d.time.trim(),
      } as DerivedRule);
    } else if (d.type === "duration") {
      const hours = Number(d.hours);
      if (!Number.isFinite(hours)) continue;
      out.push({
        template: "duration",
        label,
        op: d.cmp === "atleast" ? "gte" : "lte",
        minutes: Math.round(hours * 60),
      } as DerivedRule);
    } else {
      out.push({ template: "flag", label } as DerivedRule);
    }
  }
  return out;
}

/** The inverse, for the editor's pre-fill. */
export function fromDerivedRules(rules: readonly DerivedRule[]): DerivedDraft[] {
  return rules.map((r): DerivedDraft => {
    if (r.template === "timeOfDay")
      return {
        type: "time",
        name: r.label,
        endpoint: (r.endpoint as "start" | "end") ?? "end",
        dir: (r.op as "before" | "after") ?? "before",
        time: r.time ?? "22:00",
      };
    if (r.template === "duration")
      return {
        type: "duration",
        name: r.label,
        cmp: r.op === "lte" ? "atmost" : "atleast",
        hours: String((r.minutes ?? 480) / 60),
      };
    return { type: "flag", name: r.label, measure: "measureless", unit: "" };
  });
}
