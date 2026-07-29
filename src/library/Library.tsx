/**
 * Build step 6 catch-up — the LIBRARY screen (`kit-table-library`), the
 * stats-vs-library split's second screen, translated from the frozen
 * `Final/library.html` (re-frozen 2026-07-19 — the Slab-pull toolbar re-lay).
 *
 * Four zones: head (title · count · the back-door to stats) → toolbar (tier-3
 * search + the five filters + the manage doors + grid⇄list — the app's ONE
 * persisted view state, per-device) → the Current-pin band → the paginated
 * catalog (9×2 whole portrait rows per page; pagination bounds RENDERING
 * VOLUME, the pane scrolls past the fold). Cards widen on rail-collapse, the
 * counts hold (`repeat(var(--lib-grid-cols),1fr)`).
 *
 * Fences (binding): every card/row is a DOOR to its entry dashboard — no
 * inline editing anywhere; Bulk edit opens its modal directly (the library
 * never enters a multi-select state); the importer doors are inert until
 * step 8.
 *
 * Implementation stand-ins, recorded: the persisted view state rides
 * localStorage until the per-device local file exists ([[Sync & Per-Device
 * Settings]]); search text is transient (not part of the persisted state);
 * the pin band hides at zero Current entries.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LibEntry, LibraryViewState, SortKey } from "./librarySpec";
import {
  DEFAULT_VIEW_STATE,
  SORT_LABELS,
  catalogHeadline,
  filterEntries,
  genreFilterOptions,
  importerDoors,
  isFilterActive,
  pagerCells,
  paginate,
  pinBandLabel,
  recentSortLabel,
  sortEntries,
} from "./librarySpec";
import { stars } from "../metrics/format";
import { useLibraryData } from "./useLibraryData";
import { Capsule, FilterChip, Ico, ICON, PrioGlyph, Stars, StatusPill } from "./bits";
import { EntryCreationModal } from "./EntryCreationModal";
import { BulkEditModal } from "./BulkEditModal";
import "./library.css";

const PER_PAGE_COLS = "--lib-grid-cols";
const PER_PAGE_ROWS = "--lib-grid-rows";

/** 9×2 off the dials (the counts are dials; reading them keeps the page bound
 * to the drawn geometry if a theme ever legally re-pins them). */
const perPage = (): number => {
  const cs = getComputedStyle(document.documentElement);
  const cols = parseInt(cs.getPropertyValue(PER_PAGE_COLS)) || 9;
  const rows = parseInt(cs.getPropertyValue(PER_PAGE_ROWS)) || 2;
  return cols * rows;
};

const storageKey = (habitKey: string) => `cibo.libraryView.${habitKey}`;

const loadViewState = (habitKey: string): LibraryViewState => {
  try {
    const raw = localStorage.getItem(storageKey(habitKey));
    if (raw == null) return DEFAULT_VIEW_STATE;
    return { ...DEFAULT_VIEW_STATE, ...(JSON.parse(raw) as Partial<LibraryViewState>) };
  } catch {
    return DEFAULT_VIEW_STATE;
  }
};

const fmtHours = (h: number): string => {
  if (h < 0.05) return "—";
  if (h < 10) return `${(Math.round(h * 10) / 10).toString().replace(/\.0$/, "")} h`;
  return `${Math.round(h)} h`;
};

export function Library({
  habitKey,
  onBackToStats,
  onOpenEntry,
}: {
  habitKey: string;
  onBackToStats: () => void;
  onOpenEntry: (id: string) => void;
}) {
  const data = useLibraryData(habitKey);

  const [state, setState] = useState<LibraryViewState>(() => loadViewState(habitKey));
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [creationOpen, setCreationOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(habitKey), JSON.stringify(state));
    } catch {
      /* per-device nicety only — a blocked write costs nothing */
    }
  }, [habitKey, state]);

  /** Every view-state change re-derives from page 1 (the drawn behavior —
   * a filter narrows the set, so the old page number is meaningless). */
  const patch = useCallback((p: Partial<LibraryViewState>) => {
    setState((s) => ({ ...s, ...p }));
    setPage(1);
  }, []);

  const filtered = useMemo(
    () => sortEntries(filterEntries(data.entries, { search, state }), state.sort, state.flipped),
    [data.entries, search, state],
  );
  const pageData = useMemo(() => paginate(filtered, page, perPage()), [filtered, page]);

  const genreOptions = useMemo(
    () => genreFilterOptions(data.entries, data.genreVocab),
    [data.entries, data.genreVocab],
  );

  const hasType = data.typeVocab.length > 0;
  const empty = data.ready && data.entries.length === 0;
  const allCurrent = useMemo(
    () => data.entries.filter((e) => e.status === "Current"),
    [data.entries],
  );

  const sortLabel =
    state.sort === "recent" ? recentSortLabel(habitKey) : SORT_LABELS[state.sort];

  if (!data.ready) return null;

  return (
    <div className="libscreen" data-content={empty ? "empty" : "populated"}>
      {/* the dashboards' dev perf readout, mirrored so the masthead sits at the
          same y as its stats sibling (user-ruled 2026-07-27) */}
      <div className="perf-line">
        {data.entries.length} entries · {data.entries.reduce((n, e) => n + e.sessionCount, 0)}{" "}
        sessions · {pageData.total} match · page {pageData.page} of {pageData.pageCount}
      </div>
      <div className="lib">
        {/* ── 1 · HEADLINER — the dashboard masthead anatomy (user-ruled
            2026-07-27, overriding the FINAL's bare head row: the library wears
            a `.panel.mast` headliner like every other dashboard; the back-door
            to stats takes the door column the stats masthead gives Library) */}
        <section className="panel mast libmast">
          <div className="art" style={{ background: `var(--${data.colourSlot})` }}>
            <span>{data.name[0]?.toUpperCase()}</span>
          </div>
          <div className="idcol">
            <div className="idrow">
              <span className="hname">{data.name} Library</span>
            </div>
            <div className="since">
              {empty ? (
                "no entries yet"
              ) : (
                <>
                  <b>{data.entries.length}</b> {data.entries.length === 1 ? "title" : "titles"} ·{" "}
                  <b>{allCurrent.length}</b> current
                </>
              )}
            </div>
          </div>
          <button
            className="backdoor"
            title={`Back to the ${data.name} stats dashboard`}
            onClick={onBackToStats}
          >
            <Ico d={ICON.back} />
            <span className="hdot" style={{ background: `var(--${data.colourSlot})` }} />
            {data.name} stats
          </button>
        </section>

        {/* ── 2 · TOOLBAR (the ONE persisted view state) — its own panel again:
            the 2026-07-27 roll-into-the-headliner experiment was REVERSED the
            same day (user: "not feeling it") ── */}
        <div className="tbar">
          <div className="tsearch">
            <Ico d={ICON.search} size={14} />
            <input
              type="text"
              value={search}
              placeholder="Search title or creator…"
              disabled={empty}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="tfilters">
            <FilterChip
              k="Sort"
              value={sortLabel + (state.flipped ? " ↑" : "")}
              active={false}
              items={(Object.keys(SORT_LABELS) as SortKey[]).map((key) => ({
                key,
                label: key === "recent" ? recentSortLabel(habitKey) : SORT_LABELS[key],
                selected: state.sort === key,
                // re-picking the active key flips direction (the removed list
                // headers' toggle, folded into the chip)
                onPick: () =>
                  patch(state.sort === key ? { flipped: !state.flipped } : { sort: key, flipped: false }),
              }))}
            />
            <FilterChip
              k="Status"
              value={state.status ?? "All"}
              active={state.status != null}
              items={[
                { key: "", label: "All", selected: state.status == null, onPick: () => patch({ status: null }) },
                ...data.statusVocab.map((v) => ({
                  key: v,
                  label: v,
                  selected: state.status === v,
                  onPick: () => patch({ status: v }),
                })),
              ]}
            />
            {/* Type is ABSENT (not dashed) where no type is declared — user-ruled
                2026-07-27, overriding the FINAL's dashed-inert delta face. */}
            {hasType && (
              <FilterChip
                k="Type"
                value={state.type ?? "All"}
                active={state.type != null}
                items={[
                  { key: "", label: "All", selected: state.type == null, onPick: () => patch({ type: null }) },
                  ...data.typeVocab.map((v) => ({
                    key: v,
                    label: v,
                    selected: state.type === v,
                    onPick: () => patch({ type: v }),
                  })),
                ]}
              />
            )}
            <FilterChip
              k="Genre"
              value={state.genre ?? "All"}
              active={state.genre != null}
              items={[
                { key: "", label: "All", selected: state.genre == null, onPick: () => patch({ genre: null }) },
                ...genreOptions.map((g) => ({
                  key: g.value,
                  label: g.label,
                  selected: state.genre === g.value,
                  onPick: () => patch({ genre: g.value }),
                })),
              ]}
            />
            <FilterChip
              k="Priority"
              value={state.priority == null ? "All" : String(state.priority)}
              active={state.priority != null}
              items={[
                { key: "", label: "All", selected: state.priority == null, onPick: () => patch({ priority: null }) },
                ...[0, 1, 2, 3].map((p) => ({
                  key: String(p),
                  label: p === 0 ? "None (0)" : String(p),
                  selected: state.priority === p,
                  onPick: () => patch({ priority: p }),
                })),
              ]}
            />
            <FilterChip
              k="Rating"
              value={
                state.rating == null ? "All" : state.rating === "none" ? "Unrated" : stars(state.rating)
              }
              active={state.rating != null}
              items={[
                { key: "", label: "All", selected: state.rating == null, onPick: () => patch({ rating: null }) },
                ...[5, 4, 3, 2, 1].map((r) => ({
                  key: String(r),
                  label: stars(r),
                  selected: state.rating === r,
                  onPick: () => patch({ rating: r }),
                })),
                {
                  key: "none",
                  label: "Unrated",
                  selected: state.rating === "none",
                  onPick: () => patch({ rating: "none" as const }),
                },
              ]}
            />
            <button
              className={`towned${state.owned ? " on" : ""}`}
              onClick={() => patch({ owned: !state.owned })}
            >
              <span className="box">
                <Ico d={ICON.check} size={12} />
              </span>
              Owned
            </button>
            {(isFilterActive(state) || search !== "") && (
              <button
                className="tclear"
                onClick={() => {
                  setSearch("");
                  patch({ status: null, type: null, genre: null, priority: null, rating: null, owned: false });
                }}
              >
                <Ico d={ICON.close} size={14} />
                Clear
              </button>
            )}
          </div>
          <div className="tdoors">
            <button className="btn-accent" onClick={() => setCreationOpen(true)}>
              <Ico d={ICON.plus} size={14} />
              New entry
            </button>
            <button className="btn-plain" onClick={() => setBulkOpen(true)} disabled={empty}>
              <Ico d={ICON.edit} size={14} />
              Bulk edit
            </button>
            {importerDoors(habitKey).map((label) => (
              <button key={label} className="btn-plain" disabled title="Importers arrive at step 8">
                <Ico d={ICON.download} size={14} />
                {label}
              </button>
            ))}
            {/* the grid⇄list toggle was REMOVED with the list view (user-ruled
                2026-07-27) — the catalog is grid-only */}
          </div>
        </div>

        {empty ? (
          /* ── EMPTY STATE (fresh library) — kit-state-empty ── */
          <div className="lib-empty">
            <div className="emptybox">
              <div className="et">No entries in your {data.name} library yet</div>
              <p className="es">
                Your catalog is where everything you track in {data.name} lives — find, sort, and
                open any title from here. Bring a collection in with an importer, or add the first
                title by hand.
              </p>
              <div className="edoors">
                <button className="btn-accent" onClick={() => setCreationOpen(true)}>
                  <Ico d={ICON.plus} size={14} />
                  New entry
                </button>
                {importerDoors(habitKey)
                  .slice(0, 1)
                  .map((label) => (
                    <button key={label} className="btn-plain" disabled title="Importers arrive at step 8">
                      <Ico d={ICON.download} size={14} />
                      {label}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* ── 3 · CURRENT-PIN BAND ── */}
            {allCurrent.length > 0 && (
              <div className="pinband">
                <div className="pinlabel">
                  <span className="pl">{pinBandLabel(habitKey)}</span>
                  <span className="pc">{allCurrent.length} current</span>
                </div>
                <div className="pinrow">
                  {allCurrent.map((e) => (
                    <button key={e.id} className="pincard" onClick={() => onOpenEntry(e.id)}>
                      <CoverFace e={e} vocab={data.statusVocab} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── 4 · CATALOG ── */}
            <div className="cat">
              <div className="cathead">
                <span className="ct">{catalogHeadline(state, search, sortLabel)}</span>
                <span className="cm">
                  {pageData.total === 0
                    ? "No titles match"
                    : `Showing ${pageData.from}–${pageData.to} of ${pageData.total}`}
                </span>
              </div>

              {/* GRID ONLY — the library's list view was REMOVED (user-ruled
                  2026-07-27, overriding the FINAL's grid⇄list toggle): the
                  tabular face belongs to the bulk editor's picker; the
                  catalog is the cover wall of the two. */}
              <div className="grid">
                {pageData.rows.map((e) => (
                  <button
                    key={e.id}
                    className="gcard"
                    title={`${e.title} · open entry dashboard`}
                    onClick={() => onOpenEntry(e.id)}
                  >
                    <CoverFace e={e} vocab={data.statusVocab} />
                  </button>
                ))}
              </div>

              {/* numbered pager */}
              <div className="pager">
                <span className="pgcount">
                  Page {pageData.page} of {pageData.pageCount}
                </span>
                <div className="pgnums">
                  <button
                    className="pgnum arrow"
                    title="Previous page"
                    disabled={pageData.page <= 1}
                    onClick={() => setPage(pageData.page - 1)}
                  >
                    <Ico d={["m15 18-6-6 6-6"]} size={14} />
                  </button>
                  {pagerCells(pageData.page, pageData.pageCount).map((c, i) =>
                    c === "…" ? (
                      <span key={`e${i}`} className="pgell">
                        …
                      </span>
                    ) : (
                      <button
                        key={c}
                        className={`pgnum${c === pageData.page ? " on" : ""}`}
                        onClick={() => setPage(c)}
                      >
                        {c}
                      </button>
                    ),
                  )}
                  <button
                    className="pgnum arrow"
                    title="Next page"
                    disabled={pageData.page >= pageData.pageCount}
                    onClick={() => setPage(pageData.page + 1)}
                  >
                    <Ico d={["m9 18 6-6-6-6"]} size={14} />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {creationOpen && (
        <EntryCreationModal
          habitKey={habitKey}
          onClose={() => setCreationOpen(false)}
          onOpenEntry={(id) => {
            setCreationOpen(false);
            onOpenEntry(id);
          }}
        />
      )}
      {bulkOpen && <BulkEditModal habitKey={habitKey} onClose={() => setBulkOpen(false)} />}
    </div>
  );
}

/** The portrait cover-forward face shared by catalog + pin cards: capsule (or
 * art, later), badges row, the scrim caption. */
function CoverFace({ e, vocab }: { e: LibEntry; vocab: string[] }) {
  return (
    <>
      <Capsule title={e.title} className="gcover" />
      <div className="gbadges">
        {e.status != null ? <StatusPill status={e.status} vocab={vocab} /> : <span />}
        {e.purchased ? (
          <span className="cown" title="Purchased">
            <Ico d={ICON.check} size={13} />
          </span>
        ) : (
          <span />
        )}
      </div>
      <div className="gcap">
        {/* priority ends the title row, RIGHT-aligned and decoupled from the
            title's own text flow (a flex sibling, compact-scaled to the line
            height) so it can never inflate the line box — user-ruled
            2026-07-27, final placement */}
        <span className="gtrow">
          <span className="gt">{e.title}</span>
          {e.priority != null && e.priority > 0 && (
            <span className="gtprio" title={`Priority ${e.priority}`}>
              <PrioGlyph p={e.priority} />
            </span>
          )}
        </span>
        <span className="gcreator">
          {[e.creators[0] ?? e.studios[0], e.type]
            .filter((x): x is string => x != null && x !== "")
            .join(" · ") || " "}
        </span>
        <span className="grow">
          <Stars rating={e.rating} />
          <span className="chip-h">{fmtHours(e.hours)}</span>
        </span>
      </div>
    </>
  );
}
