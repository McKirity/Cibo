/**
 * DEFERRED FILE DELETION — the missing half of [[Delete Safety & Undo]], built
 * at the Phase-2 completion audit (2026-08-06, finding detailed-design-2; the
 * blocker — no cloud root — fell at step 14).
 *
 * The contract: tombstones commit immediately, image FILES die only when the
 * undo window has passed. Tier 2 (single entry delete) STAGES the refs and the
 * undo cancels the stage; tier 1 (bulk / habit delete, behind the danger
 * confirm) deletes at once. A crash inside the window commits the tombstone
 * and never runs the deletion — BY DESIGN: the doctor's orphaned-image check
 * (with its delete action) is the designated net, ruled at step 13.
 *
 * Failures are logged, never thrown, and never surface a toast: a leftover
 * file is invisible until the doctor names it, and deleting is best-effort by
 * construction. No cloud root set → nothing to delete against → no-op.
 */
import { resolveRef } from "../settings/cloudRoot";

/** Matches the undo toast's ~10 s window ([[Delete Safety & Undo]] tier 2). */
const UNDO_WINDOW_MS = 10_000;

interface Staged {
  refs: string[];
  timer: ReturnType<typeof setTimeout>;
}

const staged = new Map<number, Staged>();
let nextToken = 1;

const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Best-effort removal of root-relative refs; each failure logged, none fatal. */
export async function deleteRefFiles(refs: readonly string[]): Promise<void> {
  if (!isTauri()) return;
  const live = refs.filter((r) => r != null && r !== "");
  if (live.length === 0) return;
  let fs: typeof import("@tauri-apps/plugin-fs");
  try {
    fs = await import("@tauri-apps/plugin-fs");
  } catch (e) {
    console.error("fileDeletion: fs plugin unavailable", e);
    return;
  }
  for (const ref of live) {
    const abs = resolveRef(ref);
    if (abs == null) continue; // no cloud root — the doctor inherits the file
    try {
      await fs.remove(abs);
    } catch (e) {
      // Already gone / never mirrored / locked — all fine; the doctor's
      // orphan check is the net for anything real.
      console.warn(`fileDeletion: could not remove ${ref}`, e);
    }
  }
}

/**
 * Stage refs to delete when the undo window expires. Returns a token the
 * undo path passes to `cancelStagedDeletion`.
 */
export function stageFileDeletions(refs: readonly string[], ms = UNDO_WINDOW_MS): number {
  const live = refs.filter((r) => r != null && r !== "");
  const token = nextToken++;
  if (live.length === 0) return token;
  const timer = setTimeout(() => {
    staged.delete(token);
    void deleteRefFiles(live);
  }, ms);
  staged.set(token, { refs: live, timer });
  return token;
}

/**
 * Anything staged and not yet committed? The close guard's own reason to
 * intercept a close — independent of backups on purpose (the Mac cradle-kill,
 * 2026-08-16: the close path must not consult backup code to decide whether
 * the DELETION flush is owed).
 */
export const hasStagedDeletions = (): boolean => staged.size > 0;

/** The undo pressed inside the window: the files live on with the rows. */
export function cancelStagedDeletion(token: number): void {
  const s = staged.get(token);
  if (s == null) return;
  clearTimeout(s.timer);
  staged.delete(token);
}

/**
 * The clean close's commit step: a quit inside someone's undo window would
 * otherwise drop the staged deletions on the floor (the toast dies with the
 * webview, so the undo it offered is gone either way — committing is the
 * honest reading). Called from the close sequence before the backup runs.
 */
export async function flushStagedDeletions(): Promise<void> {
  const all = [...staged.values()];
  staged.clear();
  for (const s of all) clearTimeout(s.timer);
  const refs = all.flatMap((s) => s.refs);
  if (refs.length > 0) await deleteRefFiles(refs);
}
