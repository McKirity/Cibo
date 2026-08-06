/** Comparing Statistics' chart renderers (pure functions of CmpChart) + the window dash/style roster. Split out of CompareDashboard.tsx 2026-07-30 (dedup pass wave 4). */
import type { CmpChart } from "./compareSpec";
import { useBox } from "../dashboard/useBox";

/**
 * Window = line STYLE, never colour: the SVG dasharray and the legend's
 * border-style face are ONE roster, index-locked (the pair drifted apart as
 * two lists once — 2026-07-30).
 */
export const WINDOW_DASHES = [
  { dash: "", style: "solid" },
  { dash: "8 5", style: "dashed" },
  { dash: "2 5", style: "dotted" },
] as const;

// ── Charts (HTML axes + box-sized-viewBox SVG) ───────────────────────────────
// Axis labels are HTML (the chunk-5 lesson — text never enters the SVG), and
// since 2026-08-04 the SVGs are box-sized like every dashboard chart: viewBox =
// the measured pixel box (shared useBox), no preserveAspectRatio="none" — the
// step-4 ruling's technique, applied late to the one surface the sweep missed
// (bar widths, gaps, stroke weights and radii are real pixels now).

export function BarsChart({ chart }: { chart: CmpChart }) {
  const { ref, w: W, h: H } = useBox<SVGSVGElement>();
  const n = chart.bucketLabels.length;
  const stacked = chart.kind === "sbar";
  const groups = chart.bucketLabels.map((_, bi) => chart.series.map((s) => s.values[bi] ?? 0));
  const y = (v: number) => H - (v / chart.yMax) * H;

  const rects: { x: number; y: number; w: number; h: number; fill: string }[] = [];
  const groupW = W / n;
  groups.forEach((vals, bi) => {
    const x0 = bi * groupW;
    if (stacked) {
      const barW = Math.min(groupW * 0.5, 110);
      let acc = 0;
      vals.forEach((v, si) => {
        if (v <= 0) return;
        const yTop = y(acc + v);
        rects.push({
          x: x0 + (groupW - barW) / 2,
          y: yTop,
          w: barW,
          h: y(acc) - yTop,
          fill: `var(--${chart.series[si].colourSlot})`,
        });
        acc += v;
      });
    } else {
      const inner = groupW * 0.78;
      // Floor at 1px — past ~32 series the per-bar share drops below the 6px
      // gap and the width would go negative (2026-07-30).
      const barW = Math.max(1, Math.min(inner / Math.max(1, vals.length) - 6, 90));
      const span = vals.length * (barW + 6) - 6;
      vals.forEach((v, si) => {
        const h = H - y(v);
        if (h <= 0) return;
        rects.push({
          x: x0 + (groupW - span) / 2 + si * (barW + 6),
          y: y(v),
          w: barW,
          h,
          fill: `var(--${chart.series[si].colourSlot})`,
        });
      });
    }
  });

  return (
    <div className="gbchart">
      <div className="gb-yaxis">
        {chart.yTicks.map((t) => (
          <span key={t} style={{ top: `${100 - (t / chart.yMax) * 100}%` }}>
            {t}
          </span>
        ))}
      </div>
      <div className="gb-plot">
        <svg ref={ref} className="chartsvg" viewBox={`0 0 ${Math.max(1, W)} ${Math.max(1, H)}`} aria-label={chart.title}>
          {W > 0 && H > 0 && (
            <>
              <g stroke="var(--divider)" strokeWidth="1">
                {chart.yTicks.map((t) => (
                  <line key={t} x1="0" y1={y(t)} x2={W} y2={y(t)} />
                ))}
              </g>
              {rects.map((r, i) => (
                <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx="3" fill={r.fill} />
              ))}
            </>
          )}
        </svg>
        <div className="gb-xaxis">
          {chart.bucketLabels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Ranked horizontal bars — kit-bars-distribution's leaderboard face, reusing
 * the app's existing anatomy verbatim (`.hbars` > `.brow` > `.blabel` ·
 * `.btrack`/`.bfill` · `.bval`, claimed in dashboard.css). The first pass
 * re-invented all five under `.hb*` names and collided with the bare
 * `.hbars`, whose fixed `height` leaked in.
 */
export function HBars({ chart }: { chart: CmpChart }) {
  const rows = [...chart.series].sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="hbars">
      {rows.map((s, i) => (
        <div className="brow" key={i}>
          <span className="blabel" title={s.label}>
            {s.label}
          </span>
          {/* div, not span (fixed 2026-07-30): `.bfill{height:100%}` needs a
              block box — the dashboards' kit renders these as divs, and the
              span form left the fill invisible (the track only showed because
              .brow's grid blockifies its direct children). */}
          <div className="btrack">
            <div
              className="bfill"
              // width is DATA (it is the bar); the hue is handed over as
              // `--series` so a theme can repaint the fill — see shell.css
              // § the hue handoff.
              style={{
                width: `${(s.total / max) * 100}%`,
                ["--series" as string]: `var(--${s.colourSlot})`,
              }}
            />
          </div>
          <span className="bval">{fmtNum(s.total)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Share of a whole — offered only where a stacked bar degenerates (one
 * window), per the ruling that reversed the corpus's pie/donut exclusion.
 * Drawn as one ring of stroked arcs; the hole carries the total.
 */
export function Donut({ chart }: { chart: CmpChart }) {
  const total = chart.series.reduce((a, s) => a + s.total, 0);
  // The app's EXISTING donut anatomy, reused verbatim (kit-bars-distribution's
  // donut face — `.donut` + `.dcenter`/`.dval`/`.dsub`, already claimed in
  // dashboard.css and drawn by the range dashboard's flag donuts). r=15.9155
  // gives a circumference of 100, so every dash length IS its percentage;
  // `.donut svg` carries the -90° rotation, so a segment starts at 12 o'clock.
  let acc = 0;
  const arcs = chart.series.map((s, i) => {
    const pct = total > 0 ? (s.total / total) * 100 : 0;
    const seg = { i, slot: s.colourSlot, pct, off: -acc };
    acc += pct;
    return seg;
  });
  return (
    <div className="donutwrap">
      <div className="donut" style={{ position: "relative" }}>
        <svg viewBox="0 0 42 42" aria-label={chart.title}>
          <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--inset-background)" strokeWidth="8" />
          {arcs.map((a) => (
            <circle
              key={a.i}
              cx="21"
              cy="21"
              r="15.9155"
              fill="none"
              stroke={`var(--${a.slot})`}
              strokeWidth="8"
              strokeDasharray={`${a.pct} ${100 - a.pct}`}
              strokeDashoffset={a.off}
            />
          ))}
        </svg>
        <div className="dcenter">
          <span className="dval">{fmtNum(total)}</span>
          <span className="dsub">total</span>
        </div>
      </div>
      <div className="dnkeys">
        {chart.series.map((s, i) => (
          <div className="dnkey" key={i}>
            <span className="sw" style={{ background: `var(--${s.colourSlot})` }} />
            <span className="dnk-l">{s.label}</span>
            <span className="dnk-v">{Math.round(total > 0 ? (s.total / total) * 100 : 0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Compact number for in-chart labels (the tiles own the formatted face).
 * NOT metrics/format's groupInt/decimal1: this face keeps a non-integer's
 * ".0" ("4.0" stays "4.0" where decimal1 trims to "4") and groups via
 * toLocaleString — replacing it would change rendered output, so it stays.
 */
const fmtNum = (v: number): string =>
  v >= 100 || Number.isInteger(v) ? Math.round(v).toLocaleString() : v.toFixed(1);

export function LineChart({ chart }: { chart: CmpChart }) {
  const { ref, w: W, h: H } = useBox<SVGSVGElement>();
  const n = chart.bucketLabels.length;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (v: number) => H - 10 - (v / chart.yMax) * (H - 30);
  // Thin the HTML labels to ~13 so a day-grain window stays readable.
  const step = Math.max(1, Math.ceil(n / 13));

  return (
    <div className="lochart">
      <div className="lo-yaxis">
        {H > 0 &&
          chart.yTicks.map((t) => (
            <span key={t} style={{ top: `${((y(t) / H) * 100).toFixed(1)}%` }}>
              {t}
            </span>
          ))}
      </div>
      <div className="lo-plot">
        <svg ref={ref} className="chartsvg" viewBox={`0 0 ${Math.max(1, W)} ${Math.max(1, H)}`} aria-label={chart.title}>
          {W > 0 && H > 0 && (
            <>
          <g strokeWidth="1">
            {chart.bucketLabels.map((_, i) => (
              <line key={i} x1={x(i)} y1={10} x2={x(i)} y2={H - 10} stroke="var(--divider)" />
            ))}
            <line x1="0" y1={H - 10} x2={W} y2={H - 10} stroke="var(--border)" />
          </g>
          {/* STACKED AREA: each series is drawn on the running sum beneath
              it, so the top edge is the total and every band is that
              series' contribution. The fill mixes toward `transparent` at
              --chart-area-mix (the derivation law's legal, lightness-neutral
              direction), so bands read as bands and not as flat blocks. */}
          {chart.kind === "area" &&
            (() => {
              const acc = chart.bucketLabels.map(() => 0);
              return chart.series.map((s, si) => {
                const lower = [...acc];
                s.values.forEach((v, i) => (acc[i] = (acc[i] ?? 0) + (v ?? 0)));
                const top = acc.map((v, i) => `${x(i)},${y(v)}`).join(" ");
                const bottom = [...lower]
                  .map((v, i) => ({ v, i }))
                  .reverse()
                  .map(({ v, i }) => `${x(i)},${y(v)}`)
                  .join(" ");
                return (
                  <polygon
                    key={si}
                    points={`${top} ${bottom}`}
                    fill={`color-mix(in oklab, var(--${s.colourSlot}), transparent var(--chart-area-mix))`}
                    stroke={`var(--${s.colourSlot})`}
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                );
              });
            })()}
          {chart.kind !== "area" &&
            chart.series.map((s, si) => (
              <polyline
                key={si}
                points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                fill="none"
                stroke={`var(--${s.colourSlot})`}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={WINDOW_DASHES[s.dashIdx % WINDOW_DASHES.length].dash || undefined}
              />
            ))}
            </>
          )}
        </svg>
        <div className="lo-xaxis">
          {chart.bucketLabels.map((l, i) =>
            i % step === 0 ? (
              <span key={i} style={{ left: `${n <= 1 ? 0 : (i / (n - 1)) * 100}%` }}>
                {l}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

/** Hue = identity (habit slot / categorical), window = line STYLE — never colour alone. */
export function Legend({ chart }: { chart: CmpChart }) {
  // Structural fields, never re-parsed display labels: a window label carries
  // " · " itself ("2024 · Jan – Dec"), so splitting on it showed two identical
  // "Jan – Dec" entries for a year self-comparison (fixed 2026-07-30).
  const hues: { slot: string; label: string }[] = [];
  for (const s of chart.series) {
    if (hues.some((h) => h.slot === s.colourSlot)) continue;
    hues.push({ slot: s.colourSlot, label: s.splitValue ?? s.sourceLabel });
  }
  const windows: { idx: number; label: string }[] = [];
  if (chart.sharedAxis) {
    for (const s of chart.series) {
      if (windows.some((w) => w.idx === s.windowIdx)) continue;
      windows.push({ idx: s.windowIdx, label: s.windowLabel });
    }
  }
  return (
    <div className="legend">
      {hues.map((h) => (
        <span className="li" key={h.slot}>
          <span className="sw" style={{ background: `var(--${h.slot})` }} />
          {h.label}
        </span>
      ))}
      {windows.map((w) => (
        <span className="li" key={w.idx}>
          <span
            className="ln"
            style={{ borderTopColor: "var(--text-secondary)", borderTopStyle: WINDOW_DASHES[w.idx % WINDOW_DASHES.length].style }}
          />
          {w.label}
        </span>
      ))}
      {/* The descriptive caption is GONE (user-ruled 2026-07-27) — it restated
          the shape, the window and the measure, all of which the title and the
          builder already say. Only a real annotation survives. */}
      {chart.caption != null && <span className="li cap">{chart.caption}</span>}
    </div>
  );
}
