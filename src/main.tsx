import React from "react";
import ReactDOM from "react-dom/client";
import { EvoluProvider } from "@evolu/react";
// TEMPORARY (until Build step 6a, the Theme Layer): the Default theme's dials,
// imported statically from the bundled package so there is no second copy to
// drift. Step 6a replaces this import with the real two-root folder loader.
import "../src-tauri/resources/themes/Default (neutral light)/theme.css";
import "./kit.css";
import App from "./App";
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
let booted = false;
evolu.subscribeError(() => {
  const err = evolu.getError();
  console.error("Evolu error:", err);
  if (!booted) mountFatalLaunch(err);
  else showErrorToast("A background data write failed — the last change may not have saved.");
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
