/**
 * Build step 7 — the TRAY (kit-timer-tray's runtime; OS-drawn, token-exempt).
 *
 * Ruled shape ([[Timers]] · [[App Lifecycle & OS Integration]]): a running
 * clock is visible from the system tray while the window is MINIMIZED —
 * glance = alive + elapsed; click = reopen the app to the timer. Live-timer
 * only, never alerts. Close = quit, so a closed window never has a tray.
 *
 * The store's ticker calls `syncTray` — the icon appears only when
 * (minimized && a clock runs) and leaves the moment either half stops being
 * true. Elapsed rides the tooltip (Windows) / title (macOS menu bar).
 */
import { clockMs, fmtMs, type Clock } from "./timerCore";
import { withAppWindow } from "../shell/safeWindow";

type TrayHandle = {
  setTooltip: (t: string) => Promise<void>;
  setTitle: (t: string) => Promise<void>;
  close: () => Promise<void>;
};

let tray: TrayHandle | null = null;
let building = false;
/** The most recent call's verdict — what a finished build re-checks against. */
let lastWanted = false;
let openTimersNav: (() => void) | null = null;

/** The shell registers how "click = reopen to Timers" navigates. */
export const registerTrayNavigate = (fn: () => void): void => {
  openTimersNav = fn;
};

const label = (running: Clock[], now: number): string => {
  const lead = running[0];
  const elapsed = fmtMs(clockMs(lead, now));
  return running.length > 1 ? `${elapsed} · ${running.length} clocks` : elapsed;
};

/**
 * The `isMinimized` probe is CACHED (2026-07-30 — the 500 ms ticker was
 * paying a full IPC round-trip every tick): a probed verdict holds for one
 * heartbeat (~15 s), and `visibilitychange` invalidates it on the actual
 * minimize/restore transitions (WebView2 flips document visibility on both),
 * so in practice the tray still appears/disappears on the NEXT tick — the
 * TTL is only the fallback ceiling, itself within the heartbeat bound.
 */
const PROBE_TTL_MS = 15_000;
let minimizedProbe: { value: boolean; at: number } | null = null;
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    minimizedProbe = null;
  });
}

const probeMinimized = async (now: number): Promise<boolean> => {
  if (minimizedProbe != null && now - minimizedProbe.at < PROBE_TTL_MS)
    return minimizedProbe.value;
  // withAppWindow: undefined outside a Tauri webview → false (no tray).
  const value = (await withAppWindow((w) => w.isMinimized())) ?? false;
  minimizedProbe = { value, at: now };
  return value;
};

export const syncTray = async (clocks: Clock[], now: number): Promise<void> => {
  const running = clocks.filter((c) => c.running);
  const wanted = running.length > 0 ? await probeMinimized(now) : false;
  lastWanted = wanted;

  if (!wanted) {
    if (tray != null) {
      const t = tray;
      tray = null;
      void t.close().catch(() => {});
    }
    return;
  }

  const text = label(running, now);
  if (tray != null) {
    void tray.setTooltip(`Cibo · ${text}`).catch(() => {});
    void tray.setTitle(text).catch(() => {});
    return;
  }
  if (building) return;
  building = true;
  try {
    const { TrayIcon } = await import("@tauri-apps/api/tray");
    const { defaultWindowIcon } = await import("@tauri-apps/api/app");
    const icon = await defaultWindowIcon();
    const t = await TrayIcon.new({
      id: "cibo-timer",
      icon: icon ?? undefined,
      tooltip: `Cibo · ${text}`,
      title: text,
      action: (event) => {
        if (event.type !== "Click" || event.buttonState !== "Down") return;
        void (async () => {
          await withAppWindow(async (w) => {
            await w.unminimize().catch(() => {});
            await w.setFocus().catch(() => {});
          });
          // The window is restoring — drop the cached "minimized" verdict so
          // the next tick's probe closes the icon promptly.
          minimizedProbe = null;
          openTimersNav?.();
        })();
      },
    });
    // The minimize may already be over by the time the icon exists — and that
    // "over" call saw tray == null with nothing to close. Re-check instead of
    // trusting a next tick a stopped ticker never sends: an orphaned icon
    // would linger until the next timer action (2026-07-30).
    if (lastWanted) {
      tray = t;
    } else {
      tray = null;
      void t.close().catch(() => {});
    }
  } catch {
    tray = null; // tray unavailable — a glance-less minimize, nothing broken
  } finally {
    building = false;
  }
};
