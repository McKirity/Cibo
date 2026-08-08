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
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DevMark } from "./SettingsScreen";
import { showErrorToast } from "../shell/toast";
import { inTauri } from "./deviceStore";
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
    </div>
  );
}
