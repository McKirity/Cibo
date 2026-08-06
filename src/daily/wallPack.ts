/**
 * THE CENTRE-OUT PACKING ALGORITHM.
 *
 * The one piece of the cover wall the design explicitly left to Build:
 * `Final/daily-state-2.html` hand-places its three walls "to demonstrate", and
 * its own spec card says so — *"the center-out placement is Build work."*
 *
 * THE RULING IT IMPLEMENTS ([[Daily state 2 (cover wall)]] § Direction):
 *
 *   "Center-anchored packing: the wall populates from the canvas centre
 *    outwards, Sleep-seeded — dense core, ragged fringe, never top-anchored; a
 *    full day fills to the edges, a sparse day reads as a small floating
 *    island. The wall scrolls on overflow, never compresses tiles."
 *
 *   "The unlogged rule — fill gaps first, then cluster the remainder."
 *
 * HOW IT WORKS. Tiles are placed one at a time onto a 15-column grid that is
 * unbounded vertically in BOTH directions (rows may go negative; they are
 * normalised at the end, which is what keeps the pack from being top-anchored).
 * Each tile takes the free rectangle whose centre is nearest the wall's centre.
 *
 * THE METRIC — re-ruled 2026-07-27 at the first live pass. The first build
 * measured plain pixel distance, which grows a ROUND island — and a round
 * island on a 15-wide, ~9-tall viewport scrolls long before it has used its
 * width. The user's re-rule: "get everything onto the screen without needing
 * to scroll if possible… fills things in more horizontally while still
 * maintaining the chaos." So distance is now ELLIPTICAL — dx is normalised by
 * the wall's half-width and dy by half the VIEWPORT's height (the caller
 * passes its measured half-row budget) — so the equidistant contours are
 * viewport-shaped and the pack spreads across the columns before it grows
 * rows. On top of that, any slot fully inside the viewport band beats any
 * slot outside it, which is what makes "no scroll" a hard preference rather
 * than a tendency; only a day whose tiles genuinely exceed the viewport
 * spills, and then the wall scrolls (it still NEVER compresses — the ruling).
 *
 * Order matters and is deliberate: the Sleep keepsake seeds the centre, the
 * habit masses accrete around it largest-first, the milestone cards land next,
 * whimsy fills between them as the grout, and the unlogged squares come last
 * because they are gap-filler by ruling.
 *
 * Pure and deterministic — same input, same wall, every time. That is what the
 * harness pins.
 */

/** Columns across the wall. The FINAL's `repeat(15, 1fr)`. */
export const WALL_COLS = 15;

/**
 * Pitch, in px, used ONLY for the distance metric — never for layout, which is
 * fluid `1fr` columns. `--wall-unit` 128 + `--wall-gap` 12 per whole unit; a
 * half-row is half a unit, so the two axes stay in true 2:1 proportion.
 */
const COL_PITCH = 140;
const HALF_ROW_PITCH = 70;

/**
 * The metric's vertical radius when the caller measures nothing — ~9 whole
 * units, the 1400-canvas viewport. A shape default only; the hard in-band
 * preference needs a real measured budget.
 */
export const DEFAULT_BUDGET_HALF_ROWS = 18;

/** A tile's footprint: whole columns × HALF-rows (a whole unit = 2 half-rows). */
export interface Span {
  cols: number;
  halfRows: number;
}

export interface PackInput<T> {
  item: T;
  span: Span;
  /**
   * Placement order class. Lower goes first, and "first" means "closer to the
   * centre" — see the file header for why each class sits where it does.
   */
  rank: number;
}

export interface Placed<T> {
  item: T;
  /** 1-based, ready for `grid-column` / `grid-row`. */
  col: number;
  row: number;
  cols: number;
  halfRows: number;
}

export interface PackResult<T> {
  placed: Placed<T>[];
  /** Total half-rows the wall occupies, for the caller's own sanity checks. */
  rows: number;
}

/** Placement ranks. Exported so the spec and the harness agree on the order. */
export const RANK = {
  /** The seed. Sleep lands mid-canvas and everything accretes around it. */
  seed: 0,
  /** The day's masses: banners, covers, the other keepsakes. */
  mass: 1,
  /** The milestone family cards. */
  milestone: 2,
  /** The grout between the stones. */
  whimsy: 3,
  /** Gap-filler, by ruling — placed only into holes inside the island. */
  unlogged: 4,
  /** Whatever did not land in a hole, collected into one labelled block. */
  cluster: 5,
} as const;

type Grid = Set<string>;

const keyOf = (c: number, r: number): string => `${c},${r}`;

const free = (grid: Grid, c: number, r: number, span: Span): boolean => {
  for (let x = c; x < c + span.cols; x++)
    for (let y = r; y < r + span.halfRows; y++) if (grid.has(keyOf(x, y))) return false;
  return true;
};

const occupy = (grid: Grid, c: number, r: number, span: Span): void => {
  for (let x = c; x < c + span.cols; x++)
    for (let y = r; y < r + span.halfRows; y++) grid.add(keyOf(x, y));
};

/**
 * Squared ELLIPTICAL distance from a rect's centre to the wall's centre —
 * dx normalised by the wall's half-width, dy by half the viewport band, so the
 * contours are viewport-shaped and the pack fills horizontally first (the
 * 2026-07-27 re-rule; a plain pixel metric grew a round, scrolling island).
 */
const score = (c: number, r: number, span: Span, ryHalfRows: number): number => {
  const rx = (WALL_COLS * COL_PITCH) / 2;
  const ry = Math.max(1, (ryHalfRows * HALF_ROW_PITCH) / 2);
  const dx = ((c + span.cols / 2 - WALL_COLS / 2) * COL_PITCH) / rx;
  const dy = ((r + span.halfRows / 2) * HALF_ROW_PITCH) / ry;
  return dx * dx + dy * dy;
};

interface Bounds {
  minR: number;
  maxR: number;
}

/**
 * The best free position for one span, or null if the search window held none
 * (which cannot happen unless `restrict` forbids everything).
 *
 * `band` is the viewport's half-row window, centred on the virtual origin. A
 * slot FULLY inside it beats any slot outside — "no scroll" is a hard
 * preference, not a tendency — and within a class the elliptical distance
 * decides. The search window includes the whole band even before the island
 * has grown near it, so a tile can spread wide early rather than stacking.
 */
const bestSlot = (
  grid: Grid,
  span: Span,
  bounds: Bounds,
  band: { lo: number; hi: number } | null,
  ry: number,
  restrict: ((c: number, r: number) => boolean) | null,
): { col: number; row: number } | null => {
  let best: { col: number; row: number; s: number; out: boolean } | null = null;
  const from = Math.min(bounds.minR - span.halfRows, band ? band.lo : 0);
  const to = Math.max(bounds.maxR + 1, band ? band.hi - span.halfRows : 0);
  for (let r = from; r <= to; r++) {
    for (let c = 0; c + span.cols <= WALL_COLS; c++) {
      if (restrict != null && !restrict(c, r)) continue;
      if (!free(grid, c, r, span)) continue;
      const out = band != null && !(r >= band.lo && r + span.halfRows <= band.hi);
      const s = score(c, r, span, ry);
      // Deterministic tie-break: in-band beats out-of-band, then the lower
      // score, then the lower row, then the lower column.
      if (
        best == null ||
        (best.out && !out) ||
        (best.out === out &&
          (s < best.s - 1e-9 ||
            (Math.abs(s - best.s) < 1e-9 && (r < best.row || (r === best.row && c < best.col)))))
      ) {
        best = { col: c, row: r, s, out };
      }
    }
  }
  return best == null ? null : { col: best.col, row: best.row };
};

/**
 * Pack the wall.
 *
 * Unlogged squares (`RANK.unlogged`) are treated specially, per the ruling:
 * they may only take a hole INSIDE the island already built. Anything left over
 * is reported in `overflowUnlogged` so the caller can collect it into the one
 * cluster block — which is then packed like any other tile.
 */
export interface PackOptions {
  /**
   * The viewport's height in half-rows, measured by the caller. Slots fully
   * inside this band are preferred over ANY slot outside it, which is what
   * makes the wall fit without scrolling whenever its tiles can. Absent =
   * no hard band; the elliptical metric still shapes the island.
   */
  budgetHalfRows?: number;
}

export function packWall<T>(
  inputs: ReadonlyArray<PackInput<T>>,
  opts?: PackOptions,
): PackResult<T> & { overflowUnlogged: T[] } {
  const grid: Grid = new Set();
  const bounds: Bounds = { minR: 0, maxR: 0 };
  const budget = opts?.budgetHalfRows;
  // Centred on the virtual origin, where the seed lands.
  const band = budget != null ? { lo: -Math.floor(budget / 2), hi: -Math.floor(budget / 2) + budget } : null;
  const ry = budget ?? DEFAULT_BUDGET_HALF_ROWS;
  const out: Array<Placed<T> & { rawRow: number }> = [];
  const overflowUnlogged: T[] = [];

  // Stable order: by rank, then by AREA descending (big masses first, so the
  // core is dense and the small tiles fill what is left), then by the caller's
  // own order so equal tiles never shuffle between renders.
  const order = inputs
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      if (a.p.rank !== b.p.rank) return a.p.rank - b.p.rank;
      const aa = a.p.span.cols * a.p.span.halfRows;
      const bb = b.p.span.cols * b.p.span.halfRows;
      if (aa !== bb) return bb - aa;
      return a.i - b.i;
    });

  let bbox: { c0: number; c1: number; r0: number; r1: number } | null = null;

  for (const { p } of order) {
    const isFiller = p.rank === RANK.unlogged;
    // A hole is a free slot INSIDE the island — not the ragged fringe. On a
    // dense day that absorbs the misses invisibly; on a sparse day the island
    // is tight, nothing lands, and the remainder clusters. Both drawn walls.
    const restrict =
      isFiller && bbox != null
        ? (c: number, r: number) =>
            c >= bbox!.c0 && c + p.span.cols <= bbox!.c1 + 1 &&
            r >= bbox!.r0 && r + p.span.halfRows <= bbox!.r1 + 1
        : null;
    if (isFiller && bbox == null) {
      overflowUnlogged.push(p.item);
      continue;
    }

    const slot = bestSlot(grid, p.span, bounds, band, ry, restrict);
    if (slot == null) {
      if (isFiller) overflowUnlogged.push(p.item);
      continue;
    }
    occupy(grid, slot.col, slot.row, p.span);
    out.push({
      item: p.item,
      col: slot.col + 1,
      row: slot.row,
      rawRow: slot.row,
      cols: p.span.cols,
      halfRows: p.span.halfRows,
    });
    bounds.minR = Math.min(bounds.minR, slot.row);
    bounds.maxR = Math.max(bounds.maxR, slot.row + p.span.halfRows - 1);
    const c0 = slot.col;
    const c1 = slot.col + p.span.cols - 1;
    const r0 = slot.row;
    const r1 = slot.row + p.span.halfRows - 1;
    bbox =
      bbox == null
        ? { c0, c1, r0, r1 }
        : {
            c0: Math.min(bbox.c0, c0),
            c1: Math.max(bbox.c1, c1),
            r0: Math.min(bbox.r0, r0),
            r1: Math.max(bbox.r1, r1),
          };
  }

  // Normalise: rows were virtual and may be negative — that is exactly what
  // stops the pack being top-anchored. `grid-row` starts at 1.
  const shift = out.length === 0 ? 0 : Math.min(...out.map((o) => o.rawRow));
  const placed: Placed<T>[] = out.map((o) => ({
    item: o.item,
    col: o.col,
    row: o.rawRow - shift + 1,
    cols: o.cols,
    halfRows: o.halfRows,
  }));

  const rows = placed.reduce((m, o) => Math.max(m, o.row + o.halfRows - 1), 0);
  return { placed, rows, overflowUnlogged };
}
