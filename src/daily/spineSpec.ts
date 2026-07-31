/**
 * The form spine's SPEC layer — pure functions over already-loaded rows, the
 * spec-then-render model every dashboard uses. No Evolu, no React, so the mock
 * harness drives all of it.
 *
 * Everything here is DEFINITION-DRIVEN: a strip's shape falls out of the
 * habit's own declarations (`kind` · `sub_type` · `measures_*` ·
 * `subunit_definitions` · `derived_rules`), never a habit-key branch. The one
 * key-shaped fact is the Keyboard→Writing derive tie, and that is not minted
 * here — it is read from `db/derivedKeyboard.ts`, which has been the code-side
 * home of that tie since it was ruled 2026-07-23 ("you type every day" is a
 * fact about a life, not about a declaration, so no column can see it).
 *
 * The three rulings this file implements (screen note § Amended 2026-07-26 (2nd)):
 *
 *  2 · ONE SESSION BLOCK IS ONE BOUT, NOT ONE ROW. The FINAL draws a Writing
 *      block carrying `45 min` AND `1,240 words` against a one-measure-per-row
 *      storage law. The block is the BOUT: a habit declaring both measures
 *      writes TWO rows from it, sharing one categorical value on both — the
 *      convention `seedRich.seedWriting` already writes and every dashboard
 *      already reads.
 *  3 · THE KIND EYEBROW DERIVES. The FINAL's `simple · measureless` on Keyboard
 *      and plain `simple` on Walking are backwards under the flavor vocabulary
 *      named 2026-07-23; the eyebrow is computed from declarations instead.
 *  5 · Keyboard's board-only face — no typed word count anywhere.
 */
import { KEYBOARD_KEY } from "../db/derivedKeyboard";
import type { DerivedRule, MeasureKind } from "../db/schema";

// ── Inputs (plain rows, branding stripped) ───────────────────────────────────

export interface SpineHabit {
  id: string;
  key: string | null;
  name: string;
  kind: "project" | "simple" | "range";
  sub_type: "consumption" | "creation" | null;
  colour_slot: string;
  icon: string | null;
  measures_time: boolean;
  measures_count: boolean;
  count_unit: string | null;
  range_max_midnights: number | null;
  /** Raw JSON — quick-create reads it to decide whether the stub gets a status. */
  entry_attributes: string | null;
  derived_rules: ReadonlyArray<DerivedRule>;
  sort_order: number | null;
}

/** A session-scope subunit definition + its vocab, as the strip needs it. */
export interface SpineDefinition {
  id: string;
  key: string;
  label: string;
  data_type: "picklist" | "picklist-multi" | "flag";
  vocab: string[];
}

export interface SpineSession {
  id: string;
  habit_fk: string;
  entry_fk: string | null;
  measure_kind: MeasureKind;
  value: number | null;
  start: string | null;
  end: string | null;
  source: string;
  /** Sort key — the write order inside a day. */
  createdAt: string;
}

/** definition key → stored value, for one session. */
export type SubunitMap = Readonly<Record<string, string>>;

// ── 3 · The derived kind eyebrow ─────────────────────────────────────────────

/**
 * The three DERIVED flavors of a simple habit (named 2026-07-23, user-ruled;
 * vocabulary only — `kind` stays `simple`, nothing is stored). A habit becomes
 * categorical the moment a categorical is minted.
 */
export type SimpleFlavor = "measureless" | "measured" | "categorical";

export const simpleFlavor = (
  h: Pick<SpineHabit, "measures_time" | "measures_count">,
  sessionDefs: ReadonlyArray<SpineDefinition>,
): SimpleFlavor => {
  if (sessionDefs.length > 0) return "categorical";
  return h.measures_time || h.measures_count ? "measured" : "measureless";
};

/** `<sub_type> · project` · `simple · <flavor>` · `range · datetime`. */
export const kindEyebrow = (
  h: SpineHabit,
  sessionDefs: ReadonlyArray<SpineDefinition>,
): string => {
  if (h.kind === "project") return `${h.sub_type ?? "project"} · project`;
  if (h.kind === "range") return "range · datetime";
  return `simple · ${simpleFlavor(h, sessionDefs)}`;
};

// ── The strip spec ───────────────────────────────────────────────────────────

/** How a strip's body is composed — all of it read off the declarations. */
export interface StripSpec {
  habit: SpineHabit;
  eyebrow: string;
  /** Project habits pick an entry per bout (entry_fk required, app-enforced). */
  needsEntry: boolean;
  /** Session-scope picklists mint one control each, in definition order. */
  categoricals: SpineDefinition[];
  /** Session-scope flags mint a checkbox each (Sleep's `sleep_med`). */
  flags: SpineDefinition[];
  /** The measures the bout writes rows for. */
  measures: Array<{ kind: "time" | "count"; unit: string }>;
  /** Range habits log a datetime pair and show the derived readout. */
  isRange: boolean;
  derivedRules: ReadonlyArray<DerivedRule>;
  /** Measureless simple habits: the bout IS a checkbox ("walked"). */
  isMeasureless: boolean;
  /**
   * This habit's count measure is DERIVED from another habit, so it is never
   * typed — you log the categorical and the count follows (Keyboard's board).
   * Not a branch minted here: the tie lives in db/derivedKeyboard.ts.
   */
  derivesCount: boolean;
}

export const buildStripSpec = (
  habit: SpineHabit,
  sessionDefs: ReadonlyArray<SpineDefinition>,
): StripSpec => {
  const categoricals = sessionDefs.filter((d) => d.data_type !== "flag");
  const flags = sessionDefs.filter((d) => d.data_type === "flag");
  const derivesCount = habit.key === KEYBOARD_KEY && habit.measures_count;
  const measures: StripSpec["measures"] = [];
  if (habit.measures_time) measures.push({ kind: "time", unit: "min" });
  if (habit.measures_count && !derivesCount)
    measures.push({ kind: "count", unit: habit.count_unit ?? "count" });
  return {
    habit,
    eyebrow: kindEyebrow(habit, sessionDefs),
    needsEntry: habit.kind === "project",
    categoricals,
    flags,
    measures,
    isRange: habit.kind === "range",
    derivedRules: habit.derived_rules,
    isMeasureless:
      habit.kind === "simple" && !habit.measures_time && !habit.measures_count,
    derivesCount,
  };
};

/**
 * Strip order: **Projects then Daily**, matching the rail's grouped Habits
 * section (ruled 2026-07-11; the snapshot's flat list is the stale half). Within
 * a group, the habit's own `sort_order`. Ordering only — the FINAL draws no
 * group headers and there is no CSS for them.
 */
export const orderStrips = <T extends { kind: string; sort_order: number | null }>(
  habits: ReadonlyArray<T>,
): T[] =>
  habits.slice().sort((a, b) => {
    const ga = a.kind === "project" ? 0 : 1;
    const gb = b.kind === "project" ? 0 : 1;
    if (ga !== gb) return ga - gb;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

// ── 2 · Bouts: grouping the day's rows back into blocks ──────────────────────

export interface Bout {
  /** Stable identity for React + selection: the member row ids, joined. */
  key: string;
  entryId: string | null;
  /** definition key → value, shared by every row of the bout. */
  cats: SubunitMap;
  /** The row carrying each measure, when present. */
  time: SpineSession | null;
  count: SpineSession | null;
  range: SpineSession | null;
  none: SpineSession | null;
  /** Every row this block owns — what `remove` deletes and undo restores. */
  rows: SpineSession[];
  /** Provenance shown as the clock glyph alone (ruled 2026-07-13). */
  fromTimer: boolean;
  /** The count is following another habit (source `derived`). */
  countDerived: boolean;
}

const catSignature = (m: SubunitMap): string =>
  Object.keys(m)
    .sort()
    .map((k) => `${k}=${m[k]}`)
    .join("\u0001");

/**
 * Day-revision hash — "did today's rows change" for the milestone snapshot
 * (useMilestoneDay). ONE builder for both tenants (Spine banner · CoverWall).
 * Widened 2026-07-30: the original id:value:start:end hash was blind to edits
 * that change only a row's categoricals or entry — exactly the finer-subject
 * set (Sleep's Med flag · Keyboard's board · a bout's entry re-point), so the
 * banner stayed stale on precisely the milestones those subjects feed.
 */
export const dayRevision = (
  sessions: ReadonlyArray<{
    id: string;
    value: number | null;
    start: string | null;
    end: string | null;
    entry_fk: string | null;
  }>,
  cats: ReadonlyMap<string, SubunitMap>,
): string =>
  sessions
    .map(
      (s) =>
        `${s.id}:${s.value}:${s.start}:${s.end}:${s.entry_fk ?? ""}:${catSignature(cats.get(s.id) ?? {})}`,
    )
    .join("|");

/**
 * Regroup a habit's rows for one day into BOUTS. Rows pair up when they share
 * an entry AND the same categorical answers: that is exactly what the form
 * writes for a two-measure habit, and what `seedRich.seedWriting` has always
 * written. A second time row with the same signature starts a second bout
 * rather than overwriting the first — multiples per day sum, never overwrite.
 */
export const groupBouts = (
  rows: ReadonlyArray<SpineSession>,
  catsBySession: ReadonlyMap<string, SubunitMap>,
): Bout[] => {
  const ordered = rows
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  const open = new Map<string, Bout[]>();
  const out: Bout[] = [];

  for (const r of ordered) {
    const cats = catsBySession.get(r.id) ?? {};
    const sig = `${r.entry_fk ?? ""}\u0000${catSignature(cats)}`;
    const slot: keyof Pick<Bout, "time" | "count" | "range" | "none"> =
      r.measure_kind === "time"
        ? "time"
        : r.measure_kind === "count"
          ? "count"
          : r.measure_kind === "range"
            ? "range"
            : "none";
    const bucket = open.get(sig) ?? [];
    let host = bucket.find((b) => b[slot] === null);
    if (!host) {
      host = {
        key: "",
        entryId: r.entry_fk,
        cats,
        time: null,
        count: null,
        range: null,
        none: null,
        rows: [],
        fromTimer: false,
        countDerived: false,
      };
      bucket.push(host);
      open.set(sig, bucket);
      out.push(host);
    }
    host[slot] = r;
    host.rows.push(r);
    if (r.source === "timer") host.fromTimer = true;
    if (r.measure_kind === "count" && r.source === "derived") host.countDerived = true;
  }

  for (const b of out) b.key = b.rows.map((r) => r.id).join("+");
  return out;
};

// ── The derived readout (range habits) ───────────────────────────────────────

export const durationMinutes = (start: string, end: string): number =>
  Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60_000));

const clockMinutes = (dt: string): number => {
  const t = dt.slice(11);
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
};

export interface DerivedReadout {
  label: string;
  /** Flags render a ✓/✗; the duration renders its own text. */
  value: string;
  isFlag: boolean;
}

/**
 * The `.derived` strip: the span, then one entry per declared rule. Rules are
 * DATA (`derived_rules`); their results are computed here and never stored.
 * The same two templates `rangeSpec.ts` evaluates, read for one session.
 */
export const derivedReadout = (
  start: string | null,
  end: string | null,
  rules: ReadonlyArray<DerivedRule>,
): DerivedReadout[] => {
  if (start == null || end == null || end <= start) return [];
  const mins = durationMinutes(start, end);
  const out: DerivedReadout[] = [
    {
      label: "duration",
      value: `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`,
      isFlag: false,
    },
  ];
  for (const r of rules) {
    if (r.template === "duration" && r.minutes != null) {
      const hit = r.op === "lte" ? mins <= r.minutes : mins >= r.minutes;
      const hrs = `${Math.round(r.minutes / 60)}h`;
      out.push({
        label: r.op === "lte" ? `under ${hrs}` : `${hrs}+`,
        value: hit ? "✓" : "✗",
        isFlag: true,
      });
    } else if (r.template === "timeOfDay" && r.time != null) {
      const [th, tm] = r.time.split(":").map(Number);
      const target = th * 60 + tm;
      const at = clockMinutes(r.endpoint === "start" ? start : end);
      const hit = r.op === "after" ? at > target : at < target;
      const verb = r.endpoint === "start" ? "down" : "up";
      out.push({
        label: `${verb} ${r.op === "after" ? "after" : "before"} ${r.label}`,
        value: hit ? "✓" : "✗",
        isFlag: true,
      });
    }
  }
  return out;
};

// ── Small shared formatters ──────────────────────────────────────────────────

/** "80" → "1h 20m", shown beside a duration field as the FINAL draws it. */
export const minutesHint = (min: number): string =>
  min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m` : `${min}m`;

/** Up to 2 initials — the lettermark a habit with no stored `icon` wears. */
export const lettermark = (name: string): string =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
