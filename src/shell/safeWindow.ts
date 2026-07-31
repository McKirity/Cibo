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
): Promise<T | undefined> {
  try {
    return await fn(getCurrentWindow());
  } catch {
    return undefined; // not in a Tauri webview, or the window call failed
  }
}

/** An event-handler factory over `withAppWindow` (the titlebar-button shape). */
export const winAction =
  (fn: (w: AppWindow) => void | Promise<void>) => (): void => {
    void withAppWindow(fn);
  };
