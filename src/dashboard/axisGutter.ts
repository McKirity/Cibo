import type { CSSProperties } from "react";

/**
 * THE Y-AXIS GUTTER, SIZED BY THE LABELS THAT GO IN IT.
 *
 * `--chart-axis-gutter` is a roster dial at 56px, and 56 is the widest y-label
 * the app draws — Sleep's `23:00`, five mono characters. Every other chart was
 * paying it: the habit trend draws `16h`, Creation draws unit ticks, and Sleep's
 * OWN duration chart draws `10h` beside its `23:00` twin, so it reserved ~22px
 * of dead indent and read as a graph that had failed to start at its container's
 * edge (user-reported 2026-08-15, *"is that another indent"*).
 *
 * Hand-tuning a second number per chart was the first answer and it is not one:
 * this chart's ticks step to HALF hours whenever its zoomed window is tighter
 * than 3h, so it can draw `7.5h` — four characters — and any px constant is
 * either too wide most of the time or too narrow sometimes.
 *
 * So the gutter is DERIVED: the longest label's own character count, in `ch`,
 * plus the drawn gap. In a monospaced face `1ch` is exactly one advance, so
 * `5ch` is exactly `23:00` — no measuring, no re-layout pass, and it follows
 * the theme's mono face, the caption size and the zoom for free.
 *
 * ⚠ THE VALUE MUST REACH BOTH READERS, and this is the trap the first per-chart
 * fix fell into. `--chart-axis-gutter` is read by `.chartwrap` (padding) AND by
 * `.xaxis` (margin) — and `.xaxis` is a SIBLING of `.chartwrap` at every one of
 * the four call sites, never a descendant. `.trend .chartwrap{34px}` therefore
 * moved the plot and left the x-axis on the roster's 56, so the trend's tick
 * labels have been sitting 22px right of the points they name since that fix
 * landed. Both elements take the style object; that is why this returns one.
 *
 * ⚠ AND `ch` RESOLVES AGAINST THE ELEMENT THAT USES IT, so both of those
 * elements are given the label's own mono/caption face in dashboard.css. Without
 * that the two would compute different gutters from the same string.
 */
export function axisGutter(labels: readonly string[]): CSSProperties {
  let widest = 0;
  for (const l of labels) widest = Math.max(widest, l.length);
  if (widest === 0) return {};
  return { ["--chart-axis-gutter" as string]: `calc(${widest}ch + var(--space-3))` } as CSSProperties;
}
