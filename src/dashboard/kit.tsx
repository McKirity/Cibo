/**
 * The dashboard kit blocks as React — the renderer half of spec-then-render.
 * Each component walks a piece of the DashboardModel and emits the exact frozen
 * markup (class names from `Final/gaming-stats.html`), styled entirely by the
 * claimed rules in `../dashboard.css` (dials only; no values here).
 *
 * These are the consumption template's blocks; every later dashboard reuses
 * them. Nothing Gaming-specific lives here — the model carries the data.
 */
import { useLayoutEffect, useRef, useState } from "react";
import type {
  DistColumnSpec,
  LeaderColumnSpec,
  TileSpec,
} from "./consumptionSpec";

// ── kit-panel ─────────────────────────────────────────────────────────────────

export function Panel({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="phead">
        <span className="ptitle">{title}</span>
        {right}
      </div>
      {children}
    </section>
  );
}

// ── kit-tile-stat ─────────────────────────────────────────────────────────────

export function StatTile({ t }: { t: TileSpec }) {
  if (t.list) {
    return (
      <div className="tile tlist">
        <span className="tl">{t.label}</span>
        <span className="tv">
          <span className="tdt">{t.list.dateLine}</span>
          {t.value}
          {t.unit && <span className="u">{t.unit}</span>}
        </span>
        <span className="tsl tsl-table">
          {t.list.rows.map((r, i) => (
            <span key={i} style={{ display: "contents" }}>
              <span className="k">{r.k}</span>
              <span className="v">{r.v}</span>
            </span>
          ))}
        </span>
      </div>
    );
  }
  const value = (
    <>
      {t.value}
      {t.unit && <span className="u">{t.unit}</span>}
    </>
  );
  return (
    <div className="tile">
      <span className="tl">{t.label}</span>
      {t.delta ? (
        <div className="tvrow">
          <span className="tv">{value}</span>
          <span className={`deltachip${t.delta.down ? " down" : ""}`}>{t.delta.text}</span>
        </div>
      ) : (
        <span className={`tv${t.dateValue ? " date" : ""}`}>{value}</span>
      )}
      {t.subtitle && <span className="ts">{t.subtitle}</span>}
    </div>
  );
}

export function StatGroup({ label, tiles, tall }: { label: string; tiles: TileSpec[]; tall?: boolean }) {
  return (
    <div className="tgroup">
      <div className="tlabel">{label}</div>
      <div className={`trow${tall ? " tall" : ""}`}>
        {tiles.map((t, i) => (
          <StatTile key={i} t={t} />
        ))}
      </div>
    </div>
  );
}

// ── kit-bars-distribution ─────────────────────────────────────────────────────

export function DistributionColumns({ columns }: { columns: DistColumnSpec[] }) {
  return (
    <div className="trio grouped">
      {columns.map((c) => (
        <div className="dcol" key={c.title}>
          <div className="chead">
            <span className="ct">{c.title}</span>
            {c.meta && <span className="cm">{c.meta}</span>}
          </div>
          <div className="bars">
            {c.rows.map((r, i) => (
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
      ))}
    </div>
  );
}

// ── kit-leaderboard ───────────────────────────────────────────────────────────

export function LeaderboardColumns({ columns }: { columns: LeaderColumnSpec[] }) {
  return (
    <div className="trio grouped">
      {columns.map((c) => (
        <div className="dcol" key={c.title}>
          <div className="chead">
            <span className="ct">{c.title}</span>
            {c.meta && <span className="cm">{c.meta}</span>}
          </div>
          {c.rows && (
            <div>
              {c.rows.map((r) => (
                <button className="lrow" key={r.rank} title={r.title}>
                  <span className="ltrack">
                    <span className="lprog" style={{ width: `${r.pct}%` }} />
                  </span>
                  <span className="ltitle">
                    <span className="rank">{r.rank}</span>
                    <span className="nm">{r.title}</span>
                  </span>
                  <span className="lval">{r.value}</span>
                </button>
              ))}
            </div>
          )}
          {c.hall && (
            <div className="hall">
              {c.hall.map((h, i) => (
                <div className="cover" key={i} title={`${h.title} · ★★★★★`}>
                  <span className="cinit">{h.initial}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── kit-panel-trend: the box-sized-viewBox line chart ─────────────────────────
// Sizes its viewBox to the real pixel box at draw time (writing-stats' technique,
// ruled for the shared primitive at step 4 — never a fixed viewBox + stretch).

/**
 * The trend chart: box-sized viewBox (the ruled technique — measure the pixel
 * box, viewBox = that box, redraw on resize), and it renders its OWN axis labels
 * positioned on the gridline/data coordinates so they align to the marks and
 * inset from the edges (the chart's internal `pad`) rather than hugging them.
 */
function TrendChart({
  line,
  vmax,
  xticks,
  color,
}: {
  line: number[];
  vmax: number;
  xticks: { i: number; label: string }[];
  color: string;
}) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  // Synchronous measure before paint (clientWidth forces layout) so the chart
  // draws on the first frame; a ResizeObserver + window resize keep it in sync.
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

  const { w, h } = box;
  const pad = 8;
  const n = line.length;
  const X = (i: number) => pad + ((w - 2 * pad) * i) / (n - 1);
  const Y = (v: number) => pad + (h - 2 * pad) * (1 - v / vmax);
  const pts = line.map((v, i) => `${X(i)},${Y(v)}`);
  const dLine = w > 0 ? `M${pts.join("L")}` : "";
  const dArea = w > 0 ? `${dLine}L${X(n - 1)},${h - pad}L${X(0)},${h - pad}Z` : "";
  const yVals = [4, 3, 2, 1, 0].map((k) => (vmax * k) / 4);

  return (
    <>
      <div className="chartwrap">
        <svg ref={ref} className="linechart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
          {w > 0 && (
            <>
              {yVals.map((v, i) => (
                <line key={i} x1={pad} x2={w - pad} y1={Y(v)} y2={Y(v)} stroke="var(--divider)" strokeWidth={1} />
              ))}
              <path d={dArea} fill={`color-mix(in oklch, var(${color}), transparent var(--chart-area-mix))`} />
              <path d={dLine} fill="none" stroke={`var(${color})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </>
          )}
        </svg>
        {w > 0 &&
          yVals.map((v, i) => (
            <div key={i} className="yaxis" style={{ top: `${Y(v)}px` }}>
              {v}h
            </div>
          ))}
      </div>
      <div className="xaxis">
        {w > 0 &&
          xticks.map((t) => {
            const end = t.i === 0 ? " first" : t.i === n - 1 ? " last" : "";
            return (
              <div key={t.i} className={`xtick${end}`} style={end ? undefined : { left: `${X(t.i)}px` }}>
                {t.label}
              </div>
            );
          })}
      </div>
    </>
  );
}

export function TrendPanel({
  caption,
  line,
  vmax,
  xticks,
  sparkTitle,
  sparkDelta,
  spark,
  sparkMax,
  color,
}: {
  caption: string;
  line: number[];
  vmax: number;
  xticks: { i: number; label: string }[];
  sparkTitle: string;
  sparkDelta: { text: string; down: boolean } | null;
  spark: { label: string; hours: number; monthVar: string }[];
  sparkMax: number;
  color: string;
}) {
  return (
    <Panel title="Trends">
      <div className="trend">
        <div>
          <div className="pmeta">{caption}</div>
          <TrendChart line={line} vmax={vmax} xticks={xticks} color={color} />
        </div>
        <div className="spark">
          <div className="pmeta sparkhead">
            <span>{sparkTitle}</span>
            {sparkDelta && <span className={`deltachip${sparkDelta.down ? " down" : ""}`}>{sparkDelta.text}</span>}
          </div>
          <div className="sparkbars">
            {spark.map((s, i) => (
              <div className="col" key={i} title={`${s.label} · ${s.hours > 0 ? `${Math.round(s.hours)} h` : "—"}`}>
                <div
                  className="bar"
                  style={
                    s.hours > 0
                      ? { height: `${(s.hours / sparkMax) * 100}%`, background: `var(${s.monthVar})` }
                      : { height: "4px", background: "var(--inset-background)" }
                  }
                />
                <span className="mo">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ── kit-grid-heatmap ──────────────────────────────────────────────────────────

const HEAT_WORDS = ["no play", "~45 min", "1 h 30", "3 h 10", "5 h+"];

export function Heatmap({
  cells,
  months,
  trio,
}: {
  cells: { day: string | null; minutes: number; level: number }[];
  months: { col: number; label: string }[];
  trio: TileSpec[];
}) {
  const ramp = (
    <div className="pmeta ramp">
      Intensity
      {[0, 1, 2, 3, 4].map((k) => (
        <span key={k} className={`sw sw${k}`} />
      ))}
    </div>
  );
  return (
    <Panel title="Activity heatmap" right={ramp}>
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
            {months.map((m) => (
              <span key={m.col} style={{ gridColumnStart: m.col + 1 }}>
                {m.label}
              </span>
            ))}
          </div>
          <div className="cells">
            {cells.map((c, i) => (
              <div
                key={i}
                className={`hcell${c.level >= 1 ? ` l${c.level}` : ""}`}
                style={c.level < 0 ? { visibility: "hidden" } : undefined}
                title={c.day ? `${c.day} · ${HEAT_WORDS[c.level]}` : undefined}
              />
            ))}
          </div>
        </div>
      </div>
      <div
        className="trow"
        style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", marginTop: "var(--space-6)" }}
      >
        {trio.map((t, i) => (
          <StatTile key={i} t={t} />
        ))}
      </div>
    </Panel>
  );
}
