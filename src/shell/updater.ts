/**
 * AUTO-UPDATE (Phase 2 step 5) — the JS orchestration over
 * tauri-plugin-updater, in the ruled shape ([[Auto-Update]] `Complete`):
 * SILENT · LAUNCH-CHECK · INSTALL-ON-QUIT · stable-only · no rollback.
 *
 * The split: launch → check + download in the background, hold the result;
 * quit → install what was downloaded (closeGuard calls in after the backup).
 * Nothing is announced — an update is not news, it is maintenance. The one
 * talking door is the palette's "Check for updates" verb (checkUpdatesNow),
 * which exists precisely to answer a human who asked.
 *
 * Failure is SILENT at launch by design (an offline launch is ordinary life —
 * the sync-2 lesson; a toast per failed check would nag every cold open on a
 * train). The manual verb DOES surface errors: the user asked, so the answer
 * must be honest.
 *
 * Endpoint + pubkey live in tauri.conf.json (plugins.updater); the fetch runs
 * RUST-side, so the webview CSP needs no GitHub entries. `updater:default`
 * is granted in capabilities/default.json — added WITH the feature, per the
 * standing capability lesson (the code reads perfectly while a missing grant
 * fails silently), and a capability change needs a full Rust rebuild.
 *
 * PROD-only: a dev build has no meaningful version to compare and no bundle
 * to patch; check() against a real release would try to "update" the dev app.
 */
import { check, type Update } from "@tauri-apps/plugin-updater";
import { inTauri } from "../settings/deviceStore";
import { showErrorToast, showInfoToast } from "./toast";

/** A checked-and-downloaded update, waiting for the quit to install it. */
let pending: Update | null = null;
let downloaded = false;

export const hasPendingUpdate = (): boolean => pending != null && downloaded;

const updatable = (): boolean => inTauri() && import.meta.env.PROD;

/**
 * The launch check — deferred so the cold-open budget stays Daily's (the
 * stale-check's own pattern, a beat later so the two never contend for the
 * first quiet seconds).
 */
export function launchUpdateCheck(): void {
  if (!updatable()) return;
  window.setTimeout(() => {
    void (async () => {
      try {
        const u = await check();
        if (u == null) return; // up to date — silence is the message
        await u.download();
        pending = u;
        downloaded = true;
      } catch (e) {
        // Silent by design; the console line is for a debugging human only.
        console.warn("update check failed:", e);
      }
    })();
  }, 8_000);
}

/**
 * The quit half — closeGuard calls this after the backup, before the window
 * dies. On Windows install() hands off to the installer and may end the
 * process itself; the caller's quitNow() after us is then a no-op. A failure
 * here must never trap the quit — the next launch simply checks again.
 */
export async function installPendingUpdate(): Promise<void> {
  if (!hasPendingUpdate() || pending == null) return;
  try {
    await pending.install();
  } catch (e) {
    console.warn("update install failed:", e);
  }
}

/**
 * The palette verb's door — the one loud path. Info toasts for the ordinary
 * answers (the ratified quiet face), an error toast when the asked-for check
 * genuinely failed.
 */
export async function checkUpdatesNow(): Promise<void> {
  if (!inTauri()) {
    showInfoToast("Updates need the app shell (not the browser dev server).");
    return;
  }
  if (!import.meta.env.PROD) {
    showInfoToast("Updates only run in the installed app — the dev server has nothing to update.");
    return;
  }
  try {
    const u = await check();
    if (u == null) {
      showInfoToast("Cibo is up to date.");
      return;
    }
    if (!downloaded) {
      showInfoToast(`Downloading ${u.version}…`);
      await u.download();
      pending = u;
      downloaded = true;
    }
    showInfoToast(`Update ${u.version} is ready — it installs when you quit.`);
  } catch (e) {
    showErrorToast(
      `Update check failed — ${e instanceof Error ? e.message : String(e)}`,
      "Updates",
    );
  }
}
