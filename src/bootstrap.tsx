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
import { EvoluProvider } from "@evolu/react";
// The bundled Default's dials, imported statically from the bundled package so
// there is no second copy to drift. Since step 6a this is the ULTIMATE FALLBACK
// layer, not a stand-in: the theme loader (src/theme/loader.ts) injects the
// picked theme's sheet AFTER every bundled stylesheet, so a missing, partial,
// or broken theme always degrades to these values (the Default never retires).
import "../src-tauri/resources/themes/Default (neutral light)/theme.css";
import "./kit.css";
// The one sanctioned value file outside the theme sheets (user-ruled
// 2026-07-31): compact's density re-values — see its header.
import "./theme/compact.css";
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
import { evolu } from "./db/evolu";
import { ensureHabitIcons, ensureSleepMedLabel, runSeed } from "./db/seed";
import { ensureAppStartDate } from "./db/appStart";
import { initWhimsyConfig } from "./daily/whimsyConfig";
import { isFirstRunPending } from "./firstrun/firstRun";
import { FirstRunSetup } from "./firstrun/FirstRunSetup";
import { mountFatalLaunch } from "./shell/FatalLaunch";
import { showErrorToast } from "./shell/toast";
import { launchStaleCheck } from "./backup/backup";
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
evolu.subscribeError(() => {
  const err = evolu.getError();
  console.error("Evolu error:", err);
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

// The version-gated seed append — runs at every launch, applies only newer batches.
// The app's start date is established AFTER it, so a fresh install's backfill can
// see batch 1's rows (appStart.ts).
runSeed(evolu).then(
  async (r) => {
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
    void takeRestoreResult().then((r) => {
      if (r != null && !r.ok)
        showErrorToast(`Restore failed — ${r.detail}. The previous data is still in place.`, "Backups");
    });
    launchStaleCheck();
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
