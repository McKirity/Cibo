import React from "react";
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
import { ensureHabitIcons, runSeed } from "./db/seed";
import { ensureAppStartDate } from "./db/appStart";
import { mountFatalLaunch } from "./shell/FatalLaunch";
import { showErrorToast } from "./shell/toast";

// Failure tier ④ trigger — the BOOT WINDOW: an Evolu error before the seed
// path completes means the store never opened (worker/OPFS init), which is the
// fatal launch screen's one tenant. After boot, errors are validation drops /
// worker rollbacks — logged (the 2026-07-23 coding-migration lesson) and
// surfaced as tier 3 (the error toast); they must never unmount the shell.
// The ramp-complement dials derive from the static Default immediately (the
// loader re-derives after any theme apply) — use-sites var() them from frame 1.
applyDerivedDials();
// The theme layer applies the per-device pick over the static Default. Fire and
// forget: a slow scan just means the Default paints first (only a non-Default
// pick ever re-paints), and a loader failure is logged, never a gate.
void initTheme();
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

// The version-gated seed append — runs at every launch, applies only newer batches.
// The app's start date is established AFTER it, so a fresh install's backfill can
// see batch 1's rows (appStart.ts). First-run setup (step 15) owns the write once
// it exists; until then this is where it lands.
runSeed(evolu).then(
  (r) => {
    booted = true;
    console.info(
      `Seed: found version ${r.foundVersion}, ${r.applied ? "applied batch(es)" : "nothing to apply"}`,
    );
    void ensureAppStartDate(evolu);
    // The icon plant is an always-run reconciler, NOT gate-trusted: the gate
    // latched twice over transactions lost to mid-session reloads (batches
    // 7 and 9). Idempotent null-fill → a lost write heals next launch.
    void ensureHabitIcons(evolu);
  },
  (e) => {
    console.error("Seed failed:", e);
    // a launch that cannot seed cannot trust the store — tier ④
    mountFatalLaunch(e);
  },
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <EvoluProvider value={evolu}>
      <App />
    </EvoluProvider>
  </React.StrictMode>,
);
