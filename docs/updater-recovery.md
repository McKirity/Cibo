# Updater recovery

The rule: **auto-update must never be able to brick the app — a manual
re-install always recovers cleanly.** Written at the Phase-2 completion audit
(2026-08-06); the updater shipped with v0.9.0 (2026-08-16) and its first
round-trip, v0.9.0 → v1.0.0, ran on both platforms. The mechanism is
`src/shell/updater.ts` over `tauri-plugin-updater`: silent launch check +
background download, install on quit, one loud door ("Check for updates" in
the palette and on Settings → Health's sync row). Updates are prod-only —
a dev build never checks.

## Why re-install is always safe

The installer and the data never touch:

- **The store** is an OPFS SAHPool directory under
  `%LOCALAPPDATA%\io.github.mckirity.cibo\EBWebView\` (WebView2's profile) on
  Windows, and under the app's WebKit website-data directory on macOS —
  outside the install directory either way. Install, uninstall, and update
  never write there.
- **Dev builds are a different app** (`io.github.mckirity.cibo.dev`, "Cibo
  Dev") with their own store and settings — a dev build cannot update, and
  cannot touch an installed copy's data. See development.md.
- **Backups, images, and themes** live under the user-picked cloud root
  (`<cloud root>/backups|images|themes`), on the cloud drive.
- **Per-device settings** are `settings.json` + `timer-heartbeat.json` in
  `%LOCALAPPDATA%\io.github.mckirity.cibo\` (macOS: `~/Library/Application
  Support/io.github.mckirity.cibo/`), also untouched by the installer.

So the worst a failed update can cost is the binary — never the data.

## The recovery path

1. If the app won't launch after an update: download the latest installer from
   the GitHub Releases page and run it over the broken install. Data, settings
   and theme pick all survive in place.
2. If the store itself is the casualty (the fatal launch screen says so): the
   screen's own doors apply — retry, open the data folder, or restore from a
   backup (the store-directory copy in `<cloud root>/backups` is the restore
   artifact; restore = swap + relaunch, with a safety copy set aside first).
   **On macOS there are no backup files by design** — the Mac's way back is
   the recovery phrase against the relay (sync-relay.md); a lost Mac store is
   re-joined, not restored.
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
- The updater's private signing key must never be lost or rotated casually:
  an installed app trusts only updates signed by the key whose public half it
  shipped with. A rotated key means every installed copy needs a manual
  re-install once (release-process.md § Signing).
