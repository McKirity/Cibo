/**
 * THE APP BOOTSTRAP — everything that used to be main.tsx. main.tsx is now a
 * shim that awaits the per-device settings file (settings/deviceStore) and
 * THEN imports this module, so every synchronous settings read below — and the
 * timer store's module-scope crash detection — sees a primed cache. Nothing
 * else moved; the import order in here is still load-bearing (see the
 * decoration.css note).
 */
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { NonEmptyString100 } from "@evolu/common";
import { EvoluProvider } from "@evolu/react";
// The bundled Default's dials, imported statically from the bundled package so
// there is no second copy to drift. Since step 6a this is the ULTIMATE FALLBACK
// layer, not a stand-in: the theme loader (src/theme/loader.ts) injects the
// picked theme's sheet AFTER every bundled stylesheet, so a missing, partial,
// or broken theme always degrades to these values (the Default never retires).
import "../src-tauri/resources/themes/Default (neutral light)/theme.css";
import "./kit.css";
import { initTheme } from "./theme/loader";
import { applyDerivedDials } from "./theme/derived";
import { initCompact } from "./theme/compact";
import { initDecoration } from "./theme/decoration";
import { initScrollReveal } from "./shell/scrollReveal";
import { initLocalSettings } from "./settings/local";
import { initSyncedSettings } from "./settings/store";
import { initCustomColours } from "./settings/customColours";
import { initCuration } from "./settings/curation";
import { initGlobalLadders } from "./settings/ladderStore";
import App from "./App";
// AFTER the App import on purpose: the role → kit-target decoration wiring
// must follow every screen sheet in the bundle so its attachments win the
// cascade (inert until a manifest publishes --deco-* properties).
import "./theme/decoration.css";
// AFTER decoration.css: the small-canvas LAYOUT LAYER (Phase 2 step 4 —
// superseding theme/compact.css, deleted). Per-screen small-window rulings;
// every rule is `:root.compact`-prefixed so bundle order can never decide a
// tie against a base sheet. See its header for the base-sheet model.
import "./small.css";
import { evolu } from "./db/evolu";
import { clearRestorePending, isRestorePending } from "./db/sync";
import { ensureHabitIcons, ensureSleepMedLabel, runSeed, SEED_VERSION } from "./db/seed";
import { ensureAppStartDate } from "./db/appStart";
import { initWhimsyConfig } from "./daily/whimsyConfig";
import { isFirstRunPending } from "./firstrun/firstRun";
import { FirstRunSetup } from "./firstrun/FirstRunSetup";
import { mountFatalLaunch } from "./shell/FatalLaunch";
import { showErrorToast } from "./shell/toast";
import { backupsRunHere, launchStaleCheck } from "./backup/backup";
import { launchUpdateCheck } from "./shell/updater";
import { runDoctorAtLaunch } from "./db/doctor";
import { takeRestoreResult } from "./backup/restore";

// Failure tier ④ trigger — the BOOT WINDOW: an Evolu error before the seed
// path completes means the store never opened (worker/OPFS init), which is the
// fatal launch screen's one tenant. After boot, errors are validation drops /
// worker rollbacks — logged (the 2026-07-23 coding-migration lesson) and
// surfaced as tier 3 (the error toast); they must never unmount the shell.
// The ramp-complement dials derive from the static Default immediately (the
// loader re-derives after any theme apply) — use-sites var() them from frame 1.
applyDerivedDials();
// The theme layer's initTheme moved into the BOOT GATE (step 15): the setup
// screen is Default-only by rule, so the picked theme applies at the gate's
// shell resolution (or at first-run's Finish), never before. On a normal
// launch that is moments after the seed check — the Default paints first
// either way (only a non-Default pick ever re-paints), and a loader failure
// stays logged, never a gate.
// Compact — the density lever's root class; auto keys off window width.
initCompact();
// Decoration — reads the theme's decoration/manifest.json (inert while the
// bundled pair is art-free; job 2 of the 2026-07-20 split).
initDecoration();
// Scrollbars — the while-scrolling half of the overlay-minimal reveal (the
// hover half is pure CSS in kit.css § Scrollbars). One capture-phase listener
// for the whole page; safe before the shell mounts.
initScrollReveal();
// Settings (step 10) — the per-device levers re-apply (reduce-effects · UI
// scale · force-opaque · banner fade) and the synced-settings cache primes
// (wave gap · list cap · day cutoff readers outside React).
initLocalSettings();
initSyncedSettings();
// Custom habit colours (the 12-slot palette's overflow) publish as root vars
// so the 43 `var(--slot)` render sites work unchanged — settings/customColours.
initCustomColours();
// Palette curation + the global milestone ladders — both synced settings read
// synchronously by surfaces that cannot await (settings/curation · ladderStore).
initCuration();
initGlobalLadders();

let booted = false;
/** Sync error types already announced — a relay retry loop must not toast per attempt. */
const syncErrorsShown = new Set<string>();
evolu.subscribeError(() => {
  const err = evolu.getError();
  console.error("Evolu error:", err);
  // The object above collapses in DevTools; this line is copy-pasteable.
  // (try/catch — a JSON cycle must not kill the handler.)
  try {
    console.error("Evolu error (text):", JSON.stringify(err, null, 2));
  } catch {
    console.error("Evolu error (text):", String(err));
  }
  // SYNC errors are their own lane (Phase 2 step 3 Track B, finding sync-2):
  // every Protocol* type comes from the relay conversation, where local data is
  // already safe — the write-failed wording below would claim data loss that
  // did not happen, and the fatal tier would declare the app unlaunchable over
  // a courier problem. Toast once per type per session (retries repeat fast).
  const type =
    typeof err === "object" && err != null && "type" in err
      ? String((err as { type: unknown }).type)
      : "";
  if (type.startsWith("Protocol")) {
    if (booted && !syncErrorsShown.has(type)) {
      syncErrorsShown.add(type);
      showErrorToast(
        type === "ProtocolQuotaError"
          ? "The sync relay is out of room — syncing is paused. Everything on this device is safe."
          : "Sync hit a problem — everything on this device is safe, and syncing will retry.",
        "Sync",
      );
    }
    return;
  }
  if (!booted) mountFatalLaunch(err);
  else
    showErrorToast(
      "A background data write failed — the last change may not have saved.",
      "Database",
    );
});

// THE BOOT GATE (step 15): resolves to what the root should render — the
// first-run setup screen (no `first_run_complete` flag; a store wipe re-arms
// it by construction) or the shell. It also awaits the whimsy cache prime,
// which is what keeps `loadWhimsyConfig`'s sync reads honest for every
// consumer the shell can mount. Never rejects: a seed failure mounts the
// fatal screen OVER the (blank) root instead.
let resolveGate!: (mode: "setup" | "shell") => void;
const bootGate = new Promise<"setup" | "shell">((r) => (resolveGate = r));

/**
 * The restore-delivery wait (finding sync-3): the launch after `restoreAppOwner`
 * finds an EMPTY store whose owner's real data is still arriving from the
 * relay. Seeding that store doubles every seeded row, so when the restore door
 * left its note we wait for the relay's `seed_version` row instead — any real
 * store carries one, so its arrival is the "delivery has begun" signal (runSeed
 * afterwards is then a no-op, or a legitimate migration of an older store).
 *
 * The cap exists for the honest failure: a relay that is down, or a
 * valid-but-empty phrase. ⚠ ON TIMEOUT WE NO LONGER PROCEED AS A FRESH STORE
 * (changed 2026-08-16 — the old behaviour seeded and doubled every row three
 * times in one evening): the caller halts on `false` and mounts
 * `mountRestoreBlocked`. A long wait with no words reads as a dead app, so the
 * wait wears a notice (pre-theme by nature, like the fatal screen — inline
 * styles only).
 */
async function awaitRestoreDelivery(): Promise<boolean> {
  const CAP_MS = 90_000;
  const POLL_MS = 500;
  const metaQuery = evolu.createQuery((db) =>
    db
      .selectFrom("app_meta")
      .select(["id"])
      .where("key", "=", NonEmptyString100.orThrow("seed_version"))
      .where("isDeleted", "is not", 1),
  );
  const notice = document.createElement("div");
  notice.style.cssText =
    "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;" +
    "background:#f4f4f6;color:#333;font:15px system-ui,sans-serif;z-index:9999";
  notice.textContent = "Restoring your data from sync…";
  document.body.appendChild(notice);
  try {
    const start = Date.now();
    while (Date.now() - start < CAP_MS) {
      if ((await evolu.loadQuery(metaQuery)).length > 0) return true;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    return false;
  } finally {
    notice.remove();
  }
}

/**
 * THE BLOCKED RESTORE (Phase 2 step 4, 2026-08-16) — what a failed delivery
 * gets INSTEAD of a seed.
 *
 * Until today the timeout fell through to `runSeed` with a console warning
 * predicting the consequence, and the consequence duly arrived: the seed plants
 * 11 fresh-id habits into a store whose owner's real rows are still in flight,
 * the relay delivers them, and CRDT merge keeps BOTH — sync-3's doubling, by
 * the very path the flag exists to prevent. Reproduced three times in one
 * evening: once with the relay down, twice with a healthy network, losing to
 * Evolu's reconnect backoff outrunning the 90s cap.
 *
 * ⚠ THE OLD FALLBACK WAS THE WORST AVAILABLE ONE. An empty store with no
 * `first_run_complete` renders the FIRST-RUN screen — indistinguishable from
 * total data loss to the person looking at it, while being the exact path that
 * mints the duplicate seed. It fails open, loudly, into the failure.
 *
 * So: fail CLOSED and say so. The flag stays armed (the next launch retries by
 * construction), nothing is written, and the screen states the one fact that
 * matters — the data is safe elsewhere.
 *
 * ⚠ THE SECOND DOOR IS NOT OPTIONAL. A valid phrase for an identity that
 * genuinely has no data yet can never satisfy the wait, so a retry-only screen
 * would strand that user forever. "Start fresh" is the old behaviour, kept —
 * but as a CHOICE someone makes, not a default that fires on a timeout.
 *
 * Pre-theme by nature like the wait notice and the fatal screen: raw DOM,
 * inline styles, no dials.
 */
function mountRestoreBlocked(): void {
  const wrap = document.createElement("div");
  wrap.style.cssText =
    "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;" +
    "background:#f4f4f6;color:#333;font:15px system-ui,sans-serif;z-index:9999;padding:24px";
  const box = document.createElement("div");
  box.style.cssText = "max-width:460px;text-align:center;line-height:1.5";

  const h = document.createElement("p");
  h.style.cssText = "font-size:17px;font-weight:600;margin:0 0 12px";
  h.textContent = "Couldn't reach your sync relay";

  const b = document.createElement("p");
  b.style.cssText = "margin:0 0 20px";
  b.textContent =
    "Your data is safe — it lives on your other device and on the relay. " +
    "Nothing on this device has been changed. Cibo will finish restoring as " +
    "soon as it can connect.";

  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:10px;justify-content:center";

  const retry = document.createElement("button");
  retry.style.cssText =
    "font:inherit;padding:8px 16px;border-radius:6px;border:1px solid #999;background:#fff;cursor:pointer";
  retry.textContent = "Try again";
  // A reload is a fresh process, so Evolu's reconnect backoff starts clean —
  // which is the whole difference for the failure mode that had a working
  // network and simply wasn't due to retry yet.
  retry.onclick = () => location.reload();

  const fresh = document.createElement("button");
  fresh.style.cssText =
    "font:inherit;padding:8px 16px;border-radius:6px;border:1px solid transparent;background:none;cursor:pointer;color:#666";
  fresh.textContent = "Start fresh on this device";
  fresh.onclick = () => {
    clearRestorePending();
    location.reload();
  };

  const note = document.createElement("p");
  note.style.cssText = "margin:16px 0 0;font-size:13px;color:#777";
  note.textContent =
    "Start fresh only if this recovery phrase has no data yet — it sets this " +
    "device up as a new, empty store.";

  row.append(retry, fresh);
  box.append(h, b, row, note);
  wrap.append(box);
  document.body.appendChild(wrap);
}

// The version-gated seed append — runs at every launch, applies only newer
// batches. The app's start date is established AFTER it, so a fresh install's
// backfill can see batch 1's rows (appStart.ts). A pending restore holds the
// seed until the relay delivers (above) — the one launch where "empty store"
// does not mean "fresh store".
const bootSeed = async () => {
  if (isRestorePending()) {
    const delivered = await awaitRestoreDelivery();
    if (!delivered) {
      // ⚠ The flag is deliberately NOT cleared and the seed deliberately NOT
      // run: clearing it here is what disarmed the guard in exactly the
      // situation it exists for. Halt, keep the store empty, let the person
      // choose (mountRestoreBlocked).
      console.warn(
        "Restore: nothing arrived from the relay within 90s — holding. The store stays " +
          "empty and the pending flag stays set, so the next launch retries. Seeding here " +
          "is what doubles every row when the relay comes back (sync-3).",
      );
      mountRestoreBlocked();
      return null;
    }
    clearRestorePending();
    console.info(`Restore: relay delivery detected (seed_version present; gate ${SEED_VERSION})`);
  }
  return runSeed(evolu);
};

bootSeed().then(
  async (r) => {
    // null = the restore hold blocked the boot; its own screen is mounted and
    // the root stays blank. Nothing below may run: the gate must NOT resolve
    // (a resolved gate renders first-run over an empty store, which is the
    // face this whole change exists to stop showing).
    if (r === null) return;
    booted = true;
    console.info(
      `Seed: found version ${r.foundVersion}, ${r.applied ? "applied batch(es)" : "nothing to apply"}`,
    );
    // The gate's two awaited reads (both tiny), then the render decision. The
    // picked theme applies only on the shell path — the setup screen stays on
    // the static Default by rule.
    const pending = await isFirstRunPending();
    await initWhimsyConfig();
    if (!pending) void initTheme();
    resolveGate(pending ? "setup" : "shell");
    void ensureAppStartDate(evolu);
    // The icon plant is an always-run reconciler, NOT gate-trusted: the gate
    // latched twice over transactions lost to mid-session reloads (batches
    // 7 and 9). Idempotent null-fill → a lost write heals next launch.
    void ensureHabitIcons(evolu);
    // Same reasoning, same shape (2026-08-07): Sleep's flag label feeds the
    // donut header AND its subtitle, so a rename that latches without landing
    // shows as "Nights I med" — visibly wrong, but only on one panel.
    void ensureSleepMedLabel(evolu, "launch");
    // Backups (step 12): the launch half — a failed restore surfaces (tier 3;
    // a SUCCESSFUL restore needs no toast: the restored data is the message),
    // then the ~7-day stale-check (crashes never fire the close hook).
    // THE MAC CRADLE-KILL (PC-only backups, 2026-08-16): on macOS neither
    // call is made — no backup machinery runs there at all, ever.
    if (backupsRunHere()) {
      void takeRestoreResult().then((r) => {
        if (r != null && !r.ok)
          showErrorToast(`Restore failed — ${r.detail}. The previous data is still in place.`, "Backups");
      });
      launchStaleCheck();
    }
    // Auto-update (step 5): silent check + download, deferred past the
    // stale-check's window; the install waits for the quit (closeGuard).
    launchUpdateCheck();
    // The Data Doctor's launch pass (step 13) — the DB tier only, feeding the
    // rail glance-dot. Ruled: "evaluated on app launch and re-checked when the
    // surface opens; cheap at personal scale, no background polling." It runs
    // AFTER the seed on purpose — checking vocabulary against lists a seed
    // batch is still planting would report every seeded row as unknown.
    runDoctorAtLaunch();
  },
  (e) => {
    console.error("Seed failed:", e);
    // a launch that cannot seed cannot trust the store — tier ④
    mountFatalLaunch(e);
  },
);

/**
 * The root: blank (window-background) until the gate resolves, then the setup
 * screen or the shell. First-run's Finish applies the picked theme (a fresh
 * store has none — the Default stands) and swaps to the shell in place; the
 * next launch takes the shell path directly.
 */
function Boot() {
  const [mode, setMode] = useState<"wait" | "setup" | "shell">("wait");
  useEffect(() => {
    let live = true;
    void bootGate.then((m) => {
      if (live) setMode(m);
    });
    return () => {
      live = false;
    };
  }, []);
  if (mode === "wait") return null;
  if (mode === "setup")
    return (
      <FirstRunSetup
        onDone={() => {
          void initTheme();
          setMode("shell");
        }}
      />
    );
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <EvoluProvider value={evolu}>
      <Boot />
    </EvoluProvider>
  </React.StrictMode>,
);
