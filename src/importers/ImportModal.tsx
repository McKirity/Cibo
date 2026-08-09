/**
 * Build step 8 — the IMPORT MODAL (`kit-modal-import` on `kit-shell-overlay`),
 * translated from the frozen `Final/importer-modal.html` (re-frozen
 * 2026-07-17) onto the BUILT modal chassis (the step-7 re-anatomy: head/foot
 * are inner panels, the clearance ring stays unpainted — kit.css owns the
 * shell; this file's CSS is `importer.css`, claimed from kit-staging).
 *
 * ONE chassis, per-source areas: only the search area swaps behind the
 * type-keyed switch (the built `.segctl` pill — the FINAL's inset switch
 * translates to the app's segmented idiom, the step-7 law); the tab strip
 * (Search | Paste URLs — kit-tabs-modal), the queue, IMPORT, inline progress
 * and the added·skipped·failed summary are one shared machinery. Results are
 * COVER GRIDS, never list rows; click a cover = queue toggle; in-library dims
 * inert (`(source, external_id)` — skipped, never overwritten); type is
 * auto-derived from the source area, no manual type step anywhere.
 *
 * Deviations from the frozen file, recorded:
 *  · The FINAL's `.mo-steamnote` CSS has no markup tenant in the frozen file
 *    (removed at the 2026-07-11 sweep) — not drawn.
 *  · Unrecognized paste lines report INLINE under the paste box
 *    (tier-2 where-caused) and never enter the batch.
 *  · Thumbs fetch Rust-side into blob URLs — a remote `<img src>` would be
 *    the webview talking to the network, which the ruling bars.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useOverlayEsc } from "../shell/overlayHooks";
import { Capsule, Ico, ICON } from "../library/bits";
import { ICONS } from "../shell/icons";
import { runImport } from "./engine";
import { sourcesForHabit } from "./sources";
import { thumbBlob } from "./http";
import { threeWayProbe } from "./probes";
import { loadCatalog, type CalibreBook } from "./calibre";
import { useImporterData } from "./useImporterData";
import type {
  ImportCandidate,
  ImporterSource,
  ImportSummary,
  ItemState,
  QueueItem,
  SourceKey,
} from "./types";
import "./importer.css";

const pairKey = (source: string, externalId: string) => `${source}:${externalId}`;

/**
 * A search failure, in words the reader can act on.
 *
 * This used to sniff the message for network-ish words, which was the wrong
 * shape: **the transport tier now names its own failures** — `HttpTimeout`,
 * `HttpUnreachable` and `HttpFail` all carry a sentence — so there is nothing
 * left to guess at. Keeping the regex would have meant two places deciding what
 * "offline" reads like, and the import path (which never had one) proved that
 * per-caller translation is exactly the thing that gets forgotten.
 */
const searchFailure = (e: unknown): string =>
  `Search failed — ${e instanceof Error ? e.message : String(e)}`;

/** Blob-thumb loader — null while loading/failed renders the capsule. */
function useThumb(url: string | null): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSrc(null);
    if (url != null) void thumbBlob(url).then((b) => live && setSrc(b));
    return () => {
      live = false;
    };
  }, [url]);
  return src;
}

function ResultCard({
  cand,
  square,
  inLib,
  queued,
  onToggle,
}: {
  cand: ImportCandidate;
  square: boolean;
  inLib: boolean;
  queued: boolean;
  onToggle: () => void;
}) {
  const thumb = useThumb(cand.coverUrl);
  return (
    <button
      className={(square ? "pfpcard" : "rescard") + (queued ? " q" : "") + (inLib ? " inlib" : "")}
      onClick={() => {
        if (!inLib) onToggle();
      }}
      type="button"
    >
      {thumb != null ? (
        <img className="resimg" src={thumb} alt="" draggable={false} />
      ) : (
        <Capsule title={cand.title} className="rescap" />
      )}
      <span className="qmark">
        <Ico d={queued ? ICON.check : ICON.plus} size={15} />
      </span>
      <span className="inlibtag">
        <Ico d={ICON.check} size={12} />
        In library
      </span>
      {/* the caption carries the modal's OWN class names — never the library's
          (see importer.css § the results-card caption: this modal renders
          inside `.libscreen`, so a borrowed name is a live collision) */}
      <span className="rcap">
        <span className="rct">{cand.title}</span>
        {cand.subtitle != null && <span className="rcsub">{cand.subtitle}</span>}
      </span>
    </button>
  );
}

function ProgressRow({ item, state }: { item: QueueItem; state: ItemState }) {
  const thumb = useThumb(item.coverUrl ?? null);
  const pct =
    state.phase === "added" || state.phase === "adopted" || state.phase === "skipped"
      ? 100
      : state.phase === "importing"
        ? 60
        : state.phase === "failed"
          ? 40
          : 0;
  const label =
    state.phase === "queued"
      ? "queued"
      : state.phase === "importing"
        ? "importing…"
        : state.phase === "added"
          ? "✓ added"
          : state.phase === "adopted"
            ? "✓ adopted"
            : state.phase === "skipped"
              ? `skipped — ${state.reason}`
              : `failed — ${state.reason}`;
  const cls = state.phase === "added" || state.phase === "adopted" ? "done" : state.phase === "failed" ? "fail" : "";
  return (
    <div className="progrow">
      <div className="pthumb">
        {thumb != null ? (
          <img className="resimg" src={thumb} alt="" draggable={false} />
        ) : (
          <Capsule title={item.title} className="rescap" />
        )}
      </div>
      <div className="pmeta">
        <div className="prow1">
          <span className="ptitle">{item.title}</span>
          <span className={"pstat " + cls}>{label}</span>
        </div>
        <div className="pbar">
          <i className={state.phase === "failed" ? "fail" : ""} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

/**
 * The CATALOG TABLE area — Calibre (user-ruled 2026-08-01: *"show everything
 * in a list similar to bulk edit and let the search bar act as a filter"*).
 * The whole scanned library renders as rows on the bulk-edit picker's table
 * vocabulary; the search box filters TITLE ONLY (ruled — no further filter
 * tools); the view switch defaults to what hasn't been imported yet, with
 * Everything and Imported views beside it. Rows toggle queue membership;
 * in-library rows are inert (skip-never-overwrite's face).
 */
function CatalogArea({
  term,
  sourceKey,
  existingPairs,
  queue,
  onToggle,
  onQueueAll,
}: {
  term: string;
  sourceKey: SourceKey;
  existingPairs: ReadonlySet<string>;
  queue: Map<string, QueueItem>;
  onToggle: (cand: ImportCandidate) => void;
  onQueueAll: (cands: ImportCandidate[]) => void;
}) {
  const [view, setView] = useState<"new" | "all" | "inlib">("new");
  const [books, setBooks] = useState<CalibreBook[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadCatalog().then(
      (b) => {
        if (live) setBooks([...b].sort((x, y) => x.title.localeCompare(y.title)));
      },
      (e) => {
        if (live) setError(String(e instanceof Error ? e.message : e));
      },
    );
    return () => {
      live = false;
    };
  }, []);
  if (error != null) return <p className="imp-note">{error}</p>;
  if (books == null) return <p className="imp-note">Scanning the library…</p>;

  const needle = term.trim().toLowerCase();
  const rows = books.filter((b) => {
    if (needle !== "" && !b.title.toLowerCase().includes(needle)) return false;
    const inLib = existingPairs.has(pairKey(sourceKey, b.uuid));
    return view === "all" ? true : view === "new" ? !inLib : inLib;
  });

  const toCand = (b: CalibreBook): ImportCandidate => ({
    externalId: b.uuid,
    title: b.title,
    subtitle: b.authors.join(", ") || null,
    coverUrl: b.has_cover ? `calibre:${b.path}` : null,
  });
  // Import-all's pool — every VISIBLE row not already in the library or the
  // queue (respects the view + title filter, so "all" means "all of these").
  const queueable = rows.filter(
    (b) =>
      !existingPairs.has(pairKey(sourceKey, b.uuid)) && !queue.has(pairKey(sourceKey, b.uuid)),
  );

  return (
    <>
      <div className="imp-viewseg">
        <div className="segctl" role="tablist" aria-label="Catalog view">
          <button aria-pressed={view === "new"} onClick={() => setView("new")}>
            Not imported
          </button>
          <button aria-pressed={view === "all"} onClick={() => setView("all")}>
            Everything
          </button>
          <button aria-pressed={view === "inlib"} onClick={() => setView("inlib")}>
            Imported
          </button>
        </div>
        <button
          type="button"
          className="btn-plain btn-sm"
          disabled={queueable.length === 0}
          onClick={() => onQueueAll(queueable.map(toCand))}
        >
          Queue all · {queueable.length}
        </button>
        <span className="clcount">
          {rows.length} of {books.length} books
        </span>
      </div>
      <div className="clwrap">
        <div className="clgrid clhead">
          <span className="h" />
          <span className="h">Title</span>
          <span className="h">Author</span>
          <span className="h">Series</span>
          <span className="h">Words</span>
          <span className="h" />
        </div>
        {rows.map((b) => {
          const inLib = existingPairs.has(pairKey(sourceKey, b.uuid));
          const isQ = queue.has(pairKey(sourceKey, b.uuid));
          return (
            <button
              key={b.uuid}
              type="button"
              className={"clgrid clrow" + (isQ ? " sel" : "") + (inLib ? " inlib" : "")}
              onClick={() => {
                if (!inLib)
                  onToggle({
                    externalId: b.uuid,
                    title: b.title,
                    subtitle: b.authors.join(", ") || null,
                    coverUrl: b.has_cover ? `calibre:${b.path}` : null,
                  });
              }}
            >
              <span className="clcb">{isQ && <Ico d={ICON.check} size={12} />}</span>
              <span className="clt">{b.title}</span>
              <span className="cell">{b.authors.join(", ")}</span>
              <span className="cell">
                {b.series != null
                  ? b.series + (b.series_index != null ? ` #${b.series_index}` : "")
                  : ""}
              </span>
              <span className="cell mono">{b.words != null ? b.words.toLocaleString() : ""}</span>
              <span className="clstate">
                {inLib ? (
                  <>
                    <Ico d={ICON.check} size={12} />
                    In library
                  </>
                ) : isQ ? (
                  "queued"
                ) : (
                  ""
                )}
              </span>
            </button>
          );
        })}
        {rows.length === 0 && <div className="clempty">Nothing matches this view.</div>}
      </div>
    </>
  );
}

/** The tab an area opens on — paste-primary (AO3) and no-paste (Calibre)
 * sources override the default (user-ruled 2026-08-01). */
const tabFor = (s: ImporterSource | undefined): "search" | "paste" =>
  s == null || s.noPaste ? "search" : (s.defaultTab ?? "search");

export function ImportModal({ habitKey, onClose }: { habitKey: string; onClose: () => void }) {
  const data = useImporterData(habitKey);
  const sources = sourcesForHabit(habitKey);
  // ONE Import door per library (user-ruled 2026-08-01) — the modal always
  // opens on the habit's first area; the switch owns source selection.
  const [srcKey, setSrcKey] = useState<SourceKey>(sources[0]?.key ?? "steam");
  const active: ImporterSource | undefined = sources.find((s) => s.key === srcKey);

  const [tab, setTab] = useState<"search" | "paste">(() => tabFor(sources[0]));
  /** The AniList R18 lever — hidden by default, "only" flips the search. */
  const [adult, setAdult] = useState<"hide" | "only">("hide");
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ImportCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  /**
   * A FAILED search is not an empty one (2026-08-08, found offline).
   *
   * Both search paths used to `.catch(() => setResults([]))` — discarding the
   * error without even reading it — so a network failure rendered as
   * "No results.", which is the answer for a search that RAN and matched
   * nothing. Offline you got a long spin and then a confident, wrong statement
   * about the archive's contents. Same shape as `doctor-1`: *a surface that
   * cannot say "I could not look" is indistinguishable from one that looked and
   * found nothing.*
   */
  const [searchError, setSearchError] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [pasteErrors, setPasteErrors] = useState<string[]>([]);
  const [queue, setQueue] = useState<Map<string, QueueItem>>(new Map());
  const [mstate, setMstate] = useState<"idle" | "importing" | "summary">("idle");
  const [runItems, setRunItems] = useState<QueueItem[]>([]);
  const [itemStates, setItemStates] = useState<ItemState[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [probeMsg, setProbeMsg] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeSecs, setProbeSecs] = useState(0);
  const generation = useRef(0);
  const cancelled = useRef(false);

  useOverlayEsc(onClose);
  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );

  // Debounced live search (the JSON importers' 300 ms; AO3-class sources run
  // on explicit submit instead; catalog areas filter locally and never fetch).
  // A generation counter drops stale responses.
  useEffect(() => {
    if (active == null || active.searchMode !== "debounce" || active.areaKind === "catalog")
      return;
    const t = term.trim();
    if (t.length < 2) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    const gen = ++generation.current;
    setSearching(true);
    const timer = setTimeout(() => {
      void active
        .search(t, { adult })
        .then((r) => {
          if (generation.current === gen) {
            setResults(r);
            setSearchError(null);
            setSearching(false);
          }
        })
        .catch((e: unknown) => {
          if (generation.current === gen) {
            setResults([]);
            setSearchError(searchFailure(e));
            setSearching(false);
          }
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [term, active, adult]);

  const submitSearch = () => {
    if (active == null || active.searchMode !== "submit") return;
    const t = term.trim();
    if (t.length < 2) return;
    const gen = ++generation.current;
    setSearching(true);
    void active
      .search(t, { adult })
      .then((r) => {
        if (generation.current === gen) {
          setResults(r);
          setSearchError(null);
          setSearching(false);
        }
      })
      .catch((e: unknown) => {
        if (generation.current === gen) {
          setResults([]);
          setSearchError(searchFailure(e));
          setSearching(false);
        }
      });
  };

  const existingPairs = useMemo(
    () =>
      new Set(
        data.existing
          .filter((x) => x.source != null && x.external_id != null)
          .map((x) => pairKey(x.source as string, x.external_id as string)),
      ),
    [data.existing],
  );

  // The active area's standing notice — a missing key, the Calibre scan
  // preview, AO3's explicit-submit reminder. Live existingPairs on purpose:
  // Calibre's "M not yet in Cibo" count follows imports in real time.
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (active?.notice == null) {
      setNotice(null);
      return;
    }
    void active.notice(existingPairs).then(
      (msg) => live && setNotice(msg),
      () => live && setNotice(null),
    );
    return () => {
      live = false;
    };
  }, [active, existingPairs]);

  const toggleQueued = (cand: ImportCandidate) => {
    if (active == null) return;
    const key = pairKey(active.key, cand.externalId);
    setQueue((q) => {
      const next = new Map(q);
      if (next.has(key)) next.delete(key);
      else
        next.set(key, {
          source: active.key,
          externalId: cand.externalId,
          title: cand.title,
          coverUrl: cand.coverUrl,
        });
      return next;
    });
  };

  /** Catalog "Queue all" — add-only, never toggles existing picks. */
  const queueAll = (cands: ImportCandidate[]) => {
    if (active == null) return;
    setQueue((q) => {
      const next = new Map(q);
      for (const c of cands) {
        const key = pairKey(active.key, c.externalId);
        if (!next.has(key))
          next.set(key, {
            source: active.key,
            externalId: c.externalId,
            title: c.title,
            coverUrl: c.coverUrl,
          });
      }
      return next;
    });
  };

  /** Paste lines → queue items through the same dispatch path as search. */
  const parsePaste = (): { items: QueueItem[]; errors: string[] } => {
    if (active == null || paste.trim() === "") return { items: [], errors: [] };
    const items: QueueItem[] = [];
    const errors: string[] = [];
    for (const line of paste.split(/\r?\n/)) {
      const res = active.classifyLine(line);
      if (res == null) continue;
      if ("error" in res) errors.push(`"${line.trim()}" — ${res.error}`);
      else
        items.push({
          source: active.key,
          externalId: res.externalId,
          title: line.trim(),
          coverUrl: null,
        });
    }
    return { items, errors };
  };

  const startImport = async () => {
    if (data.habitId == null) return;
    const pasted = parsePaste();
    setPasteErrors(pasted.errors);
    // Queue ∪ paste, deduped in order — one dispatch path for both lanes.
    const seen = new Set<string>();
    const items: QueueItem[] = [];
    for (const it of [...queue.values(), ...pasted.items]) {
      const k = pairKey(it.source, it.externalId);
      if (!seen.has(k)) {
        seen.add(k);
        items.push(it);
      }
    }
    if (items.length === 0) return;
    cancelled.current = false;
    setRunItems(items);
    setItemStates(items.map(() => ({ phase: "queued" })));
    setMstate("importing");
    const srcMap = new Map(sources.map((s) => [s.key as string, s]));
    const result = await runImport(
      items,
      srcMap,
      {
        habitKey,
        habitId: data.habitId,
        bundleHasStatus: data.bundleHasStatus,
        existing: data.existing,
      },
      (i, st) =>
        setItemStates((prev) => {
          const next = prev.slice();
          next[i] = st;
          return next;
        }),
      () => cancelled.current,
    );
    setSummary(result);
    setQueue(new Map());
    setMstate("summary");
  };

  /**
   * The ruled three-way diagnosis — offline · our side · their side.
   *
   * `threeWayProbe` now guarantees it neither rejects nor runs long, but this
   * still carries its own catch: the bug was a `.then` with no `.catch`
   * leaving "probing…" on screen permanently, and a promise chain that assumes
   * the callee behaves is how it happened the first time.
   *
   * The counter is the other half. A wait with no words is indistinguishable
   * from a dead app — the standing lesson — and this wait can run to twenty
   * seconds by design when the network swallows connections.
   */
  const runProbe = () => {
    if (active == null) return;
    if (probing) return; // one at a time; the button is disabled, but not only that
    setProbing(true);
    setProbeSecs(0);
    setProbeMsg(null);
    const started = Date.now();
    const tick = setInterval(() => setProbeSecs(Math.round((Date.now() - started) / 1000)), 1000);
    void threeWayProbe(active)
      .then((r) => setProbeMsg(r.message))
      .catch((e: unknown) => setProbeMsg(`The check itself failed — ${String(e)}`))
      .finally(() => {
        clearInterval(tick);
        setProbing(false);
      });
  };

  if (!data.ready || active == null) return null;

  const doneCount = itemStates.filter(
    (s) => s.phase === "added" || s.phase === "adopted" || s.phase === "skipped" || s.phase === "failed",
  ).length;
  const queuedItems = [...queue.values()];

  return (
    <div className="dimlayer" onMouseDown={onClose} role="presentation">
      <div
        className="mo importmo"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="mo-head">
          <div className="mo-titlewrap">
            <span className="mo-title">Import — {data.habitName}</span>
            {/* Pills carry the CONTENT type; the subtitle names the service
                behind the active area (user-ruled 2026-08-01, the gaming
                "Source · Steam" pattern everywhere). */}
            <span className="mo-sub">Source · {active.sourceName}</span>
          </div>
          <div className="mo-esc">
            <span className="escnote">Esc to close</span>
            <button className="mo-close" aria-label="Close" onClick={onClose}>
              <Ico d={ICON.close} />
            </button>
          </div>
        </div>

        {/* toolbar — area switch (multi-source doors) + the Search|Paste tabs */}
        <div className="imp-toolbar">
          {sources.length > 1 && (
            <div className="segctl" role="tablist" aria-label="Source area">
              {sources.map((s) => (
                <button
                  key={s.key}
                  aria-pressed={s.key === srcKey}
                  onClick={() => {
                    setSrcKey(s.key);
                    setResults([]);
                    setTerm("");
                    setTab(tabFor(s));
                    setAdult("hide");
                  }}
                >
                  {s.areaLabel}
                </button>
              ))}
            </div>
          )}
          {!active.noPaste && (
            <div className="tabstrip">
              <button className={tab === "search" ? "on" : ""} onClick={() => setTab("search")}>
                Search
              </button>
              <button className={tab === "paste" ? "on" : ""} onClick={() => setTab("paste")}>
                Paste URLs
              </button>
            </div>
          )}
        </div>

        {/* body — the per-source area */}
        <div className="mo-body">
          {tab === "search" ? (
            <div className="searchwrap">
              <div className="imp-searchrow">
                <div className="mo-search">
                  <Ico d={ICON.search} />
                  <input
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitSearch();
                    }}
                    placeholder={active.searchPlaceholder}
                    autoFocus
                  />
                </div>
                {active.searchMode === "submit" && (
                  <button
                    className="btn-plain imp-searchbtn"
                    onClick={submitSearch}
                    disabled={term.trim().length < 2}
                  >
                    Search
                  </button>
                )}
                {active.adultFilter === true && (
                  <div className="segctl imp-adult" role="tablist" aria-label="R18 filter">
                    <button aria-pressed={adult === "hide"} onClick={() => setAdult("hide")}>
                      No R18
                    </button>
                    <button aria-pressed={adult === "only"} onClick={() => setAdult("only")}>
                      R18 only
                    </button>
                  </div>
                )}
              </div>
              {notice != null && <p className="imp-notice">{notice}</p>}
              {active.areaKind === "catalog" ? (
                <CatalogArea
                  term={term}
                  sourceKey={active.key}
                  existingPairs={existingPairs}
                  queue={queue}
                  onToggle={toggleQueued}
                  onQueueAll={queueAll}
                />
              ) : (
                <>
                  <div className={"resgrid" + (active.squareCovers ? " pfp" : "")}>
                    {results.map((cand) => (
                      <ResultCard
                        key={cand.externalId}
                        cand={cand}
                        square={active.squareCovers === true}
                        inLib={existingPairs.has(pairKey(active.key, cand.externalId))}
                        queued={queue.has(pairKey(active.key, cand.externalId))}
                        onToggle={() => toggleQueued(cand)}
                      />
                    ))}
                  </div>
                  {searching && <p className="imp-note">Searching…</p>}
                  {/* The failure face comes FIRST and excludes the empty one:
                      "No results" is a claim about the source's contents, and
                      the app may only make it when the search actually ran. */}
                  {!searching && searchError != null && (
                    <div className="imp-searchfail">
                      <p className="imp-lineerrs">{searchError}</p>
                      {probeMsg != null && <p className="probemsg">{probeMsg}</p>}
                      <button className="btn-plain btn-sm" onClick={runProbe} disabled={probing}>
                        {probing ? `Testing… ${probeSecs}s` : "Test connection"}
                      </button>
                    </div>
                  )}
                  {!searching && searchError == null && term.trim().length >= 2 && results.length === 0 && (
                    <p className="imp-note">No results.</p>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="pastewrap">
              <textarea
                className="pastebox"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                spellCheck={false}
              />
              <p className="pastehelp">{active.pasteHelp}</p>
              {notice != null && <p className="imp-notice">{notice}</p>}
              {pasteErrors.length > 0 && (
                <div className="imp-lineerrs">
                  {pasteErrors.map((e, i) => (
                    <p key={i}>{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* foot — the SHARED machinery: queue → import → summary */}
        <div className="mo-foot">
          {mstate === "idle" && (
            <div className="mstate-idle">
              <div className="queuerow">
                <span className="qlabel">Queue</span>
                <div className="qchips">
                  {/* Just "Queue is empty" — user-ruled 2026-08-08. The old copy
                      read "Queue is empty — click a cover to add it", which is
                      wrong on AO3: fanfic has NO cover art by rule, so the
                      instruction pointed at something that is never on screen.
                      Written when the modal's only tenants were cover-bearing
                      sources. Same family as the library's caption and the
                      wall's channel tile: COPY COMPOSED AROUND ART IS
                      PROVISIONAL UNTIL A SOURCE ARRIVES THAT HAS NONE. */}
                  {queuedItems.length === 0 ? (
                    <span className="qempty">Queue is empty</span>
                  ) : (
                    queuedItems.map((it) => (
                      <span className="qchip" key={pairKey(it.source, it.externalId)}>
                        <span>{it.title}</span>
                        <span
                          className="x"
                          title="Remove"
                          onClick={() =>
                            setQueue((q) => {
                              const next = new Map(q);
                              next.delete(pairKey(it.source, it.externalId));
                              return next;
                            })
                          }
                        >
                          <Ico d={ICON.close} size={13} />
                        </span>
                      </span>
                    ))
                  )}
                </div>
                <span className="qcount">
                  {queuedItems.length > 0 ? `${queuedItems.length} queued · ready` : ""}
                </span>
                <button
                  className="btn-accent"
                  disabled={queuedItems.length === 0 && paste.trim() === ""}
                  onClick={() => void startImport()}
                >
                  <Ico d={ICON.download} size={14} />
                  {queuedItems.length > 0 ? `Import ${queuedItems.length}` : "Import"}
                </button>
              </div>
            </div>
          )}

          {mstate === "importing" && (
            <div className="mstate-progress">
              <div className="progtitle">
                Importing {Math.min(doneCount + 1, runItems.length)} of {runItems.length}…
                <span className="mhint2">
                  inline per-item progress · the batch continues past a failure
                </span>
              </div>
              <div className="proglist">
                {runItems.map((it, i) => (
                  <ProgressRow key={pairKey(it.source, it.externalId)} item={it} state={itemStates[i]} />
                ))}
              </div>
            </div>
          )}

          {mstate === "summary" && summary != null && (
            <div className="mstate-summary">
              <div className="sumline">
                <span className="sumtitle">Import complete</span>
                <span className="sumstat added">
                  <b>{summary.added}</b> added
                </span>
                <span className="sumstat skipped">
                  <b>{summary.skipped}</b> skipped <span className="dimnote">(already in library)</span>
                </span>
                <span className="sumstat failed">
                  <b>{summary.failed}</b> failed
                </span>
                <button
                  className="btn-plain imp-again"
                  onClick={() => {
                    setSummary(null);
                    setMstate("idle");
                  }}
                >
                  Import more
                </button>
              </div>
              {summary.failures.length > 0 && (
                <div className="failbox">
                  <Ico d={ICONS.warning} />
                  <div className="fmsg">
                    {summary.failures.map((f, i) => (
                      <p key={i}>
                        <b>{f.title}</b> — {f.reason}
                      </p>
                    ))}
                    {probing ? (
                      <p className="probemsg">
                        Testing the connection… {probeSecs}s
                      </p>
                    ) : (
                      probeMsg != null && <p className="probemsg">{probeMsg}</p>
                    )}
                  </div>
                  <button className="btn-plain" disabled={probing} onClick={runProbe}>
                    {probing ? "Testing…" : "Test connection"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
