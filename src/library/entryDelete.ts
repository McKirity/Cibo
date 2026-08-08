/**
 * Entry delete — the cascade both tiers of [[Delete Safety & Undo]] share.
 * Deleting an entry wipes its sessions (the `isDeleted` tombstone, the
 * keystone's hard-delete mechanism); every surface updates via live queries.
 *
 * Tier 2 (single delete, the entry dashboard's danger foot — `mode:
 * "undoable"`, the default): the undo toast is the entire net — `undo` flips
 * the tombstones back, and the entries' image FILES are STAGED, dying only
 * when the undo window expires (db/fileDeletion.ts — the deferred-file
 * mechanics docked here 2026-08-06, the completion audit; the doctor's
 * orphaned-image check is the crash net).
 *
 * Tier 1 (bulk delete — `mode: "permanent"`): the caller shows the
 * count-carrying danger confirm first and never offers undo; files delete
 * at once.
 */
import { evolu } from "../db/evolu";
import { showErrorToast } from "../shell/toast";
import { cancelStagedDeletion, deleteRefFiles, stageFileDeletions } from "../db/fileDeletion";
import type { EntryId, SessionId, SubunitValueId } from "../db/schema";

export interface DeleteResult {
  ok: boolean;
  /** Flip every tombstone back (tier 2's undo — also cancels the staged files). */
  undo: () => void;
}

/** Tombstone the entries + all their live sessions. */
export async function deleteEntriesCascade(
  entryIds: string[],
  mode: "undoable" | "permanent" = "undoable",
): Promise<DeleteResult> {
  const ids = entryIds as EntryId[];
  // Resolve the LIVE session rows first so undo restores exactly what died
  // (an already-deleted session must not resurrect). ONE `in` query for the
  // whole selection (2026-07-30 — was one loadQuery per entry, sequentially);
  // the empty guard keeps SQLite from seeing an empty `IN ()`.
  const sessionIds: SessionId[] = [];
  const valueIds: SubunitValueId[] = [];
  const fileRefs: string[] = [];
  if (ids.length > 0) {
    const q = evolu.createQuery((db) =>
      db
        .selectFrom("sessions")
        .select(["id"])
        .where("entry_fk", "in", ids)
        .where("isDeleted", "is not", 1),
    );
    const rows = await evolu.loadQuery(q);
    for (const r of rows) sessionIds.push(r.id as SessionId);
    // The definition tail dies with its sessions — the cascade is UNIFORM
    // across every delete path since 2026-08-06 (user-ruled, audit fork B;
    // the daily form's bout delete always did this).
    if (sessionIds.length > 0) {
      const vq = evolu.createQuery((db) =>
        db
          .selectFrom("subunit_values")
          .select(["id"])
          .where("session_fk", "in", sessionIds)
          .where("isDeleted", "is not", 1),
      );
      for (const r of await evolu.loadQuery(vq)) valueIds.push(r.id as SubunitValueId);
    }
    // The entries' cover/banner refs, read BEFORE the tombstones land.
    const eq = evolu.createQuery((db) =>
      db.selectFrom("entries").select(["cover", "banner"]).where("id", "in", ids),
    );
    for (const r of await evolu.loadQuery(eq)) {
      if (r.cover != null) fileRefs.push(String(r.cover));
      if (r.banner != null) fileRefs.push(String(r.banner));
    }
  }

  let ok = true;
  for (const id of valueIds) {
    const r = evolu.update("subunit_values", { id, isDeleted: 1 });
    if (!r.ok) {
      console.error("Value tombstone rejected", r.error);
      ok = false;
    }
  }
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

  // Files: staged behind the undo window (tier 2) or gone at once (tier 1).
  let stagedToken: number | null = null;
  if (fileRefs.length > 0 && ok) {
    if (mode === "undoable") stagedToken = stageFileDeletions(fileRefs);
    else void deleteRefFiles(fileRefs);
  }

  return {
    ok,
    undo: () => {
      if (stagedToken != null) cancelStagedDeletion(stagedToken);
      // A rejected undo must REACH THE USER (tier 3): the toast has already
      // dismissed itself, so a console-only failure reads as "restored" while
      // the entry stays deleted (2026-07-30).
      let undone = true;
      for (const id of ids) {
        const r = evolu.update("entries", { id, isDeleted: 0 });
        if (!r.ok) {
          console.error("Entry undo rejected", r.error);
          undone = false;
        }
      }
      for (const id of sessionIds) {
        const r = evolu.update("sessions", { id, isDeleted: 0 });
        if (!r.ok) {
          console.error("Session undo rejected", r.error);
          undone = false;
        }
      }
      for (const id of valueIds) {
        const r = evolu.update("subunit_values", { id, isDeleted: 0 });
        if (!r.ok) {
          console.error("Value undo rejected", r.error);
          undone = false;
        }
      }
      if (!undone) showErrorToast("Undo failed — the deletion could not be fully restored.");
    },
  };
}
