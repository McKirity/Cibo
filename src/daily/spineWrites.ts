/**
 * The form spine's WRITE layer.
 *
 * Ruling 1 (screen note § Amended 2026-07-26 (2nd)): "Finalize is the official
 * save that locks it and turns the form into the coverwall. All other saves are
 * unofficial saves that remembers any changes to the form but doesn't turn it
 * into the cover wall." Since the 2026-07-27 auto-save, those unofficial writes
 * BUFFER (autosave.ts) and land at the flush; the functions here are what the
 * flush invokes. Finalize flushes the buffer, then writes the day's state.
 *
 * EVOLU MUTATIONS FAIL SILENTLY. An unchecked `Result` can drop the entire
 * microtask transaction with no log (the coding-migration bug of 2026-07-23), so
 * every mutation below is checked and every caller is told whether it landed.
 *
 * Rules are `validate.ts` calls — the form never re-invents a check.
 */
import { FiniteNumber, NonEmptyString100, NonEmptyString1000 } from "@evolu/common";
import { evolu } from "../db/evolu";
import {
  DateOnly,
  DateTimeLocal,
  entryAttributesFromJson,
  type EntryId,
  type HabitId,
  type MeasureKind,
  type SessionId,
  type SubunitDefinitionId,
  type SubunitValueId,
} from "../db/schema";
import {
  validateRangeSpan,
  validateSessionAgainstHabit,
  validateSessionMeasure,
  type ValidationResult,
} from "../db/validate";
import { resolveKeyboardWrite, writingWordsForDay } from "../db/derivedKeyboard";
import type { Bout, SpineHabit } from "./spineSpec";

export type WriteResult = { ok: true } | { ok: false; reason: string };
const good: WriteResult = { ok: true };
const bad = (reason: string): WriteResult => ({ ok: false, reason });

/** Checked mutation: logs the Evolu error and reports the failure upward. */
const checked = (
  res: { ok: true; value?: unknown } | { ok: false; error: unknown },
  what: string,
): boolean => {
  if (!res.ok) {
    console.error(`spine: ${what} failed`, (res as { error: unknown }).error);
    return false;
  }
  return true;
};

// ── Vocab quick-add ──────────────────────────────────────────────────────────

/**
 * The ruled quick-add from the log form ([[Vocabulary & Statuses]]: "quick-add
 * from the log form" — logging never dead-ends on a missing value; built at the
 * Phase-2 completion audit, finding detailed-design-3). Case-insensitive dedup:
 * a value that already exists under any casing is NOT re-minted — the caller
 * receives the canonical casing back and picks it (the importers' vocab law).
 * Returns the value to pick, or null when the insert failed.
 */
export function quickAddVocabValue(
  definitionId: SubunitDefinitionId,
  existing: readonly string[],
  raw: string,
): string | null {
  const v = raw.trim();
  if (v === "") return null;
  const canon = existing.find((e) => e.toLowerCase() === v.toLowerCase());
  if (canon != null) return canon;
  const res = evolu.insert("vocab_options", {
    definition_fk: definitionId,
    value: NonEmptyString100.orThrow(v.slice(0, 100)),
    sort_order: FiniteNumber.orThrow(existing.length + 1),
  });
  if (!checked(res, "vocab quick-add")) return null;
  return v;
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export interface NewSession {
  habit: SpineHabit;
  day: string;
  entryId: string | null;
  measure: MeasureKind;
  value: number | null;
  start: string | null;
  end: string | null;
  source?: "manual" | "timer" | "import" | "derived";
}

/**
 * EVERY check a session row must pass, in one place — so a caller that wants to
 * pre-flight a row asks the same question the write will ask.
 *
 * Extracted at finding `spine-1`: `createBout` used to dry-run its plan with
 * `validateSessionMeasure` ALONE while `insertSession` enforced all three, so
 * the two it skipped fired only after earlier rows in the plan had already been
 * written — making a half-written bout reachable under a comment promising it
 * was impossible. Splitting the checks out is what keeps the two lists from
 * drifting again; a new rule added here reaches the pre-flight for free.
 */
export const checkSession = (s: NewSession): ValidationResult => {
  const checks = [
    validateSessionAgainstHabit(
      {
        kind: s.habit.kind,
        measures_time: s.habit.measures_time,
        measures_count: s.habit.measures_count,
      },
      { entry_fk: s.entryId, measure_kind: s.measure },
    ),
    validateSessionMeasure({
      measure_kind: s.measure,
      value: s.value,
      start: s.start,
      end: s.end,
    }),
    ...(s.measure === "range" && s.start != null && s.end != null
      ? [validateRangeSpan(s.start, s.end, s.habit.range_max_midnights ?? 0)]
      : []),
  ];
  return checks.find((c) => !c.ok) ?? { ok: true };
};

/** Validate + insert one session row, returning its id (or the failure reason). */
export const insertSession = (
  s: NewSession,
): { ok: true; id: SessionId } | { ok: false; reason: string } => {
  const failed = checkSession(s);
  if (!failed.ok) return { ok: false, reason: failed.reason };

  try {
    const res = evolu.insert("sessions", {
      habit_fk: s.habit.id as HabitId,
      entry_fk: (s.entryId as EntryId | null) ?? null,
      day: DateOnly.orThrow(s.day),
      measure_kind: s.measure,
      value: s.value != null ? FiniteNumber.orThrow(s.value) : null,
      start: s.start != null ? DateTimeLocal.orThrow(s.start) : null,
      end: s.end != null ? DateTimeLocal.orThrow(s.end) : null,
      source: s.source ?? "manual",
    });
    if (!res.ok) {
      console.error("spine: session insert failed", res.error);
      return { ok: false, reason: "Write failed — see console." };
    }
    return { ok: true, id: res.value.id };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
};

/**
 * Commit a whole BOUT (ruling 2). A habit declaring both measures writes TWO
 * rows from one block, and every row carries the SAME categorical answers —
 * `seedRich.seedWriting`'s existing convention, which every dashboard reads.
 *
 * All-or-nothing at the SESSION layer: every row is checked through
 * `checkSession` — the same function the write uses — before any row is
 * written, so no validation failure can leave a partial set of session rows.
 *
 * ⚠ THE CATEGORICAL TAIL IS NOT COVERED BY THAT, and the limit is stated rather
 * than implied (finding `spine-1`): the `subunit_values` inserts below run after
 * every session row is committed, so a failure there returns `{ok:false}` with
 * the sessions already in the store. It is not reachable from the UI — values
 * come from picklists, well inside the 1000-char column — and making it atomic
 * would mean a rollback path the store has no primitive for. Recorded as a
 * known edge, not a claim of atomicity.
 */
export const createBout = (args: {
  habit: SpineHabit;
  day: string;
  entryId: string | null;
  measures: Array<{ kind: "time" | "count"; value: number }>;
  range: { start: string; end: string } | null;
  measureless: boolean;
  cats: Array<{ definitionId: string; value: string }>;
  /** provenance — "timer" when the bout arrived through the timer hand-off. */
  source?: "manual" | "timer";
}): { ok: true; ids: SessionId[] } | { ok: false; reason: string } => {
  const plan: NewSession[] = [];
  for (const m of args.measures)
    plan.push({
      habit: args.habit,
      day: args.day,
      entryId: args.entryId,
      measure: m.kind,
      value: m.value,
      start: null,
      end: null,
      source: args.source,
    });
  if (args.range != null)
    plan.push({
      habit: args.habit,
      day: args.day,
      entryId: args.entryId,
      measure: "range",
      value: null,
      start: args.range.start,
      end: args.range.end,
    });
  if (args.measureless)
    plan.push({
      habit: args.habit,
      day: args.day,
      entryId: args.entryId,
      measure: "none",
      value: null,
      start: null,
      end: null,
    });
  if (plan.length === 0) return { ok: false, reason: "Nothing to log yet." };

  // Validate every row BEFORE writing any of them — through `checkSession`, the
  // SAME function the write uses, so the pre-flight cannot be narrower than the
  // thing it is flying ahead of (finding `spine-1`).
  for (const p of plan) {
    const dry = checkSession(p);
    if (!dry.ok) return { ok: false, reason: dry.reason };
  }

  const ids: SessionId[] = [];
  for (const p of plan) {
    const res = insertSession(p);
    if (!res.ok) return { ok: false, reason: res.reason };
    ids.push(res.id);
  }
  for (const id of ids)
    for (const c of args.cats) {
      if (c.value === "") continue;
      const res = evolu.insert("subunit_values", {
        session_fk: id,
        definition_fk: c.definitionId as SubunitDefinitionId,
        value: NonEmptyString1000.orThrow(c.value),
      });
      if (!checked(res, "subunit insert")) return { ok: false, reason: "Write failed — see console." };
    }
  // The auto-follow is NOT fired here. Writes are buffered now, so the flush is
  // the transaction boundary: syncing from inside a queued write would read
  // Writing's total before its own insert had reached the worker. `afterFlush`
  // in autosave.ts owns it.
  return { ok: true, ids };
};

/**
 * A measure edit on an existing row. The derived-Keyboard sync happens after
 * the flush (`afterFlush` in autosave.ts), never inside a write.
 */
export const updateMeasureValue = (id: string, value: number): WriteResult => {
  if (!Number.isFinite(value) || value < 0) return bad("A measure value cannot be negative.");
  const res = evolu.update("sessions", {
    id: id as SessionId,
    value: FiniteNumber.orThrow(value),
  });
  return checked(res, "measure update") ? good : bad("Write failed — see console.");
};

/** A range edit — validated against the habit's own midnight rule. */
export const updateRange = (
  id: string,
  start: string,
  end: string,
  maxMidnights: number,
): WriteResult => {
  const span = validateRangeSpan(start, end, maxMidnights);
  if (!span.ok) return bad(span.reason);
  // "A range session's owning day = its END date" holds BY CONSTRUCTION now
  // (user-ruled 2026-08-06, audit fork A): an edit that moves the wake date
  // re-files the session under the new day in the same write — the stored
  // `day` can never silently diverge from the end date again.
  const res = evolu.update("sessions", {
    id: id as SessionId,
    start: DateTimeLocal.orThrow(start),
    end: DateTimeLocal.orThrow(end),
    day: DateOnly.orThrow(end.slice(0, 10)),
  });
  return checked(res, "range update") ? good : bad("Write failed — see console.");
};

/** The entry a bout points at — every row of the bout moves together. */
export const setBoutEntry = (bout: Bout, entryId: string): WriteResult => {
  for (const row of bout.rows) {
    const res = evolu.update("sessions", { id: row.id as SessionId, entry_fk: entryId as EntryId });
    if (!checked(res, "entry update")) return bad("Write failed — see console.");
  }
  return good;
};

// ── Categoricals & flags (the definition tail) ───────────────────────────────

/**
 * Set one answer on every row of a bout — a bout is one bout of activity, so a
 * habit declaring two measures writes two rows SHARING one categorical value.
 */
export const setBoutSubunit = (
  bout: Bout,
  definitionId: string,
  definitionKey: string,
  value: string,
  catRowIds: ReadonlyMap<string, string>,
): WriteResult => {
  for (const row of bout.rows) {
    const existing = catRowIds.get(`${row.id}|${definitionKey}`);
    const res = existing
      ? evolu.update("subunit_values", {
          id: existing as SubunitValueId,
          value: NonEmptyString1000.orThrow(value),
        })
      : evolu.insert("subunit_values", {
          session_fk: row.id as SessionId,
          definition_fk: definitionId as SubunitDefinitionId,
          value: NonEmptyString1000.orThrow(value),
        });
    if (!checked(res, "subunit write")) return bad("Write failed — see console.");
  }
  return good;
};

// ── Removal + the undo toast (Delete Safety & Undo, tier 2) ──────────────────

export interface RemovedBout {
  sessionIds: string[];
  valueIds: string[];
  label: string;
}

/**
 * A LIGHT delete — one bout — so it takes the ~10 s undo toast, not the
 * count-carrying confirm. Ruling 4: the daily form is the toast's natural first
 * tenant, and a form you cannot correct is worse than a dashboard you cannot
 * delete from.
 */
export const removeBout = (
  bout: Bout,
  label: string,
  catRowIds: ReadonlyMap<string, string>,
): { ok: true; removed: RemovedBout } | { ok: false; reason: string } => {
  const valueIds: string[] = [];
  for (const [key, id] of catRowIds) {
    const sessionId = key.slice(0, key.indexOf("|"));
    if (bout.rows.some((r) => r.id === sessionId)) valueIds.push(id);
  }
  for (const id of valueIds) {
    const res = evolu.update("subunit_values", { id: id as SubunitValueId, isDeleted: 1 });
    if (!checked(res, "subunit delete")) return { ok: false, reason: "Write failed — see console." };
  }
  for (const row of bout.rows) {
    const res = evolu.update("sessions", { id: row.id as SessionId, isDeleted: 1 });
    if (!checked(res, "session delete")) return { ok: false, reason: "Write failed — see console." };
  }
  return { ok: true, removed: { sessionIds: bout.rows.map((r) => r.id), valueIds, label } };
};

/** Undo — the same rows, un-deleted. Nothing is re-created, so nothing shifts. */
export const restoreBout = (removed: RemovedBout): WriteResult => {
  for (const id of removed.sessionIds) {
    const res = evolu.update("sessions", { id: id as SessionId, isDeleted: 0 });
    if (!checked(res, "session restore")) return bad("Restore failed — see console.");
  }
  for (const id of removed.valueIds) {
    const res = evolu.update("subunit_values", { id: id as SubunitValueId, isDeleted: 0 });
    if (!checked(res, "subunit restore")) return bad("Restore failed — see console.");
  }
  return good;
};

/**
 * CLEAR ALL — every session logged on the day, across every habit.
 *
 * A HEAVY delete, so it rides the count-carrying danger confirm and NOT the undo
 * toast ([[Delete Safety & Undo]]: "irreversible, so it must be deliberate").
 * There is deliberately no undo path back from here.
 *
 * Drafts are untouched by design — they were never written, so there is nothing
 * to clear; the caller remounts its strips so each opens on a fresh empty one.
 */
export const clearDay = (
  sessions: ReadonlyArray<{ id: string }>,
  catRowIds: ReadonlyMap<string, string>,
): WriteResult => {
  const ids = new Set(sessions.map((s) => s.id));
  for (const [key, valueId] of catRowIds) {
    if (!ids.has(key.slice(0, key.indexOf("|")))) continue;
    const res = evolu.update("subunit_values", { id: valueId as SubunitValueId, isDeleted: 1 });
    if (!checked(res, "clear-day subunit delete")) return bad("Write failed — see console.");
  }
  for (const id of ids) {
    const res = evolu.update("sessions", { id: id as SessionId, isDeleted: 1 });
    if (!checked(res, "clear-day session delete")) return bad("Write failed — see console.");
  }
  return good;
};

// ── Entries · the inline quick-create (title-only stub) ──────────────────────

/**
 * The no-match face IS the quick-create door: one click mints a title-only stub
 * and the session row carries it — no modal on the fast path. Status is
 * "Current" iff the habit's own bundle carries status.
 */
export const quickCreateEntry = (
  habit: SpineHabit,
  entryAttributesJson: string | null,
  title: string,
): { ok: true; id: EntryId } | { ok: false; reason: string } => {
  const clean = title.trim();
  if (clean.length === 0) return { ok: false, reason: "A title is required." };
  let hasStatus = false;
  try {
    hasStatus = entryAttributesJson
      ? (entryAttributesFromJson(entryAttributesJson as never) as unknown as string[]).includes(
          "status",
        )
      : false;
  } catch {
    hasStatus = false;
  }
  const res = evolu.insert("entries", {
    habit_fk: habit.id as HabitId,
    title: NonEmptyString1000.orThrow(clean),
    status: hasStatus ? NonEmptyString100.orThrow("Current") : null,
  });
  if (!res.ok) {
    console.error("spine: quick-create failed", res.error);
    return { ok: false, reason: "Entry creation failed." };
  }
  return { ok: true, id: res.value.id };
};

// ── 5 · Keyboard's three deferred controls ───────────────────────────────────

/**
 * BOARD-ONLY LOGGING. "You never type a Keyboard word count — only the board is
 * logged": picking a board writes the day's count session with `source:
 * derived`, carrying Writing's current word total. The engine was pre-built at
 * the 2026-07-23 derive ruling; this is the UI's thin wrapper over it.
 */
export const logBoard = (
  habit: SpineHabit,
  day: string,
  definitionId: string,
  definitionKey: string,
  board: string,
  existing: Bout | null,
  catRowIds: ReadonlyMap<string, string>,
): WriteResult => {
  if (existing?.count != null) {
    // Same day, same session — just re-point the board.
    return setBoutSubunit(existing, definitionId, definitionKey, board, catRowIds);
  }
  // Planted at ZERO and left `derived`, deliberately: reading Writing's total
  // here would need an await, and a buffered write must be synchronous. The
  // post-flush sync fills it from Writing — which is the same machinery that
  // keeps it following afterwards, so there is no second path to get wrong.
  const created = insertSession({
    habit,
    day,
    entryId: null,
    measure: "count",
    value: 0,
    start: null,
    end: null,
    source: "derived",
  });
  if (!created.ok) return bad(created.reason);
  const res = evolu.insert("subunit_values", {
    session_fk: created.id,
    definition_fk: definitionId as SubunitDefinitionId,
    value: NonEmptyString1000.orThrow(board),
  });
  return checked(res, "board write") ? good : bad("Write failed — see console.");
};

/**
 * The visible REFRESH control: re-derive the count from Writing's current
 * total. Routed through `resolveKeyboardWrite`, the harness-verified pure core
 * (2026-07-30 dedup) — neither intent below consults the current row's state,
 * so a placeholder is passed.
 */
export const refreshDerived = async (id: string, day: string): Promise<WriteResult> => {
  const words = await writingWordsForDay(evolu, day);
  const w = resolveKeyboardWrite("refresh", { source: null, value: null }, words);
  if (w == null) return good; // unreachable for "refresh" — the core is the authority
  const res = evolu.update("sessions", {
    id: id as SessionId,
    value: FiniteNumber.orThrow(w.value),
    source: w.source,
  });
  return checked(res, "derived refresh") ? good : bad("Write failed — see console.");
};

/** The OVERRIDE field: a hand value detaches the count (`derived` → `manual`). */
export const overrideDerived = (id: string, value: number): WriteResult => {
  if (!Number.isFinite(value) || value < 0) return bad("A word count cannot be negative.");
  const w = resolveKeyboardWrite("override", { source: null, value: null }, 0, value);
  if (w == null) return good; // unreachable for "override"
  const res = evolu.update("sessions", {
    id: id as SessionId,
    value: FiniteNumber.orThrow(w.value),
    source: w.source,
  });
  return checked(res, "derived override") ? good : bad("Write failed — see console.");
};

// ── The days-ledger serializer ───────────────────────────────────────────────

/**
 * TWO writers birth a `days` row when none exists — finalize (below) and the
 * feed snapshot (feeds.ts) — and the date's uniqueness is app-enforced with no
 * DB constraint behind it. Their read→insert windows must therefore never
 * interleave: every days-row write runs through this chain, and re-reads
 * INSIDE its link (the optimistic layer makes a chained read see the previous
 * link's insert immediately), so a Finalize landing during a snapshot capture
 * can no longer mint a second row for the same date — a permanent catch-up
 * ghost with no repair path (the 2026-07-30 audit).
 */
let dayChain: Promise<unknown> = Promise.resolve();
export const withDayLedger = <T,>(fn: () => Promise<T>): Promise<T> => {
  const next = dayChain.then(fn);
  dayChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
};

// ── Finalize (ruling 1: the state change into state 2, not a submit) ─────────

/**
 * LIVE since 2026-07-27, when the cover wall landed. It writes the `days`
 * ledger's `finalized` flag and nothing else — no session is touched, because
 * finalize is a state change, not a submit.
 *
 * THE CALLER MUST FLUSH THE AUTO-SAVE BUFFER FIRST — and refuse to finalize
 * when the flush fails (user-ruled 2026-07-30: "finalize should wait until
 * save"). `FinalizeButton` does both; anything else that finalizes has to as
 * well.
 *
 * Finalizing an EMPTY day is valid, and the sparse ledger is why this inserts
 * when there is no row: a genuine rest day reads as "did none of these", not
 * "unlogged". The row is re-read inside the ledger chain rather than trusted
 * from the caller's live query — the live row can lag a snapshot insert by a
 * repaint, which is exactly the double-insert window.
 */
export const finalizeDay = (day: string, at: string): Promise<WriteResult> =>
  withDayLedger(async () => {
    const rowQuery = evolu.createQuery((db) =>
      db
        .selectFrom("days")
        .select(["id"])
        .where("isDeleted", "is not", 1)
        .where("date", "=", DateOnly.orThrow(day)),
    );
    const row = (await evolu.loadQuery(rowQuery))[0] ?? null;
    const res = row
      ? evolu.update("days", {
          id: row.id as never,
          finalized: 1,
          finalized_at: DateTimeLocal.orThrow(at),
        })
      : evolu.insert("days", {
          date: DateOnly.orThrow(day),
          finalized: 1,
          finalized_at: DateTimeLocal.orThrow(at),
          feed_snapshot: null,
        });
    return checked(res, "finalize") ? good : bad("Write failed — see console.");
  });
