# Development

Running, testing, and the things that have bitten before. Written at the v1.0.0 docs pass
(2026-08-21).

## Running it

Prerequisites: Node ≥ 22, Rust stable via rustup, and on Windows the MSVC C++ Build Tools.

```
npm install
npm run tauri dev      # the app, with Vite HMR; first run compiles the Rust shell (minutes)
npm test               # vitest — 23 files / 399 tests at v1.0.0
npx tsc --noEmit       # the type check CI does not run for you
```

There is no lint step. A clean `vite build` proves less than it looks (see *Tripwires*).

## The dev/prod identity split — read this first

**A dev build is a different app.** `src-tauri/tauri.conf.json` — the base config that
`tauri dev` and a bare local `tauri build` read — carries `productName: "Cibo Dev"` and
`identifier: io.github.mckirity.cibo.dev`. The bundle id names the app-data directory *and* the
webview profile, so a dev build has its own Evolu store, its own `settings.json`, its own
heartbeat file, its own recovery phrase — and **structurally cannot touch an installed copy's
data.** Sync works in dev; it just syncs a different owner.

The real identity (`productName: "Cibo"`, `io.github.mckirity.cibo`) lives only in
`src-tauri/tauri.prod.conf.json`, which **only CI applies** (`--config` in `release.yml`). See
[release-process.md](release-process.md) for the tripwire that comes with that.

Consequences:

- First dev launch after a fresh clone meets first-run on an empty store. Use Settings →
  Developer → **Rich seeder** to fill it (DEV-gated and dynamically imported, so `seedRich` is
  verifiably absent from a production bundle). The seeder reads importer API keys from
  `.env.local` if you have them (`VITE_`-prefixed; see `src/importers/keys.ts`).
- Dev wants its own cloud root (Settings → Storage) so backups, images and drop-in themes never
  mix with a real one.
- The escape hatch, for deliberately running dev code against a real store:
  `npm run tauri dev -- --config src-tauri/tauri.prod.conf.json`. Know what you are doing.
- A change to `productName` forces a full Rust rebuild. So does any capability change.

## Tests

`vitest` over the pure cores only — metrics shapes and dates, the dashboard spec generators,
the seed and its migrations (forward-only, in sequence, from every historical `SEED_VERSION`),
the day-ledger de-twinner, the doctor's checks over synthetic snapshots, the timer engine, the
ambience deck, the compare-spec gate, validation. Nothing renders; nothing touches Evolu
(`doctor.ts` needs the store module stubbed because it builds its queries at module load).

There is no UI test suite. GUI verification has always been a human walking the app.

## Instruments

- **The layout probe** — `Ctrl/Cmd+Shift+L` in a dev build POSTs a report of every element that
  overflows, clips, or wraps its text to a serve-only Vite endpoint (`/__probe`), landing in
  `.probe/latest.json`. DEV-only by construction (a DEV-gated dynamic import). Read the header
  of `src/dev/layoutProbe.ts` before trusting a report: it carries ten calibrations, including
  why an `<input>` never reports overflow through `scrollWidth` in either engine.
- **Settings → Developer → Screen [MacBook] [2K]** — snaps the window to 1512×982 with 85% zoom
  (the Mac's real canvas) or back to the remembered desktop size. Note that `.compact` (the
  narrow layout) derives from true window width under 1600px and cannot be set directly; and
  that the preview enters `.compact` but never `.mac` — engine/typeface differences are only
  visible on a real Mac.
- **Settings → Developer** also has: first-run re-arm, feed re-capture, and un-finalize of recent
  days (the only un-finalize door in the app).
- **The store is readable offline** for diagnosis: the SAHPool file
  `…\File System\000\t\00\00000001` carries the SQLite image at offset 4096, and
  `evolu_history` is a full column-write audit trail (Evolu never compacts).

## Conventions that are actually enforced

- **Check every Evolu mutation `Result`.** Mutations fail *silently*; an unchecked result can
  drop an entire microtask transaction with no log. `bootstrap.tsx` keeps `subscribeError`
  wired. See [migration-rules.md](migration-rules.md) for the seed-batch discipline.
- **Derivations that hung off a write move to the flush.** Evolu batches mutations in a
  microtask, so a query issued inside one sees the old state.
- **Check `src-tauri/capabilities/default.json` before believing any OS call is live.** A
  missing Tauri permission fails silently while the calling code reads perfectly — it has
  happened three separate times (a delete action, the window resize, the webview zoom). The
  READ half of an API is routinely in a `:default` set while the MUTATING half is not; check the
  generated `src-tauri/gen/schemas/acl-manifests.json` for what a set actually contains. Same
  family: every relay host must also be in `tauri.conf.json`'s `connect-src` (csp *and* devCsp).
- **CSS is scoped per screen** (`.libscreen`, `.csdash`, `.cadash`, …) because class names
  collide across screens. A modal mounted *inside* a screen is not isolated by that — it must own
  its class names.
- **No raw values outside `theme.css`.** App stylesheets read dials. A `color-mix` may mix only
  toward other dials or `transparent`, never a literal `white`/`black`; `filter: brightness()`
  is forbidden (it inverts meaning under a dark theme). `in oklch` is only safe when one endpoint
  is near-neutral — otherwise `in oklab`.
- **Headings are Title Case** app-wide; labels, buttons and sentences are sentence case.
- **Whole-star ratings and chevron priorities** everywhere — never "★ 4", never a numeral.

## Tripwires — paid for, each at least once

- **`*/` inside a CSS comment** closes the comment early and swallows the next rule — and
  `vite build` *normalises the evidence away*, so the dist bundle looks correct while the dev
  app is broken. `curl localhost:1420/src/<path>.css` is the honest check.
- **An at-rule nested inside a style rule is silently dropped.** `@keyframes` inside a `.x {}`
  block parses to nothing; the only symptom is the un-animated default. Count brace depth.
- **`minmax()` takes a flex value only as its maximum** — `minmax(1fr, 1fr)` is invalid and
  discards the whole `grid-template-columns`.
- **A dial declared in two sheets has two values** — `small.css` overrides several; read the
  `:root.compact` value before reasoning from the base one.
- **`tauri dev` reads the target-dir copy of `src-tauri/resources/`.** Art dropped into the
  bundled themes needs a re-copy into `target/debug/resources/`; cloud-root drop-ins read live.
- **Folder-pick `fs` grants must be `recursive: true`** or directory scans silently list nothing.
- **`restart()` under `tauri dev` kills Vite** — the relaunch has no frontend. Debug builds use
  `app.exit(0)` where release uses `restart()`.
- **Debug-build zstd reads as a crash** over a large store — `[profile.dev.package.zstd]
  opt-level = 3` in `Cargo.toml` is load-bearing.
- **`win.center()` after `win.set_size()` centres the old size.** An OS call that reads state you
  just wrote is a race unless you sequence it yourself.
- **A fallback that degrades quietly hides a dead subsystem.** The per-device settings layer was
  dead on macOS for five days because nothing had ever created its directory and every write
  went to `warnOnce`; the user-visible symptom was one cosmetic lever "not remembering".

## Two machines, one `main`

Cibo is developed from a Windows PC and a MacBook in parallel, both on `main`. The discipline:
pull at the start of every sitting and again before every commit, push immediately after,
`git pull --rebase`, never force-push, small commits. `src/mac.css` and the layout probe are
Mac-owned; the base stylesheets are PC-owned; shared `.tsx` is either's after a pull. The failure
to fear is not a merge conflict but **the same defect repaired in both sheets** — a `:root.mac`
stopgap and a base fix merge cleanly and leave the field double-corrected.
