/**
 * RESTORE (step 12) — store-directory swap, deliberate, single-device
 * ([[Backups & Export]] § Restore). Evolu has no import API, so restore is
 * inherently a RESTART operation: this side arms a marker and relaunches;
 * lib.rs's `apply_pending_restore` performs the swap in setup(), before any
 * window exists — the only moment the store is closed. A safety copy of the
 * current store is renamed aside first, so a restore is itself undoable.
 *
 * Only slots that still carry the store-directory copy are restorable; the
 * pane presents the others as READABLE, NOT RESTORABLE and names the manual
 * path — the UI must never advertise a restore it can't do.
 */
import { invoke } from "@tauri-apps/api/core";
// `join` + `storeName` are IMPORTED from backup.ts (2026-08-04), not re-derived:
// this module used to hand-build `${root}${sep}${slotId}-store.tar.zst`, so a
// retention-side rename of the archive suffix would have broken restore
// silently — the one path where a mismatch cannot be recovered from.
// `inTauri` likewise comes from settings/deviceStore, the one declaration.
import { getBackupsRoot, join, storeName } from "./backup";
import { inTauri } from "../settings/deviceStore";

/** Arms the marker and relaunches — this call does not return on success. */
export async function requestRestore(slotId: string): Promise<void> {
  const root = getBackupsRoot();
  if (root == null || !inTauri()) throw new Error("no backups folder set");
  const archive = join(root, storeName(slotId));
  await invoke("bk_request_restore", { archive });
}

export interface RestoreResult {
  ok: boolean;
  detail: string;
}

/** The launch's one-shot outcome read — feeds the arrival toast. */
export async function takeRestoreResult(): Promise<RestoreResult | null> {
  if (!inTauri()) return null;
  try {
    const raw = await invoke<string | null>("bk_take_restore_result");
    return raw == null ? null : (JSON.parse(raw) as RestoreResult);
  } catch {
    return null;
  }
}
