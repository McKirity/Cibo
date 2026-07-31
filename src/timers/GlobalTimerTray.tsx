/** The app-wide running-clock reminder tray (`.timertray`). Split out of TimerOverlays.tsx 2026-07-30 (dedup pass wave 4) so the shell's mount no longer pulls the modal code. */
import { clockMs, fmtMs, remainingMs, type Clock } from "./timerCore";
import { useTimers } from "./timerStore";
import "./timers.css";

/**
 * The GLOBAL switcher tray (user-ruled 2026-07-28, at the GUI pass): while any
 * clock is RUNNING, the board's switcher anatomy rides every other screen as
 * the "a timer is running" reminder — fixed over the content pane, chips
 * navigate back to the board with that clock focused. The shell mounts it and
 * hides it on the Timers screen itself (the board carries its own).
 */
export function GlobalTimerTray({ onOpen }: { onOpen: (id: number) => void }) {
  const state = useTimers();
  const now = Date.now();
  const running = state.clocks.filter((c) => c.running);
  if (running.length === 0) return null;
  return (
    <div className="timertray">
      {running.map((c) => (
        <button key={c.id} className="swchip" onClick={() => onOpen(c.id)}>
          <span
            className="dot"
            style={{ background: `var(--${c.tracked[0]?.colourSlot ?? "habit-1"})` }}
          />
          <span className="swm">
            {c.mode === "stopwatch" ? "Stopwatch" : c.mode === "countdown" ? "Countdown" : "Pomodoro"}
          </span>
          <span className="swt">{clockChipReadout(c, now)}</span>
        </button>
      ))}
    </div>
  );
}

/** The switcher chip's live readout, per face — elapsed for the stopwatch,
 *  remaining for the depleting faces (the drawn chips: 1:23:45 · 8:42 · 12:30). */
export const clockChipReadout = (c: Clock, now: number): string =>
  c.mode === "stopwatch" ? fmtMs(clockMs(c, now)) : fmtMs(remainingMs(c, now));
