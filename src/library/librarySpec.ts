/**
 * Build step 6 catch-up — the Library screen's PURE half (spec-then-render).
 * Everything here is plain TS over already-fetched rows so the esbuild+node
 * harness can run it without Evolu: toolbar filtering (tier-3 local search +
 * the five filters), sorting, 9×2 pagination + the numbered pager, the status
 * pill palette, the duplicate nudge, and bulk-edit's genre-lane arithmetic.
 *
 * Owning records: [[Library (consumption catalog)]] · [[Dashboard Composition]]
 * § Library screen · [[Bulk Edit & Data Correction]] · [[Entry Creator
 * (Manual Entry)]]. The frozen face is `Final/library.html` (re-frozen
 * 2026-07-19); this file implements its behavior, never redraws it.
 */
import { stars } from "../metrics/format";

/** One catalog row — an entry joined with its session-derived aggregates. */
export interface LibEntry {
  id: string;
  title: string;
  status: string | null;
  type: string | null;
  genre: string[];
  priority: number | null;
  rating: number | null;
  purchased: boolean;
  creators: string[];
  studios: string[];
  /* `series` was DROPPED 2026-07-30 (the dedup pass): populated since the
     first build but read by no library surface — the entry dashboard owns
     series display, off its own fetch. */
  cover: string | null;
  banner: string | null;
  /** Total logged duration, in hours (already ÷60). */
  hours: number;
  /** Last session's owning day (recently-played sort) — null = never logged. */
  lastDay: string | null;
  /** Live session count (the bulk confirm's blast radius). */
  sessionCount: number;
  /** Evolu's row birth timestamp (ISO) — the "Recently added" sort key
   * (user-asked 2026-08-01 at the importer pass: imports land in bulk, and
   * "what just arrived" is a different question from "what I last played"). */
  createdAt: string;
}

export type SortKey =
  | "recent"
  | "added"
  | "title"
  | "creator"
  | "rating"
  | "hours"
  | "priority"
  | "status";

/**
 * The toolbar = the app's ONE persisted view state (per-device — [[Shell
 * Mechanics]]). Search text is deliberately NOT part of it: the well is a
 * transient narrowing, not a view choice (implementation call, recorded in the
 * doc log).
 */
export interface LibraryViewState {
  sort: SortKey;
  /** true = the sort key's natural direction flipped. */
  flipped: boolean;
  status: string | null;
  type: string | null;
  genre: string | null;
  priority: number | null;
  /** 1–5 = exact stars · "none" = unrated · null = all (user-asked 2026-07-27). */
  rating: number | "none" | null;
  owned: boolean;
  /* `view` was REMOVED 2026-07-27 (user-ruled): the library is grid-only —
     the tabular face belongs to the bulk editor's picker. Persisted states
     that still carry a `view` key are ignored on load. */
}

export const DEFAULT_VIEW_STATE: LibraryViewState = {
  sort: "recent",
  flipped: false,
  status: null,
  type: null,
  genre: null,
  priority: null,
  rating: null,
  owned: false,
};

/** A non-default filter reads accent (the drawn `.tsel.on` state). */
export const isFilterActive = (s: LibraryViewState): boolean =>
  s.status != null ||
  s.type != null ||
  s.genre != null ||
  s.priority != null ||
  s.rating != null ||
  s.owned;

export const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recently played",
  added: "Recently added",
  title: "Title",
  creator: "Creator",
  rating: "Rating",
  hours: "Hours",
  priority: "Priority",
  status: "Status",
};

// ── Per-habit vocabulary ─────────────────────────────────────────────────────

/** "Now Playing / Reading / Watching" — the band label speaks the habit's vocab. */
export const pinBandLabel = (habitKey: string): string =>
  ({ gaming: "Now Playing", reading: "Now Reading", media: "Now Watching" })[habitKey] ??
  "Current";

/** The recently-played sort label speaks the habit's verb too. */
export const recentSortLabel = (habitKey: string): string =>
  ({ gaming: "Recently played", reading: "Recently read", media: "Recently watched" })[
    habitKey
  ] ?? "Recently active";

/**
 * The importer door — ONE per library (user-ruled 2026-08-01 at the step-8
 * GUI pass: *"just have a single Import that opens the modal and I can then
 * select from where to import"* — the per-source toolbar doors collapsed,
 * and gaming's single door reads "Import", never "Import from Steam"). The
 * modal's area switch owns source selection.
 */
export const importerDoors = (habitKey: string): string[] =>
  habitKey === "gaming" || habitKey === "media" || habitKey === "reading" ? ["Import"] : [];

// ── Filtering (tier-3 local search + the five toolbar filters) ───────────────

export interface LibraryFilterInput {
  search: string;
  state: LibraryViewState;
}

/** Tier-3 local search: title + creator/studio, case-insensitive substring. */
const matchesSearch = (e: LibEntry, needle: string): boolean => {
  if (needle === "") return true;
  const n = needle.toLowerCase();
  return (
    e.title.toLowerCase().includes(n) ||
    e.creators.some((c) => c.toLowerCase().includes(n)) ||
    e.studios.some((s) => s.toLowerCase().includes(n))
  );
};

export const filterEntries = (entries: LibEntry[], f: LibraryFilterInput): LibEntry[] =>
  entries.filter(
    (e) =>
      matchesSearch(e, f.search.trim()) &&
      (f.state.status == null || e.status === f.state.status) &&
      (f.state.type == null || e.type === f.state.type) &&
      (f.state.genre == null || e.genre.includes(f.state.genre)) &&
      (f.state.priority == null || (e.priority ?? 0) === f.state.priority) &&
      (f.state.rating == null ||
        (f.state.rating === "none" ? e.rating == null : e.rating === f.state.rating)) &&
      (!f.state.owned || e.purchased),
  );

// ── Sorting ──────────────────────────────────────────────────────────────────

const byTitle = (a: LibEntry, b: LibEntry) => a.title.localeCompare(b.title);

/** Each key's PRIMARY comparison in its NATURAL direction (recent/rating/
 * hours/priority read best-first). Title tiebreaks live in `sortEntries`. */
const primaryComparators: Record<SortKey, (a: LibEntry, b: LibEntry) => number> = {
  recent: (a, b) => (b.lastDay ?? "").localeCompare(a.lastDay ?? ""),
  added: (a, b) => b.createdAt.localeCompare(a.createdAt),
  title: byTitle,
  creator: (a, b) =>
    (a.creators[0] ?? a.studios[0] ?? "~").localeCompare(b.creators[0] ?? b.studios[0] ?? "~"),
  rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
  hours: (a, b) => b.hours - a.hours,
  priority: (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
  status: (a, b) => (a.status ?? "~").localeCompare(b.status ?? "~"),
};

export const sortEntries = (entries: LibEntry[], sort: SortKey, flipped: boolean): LibEntry[] => {
  // The flip applies to the PRIMARY key only — the title tiebreak stays
  // ascending (a whole-array reverse read titles Z→A within equal ratings;
  // 2026-07-30).
  const dir = flipped ? -1 : 1;
  return [...entries].sort((a, b) => dir * primaryComparators[sort](a, b) || byTitle(a, b));
};

// ── Pagination (9×2 bounds RENDERING VOLUME, not height) ─────────────────────

export interface PageResult {
  rows: LibEntry[];
  page: number;
  pageCount: number;
  /** "Showing 1–18 of 214" numbers (1-based, inclusive; 0 when empty). */
  from: number;
  to: number;
  total: number;
}

export const paginate = (entries: LibEntry[], page: number, perPage: number): PageResult => {
  const total = entries.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const p = Math.min(Math.max(1, page), pageCount);
  const from = total === 0 ? 0 : (p - 1) * perPage + 1;
  const to = Math.min(total, p * perPage);
  return { rows: entries.slice(from - 1, to), page: p, pageCount, from, to, total };
};

// pagerCells HOISTED to kit/Pager.tsx 2026-07-30 (the dedup pass — the Map
// was its second consumer); re-exported here so existing import paths and the
// harness pattern keep working.
export { pagerCells } from "../kit/Pager";

// ── Status pills — the categorical palette, always carrying the word ─────────

/**
 * The five anchors wear the DASHBOARDS' assignment (specShared.STATUS_CAT) —
 * user-ruled 2026-07-30, "follow what the dashboards say": this file's drawn
 * library map (Current 1 · Finished 2 · Planned 3 · Hiatus 4 · Dropped 8)
 * disagreed with the dashboards' drawn map, both citing FINAL fidelity, and
 * the same status pill wore two colours across screens. User-added statuses
 * take the remaining palette in vocab order, cycling. Returns the `--cat-N`
 * dial name — use-sites color-mix it per the tint rule, never a literal.
 */
export const statusCatVar = (status: string, statusVocab: string[]): string => {
  // A Map, not a bare object — a user-added status named "constructor" must
  // not resolve to an inherited prototype member (2026-07-30).
  const anchored = new Map<string, number>([
    ["Current", 2],
    ["Finished", 4],
    ["Dropped", 6],
    ["Planned", 3],
    ["Hiatus", 8],
  ]);
  const a = anchored.get(status);
  if (a != null) return `--cat-${a}`;
  const extras = statusVocab.filter((v) => !anchored.has(v));
  // The slots the anchors leave free, then the full cycle.
  const free = [1, 5, 7, 2, 3, 4, 6, 8];
  const i = Math.max(0, extras.indexOf(status));
  return `--cat-${free[i % free.length]}`;
};

/** Anchors first in seed order, user-added after — the drawn dropdown order. */
export const orderedStatusVocab = (raw: { value: string; sort_order: number }[]): string[] =>
  [...raw].sort((a, b) => a.sort_order - b.sort_order).map((r) => r.value);

/**
 * Genre filter options: vocab order first, then values only the data still
 * carries ("· retired" — the chunk-3 derivation, data minus vocab). Shared by
 * the library toolbar and the bulk-edit picker (which carries the same filter
 * set — user-ruled 2026-07-27).
 */
export const genreFilterOptions = (
  entries: LibEntry[],
  vocab: string[],
): { label: string; value: string }[] => {
  const used = new Set(entries.flatMap((e) => e.genre));
  const retired = [...used].filter((g) => !vocab.includes(g)).sort();
  return [
    ...vocab.map((g) => ({ label: g, value: g })),
    ...retired.map((g) => ({ label: `${g} · retired`, value: g })),
  ];
};

/**
 * Type filter options — genre's data-minus-vocab retired derivation, applied
 * to the entry-level Medium (2026-07-30): a type only the data still carries
 * stays filterable, "· retired"-marked.
 */
export const typeFilterOptions = (
  entries: LibEntry[],
  vocab: string[],
): { label: string; value: string }[] => {
  const used = new Set(entries.flatMap((e) => (e.type != null ? [e.type] : [])));
  const retired = [...used].filter((t) => !vocab.includes(t)).sort();
  return [
    ...vocab.map((t) => ({ label: t, value: t })),
    ...retired.map((t) => ({ label: `${t} · retired`, value: t })),
  ];
};

// ── The catalog headline (user-ruled at the GUI pass, 2026-07-27) ────────────

/**
 * The cathead's left side reads the ACTIVE VIEW, not a constant: the active
 * filters + the sorting rule ("Planned · Puzzle · owned · sorted by hours");
 * with nothing active it falls back to "All titles". The right side is just
 * the range ("Showing 1–18 of 214") — the sort moved left.
 */
export const catalogHeadline = (
  state: LibraryViewState,
  search: string,
  sortLabel: string,
): string => {
  const parts: string[] = [];
  if (state.status != null) parts.push(state.status);
  if (state.type != null) parts.push(state.type);
  if (state.genre != null) parts.push(state.genre);
  if (state.priority != null) parts.push(`priority ${state.priority}`);
  if (state.rating != null)
    parts.push(state.rating === "none" ? "unrated" : stars(state.rating));
  if (state.owned) parts.push("owned");
  const q = search.trim();
  if (q !== "") parts.push(`matching “${q}”`);
  const head = parts.length > 0 ? parts.join(" · ") : "All titles";
  return `${head} · sorted by ${sortLabel.toLowerCase()}${state.flipped ? " (reversed)" : ""}`;
};

// ── The duplicate nudge (soft, never blocking) ───────────────────────────────

/** Case-insensitive within the habit; returns the existing entry or null. */
export const findDuplicate = (title: string, entries: LibEntry[]): LibEntry | null => {
  const t = title.trim().toLowerCase();
  if (t === "") return null;
  return entries.find((e) => e.title.trim().toLowerCase() === t) ?? null;
};

// ── The cover-card lettermark (the no-cover fallback face) ───────────────────

/** The FINAL's mono abbreviation: initials of up to 4 words, uppercased.
 * Deliberately NOT metrics/format territory: the 4-char cover-lettermark
 * contract differs from a plain initialism, so it stays with its tenant. */
export const coverAbbr = (title: string): string =>
  title
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase() || "?";

// ── Bulk edit — the six-field payload + the genre lanes ──────────────────────

/** Every field defaults "no change" (undefined = leave the column untouched).
 * Only rating carries a null arm (its one drawn Clear) — status has no Clear,
 * so its type stops advertising one (2026-07-30). */
export interface BulkFieldState {
  status?: string;
  priority?: number;
  type?: string;
  genreAdd: string[];
  genreRemove: string[];
  purchased?: boolean;
  rating?: number | null;
}

export const EMPTY_BULK_STATE: BulkFieldState = { genreAdd: [], genreRemove: [] };

export const bulkHasChanges = (s: BulkFieldState): boolean =>
  s.status !== undefined ||
  s.priority !== undefined ||
  s.type !== undefined ||
  s.purchased !== undefined ||
  s.rating !== undefined ||
  s.genreAdd.length > 0 ||
  s.genreRemove.length > 0;

/**
 * The ADD/REMOVE lanes: add appends missing values, remove drops present ones
 * — never a blind replace. Returns null when the entry's list is unchanged
 * (skip the column in the update).
 */
export const applyGenreLanes = (
  current: string[],
  add: string[],
  remove: string[],
): string[] | null => {
  const out = current.filter((g) => !remove.includes(g));
  for (const g of add) if (!out.includes(g)) out.push(g);
  const changed = out.length !== current.length || out.some((g, i) => g !== current[i]);
  return changed ? out : null;
};

// ── The bulk picker TABLE (the 2026-07-27 exhibit ruling — v3 "list") ────────
// "Bulk edit is tabular work, so the picker IS a table: every quality a
// column, aligned. Headers sort; status sorts by LIFECYCLE order, not
// alphabetically." The companion identity grid was rejected — list only.

export type PickerSortKey = "title" | "status" | "rating" | "priority" | "type" | "genre" | "own";

/** The exhibit's lifecycle order; user-added statuses land after the anchors,
 * alphabetically among themselves. */
// A Map, not a bare object — a user-added status named "constructor" must
// not resolve to an inherited prototype member (2026-07-30).
const STATUS_LIFECYCLE = new Map<string, number>([
  ["Current", 0],
  ["Hiatus", 1],
  ["Planned", 2],
  ["Finished", 3],
  ["Dropped", 4],
]);

export const statusLifecycleRank = (status: string | null): number =>
  status == null ? 99 : STATUS_LIFECYCLE.get(status) ?? 50;

const pickerKey = (e: LibEntry, k: PickerSortKey): number | string => {
  switch (k) {
    case "title":
      return e.title.toLowerCase();
    case "status":
      return statusLifecycleRank(e.status);
    case "rating":
      return e.rating ?? 0;
    case "priority":
      return e.priority ?? 0;
    case "type":
      return (e.type ?? "").toLowerCase();
    case "genre":
      return e.genre.join(", ").toLowerCase();
    case "own":
      return e.purchased ? 1 : 0;
  }
};

/** Sort for the picker table; `dir` 1 = the header's first click. Stable-ish
 * via the title tiebreak. Status ties among user statuses break by name. */
export const sortPickerRows = (
  entries: LibEntry[],
  key: PickerSortKey | null,
  dir: 1 | -1,
): LibEntry[] => {
  if (key == null) return entries;
  return [...entries].sort((x, y) => {
    const a = pickerKey(x, key);
    const b = pickerKey(y, key);
    // `dir` applies to the PRIMARY comparison only — the tiebreaks stay
    // ascending regardless of the flip (2026-07-30).
    let c = (a < b ? -1 : a > b ? 1 : 0) * dir;
    if (c === 0 && key === "status") c = (x.status ?? "").localeCompare(y.status ?? "");
    if (c === 0) c = x.title.localeCompare(y.title);
    return c;
  });
};

/** The stacked confirm's live blast radius, off the picker's selection. */
export const bulkBlastRadius = (
  selected: LibEntry[],
): { entries: number; sessions: number; files: number } => ({
  entries: selected.length,
  sessions: selected.reduce((n, e) => n + e.sessionCount, 0),
  files: selected.reduce((n, e) => n + (e.cover != null ? 1 : 0) + (e.banner != null ? 1 : 0), 0),
});
