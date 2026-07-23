/**
 * Build step 6 — the consumption habit-dashboard, generalized from the step-4
 * Gaming slice. ONE component now renders every consumption habit (Gaming ·
 * Reading · Media) off its habit key: schema → indexed Evolu fetch
 * (useConsumptionData) → the shared derivation layer (../metrics) → the
 * composition spec (consumptionSpec) → the kit blocks (kit.tsx).
 *
 * The Medium-bearing variant (Reading/Media, the frozen `reading-stats.html`)
 * is the same template plus the entry-level `type`: a live Medium sub-scope in
 * the masthead + a leading "By type" distribution — both definition-driven off
 * the habit's declared type vocab, both absent for Gaming (empty vocab).
 */
import { useMemo, useState, type CSSProperties } from "react";
import { useConsumptionData } from "./useConsumptionData";
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

export function ConsumptionDashboard({ habitKey }: { habitKey: string }) {
  const data = useConsumptionData(habitKey);
  const [today] = useState(todayLocal);
  const [scope, setScope] = useState<ScopeSel>({ kind: "all" });
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

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
        typeVocab: data.typeVocab,
        appActiveDays: data.appActiveDays,
      },
      scope,
      typeFilter,
    );
    return { model, ms: performance.now() - t0 };
  }, [data, scope, today, typeFilter]);

  if (!data.ready) return <div className="gsdash">Loading {habitKey}…</div>;

  const m = model;
  const color = m.colorVar;

  return (
    <div className="gsdash" style={{ "--heat-hue": `var(${color})` } as CSSProperties}>
      <div className="perf-line">
        derived in {ms.toFixed(1)} ms · {data.sessions.length} sessions · {data.entries.length} entries ·
        scope {scope.kind === "all" ? "All Time" : scope.year}
        {m.masthead.activeType ? ` · ${m.masthead.activeType}` : ""}
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
                    onClick={() =>
                      setScope(tab.key === "all" ? { kind: "all" } : { kind: "year", year: tab.key })
                    }
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {m.masthead.typeTabs.length > 0 && (
                <div className="subtabs">
                  <span className="stlabel">Type</span>
                  {m.masthead.typeTabs.map((tab) => (
                    <button
                      key={tab.key ?? "all"}
                      className={`subtab${tab.key === m.masthead.activeType ? " on" : ""}`}
                      onClick={() => setTypeFilter(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
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
              {m.catalog.length > 0 && <StatGroup label="Catalog" tiles={m.catalog} />}
            </Panel>

            {/* ── Catalog (degradation survivor merge — e.g. YouTube). Designed
                 in Claude Design: stacked sections — the By-genre bars, then a
                 "Channels" hall of ranked cover-cards (name → hours). ── */}
            {m.mergedCatalog && (
              <Panel title="Catalog">
                <div className="catsec">
                  <div className="dcol">
                    <div className="chead">
                      <span className="ct">{m.mergedCatalog.dist.title}</span>
                    </div>
                    <div className="bars">
                      {m.mergedCatalog.dist.rows.map((r, i) => (
                        <div className="brow" key={i} title={r.tip}>
                          <span className="blabel">{r.label}</span>
                          <div className="btrack">
                            <div className="bfill" style={{ width: `${r.pct}%`, background: `var(${r.colorVar})` }} />
                          </div>
                          <span className="bval">{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="catsec">
                  <div className="dcol">
                    <div className="chead">
                      <span className="ct">{m.mergedCatalog.hallTitle}</span>
                    </div>
                    <div className="hall">
                      {m.mergedCatalog.tile.list?.rows.map((r, i) => (
                        <div className="cover" key={i} title={`${r.k} · ${r.v}`}>
                          <span className="rk">{i + 1}</span>
                          <div className="chan">
                            <span className="cn">{r.k}</span>
                            <span className="ch">{r.v}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Panel>
            )}

            {/* ── Distributions ── */}
            {m.distributions.length > 0 && (
              <Panel title="Distributions">
                <DistributionColumns columns={m.distributions} />
              </Panel>
            )}

            {/* ── Leaderboards (degradation: the zone doesn't render when every
                 column dropped — e.g. a pinned type + a year before it existed) ── */}
            {m.leaderboards.length > 0 && (
              <Panel title="Leaderboards">
                <LeaderboardColumns columns={m.leaderboards} />
              </Panel>
            )}

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

            {/* ── Activity heatmap (Intensity · By-Type toggle when Medium-bearing) ── */}
            <Heatmap
              cells={m.heatmap.cells}
              months={m.heatmap.months}
              trio={m.heatmap.trio}
              hasTypes={m.heatmap.hasTypes}
              legend={m.heatmap.legend}
            />
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
