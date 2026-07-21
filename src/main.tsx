import React from "react";
import ReactDOM from "react-dom/client";
import { EvoluProvider } from "@evolu/react";
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
