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
import { runSeed } from "./db/seed";

// The version-gated seed append — runs at every launch, applies only newer batches.
runSeed(evolu).then(
  (r) =>
    console.info(
      `Seed: found version ${r.foundVersion}, ${r.applied ? "applied batch(es)" : "nothing to apply"}`,
    ),
  (e) => console.error("Seed failed:", e),
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <EvoluProvider value={evolu}>
      <App />
    </EvoluProvider>
  </React.StrictMode>,
);
