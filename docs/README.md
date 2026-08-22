# Cibo developer manual

The on-repo record for anyone reading or building the code. The *user* manual is the one
inside the app (Settings → Help → Manual; source at `src/settings/manual.md`). Everything here
is written to be read without the author's planning notes, which are not in the repository.

A reminder before you read further: this app was written by Claude, directed by its user, for
that user's two machines. These pages describe how it *is*, not how a well-engineered app
*should* be.

## Start here

- [architecture.md](architecture.md) — what the app is made of: the stack, the data model, where
  the store lives, and the map of `src/`.
- [development.md](development.md) — running it, the **dev/prod identity split**, the tests, the
  layout probe, and the tripwires that have bitten before.
- [release-process.md](release-process.md) — cutting a version: the three version files, the tag,
  CI, the draft release, and the one thing that must never be published.

## Subsystems

- [sync-relay.md](sync-relay.md) — running your own Evolu relay, the version-coupling rule, and
  what restoring a backup does under sync.
- [updater-recovery.md](updater-recovery.md) — why auto-update can never brick the app, and the
  recovery path when it does go wrong.
- [migration-rules.md](migration-rules.md) — how the data layer changes shape without losing
  data: version-gated seeds vs launch-time reconcilers.
- [dependency-hygiene.md](dependency-hygiene.md) — what is pinned, what Dependabot watches, and
  the relay's coupling to the app's Evolu version.
- [adding-an-importer.md](adding-an-importer.md) — the shared importer interface and the five
  places a new source has to be registered.

## Authoring for the app

- [theme-authoring.md](theme-authoring.md) — the theme package: the dial sheet, ambience,
  fonts, the decoration slot catalog and manifest keys, and the rules a theme's CSS must obey.
  Read together with the template's own README (`src-tauri/resources/themes/_theme-template/`).
- [keepsake-tile-format.md](keepsake-tile-format.md) — writing a cover-wall keepsake tile by
  hand: placeholders, the six rules, what is blocked.
