/**
 * The CALIBRE source (reading) — the first non-network importer: the Rust
 * `calibre_scan` command reads the library's `metadata.db` via rusqlite,
 * READ-ONLY always ([[Importer Runtime & External Access]] § the Calibre
 * reader — the ruled metadata.db path over the old plugin's per-book OPF
 * walk: stable book uuid = the missing dedup key, richer metadata, faster
 * scans).
 *
 * The library path is per-device ([[Storage & Filesystem Layout]]); the
 * control is Settings → Importers, the store the per-device settings file
 * (settings/deviceStore, 2026-08-04).
 *
 * Field map ([[Importer Field Mapping]] §4): title · authors → creators ·
 * **tags → genre, IMPORTED** (the user's curated Calibre tags; unknown
 * values auto-add to reading's picklist — the engine's vocabAdd seam) ·
 * comments → description · series/series_index · `#words` custom column →
 * words · uuid → (`calibre`, external_id) · book folder `cover.jpg` → cover
 * · type "Novel" (hardcoded) · status Planned (the old plugin wrote NO
 * status here — recorded gap, deliberately not inherited).
 *
 * The "Scan library" preview (total vs new, no writes) carries over as the
 * area's standing notice. Search filters the scanned catalog locally —
 * debounce is fine, nothing remote fires per keystroke.
 *
 * Covers are LOCAL files, not URLs — they ride a `calibre:<book-path>`
 * pseudo-URL that covers.ts / http.ts route to the `calibre_cover` command
 * (bytes over IPC; the webview never touches the library folder).
 */
import type { FetchOutcome, ImportCandidate, ImporterSource } from "./types";
import { cleanTitle } from "./titles";
import { cleanDescription } from "./text";
import { deviceGet, deviceSet } from "../settings/deviceStore";

const PATH_KEY = "cibo.dev.calibrePath";

const PATH_MISSING = "Calibre library folder not set — pick it in Settings → Importers.";

export const getCalibrePath = (): string | null => {
  const v = deviceGet(PATH_KEY);
  if (v != null && v.trim() !== "") return v;
  // .env.local dev fallback (per-device like the path itself; gitignored).
  // Verified against the real library at entry (2026-08-01): 151 books,
  // #words = custom_column_1, all link tables as calibre_scan expects.
  const env = (import.meta.env.VITE_CALIBRE_PATH as string | undefined)?.trim() ?? "";
  return env === "" ? null : env;
};

export const setCalibrePath = (path: string | null): void => {
  deviceSet(PATH_KEY, path);
  scanCache = null; // a new library means a new catalog
};

export interface CalibreBook {
  uuid: string;
  title: string;
  authors: string[];
  tags: string[];
  comments: string | null;
  series: string | null;
  series_index: number | null;
  words: number | null;
  has_cover: boolean;
  path: string;
}

/** Session-long scan cache, keyed by library path (a multi-thousand-book
 * library must not re-read per keystroke). */
let scanCache: { path: string; promise: Promise<CalibreBook[]> } | null = null;

const ensureScan = (): Promise<CalibreBook[]> => {
  const path = getCalibrePath();
  if (path == null) return Promise.reject(new Error(PATH_MISSING));
  if (scanCache != null && scanCache.path === path) return scanCache.promise;
  const promise = (async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<CalibreBook[]>("calibre_scan", { libraryPath: path });
  })();
  // A failed scan must not poison the session — retry on next call.
  promise.catch(() => {
    if (scanCache?.promise === promise) scanCache = null;
  });
  scanCache = { path, promise };
  return promise;
};

/** The whole scanned catalog — the modal's CATALOG TABLE area reads this
 * directly (user-ruled 2026-08-01: everything in a bulk-edit-style list, the
 * search box a title-only filter, New · All · In-library views). */
export const loadCatalog = (): Promise<CalibreBook[]> => ensureScan();

/** Bytes of one book's cover.jpg — the calibre: pseudo-URL's resolver
 * (covers.ts and http.ts lazy-import this to stay cycle-free). */
export const calibreCoverBytes = async (bookPath: string): Promise<Uint8Array> => {
  const path = getCalibrePath();
  if (path == null) throw new Error(PATH_MISSING);
  const { invoke } = await import("@tauri-apps/api/core");
  const buf = await invoke<ArrayBuffer>("calibre_cover", {
    libraryPath: path,
    bookPath,
  });
  return new Uint8Array(buf);
};

const coverRef = (b: CalibreBook): string | null => (b.has_cover ? `calibre:${b.path}` : null);

// TITLE-ONLY, the ruled filter ([[Importer modal]] § Amended 2026-08-01:
// "it should just filter for title"). This method is currently unreachable —
// the catalog area does its own filtering and the modal guards this lane out —
// but the interface requires it, so it conforms rather than contradicts
// (audit finding importers-3, aligned 2026-08-06).
const search = async (term: string): Promise<ImportCandidate[]> => {
  const books = await ensureScan();
  const needle = term.toLowerCase();
  return books
    .filter((b) => b.title.toLowerCase().includes(needle))
    .slice(0, 60)
    .map((b) => ({
      externalId: b.uuid,
      title: cleanTitle(b.title),
      subtitle: b.authors.length > 0 ? b.authors.join(", ") : null,
      coverUrl: coverRef(b),
    }));
};

const classifyLine = (line: string): { externalId: string } | { error: string } | null => {
  const t = line.trim();
  if (t === "") return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t))
    return { externalId: t };
  return {
    error: "Calibre imports come from the scanned library — use Search, or paste a book uuid",
  };
};

const fetchItem = async (uuid: string): Promise<FetchOutcome> => {
  const books = await ensureScan();
  const b = books.find((x) => x.uuid === uuid);
  if (b == null) return { kind: "failed", reason: `no book with uuid ${uuid} in the scanned library` };
  const title = cleanTitle(b.title);
  if (title === "") return { kind: "failed", reason: "book carried no title" };
  // Calibre series_index is a float (2.5 legal); series_order is an integer
  // column — rounded, floor 1. Recorded mechanic, not a ruling.
  const order =
    b.series != null && b.series_index != null ? Math.max(1, Math.round(b.series_index)) : null;
  return {
    kind: "entry",
    entry: {
      title,
      description: cleanDescription(b.comments),
      creators: b.authors,
      studios: [],
      type: "Novel",
      genre: b.tags.filter((t) => t.trim() !== ""),
      series: b.series,
      seriesOrder: order,
      words: b.words != null ? Math.max(0, Math.round(b.words)) : null,
      coverUrl: coverRef(b),
      status: "Planned",
    },
  };
};

/** The ruled probe: the configured metadata.db resolves and opens readable. */
const probe = async (): Promise<{ ok: boolean; detail: string }> => {
  if (getCalibrePath() == null) return { ok: false, detail: PATH_MISSING };
  try {
    const books = await ensureScan();
    return { ok: true, detail: `Calibre library readable — ${books.length} books` };
  } catch (e) {
    return { ok: false, detail: String(e instanceof Error ? e.message : e) };
  }
};

/** The "Scan library" preview — total vs new, no writes. */
const notice = async (existingPairs: ReadonlySet<string>): Promise<string | null> => {
  if (getCalibrePath() == null) return PATH_MISSING;
  try {
    const books = await ensureScan();
    const fresh = books.filter((b) => !existingPairs.has(`calibre:${b.uuid}`)).length;
    return `Library scanned — ${books.length} books · ${fresh} not yet in Cibo.`;
  } catch (e) {
    return String(e instanceof Error ? e.message : e);
  }
};

export const calibreSource: ImporterSource = {
  key: "calibre",
  areaLabel: "Novels",
  sourceName: "Calibre",
  habitKey: "reading",
  areaKind: "catalog",
  noPaste: true, // the library is read from disk — nothing to paste (user-ruled 2026-08-01)
  searchPlaceholder: "Filter by title…",
  pasteHelp: "", // no paste lane — see noPaste
  searchMode: "debounce",
  search,
  classifyLine,
  fetchItem,
  probe,
  notice,
};
