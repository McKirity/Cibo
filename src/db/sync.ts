/**
 * THE SYNC SWITCH — Phase 2 step 3, Track B (user-ruled 2026-08-09: Evolu's
 * free relay · "Put a switch in" · identity surface now).
 *
 * Whether THIS machine talks to the relay is a machine fact, so the flag is
 * per-device (deviceStore, never Evolu — a synced "stop syncing" flag could
 * never propagate its own OFF). Read synchronously at module load: main.tsx
 * primes the deviceStore cache before any app module evaluates.
 *
 * A flip takes effect AT THE NEXT LAUNCH. The transport list is a `createEvolu`
 * constructor argument; Evolu can add/remove transports live via `useOwner`,
 * but that API is marked experimental — the relaunch path is the boring one,
 * and the Settings row says so in place.
 *
 * Default ON (absent key = syncing): the switch exists to turn sync off, and
 * the store is end-to-end encrypted with the owner secret, so the relay holds
 * only ciphertext.
 *
 * THE RELAY IS SELF-HOSTED (user-ruled 2026-08-09, option A): the free
 * `wss://free.evoluhq.com` relay has a 1 MB per-owner quota — test-only by its
 * own docs; the seeded store hit `ProtocolQuotaError` within minutes of the
 * courier going live. The relay now runs on this PC (`C:\Users\H5\cibo-relay\`,
 * autostarted at logon — its README is the ops record) and the URL is a
 * per-device value: this PC reaches it at localhost, the Mac (step 4) at this
 * PC's address.
 *
 * ⚠ Every relay host must be in tauri.conf.json's `connect-src` (csp AND
 * devCsp) — a URL the CSP doesn't list is refused by the webview with no
 * visible failure. Same silent-permission-gap family as the Tauri capability
 * lessons. A `cibo.syncRelay` override therefore needs a CSP entry + rebuild
 * to actually take effect.
 */
import { deviceGet, deviceSet } from "../settings/deviceStore";

/** This device's relay address; the deviceStore key is the Mac's door. */
export const RELAY_URL = deviceGet("cibo.syncRelay") ?? "ws://localhost:4000";

const KEY = "cibo.sync";

/** The flag as stored right now (the NEXT launch's behaviour). */
export const isSyncEnabled = (): boolean => deviceGet(KEY) !== "off";

export const setSyncEnabled = (on: boolean): void => {
  deviceSet(KEY, on ? null : "off");
};

/**
 * What THIS session's Evolu instance was constructed with — the live truth,
 * frozen at module load (before any Settings flip can happen). The restore
 * door gates on this, not on the stored flag: restoring an identity pulls its
 * data from the relay, which needs a connection that exists NOW.
 */
export const syncActiveThisSession: boolean = isSyncEnabled();

// ── the restore-pending flag (finding sync-3) ────────────────────────────────
//
// `restoreAppOwner` resets the store and restarts the app — and on that next
// launch the store is EMPTY while the owner's real data is still in flight
// from the relay. The seed cannot tell that store from a genuinely fresh one,
// so it planted 11 fresh-id habits and the relay then delivered the originals:
// double of everything (CRDT merge working as designed — they ARE different
// rows). Deterministic seed ids were considered and REJECTED: column-level
// last-write-wins means a joining device's fresh plant (newer timestamps)
// would silently overwrite real state — archived flags, icons, keepsakes —
// which trades a loud defect for a quiet one.
//
// The fix is that the restore door is the ONLY path into "fresh store +
// existing owner" (a manual store wipe mints a NEW owner by construction), and
// it is our own code — so it leaves this note, and the next boot waits for the
// relay's delivery instead of seeding. Per-device by nature; cleared by the
// boot that honors it.

const RESTORE_KEY = "cibo.restorePending";

export const isRestorePending = (): boolean => deviceGet(RESTORE_KEY) === "1";
export const setRestorePending = (): void => deviceSet(RESTORE_KEY, "1");
export const clearRestorePending = (): void => deviceSet(RESTORE_KEY, null);
