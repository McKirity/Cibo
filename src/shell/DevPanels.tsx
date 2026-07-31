/** Dev tooling on the Log view (temporary — first-run setup replaces it). Split out of Shell.tsx 2026-07-30 (dedup pass wave 4). */
import { useEffect, useState } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { clearRichSeed, seedRich } from "../db/seedRich";
import { LogForm } from "../log/LogForm";
import { activeHabitsQuery } from "./Shell";

// ── Dev tooling on the Log view (temporary — first-run setup replaces it) ──────

export function LogView() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  useEffect(() => {
    evolu.appOwner.then((owner) => setOwnerId(owner.id));
  }, []);
  return (
    <div style={{ maxWidth: 900 }}>
      <div className="perf-line">{ownerId ? `Evolu ready — owner ${ownerId}` : "Evolu starting…"}</div>
      <LogForm />
      {/* Dev-only tooling — `import.meta.env.DEV` is statically false in a
          production build, so these panels compile out. Whether seedRich
          itself is then tree-shaken out of the bundle has NOT been verified
          — don't rely on it being absent. */}
      {import.meta.env.DEV && (
        <>
          <DevReduceEffectsToggle />
          <DevHabitPanel />
          <DevRichSeedPanel />
        </>
      )}
    </div>
  );
}

/**
 * Dev stand-in for the reduce-effects switch — the real control is
 * Settings → Appearance (step 10; a per-device lever, [[Cross-device]]'s
 * 3-lever model). The class on the root element IS the mechanism the whole
 * corpus keys on; localStorage persistence = the established per-device
 * stand-in. First use: the 2026-07-29 hover-lag A/B (reduce-effects sheds
 * the vignette clock sweep).
 */
export const REDUCE_KEY = "cibo.dev.reduceEffects";
function DevReduceEffectsToggle() {
  const [on, setOn] = useState(() => document.documentElement.classList.contains("reduce-effects"));
  const toggle = () => {
    const next = !on;
    document.documentElement.classList.toggle("reduce-effects", next);
    try {
      localStorage.setItem(REDUCE_KEY, next ? "1" : "0");
    } catch {
      /* per-device sugar */
    }
    setOn(next);
  };
  return (
    <div style={{ marginTop: 16 }}>
      <button className="btn-plain" onClick={toggle}>
        Reduce effects: {on ? "ON" : "off"}
      </button>
    </div>
  );
}

function DevHabitPanel() {
  const habits = useQuery(activeHabitsQuery);
  return (
    <details className="dev-panel">
      <summary>
        Dev: habit activation ({habits.filter((h) => !h.archived).length} active) — temporary,
        replaced by first-run setup
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
                  onClick={() => {
                    const r = evolu.update("habits", { id: h.id, archived: h.archived ? 0 : 1 });
                    if (!r.ok) console.error("Dev: habit toggle rejected", r.error);
                  }}
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

function DevRichSeedPanel() {
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setStatus("working… (this seeds thousands of rows)");
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
      <summary>Dev: rich seeder (step 5) — faithful ~5-year dataset, all 11 habits</summary>
      <div className="row">
        <button
          type="button"
          className="btn-accent btn-sm"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await seedRich(evolu);
              return `Seeded ${r.entries} entries · ${r.sessions} sessions · ${r.subunits} categoricals · ${r.days} finalized days (cleared ${r.clearedFirst} first).`;
            })
          }
        >
          Seed rich data
        </button>
        <button
          type="button"
          className="btn-plain btn-sm"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await clearRichSeed(evolu);
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
