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
import { getBackupsRoot } from "./backup";

const inTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const sep = (root: string): string => (root.includes("/") && !root.includes("\\") ? "/" : "\\");

/** Arms the marker and relaunches — this call does not return on success. */
export async function requestRestore(slotId: string): Promise<void> {
  const root = getBackupsRoot();
  if (root == null || !inTauri()) throw new Error("no backups folder set");
  const archive = `${root}${sep(root)}${slotId}-store.tar.zst`;
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
