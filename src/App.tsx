import { useEvoluError } from "@evolu/react";
import { Shell } from "./shell/Shell";
import "./App.css";

/**
 * Build step 6 — the app now boots into the real shell (titlebar + nav rail +
 * content pane). The rail's Habits wire to the seeded active habits; clicking a
 * consumption habit opens its dashboard. Logging + the dev seed/activation
 * tooling live on the shell's Log view.
 */
function App() {
  const evoluError = useEvoluError();

  if (evoluError) {
    return (
      <main className="shell">
        <div className="boot-line">Evolu error: {evoluError.type}</div>
      </main>
    );
  }

  return <Shell />;
}

export default App;
