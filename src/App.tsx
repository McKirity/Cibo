import { useEffect, useState } from "react";
import { useEvoluError, useQuery } from "@evolu/react";
import { evolu } from "./db/evolu";
import { LogForm } from "./log/LogForm";
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

function App() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const evoluError = useEvoluError();

  useEffect(() => {
    evolu.appOwner.then((owner) => setOwnerId(owner.id));
  }, []);

  return (
    <main className="shell">
      <div className="boot-line">
        {evoluError
          ? `Evolu error: ${evoluError.type}`
          : ownerId
            ? `Evolu ready — owner ${ownerId}`
            : "Evolu starting…"}
      </div>
      <LogForm />
      <DevHabitPanel />
    </main>
  );
}

export default App;
