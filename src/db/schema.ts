/**
 * The 8-table Evolu schema, transcribed from the locked keystone
 * (`Data Schema (Keystone).md`, locked 2026-07-02, amended 2026-07-06 / 2026-07-19).
 *
 * No design decisions are made here — Build step 2 transcribes.
 * Column names keep the keystone's snake_case exactly, so the design docs and the
 * code never need a mapping table. Evolu auto-provides `id` / `createdAt` /
 * `updatedAt` / `isDeleted` on every table (never declared here).
 *
 * Uniqueness (habit name & key · entry (source, external_id) · days.date), the
 * one-measure-per-session rule, entry_fk-required-for-project, and
 * measureless-is-simple-only are APP-ENFORCED — see `validate.ts`.
 */
import {
  array,
  FiniteNumber,
  id,
  json,
  NonEmptyString100,
  NonEmptyString1000,
  NonNegativeInt,
  nullOr,
  object,
  optional,
  PositiveInt,
  regex,
  SqliteBoolean,
  String as EvoluString,
  union,
} from "@evolu/common";

// ── Table ids ────────────────────────────────────────────────────────────────

export const HabitId = id("Habit");
export type HabitId = typeof HabitId.Type;
export const EntryId = id("Entry");
export type EntryId = typeof EntryId.Type;
export const SessionId = id("Session");
export type SessionId = typeof SessionId.Type;
export const DayId = id("Day");
export type DayId = typeof DayId.Type;
export const SubunitDefinitionId = id("SubunitDefinition");
export type SubunitDefinitionId = typeof SubunitDefinitionId.Type;
export const SubunitValueId = id("SubunitValue");
export type SubunitValueId = typeof SubunitValueId.Type;
export const VocabOptionId = id("VocabOption");
export type VocabOptionId = typeof VocabOptionId.Type;
export const AppMetaId = id("AppMeta");
export type AppMetaId = typeof AppMetaId.Type;

// ── Scalar types ─────────────────────────────────────────────────────────────

/** Calendar date, no time-of-day: "2026-07-20" (local, per the day-cutoff rule). */
export const DateOnly = regex(
  "DateOnly",
  /^\d{4}-\d{2}-\d{2}$/,
)(EvoluString);
export type DateOnly = typeof DateOnly.Type;

/**
 * Local wall-clock datetime, NO timezone stored (→ Day Boundary & Logging
 * Cutoff): "2026-07-20T23:40" (seconds optional).
 */
export const DateTimeLocal = regex(
  "DateTimeLocal",
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/,
)(EvoluString);
export type DateTimeLocal = typeof DateTimeLocal.Type;

export const HabitKind = union("project", "simple", "range");
export type HabitKind = typeof HabitKind.Type;

export const HabitSubType = union("consumption", "creation");
export type HabitSubType = typeof HabitSubType.Type;

export const MeasureKind = union("time", "count", "range", "none");
export type MeasureKind = typeof MeasureKind.Type;

export const SessionSource = union("manual", "timer", "import");
export type SessionSource = typeof SessionSource.Type;

export const DefinitionScope = union("entry", "session");
export type DefinitionScope = typeof DefinitionScope.Type;

export const DefinitionDataType = union("picklist", "picklist-multi", "flag");
export type DefinitionDataType = typeof DefinitionDataType.Type;

/** The fixed entry-attribute menu a habit's bundle picks from (keystone, 2026-07-19). */
export const EntryAttribute = union(
  "genre",
  "status",
  "rating",
  "purchased",
  "priority",
);
export type EntryAttribute = typeof EntryAttribute.Type;

// ── JSON-list column codecs ──────────────────────────────────────────────────
// Multi-value = JSON lists in the cell, uniformly (keystone). Each `json(...)`
// yields [brandedStringType, encode, decode]; columns store the branded string.

export const [StringListJson, stringListToJson, stringListFromJson] = json(
  array(NonEmptyString1000),
  "StringList",
);
export type StringListJson = typeof StringListJson.Type;

export const [EntryAttributesJson, entryAttributesToJson, entryAttributesFromJson] =
  json(array(EntryAttribute), "EntryAttributes");
export type EntryAttributesJson = typeof EntryAttributesJson.Type;

/**
 * One range derivation rule — rules-as-data, three parameterized templates
 * (keystone `derived_rules`, added 2026-07-19). The rule is data; its RESULT is
 * always computed, never stored.
 */
export const DerivedRule = object({
  template: union("timeOfDay", "duration", "flag"),
  /** Display name of the derived check (e.g. "noon", "8h"). */
  label: NonEmptyString100,
  /** timeOfDay: which endpoint the check reads. */
  endpoint: optional(union("start", "end")),
  /** timeOfDay: before/after · duration: gte/lte. */
  op: optional(union("before", "after", "gte", "lte")),
  /** timeOfDay: wall-clock "HH:MM". */
  time: optional(NonEmptyString100),
  /** duration: target span in minutes. */
  minutes: optional(FiniteNumber),
});
export type DerivedRule = typeof DerivedRule.Type;

export const [DerivedRulesJson, derivedRulesToJson, derivedRulesFromJson] = json(
  array(DerivedRule),
  "DerivedRules",
);
export type DerivedRulesJson = typeof DerivedRulesJson.Type;

// ── The eight tables ─────────────────────────────────────────────────────────

export const Schema = {
  /** One row per tracked habit. */
  habits: {
    id: HabitId,
    /** Stable built-in identifier (seed batches match on it); null = user-created. */
    key: nullOr(NonEmptyString100),
    /** Display name, freely renamable. App-unique. */
    name: NonEmptyString100,
    kind: HabitKind,
    /** Immutable; non-project habits: null. */
    sub_type: nullOr(HabitSubType),
    /** Slot name from the 12-slot pool, or (overflow only) a custom absolute hex. */
    colour_slot: NonEmptyString100,
    /** Stored lucide icon name; null = lettermark fallback. */
    icon: nullOr(NonEmptyString100),
    measures_time: SqliteBoolean,
    measures_count: SqliteBoolean,
    /** Author-set count label ("steps", "words"); non-count habits: null. */
    count_unit: nullOr(NonEmptyString100),
    /** Range validity rule: max midnights one session may cross (Sleep = 1). */
    range_max_midnights: nullOr(NonNegativeInt),
    /** JSON list — the entry-attribute bundle this habit's entries carry. Non-project: null. */
    entry_attributes: nullOr(EntryAttributesJson),
    /** JSON list of range derivation rules (templates + parameters). Non-range: null. */
    derived_rules: nullOr(DerivedRulesJson),
    /** Per-habit wave gap-threshold override, days; null = global default. */
    wave_gap_days: nullOr(PositiveInt),
    /** The two-state lifecycle flag. */
    archived: SqliteBoolean,
    /** User-arranged ordering; null until first reordered (seeds get registry order). */
    sort_order: nullOr(FiniteNumber),
  },

  /** One row per game/book/movie/project — project habits only. */
  entries: {
    id: EntryId,
    habit_fk: HabitId,
    /** Display title (release year folds in). */
    title: NonEmptyString1000,
    /** Global-vocab string; null when the habit's entry_attributes omit `status`. */
    status: nullOr(NonEmptyString100),
    /** Image references (root-relative paths), never bytes. */
    cover: nullOr(NonEmptyString1000),
    banner: nullOr(NonEmptyString1000),
    /** The thing's blurb, importer-fed. */
    description: nullOr(EvoluString),
    /** External identity pair, unique together; both-empty exempt (manual entries). */
    source: nullOr(NonEmptyString100),
    external_id: nullOr(NonEmptyString100),
    /** Entry-level Medium ("movie", "ebook") — per-habit vocab string. */
    type: nullOr(NonEmptyString100),
    /** JSON list of per-habit vocab strings. */
    genre: nullOr(StringListJson),
    /** Fixed 0–3 enum (not vocab). */
    priority: nullOr(NonNegativeInt),
    /** Optional personal rating 1–5. */
    rating: nullOr(PositiveInt),
    purchased: nullOr(SqliteBoolean),
    /** People by-lines — JSON list, free text. */
    creators: nullOr(StringListJson),
    /** Org by-lines — JSON list, free text. */
    studios: nullOr(StringListJson),
    series: nullOr(NonEmptyString1000),
    series_order: nullOr(PositiveInt),
    /** Book length. */
    words: nullOr(NonNegativeInt),
    /** Creation's fandom — per-habit vocab string (display name "Fandom"). */
    fandom: nullOr(NonEmptyString100),
    gamedev_engine: nullOr(NonEmptyString100),
    /** Creation's stored arc bookends; consumption derives engagement from sessions. */
    started: nullOr(DateOnly),
    completed: nullOr(DateOnly),
  },

  /** One row per logged bout — the typed measure spine. Exactly one measure per row. */
  sessions: {
    id: SessionId,
    habit_fk: HabitId,
    /** Required when the habit's kind is project (app-enforced); simple/range: null. */
    entry_fk: nullOr(EntryId),
    /** The owning day (range sessions: the END date). Stored as written. */
    day: DateOnly,
    /** The measure discriminator; measureless stores an explicit "none". */
    measure_kind: MeasureKind,
    /** Minutes (time) or quantity (count); range & measureless: null. */
    value: nullOr(FiniteNumber),
    /** The explicit range — local wall-clock, no timezone stored. Non-range: null. */
    start: nullOr(DateTimeLocal),
    end: nullOr(DateTimeLocal),
    /** Provenance, filled automatically by whichever path writes the row. */
    source: SessionSource,
  },

  /** The sparse finalize ledger — bookkeeping, not a fourth pillar. */
  days: {
    id: DayId,
    /** App-unique (enforced in app code). */
    date: DateOnly,
    /** The sole finalize truth. */
    finalized: SqliteBoolean,
    finalized_at: nullOr(DateTimeLocal),
    /**
     * Nullable JSON object keyed by card — ephemeral feed content captured at
     * fetch (first tenant: the horoscope, Build step 9). Kept schemaless here;
     * shape validation is the writer's job.
     */
    feed_snapshot: nullOr(EvoluString),
  },

  /** One row DESCRIBES one per-habit field (holds no answers). */
  subunit_definitions: {
    id: SubunitDefinitionId,
    habit_fk: HabitId,
    /** Stable field key — "writing_stage", "sleep_med". */
    key: NonEmptyString100,
    /** Display name. */
    label: NonEmptyString100,
    scope: DefinitionScope,
    data_type: DefinitionDataType,
  },

  /** One row per answer on a session. */
  subunit_values: {
    id: SubunitValueId,
    session_fk: SessionId,
    definition_fk: SubunitDefinitionId,
    /** The string, or "true"/"false" for flags. */
    value: NonEmptyString1000,
  },

  /** The managed picklists themselves. */
  vocab_options: {
    id: VocabOptionId,
    /** Empty = the ONE global `status` list. */
    definition_fk: nullOr(SubunitDefinitionId),
    /** The option string. */
    value: NonEmptyString100,
    /** Dropdown order. */
    sort_order: FiniteNumber,
  },

  /** Key-value store for app-level one-offs; first tenant: the applied seed version. */
  app_meta: {
    id: AppMetaId,
    key: NonEmptyString100,
    value: NonEmptyString1000,
  },
};
