# Architecture

What Cibo is made of, and where to look. Written at the v1.0.0 docs pass (2026-08-21).

## The stack

- **Tauri 2** (Rust) is the shell: the window, the tray, the filesystem and HTTP plugins, the
  updater, and a handful of custom commands (`src-tauri/src/` — backups in `backup.rs`, the
  Calibre read-only SQLite commands, `ensure_app_data_dir`, path reveal). The Rust side is thin
  by design; **almost all logic is TypeScript**.
- **React 19 + TypeScript** is the UI, built by Vite (`src/`).
- **Evolu** is the data layer — local SQLite (via OPFS in the webview) *and* CRDT sync in one
  library. SQLite is never wired up separately; every read is an Evolu query, every write an
  Evolu mutation. The store is end-to-end encrypted with the owner's key; a relay only ever holds
  ciphertext.
- **lucide** icons, pinned exact (see [dependency-hygiene.md](dependency-hygiene.md)).

Everything else is the app's own code. There is no state-management library, no router (the
`View` union in `src/shell/views.ts` is the route), no CSS framework.

## The data model — eight tables

`src/db/schema.ts` is the one definition. The shape:

| Table | What a row is |
|---|---|
| `habits` | One thing you track. Carries `kind` (`project` · `simple` · `range`), an immutable `sub_type` for projects (`consumption` · `creation`), the entry-attribute bundle, the range rules, milestone-ladder overrides, the keepsake snippet, colour and icon. |
| `entries` | One game / book / film / story — *what it is*. Plain nullable columns (title, cover, banner, status, rating, priority, genre, creators, studios, series, …) plus external identity `(source, external_id)`. Project habits only. |
| `sessions` | One **bout** — *when and how much*. Habit + (for projects) a required entry + an owning day + **exactly one measure** (duration, count, or a range), or measureless. `source` records provenance: `manual` · `timer` · `import` · `derived`. |
| `days` | A sparse ledger: a row exists once a day has bookkeeping — the `finalized` flag and/or the day's whimsy feed snapshot. `date` is app-unique (a launch-time reconciler de-twins rows that two devices created before syncing). |
| `subunit_definitions` | Per-habit declarations of the *tail*: session-level picklists (categoricals) and flags. New per-habit fields are data inserts, not schema changes. |
| `subunit_values` | The value a session holds for one of those definitions. |
| `vocab_options` | The managed picklists — the one global `status` list and each habit's mediums. Rows store the string; rename is a bulk update. |
| `app_meta` | A key/value bag: seed version, importer keys, CS/AS presets (one row each), doctor mutes (one row each), whimsy config, the app's start date, `first_run_complete`. Values are capped at 1000 chars, which is why multi-item things are one-row-per-item. |

Every table gets Evolu's `id` / `createdAt` / `updatedAt` / `isDeleted`; deletes are
tombstones. There are **no free-text fields** anywhere.

**The law the whole app hangs on: completion, streaks, totals, bests, engagement dates, waves,
milestones are all DERIVED, never stored.** `src/metrics/` is the shape catalog (each metric a
pure function, written once); dashboards are *spec-then-render* over a habit's definition with
zero per-habit special-casing. The only stored verdict-adjacent thing is the `days.finalized`
flag, which is what separates "nothing happened" from "not logged yet".

## Where the data lives

- **The store** is an OPFS SAHPool *directory* inside the webview's profile, never a single
  SQLite file. Windows: `%LOCALAPPDATA%\io.github.mckirity.cibo\EBWebView\Default\File System\`.
  Restore therefore means *swapping the directory with the app closed* (`backup.rs` does it in
  `setup()` before any window exists). `exportDatabase()` yields a portable `.db` for reading.
- **Per-device settings** are a plain JSON file outside Evolu — `settings.json` (+ a separate
  `timer-heartbeat.json` whose *absence* is the clean-quit invariant) in the app's local data
  dir (`src/settings/deviceStore.ts`). Preferences sync via `app_meta`; machine facts (theme,
  UI scale, cloud root, sync on/off, relay URL, window geometry) stay here.
- **The cloud root** is one user-picked folder (`cibo.cloudRoot`, per device) with three
  app-owned subfolders: `backups/` · `images/<habit-key>/` · `themes/`. Image refs in the DB are
  always root-relative; `resolveRef` is the one place they become absolute.
- **Dev builds use a completely separate identity and store** — see
  [development.md](development.md).

## The map of `src/`

| Folder | Owns |
|---|---|
| `main.tsx` → `bootstrap.tsx` | `main.tsx` is a shim that awaits the device file, then imports `bootstrap.tsx`: Evolu creation, the seed, the **boot gate** (first-run vs shell), theme init, the error subscription, the updater's launch check. |
| `shell/` | The window chrome: titlebar, the rail (`NavCalendar.tsx`), `views.ts` (the route union), history stack, hotkeys, toasts, tooltips, `FatalLaunch`, the updater (`updater.ts`), the fit-text hook. |
| `daily/` | The front door: the working-day form (`Spine.tsx`), auto-save, finalize, the cover wall + its packer, whimsy cards (two trees, desktop and small), the milestone catalog, keepsake rendering, the network tier for weather/horoscope/tarot, the catch-up queue. |
| `dashboard/` | The four families' components — consumption, creation, simple, range, cadence, entry — each a spec generator plus a renderer. `dashboard.css` at the root. |
| `metrics/` | The pure shape catalog (totals, distinct days, bests, verdicts, streaks, heat levels, distributions, deltas, heatmap cells, waves, eras), cross-habit cadence, date arithmetic including the week-start dial. |
| `db/` | Schema, seed + reconcilers, the doctor's ten checks and its mutes, the day ledger de-twinner, sync switch, duplicates, derived Keyboard words, validation. |
| `library/` | The per-habit cover grid, the creation modal, the bulk editor, entry delete with undo. |
| `importers/` | The six sources behind one interface — see [adding-an-importer.md](adding-an-importer.md). |
| `compare/` · `palette/` · `map/` | Comparing Statistics; the `Ctrl K` palette + Advanced Search; the table-of-contents screen. |
| `timers/` | The clock engine (`timerCore.ts`), the board, the tray, close-guard, crash recovery, the hand-off into Daily. |
| `theme/` | The loader (two roots, one code path), ambience (stills, loops, the slideshow deck), fonts, decoration, derived dials, compact detection, platform detection. |
| `settings/` | The 13-section Settings screen and its panes, the manual reader, the device store, local (per-device) settings, first-run re-arm, the habit creator. |
| `firstrun/` | The pre-shell setup screen. |
| `backup/` | The JS half of backups: `runBackup(reason)` behind every door, retention, the stale check, staged file deletions. |
| `kit/` | Shared pieces: menus, period picker, pager, cover art, the date field. `kit.css` at the root carries the z-tier ladder and the surface-ladder law. |
| `dev/` | Dev-only instruments, dynamically imported so they are absent from production bundles (the layout probe, the rich seeder's door). |

Three stylesheets sit beside the screens' own: `kit.css` (shared), `small.css` (the narrow
canvas's re-compositions, every rule `:root.compact`-scoped) and `mac.css` (engine/typeface
compensation only, every rule `:root.mac`-scoped).

## Themes, in one paragraph

A theme is a folder; `theme.css` is a `:root` block of ~255 custom properties (the "dials")
that every app stylesheet reads, optionally followed by the theme's own rules. The loader
injects the active theme's sheet *after* every bundled stylesheet, so a partial theme degrades
dial by dial. The bundled Default is the ultimate fallback. Full spec:
[theme-authoring.md](theme-authoring.md).
