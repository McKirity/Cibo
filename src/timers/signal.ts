/**
 * Build step 7 — the end-of-interval SIGNAL.
 *
 * "Countdown/pomodoro end-of-interval signals: sound by default, style
 * configurable in Settings" — the style control is step 10's; this ships the
 * default. The signal passes the pinned notification fence ("did the user
 * start something that ends?") — a completion signal for a user-started clock,
 * never a reminder; the app still builds no notification infrastructure.
 *
 * When the window is unfocused or minimized the OS is asked for attention
 * (user-ruled 2026-07-28: "throw up some kind of system flag or allow the icon
 * on the docket to glow") — taskbar flash on Windows, dock bounce on macOS.
 * Same fence: it fires only at a boundary the user scheduled.
 */
import { UserAttentionType } from "@tauri-apps/api/window";
import { withAppWindow } from "../shell/safeWindow";
import type { Boundary } from "./timerCore";

let ctx: AudioContext | null = null;

/**
 * THE AUTOPLAY GATE (found at the GUI pass 2026-07-28 — "timer went off and I
 * didn't hear it at all"): WebView2 starts an AudioContext created OUTSIDE a
 * user gesture in the `suspended` state, and the signal fires from a timer
 * tick, which is never a gesture. So the context is created/resumed here, and
 * the store calls this from every clock-starting action (create · resume ·
 * recovery-continue) — all clicks, all gestures. By the time a boundary fires
 * the context is already running.
 */
export const unlockAudio = (): void => {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  } catch {
    /* no audio device */
  }
};

/** A three-note rising chime, synthesized — no bundled asset, no network. */
const chime = () => {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") {
      // last-ditch resume — succeeds when a prior gesture unlocked the page
      void ctx.resume().catch(() => {});
    }
    const t0 = ctx.currentTime;
    for (const [freq, at] of [
      [880, 0],
      [1174.66, 0.16],
      [1567.98, 0.32],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.4, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.95);
    }
  } catch {
    /* no audio device — the visual state change is the fallback */
  }
};

const flagAttention = () => {
  if (document.hasFocus()) return;
  // safeWindow's shared stanza — outside a Tauri webview this is a no-op.
  void withAppWindow((w) => w.requestUserAttention(UserAttentionType.Informational));
};

export const fireSignal = (boundary: Exclude<Boundary, null>): void => {
  // Every boundary sounds; a break-end is quieter business (the clock keeps
  // running) but still a completion the user scheduled.
  void boundary;
  chime();
  flagAttention();
};
