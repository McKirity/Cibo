# Release process

How a version of Cibo is cut. Written at the v1.0.0 docs pass (2026-08-21); v0.9.0 was the first
release through this pipeline, v1.0.0 the second.

## The shape

1. **Bump the version in three files** — they must agree:
   `package.json` · `src-tauri/tauri.conf.json` · `src-tauri/Cargo.toml`. (Then `npm install`
   so `package-lock.json` follows, and a `cargo build` or `tauri dev` so `Cargo.lock` does.)
2. Commit, and **push a tag `v<version>`** (`git tag v1.0.0 && git push origin v1.0.0`). The tag
   is the trigger; nothing else starts a release.
3. **CI builds both platforms** (`.github/workflows/release.yml`, `tauri-apps/tauri-action`, a
   `windows-latest` + `macos-latest` matrix) and assembles **one draft release** both jobs feed:
   the Windows `.exe` installer, the macOS `.dmg`, the updater bundles with their signatures, and
   a merged `latest.json`.
4. **A human reviews the draft and publishes it.** Both platforms present? Sizes sane? The
   installers named **"Cibo"**, not "Cibo Dev"? Then press Publish.
5. Every installed copy picks it up on its next launch and installs it on its next quit —
   silently, by design (see [updater-recovery.md](updater-recovery.md)).

## The one thing that must never be published

The base `tauri.conf.json` is **dev-flavored** (`"Cibo Dev"`, `io.github.mckirity.cibo.dev` —
see [development.md](development.md)). CI restores the real identity by passing
`--config src-tauri/tauri.prod.conf.json`, which overlays only `productName` and `identifier`.

**If that argument is ever lost, the draft's installers will read "Cibo Dev".** Publishing such a
draft would ship an app that installs beside the real one with a separate data store, and the
updater would hand it to every user. The draft review exists for exactly this: look at the asset
names before publishing. A local `npm run tauri build` without the `--config` produces a "Cibo
Dev" bundle too — that is expected, and it is why CI is the only minter of the real identity.

## Signing

- **The updater key pair** is real security: `latest.json` entries are signed with the private
  key (a `minisign` key, `~/.tauri/cibo.key`), and the public key baked into `tauri.conf.json`
  (`plugins.updater.pubkey`) is what lets an installed app trust an update. The private key and
  its password are GitHub Actions secrets (`TAURI_SIGNING_PRIVATE_KEY`,
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). Losing the private key means no installed copy can ever
  update again without a manual re-install; it is ignored by `.gitignore` (`*.key`, `.tauri/`).
- **Code signing is deliberately absent.** No Windows Authenticode, no Apple Developer ID. The
  consequences are documented in the README's install steps (SmartScreen's "unrecognized app";
  macOS's "damaged" until `xattr -cr`). Once installed, the updater's own signature is what
  verifies updates — the v0.9.0 → v1.0.0 round-trip confirmed an updated Mac app launches with no
  Gatekeeper complaint.

## Checklist before the tag

- `npx tsc --noEmit` clean, `npm test` green.
- The three version files agree.
- `docs/` and the in-app manual (`src/settings/manual.md`) say what the build does.
- The updater endpoint in `tauri.conf.json` points at this repo's
  `releases/latest/download/latest.json`.
- No stale draft or tag from an abandoned release is sitting on GitHub — the updater reads
  `releases/latest`, and a published older draft would be "latest".
