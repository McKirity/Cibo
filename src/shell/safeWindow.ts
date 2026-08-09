/**
 * The try/catch Tauri-window stanza, written once. `getCurrentWindow()` THROWS
 * synchronously outside a Tauri webview (plain-browser dev), and the window
 * API's promises can reject; both failure modes are swallowed — a missing
 * window is a no-op, never an error. Consumers: the titlebar cluster, the
 * fatal screen's close, the tray's minimized probe, the signal's attention
 * flag.
 */
import { getCurrentWindow } from "@tauri-apps/api/window";

type AppWindow = ReturnType<typeof getCurrentWindow>;

/**
 * Run `fn` against the current window; `undefined` when there is no window or
 * the call itself failed (so a boolean probe reads `(await …) ?? false`).
 */
export async function withAppWindow<T>(
  fn: (w: AppWindow) => T | Promise<T>,
  label?: string,
): Promise<T | undefined> {
  try {
    return await fn(getCurrentWindow());
  } catch (e) {
    // ⚠ THE SILENCE HERE HID AN INERT FEATURE FOR THE APP'S WHOLE LIFE
    // (`macbook-1`, 2026-08-08). Swallowing is right for the PROBES this was
    // written for — "is the window minimized?" in plain-browser dev is a no-op,
    // not an error — but it cannot tell that apart from a capability the app
    // was never granted, and the MacBook preview's resize was refused on every
    // click with nothing written anywhere.
    //
    // So callers for whom failure is ABNORMAL pass a `label` and get a line in
    // the console; probes pass nothing and stay silent as designed. The choice
    // belongs to the caller because only the caller knows which it is.
    if (label != null) console.error(`window: ${label} failed`, e);
    return undefined; // not in a Tauri webview, or the window call failed
  }
}

/** An event-handler factory over `withAppWindow` (the titlebar-button shape). */
export const winAction =
  (fn: (w: AppWindow) => void | Promise<void>) => (): void => {
    void withAppWindow(fn);
  };
