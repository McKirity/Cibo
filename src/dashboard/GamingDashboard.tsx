/**
 * Build step 4 — the Vertical Slice. The Gaming habit dashboard's statistics
 * core, end to end: schema → indexed Evolu fetch (useGamingData) → the shared
 * TS derivation layer (../metrics) → the composition spec (consumptionSpec) →
 * the kit blocks (kit.tsx), against the frozen `Final/gaming-stats.html`.
 *
 * This is the go/no-go: the derivation layer and kit blocks here are the
 * reusable deliverable; the next dashboard consumes them unchanged.
 *
 * Rail/titlebar/theming are step 6; this renders the dashboard pane bare.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { useGamingData } from "./useGamingData";
import { buildConsumptionDashboard, type ScopeSel } from "./consumptionSpec";
import {
  DistributionColumns,
  Heatmap,
  LeaderboardColumns,
  Panel,
  StatGroup,
  TrendPanel,
} from "./kit";
import "../dashboard.css";
import "./screen.css";

const todayLocal = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const HEAT_CLASS: Record<string, string> = { HOT: "hot", WARM: "warm", COOLING: "warm", COLD: "cold" };

export function GamingDashboard() {
  const data = useGamingData();
  const [today] = useState(todayLocal);
  const [scope, setScope] = useState<ScopeSel>({ kind: "all" });

  const { model, ms } = useMemo(() => {
    const t0 = performance.now();
    const model = buildConsumptionDashboard(
      {
        colourSlot: data.colourSlot,
        name: data.name,
        sessions: data.sessions,
        entries: data.entries,
        finalized: data.finalized,
        today,
      },
      scope,
    );
    return { model, ms: performance.now() - t0 };
  }, [data, scope, today]);

  if (!data.ready) return <div className="gsdash">Loading Gaming…</div>;

  const m = model;
  const color = m.colorVar;

  return (
    <div className="gsdash" style={{ "--heat-hue": `var(${color})` } as CSSProperties}>
      <div className="perf-line">
        derived in {ms.toFixed(1)} ms · {data.sessions.length} sessions · {data.entries.length} entries ·
        scope {scope.kind === "all" ? "All Time" : scope.year}
      </div>

      {m.masthead.empty ? (
        <EmptyState name={m.masthead.name} />
      ) : (
        <div className="gs">
          {/* ── Masthead ── */}
          <section className="panel mast">
            <div className="art" style={{ background: `var(${color})` }}>
              <span>{m.masthead.name[0]?.toUpperCase()}</span>
            </div>
            <div className="idcol">
              <div className="idrow">
                <span className="hname">{m.masthead.name}</span>
                {m.masthead.heat && (
                  <span className={`heatchip ${HEAT_CLASS[m.masthead.heat]}`}>{m.masthead.heat}</span>
                )}
              </div>
              <div className="since">{m.masthead.sinceLive}</div>
              <div className="tabs">
                {m.masthead.tabs.map((tab) => (
                  <button
                    key={tab.key}
                    className={`tab${tab.key === m.masthead.activeKey ? " on" : ""}`}
                    onClick={() => setScope(tab.key === "all" ? { kind: "all" } : { kind: "year", year: tab.key })}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <button className="libdoor" type="button" title="Library (step 8)">
              Library
            </button>
          </section>

          <div className="gs-body">
            {/* ── At a glance ── */}
            <Panel title="At a glance">
              <StatGroup label="Engagement" tiles={m.engagement} tall />
              <StatGroup label="Volume" tiles={m.volume} />
              <StatGroup label="Catalog" tiles={m.catalog} />
            </Panel>

            {/* ── Distributions ── */}
            <Panel title="Distributions">
              <DistributionColumns columns={m.distributions} />
            </Panel>

            {/* ── Leaderboards ── */}
            <Panel title="Leaderboards">
              <LeaderboardColumns columns={m.leaderboards} />
            </Panel>

            {/* ── Trends ── */}
            <TrendPanel
              caption={m.trend.caption}
              line={m.trend.line}
              vmax={m.trend.vmax}
              xticks={m.trend.xticks}
              sparkTitle={m.trend.sparkTitle}
              sparkDelta={m.trend.sparkDelta}
              spark={m.trend.spark}
              sparkMax={m.trend.sparkMax}
              color={color}
            />

            {/* ── Activity heatmap ── */}
            <Heatmap cells={m.heatmap.cells} months={m.heatmap.months} trio={m.heatmap.trio} />
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ name }: { name: string }) {
  return (
    <div className="gs-empty" style={{ display: "block" }}>
      <div className="emptybox gen">
        <div className="eh">Nothing tracked yet</div>
        <div className="es">
          {name} has no sessions yet — log one, run an import, or set an icon to bring this
          dashboard to life.
        </div>
        <div className="edoors">
          <button className="btn-accent" type="button">Add entries</button>
          <button className="btn-plain" type="button">Run an import</button>
          <button className="btn-plain" type="button">Set an icon</button>
        </div>
      </div>
    </div>
  );
}
