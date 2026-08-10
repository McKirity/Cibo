/**
 * SETTINGS → BACKUPS (Build step 12) — status · Back up now · the retention
 * dials (built 2026-08-06, the Phase-2 audit's ruling) · the slot list ·
 * restore. Owning record: [[Backups & Export]].
 *
 * The rules this pane wears on its face:
 * · Restore is offered ONLY for slots that still carry the store-directory
 *   copy; a pruned slot renders as READABLE, NOT RESTORABLE and names the
 *   manual path — the UI must never advertise a restore it can't do.
 * · The restore confirm CARRIES THE DATE ("replaces ALL current data with the
 *   backup from <date>"); a safety copy is taken first, and the app restarts —
 *   the swap needs the store closed, so restore is a relaunch by construction.
 * · Unset root = backups PAUSE, never a gate. The folder DERIVES from step
 *   14's one cloud root (`<cloud root>/backups`); Settings → Storage owns the
 *   pick — the stand-in picker this pane carried is retired.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@evolu/react";
import { Ico, ICONS } from "../shell/icons";
import { DangerConfirm } from "../shell/DangerConfirm";
import {
  BACKUP_DAILY_DAYS_KEY,
  clampBackupDailyDays,
  syncedSettingsQuery,
  writeSyncedSetting,
} from "./store";
import {
  BACKUP_EVENT,
  backupRunning,
  getBackupsRoot,
  listSlots,
  readBackupRecord,
  revealBackupsFolder,
  revealSlot,
  runBackup,
  type Slot,
} from "../backup/backup";
import { CLOUD_ROOT_EVENT } from "./cloudRoot";
import { syncActiveThisSession } from "../db/sync";
import { requestRestore } from "../backup/restore";
import { showErrorToast } from "../shell/toast";
import { relLabel } from "../metrics/format";

/* relTime was a re-implementation of metrics/format.relLabel — adopted
   2026-08-04. One copy-visible change: the shared form pluralises the minute
   bucket ("5 mins ago"), matching the palette's recents list. */
const relTime = (iso: string): string => relLabel(new Date(iso).getTime());

export function BackupsPane() {
  const settingRows = useQuery(syncedSettingsQuery);
  const [root, setRoot] = useState(getBackupsRoot());
  const [record, setRecord] = useState(readBackupRecord());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busy, setBusy] = useState(backupRunning());
  const [confirming, setConfirming] = useState<Slot | null>(null);
  /** Restore armed — the app is about to close/restart; this narrates it. */
  const [closing, setClosing] = useState<string | null>(null);

  const refresh = () => {
    setRoot(getBackupsRoot());
    setRecord(readBackupRecord());
    setBusy(backupRunning());
    void listSlots().then(setSlots, () => setSlots([]));
  };
  useEffect(() => {
    refresh();
    window.addEventListener(BACKUP_EVENT, refresh);
    window.addEventListener(CLOUD_ROOT_EVENT, refresh);
    return () => {
      window.removeEventListener(BACKUP_EVENT, refresh);
      window.removeEventListener(CLOUD_ROOT_EVENT, refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backupNow = () => {
    setBusy(true);
    void runBackup("manual").finally(refresh);
  };

  // The daily-window retention dial (drawn on the frozen pane; built
  // 2026-08-06 at the Phase-2 audit's ruling). Synced app_meta, the
  // autosave-interval shape; the prune in backup/backup.ts reads it through
  // the settings cache, so an unset row keeps the standing 90-day behavior.
  const dailyRow = settingRows.find((r) => String(r.key) === BACKUP_DAILY_DAYS_KEY);
  // Raw value straight into the clamp — a `Number()` pre-coercion turns a
  // blank row into 0, defeating the blank-is-unreadable guard (`settings-2`).
  const dailyDays = clampBackupDailyDays(dailyRow?.value);
  const stepDaily = (dir: -1 | 1) =>
    writeSyncedSetting(settingRows, BACKUP_DAILY_DAYS_KEY, String(clampBackupDailyDays(dailyDays + dir)));

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
            <span className={`field${root == null ? " none" : ""}`}>
              {root ?? "set the cloud root in Settings → Storage"}
            </span>
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
        {/* the retention dials — the drawn pair: a Daily-window stepper +
            the Monthly-keepers row (drawn informational: one per month,
            kept forever — the promotion is automatic, not a setting) */}
        <div className="crow two">
          <span className="clabel">Daily window</span>
          <span className="cright">
            <span className="stepper">
              <button className="stepbtn" data-tip="Decrease" onClick={() => stepDaily(-1)}>
                <Ico d={["M5 12h14"]} />
              </button>
              <span className="stepval">{dailyDays} days</span>
              <button className="stepbtn" data-tip="Increase" onClick={() => stepDaily(1)}>
                <Ico d={ICONS.plus} />
              </button>
            </span>
          </span>
        </div>
        <div className="crow two">
          <span className="clabel">Monthly keepers</span>
          <span className="cright">
            <span className="mgtag">One per month · kept forever</span>
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
              ? "Backups are paused — set the cloud root in Settings → Storage and the first backup writes on the next close."
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
                  {!s.hasStore && (
                    <span className="mgtag">readable in a SQLite tool or spreadsheet</span>
                  )}
                  {/* Every slot gets the files door (user-asked 2026-08-09) —
                      the export rides every slot forever, so it always lands. */}
                  <button className="btn-plain btn-sm" onClick={() => void revealSlot(s.id)}>
                    Show files
                  </button>
                  {s.hasStore && (
                    <button className="btn-plain btn-sm" onClick={() => setConfirming(s)}>
                      Restore…
                    </button>
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
              {syncActiveThisSession && (
                <>
                  {" "}
                  <strong>Sync is on</strong> — the sync relay still remembers everything newer
                  than this backup and will bring it back unless its storage is cleared first
                  (the rewind recipe is in the relay folder&apos;s README).
                </>
              )}
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
