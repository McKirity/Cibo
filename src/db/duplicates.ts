/**
 * DUPLICATE ENTRY DETECTION — the "prevention + detection + manual repair"
 * triad's middle term ([[Bulk Edit & Data Correction]]: **entry MERGE is
 * dropped**, so nothing here ever combines two rows; it finds them and names
 * why, and repair stays a human deleting the copy they don't want).
 *
 * Built 2026-07-31 at the user's ask, after a Steam import produced a second
 * "Dark Souls III" beside the seeded one — Data Doctor's `entry-dedupe` check
 * arriving early, and step 13 DID inherit it (doctor.ts wraps the pure core
 * below; the Health pane's Data tab is the ONLY door — the dev panel's
 * duplicate door was deleted with the dev surface, 2026-08-04 user-ruled).
 *
 * WHY IT ALSO DIAGNOSES: the importer already runs two independent guards —
 * `(source, external_id)` dedup and the adoption pass (a title-similar MANUAL
 * entry is adopted, never re-created). A duplicate that exists anyway means one
 * of them was bypassed, and WHICH one is the whole diagnosis. So every group
 * carries a `cause`, which is the actual finding; the list of rows is just
 * evidence.
 */
import { evolu } from "./evolu";
import { NonEmptyString100 } from "@evolu/common";
import type { EntryId, HabitId } from "./schema";

/** Fold a title to its comparison key — the ENGINE'S OWN key, deliberately:
 *  a detector that normalized differently from the importer would report
 *  duplicates the importer had no way to prevent, or miss ones it should have. */
export const titleKey = (t: string): string =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export interface DuplicateRow {
  id: EntryId;
  title: string;
  source: string | null;
  externalId: string | null;
  sessions: number;
  hasCover: boolean;
}

/**
 * Is this identity a SEEDER ARTIFACT rather than a real external id?
 * `seedRich` plants `<source>-<n>` (`steam-6`, `calibre-12`) so seeded rows
 * carry provenance — but those ids are fiction, and they defeat BOTH importer
 * guards: the pair dedup compares `steam-6` against a real `374320` and sees
 * two products, while the adoption pass skips the row because adoption only
 * rescues entries with a NULL pair. That is exactly how a second "Dark Souls
 * III" appeared (2026-07-31).
 *
 * The test is deliberately narrow — the id must be the entry's OWN source
 * followed by digits. A real Steam appid is bare digits and a real YouTube
 * channel id can contain hyphens, so a looser pattern would eventually condemn
 * a genuine identity.
 */
const isSeedIdentity = (source: string | null, externalId: string | null): boolean =>
  source != null && externalId != null && new RegExp(`^${source}-\\d+$`).test(externalId);

export type DuplicateCause =
  /** Same (source, external_id) — the hard guard was bypassed; should be impossible. */
  | "identical-identity"
  /** One manual (null pair) + one imported — the ADOPTION pass missed. */
  | "adoption-missed"
  /** A seeded row's FAKE identity beside a real import — not a real collision;
   *  the seed data's fiction defeated both guards. (The one-shot cover
   *  backfill that repaired the seeded rows is deleted — its job is done.) */
  | "seed-artifact"
  /** Two different external ids — probably genuinely different store products
   *  (a Deluxe edition, a remaster) that merely share a normalized title. */
  | "distinct-products"
  /** Two manual rows — hand-created twice; no importer involvement. */
  | "manual-twins";

export interface DuplicateGroup {
  key: string;
  displayTitle: string;
  cause: DuplicateCause;
  rows: DuplicateRow[];
  /** Rows safe to delete: zero sessions AND not the only copy. The one with
   *  history is never offered — it is the row the user actually lived in. */
  safeToDelete: EntryId[];
}

export interface DuplicateReport {
  habitKey: string;
  scanned: number;
  groups: DuplicateGroup[];
}

const classify = (rows: DuplicateRow[]): DuplicateCause => {
  const identified = rows.filter((r) => r.source != null && r.externalId != null);
  const manual = rows.filter((r) => r.source == null && r.externalId == null);
  // Seed fiction is checked FIRST: a seeded id beside a real one looks exactly
  // like two store products, and calling that a "remaster" sends the reader
  // hunting a fault in the importer that is not there.
  const seeded = identified.filter((r) => isSeedIdentity(r.source, r.externalId));
  if (seeded.length > 0 && identified.length > seeded.length) return "seed-artifact";
  if (identified.length >= 2) {
    const pairs = new Set(identified.map((r) => `${r.source}:${r.externalId}`));
    return pairs.size === 1 ? "identical-identity" : "distinct-products";
  }
  if (identified.length === 1 && manual.length >= 1) return "adoption-missed";
  return "manual-twins";
};

/** The minimal entry shape the scan reads — structural, so a caller holding its
 *  own rows (the Data Doctor's snapshot) passes them without adapters. */
export interface DupEntryRow {
  id: string;
  title: string | null;
  source: string | null;
  externalId: string | null;
  cover: string | null;
}

/**
 * THE PURE CORE (split out 2026-08-04). `findDuplicates` below is the
 * query-shell; this is the arithmetic, so a caller that ALREADY holds the rows
 * can scan without re-fetching them. The Data Doctor is exactly that caller:
 * its `snapshot()` holds every entry and session, and the module's own rule is
 * "one load per pass rather than a query per check" — routing its wrap through
 * the shell was issuing three fresh round-trips PER PROJECT HABIT over data it
 * was already holding.
 *
 * Title is the axis on purpose: an identity collision alone cannot produce a
 * visible twin (the hard guard catches it), so what the user SEES as a
 * duplicate is always two rows reading the same.
 */
export const duplicateReportFrom = (
  habitKey: string,
  entries: readonly DupEntryRow[],
  sessionEntryIds: readonly (string | null)[],
): DuplicateReport => {
  const sessionCount = new Map<string, number>();
  for (const k of sessionEntryIds) {
    if (k != null) sessionCount.set(k, (sessionCount.get(k) ?? 0) + 1);
  }

  const byKey = new Map<string, DuplicateRow[]>();
  for (const e of entries) {
    const title = e.title ?? "";
    const k = titleKey(title);
    if (k === "") continue;
    const row: DuplicateRow = {
      id: e.id as EntryId,
      title,
      source: e.source,
      externalId: e.externalId,
      sessions: sessionCount.get(e.id) ?? 0,
      hasCover: e.cover != null,
    };
    const bucket = byKey.get(k);
    if (bucket) bucket.push(row);
    else byKey.set(k, [row]);
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, rows] of byKey) {
    if (rows.length < 2) continue;
    const withHistory = rows.filter((r) => r.sessions > 0).length;
    groups.push({
      key,
      displayTitle: rows[0].title,
      cause: classify(rows),
      rows: rows.slice().sort((a, b) => b.sessions - a.sessions),
      // Never offer every row — if NOTHING has history, deleting them all would
      // erase the entry entirely; keep the first and offer the rest.
      safeToDelete: rows
        .filter((r) => r.sessions === 0)
        .slice(withHistory > 0 ? 0 : 1)
        .map((r) => r.id),
    });
  }
  groups.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle));
  return { habitKey, scanned: entries.length, groups };
};

/** The QUERY SHELL — resolves a habit key, loads its rows, runs the core. */
export const findDuplicates = async (habitKey: string): Promise<DuplicateReport> => {
  const habitRows = await evolu.loadQuery(
    evolu.createQuery((db) =>
      db
        .selectFrom("habits")
        .select(["id"])
        .where("key", "=", NonEmptyString100.orThrow(habitKey))
        .where("isDeleted", "is not", 1),
    ),
  );
  const habitId = habitRows[0]?.id as HabitId | undefined;
  if (habitId == null) throw new Error(`no habit with key "${habitKey}"`);

  const entries = await evolu.loadQuery(
    evolu.createQuery((db) =>
      db
        .selectFrom("entries")
        .select(["id", "title", "source", "external_id", "cover"])
        .where("habit_fk", "=", habitId)
        .where("isDeleted", "is not", 1),
    ),
  );

  const sessions = await evolu.loadQuery(
    evolu.createQuery((db) =>
      db
        .selectFrom("sessions")
        .select(["entry_fk"])
        .where("habit_fk", "=", habitId)
        .where("isDeleted", "is not", 1),
    ),
  );
  return duplicateReportFrom(
    habitKey,
    entries.map((e) => ({
      id: String(e.id),
      title: e.title as string | null,
      source: e.source as string | null,
      externalId: e.external_id as string | null,
      cover: e.cover as string | null,
    })),
    sessions.map((s) => s.entry_fk as string | null),
  );
};

/** One-line human summary of a cause — the diagnosis, not the row dump. */
export const causeNote = (c: DuplicateCause): string =>
  ({
    "identical-identity":
      "same (source, id) on both — the importer's hard dedup was bypassed; a real bug",
    "adoption-missed":
      "one manual + one imported — the import should have ADOPTED the manual row instead of creating one",
    "seed-artifact":
      "a SEEDED row's fake id (steam-6 etc.) beside a real import — the importer worked correctly; run the cover backfill to rewrite seed ids to real ones, then remove the empty copy",
    "distinct-products":
      "different external ids — probably genuinely separate store products sharing a title (an edition or remaster)",
    "manual-twins": "both hand-created — no importer involved",
  })[c];
