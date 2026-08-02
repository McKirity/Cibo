/**
 * Build step 8 — the SHARED IMPORTER INTERFACE (the extensibility contract,
 * [[Importer Runtime & External Access]] 2026-07-05: search/lookup → candidate
 * list → field mapping → entry write + cover download, with per-importer
 * config; a future importer is an ADD, never a rework).
 *
 * The old plugin had NO such interface — sharing was by module, each importer
 * duplicating its own classifier/dedup/run loop (the 2026-07-31 survey,
 * `8. Importers/Old Importer Survey.md`) — so this is designed fresh; the old
 * modules only validate per-source facts.
 *
 * ONE DISPATCH PATH (the survey's one good old shape, re-made deliberately):
 * search results and pasted lines both resolve to a QueueItem — the engine
 * never knows which lane an item came from, so the paste lane can never rot.
 */

/** The `(source, external_id)` source vocabulary — [[Importer Field Mapping]]. */
export type SourceKey =
  | "steam"
  | "tmdb-movie"
  | "tmdb-tv"
  | "anilist-anime"
  | "anilist-manga"
  | "youtube"
  | "calibre"
  | "ao3";

/** One search hit rendered as a cover card in the results grid. */
export interface ImportCandidate {
  externalId: string;
  title: string;
  /** The caption's second line — studio, year, author (the FINAL's .gcreator). */
  subtitle: string | null;
  /** Remote thumb URL; null renders the capsule lettermark. Fetched Rust-side
   * into a blob URL — the webview never talks to the network. */
  coverUrl: string | null;
}

/** What a per-item fetch resolves to. `skipped.silent` is the Steam class —
 * region-blocked / non-game items count as skipped with no error surfaced. */
export type FetchOutcome =
  | { kind: "entry"; entry: FetchedEntry }
  | { kind: "skipped"; reason: string; silent?: boolean }
  | { kind: "failed"; reason: string };

/**
 * The mapped field bundle one import item yields — Entries-column-shaped
 * (the destinations are [[Importer Field Mapping]]'s law; only what a source
 * fetches is set, everything else stays null → skip-never-overwrite composes).
 */
export interface FetchedEntry {
  title: string;
  description: string | null;
  creators: string[];
  studios: string[];
  /** Entry-level Medium — auto-derived from the source area, never asked. */
  type: string | null;
  /** Only Calibre + AO3 import genres (auto-added to the picklist). */
  genre: string[];
  series: string | null;
  seriesOrder: number | null;
  words: number | null;
  /** Remote cover URL to download at import time; null = lettermark (AO3). */
  coverUrl: string | null;
  /** Second-choice cover the engine tries when the first download fails
   * (Steam: portrait CDN → appdetails header_image). */
  coverFallbackUrl?: string | null;
  /** Status seed — "Planned" everywhere except YouTube channels → "Finished". */
  status: string;
  /**
   * The identity to WRITE when it only resolves at fetch time — YouTube's
   * pasted `@handle` becomes the response's canonical UC-id (never the input
   * handle, the old plugin's validated rule). The engine re-checks dedup on
   * it. Absent = the QueueItem's externalId already is canonical.
   */
  canonicalExternalId?: string;
}

/** Per-search options the modal's area controls feed through. */
export interface SearchOpts {
  /** The R18 lever (AniList areas only — `adultFilter` sources): adult works
   * are HIDDEN by default; "only" flips the search to R18-exclusive
   * (user-ruled 2026-08-01). */
  adult?: "hide" | "only";
}

/** A queued unit of work — search-queued cover or classified paste line. */
export interface QueueItem {
  source: SourceKey;
  externalId: string;
  /** Display title while importing (search knows it; paste lanes show the id). */
  title: string;
  coverUrl?: string | null;
}

/** One importer source = one search area riding the shared chassis. */
export interface ImporterSource {
  key: SourceKey;
  /**
   * The area-switch segment label — the CONTENT type, never the service
   * (user-ruled 2026-08-01: "Movies" · "Novels" · "Fanfiction", the media
   * pattern app-wide); the service belongs to `sourceName`.
   */
  areaLabel: string;
  /** The service behind the area ("Steam" · "TMDB" · "AniList" · "Calibre" ·
   * "AO3") — the header's "Source · <name>" subtitle. */
  sourceName: string;
  /** The owning door's habit (gaming · media · reading). */
  habitKey: string;
  searchPlaceholder: string;
  /** Paste-lane help line (plain text; the lane itself is the shared chassis). */
  pasteHelp: string;
  /**
   * "debounce" = the JSON importers' 300 ms as-you-type search;
   * "submit" = AO3's explicit-submit rule (rate-limited scrape — user-ruled).
   */
  searchMode: "debounce" | "submit";
  /** Non-2:3 results grid — YouTube's square channel pfps. */
  squareCovers?: boolean;
  /**
   * "catalog" swaps the cover grid for the LOCAL-CATALOG TABLE (Calibre,
   * user-ruled 2026-08-01: the whole scanned library as a bulk-edit-style
   * list, the search box a title-only filter, a New · All · In-library view
   * switch). Default = the remote search grid.
   */
  areaKind?: "catalog";
  /** The tab the area opens on (AO3 → "paste": paste is primary there,
   * search secondary — user-ruled 2026-08-01). Default "search". */
  defaultTab?: "search" | "paste";
  /** No paste lane at all (Calibre — the library is read from disk;
   * user-ruled 2026-08-01). The tab strip hides. */
  noPaste?: boolean;
  /** Offer the R18 lever (AniList) — see SearchOpts.adult. */
  adultFilter?: boolean;
  search(term: string, opts?: SearchOpts): Promise<ImportCandidate[]>;
  /**
   * Classify one pasted line → an external id, a legible rejection, or null
   * for an empty line. Every accepted line becomes a QueueItem.
   */
  classifyLine(line: string): { externalId: string } | { error: string } | null;
  /** Fetch + map one item. Throws only on transport errors the engine retries. */
  fetchItem(externalId: string): Promise<FetchOutcome>;
  /**
   * The per-service Test connection probe — cheap, side-effect-free, on-demand
   * only ([[App Health & Diagnostics]] owns the surface; mechanics ride here).
   */
  probe(): Promise<{ ok: boolean; detail: string }>;
  /**
   * Optional standing notice for the modal's search area — a missing key
   * ("TMDB API key not set…"), the Calibre scan preview ("N books · M new"),
   * AO3's explicit-submit reminder. Null = nothing to say. Re-read on area
   * switch; receives the in-library pair set so Calibre can count "new".
   */
  notice?(existingPairs: ReadonlySet<string>): Promise<string | null>;
}

/** Per-item live status the modal's progress rows render. */
export type ItemState =
  | { phase: "queued" }
  | { phase: "importing" }
  | { phase: "retrying"; detail: string }
  | { phase: "added" }
  | { phase: "adopted" }
  | { phase: "skipped"; reason: string }
  | { phase: "failed"; reason: string };

export interface ImportSummary {
  added: number;
  skipped: number;
  failed: number;
  /** Per-item errors for the summary's failbox (the first is rendered large). */
  failures: { title: string; reason: string }[];
}
