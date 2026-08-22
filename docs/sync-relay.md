# Sync and the relay

How two machines share one store, and how to run the relay that makes it possible. Written at
the v1.0.0 docs pass (2026-08-21).

## What sync is

Evolu syncs by passing encrypted CRDT changes through a **relay** — a small WebSocket server
that stores ciphertext per owner and hands it to whichever device asks. Devices never talk to
each other directly. Two consequences:

- **The relay sees nothing.** The store is encrypted with the owner's key, which is derived from
  the twelve-word recovery phrase; the relay holds opaque blobs.
- **The relay is the only thing between the devices.** If it is off, each device keeps working
  on its own copy and the changes meet when it is back.

Sync is **on by default** (`cibo.sync`, per device; `src/db/sync.ts`). A flip takes effect at
the next launch — the transport list is a `createEvolu` constructor argument.

## Why the relay is self-hosted

Evolu's free public relay (`wss://free.evoluhq.com`) has a **1 MB per-owner quota** and is
test-only by its own docs; a seeded Cibo store hit `ProtocolQuotaError` within minutes. So the
app points at a relay of its own. In the author's setup it runs on the desktop PC, autostarted at
logon, and the laptop reaches it over the LAN.

## Running your own

The relay is Evolu's reference Node relay — about forty lines. It is **not in this repository**
(it is infrastructure, and the repo is public); this is the recipe.

```
mkdir cibo-relay && cd cibo-relay
npm init -y
npm install @evolu/nodejs@2.4.0 @evolu/common@7.4.1     # match the app's versions — see below
```

`index.mjs`, as the author runs it — the reference relay with the quota removed and storage
pinned to a local `./data/` folder:

```js
import { createConsole } from "@evolu/common";
import { createNodeJsRelay } from "@evolu/nodejs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// Storage lands in ./data (better-sqlite3). Keep it OFF any cloud-synced drive —
// an active SQLite database on a syncing folder corrupts.
const dataDir = join(import.meta.dirname, "data");
mkdirSync(dataDir, { recursive: true });
process.chdir(dataDir);

const result = await createNodeJsRelay({ console: createConsole() })({
  port: 4000,
  isOwnerWithinQuota: () => true,   // a private relay: every owner allowed, no ceiling
});

if (!result.ok) {
  console.error("relay failed to start:", result.error);
  process.exit(1);
}
console.log("relay listening on ws://localhost:4000");
```

Run it with `node index.mjs`. The author autostarts it at logon (a `.vbs` wrapper so no console
window shows, launched from the Windows Startup folder). The devices hold the real data; the
relay's `./data/` is a courier's copy.

## Pointing the app at it

Three things have to agree, and **two of them need a rebuild**:

1. **The URL.** The default is `ws://localhost:4000`. Another machine overrides it with the
   per-device key `cibo.syncRelay` in its `settings.json` (the value in use is shown on the
   sync row of Settings → Health and in Help → About). The laptop's value is the PC's LAN
   address or hostname — e.g. `ws://192.168.1.20:4000` or `ws://mypc.local:4000`.
2. **The content-security policy.** The webview refuses any WebSocket host not listed in
   `src-tauri/tauri.conf.json` → `app.security.csp` **and** `devCsp`, `connect-src` — *with no
   visible failure*. The shipped config lists the author's hosts; **a different host needs a
   CSP entry and a rebuild**, so a stranger running their own relay is building their own Cibo.
3. **Version coupling.** The relay's `@evolu/nodejs` and `@evolu/common` must be on the **same
   release train as the app's** `@evolu/web` / `@evolu/common` (`package.json`). They share one
   wire protocol; a skewed relay fails as a generic connection error. **When Dependabot bumps
   Evolu in the app, bump the relay in the same sitting.**

## Joining a second device

Install, finish first-run, then **Settings → Storage → Restore from a phrase** with the first
device's phrase. The app resets its store, restarts, and **holds on a waiting screen until the
owner's data has arrived** — it must not seed a fresh store that the relay then merges the real
one into (that is how the first join produced two of every habit, and why the `restorePending`
flag exists). **The join fails closed**: with the relay unreachable there is no seed, the flag
stays armed, and the screen offers *Try again* and a deliberate *Start fresh*.

## Restoring a backup under sync — the world rewinds

A backup restore swaps the store directory and relaunches. Under sync, **the restored store
becomes the truth and the other device follows it back** — it is not a per-device undo. The
practical rules:

- **Quit the other device before restoring.** A device still running reconnects inside
  `onOpen` (measured ~16 s) and pushes the stale history straight back.
- To rewind the relay itself, stop it, move `./data/` aside, restart it, then let the restored
  device upload first.
- The PC is the only machine that writes or restores backups by design; the Mac's way back is
  always the phrase. See the in-app manual's *Backups* and *Sync* articles for the user-facing
  version.

## Things that look like sync bugs and are not

- **A device away for a while takes minutes, not seconds, to catch up.** The reconnect backoff
  grows while nothing answers; nothing is lost.
- **A day row created on both devices before they synced ends up twinned.** Date uniqueness is
  app-enforced and each device checks only its own store; `ensureUniqueDayRows` merges the twins
  at launch (oldest survives, `finalized` ORs, extras tombstoned).
- **There is no conflict UI.** CRDT merges resolve everything; the app has no conflict screen by
  design.
