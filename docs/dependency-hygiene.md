# Dependency hygiene

The conventions that keep Cibo runnable for years with a minimum of dependency
risk. Written at the Phase-2 completion audit (2026-08-06); the reasoning lives
in the planning vault's Longevity & Future-Proofing record.

## The rules

- **Small surface.** New dependencies are a decision, not a convenience — every
  runtime dep must earn its place against "could 30 lines of our own code do
  this?". The npm surface is deliberately thin (React, Evolu, Tauri API
  packages, lucide); the Rust surface likewise (rusqlite, zstd, tar, serde).
- **Pin what renders.** `lucide` is pinned EXACT (1.28.0): icon glyphs are part
  of the app's face, and a silent minor bump can redraw them. A lucide bump is
  a deliberate maintenance pass — run the app, eyeball the rail and Settings →
  Icons — never an incidental update.
- **Dependabot is the watchdog** (`.github/dependabot.yml`): npm at `/`, cargo
  at `/src-tauri`, monthly, minor+patch grouped into one PR so a **major stays
  a standalone decision**. Evolu and Tauri are the priority reviews — Evolu
  especially for any future compaction/reclamation support (the growth spike
  proved it never compacts today).
- **The relay is coupled to the app's Evolu version.** The self-hosted sync
  relay (sync-relay.md) runs `@evolu/nodejs` + `@evolu/common` on the same
  release train as the app's `@evolu/web` / `@evolu/common`; they speak one
  wire protocol and a skewed relay fails as a generic connection error. **An
  Evolu bump in this repo means a relay bump in the same sitting** — the relay
  is outside the repo, so nothing automated will remind you.
- **Updates ship as rebuilds.** The installed app can never install a
  dependency update — npm deps compile into the bundle, so an update is a new
  release delivered by the auto-updater. Dependency hygiene is repo-side work,
  invisible to the running app.
- **Major-version bumps get a branch and a full manual pass** (launch, log,
  finalize, backup, restore rehearsal) before merging. Evolu majors
  additionally get a store-compatibility check against a copy of a real store —
  never the live one.
- **The escape hatch stays open.** Cibo is not locked in at the data layer:
  `exportDatabase()` yields a portable `.db` with a clean relational schema.
  If a dependency ever proves unmaintainable, the data walks away intact; a
  maintained alternatives roster lives in the planning vault.
