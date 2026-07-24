/**
 * Build step 6 · chunk 3 — the simple habit dashboard. ONE component renders
 * every simple habit off its habit key; the FLAVOR (measureless · measured ·
 * categorical) is derived from the declarations by the spec, never stored and
 * never a habit-key branch (user-ruled 2026-07-23).
 *
 * Frozen references: `walking-stats.html` (measureless floor — attendance grid
 * + bundled 6-tile row + the scope-following days-per-period spark) ·
 * `embroidery-stats.html` / `walking-steps-stats.html` (measured duration /
 * count) · `keyboard-stats.html` (categorical fill — the split Days/<measure>
 * panels, the stacked trend toggle, the per-value heatmap filter). Drawing
 * translates from Embroidery, Coding from Keyboard (no FINALs of their own).
 */
import { useMemo, useState, type CSSProperties } from "react";
import { useSimpleData } from "./useSimpleData";
import { buildSimpleDashboard, type SimpleModel, type ScopeSel } from "./simpleSpec";
import { Panel, StatGroup, StatTile } from "./kit";
import { CreationTrend, DistPanel } from "./CreationDashboard";
import "../dashboard.css";
import "./screen.css";

const todayLocal = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const HEAT_CLASS: Record<string, string> = { HOT: "hot", WARM: "warm", COOLING: "warm", COLD: "cold" };

export function SimpleDashboard({ habitKey }: { habitKey: string }) {
  const data = useSimpleData(habitKey);
  const [today] = useState(todayLocal);
  const [scope, setScope] = useState<ScopeSel>({ kind: "all" });

  const { model, ms } = useMemo(() => {
    const t0 = performance.now();
    const model = buildSimpleDashboard(
      {
        habitKey,
        colourSlot: data.colourSlot,
        name: data.name,
        archived: data.archived,
        measuresTime: data.measuresTime,
        measuresCount: data.measuresCount,
        countUnit: data.countUnit,
        sessions: data.sessions,
        finalized: data.finalized,
        today,
        defs: data.defs,
        valueBySession: data.valueBySession,
      },
      scope,
    );
    return { model, ms: performance.now() - t0 };
  }, [data, habitKey, scope, today]);

  if (!data.ready) return <div className="gsdash">Loading {habitKey}…</div>;

  const m = model;
  const color = m.colorVar;

  return (
    <div className="gsdash simpledash" style={{ "--heat-hue": `var(${color})` } as CSSProperties}>
      <div className="perf-line">
        derived in {ms.toFixed(1)} ms · {data.sessions.length} sessions · flavor {m.flavor} · scope{" "}
        {scope.kind === "all" ? "All Time" : scope.year}
      </div>

      {m.masthead.empty ? (
        <EmptyState name={m.masthead.name} />
      ) : (
        <div className="gs">
          {/* ── 1 · Masthead (the simple/range face: no type row, no library door) ── */}
          <section className="panel mast">
            <div className="art" style={{ background: `var(${color})` }}>
              <span>{m.masthead.name[0]?.toUpperCase()}</span>
            </div>
            <div className="idcol">
              <div className="idrow">
                <span className="hname">{m.masthead.name}</span>
                {m.masthead.heat && (
                  <span className={`heatchip ${HEAT_CLASS[m.masthead.heat]}`} style={{ display: "inline-flex" }}>
                    {m.masthead.heat}
                  </span>
                )}
                {m.masthead.archived && (
                  <span className="archchip" style={{ display: "inline-flex" }}>
                    ARCHIVED
                  </span>
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
          </section>

          <div className="gs-body">
            {/* ── MEASURELESS: attendance (grid + bundled 6-tile row) + dayspark ── */}
            {m.attendance && <AttendancePanel a={m.attendance} color={color} />}
            {m.dayspark && <DaysparkPanel d={m.dayspark} color={color} />}

            {/* ── MEASURED + CATEGORICAL: stat rows · split dist · trends · heatmap ── */}
            {m.statRows && (
              <Panel title="At a glance">
                {m.statRows.map((row) => (
                  <StatGroup key={row.label} label={row.label} tiles={row.tiles} tall={row.tall} />
                ))}
              </Panel>
            )}
            {m.dist && (
              <Panel title={m.dist.title}>
                <div className="board-split">
                  {m.dist.panels.map((p) => (
                    <DistPanel key={p.title} panel={p} />
                  ))}
                </div>
              </Panel>
            )}
            {m.trend && <CreationTrend trend={m.trend} color={color} />}
            {m.heatmap && <SimpleHeatmap heatmap={m.heatmap} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Measureless zones ─────────────────────────────────────────────────────────

function AttendancePanel({
  a,
  color,
}: {
  a: NonNullable<SimpleModel["attendance"]>;
  color: string;
}) {
  return (
    <Panel
      title="Attendance"
      right={
        <span className="pmeta attend-legend">
          <span className="sw swE" />
          not logged
          <span className="sw swF" style={{ background: `var(${color})` }} />
          logged
        </span>
      }
    >
      <div className="heat">
        <div className="weekdays">
          <span className="wd" />
          {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => (
            <span className="wd" key={i}>
              {d}
            </span>
          ))}
        </div>
        <div className="cols">
          <div className="months">
            {a.months.map((mo) => (
              <span key={mo.col} style={{ gridColumnStart: mo.col + 1 }}>
                {mo.label}
              </span>
            ))}
          </div>
          <div className="cells">
            {a.cells.map((c, i) => (
              <div
                key={i}
                className="hcell"
                style={
                  c.day == null
                    ? { visibility: "hidden" }
                    : c.on
                      ? { background: `var(${color})`, boxShadow: "none" }
                      : {}
                }
                title={c.day ? c.tip : undefined}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="tlabel" style={{ marginTop: "var(--space-7)" }}>
        Engagement &amp; attendance
      </div>
      {/* Split in half — 3×2, not 6 across (user-ruled 2026-07-23, live
          iteration): six tracks crushed the subtitles; a struggling stat row
          overflows to the next row rather than squeezing. */}
      <div className="trow tall" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)" }}>
        {a.tiles.map((t, i) => (
          <StatTile key={i} t={t} />
        ))}
      </div>
    </Panel>
  );
}

function DaysparkPanel({
  d,
  color,
}: {
  d: NonNullable<SimpleModel["dayspark"]>;
  color: string;
}) {
  return (
    <Panel
      title="Days per period"
      right={
        d.delta ? (
          <span className="pmeta sparkhead" style={{ gap: "var(--space-5)" }}>
            <span className={`deltachip${d.delta.down ? " down" : ""}`}>
              {d.delta.text}{" "}
              <span style={{ color: "var(--text-muted)", fontWeight: "var(--weight-regular)" as never }}>
                {d.deltaNote}
              </span>
            </span>
          </span>
        ) : undefined
      }
    >
      <div className="dayspark">
        {d.bars.map((b, i) => (
          <div className="col" key={i} title={b.tip}>
            <span className="n">{b.value > 0 ? b.value : ""}</span>
            <div
              className="bar"
              style={
                b.value > 0
                  ? { height: `${(b.value / d.max) * 100}%`, background: `var(${color})` }
                  : { height: "4px", background: "var(--inset-background)" }
              }
            />
            <span className="lab">{b.label}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── The measure-intensity heatmap (+ the per-value filter when categorical) ───

function SimpleHeatmap({ heatmap }: { heatmap: NonNullable<SimpleModel["heatmap"]> }) {
  const [filter, setFilter] = useState("");
  const filtered = filter !== "";

  return (
    <Panel
      title="Activity heatmap"
      right={
        <span className="pmeta" style={{ display: "flex", alignItems: "center", gap: "var(--space-6)" }}>
          {heatmap.filterLabel && (
            <label className="hsel">
              {heatmap.filterLabel}
              <select className="board-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
                {heatmap.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="ramp">
            {[0, 1, 2, 3, 4].map((k) => (
              <span key={k} className={`sw sw${k}`} />
            ))}
          </span>
        </span>
      }
    >
      <div className="heat">
        <div className="weekdays">
          <span className="wd" />
          {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => (
            <span className="wd" key={i}>
              {d}
            </span>
          ))}
        </div>
        <div className="cols">
          <div className="months">
            {heatmap.months.map((mo) => (
              <span key={mo.col} style={{ gridColumnStart: mo.col + 1 }}>
                {mo.label}
              </span>
            ))}
          </div>
          <div className="cells">
            {heatmap.cells.map((c, i) => {
              if (c.day == null) return <div key={i} className="hcell" style={{ visibility: "hidden" }} />;
              // Per-value view: a day counts only when the picked value was its
              // primary value that day (the drawn Keyboard behaviour).
              const on = filtered ? c.value === filter && c.level > 0 : c.level > 0;
              const lvl = on ? c.level : 0;
              const tip = on || !filtered ? c.tip : `${c.tip.split(" · ")[0]} · no session on ${filter}`;
              return <div key={i} className={`hcell${lvl > 0 ? ` l${lvl}` : ""}`} title={tip} />;
            })}
          </div>
        </div>
      </div>
      <div
        className="trow"
        style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", marginTop: "var(--space-6)" }}
      >
        {heatmap.trio.map((t, i) => (
          <StatTile key={i} t={t} />
        ))}
      </div>
    </Panel>
  );
}

function EmptyState({ name }: { name: string }) {
  return (
    <div className="gs-empty" style={{ display: "block" }}>
      <div className="emptybox gen">
        <div className="eh">Nothing tracked yet</div>
        <div className="es">
          {name}'s stats appear here once it has sessions — streaks, days, and the heatmap all build
          from what you log. One door fills this dashboard:
        </div>
        <div className="edoors">
          <button className="btn-accent" type="button">Log a session</button>
          <button className="btn-plain" type="button">Set an icon</button>
        </div>
      </div>
    </div>
  );
}
