/**
 * Build step 6 · chunk 2 — the creation deep-tracker dashboard. ONE component
 * renders every creation habit (Writing · Coding · Gamedev) off its habit key:
 * schema → indexed Evolu fetch (useCreationData) → the shared derivation layer
 * (../metrics) → the composition spec (creationSpec) → these render blocks.
 *
 * Frozen references: `writing-stats.html` (two-measure face: words + efficiency
 * rows, 4-way distribution metric toggles, five-way trend, Words⇄Time heatmap)
 * and `gamedev-stats.html` (single-measure subtraction + the archived face).
 * Coding translates from the Gamedev shape (single time measure + one session
 * categorical) the way Media translated from Reading — no FINAL of its own.
 *
 * Trend/spark charts use the box-sized-viewBox technique (the step-4 ruling);
 * the hero-card sparklines keep the FINAL's fixed 100×40 painterly viewBox
 * (preserveAspectRatio="none" — a fill texture, not a measured chart).
 */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useCreationData } from "./useCreationData";
import {
  buildCreationDashboard,
  type CreationHeatCell,
  type CreationModel,
  type DistMetricKey,
  type DistPanelSpec,
  type HeroSpec,
  type ScopeSel,
  type ShapeChart,
  type TrendSeries,
} from "./creationSpec";
import { Panel, StatGroup } from "./kit";
import "../dashboard.css";
import "./screen.css";

const todayLocal = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const HEAT_CLASS: Record<string, string> = { HOT: "hot", WARM: "warm", COOLING: "warm", COLD: "cold" };

export function CreationDashboard({ habitKey }: { habitKey: string }) {
  const data = useCreationData(habitKey);
  const [today] = useState(todayLocal);
  const [scope, setScope] = useState<ScopeSel>({ kind: "all" });

  const { model, ms } = useMemo(() => {
    const t0 = performance.now();
    const model = buildCreationDashboard(
      {
        habitKey,
        colourSlot: data.colourSlot,
        name: data.name,
        archived: data.archived,
        measuresCount: data.measuresCount,
        countUnit: data.countUnit,
        sessions: data.sessions,
        entries: data.entries,
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
    <div className="gsdash creationdash" style={{ "--heat-hue": `var(${color})` } as CSSProperties}>
      <div className="perf-line">
        derived in {ms.toFixed(1)} ms · {data.sessions.length} sessions · {data.entries.length} entries · scope{" "}
        {scope.kind === "all" ? "All Time" : scope.year}
      </div>

      {m.masthead.empty ? (
        <EmptyState name={m.masthead.name} />
      ) : (
        <div className="gs">
          {/* ── 1 · Masthead (creation variant: no type row, no library door) ── */}
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
            {/* ── 2 · Stat rows (definition-minted: 2 for time-only, 4 with count) ── */}
            <Panel title="At a glance">
              {m.statRows.map((row) => (
                <StatGroup key={row.label} label={row.label} tiles={row.tiles} tall={row.tall} />
              ))}
            </Panel>

            {/* ── 3 · Distributions (per-metric shape family) ── */}
            {m.dist && (
              <Panel title={m.dist.panelTitle}>
                <div className="distrow" style={{ gridTemplateColumns: `repeat(${m.dist.panels.length}, 1fr)` }}>
                  {m.dist.panels.map((p) => (
                    <DistPanel key={p.title} panel={p} />
                  ))}
                </div>
              </Panel>
            )}

            {/* ── 4 · Trends (series toggle · stacked faces · month spark) ── */}
            <CreationTrend trend={m.trend} color={color} />

            {/* ── 5 · Heatmap (scope per categorical · measure toggle when two) ── */}
            <CreationHeatmap heatmap={m.heatmap} />

            {/* ── 6 · Hero cards = the library ── */}
            <Panel title={m.heroes.title}>
              <div className="herogrid">
                {m.heroes.cards.map((h) => (
                  <HeroCard key={h.title} h={h} />
                ))}
                <div className="hero door" role="button" title="Entry creation modal (later step)">
                  <span className="dplus">＋ New entry</span>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Distribution panel + the per-metric shape family ──────────────────────────

export function DistPanel({ panel }: { panel: DistPanelSpec }) {
  const [metric, setMetric] = useState<DistMetricKey>(panel.initial);
  const chart = panel.charts[metric] ?? panel.charts[panel.initial];
  return (
    <div className="dpanel">
      <div className="chead">
        <span className="ct">{panel.title}</span>
        {panel.tabs && (
          <div className="mtoggle">
            {panel.tabs.map((t) => (
              <button key={t.key} aria-pressed={t.key === metric} onClick={() => setMetric(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="dchart">{chart && <Shape chart={chart} />}</div>
    </div>
  );
}

function Shape({ chart }: { chart: ShapeChart }) {
  if (chart.kind === "hbars") {
    return (
      <div className="hbars">
        {chart.rows.map((r) => (
          <div className="brow" key={r.label} title={r.tip}>
            <span className="blabel">{r.label}</span>
            <div className="btrack">
              <div className="bfill" style={{ width: `${r.pct}%`, background: `var(${r.colorVar})` }} />
            </div>
            <span className="bval">{r.value}</span>
          </div>
        ))}
      </div>
    );
  }
  if (chart.kind === "vbars") {
    return (
      <>
        <div className="vbars">
          {chart.cols.map((c) => (
            <div className="vcol" key={c.label} title={c.tip}>
              <span className="vv">{c.value}</span>
              <span className="vfill" style={{ height: `${c.pct}%`, background: `var(${c.colorVar})` }} />
            </div>
          ))}
        </div>
        <div className="vlabs">
          {chart.cols.map((c) => (
            <span key={c.label}>{c.label}</span>
          ))}
        </div>
      </>
    );
  }
  if (chart.kind === "donut") {
    const gradient = chart.stops
      .map((s) => `var(${s.colorVar}) ${s.from.toFixed(2)}% ${s.to.toFixed(2)}%`)
      .join(",");
    return (
      <div className="donutwrap">
        <div className="donut" title={chart.tip} style={{ background: `conic-gradient(${gradient})` }}>
          <div className="dhole">
            <span className="dh-v">{chart.totalValue}</span>
            <span className="dh-l">{chart.totalLabel}</span>
          </div>
        </div>
        <div className="dleg">
          {chart.legend.map((l) => (
            <div className="lg" key={l.label}>
              <i style={{ background: `var(${l.colorVar})` }} />
              <span className="lgn">{l.label}</span>
              <span className="lgv">{l.value}</span>
              <span className="lgp">{l.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  // lollipop — rates as dots on a shared axis (rates don't sum)
  return (
    <>
      <div className="lols">
        {chart.rows.map((r) => (
          <div className="lolrow" key={r.label} title={r.tip}>
            <span className="llab">{r.label}</span>
            <div className="loltrack">
              <span className="lolstem" style={{ width: `${r.pct}%`, background: `var(${r.colorVar})` }} />
              <span className="loldot" style={{ left: `${r.pct}%`, background: `var(${r.colorVar})` }} />
            </div>
            <span className="lval">{r.value}</span>
          </div>
        ))}
      </div>
      <div className="lolaxis">
        <span>0</span>
        <span>{chart.axisMaxLabel}</span>
      </div>
    </>
  );
}

// ── Trend panel (line · dots · stacked, box-sized viewBox) ────────────────────

/** Measure an element's pixel box before paint; re-measure on resize. */
function useBox<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return { ref, ...box };
}

/** Round up to a clean chart ceiling (1/2/5 × 10^k, min 2 for hour scales). */
function niceCeil(v: number, unit: string): number {
  if (unit === "h") return Math.max(2, Math.ceil(v / 2) * 2);
  if (v <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (v <= m * pow) return m * pow;
  return 10 * pow;
}

const fmtTick = (v: number, unit: string): string =>
  `${v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v)}${unit}`;

export function CreationTrend({ trend, color }: { trend: CreationModel["trend"]; color: string }) {
  const [key, setKey] = useState(trend.series[0]?.key ?? "time");
  const s: TrendSeries = trend.series.find((x) => x.key === key) ?? trend.series[0];
  const { ref, w, h } = useBox<SVGSVGElement>();
  const pad = 8;

  // Point count follows the window grain: 30 daily points (All Time) or the
  // pinned year's ~52 weekly points — the spec decides, the chart just draws.
  const stacked = s.kind === "stacked" && s.bands != null;
  const n = stacked ? s.bands![0]?.values.length ?? 0 : s.line?.length ?? 0;
  const totals = stacked
    ? Array.from({ length: n }, (_, i) => s.bands!.reduce((a, b) => a + (b.values[i] ?? 0), 0))
    : s.line ?? [];
  const vmax = niceCeil(Math.max(...totals, 0), s.unit);
  const X = (i: number) => pad + ((w - 2 * pad) * i) / (n - 1);
  const Y = (v: number) => pad + (h - 2 * pad) * (1 - v / vmax);
  const yVals = [4, 3, 2, 1, 0].map((k) => (vmax * k) / 4);

  let paths: React.ReactNode = null;
  if (w > 0 && n > 1 && !stacked && s.line) {
    const pts = s.line.map((v, i) => `${X(i)},${Y(v)}`);
    const dLine = `M${pts.join("L")}`;
    const dArea = `${dLine}L${X(n - 1)},${h - pad}L${X(0)},${h - pad}Z`;
    paths = (
      <>
        {s.kind === "line" && (
          <path d={dArea} fill={`color-mix(in oklch, var(${color}), transparent var(--chart-area-mix))`} />
        )}
        <path
          d={dLine}
          fill="none"
          stroke={`var(${color})`}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {s.kind === "dots" &&
          s.line.map((v, i) => <circle key={i} cx={X(i)} cy={Y(v)} r={2.4} fill={`var(${color})`} />)}
      </>
    );
  } else if (w > 0 && n > 1 && stacked) {
    const cum = new Array<number>(n).fill(0);
    paths = s.bands!.map((band) => {
      const lower = [...cum];
      const upper = lower.map((l, i) => l + (band.values[i] ?? 0));
      for (let i = 0; i < n; i++) cum[i] = upper[i];
      let d = `M${X(0)} ${Y(lower[0])} `;
      for (let i = 0; i < n; i++) d += `L${X(i)} ${Y(upper[i])} `;
      for (let i = n - 1; i >= 0; i--) d += `L${X(i)} ${Y(lower[i])} `;
      return (
        <path
          key={band.name}
          d={`${d}Z`}
          fill={`var(${band.colorVar})`}
          fillOpacity={0.82}
          stroke="var(--panel-background)"
          strokeWidth={0.6}
        />
      );
    });
  }

  return (
    <Panel title="Trends">
      {/* A lone series draws no toggle (the measured-simple face) — the row
          only exists once there is a choice to make. */}
      {trend.series.length > 1 && (
        <div className="segrow">
          <span className="seglbl">Series</span>
          <div className="seg5">
            {trend.series.map((x) => (
              <button key={x.key} aria-pressed={x.key === key} onClick={() => setKey(x.key)}>
                {x.label}
              </button>
            ))}
          </div>
          {stacked && (
            <span className="lgnd">
              {s.bands!.map((b) => (
                <span className="k" key={b.name}>
                  <i style={{ background: `var(${b.colorVar})` }} />
                  {b.name}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
      <div className="trend">
        <div>
          <div className="pmeta">{trend.archivedEmpty ? "Last 30 days" : s.caption}</div>
          {trend.archivedEmpty ? (
            <div className="trend-empty">{trend.archivedEmpty}</div>
          ) : (
            <>
              <div className="chartwrap">
                <svg ref={ref} className="linechart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
                  {w > 0 && (
                    <>
                      {yVals.map((v, i) => (
                        <line key={i} x1={pad} x2={w - pad} y1={Y(v)} y2={Y(v)} stroke="var(--divider)" strokeWidth={1} />
                      ))}
                      {paths}
                    </>
                  )}
                </svg>
                {w > 0 &&
                  yVals.map((v, i) => (
                    <div key={i} className="yaxis" style={{ top: `${Y(v)}px` }}>
                      {fmtTick(v, s.unit)}
                    </div>
                  ))}
              </div>
              <div className="xaxis">
                {w > 0 &&
                  trend.xticks.map((t) => {
                    const end = t.i === 0 ? " first" : t.i === n - 1 ? " last" : "";
                    return (
                      <div key={t.i} className={`xtick${end}`} style={end ? undefined : { left: `${X(t.i)}px` }}>
                        {t.label}
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>
        <div className="spark">
          <div className="pmeta sparkhead">
            <span>{trend.sparkTitle}</span>
            {trend.sparkDelta && (
              <span className={`deltachip${trend.sparkDelta.down ? " down" : ""}`}>{trend.sparkDelta.text}</span>
            )}
          </div>
          <div className="sparkbars">
            {trend.spark.map((sp, i) => (
              <div className="col" key={i} title={sp.tip}>
                <div
                  className="bar"
                  style={
                    sp.value > 0
                      ? { height: `${(sp.value / trend.sparkMax) * 100}%`, background: `var(${sp.monthVar})` }
                      : { height: "4px", background: "var(--inset-background)" }
                  }
                />
                <span className="mo">{sp.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ── Heatmap (scope faces per categorical · measure faces when two) ────────────

const CAT_RAMP_BG: Record<number, number> = { 1: 78, 2: 52, 3: 26, 4: 0 }; // --cat-ramp complements

function CreationHeatmap({ heatmap }: { heatmap: CreationModel["heatmap"] }) {
  const [scope, setScope] = useState("intensity");
  const [measure, setMeasure] = useState<"count" | "time">(heatmap.measures ? "count" : "time");
  const legend = scope !== "intensity" ? heatmap.legends[scope] ?? [] : [];

  const cellFace = (c: CreationHeatCell) => {
    const lvl = c.levels[measure];
    if (c.day == null) return { style: { visibility: "hidden" } as CSSProperties, cls: "hcell", tip: undefined };
    const exact = c.exact[measure];
    if (scope === "intensity") {
      return { style: {}, cls: `hcell${lvl >= 1 ? ` l${lvl}` : ""}`, tip: `${c.day} · ${exact}` };
    }
    const dom = c.cats[scope]?.[measure] ?? null;
    if (lvl <= 0 || dom == null) return { style: {}, cls: "hcell", tip: `${c.day} · ${exact}` };
    return {
      style: {
        background: `color-mix(in oklch, var(${dom.slot}), var(--window-background) ${CAT_RAMP_BG[lvl]}%)`,
        boxShadow: "none",
      } as CSSProperties,
      cls: "hcell",
      tip: `${c.day} · ${dom.name} · ${exact}`,
    };
  };

  return (
    <Panel title="Activity heatmap">
      <div className="segrow">
        <span className="seglbl">Scope</span>
        <div className="seg5">
          {heatmap.scopes.map((sc) => (
            <button key={sc.key} aria-pressed={sc.key === scope} onClick={() => setScope(sc.key)}>
              {sc.label}
            </button>
          ))}
        </div>
        {heatmap.measures && (
          <>
            <span className="seglbl" style={{ marginLeft: "var(--space-5)" }}>
              Measure
            </span>
            <div className="seg5">
              {heatmap.measures.map((mm) => (
                <button key={mm.key} aria-pressed={mm.key === measure} onClick={() => setMeasure(mm.key)}>
                  {mm.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
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
              const f = cellFace(c);
              return <div key={i} className={f.cls} style={f.style} title={f.tip} />;
            })}
          </div>
        </div>
      </div>
      <div className="heatfoot">
        {scope === "intensity" ? (
          <span className="ramp">
            Less{" "}
            {[0, 1, 2, 3, 4].map((k) => (
              <span key={k} className={`sw sw${k}`} />
            ))}{" "}
            More · intensity = {heatmap.measureNoun[measure]}
          </span>
        ) : (
          <span className="catleg" style={{ display: "flex" }}>
            {legend.map((l) => (
              <span className="lg" key={l.label}>
                <span className="sw" style={{ background: `var(${l.colorVar})` }} />
                {l.label}
              </span>
            ))}
          </span>
        )}
      </div>
      <div
        className="trow"
        style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", marginTop: "var(--space-6)" }}
      >
        {heatmap.trio.map((t, i) => (
          <div className="tile" key={i}>
            <span className="tl">{t.label}</span>
            <span className="tv">
              {t.value}
              {t.unit && <span className="u">{t.unit}</span>}
            </span>
            {t.subtitle && <span className="ts">{t.subtitle}</span>}
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── Hero cards (kit-card-hero — the library) ──────────────────────────────────

function HeroSpark({ s }: { s: HeroSpec["sparks"][number] }) {
  const w = 100,
    h = 40,
    p = 3;
  const mx = Math.max(...s.values, 0) || 1;
  const n = s.values.length;
  const X = (i: number) => p + ((w - 2 * p) * i) / (n - 1);
  const Y = (v: number) => (s.flat ? h - p - 2 : p + (h - 2 * p) * (1 - v / mx));
  const dl = s.values.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const da = `${dl} L${X(n - 1).toFixed(1)} ${h - p} L${X(0).toFixed(1)} ${h - p} Z`;
  return (
    <div className="hspark">
      <div className="shlabel">
        <span>{s.label}</span>
        <span>30 d</span>
      </div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none">
        <path d={da} style={{ fill: `color-mix(in oklch, var(${s.colorVar}), transparent var(--chart-area-mix))` }} />
        <path
          d={dl}
          fill="none"
          stroke={`var(${s.colorVar})`}
          strokeWidth={1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function HeroCard({ h }: { h: HeroSpec }) {
  const pillStyle: CSSProperties | undefined = h.pill
    ? {
        background: `color-mix(in oklch, var(${h.pill.colorVar}), var(--panel-background) var(--tint-mix))`,
        borderColor: `color-mix(in oklch, var(${h.pill.colorVar}), var(--panel-background) var(--tint-border))`,
        color: `color-mix(in oklch, var(${h.pill.colorVar}), var(--text-strong) 30%)`,
      }
    : undefined;
  return (
    <div className="hero">
      <div className="hbanner" />
      <div className="hscrim" />
      <div className="hbody">
        <div className="hcover" title={`${h.title} · cover`}>
          <span className="cinit">{h.initial}</span>
        </div>
        <div className="hmain">
          <div className="htitlerow">
            <span className="htitle">{h.title}</span>
            {h.pill && (
              <span className="hpill" style={pillStyle}>
                {h.pill.label}
              </span>
            )}
          </div>
          {h.secondary && (
            <div className="hfandom">
              {h.secondary.label}: <b>{h.secondary.value}</b>
            </div>
          )}
          <div className="hstats" style={{ gridTemplateColumns: `repeat(${h.cols},1fr)` }}>
            {h.tiles.map((t) => (
              <div className="htile" key={t.l}>
                <span className="hv">
                  {t.v}
                  {t.u && <span className="u">{t.u}</span>}
                </span>
                <span className="hl">{t.l}</span>
              </div>
            ))}
          </div>
          <div className="hsparks" style={h.sparks.length > 1 ? { gridTemplateColumns: "1fr 1fr" } : undefined}>
            {h.sparks.map((s) => (
              <HeroSpark key={s.label} s={s} />
            ))}
          </div>
        </div>
      </div>
      <div className="harc">
        <span className="adot" style={{ background: `var(${h.arc.dotVar})` }} />
        <span>
          Started <b>{h.arc.started}</b> →{" "}
          {h.arc.end.kind === "ongoing" ? (
            <b>ongoing</b>
          ) : h.arc.end.kind === "hiatus" ? (
            <>
              <b>on hiatus</b> since {h.arc.end.since}
            </>
          ) : (
            <b>completed {h.arc.end.date}</b>
          )}
        </span>
      </div>
    </div>
  );
}

function EmptyState({ name }: { name: string }) {
  return (
    <div className="gs-empty" style={{ display: "block" }}>
      <div className="emptybox gen">
        <div className="eh">Nothing tracked yet</div>
        <div className="es">
          {name}'s stats appear here once it has sessions — its projects live on this same screen as
          hero cards, so the one door that fills it is a first entry.
        </div>
        <div className="edoors">
          <button className="btn-accent" type="button">+ New entry</button>
          <button className="btn-plain" type="button">Set an icon</button>
        </div>
      </div>
    </div>
  );
}
