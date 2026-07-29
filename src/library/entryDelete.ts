/**
 * Entry delete — the cascade both tiers of [[Delete Safety & Undo]] share.
 * Deleting an entry wipes its sessions (the `isDeleted` tombstone, the
 * keystone's hard-delete mechanism); every surface updates via live queries.
 *
 * Tier 2 (single delete, the entry dashboard's danger foot): the undo toast is
 * the entire net — `undo` flips the tombstones back. Entries' image FILES have
 * no deletion half yet (no cloud root until step 14) — the deferred-file
 * mechanics dock here when the pipeline exists.
 *
 * Tier 1 (bulk delete): permanent — the caller shows the count-carrying danger
 * confirm first and never offers undo.
 */
import { evolu } from "../db/evolu";
import type { EntryId, SessionId } from "../db/schema";

export interface DeleteResult {
  ok: boolean;
  /** Flip every tombstone back (tier 2's undo). */
  undo: () => void;
}

/** Tombstone the entries + all their live sessions. */
export async function deleteEntriesCascade(entryIds: string[]): Promise<DeleteResult> {
  const ids = entryIds as EntryId[];
  // Resolve the LIVE session rows first so undo restores exactly what died
  // (an already-deleted session must not resurrect).
  const sessionIds: SessionId[] = [];
  for (const entryId of ids) {
    const q = evolu.createQuery((db) =>
      db
        .selectFrom("sessions")
        .select(["id"])
        .where("entry_fk", "=", entryId)
        .where("isDeleted", "is not", 1),
    );
    const rows = await evolu.loadQuery(q);
    for (const r of rows) sessionIds.push(r.id as SessionId);
  }

  let ok = true;
  for (const id of sessionIds) {
    const r = evolu.update("sessions", { id, isDeleted: 1 });
    if (!r.ok) {
      console.error("Session tombstone rejected", r.error);
      ok = false;
    }
  }
  for (const id of ids) {
    const r = evolu.update("entries", { id, isDeleted: 1 });
    if (!r.ok) {
      console.error("Entry tombstone rejected", r.error);
      ok = false;
    }
  }

  return {
    ok,
    undo: () => {
      for (const id of ids) {
        const r = evolu.update("entries", { id, isDeleted: 0 });
        if (!r.ok) console.error("Entry undo rejected", r.error);
      }
      for (const id of sessionIds) {
        const r = evolu.update("sessions", { id, isDeleted: 0 });
        if (!r.ok) console.error("Session undo rejected", r.error);
      }
    },
  };
}
