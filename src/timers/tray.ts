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

export const syncTray = async (clocks: Clock[], now: number): Promise<void> => {
  const running = clocks.filter((c) => c.running);
  let wanted = false;
  try {
    if (running.length > 0) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      wanted = await getCurrentWindow().isMinimized();
    }
  } catch {
    wanted = false; // not in a Tauri webview
  }
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
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const w = getCurrentWindow();
          await w.unminimize().catch(() => {});
          await w.setFocus().catch(() => {});
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
