/**
 * BALANCED TILE ROWS — the stat-tile group's column count.
 *
 * User-ruled 2026-08-10 (Phase 2 step 4, the tier-2 walk), for BOTH canvases:
 * *"stat tiles should try to distribute evenly across each row. So if there are
 * four in a group, it should show 2x2 instead of 3 in the first row, 1 in the
 * second row."*
 *
 * `.trow` was a WRAPPING FLEX of `flex:1 1 auto` tiles, so each line was filled
 * greedily and the remainder stretched across the last one — four tiles read as
 * three-then-one. The count is now computed and handed to a grid.
 *
 * The rule: use the fewest columns that still fits the group in the fewest
 * rows. Fewest rows first (never add a row to even things up), then divide the
 * items across those rows as evenly as possible.
 *
 * ⚠ THE RULING'S EXCEPTION IS REAL, and the first attempt got it wrong. It was
 * argued that balancing only ever REMOVES columns, so a tile could never end up
 * narrower — false, because the old row was `flex:1 1 auto`, where a tile's
 * starting width was its own CONTENT. Equal columns took that away, and
 * `.tile > .ts` is `white-space:nowrap`, so long subtitles were simply cut off.
 * *A flex row sized to content and a grid row sized to fractions are not the
 * same layout with a tidier column count.*
 *
 * It is answered by RESOLVING INSIDE THE TILE rather than by moving tiles: the
 * subtitle wraps (dashboard.css), so a tile that cannot fit its text on one line
 * grows a line taller and the row shape is undisturbed. Nothing measures text —
 * a measure → wrap → re-measure loop is the failure `useBox` already carries a
 * fix for.
 */

/**
 * The most tiles a single row may carry, before balancing thins it.
 *
 * THREE, and the ruling itself is what sets it: *"if there are four in a group,
 * it should show 2x2"*. At a cap of four, four units fit ONE row of four and
 * 2×2 never happens — the ruling's own example only comes out right at three.
 * It also matches what the app already does by hand: the heatmap trio renders
 * `repeat(3,1fr)` at four separate sites.
 *
 * ⚠ A UNIFORM GRID CANNOT SPLIT EVERY COUNT EVENLY. Rows are filled greedily by
 * grid auto-placement, so the shortfall always lands on the last row: seven
 * units draw 3+3+1, where a ragged 3+2+2 would be flatter but is not something
 * one column count can express. Every count a real group reaches (1–6) is even
 * to within one tile; this is recorded so the next reader does not "fix" it by
 * measuring.
 */
export const TILE_ROW_MAX = 3;

/**
 * ⚠ EVERY TILE IS ONE COLUMN, INCLUDING THE LIST TILE. `.tlist` used to take
 * `flex:1.6` — deliberately wider than its neighbours — and the first pass
 * preserved that as a two-column SPAN. It was tried and struck the same day
 * (user: *"That looks really bad"*): a 2-wide tile inside a 3-wide row leaves a
 * dead column on every row it appears in, and the streaks group wore two of
 * them. Even columns and "one tile is wider than the others" are simply
 * incompatible, and evenness is what was ruled. So the count is the tile count.
 */

/**
 * The balanced column count for `count` tiles, capped at `maxCols`.
 *
 *   n=2 → 2      n=3 → 3      n=4 → 2×2
 *   n=5 → 3+2    n=6 → 3+3    n=9 → 3+3+3
 */
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;

/**
 * The grid plan for a tile group: how many TRACKS the row needs, and how many
 * of them each tile spans.
 *
 * User-ruled 2026-08-10, closing the ruling out: *"the last row tiles expand to
 * fill in all that space. There should be no empty space in any of the rows."*
 * Five tiles balance to 3+2, and two tiles in a three-column row leave a third
 * of the row empty.
 *
 * The trick is that the track count need not equal the tiles-per-row. Lay the
 * row out in `lcm(cols, lastRow)` tracks and BOTH shapes divide it exactly: at
 * 3+2 that is six tracks, where a full row's tiles span 2 each and the last
 * row's span 3 each. Every row ends flush, and no tile is ever a fraction of a
 * track. A short last row simply gets wider tiles, which is what "expand to fill"
 * means.
 *
 *   5 tiles → 6 tracks, spans [2,2,2, 3,3]      (3 + 2, both flush)
 *   7 tiles → 3 tracks, spans [1,1,1, 1,1,1, 3] (the orphan takes the row)
 *   4 tiles → 2 tracks, spans [1,1, 1,1]        (already flush, unchanged)
 */
export function tileRowPlan(
  count: number,
  maxCols: number = TILE_ROW_MAX,
): { tracks: number; spans: number[] } {
  if (!Number.isFinite(count) || count < 1) return { tracks: 1, spans: [] };
  const cols = balancedCols(count, maxCols);
  const rows = Math.ceil(count / cols);
  const lastRow = count - cols * (rows - 1);
  const tracks = lcm(cols, lastRow);
  const full = tracks / cols;
  const short = tracks / lastRow;
  const firstOfLastRow = cols * (rows - 1);
  return {
    tracks,
    spans: Array.from({ length: count }, (_, i) => (i >= firstOfLastRow ? short : full)),
  };
}

export const balancedCols = (count: number, maxCols: number = TILE_ROW_MAX): number => {
  // Defensive, not decorative: an empty group renders no tiles but the grid
  // still needs a valid track count, and `repeat(0, …)` is invalid CSS.
  if (!Number.isFinite(count) || count < 1) return 1;
  if (!Number.isFinite(maxCols) || maxCols < 1) return 1;
  const cap = Math.min(Math.floor(maxCols), Math.ceil(count));
  const rows = Math.ceil(count / cap);
  return Math.ceil(count / rows);
};
