/**
 * The numbered pager — the library's drawn face (`.pgnums`/`.pgnum`/`.pgell`,
 * hoisted to kit.css), shared with the Map's outline-scale entry lists.
 * Hoisted 2026-07-30 (the dedup pass, wave 2): the two screens carried
 * structural copies of this JSX (1-based vs 0-based pages — normalized here
 * to 1-based; the Map adapts at its call site).
 *
 * The wrappers stay per-screen (`.pager`/`.pgcount` in the library,
 * `.pagerrow`/`.pgcount` in the Map) — only the cell strip is shared.
 */
import { Ico, ICONS } from "../shell/icons";

/**
 * The numbered pager's cells: ‹ 1 2 3 4 5 … 13 › — first pages, an ellipsis,
 * the last page; when the current page runs ahead, the window follows it
 * (1 … 5 6 7 … 13). "…" cells are the drawn `.pgell`.
 */
export const pagerCells = (page: number, pageCount: number): (number | "…")[] => {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const cells: (number | "…")[] = [];
  const around = [1, 2, page - 1, page, page + 1, pageCount - 1, pageCount]
    .filter((n) => n >= 1 && n <= pageCount)
    .sort((a, b) => a - b);
  let prev = 0;
  for (const n of around) {
    if (n === prev) continue;
    if (n > prev + 1) cells.push("…");
    cells.push(n);
    prev = n;
  }
  return cells;
};

export function Pager({
  page,
  pageCount,
  onPage,
  iconSize,
}: {
  /** 1-based current page. */
  page: number;
  pageCount: number;
  /** Receives the 1-based target page. */
  onPage: (page: number) => void;
  /** The library pins its arrow glyphs at 14px inline; the Map sizes via CSS. */
  iconSize?: number;
}) {
  return (
    <div className="pgnums">
      <button
        className="pgnum arrow"
        title="Previous page"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <Ico d={ICONS.chevronLeft} size={iconSize} />
      </button>
      {pagerCells(page, pageCount).map((c, i) =>
        c === "…" ? (
          <span key={`e${i}`} className="pgell">
            …
          </span>
        ) : (
          <button
            key={c}
            className={`pgnum${c === page ? " on" : ""}`}
            onClick={() => onPage(c)}
          >
            {c}
          </button>
        ),
      )}
      <button
        className="pgnum arrow"
        title="Next page"
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
      >
        <Ico d={ICONS.chevronRight} size={iconSize} />
      </button>
    </div>
  );
}
