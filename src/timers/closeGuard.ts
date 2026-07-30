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

let registered = false;
let bypass = false;
let showWarning: (() => void) | null = null;

/** The shell registers how the quit warning renders; null on unmount. */
export const registerQuitWarning = (fn: (() => void) | null): void => {
  showWarning = fn;
};

/** Register the one close listener. Safe to call on every Shell mount. */
export const armCloseGuard = (): void => {
  if (registered) return;
  registered = true;
  try {
    void getCurrentWindow()
      .onCloseRequested((e) => {
        if (bypass || !hasLiveClocks()) return; // clean close
        if (showWarning == null) return; // no live UI to ask — never trap the window
        e.preventDefault();
        showWarning();
      })
      .catch(() => {
        registered = false;
      });
  } catch {
    registered = false; // plain browser dev — nothing to intercept
  }
};

/** The warning's Proceed: discard the in-flight values and force the quit. */
export const proceedQuit = (): void => {
  discardAllForQuit(); // nothing was written, so there is nothing to undo
  bypass = true;
  try {
    const w = getCurrentWindow();
    // destroy() skips onCloseRequested — immune to stale/stacked listeners;
    // close() is the fallback where destroy is unavailable.
    void w.destroy().catch(() => void w.close().catch(() => {}));
  } catch {
    /* plain browser dev */
  }
};
