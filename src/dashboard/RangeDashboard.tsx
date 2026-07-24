/**
 * Build step 6 · chunk 3 — the range habit dashboard (Sleep, canon's sole
 * range habit). The simple chassis PLUS the range chart family — the bed &
 * wake dual band (night-centric time-of-day axis that wraps midnight) and the
 * duration line with its quiet 8-hour reference band (INFORMATION, not a
 * target — no judgment colour). One flag donut per declared flag,
 * definition-minted. Frozen reference: `sleep-stats.html`.
 *
 * The range charts are ruled screen-specific composition (they fail the
 * >1-screen membership test) — drawn here with the shared box-sized-viewBox
 * technique, not minted as kit blocks.
 */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRangeData } from "./useRangeData";
import { buildRangeDashboard, h18, fmtHM, type RangeModel } from "./rangeSpec";
import type { ScopeSel } from "./creationSpec";
import { Panel, StatGroup, StatTile } from "./kit";
import "../dashboard.css";
import "./screen.css";

const todayLocal = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const HEAT_CLASS: Record<string, string> = { HOT: "hot", WARM: "warm", COOLING: "warm", COLD: "cold" };

export function RangeDashboard({ habitKey }: { habitKey: string }) {
  const data = useRangeData(habitKey);
  const [today] = useState(todayLocal);
  const [scope, setScope] = useState<ScopeSel>({ kind: "all" });

  const { model, ms } = useMemo(() => {
    const t0 = performance.now();
    const model = buildRangeDashboard(
      {
        habitKey,
        colourSlot: data.colourSlot,
        name: data.name,
        archived: data.archived,
        sessions: data.sessions,
        today,
        flagDefs: data.flagDefs,
        flagBySession: data.flagBySession,
        derivedRules: data.derivedRules,
      },
      scope,
    );
    return { model, ms: performance.now() - t0 };
  }, [data, habitKey, scope, today]);

  if (!data.ready) return <div className="gsdash">Loading {habitKey}…</div>;

  const m = model;
  const color = m.colorVar;

  return (
    <div className="gsdash rangedash" style={{ "--heat-hue": `var(${color})` } as CSSProperties}>
      <div className="perf-line">
        derived in {ms.toFixed(1)} ms · {data.sessions.length} nights · scope{" "}
        {scope.kind === "all" ? "All Time" : scope.year}
      </div>

      {m.masthead.empty ? (
        <EmptyState name={m.masthead.name} />
      ) : (
        <div className="gs">
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
            {/* ── 2 · The range stat row ── */}
            <Panel title="At a glance">
              <StatGroup label={m.statRow.label} tiles={m.statRow.tiles} />
            </Panel>

            {/* ── 3 · The range charts, side by side ── */}
            <Panel title="Range">
              <div className="range-split">
                <BedWakeChart charts={m.charts} color={color} />
                <DurationChart months={m.charts.months} color={color} />
              </div>
            </Panel>

            {/* ── 4 · One flag donut per declared flag ── */}
            {m.flags.panels.length > 0 && (
              <Panel title="Flags">
                <div className="flags" style={{ display: "grid", gridTemplateColumns: `repeat(${m.flags.panels.length},1fr)`, gap: "var(--space-7)" }}>
                  {m.flags.panels.map((f) => (
                    <div className="flagpanel" key={f.name}>
                      <div className="fname">{f.name}</div>
                      <div className="fmeta">{f.meta}</div>
                      <div className="donut" title={f.tip} style={{ position: "relative" }}>
                        <svg viewBox="0 0 42 42">
                          <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--inset-background)" strokeWidth="8" />
                          <circle
                            cx="21"
                            cy="21"
                            r="15.9155"
                            fill="none"
                            stroke={`var(${color})`}
                            strokeWidth="8"
                            strokeDasharray={`${f.pct} ${100 - f.pct}`}
                          />
                        </svg>
                        <div className="dcenter">
                          <span className="dval">{f.days.toLocaleString()}</span>
                          <span className="dsub">{m.flags.noun}</span>
                        </div>
                      </div>
                      <div className="fpct">
                        {f.pct}%<span> of {m.flags.noun}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {/* ── 5 · Duration heatmap + trio ── */}
            <Panel
              title="Duration heatmap"
              right={
                <span className="pmeta ramp">
                  {[0, 1, 2, 3, 4].map((k) => (
                    <span key={k} className={`sw sw${k}`} />
                  ))}
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
                    {m.heatmap.months.map((mo) => (
                      <span key={mo.col} style={{ gridColumnStart: mo.col + 1 }}>
                        {mo.label}
                      </span>
                    ))}
                  </div>
                  <div className="cells">
                    {m.heatmap.cells.map((c, i) => (
                      <div
                        key={i}
                        className={`hcell${c.level > 0 ? ` l${c.level}` : ""}`}
                        style={c.day == null ? { visibility: "hidden" } : undefined}
                        title={c.day ? c.tip : undefined}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div
                className="trow"
                style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", marginTop: "var(--space-6)" }}
              >
                {m.heatmap.trio.map((t, i) => (
                  <StatTile key={i} t={t} />
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Chart plumbing (box-sized viewBox — the step-4 ruling) ────────────────────

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

/** Break a per-month series into contiguous non-null path segments. */
function segments<T>(months: T[], get: (m: T) => number | null): { i: number; v: number }[][] {
  const out: { i: number; v: number }[][] = [];
  let cur: { i: number; v: number }[] = [];
  months.forEach((mo, i) => {
    const v = get(mo);
    if (v == null) {
      if (cur.length > 0) out.push(cur);
      cur = [];
    } else {
      cur.push({ i, v });
    }
  });
  if (cur.length > 0) out.push(cur);
  return out;
}

function BedWakeChart({ charts, color }: { charts: RangeModel["charts"]; color: string }) {
  const { ref, w, h } = useBox<SVGSVGElement>();
  const pad = 8;
  const months = charts.months;
  const n = months.length;
  const X = (i: number) => pad + ((w - 2 * pad) * i) / (n - 1);
  // Night-centric y: hours since 18:00, 0..18 (evening on top, midday below).
  const Y = (clockHours: number) => pad + (h - 2 * pad) * (h18(clockHours) / 18);
  const yTicks = [21, 24, 27, 30, 33]; // 21:00 · 00:00 · 03:00 · 06:00 · 09:00

  const band = (key: "bed" | "wake", opacity: number) =>
    segments(months, (mo) => (mo[key] ? 1 : null)).map((seg, si) => {
      let d = "";
      seg.forEach(({ i }, k) => {
        d += `${k === 0 ? "M" : "L"}${X(i)} ${Y(months[i][key]!.e)} `;
      });
      for (let k = seg.length - 1; k >= 0; k--) d += `L${X(seg[k].i)} ${Y(months[seg[k].i][key]!.l)} `;
      return <path key={`${key}${si}`} d={`${d}Z`} fill={`var(${color})`} opacity={opacity} />;
    });
  const avgLine = (key: "bed" | "wake", dashed: boolean) =>
    segments(months, (mo) => mo[key]?.a ?? null).map((seg, si) => {
      let d = "";
      seg.forEach(({ i, v }, k) => {
        d += `${k === 0 ? "M" : "L"}${X(i)} ${Y(v)} `;
      });
      return (
        <path
          key={`${key}a${si}`}
          d={d}
          fill="none"
          stroke={`var(${color})`}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={dashed ? "5 4" : undefined}
          opacity={dashed ? 0.75 : 1}
        />
      );
    });

  return (
    <div className="rchart">
      <div className="rchart-head">
        <span className="ct">Bed &amp; wake</span>
      </div>
      <div className="chartwrap">
        <svg ref={ref} className="rangechart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
          {w > 0 && (
            <>
              {yTicks.map((c) => (
                <line
                  key={c}
                  x1={pad}
                  x2={w - pad}
                  y1={Y(c >= 24 ? c - 24 : c)}
                  y2={Y(c >= 24 ? c - 24 : c)}
                  stroke="var(--divider)"
                  strokeWidth={1}
                />
              ))}
              {band("bed", 0.22)}
              {band("wake", 0.12)}
              {avgLine("bed", false)}
              {avgLine("wake", true)}
              {months.map((mo, i) => (
                <rect
                  key={i}
                  x={X(i) - (w - 2 * pad) / (n - 1) / 2}
                  y={0}
                  width={(w - 2 * pad) / (n - 1)}
                  height={h}
                  fill="transparent"
                >
                  <title>
                    {mo.bed && mo.wake
                      ? `${mo.name} · bed ${fmtHM(mo.bed.a * 60)} (${fmtHM(((mo.bed.e % 24) + 24) % 24 * 60)}–${fmtHM(((mo.bed.l % 24) + 24) % 24 * 60)}) · wake ${fmtHM(mo.wake.a * 60)} (${fmtHM(((mo.wake.e % 24) + 24) % 24 * 60)}–${fmtHM(((mo.wake.l % 24) + 24) % 24 * 60)})`
                      : `${mo.name} · no nights`}
                  </title>
                </rect>
              ))}
            </>
          )}
        </svg>
        {w > 0 &&
          yTicks.map((c) => (
            <div key={c} className="yaxis" style={{ top: `${Y(c >= 24 ? c - 24 : c)}px` }}>
              {fmtHM((c >= 24 ? c - 24 : c) * 60)}
            </div>
          ))}
      </div>
      <div className="xaxis">
        {w > 0 &&
          months.map((mo, i) => {
            const end = i === 0 ? " first" : i === n - 1 ? " last" : "";
            return (
              <div key={i} className={`xtick${end}`} style={end ? undefined : { left: `${X(i)}px` }}>
                {mo.label}
              </div>
            );
          })}
      </div>
      <div className="rlegend">
        <span className="k">
          <span className="ksw" style={{ background: `var(${color})` }} />
          bedtime band · avg {charts.avgBed}
        </span>
        <span className="k">
          <span className="ksw" style={{ background: `var(${color})`, opacity: 0.5 }} />
          wake band · avg {charts.avgWake}
        </span>
      </div>
    </div>
  );
}

function DurationChart({ months, color }: { months: RangeModel["charts"]["months"]; color: string }) {
  const { ref, w, h } = useBox<SVGSVGElement>();
  const pad = 8;
  const n = months.length;
  // Zoomed y-domain (user-ruled 2026-07-23, live iteration — overrides the
  // FINAL's fixed 0–10 h axis): durations hover around 8 h, so the axis hugs
  // the data to make the small changes legible. Padded ±30 min, snapped to
  // half-hours, and always keeping the 8 h reference band in frame.
  const vals = months.map((mo) => mo.durationH).filter((v): v is number => v != null);
  const lo = vals.length > 0 ? Math.min(...vals, 7.6) : 0;
  const hi = vals.length > 0 ? Math.max(...vals, 8.4) : 10;
  const vmin = Math.max(0, Math.floor((lo - 0.5) * 2) / 2);
  const vmax = Math.ceil((hi + 0.5) * 2) / 2;
  // Whole-hour ticks; half-hour steps when the window is tighter than 3 h.
  const step = vmax - vmin < 3 ? 0.5 : 1;
  const yTicks: number[] = [];
  for (let v = Math.ceil(vmin / step) * step; v <= vmax + 1e-9; v += step) yTicks.push(v);
  const fmtHTick = (v: number) => (Number.isInteger(v) ? `${v}h` : `${v.toFixed(1)}h`);
  const X = (i: number) => pad + ((w - 2 * pad) * i) / (n - 1);
  const Y = (v: number) => pad + (h - 2 * pad) * (1 - (v - vmin) / (vmax - vmin));
  const segs = segments(months, (mo) => mo.durationH);

  return (
    <div className="rchart">
      <div className="rchart-head">
        <span className="ct">Sleep duration</span>
      </div>
      <div className="chartwrap">
        <svg ref={ref} className="rangechart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
          {w > 0 && (
            <>
              {yTicks.map((v) => (
                <line key={v} x1={pad} x2={w - pad} y1={Y(v)} y2={Y(v)} stroke="var(--divider)" strokeWidth={1} />
              ))}
              {/* The 8 h reference band — a neutral wash + dashed centerline.
                  INFORMATION, not a target: no judgment colour, ever. */}
              <rect x={pad} y={Y(8.4)} width={w - 2 * pad} height={Y(7.6) - Y(8.4)} fill="var(--text-muted)" opacity={0.12} />
              <line x1={pad} x2={w - pad} y1={Y(8)} y2={Y(8)} stroke="var(--text-muted)" strokeWidth={1.2} strokeDasharray="5 4" opacity={0.55} />
              {segs.map((seg, si) => {
                let dLine = "";
                seg.forEach(({ i, v }, k) => {
                  dLine += `${k === 0 ? "M" : "L"}${X(i)} ${Y(v)} `;
                });
                const first = seg[0];
                const last = seg[seg.length - 1];
                const dArea = `${dLine}L${X(last.i)} ${h - pad} L${X(first.i)} ${h - pad} Z`;
                return (
                  <g key={si}>
                    <path d={dArea} fill={`color-mix(in oklch, var(${color}), transparent var(--chart-area-mix))`} />
                    <path d={dLine} fill="none" stroke={`var(${color})`} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                  </g>
                );
              })}
              {months.map((mo, i) => (
                <rect
                  key={i}
                  x={X(i) - (w - 2 * pad) / (n - 1) / 2}
                  y={0}
                  width={(w - 2 * pad) / (n - 1)}
                  height={h}
                  fill="transparent"
                >
                  <title>
                    {mo.durationH != null
                      ? `${mo.name} · avg ${Math.floor(mo.durationH)} h ${String(Math.round((mo.durationH - Math.floor(mo.durationH)) * 60)).padStart(2, "0")}`
                      : `${mo.name} · no nights`}
                  </title>
                </rect>
              ))}
            </>
          )}
        </svg>
        {w > 0 &&
          yTicks.map((v) => (
            <div key={v} className="yaxis" style={{ top: `${Y(v)}px` }}>
              {fmtHTick(v)}
            </div>
          ))}
      </div>
      <div className="xaxis">
        {w > 0 &&
          months.map((mo, i) => {
            const end = i === 0 ? " first" : i === n - 1 ? " last" : "";
            return (
              <div key={i} className={`xtick${end}`} style={end ? undefined : { left: `${X(i)}px` }}>
                {mo.label}
              </div>
            );
          })}
      </div>
      <div className="rlegend">
        <span className="k">
          <span className="ksw" style={{ background: `var(${color})` }} />
          duration / night
        </span>
        <span className="k">
          <span className="ksw" style={{ background: "var(--text-muted)", opacity: 0.5 }} />
          8 h reference band
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
          {name}'s stats appear here once it has nights logged — durations, bed &amp; wake ranges,
          flags, and the heatmap all build from what you log. One door fills this dashboard:
        </div>
        <div className="edoors">
          <button className="btn-accent" type="button">Log a night</button>
          <button className="btn-plain" type="button">Set an icon</button>
        </div>
      </div>
    </div>
  );
}
