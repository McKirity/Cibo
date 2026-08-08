# Updater recovery

The rule: **auto-update must never be able to brick the app — a manual
re-install always recovers cleanly.** Written at the Phase-2 completion audit
(2026-08-06); the updater itself ships at Phase 2 step 5.

## Why re-install is always safe

The installer and the data never touch:

- **The store** is an OPFS SAHPool directory under
  `%LOCALAPPDATA%\io.github.mckirity.cibo\EBWebView\` (WebView2's profile),
  outside the install directory. Install, uninstall, and update never write
  there.
- **Backups, images, and themes** live under the user-picked cloud root
  (`<cloud root>/backups|images|themes`), on the cloud drive.
- **Per-device settings** are `settings.json` + `timer-heartbeat.json` in
  `%LOCALAPPDATA%\io.github.mckirity.cibo\`, also untouched by the installer.

So the worst a failed update can cost is the binary — never the data.

## The recovery path

1. If the app won't launch after an update: download the latest installer from
   the GitHub Releases page and run it over the broken install. Data, settings
   and theme pick all survive in place.
2. If the store itself is the casualty (the fatal launch screen says so): the
   screen's own doors apply — retry, open the data folder, or restore from a
   backup (the store-directory copy in `<cloud root>/backups` is the restore
   artifact; restore = swap + relaunch, with a safety copy set aside first).
3. Nothing about recovery requires the previous app version: backups are
   versioned data, not versioned binaries, and the schema is forward-only
   (see migration-rules.md), so the newest release always reads them.

## What must stay true

- The updater config stays **silent, install-on-quit, stable-only, no
  rollback** — recovery is re-install + backups, never a rollback mechanism.
- No release may move the store, the per-device files, or the cloud-root
  layout without a migration that runs BEFORE the old location is abandoned.
- The Releases page must always carry a full installer (not just an update
  patch) — it is the recovery artifact.
