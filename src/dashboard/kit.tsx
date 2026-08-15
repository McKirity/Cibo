/**
 * The dashboard kit blocks as React — the renderer half of spec-then-render.
 * Each component walks a piece of the DashboardModel and emits the exact frozen
 * markup (class names from `Final/gaming-stats.html`), styled entirely by the
 * claimed rules in `../dashboard.css` (dials only; no values here).
 *
 * These are the consumption template's blocks; every later dashboard reuses
 * them. Nothing Gaming-specific lives here — the model carries the data.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useBox } from "./useBox";
import { heatRowLabels } from "../metrics/dates";
import { tileRowPlan } from "./tileRows";
import { CoverInner } from "../kit/CoverArt";
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

export function StatTile({ t, span }: { t: TileSpec; span?: number }) {
  // How many grid tracks this tile occupies. Unset (the fixed-trio callers)
  // means one track, which is what a bare grid item does anyway.
  const spanStyle: CSSProperties | undefined =
    span != null && span > 1 ? { gridColumn: `span ${span}` } : undefined;
  if (t.list) {
    return (
      <div className="tile tlist" style={spanStyle}>
        <span className="tl">{t.label}</span>
        <span className="tv" style={t.big ? { fontSize: "var(--size-heading)" } : undefined}>
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
  // `big` on a plain tile wears the drawn `tv sm` class (the frozen entry
  // FINAL's First/Last-day face — heading-size, smaller than the stat value);
  // list tiles style the same size inline above (2026-07-30).
  const tvClass = `tv${t.big ? " sm" : ""}`;
  return (
    <div className="tile" style={spanStyle}>
      <span className="tl">{t.label}</span>
      {t.delta ? (
        <div className="tvrow">
          <span className={tvClass}>{value}</span>
          <span className={`deltachip${t.delta.down ? " down" : ""}`}>{t.delta.text}</span>
        </div>
      ) : (
        <span className={tvClass}>{value}</span>
      )}
      {t.subtitle && <span className="ts">{t.subtitle}</span>}
    </div>
  );
}

export function StatGroup({ label, tiles, tall }: { label: string; tiles: TileSpec[]; tall?: boolean }) {
  // Balanced rows, flush to both edges (ruled 2026-08-10): the plan comes from
  // the group's own size — every tile is one column-worth, list tiles included,
  // and a short last row widens its tiles rather than leaving a gap. This is the
  // one renderer every variable-length tile group goes through, which is why the
  // ruling costs a couple of lines here rather than a sweep.
  const plan = tileRowPlan(tiles.length);
  return (
    <div className="tgroup">
      <div className="tlabel">{label}</div>
      <div
        className={`trow${tall ? " tall" : ""}`}
        style={{ "--trow-cols": plan.tracks } as CSSProperties}
      >
        {tiles.map((t, i) => (
          <StatTile key={i} t={t} span={plan.spans[i]} />
        ))}
      </div>
    </div>
  );
}

// ── kit-bars-distribution ─────────────────────────────────────────────────────

export function DistributionColumns({ columns }: { columns: DistColumnSpec[] }) {
  // Charts flex to fill the panel (standing rule, 2026-07-21): the grid always
  // has exactly as many equal tracks as columns — four across (Reading/Media
  // All-types), three, two, or one — never a fixed grid that leaves empty space.
  return (
    <div className="trio grouped" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
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
                  <div className="bfill" style={{ width: `${r.pct}%`, ["--series" as string]: `var(${r.colorVar})` }} />
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

export function LeaderboardColumns({
  columns,
  onOpenEntry,
}: {
  columns: LeaderColumnSpec[];
  /** Entry doors (chunk 5) — rows + hall covers open the entry dashboard. */
  onOpenEntry?: (entryId: string) => void;
}) {
  // Flex to fill (standing rule): as many tracks as columns, so a degraded
  // 2-column board fills the panel width instead of leaving a dead third track.
  return (
    <div className="trio grouped" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
      {columns.map((c) => (
        <div className="dcol" key={c.title}>
          <div className="chead">
            <span className="ct">{c.title}</span>
            {c.meta && <span className="cm">{c.meta}</span>}
          </div>
          {c.rows && (
            <div>
              {c.rows.map((r) => (
                <button
                  className="lrow"
                  key={r.rank}
                  title={r.title}
                  onClick={r.entryId && onOpenEntry ? () => onOpenEntry(r.entryId!) : undefined}
                >
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
                <div
                  className="cover"
                  key={i}
                  title={`${h.title} · ★★★★★`}
                  role={h.entryId && onOpenEntry ? "button" : undefined}
                  onClick={h.entryId && onOpenEntry ? () => onOpenEntry(h.entryId!) : undefined}
                >
                  <CoverInner cover={h.cover} label={h.initial} />
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
  // Box-sized viewBox: the SVG's viewBox equals its measured pixel box (shared
  // useBox hook — a ResizeObserver keeps it in sync, redrawing on resize).
  const { ref, w, h } = useBox<SVGSVGElement>();
  // `pad` is HEADROOM ONLY since 2026-08-15 — it was applied at BOTH ends, so
  // the zero gridline floated 8px above the SVG's bottom edge and no CSS could
  // line the neighbouring bar chart up with a line drawn inside someone else's
  // viewBox. With the bottom pad gone the baseline IS `.chartwrap`'s bottom,
  // which is a box the sibling column can be measured against. Measured: the
  // zero line sat at 637 while the bars' feet sat at 627.
  const pad = 8;
  const n = line.length;
  // A 1-bucket window has no line to draw: guard the n−1 denominator (the
  // single point centres) and skip the paths — CreationTrend's pattern (2026-07-30).
  const X = (i: number) => (n > 1 ? pad + ((w - 2 * pad) * i) / (n - 1) : w / 2);
  const Y = (v: number) => pad + (h - pad) * (1 - v / vmax);
  const pts = line.map((v, i) => `${X(i)},${Y(v)}`);
  const dLine = w > 0 && n > 1 ? `M${pts.join("L")}` : "";
  const dArea = w > 0 && n > 1 ? `${dLine}L${X(n - 1)},${h}L${X(0)},${h}Z` : "";
  const yVals = [4, 3, 2, 1, 0].map((k) => (vmax * k) / 4);

  return (
    <>
      <div className="chartwrap">
        {/* `--trend-hue` + the .trendline class (2026-08-03): the lead trace is
            the ONLY path a theme should be able to single out. Before this the
            kit drew every series as a bare `path[fill="none"]`, so a theme
            reaching for the lead could only match all of them — the Blame! v5
            pass did exactly that and bloomed supporting series by accident.
            The class names the lead; the custom property hands over its hue so
            a theme paints in the CHART'S colour, not its own first slot. */}
        <svg
          ref={ref}
          className="linechart"
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ ["--trend-hue" as string]: `var(${color})` }}
        >
          {w > 0 && (
            <>
              {yVals.map((v, i) => (
                <line key={i} x1={pad} x2={w - pad} y1={Y(v)} y2={Y(v)} stroke="var(--divider)" strokeWidth={1} />
              ))}
              <path d={dArea} fill={`color-mix(in oklch, var(${color}), transparent var(--chart-area-mix))`} />
              <path className="trendline" d={dLine} fill="none" stroke={`var(${color})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
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

// The duration words are shared; the zero-level word is per-habit (the
// `zeroWord` prop) — "no play" is only the Gaming/default face.
const HEAT_WORDS = ["no play", "~45 min", "1 h 30", "3 h 10", "5 h+"];
/** By-Type/categorical cell fill: the dominant slot's cat colour over the
 *  canvas at the --cat-ramp complement (background share) per level — READ
 *  via the published --cat-bg-N dials (src/theme/derived.ts; step 6a retired
 *  the transcribed {78,52,26,0} table). ONE helper — CreationDashboard's
 *  heatmap imports it too. */
export const catCellFill = (slotVar: string, level: number): string =>
  `color-mix(in oklch, var(${slotVar}), var(--window-background) var(--cat-bg-${level}))`;

/**
 * THE HEAT POOL'S CENTRE — where the block's activity actually concentrates,
 * published as `--pool-x` / `--pool-y` on the `.heat` element.
 *
 * User-ruled 2026-08-03 ("Yes, follow real data"). It exists for the theme
 * layer: a theme may paint the heatmap as ONE emitting surface whose glow
 * pools over the hot region ([[Blame!]]'s collective heat glow — "the chart
 * itself glows, emitting where it's strongest"). Publishing the centroid is
 * the app's whole share of that: no theme is named here, nothing renders
 * differently without a theme that opts in, and a theme that ignores these
 * properties is unaffected.
 *
 * CUBE-WEIGHTED so hot cells dominate — a linear mean drifts toward the
 * middle of any well-spread year and stops meaning "where it's strongest".
 * Level 0 contributes nothing (no activity, no burn) and hidden padding cells
 * (level -1) are skipped. An empty grid publishes NOTHING, so the theme's own
 * fallback placement stands rather than collapsing to a corner.
 *
 * Grid order is the one `heatmapGrid` builds and `.heat .cells` renders:
 * row-major over 7 weekday rows (`for row { for col }` against
 * `grid-template-columns: repeat(N,1fr)`), so index → col = i % weeks,
 * row = floor(i / weeks).
 *
 * `levelOf` is explicit because the four heat families disagree on what a
 * level IS: the intensity map stores one, the creation/entry maps store one
 * PER MEASURE (so the pool must follow the toggle the user is looking at),
 * and the measureless map stores a boolean — every logged day burns alike.
 */
export function heatPoolStyle<T>(cells: T[], levelOf: (cell: T) => number): CSSProperties | undefined {
  const weeks = Math.max(1, Math.round(cells.length / 7));
  let wx = 0;
  let wy = 0;
  let total = 0;
  for (let i = 0; i < cells.length; i++) {
    const level = levelOf(cells[i]);
    if (!(level > 0)) continue;
    const weight = level * level * level;
    wx += weight * (((i % weeks) + 0.5) / weeks);
    wy += weight * ((Math.floor(i / weeks) + 0.5) / 7);
    total += weight;
  }
  if (!total) return undefined;
  return {
    ["--pool-x" as string]: `${((wx / total) * 100).toFixed(1)}%`,
    ["--pool-y" as string]: `${((wy / total) * 100).toFixed(1)}%`,
  } as CSSProperties;
}

interface HeatCell {
  day: string | null;
  minutes: number;
  level: number;
  catVar?: string | null;
}

export function Heatmap({
  cells,
  months,
  trio,
  hasTypes = false,
  legend = [],
  zeroWord = HEAT_WORDS[0],
}: {
  cells: HeatCell[];
  months: { col: number; label: string }[];
  trio: TileSpec[];
  hasTypes?: boolean;
  legend?: { label: string; colorVar: string }[];
  /** The level-0 tooltip word ("no play" · "no reading" · "no watching"). */
  zeroWord?: string;
}) {
  const [mode, setMode] = useState<"intensity" | "bytype">("intensity");
  const byType = hasTypes && mode === "bytype";

  // OPEN ON THE RECENT END (user-ruled 2026-08-10). The year runs oldest → newest
  // left to right, so once the block scrolls (small canvas — src/small.css gives
  // a week a real width) opening at 0 lands on the least useful edge: a year of
  // empty cells from before the habit existed. `scrollLeft` clamps itself, so
  // this is a no-op wherever the block still fits — the desktop is unaffected
  // without needing to ask whether it is scrollable.
  const colsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = colsRef.current;
    if (el != null) el.scrollLeft = el.scrollWidth;
  }, [cells.length]);
  // Tooltip legend lookup by slot — a Map, not a per-cell Array.find.
  const legendByVar = new Map(legend.map((l) => [l.colorVar, l.label]));

  const intensityRamp = (
    <span className="ramp">
      {!hasTypes && "Intensity"}
      {[0, 1, 2, 3, 4].map((k) => (
        <span key={k} className={`sw sw${k}`} />
      ))}
    </span>
  );
  const catLegend = (
    <span className="catleg" style={{ display: "flex" }}>
      {legend.map((l) => (
        <span className="lg" key={l.label}>
          <span className="sw" style={{ background: `var(${l.colorVar})` }} />
          {l.label}
        </span>
      ))}
    </span>
  );
  const header = (
    <span className="pmeta" style={{ display: "flex", alignItems: "center", gap: "var(--space-6)", flexWrap: "wrap" }}>
      {hasTypes && (
        <span className="toggle">
          <button className={`t${mode === "intensity" ? " on" : ""}`} onClick={() => setMode("intensity")}>
            Intensity
          </button>
          <button className={`t${mode === "bytype" ? " on" : ""}`} onClick={() => setMode("bytype")}>
            By Type
          </button>
        </span>
      )}
      {byType ? catLegend : intensityRamp}
    </span>
  );

  return (
    <Panel title="Activity heatmap" right={header}>
      {/* --pool-x/--pool-y: the activity centroid, for themes that paint the
          block as one emitting surface (see heatPoolStyle). Inert otherwise. */}
      <div className="heat" style={heatPoolStyle(cells, (c) => c.level)}>
        {/* The label column MIRRORS `.cols`' structure — a head box the exact
            height of the months line, then a seven-row grid on the cells' own
            gap. It used to be one grid whose first row was an EMPTY span: that
            row measured 0 while the months line measured ~17px, and since
            `.heat` stretches both columns to the same height, the seven `1fr`
            rows swallowed those 17px and every label rode ~3px high, worst at
            the bottom. Wrong at every canvas size; only visible once the cells
            grew (Phase 2 step 4, 2026-08-10). */}
        <div className="weekdays">
          <span className="wdhead" aria-hidden="true" />
          <div className="wdrows">
            {heatRowLabels().map((d, i) => (
              <span className="wd" key={i}>
                {d}
              </span>
            ))}
          </div>
        </div>
        <div className="cols" ref={colsRef}>
          <div className="months">
            {months.map((m) => (
              <span key={m.col} style={{ gridColumnStart: m.col + 1 }}>
                {m.label}
              </span>
            ))}
          </div>
          <div className="cells">
            {cells.map((c, i) => {
              // Intensity → the habit-ramp level classes. By-Type → an inline
              // color-mix of the dominant type's cat slot (level 0 stays bare).
              const bg = byType && c.level >= 1 && c.catVar ? catCellFill(c.catVar, c.level) : undefined;
              const style: CSSProperties =
                c.level < 0
                  ? { visibility: "hidden" }
                  : bg
                    ? { background: bg, boxShadow: "none" }
                    : {};
              const cls = byType ? "hcell" : `hcell${c.level >= 1 ? ` l${c.level}` : ""}`;
              const typeSuffix = byType && c.catVar ? ` · ${legendByVar.get(c.catVar) ?? ""}` : "";
              return (
                <div
                  key={i}
                  className={cls}
                  style={style}
                  title={c.day ? `${c.day} · ${c.level > 0 ? HEAT_WORDS[c.level] : zeroWord}${typeSuffix}` : undefined}
                />
              );
            })}
          </div>
        </div>
      </div>
      <div
        className="trow"
        style={{ marginTop: "var(--space-6)" }}
      >
        {trio.map((t, i) => (
          <StatTile key={i} t={t} />
        ))}
      </div>
    </Panel>
  );
}
