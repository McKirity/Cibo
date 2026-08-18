/**
 * THE SEMANTIC DATA DOCTOR (Build step 13).
 *
 * [[Data Doctor (Reduced)]] is the owning ruling: roughly half the old
 * plugin's 19 checks tested FORMAT and are impossible by construction now that
 * columns are typed, so what survives is the semantic residue — rows that are
 * well-formed and still wrong.
 *
 * THE CHECK SET IS TEN, ruled 2026-08-04 at the step's open. The note ruled
 * eight; the frozen `Final/settings.html` drew a different eight (three of them
 * never ruled at all); step 10's placeholder rows drew a third set. The
 * conflict was surfaced rather than adjudicated, and the user ruled: importer
 * links, colour uniqueness and "finalized empty days" are struck, MISSING COVER
 * ART is a real check the user can ignore per row ("some like fanfiction just
 * don't have cover arts"), and ORPHANED IMAGE FILES — the note's logged ninth
 * candidate — is promoted with a delete action. Full record: the step note.
 *
 * TWO RUN TIERS, as ruled: `db` checks are trivial at personal scale and run
 * **at launch** (feeding the rail glance-dot) and again **when the surface
 * opens**; `fs` checks touch the filesystem and run **on surface open only**.
 *
 * SEVERITY IS LOAD-BEARING, not decoration: **only `error` lights the rail
 * dot**. Warnings wait quietly in the surface and info never nags — which is
 * why entry-dedupe, the loudest check by volume, is ruled `info`.
 *
 * This module computes; it never navigates and never writes. Findings carry a
 * fix TARGET and, where the ruling allows a direct repair, an ACTION the
 * surface performs. Nothing here merges anything — entry merge stays dropped.
 */
import { evolu } from "./evolu";
import { duplicateReportFrom, causeNote } from "./duplicates";
import { loadMutes, muteKey } from "./doctorMutes";
import { entryMediumColumn } from "./entryMedium";
import { hasIcon } from "../shell/habitIcons";
import { stringListFromJson } from "./schema";
import { getCloudRoot, underRoot } from "../settings/cloudRoot";

import { todayLocal } from "../metrics/clock";
// ── vocabulary ───────────────────────────────────────────────────────────────

export type Severity = "error" | "warning" | "info";
export type CheckTier = "db" | "fs";

/** Where a finding's fix lives — the ruled "deep link to the row's edit surface". */
export type FixTarget =
  | { kind: "day"; date: string }
  | { kind: "entry"; id: string; habitKey: string }
  | { kind: "habit"; key: string }
  | { kind: "vocab" };

/**
 * A repair the surface may run directly. **Never a merge** — that is the ruled
 * exclusion ([[Bulk Edit & Data Correction]]: entry merge dropped; duplicates
 * are prevented, detected, and repaired manually).
 *
 * *The header used to add "never a bulk sweep", and that clause was struck
 * 2026-08-08 as an over-reading.* It came from the merge decision, which is
 * about reconciling two ENTRIES, and was generalised onto deleting stray FILES,
 * where nothing of the kind was ever ruled. The owning ruling for orphaned
 * images is the user's own words at the 2026-08-04 amendment — ***"Alert me
 * about orphaned image files and give me the option to delete them"*** — and
 * "them" is plural. A store wipe strands one file per imported entry, so the
 * realistic finding count is in the hundreds and a one-at-a-time button is not
 * a repair path. `delete-entries` had carried a list since it was written; the
 * precedent was already in this union.
 */
export type FixAction =
  | { kind: "delete-session"; id: string }
  | { kind: "delete-entries"; ids: string[] }
  | { kind: "delete-file"; path: string }
  | { kind: "delete-files"; paths: string[] };

export interface Finding {
  /** The ruled mute key, `check::row-id::field`. */
  muteKey: string;
  /** One line naming what is wrong, in the user's terms. */
  line: string;
  /** Secondary line — which habit, which day. */
  context: string;
  target: FixTarget | null;
  action: FixAction | null;
  /** Label for the action button; the action is nothing without its words. */
  actionLabel?: string;
}

export interface CheckReport {
  id: string;
  label: string;
  /** The one-line description the row wears when it is clean. */
  note: string;
  severity: Severity;
  tier: CheckTier;
  /** False when this pass did not run the check (an `fs` check at launch). */
  ran: boolean;
  findings: Finding[];
  /** How many of this check's findings were muted out of the list. */
  muted: number;
  /**
   * Set when the check RAN but could not complete — so the surface can say
   * "couldn't check" instead of drawing the clean face over an empty result
   * (bug `doctor-1`). Distinct from `ran: false`, which means the tier was not
   * asked for at all: one is "didn't look", this is "looked and failed".
   */
  error?: string;
}

export interface DoctorReport {
  at: string;
  checks: CheckReport[];
  /** Unmuted error-severity findings — the ONLY thing that lights the rail dot. */
  errors: number;
  /** Whether the filesystem tier ran this pass. */
  withFs: boolean;
}

// ── the store snapshot ───────────────────────────────────────────────────────
//
// One load per pass rather than a query per check: the checks overlap heavily
// (four of them read sessions, three read entries), and a personal-scale store
// is a few thousand rows of a handful of columns.

const habitsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("habits")
    .select(["id", "key", "name", "kind", "sub_type", "icon", "range_max_midnights"])
    .where("isDeleted", "is not", 1),
);
const entriesQuery = evolu.createQuery((db) =>
  db
    .selectFrom("entries")
    .select(["id", "habit_fk", "title", "status", "type", "genre", "fandom", "gamedev_engine", "cover", "source", "external_id"])
    .where("isDeleted", "is not", 1),
);
const sessionsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("sessions")
    .select(["id", "habit_fk", "entry_fk", "day", "measure_kind", "start", "end"])
    .where("isDeleted", "is not", 1),
);
const defsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("subunit_definitions")
    .select(["id", "habit_fk", "key", "label", "scope", "data_type"])
    .where("isDeleted", "is not", 1),
);
const vocabQuery = evolu.createQuery((db) =>
  db
    .selectFrom("vocab_options")
    .select(["definition_fk", "value"])
    .where("isDeleted", "is not", 1),
);
const valuesQuery = evolu.createQuery((db) =>
  db
    .selectFrom("subunit_values")
    .select(["id", "session_fk", "definition_fk", "value"])
    .where("isDeleted", "is not", 1),
);

interface Habit {
  id: string;
  key: string;
  name: string;
  kind: string;
  subType: string | null;
  icon: string | null;
  maxMidnights: number | null;
}
interface Entry {
  id: string;
  habitId: string;
  title: string;
  status: string | null;
  type: string | null;
  genre: string[];
  fandom: string | null;
  engine: string | null;
  cover: string | null;
  /** Identity pair — read only by the entry-dedupe check's cause classifier. */
  source: string | null;
  externalId: string | null;
}
interface Session {
  id: string;
  habitId: string;
  entryId: string | null;
  day: string;
  measure: string;
  start: string | null;
  end: string | null;
}
interface Definition {
  id: string;
  habitId: string;
  key: string;
  label: string;
  scope: string;
  dataType: string;
}

/**
 * Exported, with the eight `db`-tier checks below, for their unit tests
 * (Phase 2 step 2). Each check is a pure `(Snapshot) => Finding[]` and the
 * snapshot is plain data, so a synthetic one exercises them with no app.
 *
 * WHY THAT MATTERS MORE HERE than it usually would: the doctor's ERROR tier has
 * never fired in the app's life, and the standing note assumed the first real
 * error finding would be what tested it. It won't be. Two of the three error
 * checks guard against states **the write layer already refuses** —
 * `impossible-range` cannot be created because `validateRangeSpan` rejects
 * `end <= start` on both the create and the update path, and `orphan-session`
 * cannot be created because deleting an entry cascades to its sessions. They
 * exist for rows arriving by sync or corruption, which is right for a CRDT app
 * and also means **normal use will never produce one**. A synthetic snapshot is
 * the only way to exercise them short of hand-editing the store.
 */
export interface Snapshot {
  habits: Habit[];
  entries: Entry[];
  sessions: Session[];
  defs: Definition[];
  /** definition id → its allowed values. The global status list keys on "". */
  vocab: Map<string, Set<string>>;
  values: { id: string; sessionId: string; defId: string; value: string }[];
  habitById: Map<string, Habit>;
  entryById: Map<string, Entry>;
}

const decodeList = (raw: unknown): string[] => {
  if (raw == null) return [];
  try {
    return [...(stringListFromJson(raw as never) as readonly string[])];
  } catch {
    return [];
  }
};

const str = (v: unknown): string | null => (v == null ? null : String(v));

async function snapshot(): Promise<Snapshot> {
  const [h, e, s, d, v, sv] = await Promise.all([
    evolu.loadQuery(habitsQuery),
    evolu.loadQuery(entriesQuery),
    evolu.loadQuery(sessionsQuery),
    evolu.loadQuery(defsQuery),
    evolu.loadQuery(vocabQuery),
    evolu.loadQuery(valuesQuery),
  ]);

  const habits: Habit[] = h.map((r) => ({
    id: String(r.id),
    key: str(r.key) ?? String(r.id),
    name: str(r.name) ?? "—",
    kind: str(r.kind) ?? "simple",
    subType: str(r.sub_type),
    icon: str(r.icon),
    maxMidnights: r.range_max_midnights == null ? null : Number(r.range_max_midnights),
  }));
  const entries: Entry[] = e.map((r) => ({
    id: String(r.id),
    habitId: String(r.habit_fk),
    title: str(r.title) ?? "—",
    status: str(r.status),
    genre: decodeList(r.genre),
    type: str(r.type),
    fandom: str(r.fandom),
    engine: str(r.gamedev_engine),
    cover: str(r.cover),
    source: str(r.source),
    externalId: str(r.external_id),
  }));
  const sessions: Session[] = s.map((r) => ({
    id: String(r.id),
    habitId: String(r.habit_fk),
    entryId: str(r.entry_fk),
    day: str(r.day) ?? "",
    measure: str(r.measure_kind) ?? "none",
    start: str(r.start),
    end: str(r.end),
  }));
  const defs: Definition[] = d.map((r) => ({
    id: String(r.id),
    habitId: String(r.habit_fk),
    key: str(r.key) ?? "",
    label: str(r.label) ?? "",
    scope: str(r.scope) ?? "session",
    dataType: str(r.data_type) ?? "picklist",
  }));

  const vocab = new Map<string, Set<string>>();
  for (const r of v) {
    // definition_fk empty = the ONE global status list (keystone).
    const k = r.definition_fk == null ? "" : String(r.definition_fk);
    const set = vocab.get(k) ?? new Set<string>();
    const val = str(r.value);
    if (val != null) set.add(val);
    vocab.set(k, set);
  }

  return {
    habits,
    entries,
    sessions,
    defs,
    vocab,
    values: sv.map((r) => ({
      id: String(r.id),
      sessionId: String(r.session_fk),
      defId: String(r.definition_fk),
      value: str(r.value) ?? "",
    })),
    habitById: new Map(habits.map((x) => [x.id, x])),
    entryById: new Map(entries.map((x) => [x.id, x])),
  };
}

// ── the checks ───────────────────────────────────────────────────────────────

const dayOf = (dt: string): string => dt.slice(0, 10);

/** How many midnights a range session crosses — the habit's validity rule's unit. */
const midnightsCrossed = (start: string, end: string): number => {
  const a = new Date(`${dayOf(start)}T00:00:00`);
  const b = new Date(`${dayOf(end)}T00:00:00`);
  const ms = b.getTime() - a.getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : 0;
};

const entryTarget = (snap: Snapshot, entry: Entry): FixTarget | null => {
  const habit = snap.habitById.get(entry.habitId);
  return habit == null ? null : { kind: "entry", id: entry.id, habitKey: habit.key };
};

/** 1 · A session pointing at an entry that is gone. */
export function orphanSessions(snap: Snapshot): Finding[] {
  const out: Finding[] = [];
  for (const s of snap.sessions) {
    if (s.entryId == null || snap.entryById.has(s.entryId)) continue;
    const habit = snap.habitById.get(s.habitId);
    out.push({
      muteKey: muteKey("orphan-session", s.id, "entry_fk"),
      line: "Logged against an entry that no longer exists",
      context: `${habit?.name ?? "Unknown habit"} · ${s.day}`,
      target: { kind: "day", date: s.day },
      action: { kind: "delete-session", id: s.id },
      actionLabel: "Delete session",
    });
  }
  return out;
}

/**
 * 2 · A stored string that has left its picklist. The vocab layer stores the
 * STRING, not a foreign key (rename = an atomic bulk-update), which is exactly
 * why removing a value can strand rows — this is the check that ruling bought.
 */
export function unknownVocab(snap: Snapshot): Finding[] {
  const out: Finding[] = [];
  const statusList = snap.vocab.get("") ?? new Set<string>();

  // Which entry column each habit's entry-scope definitions govern — the same
  // discrimination the library makes (picklist-multi = genre; picklist = the
  // Medium `type` on consumption, `fandom`/`gamedev_engine` on creation).
  const perHabit = new Map<string, { genre: Set<string>; single: Set<string>; column: "type" | "fandom" | "engine" }>();
  for (const habit of snap.habits) {
    const mine = snap.defs.filter((d) => d.habitId === habit.id && d.scope === "entry");
    const multi = mine.find((d) => d.dataType === "picklist-multi");
    const single = mine.find((d) => d.dataType === "picklist");
    perHabit.set(habit.id, {
      genre: (multi != null ? snap.vocab.get(multi.id) : undefined) ?? new Set(),
      single: (single != null ? snap.vocab.get(single.id) : undefined) ?? new Set(),
      // The derivation moved to entryMedium.ts at bug `vocab-1` — this check
      // and the library were the two sites that had it right, and the rename
      // was the one guessing. Mapped back to this check's own field names:
      // `engine`, never `gamedev_engine`, because the string is part of the
      // MUTE KEY and a finding the user ignored must not reappear renamed.
      column: ((): "type" | "fandom" | "engine" => {
        const col = entryMediumColumn(habit.subType, "picklist", single?.key ?? "");
        return col === "gamedev_engine" ? "engine" : col === "fandom" ? "fandom" : "type";
      })(),
    });
  }

  for (const e of snap.entries) {
    const habit = snap.habitById.get(e.habitId);
    const lists = perHabit.get(e.habitId);
    const ctx = `${habit?.name ?? "Unknown habit"} · ${e.title}`;
    const push = (field: string, value: string, what: string) =>
      out.push({
        muteKey: muteKey("unknown-vocab", e.id, field),
        line: `${what} “${value}” is not in its list any more`,
        context: ctx,
        target: entryTarget(snap, e),
        action: null,
      });

    // Status is the one GLOBAL list; an empty list means the vocab has not
    // loaded rather than that every value is wrong, so guard on it.
    if (e.status != null && statusList.size > 0 && !statusList.has(e.status)) push("status", e.status, "Status");
    if (lists != null) {
      const singleValue = lists.column === "type" ? e.type : lists.column === "fandom" ? e.fandom : e.engine;
      const singleName = lists.column === "type" ? "Type" : lists.column === "fandom" ? "Fandom" : "Engine";
      if (singleValue != null && lists.single.size > 0 && !lists.single.has(singleValue))
        push(lists.column, singleValue, singleName);
      for (const g of e.genre)
        if (lists.genre.size > 0 && !lists.genre.has(g)) push(`genre:${g}`, g, "Genre");
    }
  }

  // Session-level categoricals — the definition tail's own answers.
  const defById = new Map(snap.defs.map((d) => [d.id, d]));
  const sessionById = new Map(snap.sessions.map((s) => [s.id, s]));
  for (const v of snap.values) {
    const def = defById.get(v.defId);
    if (def == null || def.dataType === "flag") continue;
    const allowed = snap.vocab.get(def.id);
    if (allowed == null || allowed.size === 0 || allowed.has(v.value)) continue;
    const s = sessionById.get(v.sessionId);
    const habit = snap.habitById.get(def.habitId);
    out.push({
      muteKey: muteKey("unknown-vocab", v.id, def.key),
      line: `${def.label} “${v.value}” is not in its list any more`,
      context: `${habit?.name ?? "Unknown habit"}${s != null ? ` · ${s.day}` : ""}`,
      target: s != null ? { kind: "day", date: s.day } : { kind: "vocab" },
      action: null,
    });
  }
  return out;
}

/** 3 · A range session that ends at or before it starts — an impossible bout. */
export function impossibleRange(snap: Snapshot): Finding[] {
  const out: Finding[] = [];
  for (const s of snap.sessions) {
    if (s.measure !== "range" || s.start == null || s.end == null) continue;
    if (new Date(s.end).getTime() > new Date(s.start).getTime()) continue;
    const habit = snap.habitById.get(s.habitId);
    out.push({
      muteKey: muteKey("impossible-range", s.id, "end"),
      line: "Ends at or before it starts",
      context: `${habit?.name ?? "Unknown habit"} · ${s.start} → ${s.end}`,
      target: { kind: "day", date: s.day },
      action: null,
    });
  }
  return out;
}

/** 4 · A range session longer than its habit's max-span rule allows. */
export function overMaxSpan(snap: Snapshot): Finding[] {
  const out: Finding[] = [];
  for (const s of snap.sessions) {
    if (s.measure !== "range" || s.start == null || s.end == null) continue;
    const habit = snap.habitById.get(s.habitId);
    const cap = habit?.maxMidnights;
    if (cap == null) continue;
    const crossed = midnightsCrossed(s.start, s.end);
    if (crossed <= cap) continue;
    out.push({
      muteKey: muteKey("over-max-span", s.id, "end"),
      line: `Crosses ${crossed} midnights — ${habit?.name ?? "this habit"} allows ${cap}`,
      context: `${habit?.name ?? "Unknown habit"} · ${s.start} → ${s.end}`,
      target: { kind: "day", date: s.day },
      action: null,
    });
  }
  return out;
}

/**
 * 5 · A session dated after today — the back-dating typo.
 *
 * DEVIATION, recorded: the ruling's fix action is "jump to session edit", and
 * there is no such door. **A future day is a dead route by construction** —
 * every day door routes through Shell's `openDay`, which refuses tomorrow, so
 * the only surface that could edit this session is the one surface the app
 * will not open. Deleting it is therefore the only repair the app can offer,
 * and offering a door that bounces would be worse than saying so.
 */
export function futureDated(snap: Snapshot): Finding[] {
  const today = todayLocal();
  const out: Finding[] = [];
  for (const s of snap.sessions) {
    if (s.day <= today) continue;
    const habit = snap.habitById.get(s.habitId);
    out.push({
      muteKey: muteKey("future-dated", s.id, "day"),
      line: `Dated ${s.day} — that day hasn't happened yet`,
      context: `${habit?.name ?? "Unknown habit"} · a future day can't be opened, so this can only be removed`,
      target: null,
      action: { kind: "delete-session", id: s.id },
      actionLabel: "Delete session",
    });
  }
  return out;
}

/** 7 · An entry carrying no cover reference at all. Ruled in 2026-08-04 —
 *  a flag the user can ignore per row, because some things never have art. */
export function missingCover(snap: Snapshot): Finding[] {
  const out: Finding[] = [];
  for (const e of snap.entries) {
    if (e.cover != null) continue;
    const habit = snap.habitById.get(e.habitId);
    out.push({
      muteKey: muteKey("missing-cover", e.id, "cover"),
      line: "No cover image",
      context: `${habit?.name ?? "Unknown habit"} · ${e.title}`,
      target: entryTarget(snap, e),
      action: null,
    });
  }
  return out;
}

/** 9 · A habit pointing at an icon name the pinned lucide set doesn't carry. */
export function unknownIcon(snap: Snapshot): Finding[] {
  const out: Finding[] = [];
  for (const h of snap.habits) {
    if (h.icon == null || hasIcon(h.icon)) continue;
    out.push({
      muteKey: muteKey("unknown-icon", h.id, "icon"),
      line: `Icon “${h.icon}” is not in the pinned icon set`,
      context: `${h.name} · drawing its lettermark instead`,
      target: { kind: "habit", key: h.key },
      action: null,
    });
  }
  return out;
}

/**
 * 8 · Entry dedupe — step 8's engine, wrapped. Never re-implemented.
 *
 * Reads THE SNAPSHOT (2026-08-04). It used to call `findDuplicates`, the query
 * SHELL, once per project habit — three fresh round-trips each, ~15 in total,
 * over entries and sessions this pass was already holding, against this
 * module's own stated "one load per pass" rule. `duplicateReportFrom` is the
 * same arithmetic with the rows passed in, so the wrap is still a wrap.
 */
export function entryDedupe(snap: Snapshot): Finding[] {
  const out: Finding[] = [];
  const entriesByHabit = new Map<string, typeof snap.entries>();
  for (const e of snap.entries) {
    const list = entriesByHabit.get(e.habitId);
    if (list) list.push(e);
    else entriesByHabit.set(e.habitId, [e]);
  }
  const sessionEntryIdsByHabit = new Map<string, (string | null)[]>();
  for (const s of snap.sessions) {
    const list = sessionEntryIdsByHabit.get(s.habitId);
    if (list) list.push(s.entryId);
    else sessionEntryIdsByHabit.set(s.habitId, [s.entryId]);
  }
  for (const habit of snap.habits) {
    if (habit.kind !== "project") continue;
    const report = duplicateReportFrom(
      habit.key,
      entriesByHabit.get(habit.id) ?? [],
      sessionEntryIdsByHabit.get(habit.id) ?? [],
    );
    for (const g of report.groups) {
      out.push({
        muteKey: muteKey("entry-dedupe", `${habit.key}:${g.key}`, "title"),
        line: `“${g.displayTitle}” is stored ${g.rows.length} times`,
        context: `${habit.name} · ${causeNote(g.cause)}`,
        target:
          g.rows[0] != null ? { kind: "entry", id: g.rows[0].id as string, habitKey: habit.key } : null,
        action: g.safeToDelete.length > 0 ? { kind: "delete-entries", ids: g.safeToDelete.map(String) } : null,
        actionLabel:
          g.safeToDelete.length > 0
            ? `Remove ${g.safeToDelete.length} empty ${g.safeToDelete.length === 1 ? "copy" : "copies"}`
            : undefined,
      });
    }
  }
  return out;
}

// ── the filesystem tier ──────────────────────────────────────────────────────
//
// Checks 6 and 10 are the two directions of the same question: a reference with
// no file, and a file with no reference. Ruled to run on surface open only.

interface CoverScan {
  broken: Finding[];
  orphans: Finding[];
  /**
   * Why the orphan sweep could not complete, when it could not. A check that
   * cannot say "I could not look" is indistinguishable from one that looked and
   * found nothing (bug `doctor-1`, 2026-08-08) — and this sweep's entire job is
   * noticing things, so a silent zero is the worst answer it can give.
   */
  orphanScanError?: string;
}

/**
 * OS bookkeeping files are never data. macOS drops `.DS_Store` (Finder
 * metadata) and `._*` AppleDouble sidecars into any folder it touches, and the
 * cloud drive carries them to the other machine; Windows contributes
 * `Thumbs.db` and `desktop.ini`. Without this list, the day a Mac first opens
 * the images tree every habit folder grows a permanent "orphan" finding — the
 * doctor blaming the OS's litter on the user's data, forever (`doctor-1`'s
 * recorded step-4 rider, built 2026-08-09). The app's own image names
 * (`<source>-<external_id>.<ext>` / `<entry-id>.<ext>`) can never collide with
 * any of these shapes.
 */
const OS_JUNK = new Set([".ds_store", "thumbs.db", "desktop.ini"]);
export const isOsJunk = (name: string): boolean =>
  OS_JUNK.has(name.toLowerCase()) || name.startsWith("._");

async function scanCovers(snap: Snapshot): Promise<CoverScan> {
  const broken: Finding[] = [];
  const orphans: Finding[] = [];
  // Refs resolve against the cloud root (step 14). Unset root: the fs tier has
  // nothing to scan — reporting every ref as broken would blame the data for a
  // missing folder pick, so the tier goes silent (the Storage pane is the nag).
  const root = getCloudRoot();
  if (root == null) return { broken, orphans };
  const fs = await import("@tauri-apps/plugin-fs");

  // 6 · a stored ref pointing at nothing.
  for (const e of snap.entries) {
    if (e.cover == null) continue;
    let there = false;
    try {
      there = await fs.exists(underRoot(root, e.cover));
    } catch {
      there = false;
    }
    if (there) continue;
    const habit = snap.habitById.get(e.habitId);
    broken.push({
      muteKey: muteKey("broken-cover", e.id, "cover"),
      line: "Its cover file is missing from disk",
      context: `${habit?.name ?? "Unknown habit"} · ${e.title}`,
      target: entryTarget(snap, e),
      action: null,
    });
  }

  // 10 · a file nothing references. RULED IN 2026-08-04 with a delete action.
  // The designated net for a crash inside the undo-toast window, which commits
  // the tombstone and never runs the deferred file deletion.
  const referenced = new Set(snap.entries.flatMap((e) => (e.cover != null ? [e.cover] : [])));
  try {
    const imagesAbs = underRoot(root, "images");
    if (await fs.exists(imagesAbs)) {
      for (const dir of await fs.readDir(imagesAbs)) {
        if (!dir.isDirectory) continue;
        const rel = `images/${dir.name}`;
        const habit = snap.habits.find((h) => h.key === dir.name);
        for (const file of await fs.readDir(underRoot(root, rel))) {
          // Skip SUBDIRECTORIES, not "anything that isn't a plain file". This
          // read `!file.isFile` until 2026-08-08, which silently discarded every
          // entry the OS would not classify — and on a cloud-synced root that is
          // a routine state, not an exotic one: Google Drive presents a
          // not-yet-materialised file as a reparse point, so `isFile` is false
          // while Explorer shows it plainly. A hand-dropped image was therefore
          // invisible to this sweep until a rename forced Drive to materialise
          // it (bug `doctor-1`).
          //
          // The inversion is the point: files the app WROTE always classify
          // cleanly, and files it did not are exactly what this check exists to
          // catch — so the old test was blindest precisely where it mattered.
          // A directory is the one thing here that is certainly not a stray
          // image, so it is the one thing worth skipping.
          if (file.isDirectory) continue;
          // And OS junk by name — see `isOsJunk` above. Junk is skipped, not
          // reported: it is not the user's to answer for.
          if (isOsJunk(file.name)) continue;
          // The path stays root-RELATIVE — mute keys and the delete action
          // must survive the root moving to another folder or device.
          const path = `${rel}/${file.name}`;
          if (referenced.has(path)) continue;
          orphans.push({
            muteKey: muteKey("orphan-image", path, "file"),
            line: file.name,
            context: `${habit?.name ?? dir.name} · no entry references this file`,
            target: null,
            action: { kind: "delete-file", path },
            actionLabel: "Delete file",
          });
        }
      }
    }
  } catch (err) {
    console.warn("doctor: image scan failed (non-fatal)", err);
    // Non-fatal to the PASS, but never silent to the SURFACE: returning bare
    // `orphans: []` here is what made a permission or IO failure render as a
    // clean row for as long as this check has existed.
    return { broken, orphans, orphanScanError: String(err) };
  }

  return { broken, orphans };
}

// ── the registry + the runner ────────────────────────────────────────────────

interface CheckSpec {
  id: string;
  label: string;
  note: string;
  severity: Severity;
  tier: CheckTier;
}

/**
 * The ruled ten, in severity order within tier — the order the surface lists
 * them. Labels are the drawn ones where a drawn row survived the 2026-08-04
 * ruling; the two range checks split a single drawn row ("Sleep range
 * integrity") because they carry different severities.
 */
export const CHECK_SPECS: readonly CheckSpec[] = [
  { id: "orphan-session", label: "Orphaned sessions", note: "A session pointing at a missing entry.", severity: "error", tier: "db" },
  { id: "unknown-vocab", label: "Unknown vocabulary", note: "A stored value that left its list.", severity: "error", tier: "db" },
  { id: "impossible-range", label: "Impossible ranges", note: "A range session that ends before it starts.", severity: "error", tier: "db" },
  { id: "over-max-span", label: "Over-long ranges", note: "A range session longer than its habit allows.", severity: "warning", tier: "db" },
  { id: "future-dated", label: "Future-dated sessions", note: "A session logged on a day that hasn't happened.", severity: "warning", tier: "db" },
  { id: "unknown-icon", label: "Unknown icons", note: "An icon name absent from the pinned set.", severity: "warning", tier: "db" },
  { id: "missing-cover", label: "Missing cover art", note: "An entry with no cover image.", severity: "warning", tier: "db" },
  { id: "broken-cover", label: "Broken cover files", note: "A cover reference pointing at no file.", severity: "warning", tier: "fs" },
  { id: "orphan-image", label: "Orphaned image files", note: "An image file no entry references.", severity: "warning", tier: "fs" },
  { id: "entry-dedupe", label: "Duplicate entries", note: "The same title stored twice.", severity: "info", tier: "db" },
];

export interface DoctorOptions {
  /** Run the filesystem tier — false at launch, true when the surface opens. */
  withFs: boolean;
  /**
   * Skip the info tier. The launch pass exists to feed the rail dot, the dot
   * reads ERRORS ONLY, and the app's one info check (entry-dedupe) is by far
   * the most expensive — it walks every project habit's entries AND sessions.
   * Doing that at launch to produce a number nothing reads is the kind of work
   * worth not doing; the surface's own pass runs everything.
   */
  skipInfo?: boolean;
}

/** Run the doctor over the live store. Pure read + one snapshot per pass. */
export async function runDoctor(opts: DoctorOptions): Promise<DoctorReport> {
  const { withFs, skipInfo = false } = opts;
  const [snap, mutes] = await Promise.all([snapshot(), loadMutes()]);

  const raw = new Map<string, Finding[]>([
    ["orphan-session", orphanSessions(snap)],
    ["unknown-vocab", unknownVocab(snap)],
    ["impossible-range", impossibleRange(snap)],
    ["over-max-span", overMaxSpan(snap)],
    ["future-dated", futureDated(snap)],
    ["unknown-icon", unknownIcon(snap)],
    ["missing-cover", missingCover(snap)],
  ]);

  if (!skipInfo) raw.set("entry-dedupe", entryDedupe(snap));

  // Scoped to `orphan-image` alone, deliberately: the broken-cover half fails
  // per-entry into "the file is missing", which is a LOUD wrong answer rather
  // than a silent empty one. Only the orphan sweep can fail wholesale.
  let orphanScanError: string | undefined;
  if (withFs) {
    const scan = await scanCovers(snap);
    raw.set("broken-cover", scan.broken);
    raw.set("orphan-image", scan.orphans);
    orphanScanError = scan.orphanScanError;
  }

  const checks: CheckReport[] = CHECK_SPECS.map((spec) => {
    const ran = (spec.tier === "db" || withFs) && !(skipInfo && spec.severity === "info");
    const all = raw.get(spec.id) ?? [];
    const findings = all.filter((f) => !mutes.has(f.muteKey));
    return {
      ...spec,
      ran,
      findings,
      muted: all.length - findings.length,
      error: spec.id === "orphan-image" ? orphanScanError : undefined,
    };
  });

  return {
    at: new Date().toISOString(),
    checks,
    errors: checks
      .filter((c) => c.severity === "error")
      .reduce((n, c) => n + c.findings.length, 0),
    withFs,
  };
}

// ── the launch signal (what the rail dot reads) ──────────────────────────────
//
// The dot summarizes; it never blocks. A failed run leaves the signal at its
// last value rather than inventing a clean verdict — the health home is the
// place that explains, and a check that could not run is not a check that
// passed.

const SIGNAL_EVENT = "cibo:doctor";
let errorCount = 0;

export const doctorErrorCount = (): number => errorCount;

export function subscribeDoctor(fn: (errors: number) => void): () => void {
  const h = () => fn(errorCount);
  window.addEventListener(SIGNAL_EVENT, h);
  return () => window.removeEventListener(SIGNAL_EVENT, h);
}

/** Publish a completed run's error count to the dot. */
export function publishDoctor(report: DoctorReport): void {
  errorCount = report.errors;
  window.dispatchEvent(new Event(SIGNAL_EVENT));
}

/**
 * The launch pass — ruled: "they run on app launch (feeding the dot) and
 * re-run when the surface opens". DB tier only; deliberately fire-and-forget so
 * a slow store never delays the first paint.
 */
export function runDoctorAtLaunch(): void {
  void runDoctor({ withFs: false, skipInfo: true }).then(publishDoctor, (e) => {
    console.warn("doctor: launch pass failed (non-fatal)", e);
  });
}
