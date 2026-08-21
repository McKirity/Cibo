/**
 * Build step 7 — the Timers BOARD (a Tools-rail destination).
 *
 * The frozen presentation (user-ruled in-session, 2026-07-12): MINIMALIST —
 * ONE focused clock CENTERED on the flat default ground, its controls
 * beneath, and a slim floating SWITCHER carrying the other running clocks as
 * chips + the dashed "New clock" door. No card grid. Three faces over one
 * machinery (kit-card-clock's variants):
 *   stopwatch — the count-up hero readout (--clock-face-size);
 *   countdown — the depleting neutral ring (records actual elapsed);
 *   pomodoro  — interval ring + cycle dots ● work ◌ break ◉ now.
 * Run-state = word + glyph, never colour alone. Habit colour rides the
 * tracked ROWS; names are doors, readouts are not.
 *
 * The per-theme timer backdrop sits behind this board at step 6a — the
 * Default stays ambience-silent (the mocked dusk sky was struck at the pull
 * review).
 */
import { useState } from "react";
import { clockMs, fmtMs, fmtTarget, itemMs, pomoPlanDone, remainingMs, type Clock, modeLabel, catsLabel} from "./timerCore";
import { focusClock, pauseClock, runClock, stopClock, useTimers } from "./timerStore";
import { CreateClockModal } from "./TimerOverlays";
import { clockChipReadout } from "./GlobalTimerTray";
import { Ico, ICONS } from "../shell/icons";
import "./timers.css";

// Glyphs from the shell roster (dedup pass 2026-07-30); pause/stop were drawn
// as <rect>s here and the roster carries their sanctioned path equivalents.
const IPlus = () => <Ico d={ICONS.plus} />;
const ITimer = () => <Ico d={ICONS.timer} />;
const IPause = () => <Ico d={ICONS.pause} />;
const IPlay = () => <Ico d={ICONS.play} />;
const IStop = () => <Ico d={ICONS.stop} />;

const RING_C = 2 * Math.PI * 45; // the 100-unit viewBox circle, r=45

function Ring({ fraction, time, cap }: { fraction: number; time: string; cap?: string }) {
  const arc = Math.max(0, Math.min(1, fraction)) * RING_C;
  return (
    <div className="ring-wrap">
      <svg viewBox="0 0 100 100">
        <circle className="ring-track" cx="50" cy="50" r="45" />
        <circle
          className="ring-arc"
          cx="50"
          cy="50"
          r="45"
          strokeDasharray={`${arc.toFixed(1)} ${RING_C.toFixed(1)}`}
        />
      </svg>
      <div className="ring-center">
        <span className="ring-time">{time}</span>
        {cap != null && <span className="ring-cap">{cap}</span>}
      </div>
    </div>
  );
}

function TrackedRows({
  clock,
  now,
  onOpenHabit,
  onOpenEntry,
}: {
  clock: Clock;
  now: number;
  onOpenHabit: (key: string) => void;
  onOpenEntry: (id: string, habitKey: string) => void;
}) {
  return (
    <div className="ftracked">
      {clock.tracked.map((t) => (
        <span className="ftrow" key={`${t.habitId}|${t.entryId ?? ""}`}>
          <span className="dot" style={{ background: `var(--${t.colourSlot})` }} />
          {/* identity is a door, the readout is not */}
          <button
            className="tnm"
            onClick={() =>
              t.entryId != null ? onOpenEntry(t.entryId, t.habitKey) : onOpenHabit(t.habitKey)
            }
          >
            {t.habitName}
          </button>
          {t.entryTitle != null && <em>· {t.entryTitle}</em>}
          {catsLabel(t) !== "" && <em>· {catsLabel(t)}</em>}
          <b>{fmtMs(itemMs(clock, t, now))}</b>
        </span>
      ))}
    </div>
  );
}

/**
 * The cycle dots for a whole pomodoro plan: N work dots with a break dot in
 * each gap (N−1 of them — breaks are BETWEEN intervals, so the row can neither
 * open nor close on one, which is the amendment said in shapes).
 *
 * A plan-less legacy clock (`intervals == null`) keeps the drawn open-ended
 * face: everything behind it, plus the dot it is on.
 */
const pomoDots = (c: Clock) => {
  const total = c.intervals ?? c.interval;
  const spent = pomoPlanDone(c); // the whole plan is behind it
  const dots = [];
  for (let n = 1; n <= total; n++) {
    if (n > 1) {
      // the break sitting between interval n−1 and interval n
      const passed = spent || c.interval >= n;
      const isNow = !spent && c.phase === "break" && c.interval === n - 1;
      dots.push(
        <span key={`b${n}`} className={`pdot brk${passed ? " done" : ""}${isNow ? " now" : ""}`} aria-hidden />,
      );
    }
    const finished = spent || c.interval > n || (c.interval === n && c.phase === "break");
    const isNow = !finished && c.interval === n;
    dots.push(
      <span key={`w${n}`} className={`pdot${finished ? " work" : isNow ? " now" : ""}`} aria-hidden />,
    );
  }
  return dots;
};

/** Run-state — word + glyph, never colour alone. */
function RunState({ clock }: { clock: Clock }) {
  const word = !clock.running
    ? "Paused"
    : clock.mode === "pomodoro" && clock.phase === "break"
      ? "Break"
      : "Running";
  return (
    <span className="fstate">
      {clock.running && word !== "Break" ? <IPlay /> : <IPause />}
      {word}
    </span>
  );
}

export function TimersScreen({
  onOpenHabit,
  onOpenEntry,
}: {
  onOpenHabit: (key: string) => void;
  onOpenEntry: (id: string, habitKey: string) => void;
}) {
  const state = useTimers();
  const [createOpen, setCreateOpen] = useState(false);
  const now = Date.now();

  const focused =
    state.clocks.find((c) => c.id === state.focusedId) ?? state.clocks[0] ?? null;

  if (focused == null) {
    // kit-state-empty — the zero-clocks board
    return (
      <section className="timerscreen empty">
        {/* the drawn sub-line ("Tools · a board of independent clocks") was
            REMOVED — user-ruled 2026-07-28, overriding the FINAL's empty state */}
        <div className="scr-head">
          <div className="scr-title">Timers</div>
        </div>
        <div className="emptybox">
          <div className="eglyph">
            <ITimer />
          </div>
          <div className="et">No clocks running</div>
          <div className="edoors">
            <button className="btn-accent" onClick={() => setCreateOpen(true)}>
              <IPlus />
              New session
            </button>
          </div>
        </div>
        {createOpen && <CreateClockModal onClose={() => setCreateOpen(false)} />}
      </section>
    );
  }

  const c = focused;
  const mode =
    modeLabel(c.mode);

  return (
    <section className="timerscreen">
      <div className="tstage">
        <div className="focus">
          {/* mode · config · run-state (word + glyph). The countdown carries NO
              config chip here — user-ruled 2026-07-28 (corrected): the target
              above the ring was the redundant one; the ring keeps its "of 25:00". */}
          <div className="fmode">
            <span className="fpill">{mode}</span>
            {c.mode === "pomodoro" && c.workMs != null && c.breakMs != null && (
              <span className="fcfg">
                {fmtTarget(c.workMs)} / {fmtTarget(c.breakMs)}
                {c.intervals != null && ` × ${c.intervals}`}
              </span>
            )}
            <RunState clock={c} />
          </div>

          {c.mode === "stopwatch" && (
            <div className="focus-face">
              <div className="fbig">{fmtMs(clockMs(c, now))}</div>
              <TrackedRows clock={c} now={now} onOpenHabit={onOpenHabit} onOpenEntry={onOpenEntry} />
            </div>
          )}

          {c.mode === "countdown" && c.targetMs != null && (
            <div className="focus-face">
              <Ring
                fraction={remainingMs(c, now) / c.targetMs}
                time={fmtMs(remainingMs(c, now))}
                cap={`of ${fmtTarget(c.targetMs)}`}
              />
              <TrackedRows clock={c} now={now} onOpenHabit={onOpenHabit} onOpenEntry={onOpenEntry} />
            </div>
          )}

          {c.mode === "pomodoro" && c.workMs != null && c.breakMs != null && (
            <div className="focus-face">
              <div className="fphase">
                {c.phase === "break"
                  ? c.intervals != null
                    ? `Break · next up ${c.interval + 1} of ${c.intervals}`
                    : "Break"
                  : c.intervals != null
                    ? `Interval ${c.interval} of ${c.intervals}`
                    : `Interval ${c.interval}`}
              </div>
              <Ring
                fraction={
                  remainingMs(c, now) / (c.phase === "work" ? c.workMs : c.breakMs)
                }
                time={fmtMs(remainingMs(c, now))}
                cap={`of ${fmtTarget(c.phase === "work" ? c.workMs : c.breakMs)}`}
              />
              {/* cycle dots — phase-shapes: ● finished work · ◌ break · ◉ now.
                  ADDITION TO THE DRAWN FACE (user-ruled 2026-08-08 with the
                  interval plan): the FINAL draws the past plus a "now" dot,
                  because the cycle was open-ended when it was drawn. A plan
                  has an END, so the whole row is drawn — pending phases as
                  faint rings — and the dots become the progress readout the
                  ring cannot be (the ring only knows this phase). */}
              <div className="pomo">{pomoDots(c)}</div>
              {/* the honest total — work intervals only */}
              <div className="faccrued">
                Accumulated <b>{fmtMs(clockMs(c, now))}</b>
              </div>
              <TrackedRows clock={c} now={now} onOpenHabit={onOpenHabit} onOpenEntry={onOpenEntry} />
            </div>
          )}

          <div className="focus-ctrls">
            {c.running ? (
              <button className="cbtn accent" onClick={() => pauseClock(c.id)}>
                <IPause />
                Pause
              </button>
            ) : (
              // A spent pomodoro plan cannot resume — `runClock` routes it to
              // the management window, where the re-run form lives, so the
              // button says what it will actually do.
              <button className="cbtn accent" onClick={() => runClock(c.id)}>
                <IPlay />
                {pomoPlanDone(c) ? "Run another set…" : "Resume"}
              </button>
            )}
            <button className="cbtn plain" onClick={() => stopClock(c.id)}>
              <IStop />
              Stop → manage
            </button>
          </div>
        </div>

        {/* the switcher — every clock a chip, + the New-clock door */}
        <div className="switcher">
          {state.clocks.map((sc) => (
            <button
              key={sc.id}
              className={`swchip${sc.id === c.id ? " active" : ""}`}
              onClick={() => focusClock(sc.id)}
            >
              <span
                className="dot"
                style={{ background: `var(--${sc.tracked[0]?.colourSlot ?? "habit-1"})` }}
              />
              <span className="swm">
                {sc.mode === "stopwatch"
                  ? "Stopwatch"
                  : sc.mode === "countdown"
                    ? "Countdown"
                    : "Pomodoro"}
              </span>
              <span className="swt">{clockChipReadout(sc, now)}</span>
            </button>
          ))}
          <button className="swnew" onClick={() => setCreateOpen(true)}>
            <IPlus />
            New clock
          </button>
        </div>
      </div>
      {createOpen && <CreateClockModal onClose={() => setCreateOpen(false)} />}
    </section>
  );
}
