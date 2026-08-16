/**
 * HOW MANY WEEK COLUMNS AN ENTRY'S HEATMAP DRAWS — the small canvas only.
 *
 * User-ruled 2026-08-15 (Phase 2 step 4): *"I want the whole heatmap filled in…
 * I can do a whole year for 2k no problem, but that just creates a ton of
 * meaningless scroll for the macbook, so I wanted a different formula for it."*
 *
 * The block was a fixed 53 weeks at every size. A year is the right unit for the
 * 2K panel, which draws it whole and fills its width; on the 14" the same year
 * does not fit, and the answer had been a scrollbar — a year of columns reachable
 * only by dragging, most of them empty.
 *
 * So the count is not a year here. It is **the most columns that fit**: as much
 * history as the panel can show at the week column's minimum width, and not one
 * more. The face still fills its box edge to edge, exactly as the desktop's does;
 * it simply covers a shorter span at the same cell size.
 *
 * ⚠ THE FIT USES THE TRACK MINIMUM, NOT ITS DRAWN WIDTH. The tracks are
 * `minmax(min, 1fr)`: their BASE size is the minimum, and a grid overflows only
 * when the sum of base sizes exceeds the container. "Does it scroll" is therefore
 * a question about the minimum alone — and any count that clears it then grows
 * to fill, which is what puts the right edge of the block on the right edge of
 * the panel.
 *
 * ⚠ AN EARLIER BUILD ALSO CAPPED THIS AT THE ENTRY'S OWN SPAN — first logged day
 * to last — reading *"calculate how many cells/columns from that earliest point"*
 * as a bound on the count. It is not; it describes where to count from. Capping
 * there drew a seven-column heatmap adrift in a panel five times its width, and
 * was corrected the same day. **An entry with two sessions gets the same full
 * block as any other, mostly empty, which is what the 2K face already does and
 * what was asked for.**
 *
 * Nothing in this file knows a pixel value: the container is measured off the
 * real box in the component, and the minimum and gap are read from CSS.
 */

/**
 * The most columns of `colMin` (separated by `gap`) that fit inside `px`.
 *
 * The 1px shaved off is deliberate: sub-pixel container widths are ordinary (a
 * fractional grid track upstream, a zoom factor of 0.85), and a count that fits
 * only to the last hundredth of a pixel is a count that scrolls.
 */
export function heatFitWeeks(px: number, colMin: number, gap: number): number {
  if (!(px > 0) || !(colMin > 0) || !(gap >= 0)) return 0;
  return Math.max(0, Math.floor((px - 1 + gap) / (colMin + gap)));
}

/**
 * The drawn column count: what fits, never more than the full year the grid is
 * built at, never fewer than one.
 *
 * An unmeasured box returns `maxWeeks` — the pre-measure paint must be the old
 * face rather than a stub that then jumps. It settles in two passes and cannot
 * oscillate: the first measurement is taken while the box IS scrolled, so it is
 * short by the scrollbar and the count comes out conservative; the scrollbar
 * then goes, the box measures wider, and the count can only rise into pixels
 * that were already free. That second count clears the fit test by construction,
 * so no scrollbar returns and the measurement stops moving.
 */
export function heatWeeks(opts: { fitWeeks: number; maxWeeks: number }): number {
  const { fitWeeks, maxWeeks } = opts;
  if (!(fitWeeks > 0)) return maxWeeks;
  return Math.max(1, Math.min(fitWeeks, maxWeeks));
}

/**
 * Keep the LAST `weeks` columns of a row-major `rows`×`total` grid.
 *
 * The heatmap walk is row-major — index = row × total + col — so trimming
 * columns is not a slice of the array; it is a slice of every row. Dropping from
 * the FRONT is what keeps the anchor day on the right edge.
 */
export function trimHeatCols<T>(cells: readonly T[], total: number, weeks: number, rows = 7): T[] {
  if (weeks >= total || weeks < 1 || cells.length !== total * rows) return [...cells];
  const first = total - weeks;
  const out: T[] = [];
  for (let row = 0; row < rows; row++)
    for (let col = first; col < total; col++) out.push(cells[row * total + col]);
  return out;
}
