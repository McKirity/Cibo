import { useEffect, useState } from "react";
import { useEvoluError, useQuery } from "@evolu/react";
import { evolu } from "./db/evolu";
import { clearGamingSeed, seedGamingCrude } from "./db/seedGaming";
import { LogForm } from "./log/LogForm";
import { GamingDashboard } from "./dashboard/GamingDashboard";
import "./App.css";

/**
 * Build step 3 — the bare logging screen: the daily entry form (LogForm) on
 * an unchromed page. Rail, titlebar, and theming are step 6's problem.
 *
 * The habit-activation panel below is TEMPORARY dev tooling: all seeds
 * arrive archived, and activation properly belongs to the first-run setup
 * screen (later step). Archive/delete UX proper (streak ending, danger
 * confirms) arrives with Settings → Habits.
 */

const allHabitsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("habits")
    .select(["id", "name", "kind", "archived"])
    .where("isDeleted", "is not", 1)
    .orderBy("sort_order"),
);

function DevHabitPanel() {
  const habits = useQuery(allHabitsQuery);
  return (
    <details className="dev-panel">
      <summary>
        Dev: habit activation ({habits.filter((h) => !h.archived).length} active) —
        temporary, replaced by first-run setup
      </summary>
      <table className="day-table">
        <tbody>
          {habits.map((h) => (
            <tr key={h.id}>
              <td>{h.name}</td>
              <td>{h.kind}</td>
              <td>{h.archived ? "archived" : "active"}</td>
              <td>
                <button
                  type="button"
                  className="btn-plain btn-sm"
                  onClick={() =>
                    evolu.update("habits", { id: h.id, archived: h.archived ? 0 : 1 })
                  }
                >
                  {h.archived ? "Activate" : "Archive"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/**
 * TEMPORARY (Build step 4a): plants a crude ~5-year Gaming dataset so the
 * vertical slice's <100 ms budget measures real volume. Throwaway — deleted
 * with `seedGaming.ts` when step 5's rich seeder lands.
 */
function DevGamingSeedPanel() {
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setStatus("working…");
    try {
      setStatus(await fn());
    } catch (e) {
      setStatus(`error: ${String(e)}`);
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="dev-panel">
      <summary>Dev: crude Gaming seeder (step 4a) — throwaway, ~5-year volume</summary>
      <div className="row">
        <button
          type="button"
          className="btn-accent btn-sm"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await seedGamingCrude(evolu);
              return `Seeded ${r.entries} games · ${r.sessions} sessions · ${r.days} finalized days (cleared ${r.clearedFirst} first). Gaming activated.`;
            })
          }
        >
          Seed crude Gaming data
        </button>
        <button
          type="button"
          className="btn-plain btn-sm"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await clearGamingSeed(evolu);
              return `Cleared ${r.removed} rows.`;
            })
          }
        >
          Clear
        </button>
        {status && <span className="fieldnote">{status}</span>}
      </div>
    </details>
  );
}

/** Dev-grade view switch: the log screen ⇄ the Gaming stats slice. The real
 *  nav rail is step 6; this just makes the slice reachable. */
type View = "log" | "gaming";

function App() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [view, setView] = useState<View>("log");
  const evoluError = useEvoluError();

  useEffect(() => {
    evolu.appOwner.then((owner) => setOwnerId(owner.id));
  }, []);

  if (view === "gaming") {
    return (
      <main>
        <div className="dev-nav">
          <button type="button" className="btn-plain btn-sm" onClick={() => setView("log")}>
            ← Log screen
          </button>
        </div>
        <GamingDashboard />
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="boot-line">
        {evoluError
          ? `Evolu error: ${evoluError.type}`
          : ownerId
            ? `Evolu ready — owner ${ownerId}`
            : "Evolu starting…"}
      </div>
      <div className="dev-nav">
        <button type="button" className="btn-accent btn-sm" onClick={() => setView("gaming")}>
          Gaming dashboard (slice) →
        </button>
      </div>
      <LogForm />
      <DevHabitPanel />
      <DevGamingSeedPanel />
    </main>
  );
}

export default App;
