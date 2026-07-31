/** The rail's numberless analog vignette clock. Split out of Shell.tsx 2026-07-30 (dedup pass wave 4). */
import { useEffect, useState } from "react";

/** The static tick layers (60 minute ticks minus the hour positions + 12 hour
 * ticks), built once at module scope — see the note inside VignetteClock. */
const CLOCK_TICKS = (
  <>
    <g stroke="var(--text-muted)" strokeWidth="1">
      {Array.from({ length: 60 }, (_, i) => i)
        .filter((i) => i % 5 !== 0)
        .map((i) => (
          <line key={i} x1="60" y1="6" x2="60" y2="10" transform={`rotate(${i * 6} 60 60)`} />
        ))}
    </g>
    <g stroke="var(--text-secondary)" strokeWidth="2">
      {Array.from({ length: 12 }, (_, h) => (
        <line key={h} x1="60" y1="6" x2="60" y2="14" transform={`rotate(${h * 30} 60 60)`} />
      ))}
    </g>
  </>
);

/** The numberless analog vignette face, faithful to the frozen `frame.html`:
 *  60 minute ticks (skipping the 12 hour positions) + 12 longer hour ticks near
 *  the rim, minute/hour hands repainted each second, and the accent second hand
 *  sweeping via CSS (a 60s linear loop, delayed to the current second so it's in
 *  phase with real time). The live-data vignette proper is step 6a. */
export function VignetteClock() {
  const [now, setNow] = useState(() => new Date());
  // The second hand sweeps via a continuous 60s CSS loop — its start is aligned
  // to real time ONCE (a stable negative delay). Recomputing the delay on every
  // render would restart the animation each tick (the "skip"). The minute/hour
  // hands are discrete transforms, so re-rendering them each second is fine.
  const [sweepDelay] = useState(() => {
    const d = new Date();
    return `-${d.getSeconds() + d.getMilliseconds() / 1000}s`;
  });
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const mins = now.getMinutes();
  const secs = now.getSeconds();
  const mAngle = (mins + secs / 60) * 6;
  const hAngle = ((now.getHours() % 12) + mins / 60) * 30;

  // TWO stacked svgs (2026-07-29 hover-lag fix): the face, and a sweep layer
  // that rotates as a WHOLE element — Chromium composites element transforms
  // but not SVG-child ones, so the old in-svg animated line repainted the
  // clock every frame. The hub dots ride the rotating layer (centered circles
  // are rotation-invariant), keeping the draw order: hand under hubs.
  // The 72 static ticks are module-level constants (CLOCK_TICKS) — the same
  // element references every render, so React bails out of them on each
  // one-second tick instead of re-rendering the whole dial (2026-07-30).
  return (
    <div className="clockwrap">
      <svg className="clock" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="56" fill="var(--window-background)" stroke="var(--divider)" strokeWidth="1" />
        {CLOCK_TICKS}
        <line x1="60" y1="60" x2="60" y2="34" stroke="var(--text-strong)" strokeWidth="3.5" strokeLinecap="round" transform={`rotate(${hAngle} 60 60)`} />
        <line x1="60" y1="60" x2="60" y2="22" stroke="var(--text-strong)" strokeWidth="2.5" strokeLinecap="round" transform={`rotate(${mAngle} 60 60)`} />
      </svg>
      <svg className="clock clock-sweep-layer" viewBox="0 0 120 120" style={{ animationDelay: sweepDelay }}>
        <line className="sweep" x1="60" y1="68" x2="60" y2="18" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="60" cy="60" r="3" fill="var(--text-strong)" />
        <circle cx="60" cy="60" r="1.6" fill="var(--accent)" />
      </svg>
    </div>
  );
}
