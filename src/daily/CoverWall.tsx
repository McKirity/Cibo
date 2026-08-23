/**
 * DAILY — STATE 2, THE COVER WALL.
 *
 * The day's keepsake: a thin HEAD (date + the edit-day corner button — and no
 * day-summary stats line, because this is a keepsake, not a report) over a
 * full-bleed masonry WALL. The two zones never rearrange; only the wall's
 * population changes.
 *
 * Translated from `Final/daily-state-2.html`. What the FINAL could not give:
 *
 *  · THE PACK. The frozen file hand-places its three walls "to demonstrate" and
 *    says so; `wallPack.ts` is the centre-out algorithm it left to Build.
 *  · THE KEEPSAKE ART. The FINAL froze the tile ANATOMY and stood in
 *    placeholder art; the real six were authored 2026-07-26 and ship as
 *    pre-seeded snippets, drawn here through `KeepsakeTile`'s shadow root.
 *  · THE MILESTONE FAMILY CARDS. Nothing milestone-bearing is drawn in the
 *    frozen file — a Build-side addition designed ahead of the build (direction
 *    D, "the sealed certificate").
 *
 * THE MILESTONE CARDS ARE MEASURED, NOT AUTHORED. Width is the fewest whole
 * columns that hold the longest line; height is the measured content quantised
 * to the half-unit step. That is this screen's own "shape follows content" rule
 * applied to a text card — and the exhibit recorded that hand-assigning the
 * spans was wrong twice in two attempts, so they are computed here.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { dayRevision } from "./spineSpec";
import {
  buildWall,
  toPackInputs,
  COVER_CAP_SHARE,
  coverColsFor,
  type ClusterTile,
  type BannerTile,
  type CoverTile,
  type HoroscopeWallTile,
  type KeepsakeWallTile,
  type MilestoneTile,
  type StreaksTile,
  type TarotWallTile,
  type UnloggedTile,
  type WallTile,
  type WeatherWallTile,
  type WhimsyWhich,
} from "./wallSpec";
import { BANNER_COLS } from "./wallSpec";
import { packWall, DEFAULT_BUDGET_HALF_ROWS, WALL_COLS, type Span } from "./wallPack";
/**
 * THE LIVE COLUMN COUNT, read off `--wall-cols` (daily.css, re-valued by
 * small.css). Read rather than duplicated so the CSS grid and the packer cannot
 * disagree about how wide the wall is — the same reason Library's `perPage()`
 * reads its count dials instead of restating 18.
 */
const WALL_COLS_PROP = "--wall-cols";
const wallCols = (): number =>
  parseInt(getComputedStyle(document.documentElement).getPropertyValue(WALL_COLS_PROP)) || WALL_COLS;

/**
 * Compact as a REACT signal. The wall's layout is computed in JS, so unlike the
 * Library grid — which is pure CSS and reflows on its own — the pack has to
 * re-run when the class flips or the wall keeps a fifteen-column arrangement on
 * a nine-column grid.
 *
 * ⚠ A compact toggle RELOADS NOTHING: `theme/compact.ts` toggles one class on
 * <html>, from Settings → Appearance and from the resize listener that resolves
 * compact-auto. That is the fact whose absence cost Library a stale page size
 * last session; here it would cost the wall its arrangement, so the observer is
 * the dependency rather than a cache key.
 */
function useCompactFlag(): boolean {
  const read = () => document.documentElement.classList.contains("compact");
  const [on, setOn] = useState(read);
  useEffect(() => {
    const el = document.documentElement;
    const ob = new MutationObserver(() => setOn(el.classList.contains("compact")));
    ob.observe(el, { attributes: true, attributeFilter: ["class"] });
    setOn(el.classList.contains("compact")); // a flip between render and effect
    return () => ob.disconnect();
  }, []);
  return on;
}

import { KeepsakeTile } from "./KeepsakeTile";
import { TarotArt } from "./tarotArt";
import { useCoverUrl } from "../kit/CoverArt";
import { useWallData } from "./useWallData";
import { useMilestoneDay } from "./useMilestoneDay";
import { displayTemp, weatherWords } from "./feedData";
import { holidayFor, factFor, onThisDay, quoteFor, signGlyph, wordFor } from "./almanac";
import { moonDiscPaths, moonInfo, seasonBand, seasonInfo, sunInfo } from "./sky";
import { cardOn, loadWhimsyConfig } from "./whimsyConfig";
import { periodProgress } from "./periodProgress";
import { weekStartDow } from "../metrics/dates";
import { HabitIcon, hasIcon } from "../shell/habitIcons";
import { hoursMinutes, stars } from "../metrics/format";
import "./daily.css";

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const MONTH_VARS = [
  "--month-jan", "--month-feb", "--month-mar", "--month-apr",
  "--month-may", "--month-jun", "--month-jul", "--month-aug",
  "--month-sep", "--month-oct", "--month-nov", "--month-dec",
];

// ── The screen ───────────────────────────────────────────────────────────────

export function CoverWall({
  dayKey,
  onEditDay,
  onOpenEntry,
}: {
  dayKey: string;
  onEditDay: () => void;
  onOpenEntry?: (entryId: string, habitKey: string | null) => void;
}) {
  const data = useWallData(dayKey);
  const revision = useMemo(
    () => dayRevision(data.sessions, data.cats),
    [data.sessions, data.cats],
  );
  const milestones = useMilestoneDay(dayKey, revision);
  const [config] = useState(loadWhimsyConfig);

  // The eight COMPUTED whimsy cards recompute for the date ("time-travelling
  // shows the day as it was"). The three ephemeral ones — weather · horoscope ·
  // tarot — come from `feed_snapshot` (live since the network tier, 2026-07-27):
  // exactly what the day captured, and absent means OMITTED, never faked.
  // Each computed tile's Settings → Whimsy roster key. The roster is coarser
  // than the tile list: `sky` covers sun + season, `almanac` covers fact,
  // holiday and the year-progress tile. Same grouping Daily's form state reads.
  const whimsy = useMemo<WhimsyWhich[]>(() => {
    const ROSTER_KEY: Record<string, string> = {
      sun: "sky",
      season: "sky",
      moon: "moon",
      word: "word",
      fact: "almanac",
      quote: "quote",
      year: "almanac",
      otd: "otd",
      holiday: "almanac",
    };
    const list: WhimsyWhich[] = ["sun", "season", "moon", "word", "fact", "quote", "year"];
    if (onThisDay(dayKey).length > 0) list.push("otd");
    if (holidayFor(dayKey) != null) list.push("holiday");
    // HONOR THE TOGGLES (user-ruled 2026-08-04). The wall built all eight
    // unconditionally, so a card switched off vanished from the working day and
    // kept appearing on every finalized wall. These tiles are RECOMPUTED, not
    // snapshotted, so the "already-finalized days stay as they were" exemption
    // never covered them — the ephemeral three (weather · horoscope · tarot)
    // are the snapshotted ones, and they are not in this list.
    return list.filter((w) => cardOn(config, ROSTER_KEY[w] ?? w));
  }, [dayKey, config]);

  const tiles = useMemo(
    () =>
      buildWall({
        day: dayKey,
        habits: data.habits,
        sessions: data.sessions,
        entries: data.entries,
        cats: data.cats,
        ruleHits: data.ruleHits,
        milestones,
        whimsy,
        snapshot: data.snapshot,
      }),
    [dayKey, data, milestones, whimsy],
  );

  // ── the measuring pass ────────────────────────────────────────────────────
  // Milestone/streaks cards probe all three candidate widths; the horoscope
  // tile joined 2026-07-27 (user-ruled: "the card just flexes to include the
  // entire text") at its FIXED drawn width — 4 columns, height measured.
  const probeRef = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<Map<string, Span>>(new Map());
  // The probe UNMOUNTS once its tiles are measured (2026-07-30 efficiency
  // pass) — it used to stay in the DOM for the wall's whole life. The key
  // carries the tiles' CONTENT, not just their ids, so a same-id card whose
  // text changed re-mounts the probe and re-measures.
  const [measuredKey, setMeasuredKey] = useState<string | null>(null);
  const textTiles = useMemo(
    () =>
      tiles.filter(
        (t) => t.body.kind === "milestone" || t.body.kind === "streaks" || t.body.kind === "horo",
      ),
    [tiles],
  );
  const probeWidths = (t: WallTile): number[] => (t.body.kind === "horo" ? [4] : [2, 3, 4]);
  const probeKey = useMemo(
    () => textTiles.map((t) => `${t.id}:${JSON.stringify(t.body)}`).join("|"),
    [textTiles],
  );
  const probeLive = textTiles.length > 0 && measuredKey !== probeKey;

  useLayoutEffect(() => {
    if (textTiles.length === 0) {
      if (measured.size > 0) setMeasured(new Map());
      setMeasuredKey(probeKey);
      return;
    }
    const probe = probeRef.current;
    if (probe == null) return; // already measured for this content — probe unmounted
    const cs = getComputedStyle(document.documentElement);
    const unit = parseFloat(cs.getPropertyValue("--wall-unit")) || 128;
    const gap = parseFloat(cs.getPropertyValue("--wall-gap")) || 12;
    const step = (unit - gap) / 2 + gap; // one half-row plus its own gap
    const next = new Map<string, Span>();
    for (const t of textTiles) {
      // One clone per candidate width. The narrowest width whose height
      // matches the widest IS "the fewest columns that hold the longest
      // line" — measured by its consequence, so no nowrap trickery. A
      // fixed-width tile (horo) renders one clone; the find below then lands
      // on that width because the missing candidates read Infinity.
      const heights: Record<number, number> = {};
      for (const cols of probeWidths(t)) {
        const el = probe.querySelector<HTMLElement>(`[data-probe="${t.id}:${cols}"]`);
        if (el != null) heights[cols] = el.getBoundingClientRect().height;
      }
      const widest = heights[4] ?? 0;
      const cols = [2, 3, 4].find((c) => (heights[c] ?? Infinity) <= widest + 0.5) ?? 3;
      const need = heights[cols] ?? 0;
      const halfRows = Math.max(2, Math.ceil((need + gap) / step));
      next.set(t.id, { cols, halfRows });
    }
    const same =
      next.size === measured.size &&
      [...next].every(([k, v]) => {
        const old = measured.get(k);
        return old != null && old.cols === v.cols && old.halfRows === v.halfRows;
      });
    if (!same) setMeasured(next);
    setMeasuredKey(probeKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probeKey]);

  const seedKey = useMemo(
    () => data.habits.find((h) => h.kind === "range")?.key ?? null,
    [data.habits],
  );

  // THE VIEWPORT BUDGET (re-ruled 2026-07-27): the wall should fit without
  // scrolling whenever its tiles can, so the pack needs to know how many
  // half-rows are actually visible. Measured off the scroll container and
  // re-measured on resize — the rail collapse reflows 2180 → 2560 and the
  // budget rides along.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  // Read ONCE, above every memo that depends on the wall's width — the cover
  // pass and the pack both do.
  const compact = useCompactFlag();

  // The grid's live metrics, measured beside the budget because the cover pass
  // below needs the REAL column width: a wall column is 1fr of the stretched
  // grid, not one --wall-unit (128), and a 2% error in the width compounds
  // straight into a wrongly-quantised height.
  const [grid, setGrid] = useState<{
    colW: number;
    /** The live track count — `--wall-cols`, carried so every reader agrees. */
    cols: number;
    gap: number;
    step: number;
    /** The masonry unit — the banner's two ceilings derive from it (4u × 3u). */
    unit: number;
    /** The banner art card's floor, mirroring the sheet's own min-height. */
    bannerFloor: number;
  } | null>(null);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (el == null) return;
    const compute = () => {
      const cs = getComputedStyle(document.documentElement);
      const unit = parseFloat(cs.getPropertyValue("--wall-unit")) || 128;
      const gap = parseFloat(cs.getPropertyValue("--wall-gap")) || 12;
      const pad = (parseFloat(cs.getPropertyValue("--space-6")) || 16) * 2;
      const padX = (parseFloat(cs.getPropertyValue("--space-7")) || 24) * 2;
      const coverH = parseFloat(cs.getPropertyValue("--cover-h")) || 84;
      const space8 = parseFloat(cs.getPropertyValue("--space-8")) || 32;
      const bannerFloor = coverH + space8 * 2;
      const step = (unit - gap) / 2 + gap;
      // n half-rows occupy n·step − gap, so n = (h + gap) / step.
      const n = Math.floor((el.clientHeight - pad + gap) / step);
      setBudget((prev) => {
        const next = Math.max(4, n);
        return prev === next ? prev : next;
      });
      // ⚠ THIS LINE HELD THE THIRD COPY OF 15 (fixed 2026-08-11) — and it was
      // the one that mattered, because it computes the width every cover
      // reservation is quantised from. It survived the sweep that replaced the
      // CSS `repeat(15, 1fr)` and `WALL_COLS` because it does not SPELL the
      // number: it was `- 14 * gap) / 15`, arithmetic, invisible to a grep for
      // the name. On the nine-column wall it reported ~78px against a real
      // ~139px, so every cover reserved roughly half the rows it went on to
      // draw and tiles overlapped the ones beneath them.
      // *Sweep for the CONSTANT, not the dial* — the week-start dial's lesson
      // and the wave numerals' lesson, both already written down, both about
      // readers that spell a value as a consequence rather than as a name.
      const cols = wallCols();
      const colW = (el.clientWidth - padX - (cols - 1) * gap) / cols;
      setGrid((prev) =>
        prev != null &&
        prev.gap === gap &&
        prev.step === step &&
        prev.cols === cols &&
        Math.abs(prev.colW - colW) < 0.5
          ? prev
          : { colW, cols, gap, step, unit, bannerFloor },
      );
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
    // `compact` is a dependency because it re-values `--wall-cols` WITHOUT
    // resizing the scroll container — the observer would never fire, and the
    // measurement would keep the other canvas's column width.
  }, [compact]);

  // ── the cover pass: the tile takes the ART's shape ────────────────────────
  //
  // Ruled 2026-08-02 (user: the consumption tiles "should flex to show the
  // entire cover, not just a portion of it"). The drawn spans were authored
  // against one implicit aspect — 2×3 is 0.671 against a poster's 0.667, near
  // exact — and everything that isn't a 2:3 poster paid for it: the `big` tile
  // is 0.50, so it cropped a quarter off a poster's sides, and Steam's header
  // fallback (460×215) survived as a letterbox slice of itself.
  //
  // So a cover tile's height is now MEASURED from its art, the same "shape
  // follows content" rule the milestone cards run under — one step further than
  // the square-source clause the screen note already carries ("a square-source
  // entry renders square"), which was this idea applied to the one aspect
  // anybody had a name for. No probe pass: the art reports its natural size
  // when it loads, so nothing is fetched twice.
  const [aspects, setAspects] = useState<ReadonlyMap<string, number>>(new Map());
  const noteArt = useCallback((id: string, w: number, h: number) => {
    if (!(w > 0) || !(h > 0)) return;
    const ratio = h / w;
    setAspects((prev) => {
      const old = prev.get(id);
      if (old != null && Math.abs(old - ratio) < 0.002) return prev;
      const next = new Map(prev);
      next.set(id, ratio);
      return next;
    });
  }, []);

  // ── the info band's measured height ───────────────────────────────────────
  //
  // The band (2026-08-02, user-ruled: "add an extra portion directly beneath
  // it that contains all the information" · "attached to the bottom of the
  // cards, not floating beneath it") is part of the tile, so the tile's
  // RESERVATION has to cover art + band. It reports its rendered height the
  // way the art reports its natural size.
  //
  // WHY THIS CANNOT RATCHET, which the first attempt at a caption footer did:
  // this number feeds the SPAN ONLY. It never enters the width choice, the
  // column count or the art's own box below — so the band's height can never
  // come back around and change the width it was measured at. Any future edit
  // that lets `bands` reach the cover pass's width arithmetic rebuilds the
  // feedback loop that collapsed the wall into 65px strips of slot colour.
  const [bands, setBands] = useState<ReadonlyMap<string, number>>(new Map());
  const noteBand = useCallback((id: string, h: number) => {
    if (!(h > 0)) return;
    setBands((prev) => {
      const old = prev.get(id);
      if (old != null && Math.abs(old - h) < 0.5) return prev;
      const next = new Map(prev);
      next.set(id, h);
      return next;
    });
  }, []);

  const coverBoxes = useMemo(() => {
    const boxes = new Map<string, CoverBox>();
    if (grid == null) return boxes;
    // The ceiling, in pixels, for this window (see COVER_CAP_SHARE). Floored at
    // the wall's own minimum tile so a very short viewport cannot reduce covers
    // to stamps.
    const capHalfRows = (budget ?? DEFAULT_BUDGET_HALF_ROWS) * COVER_CAP_SHARE;
    const capPx = Math.max(2, capHalfRows) * grid.step - grid.gap;
    const widthOf = (c: number) => c * grid.colW + (c - 1) * grid.gap;
    // ── the BANNER pass (2026-08-07) ───────────────────────────────────────
    // Same machinery, opposite axis. A cover is portrait and spends WIDTH to
    // stay under a height ceiling; a banner is wallpaper-shaped, so its ceiling
    // is the WIDTH (4u) and the height is whatever the ratio makes there. The
    // 3u term binds only on portrait art — a cover promoted for want of a
    // banner — where a width cap alone builds a tower. Both mirror the sheet's
    // own `max-width: min(4u, 3u / ratio)`; this side only has to RESERVE the
    // rows the sheet will draw, never to size the tile.
    for (const t of tiles) {
      if (t.body.kind !== "banner") continue;
      const ratio = aspects.get(t.id);
      if (ratio == null) continue; // no art → the drawn 6×2 span stands
      // THE BANNER FILLS ITS RESERVATION (2026-08-23). The first cut sized the
      // TILE to the art — ceil to whole columns, draw at the fixed-unit 4u cap
      // — and the rounding remainder pooled beside and below the tile as a
      // dead strip the packer had marked occupied, so no filler could ever
      // take it. At the design pitch (~140px columns) that mortar was slim; at
      // a ~1920 window the fifteen 1fr columns run ~95px, the 512px cap spans
      // ~5.5 of them, and the strip grew to most of a column (user-reported,
      // the 08-23 wall). So the ceilings now pick a WHOLE-column width — floor,
      // never ceil, so the ruled 4u / 3u caps still bind from above — the tile
      // spans exactly those columns, and the half-row remainder letterboxes
      // INSIDE the card on its slot field via `contain` (the cover tile's own
      // settled trade: a whole picture with a sliver of slot beats a cropped
      // one) instead of standing open in the wall.
      const wCap = Math.min(widthOf(BANNER_COLS), grid.unit * 4, (grid.unit * 3) / ratio);
      const cols = Math.max(
        2,
        Math.min(BANNER_COLS, Math.floor((wCap + grid.gap) / (grid.colW + grid.gap))),
      );
      // The art's width inside the tile — the columns' own width, except in
      // the promoted-portrait corner where even the two-column minimum exceeds
      // the 3u height ceiling; there `contain` letterboxes the sides too.
      const artW = Math.min(widthOf(cols), wCap);
      // The art card's floor (grid.bannerFloor): on very short art the box
      // holds at the floor and the picture letterboxes inside it, so the
      // reservation has to follow the floor, not the ratio.
      const h = Math.max(artW * ratio, grid.bannerFloor);
      const halfRows = Math.max(2, Math.ceil((h + grid.gap) / grid.step));
      boxes.set(t.id, { span: { cols, halfRows }, ratio, capPx: null });
    }
    for (const t of tiles) {
      if (t.body.kind !== "cover") continue;
      const ratio = aspects.get(t.id);
      // No art (or not loaded yet) → the drawn span stands. The lettermark
      // fallback is a designed face, not a degraded one, and it has no aspect
      // of its own to follow.
      if (ratio == null) continue;
      // Width is the first thing spent to stay under the ceiling, and it is
      // spent in whole columns while it can be: the day's biggest sitting is
      // ALLOWED three columns, but only art wide enough to stay short keeps
      // them. A tall poster gives the third column back rather than tower.
      // THE ART'S CEILING IS THE ART'S ALONE — the band is not subtracted from
      // it. The card keeps the size it had before the band existed (user:
      // "let's not change the cards"); the band adds its height to the tile.
      let cols = coverColsFor(t.body.big && !t.body.square, grid.cols);
      while (cols > 2 && widthOf(cols) * ratio > capPx) cols--;
      const natural = widthOf(cols) * ratio;
      // Still over at the narrowest whole width — so the width leaves the grid
      // and follows the art off the ceiling instead. The tile then draws
      // narrower than the columns it reserves, which is mortar, not a gap in
      // the picture.
      const capped = natural > capPx;
      const height = capped ? capPx : natural;
      // The span is a RESERVATION only — the tile draws at the art's exact
      // aspect (`coverBox`) plus the band, never at the row multiple. Rounding
      // the DRAWN height to a row is what put a band of slot colour inside the
      // tile.
      const band = bands.get(t.id) ?? BAND_ESTIMATE;
      const halfRows = Math.max(2, Math.ceil((height + band + grid.gap) / grid.step));
      boxes.set(t.id, { span: { cols, halfRows }, ratio, capPx: capped ? capPx : null });
    }
    return boxes;
  }, [tiles, aspects, grid, budget, bands, compact]);

  // The text probe and the cover pass measure disjoint tiles; the pack reads
  // one map.
  const spans = useMemo(() => {
    const merged = new Map(measured);
    for (const [id, box] of coverBoxes) merged.set(id, box.span);
    // THE TAROT'S COLUMN (2026-08-23, the banner fix's sibling). The drawn
    // "1×2 small vertical" priced its one column at the wall unit (~128px);
    // on the 1600–2180 desktop band a `1fr` column runs ~67–105px, and a card
    // that must keep its 104:182 aspect inside that column shrinks to a
    // ~56px-wide stamp floating mid-plate (measured 55.6×97 in an 81×268
    // tile) — the empty plate around it reads as a hole in the wall. So when
    // the live column has fallen well under the unit the tile takes TWO whole
    // columns and the card stands at its full drawn size; at the design pitch
    // and on compact (columns ≈ the unit) the drawn single column is
    // untouched. Same law as the banner pass above: fixed-unit anatomy is
    // re-expressed in real columns, never left to strand its remainder.
    if (grid != null && grid.colW < grid.unit * 0.9) {
      for (const t of tiles)
        if (t.body.kind === "tarot") merged.set(t.id, { cols: 2, halfRows: 4 });
    }
    return merged;
  }, [measured, coverBoxes, grid, tiles]);

  const layout = useMemo(() => {
    const opts = { cols: wallCols(), ...(budget != null ? { budgetHalfRows: budget } : {}) };
    const packed = packWall(toPackInputs(tiles, seedKey, spans), opts);
    if (packed.overflowUnlogged.length === 0) return packed;
    // The unlogged remainder — whatever did not land in a hole inside the
    // island — collects into ONE neat labelled cluster block, which is then
    // packed like any other tile.
    const overflow = new Set(packed.overflowUnlogged);
    const names = packed.overflowUnlogged
      .map((t) => (t.body.kind === "unlogged" ? t.body.name : ""))
      .filter((n) => n !== "");
    const cluster: WallTile = { id: "cluster", body: { kind: "cluster", names } };
    const keep = tiles.filter((t) => !overflow.has(t));
    return packWall(toPackInputs([...keep, cluster], seedKey, spans), opts);
  }, [tiles, seedKey, spans, budget, compact]);

  const finalized = data.dayRow?.finalized ?? false;
  const d = new Date(`${dayKey}T12:00:00`);

  return (
    <div className="wallscreen">
      <div className="head">
        <div className="date">
          <span className="dow">{WEEKDAY.format(d)} —</span> {DAY_MONTH_YEAR.format(d)}
          {finalized && (
            <span className="fin-tag">
              <span className="fm" />
              Finalized
            </span>
          )}
        </div>
        <button
          className="edit-day"
          title="Reopen this day (back to the working state)"
          onClick={onEditDay}
        >
          <svg className="ico" viewBox="0 0 24 24" style={{ width: 15, height: 15 }}>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          Edit day
        </button>
      </div>

      <div className="wall-wrap" ref={wrapRef}>
        <div className="wall">
          {layout.placed.map((p) => {
            const door = tileDoor(p.item, onOpenEntry);
            return (
              <div
                key={p.item.id}
                className={`tile ${tileClass(p.item)}`}
                /* Set only once the box IS the art's shape — COVERS only.
                   Until then the art draws `contain` — a whole cover with a
                   sliver of slot beats a cropped one, every time. A banner
                   never wears it (2026-08-23): its box is the grid area and
                   `contain` is its permanent mode. */
                data-art={
                  coverBoxes.has(p.item.id) && p.item.body.kind !== "banner" ? "fit" : undefined
                }
                style={{
                  ...tileStyle(p.item),
                  ...coverBox(p.item, coverBoxes),
                  gridColumn: `${p.col} / span ${p.cols}`,
                  gridRow: `${p.row} / span ${p.halfRows}`,
                }}
                onClick={door}
                role={door ? "button" : undefined}
                tabIndex={door ? 0 : undefined}
                onKeyDown={
                  door
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          door();
                        }
                      }
                    : undefined
                }
              >
                <TileBody
                  tile={p.item}
                  dayKey={dayKey}
                  config={config}
                  onArt={noteArt}
                  onBand={noteBand}
                />
              </div>
            );
          })}
          {layout.placed.length === 0 && (
            <p className="island-note">Nothing was logged on this day.</p>
          )}
        </div>
      </div>

      {/* The measuring pass — mounted only until this content is measured.
          Inside `.wall` on purpose: the plate rules are `.ms-tile.plate ...`,
          and a probe parked outside its own wall measures the wrong height —
          the exhibit paid for that once already. */}
      {probeLive && (
        <div className="wall wall-probe" aria-hidden="true" ref={probeRef}>
          {textTiles.map((t) =>
            probeWidths(t).map((cols) => (
              <div
                key={`${t.id}:${cols}`}
                data-probe={`${t.id}:${cols}`}
                className={`tile ${tileClass(t)}`}
                style={{ width: `calc(${cols} * var(--wall-unit) + ${cols - 1} * var(--wall-gap))` }}
              >
                <TileBody tile={t} dayKey={dayKey} config={config} />
              </div>
            )),
          )}
        </div>
      )}
    </div>
  );
}

/** What the cover pass works out per tile: its reservation and its true box. */
interface CoverBox {
  span: Span;
  /** naturalHeight / naturalWidth. */
  ratio: number;
  /** Set only when the ceiling bound — the height is then fixed and the width follows. */
  capPx: number | null;
}

/** Stand-in band height until the first real measurement lands — the eyebrow
 *  line, the title line and the chip row, plus the band's padding. */
const BAND_ESTIMATE = 78;


/**
 * A measured cover's ART BOX draws at its art's EXACT aspect: `aspect-ratio`
 * supplies whichever dimension the grid does not. Uncapped, the columns give
 * the width and the picture gives the height; capped, the ceiling gives the
 * height and the picture gives the width (the tile narrows with it, so the
 * band underneath stays exactly as wide as the card it is attached to). Either
 * way the art box IS the picture's shape, so there is nothing left over to
 * band and nothing to crop.
 *
 * The TILE's own height is `auto` — art box plus the info band. Sizing the
 * tile itself and letting the art fill it is what the retired footer attempt
 * did, and it is why the art shrank as the band grew.
 */
const coverBox = (t: WallTile, boxes: ReadonlyMap<string, CoverBox>): Record<string, string> => {
  const box = boxes.get(t.id);
  if (box == null) return {};
  // A banner takes NO inline shape (2026-08-23): its pass floors the ceilings
  // to whole columns, so the grid area IS the tile's box and the art
  // letterboxes the remainder inside it. Shrinking it to the art is what left
  // reserved-but-undrawn strips in the wall.
  if (t.body.kind === "banner") return {};
  const shape: Record<string, string> = {
    ["--art-ratio"]: `${box.ratio}`,
    alignSelf: "start",
    height: "auto",
  };
  if (box.capPx == null) return shape;
  return {
    ...shape,
    ["--art-h"]: `${Math.round(box.capPx)}px`,
    width: `${Math.round(box.capPx / box.ratio)}px`,
    justifySelf: "start",
  };
};

const tileStyle = (t: WallTile): Record<string, string> => {
  const b = t.body;
  if (b.kind === "cover" || b.kind === "banner") return { ["--slot"]: `var(--${b.slot})` };
  if (b.kind === "keepsake") return { ["--slot"]: `var(--${b.colourSlot})` };
  return {};
};

/**
 * "Identity is clickable, metrics are not" — a cover or a banner is an entry, so
 * it opens that entry's dashboard. Keepsakes, whimsy and milestone cards carry
 * no identity to open.
 */
const tileDoor = (
  t: WallTile,
  onOpenEntry?: (entryId: string, habitKey: string | null) => void,
): (() => void) | undefined => {
  const b = t.body;
  if (onOpenEntry == null) return undefined;
  if (b.kind === "cover" || b.kind === "banner")
    return () => onOpenEntry(b.entryId, b.habitKey);
  return undefined;
};

const tileClass = (t: WallTile): string => {
  const b = t.body;
  switch (b.kind) {
    case "cover":
      // `yt` is now only a SHAPE hook (2×2, set in wallSpec) — the look is
      // `cover`'s, one composition for both since 2026-08-02.
      return b.square ? "cover yt" : `cover${b.big ? " big" : ""}`;
    case "banner":
      return "banner";
    case "keepsake":
      return "keep";
    case "whimsy":
      return `whim ${WHIMSY_CLASS[b.which]}`;
    case "wx":
      return "whim glance whim-weather";
    case "horo":
      return "whim strip-tile whim-horo";
    case "tarot":
      return "whim whim-tarot";
    case "milestone":
      return `ms-tile${b.items.length === 1 ? " plate" : ""}`;
    case "streaks":
      return "ms-tile";
    case "unlogged":
      return "unlogged";
    case "cluster":
      return "cluster";
  }
};

const WHIMSY_CLASS: Record<WhimsyWhich, string> = {
  sun: "whim-sun",
  season: "whim-ribbon",
  year: "whim-ribbon",
  moon: "glance whim-moon",
  fact: "glance whim-fact",
  word: "strip-tile whim-word",
  quote: "strip-tile whim-quote",
  otd: "strip-tile whim-otd",
  holiday: "glance whim-holiday",
};

function TileBody({
  tile,
  dayKey,
  config,
  onArt,
  onBand,
}: {
  tile: WallTile;
  dayKey: string;
  config: ReturnType<typeof loadWhimsyConfig>;
  /** The cover pass's ear — a loaded cover reports its natural size upward. */
  onArt?: (id: string, w: number, h: number) => void;
  /** Its second ear — the info band reports its rendered height (span only). */
  onBand?: (id: string, h: number) => void;
}) {
  const b = tile.body;
  switch (b.kind) {
    case "cover":
      return <Cover t={b} tileId={tile.id} onArt={onArt} onBand={onBand} />;
    case "banner":
      return <Banner t={b} tileId={tile.id} onArt={onArt} />;
    case "keepsake":
      return <Keepsake t={b} />;
    case "whimsy":
      return <Whimsy which={b.which} dayKey={dayKey} config={config} />;
    case "wx":
      return <WeatherWall t={b} config={config} />;
    case "horo":
      return <HoroscopeWall t={b} />;
    case "tarot":
      return <TarotWall t={b} />;
    case "milestone":
      return <MilestoneCard t={b} />;
    case "streaks":
      return <StreaksCard t={b} />;
    case "unlogged":
      return <Unlogged t={b} />;
    case "cluster":
      return <Cluster t={b} />;
  }
}

// ── Habit tiles ──────────────────────────────────────────────────────────────

function Cover({
  t,
  tileId,
  onArt,
  onBand,
}: {
  t: CoverTile;
  tileId: string;
  onArt?: (id: string, w: number, h: number) => void;
  onBand?: (id: string, h: number) => void;
}) {
  // ONE composition for portrait and square alike (user-ruled 2026-08-02:
  // "Fill with the avatar"). `square` decides only the tile's SHAPE (a 2×2
  // span, set in wallSpec), never its anatomy.
  //
  // THE INFO BAND (user-ruled 2026-08-02, after the caption-overlay face was
  // judged unreadable over real art and a caption-footer re-cut was judged
  // worse and reverted whole): *"let's not change the cards, instead add an
  // extra portion directly beneath it that contains all the information"* ·
  // *"should be attached to the bottom of the cards, not floating beneath
  // it"*. So the CARD IS UNTOUCHED — same art, same size, same shape it had
  // when nothing was written on it — and the words move off it into a band
  // fixed to its bottom edge, inside the same tile box and its radius.
  //
  // THE NO-ART FACE KEEPS THE OVERLAY COMPOSITION, unchanged and band-less:
  // the typographic keepsake reads perfectly on its flat slot field — that
  // face is what the overlay anatomy was drawn for, and it is a designed
  // permanent look, not a degraded one. Only art defeats text.
  const src = useCoverUrl(t.cover);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const bandRef = useRef<HTMLDivElement | null>(null);
  // TWO ways in, because `load` alone loses the race: a blob the webview has
  // already decoded is `complete` before React attaches the listener, so the
  // event never fires, the tile keeps its DRAWN span, and the art gets cropped
  // to a shape it never had. That is precisely what happened to the day's `big`
  // tile while its neighbours measured fine. Re-reading `complete` after every
  // render closes it; the state setter bails when the ratio is unchanged, so
  // this settles in one extra render and then costs a property read.
  useEffect(() => {
    const el = imgRef.current;
    if (el != null && el.complete) onArt?.(tileId, el.naturalWidth, el.naturalHeight);
  });
  // The band reports the same way — every render, the parent bails on
  // unchanged. Its height buys ROWS and nothing else (see the cover pass).
  useLayoutEffect(() => {
    const el = bandRef.current;
    if (el != null) onBand?.(tileId, el.getBoundingClientRect().height);
  });

  const info = (
    <>
      <span className="kind">{t.eyebrow}</span>
      {hasIcon(t.icon) && (
        <span className="glyph">
          <HabitIcon icon={t.icon} />
        </span>
      )}
      <div className="ttl">{t.title}</div>
      <div className="meta">
        <span className="chip dur">{t.duration}</span>
        {t.rating != null && (
          <span className="stars">
            {stars(t.rating)}
            {"☆".repeat(Math.max(0, 5 - t.rating))}
          </span>
        )}
      </div>
    </>
  );

  // No art → the keepsake face, exactly as before, no band.
  if (src == null) return info;

  return (
    <>
      {/* The CARD. Real cover art at runtime, alone in its box — nothing is
          written on it any more.
          FIXED 2026-07-31 (step 8): this drew `src={t.cover}` — the RAW stored
          reference — which the webview resolved against the dev server and
          404'd every time, so wall art had never once rendered. The ref is
          root-relative and its bytes are read Rust-side (kit/CoverArt). */}
      <div className="cvart">
        <img
          ref={imgRef}
          className="art"
          src={src}
          alt=""
          onLoad={(e) =>
            onArt?.(tileId, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)
          }
        />
      </div>
      <div className="cvinfo" ref={bandRef}>
        {info}
      </div>
    </>
  );
}

/**
 * The creation banner — re-cut 2026-07-27 (user-ruled, the old wall's
 * WritingPanel face): the banner art spans the WHOLE card as a shadowed
 * background and the content sits above it. No art → the slot-derived
 * gradient field; a 404 removes itself and the field shows, per the
 * fail-to-fallback law.
 */
function Banner({
  t,
  tileId,
  onArt,
}: {
  t: BannerTile;
  tileId: string;
  onArt?: (id: string, w: number, h: number) => void;
}) {
  // useCoverUrl, never the raw stored ref — the same fix the COVER half of this
  // component took on 2026-07-31. A stored ref is a root-relative path the
  // webview resolves against the dev server and 404s; the bytes come back
  // Rust-side as a blob URL.
  //
  // BOTH refs draw since 2026-08-06 (user-ruled: "I want the tile to show
  // both"). Banner = the card-spanning background; cover = the band's thumb.
  // A banner-less entry PROMOTES its cover to the background instead of
  // drawing it twice — which is also the bug that surfaced all this: the tile
  // read the banner alone, so an entry carrying only a cover drew nothing, and
  // the empty face looked designed rather than broken (the silent-fallback
  // lesson, third instance on this one component).
  const bg = t.banner ?? t.cover;
  const src = useCoverUrl(bg);
  // Null when the cover IS the background — hooks stay unconditional.
  const covSrc = useCoverUrl(t.cover !== bg ? t.cover : null);

  const info = (
    <>
      <span className="kind">{t.eyebrow}</span>
      <div className="foot">
        <div className="ttl">{t.title}</div>
        <div className="meta">
          {t.stage != null && <span className="stage">{t.stage}</span>}
          <span className="nums">{t.nums}</span>
        </div>
      </div>
    </>
  );

  // THE NO-ART FACE IS UNCHANGED AND BAND-LESS — it reads perfectly on its flat
  // slot field, exactly as the cover tile's does. Only art defeats text.
  if (src == null) return info;

  // THE ART CARD (2026-08-07; re-mechanised 2026-08-23). The banner is SHOWN
  // WHOLE — never cropped into a drawn 6×2 — but the TILE no longer shrinks to
  // the picture: the banner pass floors its ceilings to whole columns, the
  // tile fills that reservation exactly, and `.bnart`'s `contain` letterboxes
  // the sub-half-row remainder onto the slot field inside the card (shrinking
  // the tile to the art left the remainder as a dead strip in the wall). The
  // art reports its natural size the moment it loads, which is what lets the
  // pass reserve the right columns and rows; nothing is fetched twice. The
  // words ride ON the picture in `.bvinfo` — outlined ink over the veil, no
  // panel anywhere.
  return (
    <>
      <div className="bnart">
        <img
          className="art"
          src={src}
          alt=""
          draggable={false}
          onLoad={(e) =>
            onArt?.(tileId, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)
          }
          onError={(e) => e.currentTarget.remove()}
        />
      </div>
      <div className="bvinfo">
        {covSrc != null && <img className="bcov" src={covSrc} alt="" draggable={false} />}
        <div className="bvtext">{info}</div>
      </div>
    </>
  );
}

function Keepsake({ t }: { t: KeepsakeWallTile }) {
  return <KeepsakeTile snippet={t.snippet} values={t.values} colourSlot={t.colourSlot} />;
}

function Unlogged({ t }: { t: UnloggedTile }) {
  return (
    <>
      <span className="nm">{t.name}</span>
      <span className="st">not logged</span>
    </>
  );
}

function Cluster({ t }: { t: ClusterTile }) {
  return (
    <>
      <span className="cl">Not logged · {t.names.length}</span>
      <div className="grid">
        {t.names.map((n) => (
          <span className="u" key={n}>
            {n}
          </span>
        ))}
      </div>
    </>
  );
}

// ── The folded whimsy — the grout ────────────────────────────────────────────

function Whimsy({
  which,
  dayKey,
  config,
}: {
  which: WhimsyWhich;
  dayKey: string;
  config: ReturnType<typeof loadWhimsyConfig>;
}) {
  switch (which) {
    case "sun": {
      // "The sun tile renders at SOLAR NOON on a past day" — a fact about the
      // day, not about when it was finalized (the tile's own copy says so).
      const sun = sunInfo(dayKey, config.lat, config.lon);
      return (
        <>
          <span className="wl">Sun</span>
          <div className="sky" />
          <div className="disc" />
          <span className="len">{hoursMinutes(Math.round(sun.dayLengthMin))}</span>
          <span className="noon">solar noon</span>
        </>
      );
    }
    case "season": {
      const info = seasonInfo(dayKey, config.lat);
      const band = seasonBand(dayKey, config.lat, info.northern);
      return (
        <>
          <span className="wl">Season</span>
          <div className="band">
            {band.segments.map((s, i) => (
              <i
                key={i}
                style={{
                  flex: s.days,
                  background: s.current
                    ? `var(${s.monthVar})`
                    : `color-mix(in oklch, var(${s.monthVar}), var(--panel-background) var(--quarter-wash-mix))`,
                }}
              />
            ))}
            <div className="tick" style={{ left: `${band.todayPct}%` }} />
          </div>
          <div className="foot">
            <span>{info.season}</span>
            <span>
              <b>day {info.dayIndex}</b> of {info.length}
            </span>
          </div>
        </>
      );
    }
    case "year": {
      // ONE RULE FOR THE FIVE PERIOD NUMBERS (2026-08-14). This tile read
      // almanac.ts's `timeProgress` while the progress card read
      // `periodProgress` — two implementations of the same five fractions,
      // agreeing at this instant except across a DST boundary, where the old
      // rule's fixed 86_400_000 denominator runs ~4% out on a 23- or 25-hour
      // day. The tile is drawn at 23:59 of the day itself, which is where that
      // divergence is largest.
      // `timeProgress` retires with this call site — it had no other reader.
      const p = periodProgress(dayKey, new Date(`${dayKey}T23:59:00`), weekStartDow());
      return (
        <>
          <span className="wl">Year</span>
          <div className="band">
            {MONTH_VARS.map((v) => (
              <i key={v} style={{ flex: 1, background: `var(${v})` }} />
            ))}
            <div className="tick" style={{ left: `${Math.round(p.year * 100)}%` }} />
          </div>
          <div className="foot">
            <span>{dayKey.slice(0, 4)}</span>
            <span>
              <b>{Math.round(p.year * 100)}%</b>
            </span>
          </div>
        </>
      );
    }
    case "moon": {
      const m = moonInfo(dayKey, config.lat, config.lon);
      const g = moonDiscPaths(m.illumination, m.phase, 20, 22, 22);
      return (
        <>
          <span className="wl">Moon</span>
          <div className="body">
            <svg
              className="disc"
              viewBox="0 0 44 44"
              aria-hidden="true"
              style={m.mirrored ? { transform: "scaleX(-1)" } : undefined}
            >
              <circle
                cx="22"
                cy="22"
                r="20"
                fill="var(--whimsy-night)"
                stroke="color-mix(in oklch, var(--whimsy-moon), var(--whimsy-night) 58%)"
                strokeWidth="1"
              />
              <path d={g.half} fill="var(--whimsy-moon)" />
              <path
                d={g.terminator}
                fill={m.illumination > 0.5 ? "var(--whimsy-moon)" : "var(--whimsy-night)"}
              />
            </svg>
            <div>
              <div className="il">{Math.round(m.illumination * 100)}%</div>
              <div className="ph">{m.name}</div>
            </div>
          </div>
        </>
      );
    }
    case "word": {
      const w = wordFor(dayKey);
      return (
        <>
          <span className="wl">Word</span>
          <div className="body">
            <span className="w">
              {w.word} <span className="pos">{w.kind}</span>
            </span>
            <span className="rule" />
            <span className="def">{w.meaning}</span>
          </div>
        </>
      );
    }
    case "fact": {
      const f = factFor(dayKey);
      return (
        <>
          <span className="wl">Fact</span>
          <div className="body">
            <span className="chip" style={{ ["--c" as string]: `var(--cat-${f.cat})` }}>
              {f.category}
            </span>
            <span className="tx">{f.text}</span>
          </div>
        </>
      );
    }
    case "quote": {
      const q = quoteFor(dayKey);
      return (
        <>
          <span className="qm" aria-hidden="true">
            &#8220;
          </span>
          <p>{q.text}</p>
          <span className="by">— {q.who}</span>
        </>
      );
    }
    case "otd": {
      const events = onThisDay(dayKey).slice(0, 2);
      return (
        <>
          {events.map((e) => (
            <div className="row" key={e.year}>
              <span className="yr">{e.year}</span>
              <span className="ev">{e.what}</span>
            </div>
          ))}
        </>
      );
    }
    case "holiday": {
      const name = holidayFor(dayKey);
      const month = new Intl.DateTimeFormat(undefined, { month: "short" }).format(
        new Date(`${dayKey}T12:00:00`),
      );
      // Tinted by the holiday's ACTUAL month (user-ruled 2026-07-30) — the
      // frozen --month-jun was the FINAL's sample month, not a rule.
      const monthVar = MONTH_VARS[Number(dayKey.slice(5, 7)) - 1];
      return (
        <>
          <span className="wl">Holiday</span>
          <div className="body">
            <div className="dt" style={{ "--c": `var(${monthVar})` } as CSSProperties}>
              <span className="d">{Number(dayKey.slice(8, 10))}</span>
              <span className="mon">{month}</span>
            </div>
            <span className="nm">{name}</span>
          </div>
        </>
      );
    }
  }
}

// ── The ephemeral three — feed_snapshot's tenants, drawn faces verbatim ──────

function WeatherWall({
  t,
  config,
}: {
  t: WeatherWallTile;
  config: ReturnType<typeof loadWhimsyConfig>;
}) {
  const { cond } = weatherWords(t.snap.code);
  // THE DAY'S HIGH AND LOW, not the capture temperature (user-ruled
  // 2026-08-15). The wall is the FINALIZED day — a record, read weeks later —
  // and a single reading there answers "what was it at the moment the app
  // happened to fetch", which is a fact about the app rather than about the
  // day. High and low describe the whole day and do not go stale.
  // The live reading moved the other way the same day: the daily form's card
  // now re-reads the actual temperature on every launch (daily/feeds.ts). One
  // ruling, two faces — the open day shows NOW, the closed day shows the DAY.
  return (
    <>
      <span className="wl">Weather</span>
      <div className="body">
        <span className="hl" title={`High ${displayTemp(t.snap.hiC, config.tempUnit)}°, low ${displayTemp(t.snap.loC, config.tempUnit)}°`}>
          <span className="t">{displayTemp(t.snap.hiC, config.tempUnit)}&deg;</span>
          <span className="lo">{displayTemp(t.snap.loC, config.tempUnit)}&deg;</span>
        </span>
        <span className="c">{cond}</span>
      </div>
    </>
  );
}

function HoroscopeWall({ t }: { t: HoroscopeWallTile }) {
  // The SNAPSHOTTED sign, not the configured one — the wall shows the day as
  // it was, even if the birthdate later changes.
  const glyph = signGlyph(t.snap.sign);
  return (
    <>
      <span className="sign">
        {glyph != null && (
          <span className="glyph" aria-hidden="true">
            {glyph}
          </span>
        )}
        {t.snap.sign}
      </span>
      <p>{t.snap.text}</p>
    </>
  );
}

/**
 * The mini card face — the same chassis and the SAME art group as Daily's card,
 * at the wall's ≈half size.
 *
 * It used to carry a reduced anatomy transcribed from the state-2 FINAL (fewer
 * stars, no figure lines), which was only ever a thinning of the shared Star
 * emblem — with a per-card face (2026-08-06) that anatomy would draw a star on
 * every card and the tile would misreport the draw. The exhibit's grammar was
 * authored against this size for exactly that reason: bold silhouettes, no two
 * cards alike at half scale, verified in its silhouette audit strip. The FINAL
 * is stale on this zone by consequence, as `kit-timeline-waves` is.
 */
function TarotWall({ t }: { t: TarotWallTile }) {
  const longName = t.snap.name.length > 11;
  return (
    <svg viewBox="0 0 104 182" aria-hidden="true">
      <rect x="2" y="2" width="100" height="178" rx="7" fill="var(--whimsy-parchment)" stroke="var(--whimsy-ink)" strokeWidth="1.5" />
      <rect x="8" y="8" width="88" height="166" rx="4" fill="none" stroke="var(--whimsy-star)" strokeWidth="1" />
      <text x="52" y="26" textAnchor="middle" fontFamily="var(--font-heading)" fontSize="11" letterSpacing="1.5" fill="var(--whimsy-ink)">
        {t.snap.numeral}
      </text>
      <TarotArt n={t.snap.n} reversed={t.snap.reversed} />
      <text
        x="52"
        y="169"
        textAnchor="middle"
        fontFamily="var(--font-ui)"
        fontSize="8.5"
        letterSpacing="2"
        fill="var(--whimsy-ink)"
        textLength={longName ? 84 : undefined}
        lengthAdjust={longName ? "spacingAndGlyphs" : undefined}
      >
        {t.snap.name.toUpperCase()}
      </text>
    </svg>
  );
}

// ── The milestone family cards — direction D, "the sealed certificate" ───────

/**
 * One device per family inside a constant seal (user-ruled: the seal is the
 * constant, the glyph varies, so six read as one set at wall distance while
 * each is identifiable up close). Transcribed from `FINAL Milestone Exhibit.html`.
 */
const SEAL: Record<string, string[]> = {
  threshold: ["M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z", "M4 22V4"],
  record: [
    "M18 2H6v7a6 6 0 0 0 12 0V2Z",
    "M6 9H4.5a2.5 2.5 0 0 1 0-5H6",
    "M18 9h1.5a2.5 2.5 0 0 0 0-5H18",
    "M10 15v3c0 .6-.4 1-1 1-1.1.4-2 1.9-2 3",
    "M14 15v3c0 .6.4 1 1 1 1.1.4 2 1.9 2 3",
    "M4 22h16",
  ],
  streaks: [
    "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",
  ],
  lifecycle: [
    "M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0",
    "M3 18c2-4 4-4 6 0s4 4 6 0 4-4 6 0",
  ],
  anniversary: [
    "M3 4h18v18H3z",
    "M16 2v4",
    "M8 2v4",
    "M3 10h18",
  ],
  rank: ["M12 3v18", "m6 9 6-6 6 6"],
};

function Seal({ family }: { family: string }) {
  return (
    <span className="ms-mark">
      <svg className="ico" viewBox="0 0 24 24">
        {(SEAL[family] ?? []).map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
    </span>
  );
}

function Item({ value, subject }: { value: string; subject: string }) {
  // A value-less item — every Rank change entry — spans the whole row instead
  // of being laid into the auto-sized value track, where it would size to its
  // own max-content and blow the measure.
  if (value === "")
    return (
      <div className="ms-it plain">
        <span className="ms-t">{subject}</span>
      </div>
    );
  return (
    <div className="ms-it">
      <span className="ms-n">{value}</span>
      <span className="ms-t">{subject}</span>
    </div>
  );
}

function MilestoneCard({ t }: { t: MilestoneTile }) {
  const plate = t.items.length === 1;
  const counts = t.items.filter((i) => i.bucket === "count");
  const totals = t.items.filter((i) => i.bucket === "total");
  // The column header names the unit so the items stop repeating it. "Days"
  // and "Hours" are the drawn labels; they widen only when the bucket really
  // holds something else, so the common day reads exactly as frozen.
  const countHead = counts.every((i) => i.subject !== "session logged") ? "Days" : "Counts";
  const totalHead = totals.every((i) => i.value.endsWith(" h")) ? "Hours" : "Totals";

  return (
    <>
      <div className="ms-head">
        <Seal family={t.family} />
        <span className="ms-fam">{t.label}</span>
      </div>
      {plate && <span className="ms-rule" />}
      {t.split ? (
        <div className="ms-list split">
          <div className="ms-col">
            <span className="ms-colh">{countHead}</span>
            {counts.map((i, k) => (
              <Item key={k} value={i.value} subject={i.subject} />
            ))}
          </div>
          <span className="ms-split-rule" />
          <div className="ms-col">
            <span className="ms-colh">{totalHead}</span>
            {totals.map((i, k) => (
              <Item key={k} value={i.value} subject={i.subject} />
            ))}
          </div>
        </div>
      ) : (
        <div className="ms-list">
          {t.items.map((i, k) => (
            <Item key={k} value={i.value} subject={i.subject} />
          ))}
        </div>
      )}
    </>
  );
}

function StreaksCard({ t }: { t: StreaksTile }) {
  return (
    <>
      <div className="ms-head">
        <Seal family="streaks" />
        <span className="ms-fam">Streaks</span>
      </div>
      <div className="ms-list">
        {t.streaks.map((s, i) => (
          <div className="ms-it" key={i}>
            <span className="ms-n">{s.value}</span>
            <span className="ms-t">
              {s.subject}
              {s.longest && (
                <span className="ms-star" title="longest streak">
                  {" ★"}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

