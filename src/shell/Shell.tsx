/**
 * Build step 6 — the minimal real shell (option A): the custom titlebar + nav
 * rail + content pane from the frozen `Final/frame.html`, with the Habits
 * section WIRED to the seeded active habits (click a habit → its dashboard).
 *
 * Deliberately partial — this is the container step 6's dashboards live in, not
 * step 9 (nav calendar + whimsy) or step 6a (theme/ambience). Placeheld here:
 * the month grid, the Tools destinations (Timers/Statistics/Search/Map),
 * Settings, and the live vignette (a static face stands in). Window controls
 * are visual only until the custom-titlebar/decorations pass.
 *
 * The dev seed/activation panels ride the Log view — the working loop that
 * turns seeds into rail habits: seed rich → activate → click → dashboard.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@evolu/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { evolu } from "../db/evolu";
import { clearRichSeed, seedRich } from "../db/seedRich";
import { runSpikeMeasurement } from "../db/spikeGrowth";
import { LogForm } from "../log/LogForm";
import { ConsumptionDashboard } from "../dashboard/ConsumptionDashboard";
import { CreationDashboard } from "../dashboard/CreationDashboard";
import "./shell.css";

const CONSUMPTION_KEYS = new Set(["gaming", "reading", "media"]);
// Coding left this set 2026-07-22 (user-ruled downgrade to simple — a
// language-learning journey, not projects); it joins chunk 3's simple family.
const CREATION_KEYS = new Set(["writing", "gamedev"]);

const activeHabitsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("habits")
    .select(["id", "key", "name", "kind", "sub_type", "colour_slot", "archived"])
    .where("isDeleted", "is not", 1)
    .orderBy("sort_order"),
);

type View = { kind: "log" } | { kind: "habit"; key: string };

export function Shell() {
  const habits = useQuery(activeHabitsQuery);
  const active = habits.filter((h) => !h.archived);
  const [view, setView] = useState<View>({ kind: "log" });

  const projects = active.filter((h) => h.kind === "project");
  const daily = active.filter((h) => h.kind !== "project");

  // If the selected habit gets archived out from under us, fall back to Log.
  useEffect(() => {
    if (view.kind === "habit" && !active.some((h) => h.key === view.key)) {
      setView({ kind: "log" });
    }
  }, [view, active]);

  const title =
    view.kind === "habit" ? active.find((h) => h.key === view.key)?.name ?? "Cibo" : "Today";

  return (
    <div className="app-frame">
      <Titlebar title={title} />

      <nav className="rail">
        {/* 1 · nav calendar (header only — the grid is step 9) */}
        <div className="sec">
          <div className="calhead">
            <div className="chain">
              <span className="doorlink">2026</span>
              <span className="doorlink">Q3</span>
            </div>
            <div className="month">July</div>
          </div>
          <button className="cal-placeholder" onClick={() => setView({ kind: "log" })}>
            month grid · step 9 — click for Today
          </button>
        </div>

        {/* 2 · Habits */}
        <div className="sec">
          <p className="overline">Habits</p>
          {projects.length > 0 && (
            <>
              <p className="subgroup">Projects</p>
              <div className="habitgrid">
                {projects.map((h) => (
                  <HabitButton
                    key={h.id}
                    name={h.name ?? "—"}
                    colour={h.colour_slot ?? "habit-1"}
                    active={view.kind === "habit" && view.key === h.key}
                    onClick={() => h.key && setView({ kind: "habit", key: h.key })}
                  />
                ))}
              </div>
            </>
          )}
          {daily.length > 0 && (
            <>
              <p className="subgroup">Daily</p>
              <div className="habitgrid">
                {daily.map((h) => (
                  <HabitButton
                    key={h.id}
                    name={h.name ?? "—"}
                    colour={h.colour_slot ?? "habit-1"}
                    active={view.kind === "habit" && view.key === h.key}
                    onClick={() => h.key && setView({ kind: "habit", key: h.key })}
                  />
                ))}
              </div>
            </>
          )}
          {active.length === 0 && (
            <p className="cal-placeholder">
              no active habits — seed + activate on the Log view
            </p>
          )}
        </div>

        {/* 3 · Tools (destinations are step 7/8/9) */}
        <div className="sec">
          <p className="overline">Tools</p>
          <div className="tools">
            <button className="tool" disabled title="Step 7">
              <Ico d={["M10 2h4", "M12 14l3-3", "M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"]} />
              Timers
            </button>
            <button className="tool" disabled title="Later">
              <Ico d={["M3 3v16a2 2 0 0 0 2 2h16", "M18 17V9", "M13 17V5", "M8 17v-3"]} />
              Statistics
            </button>
            <button className="tool" disabled title="Later">
              <Ico d={["M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z", "m21 21-4.3-4.3"]} />
              Search
            </button>
            <button className="tool" disabled title="Later">
              <Ico d={["M14 5.6a2 2 0 0 0 1.8 0l3.6-1.8A1 1 0 0 1 21 4.6v12.8a1 1 0 0 1-.6.9l-4.5 2.3a2 2 0 0 1-1.8 0l-4.2-2.1a2 2 0 0 0-1.8 0L4.4 20.4A1 1 0 0 1 3 19.4V6.6a1 1 0 0 1 .6-.9L8 3.4a2 2 0 0 1 1.8 0z"]} />
              Map
            </button>
          </div>
        </div>

        {/* flex band · vignette clock (static — the live face is step 6a) */}
        <div className="ambience">
          <VignetteClock />
        </div>

        {/* 4 · Settings (step 10) */}
        <div className="sec settings">
          <button className="settings-row" disabled title="Step 10">
            <Ico d={["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 6 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H2a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 3.3 6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 3.3V2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9z"]} />
            <span className="name">Settings</span>
          </button>
        </div>
      </nav>

      <div className="content">
        {view.kind === "habit" && CONSUMPTION_KEYS.has(view.key) ? (
          // key by habit → a fresh mount per habit, so scope + type + heatmap
          // mode reset to All Time / All types on every swap.
          <ConsumptionDashboard key={view.key} habitKey={view.key} />
        ) : view.kind === "habit" && CREATION_KEYS.has(view.key) ? (
          <CreationDashboard key={view.key} habitKey={view.key} />
        ) : view.kind === "habit" ? (
          <NotYetDashboard habitKey={view.key} />
        ) : (
          <LogView />
        )}
      </div>
    </div>
  );
}

function HabitButton({
  name,
  colour,
  active,
  onClick,
}: {
  name: string;
  colour: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`entry${active ? " active" : ""}`} onClick={onClick}>
      <span className="swatch" style={{ background: `var(--${colour})` }}>
        {name[0]?.toUpperCase()}
      </span>
      <span className="name">{name}</span>
    </button>
  );
}

// Custom titlebar (native decorations are off in tauri.conf.json). The drag
// region moves the window; the right cluster drives the OS window via the Tauri
// window API. Back/forward are app history (step 9) — inert for now.
const winAction = (fn: (w: ReturnType<typeof getCurrentWindow>) => Promise<unknown>) => () => {
  try {
    void fn(getCurrentWindow()).catch(() => {});
  } catch {
    /* not in a Tauri webview (plain browser dev) — no-op */
  }
};

function Titlebar({ title }: { title: string }) {
  return (
    <div className="tb">
      <div className="cluster">
        <button className="tb-btn disabled" title="Back">
          <Ico d={["m12 19-7-7 7-7", "M19 12H5"]} />
        </button>
        <button className="tb-btn disabled" title="Forward">
          <Ico d={["M5 12h14", "m12 5 7 7-7 7"]} />
        </button>
      </div>
      <div className="drag" data-tauri-drag-region>
        <span className="title">{title}</span>
      </div>
      <div className="cluster winbtns">
        <button className="tb-btn" title="Minimize" onClick={winAction((w) => w.minimize())}>
          <Ico d={["M5 12h14"]} />
        </button>
        <button className="tb-btn" title="Maximize" onClick={winAction((w) => w.toggleMaximize())}>
          <Ico d={["M4 4h16v16H4z"]} />
        </button>
        <button className="tb-btn close" title="Close" onClick={winAction((w) => w.close())}>
          <Ico d={["M18 6 6 18", "m6 6 12 12"]} />
        </button>
      </div>
    </div>
  );
}

/** The numberless analog vignette face, faithful to the frozen `frame.html`:
 *  60 minute ticks (skipping the 12 hour positions) + 12 longer hour ticks near
 *  the rim, minute/hour hands repainted each second, and the accent second hand
 *  sweeping via CSS (a 60s linear loop, delayed to the current second so it's in
 *  phase with real time). The live-data vignette proper is step 6a. */
function VignetteClock() {
  const [now, setNow] = useState(() => new Date());
  // The second hand sweeps via a continuous 60s CSS loop — its start is aligned
  // to real time ONCE (a stable negative delay). Recomputing the delay on every
  // render would restart the animation each tick (the "skip"). The minute/hour
  // hands are discrete transforms, so re-rendering them each second is fine.
  const [sweepDelay] = useState(() => {
    const d = new Date();
    return `-${d.getSeconds() + d.getMilliseconds() / 1000}s`;
  });
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const mins = now.getMinutes();
  const secs = now.getSeconds();
  const mAngle = (mins + secs / 60) * 6;
  const hAngle = ((now.getHours() % 12) + mins / 60) * 30;

  const minTicks = Array.from({ length: 60 }, (_, i) => i).filter((i) => i % 5 !== 0);
  const hourTicks = Array.from({ length: 12 }, (_, h) => h);

  return (
    <svg className="clock" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="56" fill="var(--window-background)" stroke="var(--divider)" strokeWidth="1" />
      <g stroke="var(--text-muted)" strokeWidth="1">
        {minTicks.map((i) => (
          <line key={i} x1="60" y1="6" x2="60" y2="10" transform={`rotate(${i * 6} 60 60)`} />
        ))}
      </g>
      <g stroke="var(--text-secondary)" strokeWidth="2">
        {hourTicks.map((h) => (
          <line key={h} x1="60" y1="6" x2="60" y2="14" transform={`rotate(${h * 30} 60 60)`} />
        ))}
      </g>
      <line x1="60" y1="60" x2="60" y2="34" stroke="var(--text-strong)" strokeWidth="3.5" strokeLinecap="round" transform={`rotate(${hAngle} 60 60)`} />
      <line x1="60" y1="60" x2="60" y2="22" stroke="var(--text-strong)" strokeWidth="2.5" strokeLinecap="round" transform={`rotate(${mAngle} 60 60)`} />
      <line className="sweep" x1="60" y1="68" x2="60" y2="18" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" style={{ animationDelay: sweepDelay }} />
      <circle cx="60" cy="60" r="3" fill="var(--text-strong)" />
      <circle cx="60" cy="60" r="1.6" fill="var(--accent)" />
    </svg>
  );
}

/** Inline lucide-style icon from a list of path `d` strings. */
function Ico({ d }: { d: string[] }) {
  return (
    <svg className="ico" viewBox="0 0 24 24">
      {d.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

function NotYetDashboard({ habitKey }: { habitKey: string }) {
  return (
    <div className="gsdash">
      <div className="emptybox gen" style={{ maxWidth: 640 }}>
        <div className="eh">{habitKey} dashboard — not built yet</div>
        <div className="es">
          This habit's template (creation · simple · range) lands in a later step-6 chunk.
          Consumption habits (Gaming · Reading · Media) render today.
        </div>
      </div>
    </div>
  );
}

// ── Dev tooling on the Log view (temporary — first-run setup replaces it) ──────

function LogView() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  useEffect(() => {
    evolu.appOwner.then((owner) => setOwnerId(owner.id));
  }, []);
  return (
    <div style={{ maxWidth: 900 }}>
      <div className="perf-line">{ownerId ? `Evolu ready — owner ${ownerId}` : "Evolu starting…"}</div>
      <LogForm />
      <DevHabitPanel />
      <DevRichSeedPanel />
      <DevGrowthSpikePanel />
    </div>
  );
}

/**
 * THROWAWAY — the Evolu store-growth spike (Longevity & Future-Proofing, Tier 1).
 * Seeds a ~15-year dataset and measures store size + tombstone accumulation +
 * dashboard latency. Re-seed repeatedly and watch whether the numbers plateau
 * (Evolu compacts) or climb forever (it doesn't). Remove with `spikeGrowth.ts`.
 */
function DevGrowthSpikePanel() {
  const [status, setStatus] = useState<string>("");
  const [report, setReport] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(true);
    setStatus(`${label}…`);
    try {
      const out = await fn();
      setStatus(`${label} — done`);
      setReport(out);
    } catch (e) {
      setStatus(`error: ${String(e)}`);
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="dev-panel">
      <summary>Dev: growth SPIKE (throwaway) — 15-year seed + store/latency measurement</summary>
      <div className="row">
        <button
          type="button"
          className="btn-accent btn-sm"
          disabled={busy}
          onClick={() =>
            run("Seeding 15 years (slow — tens of thousands of rows)", async () => {
              const t = performance.now();
              const r = await seedRich(evolu, 15);
              const secs = Math.round((performance.now() - t) / 100) / 10;
              return (
                `SEED   span=${r.spanYears}y (${r.spanDays} days) in ${secs}s\n` +
                `       ${r.entries} entries · ${r.sessions} sessions · ${r.subunits} categoricals · ` +
                `${r.days} days (cleared ${r.clearedFirst} first)`
              );
            })
          }
        >
          Seed 15yr
        </button>
        <button
          type="button"
          className="btn-plain btn-sm"
          disabled={busy}
          onClick={() => run("Measuring", () => runSpikeMeasurement())}
        >
          Measure
        </button>
        {status && <span className="fieldnote">{status}</span>}
      </div>
      {report && (
        <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", overflowX: "auto" }}>{report}</pre>
      )}
    </details>
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
