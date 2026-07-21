import { useEffect, useState } from "react";
import { useEvoluError, useQuery } from "@evolu/react";
import { evolu } from "./db/evolu";
import "./App.css";

/**
 * TEMPORARY dev verification panel for Build step 2 (Data Layer) — proves the
 * exit checks visually: the 11 seeded habits arrive archived and queryable
 * through a live query. Replaced when real screens land (step 3+).
 */

const habitsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("habits")
    .selectAll()
    .where("isDeleted", "is not", 1)
    .orderBy("sort_order"),
);

const vocabCountQuery = evolu.createQuery((db) =>
  db
    .selectFrom("vocab_options")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .where("isDeleted", "is not", 1),
);

const definitionCountQuery = evolu.createQuery((db) =>
  db
    .selectFrom("subunit_definitions")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .where("isDeleted", "is not", 1),
);

function App() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const evoluError = useEvoluError();
  const habits = useQuery(habitsQuery);
  const vocabCount = useQuery(vocabCountQuery);
  const definitionCount = useQuery(definitionCountQuery);

  useEffect(() => {
    evolu.appOwner.then((owner) => setOwnerId(owner.id));
  }, []);

  return (
    <main className="container">
      <h1>Cibo — data layer check</h1>
      <p>
        {evoluError
          ? `Evolu error: ${evoluError.type}`
          : ownerId
            ? `Evolu ready — owner ${ownerId}`
            : "Evolu starting…"}
      </p>
      <p>
        {habits.length} habits · {String(definitionCount[0]?.n ?? 0)} definitions ·{" "}
        {String(vocabCount[0]?.n ?? 0)} vocab options
      </p>
      <table style={{ margin: "0 auto", textAlign: "left", borderSpacing: "12px 2px" }}>
        <thead>
          <tr>
            <th>#</th>
            <th>habit</th>
            <th>kind</th>
            <th>sub-type</th>
            <th>measures</th>
            <th>slot</th>
            <th>state</th>
          </tr>
        </thead>
        <tbody>
          {habits.map((h) => (
            <tr key={h.id}>
              <td>{h.sort_order}</td>
              <td>{h.name}</td>
              <td>{h.kind}</td>
              <td>{h.sub_type ?? "—"}</td>
              <td>
                {[
                  h.measures_time ? "time" : null,
                  h.measures_count ? `count (${h.count_unit})` : null,
                  h.kind === "range" ? "range" : null,
                ]
                  .filter(Boolean)
                  .join(" + ") || "measureless"}
              </td>
              <td>{h.colour_slot}</td>
              <td>{h.archived ? "archived" : "active"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

export default App;
