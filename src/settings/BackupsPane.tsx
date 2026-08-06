/**
 * SETTINGS → BACKUPS (Build step 12) — status · Back up now · the slot list ·
 * restore. Owning record: [[Backups & Export]].
 *
 * The rules this pane wears on its face:
 * · Restore is offered ONLY for slots that still carry the store-directory
 *   copy; a pruned slot renders as READABLE, NOT RESTORABLE and names the
 *   manual path — the UI must never advertise a restore it can't do.
 * · The restore confirm CARRIES THE DATE ("replaces ALL current data with the
 *   backup from <date>"); a safety copy is taken first, and the app restarts —
 *   the swap needs the store closed, so restore is a relaunch by construction.
 * · Unset root = backups PAUSE, never a gate. The folder picker here is the
 *   step-14 stand-in on the themes-root doctrine: the real cloud-root picker
 *   (Settings → Storage) replaces the SOURCE, nothing else.
 */
import { useEffect, useState } from "react";
import { Ico } from "../shell/icons";
import { DangerConfirm } from "../shell/DangerConfirm";
import {
  BACKUP_EVENT,
  backupRunning,
  getBackupsRoot,
  listSlots,
  readBackupRecord,
  revealBackupsFolder,
  runBackup,
  setBackupsRoot,
  type Slot,
} from "../backup/backup";
import { requestRestore } from "../backup/restore";
import { showErrorToast } from "../shell/toast";
import { relLabel } from "../metrics/format";

/* relTime was a re-implementation of metrics/format.relLabel — adopted
   2026-08-04. One copy-visible change: the shared form pluralises the minute
   bucket ("5 mins ago"), matching the palette's recents list. */
const relTime = (iso: string): string => relLabel(new Date(iso).getTime());

export function BackupsPane() {
  const [root, setRoot] = useState(getBackupsRoot());
  const [record, setRecord] = useState(readBackupRecord());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busy, setBusy] = useState(backupRunning());
  const [confirming, setConfirming] = useState<Slot | null>(null);
  /** Restore armed — the app is about to close/restart; this narrates it. */
  const [closing, setClosing] = useState<string | null>(null);

  const refresh = () => {
    setRecord(readBackupRecord());
    setBusy(backupRunning());
    void listSlots().then(setSlots, () => setSlots([]));
  };
  useEffect(() => {
    refresh();
    window.addEventListener(BACKUP_EVENT, refresh);
    return () => window.removeEventListener(BACKUP_EVENT, refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backupNow = () => {
    setBusy(true);
    void runBackup("manual").finally(refresh);
  };

  const pickRoot = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, title: "Pick the backups folder" });
      if (typeof dir === "string") {
        setBackupsRoot(dir);
        setRoot(dir);
        refresh();
      }
    } catch (e) {
      showErrorToast(`Folder pick failed — ${e instanceof Error ? e.message : String(e)}`, "Backups");
    }
  };

  // The confirm's yes: narrate BEFORE the process dies — without this beat the
  // close reads as a crash (found live 2026-08-03, second rehearsal). The
  // notice holds a moment, then the restore arms and the app closes (dev) or
  // restarts (packaged).
  const restore = (s: Slot) => {
    setConfirming(null);
    setClosing(s.id);
    window.setTimeout(() => {
      void requestRestore(s.id).catch((e) => {
        setClosing(null);
        showErrorToast(`Restore could not start — ${e instanceof Error ? e.message : String(e)}`, "Backups");
      });
    }, 2_800);
  };

  return (
    <div className="hscroll">
      {/* status + the two doors */}
      <div className="ctrlstack">
        <div className="crow two">
          <span className="clabel">Folder</span>
          <span className="cright">
            {root != null && <span className="field">{root}</span>}
            <button className="btn-plain btn-sm" onClick={() => void pickRoot()}>
              {root == null ? "Pick a folder…" : "Change…"}
            </button>
            {root != null && (
              <button className="btn-plain btn-sm" onClick={() => void revealBackupsFolder()}>
                Open
              </button>
            )}
          </span>
        </div>
        <div className="crow two">
          <span className="clabel">Last backup</span>
          <span className="cright">
            <span className={`field${record == null ? " none" : ""}`}>
              {root == null
                ? "paused — no folder set"
                : busy
                  ? "backing up…"
                  : record == null
                    ? "never"
                    : record.ok
                      ? `${relTime(record.at)} · verified · on ${record.reason}`
                      : `failed ${relTime(record.at)} — ${record.error ?? "unknown"}`}
            </span>
            <button className="btn-plain btn-sm" disabled={root == null || busy} onClick={backupNow}>
              <Ico d={["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M17 8l-5-5-5 5", "M12 3v12"]} />
              Back up now
            </button>
          </span>
        </div>
      </div>
      <div className="hgroup">
        <p className="hglbl">
          Backups
          <span className="runline">
            {slots.length} slot{slots.length === 1 ? "" : "s"}
          </span>
        </p>
        {slots.length === 0 ? (
          <p className="vnote">
            {root == null
              ? "Pick a folder above and the first backup writes on the next close."
              : "No backups here yet — close the app once, or press Back up now."}
          </p>
        ) : (
          <div className="mlist">
            {slots.map((s) => (
              <div className="mrow" key={s.id}>
                <span className="mid">
                  <span className="field">{s.id}</span>
                  {s.monthly && <span className="mgtag">monthly keeper</span>}
                  {!s.hasStore && <span className="mgtag">readable, not restorable</span>}
                </span>
                <span className="macts">
                  {s.hasStore ? (
                    <button className="btn-plain btn-sm" onClick={() => setConfirming(s)}>
                      Restore…
                    </button>
                  ) : (
                    <span className="mgtag">open its files in a SQLite tool or spreadsheet</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {closing != null && (
        <div className="dimlayer" role="presentation">
          <div className="confirm" role="alertdialog" aria-modal="true">
            <div className="confirm-body">
              <p>
                Restoring the backup from <strong>{closing}</strong>.
              </p>
              <p>
                {import.meta.env.DEV
                  ? "Cibo will close in a moment — start it again and the restored data will be in place."
                  : "Cibo will restart in a moment to finish the restore."}
              </p>
            </div>
          </div>
        </div>
      )}

      {confirming != null && (
        <DangerConfirm
          title={`Restore the backup from ${confirming.id}?`}
          body={
            <>
              This replaces <strong>all current data</strong> with the backup from{" "}
              <strong>{confirming.id}</strong>. A safety copy of the current data is made first,
              and the app restarts to complete the swap.
            </>
          }
          confirmLabel={`Restore ${confirming.id}`}
          onConfirm={() => restore(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
