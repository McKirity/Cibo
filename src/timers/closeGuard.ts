/**
 * Build step 7 — the CLOSE GUARD, a page-lifetime singleton.
 *
 * Close = quit, always; a clock with unlogged accumulators gets the warning
 * modal first ([[App Lifecycle & OS Integration]]). The intercept rides
 * `onCloseRequested` so the titlebar ✕ and Alt+F4 hit the same gate.
 *
 * WHY A SINGLETON (the 2026-07-28 unclosable-window bug): the intercept used
 * to register per Shell mount. Under Vite HMR a stale listener could survive
 * with a dead closure — it still called preventDefault, but its warning modal
 * belonged to an unmounted tree, so every close was silently vetoed and the
 * window could not be closed at all. Now:
 *  - registration happens ONCE per page context (re-mounts re-register only
 *    the UI callback, never a second listener);
 *  - the guard only BLOCKS a close when a live warning UI is registered to
 *    show — with no UI to ask, it lets the close through rather than trapping
 *    the window;
 *  - Proceed quits via `destroy()`, which skips onCloseRequested entirely, so
 *    not even a stale prevented state can hold the app hostage.
 */
import { getCurrentWindow } from "@tauri-apps/api/window";
import { discardAllForQuit, hasLiveClocks } from "./timerStore";
import { getBackupsRoot, runBackup } from "../backup/backup";

let registered = false;
let bypass = false;
let showWarning: (() => void) | null = null;
let showBackingUp: (() => void) | null = null;

/** The shell registers how the quit warning renders; null on unmount. */
export const registerQuitWarning = (fn: (() => void) | null): void => {
  showWarning = fn;
};

/**
 * The shell registers the "backing up before quitting" notice — without it
 * the close-time backup is a frozen window, which reads as a crash (found
 * live 2026-08-03 on the spike-inflated dev store: minutes of silence).
 */
export const registerBackupNotice = (fn: (() => void) | null): void => {
  showBackingUp = fn;
};

/** destroy() skips onCloseRequested — immune to stale/stacked listeners;
 *  close() is the fallback where destroy is unavailable. */
const quitNow = (): void => {
  try {
    const w = getCurrentWindow();
    void w.destroy().catch(() => void w.close().catch(() => {}));
  } catch {
    /* plain browser dev */
  }
};

/**
 * The ruled close sequence's back half: BACKUP → EXIT (step 12; the timer was
 * resolved before this is called). A failed backup still quits — the record
 * and the error log both persist, so the launch stale-check and the health
 * row carry the news; a window refusing to close would be worse than a
 * missed slot. Capped so a hung pipeline can never trap the quit.
 */
const backupThenQuit = (): void => {
  bypass = true;
  showBackingUp?.();
  const cap = new Promise<void>((res) => window.setTimeout(res, 45_000));
  void Promise.race([runBackup("close").then(() => undefined, () => undefined), cap]).finally(
    quitNow,
  );
};

/** Register the one close listener. Safe to call on every Shell mount. */
export const armCloseGuard = (): void => {
  if (registered) return;
  registered = true;
  try {
    void getCurrentWindow()
      .onCloseRequested((e) => {
        if (bypass) return; // a backup-then-quit is already in flight
        if (hasLiveClocks() && showWarning != null) {
          e.preventDefault();
          showWarning();
          return;
        }
        // Clean close: back up first when a root is set; with backups paused
        // the close passes through untouched (never a gate).
        if (getBackupsRoot() != null) {
          e.preventDefault();
          backupThenQuit();
        }
      })
      .catch(() => {
        registered = false;
      });
  } catch {
    registered = false; // plain browser dev — nothing to intercept
  }
};

/** The warning's Proceed: discard the in-flight values, then backup → exit. */
export const proceedQuit = (): void => {
  discardAllForQuit(); // nothing was written, so there is nothing to undo
  if (getBackupsRoot() != null) backupThenQuit();
  else {
    bypass = true;
    quitNow();
  }
};
