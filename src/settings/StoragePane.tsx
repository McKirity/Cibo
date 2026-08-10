/**
 * SETTINGS → STORAGE (Build step 14) — the ONE cloud-root picker
 * ([[Storage & Filesystem Layout]]): one user-chosen folder inside the cloud
 * drive; the app owns `backups/` · `images/` · `themes/` inside it. One
 * picker, one validation, one health destination — ruled over independent
 * per-feature pickers, which is why the Backups and Appearance stand-ins
 * retired the day this pane went live.
 *
 * · The picked folder IS the root — no magic folder creation above or below
 *   it; the three subfolders are made on pick (and on first use regardless).
 * · Validation is SOFT, never a gate: a missing folder pauses backups and
 *   images/themes until it returns (a cloud drive can lag), stated in place.
 * · `recursive: true` on the dialog is LOAD-BEARING (the 6a lesson): without
 *   it the fs grant covers the folder but not its contents, and every scan
 *   inside silently lists nothing. The grant persists across launches via
 *   tauri-plugin-persisted-scope.
 *
 * SYNC lives here too (Phase 2 step 3 Track B, 2026-08-09) — the pane's second
 * tenant, because Storage is where "what moves between devices" already lives:
 * the cloud root moves the FILES (images · themes · backups), Evolu's relay
 * moves the DATABASE. The switch (per-device, next-launch), the recovery
 * phrase (the owner mnemonic the MacBook will need), and the restore door
 * (destructive, danger-confirmed) — see src/db/sync.ts for the flag's rules.
 */
import { useEffect, useState } from "react";
import { Mnemonic } from "@evolu/common";
import { invoke } from "@tauri-apps/api/core";
import { DevMark } from "./SettingsScreen";
import { DangerConfirm } from "../shell/DangerConfirm";
import { showErrorToast, showInfoToast } from "../shell/toast";
import { inTauri } from "./deviceStore";
import { evolu } from "../db/evolu";
import { isSyncEnabled, setRestorePending, setSyncEnabled, syncActiveThisSession } from "../db/sync";
import { cloudSub, getCloudRoot, setCloudRoot, underRoot } from "./cloudRoot";

/** What each app-owned subfolder is for — the pane's explanatory rows. */
const SUBS: { key: "backups" | "images" | "themes"; blurb: string }[] = [
  { key: "backups", blurb: "written on every clean close + the weekly stale-check" },
  { key: "images", blurb: "cover art and banners, one subfolder per habit" },
  { key: "themes", blurb: "drop a theme folder in — that is the whole install step" },
];

export function StoragePane() {
  const [root, setRoot] = useState(getCloudRoot());
  /** Soft validation: null = unchecked/unset, else does the folder exist? */
  const [present, setPresent] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    if (root == null || !inTauri()) {
      setPresent(null);
      return;
    }
    void (async () => {
      try {
        const fs = await import("@tauri-apps/plugin-fs");
        const ok = await fs.exists(root);
        if (live) setPresent(ok);
      } catch {
        if (live) setPresent(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [root]);

  const pick = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({
        directory: true,
        recursive: true,
        title: "Pick the Cibo cloud folder",
      });
      if (typeof dir !== "string") return;
      setCloudRoot(dir);
      setRoot(dir);
      // The app-owned layout, minted up front so the folder explains itself.
      for (const s of SUBS) {
        try {
          await invoke("bk_mkdirs", { dir: underRoot(dir, s.key) });
        } catch (e) {
          console.warn(`Storage: could not create ${s.key}/ (made on first use instead)`, e);
        }
      }
    } catch (e) {
      showErrorToast(`Folder pick failed — ${e instanceof Error ? e.message : String(e)}`, "Storage");
    }
  };

  const reveal = () => {
    if (root != null) void invoke("bk_reveal", { path: root });
  };

  return (
    <div className="hscroll">
      <div className="ctrlstack">
        <div className="crow two">
          <span className="clabel">Cloud root</span>
          <DevMark />
          <span className="cright">
            <span className={`field${root == null ? " none" : ""}`}>{root ?? "not set"}</span>
            <button className="btn-plain btn-sm" onClick={() => void pick()}>
              {root == null ? "Pick a folder…" : "Change…"}
            </button>
            {root != null && (
              <button className="btn-plain btn-sm" onClick={reveal}>
                Open
              </button>
            )}
          </span>
        </div>
      </div>

      {root == null ? (
        <p className="vnote">
          No cloud root set — backups are paused, imported cover art has nowhere to land, and
          drop-in themes are absent (the bundled themes still work). Pick one folder inside your
          cloud drive; Cibo keeps everything that syncs between devices in it.
        </p>
      ) : present === false ? (
        <p className="vnote">
          The folder is not on this device right now — backups pause and images and drop-in themes
          are unavailable until it returns. If the cloud drive is still syncing, this resolves by
          itself.
        </p>
      ) : (
        <div className="hgroup">
          <p className="hglbl">Inside the root</p>
          <div className="mlist">
            {SUBS.map((s) => (
              <div className="mrow" key={s.key}>
                <span className="mid">
                  <span className="field">{cloudSub(s.key)}</span>
                </span>
                <span className="macts">
                  <span className="mgtag">{s.blurb}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <SyncSection />
    </div>
  );
}

/**
 * Sync between devices — the switch, the recovery phrase, the restore door.
 * The cloud root above moves files; this moves the database (Evolu → the
 * relay, end-to-end encrypted with the phrase below).
 */
function SyncSection() {
  const [on, setOn] = useState(isSyncEnabled());
  const [phrase, setPhrase] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreIn, setRestoreIn] = useState("");
  const [restoreErr, setRestoreErr] = useState<string | null>(null);
  /** A validated mnemonic waiting on the danger confirm. */
  const [pending, setPending] = useState<Mnemonic | null>(null);

  useEffect(() => {
    let live = true;
    void evolu.appOwner.then((o) => {
      if (live) setPhrase(o.mnemonic ?? null);
    });
    return () => {
      live = false;
    };
  }, []);

  const flip = (next: boolean) => {
    setSyncEnabled(next);
    setOn(next);
  };

  const copy = async () => {
    if (phrase == null) return;
    try {
      await navigator.clipboard.writeText(phrase);
      showInfoToast("Recovery phrase copied.");
    } catch {
      showErrorToast("Couldn't reach the clipboard — select the words and copy them by hand.", "Sync");
    }
  };

  const submitRestore = () => {
    const parsed = Mnemonic.from(restoreIn.trim());
    if (!parsed.ok) {
      setRestoreErr("That isn't a valid recovery phrase — it should be 12 lowercase words.");
      return;
    }
    setRestoreErr(null);
    setPending(parsed.value);
  };

  const runRestore = () => {
    const m = pending;
    setPending(null);
    setRestoreOpen(false);
    if (m == null) return;
    // The restore-pending note (sync-3): the NEXT boot finds an empty store
    // whose owner has data in flight from the relay — it must wait for that
    // delivery instead of seeding, or every seeded row doubles. Set BEFORE the
    // reset so a crash mid-restore still waits (a false positive costs nothing:
    // a store with local data satisfies the wait instantly).
    setRestorePending();
    // Resets this device's store to the entered identity and restarts the app;
    // the relay then delivers that identity's data.
    void evolu.restoreAppOwner(m);
  };

  return (
    <div className="hgroup">
      <p className="hglbl">Sync between devices</p>
      <div className="ctrlstack">
        <div className="crow">
          <span className="clabel">Sync</span>
          <DevMark />
          <span className="cright">
            <div className="segctl">
              <button aria-pressed={on} onClick={() => flip(true)}>
                On
              </button>
              <button aria-pressed={!on} onClick={() => flip(false)}>
                Off
              </button>
            </div>
          </span>
        </div>

        <div className="crow two">
          <span className="clabel">
            Recovery phrase
            <span className="mgtag">the key to your synced data</span>
          </span>
          <span className="cright">
            <button className="btn-plain btn-sm" onClick={() => setRevealed((r) => !r)}>
              {revealed ? "Hide" : "Reveal"}
            </button>
            {revealed && phrase != null && (
              <button className="btn-plain btn-sm" onClick={() => void copy()}>
                Copy
              </button>
            )}
          </span>
        </div>

        {revealed && (
          <p className="vnote">
            {phrase != null ? (
              <span className="field">{phrase}</span>
            ) : (
              "The phrase isn't available on this device."
            )}
          </p>
        )}

        <div className="crow two">
          <span className="clabel">
            Restore from a phrase
            <span className="mgtag">replaces everything on this device</span>
          </span>
          <span className="cright">
            {restoreOpen ? (
              <>
                <input
                  className="keyin"
                  value={restoreIn}
                  onChange={(e) => setRestoreIn(e.target.value)}
                  placeholder="the 12 words, separated by spaces"
                  spellCheck={false}
                  autoFocus
                />
                <button className="btn-plain btn-sm" onClick={submitRestore} disabled={restoreIn.trim() === ""}>
                  Restore
                </button>
                <button
                  className="btn-plain btn-sm"
                  onClick={() => {
                    setRestoreOpen(false);
                    setRestoreIn("");
                    setRestoreErr(null);
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button className="btn-plain btn-sm" onClick={() => setRestoreOpen(true)} disabled={!syncActiveThisSession}>
                Restore…
              </button>
            )}
          </span>
        </div>
        {restoreErr != null && <p className="vnote">{restoreErr}</p>}
      </div>

      {on !== syncActiveThisSession && (
        <p className="vnote">The change takes effect the next time Cibo starts.</p>
      )}
      <p className="vnote">
        The folder above carries the files (covers, themes, backups); sync carries the database —
        habits, sessions, entries and synced settings — through an encrypted relay. To link another
        device, install Cibo there and enter this device's recovery phrase under Restore. Keep the
        phrase somewhere safe: it is the only way back into your data on a new machine.
        {!syncActiveThisSession && " Restore needs sync to be on (and the app restarted) first."}
      </p>

      {pending != null && (
        <DangerConfirm
          title="Replace this device's data?"
          body={
            <>
              Everything Cibo holds on this device will be <strong>deleted</strong> and replaced by
              the data belonging to the phrase you entered, pulled from the sync relay. The app
              restarts to do it. This cannot be undone on this device.
            </>
          }
          confirmLabel="Replace and restore"
          onConfirm={runRestore}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
