/**
 * Build step 7 — the end-of-interval SIGNAL.
 *
 * "Countdown/pomodoro end-of-interval signals: sound by default, style
 * configurable in Settings" — the style control lives in Settings → Timers
 * (step 10, live; settings/local owns the value). The signal passes the pinned notification fence ("did the user
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
import { getSignalStyle } from "../settings/local";
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
const chime = (delay = 0) => {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") {
      // last-ditch resume — succeeds when a prior gesture unlocked the page
      void ctx.resume().catch(() => {});
    }
    const t0 = ctx.currentTime + delay;
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

/**
 * How long the Settings test tone runs — user-ruled 3 s (2026-08-08).
 *
 * It is deliberately longer than the real signal, and the reason is the OS
 * rather than the app: **Windows lists an application in its Volume mixer only
 * while that application is actually producing audio**, so per-app output-device
 * selection is unreachable for a program whose only sound is a one-second
 * chime. There is no window in which to catch it. Three seconds is enough to
 * open the mixer and find the app; Windows then remembers the device choice.
 *
 * Found the plain way: a user's chime was going to a speaker they no longer
 * used, and the OS remedy could not be applied because Cibo never appeared in
 * the list. *The signal machinery was correct throughout — the sound was simply
 * arriving somewhere nobody was listening.*
 */
export const PREVIEW_MS = 3_000;

/**
 * The Settings → Timers test tone: the REAL chime, repeated to fill the window.
 *
 * Repeating the actual signal rather than synthesizing a different, longer tone
 * is the point — a test of something other than the thing that fires would
 * confirm the wrong machinery. It also plays regardless of the Chime/Silent
 * setting: the user pressed a button labelled "Test sound", so silence would be
 * its own small confusion.
 */
export const previewSignal = (): void => {
  unlockAudio();
  // 0.95 s apart, so the last chime's tail lands just under the 3 s budget.
  for (let at = 0; at < PREVIEW_MS / 1000 - 1; at += 0.95) chime(at);
};

const flagAttention = () => {
  if (document.hasFocus()) return;
  // safeWindow's shared stanza — outside a Tauri webview this is a no-op.
  void withAppWindow((w) => w.requestUserAttention(UserAttentionType.Informational));
};

export const fireSignal = (boundary: Exclude<Boundary, null>): void => {
  // EVERY boundary sounds, and since the 2026-08-08 interval-plan amendment
  // that is load-bearing rather than incidental: a mid-plan work end and a
  // break end no longer stop the clock or open anything, so the chime is the
  // ONLY announcement that the phase changed. Silence there would leave the
  // user working through their own break.
  void boundary;
  // The Settings → Timers signal style: Silent sheds the sound only —
  // the OS attention ask is the point of the signal and always fires.
  if (getSignalStyle() !== "silent") chime();
  flagAttention();
};
