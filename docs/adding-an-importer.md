# Adding an importer

The six shipped sources (Steam · TMDB · YouTube · AniList · Calibre · AO3) are written against
one interface, and a seventh is an *add*, not a rework. Written at the v1.0.0 docs pass
(2026-08-21). Read `src/importers/types.ts` alongside this.

## The interface

An `ImporterSource` (`src/importers/types.ts`) is one object per source:

| Member | What it does |
|---|---|
| `key` · `habitKey` | The `SourceKey` literal, and the habit whose library the door lives on. |
| `areaLabel` · `sourceName` | The content type ("Games") and the source ("Steam") — the modal's subtitle reads "Source · X". |
| `search(term, opts?)` | Returns `ImportCandidate[]` — `externalId`, `title`, `subtitle`, `coverUrl`. **Return a multiple of five** (the results grid is five across; a partial row is a defect). `opts.adult` is the AniList-style `"hide" | "only"` pill, only if `adultFilter: true`. |
| `classifyLine(line)` | The paste path: turn one pasted line into `{ externalId }`, `{ error }`, or `null` for "not mine". Search and paste **share one dispatch path** (both resolve to a `QueueItem`), so the paste lane can never rot. |
| `fetchItem(externalId)` | The full record as a `FetchedEntry` (title, description, creators, studios, type, genre, series, words, coverUrl, status, …) or a typed `FetchOutcome` failure. May return `canonicalExternalId` when the response knows a better identity than the one asked for (a YouTube `@handle` → the `UC…` id). |
| `probe()` | The Settings → Health *Test connection* run: `{ ok, detail }`. |
| `searchMode` | `"debounce"` (search as you type) or `"submit"` (explicit — AO3, which rate-limits). |
| Optional seams | `squareCovers` · `areaKind: "catalog"` (Calibre's table + "Queue all") · `defaultTab` · `noPaste` · `adultFilter` · `notice(existingPairs)`. |

Register the object in `src/importers/sources.ts`; the library's one **Import** door and the
modal's area switch read the registry.

## The five places a new source touches

1. **`types.ts`** — add the `SourceKey` literal.
2. **`sources.ts`** — register the source.
3. **`src-tauri/capabilities/default.json`** — every host the source fetches from (API *and*
   image hosts) under the `http:default` scope's `allow` list. All fetches are Rust-side through
   `tauri-plugin-http`; an unlisted host fails silently from the webview's point of view. **A
   capability change needs a full Rust rebuild.**
4. **`src/settings/HelpPane.tsx`** — the About page's *hosts the app can reach* list, with the
   reason. This list is a promise to the user; keep it complete.
5. **`src/importers/keys.ts`** + Settings → Importers — only if the source needs an API key.
   Keys are stored plainly in `app_meta` (they sync); the pane is the one entry surface.

Seed data, the habit's `type` vocabulary (e.g. a new `type` value for the habit's picklist),
and the manual's Importers table follow.

## What `engine.ts` does for you

- **HTTP** (`http.ts`): one backoff retry on 429/5xx honouring `Retry-After`; an identifying
  `User-Agent: Cibo/<version> (+repo)` on every request — reqwest sends none by default and AO3
  403s a UA-less request; never a spoofed browser string.
- **Dedup** on `(source, external_id)`, batch-local as well as against the store.
- **Adoption**: an existing entry with a NULL identity pair whose title matches is adopted
  silently (reported as `adopted` on the row) — never prompted, never merged.
- **Skip-never-overwrite**: importing fills blank columns only; the user's rating, status,
  genre edits survive a re-import.
- **Covers** (`covers.ts`): downloaded once at import into `<cloud root>/images/<habit-key>/`
  as `<entry-id>.<ext>`; the DB stores the root-relative ref. Re-download is a repair path.
- **Titles** run through `cleanTitle` (™ ® © ℠ struck) and descriptions through
  `cleanDescription`; release years fold into the title.
- **Genre auto-add** (`vocabAdd.ts`): a source that supplies genres (Calibre tags, AO3 fandoms)
  adds them to the habit's picklist case-insensitively, canonical casing winning.

## Shapes the existing sources settled

- **A split identity beats a collision** — TMDB is `tmdb-movie` and `tmdb-tv` because the two
  id spaces overlap.
- **Errors can arrive under HTTP 200** (AniList's GraphQL) — check the body.
- **Match creator roles as normalised whole words**, never substrings (live AniList payloads
  carry "Storyboard (eps …)").
- **A redirect can drop a query parameter** (AO3's `/works → /chapters` 302 loses
  `view_adult=true`); refetch the effective URL.
- **A login redirect is the *restricted* failure**, reported as such, not a parse error.
- **HTML scraping** (AO3) parses Rust-fetched HTML with the webview's `DOMParser`; selectors are
  provisional by nature and need live verification.
- **Local sources** (Calibre) are custom Rust commands (rusqlite, read-only); their covers ride a
  pseudo-URL (`calibre:`) over IPC, and their path is a per-device setting with a real Browse
  picker.

## The modal

The import modal renders *inside* the library screen, so it **owns its own class names**
(`.rcap`, `.rct`, `.rcsub`) — borrowing the library's caption classes broke the day the library's
card changed. Its width is `flex: 0 0 auto` by ruling; when the results grid overflows, the grid's
`minmax(0, 1fr)` tracks give, never the modal. The results grid is `--import-grid-cols: 5`.
