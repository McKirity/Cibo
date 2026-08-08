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

/**
 * The three ruled subunit templates, in the shape the drawn builder collects
 * ([[Habit Creator]] § Derived subunits).
 *
 * The builder collects three, but they do NOT all land in the same place, and
 * that split is the whole point (bug `creator-1`, Phase 2 step 2): `time` and
 * `duration` are **computed** from the session's own two timestamps, so they
 * are rules-as-data on `habits.derived_rules`. A `flag` is **not computable
 * from anything** — it is a plain answer the user ticks — so it is a stored
 * session subunit exactly like Sleep's seeded "Took Medication", i.e. a
 * `subunit_definitions` row with `data_type: "flag"`.
 *
 * Storing a flag as a derived rule was the defect: nothing can derive it, so
 * every evaluator ignored it and the flag was unloggable and invisible.
 */
export type DerivedDraft =
  | { type: "time"; name: string; endpoint: "start" | "end"; dir: "before" | "after"; time: string }
  | { type: "duration"; name: string; cmp: "atleast" | "atmost"; hours: string }
  /** Existing definition row, when editing — absent means "mint on save". */
  | { type: "flag"; name: string; id?: string; key?: string };

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
  /**
   * Measureless is SIMPLE-ONLY (keystone § Habits, "an app-enforced validity
   * rule, gated in the creator"): a project with zero declared measures would
   * be unloggable — every session write it could receive is refused by
   * validateSessionAgainstHabit. Gate added at the Phase-2 completion audit
   * (2026-08-06, finding schema-1); it enforces the keystone's rule alongside
   * the ruled name + kind + unit-when-count roster.
   */
  measureMissing: boolean;
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
  // THE GATE READS WHAT THE WRITE WILL WRITE, not the raw draft (2026-08-08).
  // These used to read `draft.measuresCount` directly while the commit
  // sanitized — the same gate-vs-write asymmetry as `creator-4`, and it had a
  // sharper edge: ticking Count with no unit and then switching to Range left
  // `unitMissing` true with the unit field inside the block Range hides, i.e. a
  // permanently disabled Create button pointing at a field the user could not
  // see. A gate must judge the value that is actually going to be stored.
  const measures = toMeasureColumns(draft);
  return {
    nameMissing: name === "",
    nameTaken: name !== "" && takenNames.has(name.toLowerCase()),
    kindMissing: draft.kind == null,
    unitMissing: measures.measuresCount && draft.countUnit.trim() === "",
    measureMissing:
      draft.kind === "project" && !measures.measuresTime && !measures.measuresCount,
    mediumUnnamed: draft.mediums.some((m) => m.name.trim() === ""),
  };
}

export const canCommit = (p: DraftProblems): boolean =>
  !p.nameMissing && !p.nameTaken && !p.kindMissing && !p.unitMissing && !p.measureMissing;

// ── the measure bridge ───────────────────────────────────────────────────────

/** The three measure columns a draft resolves to. */
export interface MeasureColumns {
  measuresTime: boolean;
  measuresCount: boolean;
  /** Trimmed, or null when there is no count measure to label. */
  countUnit: string | null;
}

/**
 * Draft → the stored measure columns, structurally incapable of declaring a
 * measure on a RANGE habit (finding `creator-4`, 2026-08-08).
 *
 * `kind: "range"` implies its own measure — the seeded Sleep carries
 * `measures_time`/`measures_count` false, and `validateSessionAgainstHabit`
 * only ever admits a `range` row on it. But the creator hides the measures step
 * for range while `set()` is a plain field merge with no cross-field reset, so
 * ticking Time under kind=simple and *then* switching to Range used to save a
 * measure the user could no longer see or untick — and the daily form drew a
 * Time box beside the range picker for it.
 *
 * This lives here, pure and tested, for the reason `toDerivedRules` does: the
 * guard belongs in the bridge, where it cannot be forgotten by a caller, rather
 * than in the commit block where its three sibling guards sit one line apart and
 * the fourth was missed.
 */
export function toMeasureColumns(draft: HabitDraft): MeasureColumns {
  if (draft.kind === "range")
    return { measuresTime: false, measuresCount: false, countUnit: null };
  const unit = draft.countUnit.trim();
  return {
    measuresTime: draft.measuresTime,
    measuresCount: draft.measuresCount,
    countUnit: draft.measuresCount && unit !== "" ? unit : null,
  };
}

/**
 * The draft after a KIND CHANGE — everything the old kind declared is cleared
 * (user-ruled 2026-08-08: *"have everything clear every time I switch to a
 * different habit type"*).
 *
 * The ruling came out of `creator-4`, whose stored-data half had been fixed by
 * sanitizing the write. That was not enough, and the user found why: the draft
 * still carried the old kind's answers, so Simple → Range → Simple showed Time
 * still ticked. **Sanitizing the write makes the store correct while leaving the
 * screen lying about what it is about to save** — and a step that is hidden
 * cannot be corrected by the person it is hidden from.
 *
 * It also closes a dead-end nothing had reported: Count with no unit, then a
 * switch to Range, left `unitMissing` true with the unit field inside the block
 * Range hides — a permanently disabled Create button pointing at an invisible
 * field.
 *
 * IMPLEMENTATION NOTE (marked separately from the ruling): this clears the
 * kind-scoped DECLARATIONS. Name, icon and colour survive — they mean the same
 * under every kind, and re-typing a name after a mis-click would be its own
 * bug. Selecting the kind already selected is a no-op, so it cannot wipe a
 * filled-in form.
 */
export function draftForKind(draft: HabitDraft, next: HabitKind): HabitDraft {
  if (draft.kind === next) return draft;
  const fresh = emptyDraft(draft.colourSlot);
  return {
    ...draft,
    kind: next,
    subType: fresh.subType,
    measuresTime: false,
    measuresCount: false,
    measureless: false,
    countUnit: "",
    maxMidnights: fresh.maxMidnights,
    mediums: [],
    entryAttrs: [],
    derived: [],
  };
}

// ── the derived-rule bridge ──────────────────────────────────────────────────

/**
 * Draft rules → the stored `derived_rules` shape — the COMPUTED two only.
 * Flag drafts leave through `toFlagDefinitions` instead; see `DerivedDraft`.
 */
export function toDerivedRules(drafts: readonly DerivedDraft[]): DerivedRule[] {
  const out: DerivedRule[] = [];
  for (const d of drafts) {
    const label = d.name.trim();
    if (label === "") continue;
    if (d.type === "time") {
      const at = d.time.trim();
      // An empty endpoint time would store a rule whose `time` violates its own
      // NonEmptyString100 brand, and a check with no time to check against is
      // not a check. Same shape as the hours guard below.
      if (at === "") continue;
      out.push({
        template: "timeOfDay",
        label,
        endpoint: d.endpoint,
        op: d.dir,
        time: at,
      } as DerivedRule);
    } else if (d.type === "duration") {
      // `Number("")` is 0, NOT NaN — so an emptied hours field slipped past the
      // finite check and stored a "span is at least 0 hours" rule, which every
      // session on earth satisfies (bug `creator-2`, 2026-08-07). Blank and
      // negative are both rejected explicitly; only a real number survives.
      const raw = d.hours.trim();
      if (raw === "") continue;
      const hours = Number(raw);
      if (!Number.isFinite(hours) || hours < 0) continue;
      out.push({
        template: "duration",
        label,
        op: d.cmp === "atleast" ? "gte" : "lte",
        minutes: Math.round(hours * 60),
      } as DerivedRule);
    }
  }
  return out;
}

/** One flag the builder collected, ready to mint as a session subunit. */
export interface FlagDefinitionDraft {
  label: string;
  /** The existing `subunit_definitions` row, when editing. */
  id?: string;
}

/**
 * Draft rules → the flags that become `subunit_definitions` rows. Named rather
 * than filtered inline at the call site so this module stays the single owner
 * of the draft-to-storage bridge, both halves of it.
 *
 * Labels are the panel HEADER and the stem of its subtitle on the range
 * dashboard ("Took Medication" → "Nights I took medication", user-ruled
 * 2026-08-07), which is why the trimmed label travels verbatim.
 */
export function toFlagDefinitions(drafts: readonly DerivedDraft[]): FlagDefinitionDraft[] {
  const out: FlagDefinitionDraft[] = [];
  for (const d of drafts) {
    if (d.type !== "flag") continue;
    const label = d.name.trim();
    if (label === "") continue;
    out.push({ label, id: d.id });
  }
  return out;
}

/**
 * The inverse, for the editor's pre-fill — the computed two only. Flag drafts
 * are rebuilt from the habit's flag DEFINITIONS instead (the creator's prefill
 * effect), so a legacy `flag`-template rule — one written by the creator before
 * 2026-08-07, which never did anything — is dropped here and cleared from
 * `derived_rules` on the next save.
 */
export function fromDerivedRules(rules: readonly DerivedRule[]): DerivedDraft[] {
  const out: DerivedDraft[] = [];
  for (const r of rules) {
    if (r.template === "timeOfDay")
      out.push({
        type: "time",
        name: r.label,
        endpoint: (r.endpoint as "start" | "end") ?? "end",
        dir: (r.op as "before" | "after") ?? "before",
        time: r.time ?? "22:00",
      });
    else if (r.template === "duration")
      out.push({
        type: "duration",
        name: r.label,
        cmp: r.op === "lte" ? "atmost" : "atleast",
        hours: String((r.minutes ?? 480) / 60),
      });
  }
  return out;
}
