/**
 * The pomodoro phase machine (Phase 2 step 2's test lane).
 *
 * Written with the 2026-08-08 interval-plan amendment, because the amendment
 * turned a two-state toggle into a plan with an END: work → break → work →
 * … → work → stop, with the dialog on exactly one of those arrows. That is the
 * kind of thing a GUI tour confirms once and a fixture confirms forever — and
 * the failure mode is SILENT, since a clock that prompts on the wrong boundary
 * looks like a clock that is simply running.
 *
 * Every assertion drives `advance` at a real wall-clock instant, the way the
 * ticker does; nothing here reaches for a fake timer, because the accrual
 * contract IS wall-clock arithmetic and mocking it would test the mock.
 */
import { describe, expect, it } from "vitest";
import {
  advance,
  clockMs,
  clockSpent,
  MIN_INTERVALS,
  parseIntervals,
  pomoPlanDone,
  restartPomo,
  type Clock,
} from "./timerCore";

const T0 = 1_700_000_000_000; // a fixed epoch — these are pure functions
const WORK = 25 * 60_000;
const BREAK = 5 * 60_000;

const pomo = (intervals: number | null, at = T0): Clock => ({
  id: 1,
  mode: "pomodoro",
  running: true,
  resumedAt: at,
  tracked: [
    {
      habitId: "h1",
      habitKey: "keyboard",
      habitName: "Keyboard",
      habitKind: "simple",
      colourSlot: "habit-5",
      entryId: null,
      entryTitle: null,
      baseMs: 0,
    },
  ],
  clockBaseMs: 0,
  targetMs: null,
  workMs: WORK,
  breakMs: BREAK,
  intervals,
  phase: "work",
  interval: 1,
  phaseBaseMs: 0,
});

/** Run the clock forward to `now`, collecting every boundary crossed — the
 *  ticker's own catch-up walk, so the sequence under test is the real one. */
const runTo = (c: Clock, now: number) => {
  let clock = c;
  const boundaries: string[] = [];
  for (let i = 0; i < 64; i++) {
    const step = advance(clock, now);
    if (step.boundary == null) break;
    clock = step.clock;
    boundaries.push(step.boundary);
  }
  return { clock, boundaries };
};

describe("pomodoro interval plans", () => {
  it("rolls a mid-plan work end STRAIGHT into the break, still running", () => {
    const { clock, boundaries } = runTo(pomo(4), T0 + WORK);
    expect(boundaries).toEqual(["work-end"]);
    expect(clock.phase).toBe("break");
    expect(clock.running).toBe(true); // the dialog is what used to stop it here
    expect(clock.interval).toBe(1); // the break belongs to interval 1
    expect(clock.phaseBaseMs).toBe(0);
  });

  it("rolls a break end into the next interval", () => {
    const { clock, boundaries } = runTo(pomo(4), T0 + WORK + BREAK);
    expect(boundaries).toEqual(["work-end", "break-end"]);
    expect(clock.phase).toBe("work");
    expect(clock.interval).toBe(2);
    expect(clock.running).toBe(true);
  });

  it("stops at the LAST interval's end and nowhere else", () => {
    // 3 intervals = work·break·work·break·work — the plan ends on work.
    const span = 3 * WORK + 2 * BREAK;
    const { clock, boundaries } = runTo(pomo(3), T0 + span);
    expect(boundaries).toEqual([
      "work-end",
      "break-end",
      "work-end",
      "break-end",
      "pomo-end",
    ]);
    // exactly ONE boundary opens the management window
    expect(boundaries.filter((b) => b === "pomo-end")).toHaveLength(1);
    expect(clock.running).toBe(false);
    expect(clock.phase).toBe("work"); // never ends on a break
    expect(clock.interval).toBe(3);
    expect(pomoPlanDone(clock)).toBe(true);
  });

  it("never opens or closes the plan with a break", () => {
    const span = 3 * WORK + 2 * BREAK;
    const { boundaries } = runTo(pomo(3), T0 + span);
    expect(boundaries[0]).toBe("work-end"); // the first phase was work
    expect(boundaries[boundaries.length - 1]).toBe("pomo-end"); // the last phase was work
    // N intervals ⇒ N−1 breaks
    expect(boundaries.filter((b) => b === "break-end")).toHaveLength(2);
  });

  it("accumulates work only — breaks never accrue (the standing ruling)", () => {
    const span = 2 * WORK + BREAK;
    const { clock } = runTo(pomo(2), T0 + span);
    expect(clockMs(clock, T0 + span)).toBe(2 * WORK);
    expect(clock.tracked[0].baseMs).toBe(2 * WORK);
  });

  it("catches up through phases slept through, landing on the true phase", () => {
    // a machine asleep 40 min into a 25/5 plan of 4: work·break·work(10 in)
    const { clock } = runTo(pomo(4), T0 + 40 * 60_000);
    expect(clock.interval).toBe(2);
    expect(clock.phase).toBe("work");
    expect(clock.running).toBe(true);
  });

  it("treats a legacy plan-less clock as the old build did — stop at every work end", () => {
    const { clock, boundaries } = runTo(pomo(null), T0 + WORK);
    expect(boundaries).toEqual(["pomo-end"]);
    expect(clock.running).toBe(false);
  });

  it("re-runs onto a fresh plan while keeping the accumulators", () => {
    const span = 2 * WORK + BREAK;
    const { clock } = runTo(pomo(2), T0 + span);
    const again = restartPomo(
      clock,
      { intervals: 3, workMs: 10 * 60_000, breakMs: 60_000 },
      T0 + span,
    );
    expect(again.interval).toBe(1);
    expect(again.phase).toBe("work");
    expect(again.phaseBaseMs).toBe(0);
    expect(again.running).toBe(true);
    expect(again.intervals).toBe(3);
    // the point of a re-run rather than a new clock:
    expect(again.clockBaseMs).toBe(2 * WORK);
    expect(again.tracked[0].baseMs).toBe(2 * WORK);
  });

  it("floors a re-run at the ruled minimum", () => {
    expect(restartPomo(pomo(4), { intervals: 1, workMs: WORK, breakMs: BREAK }, T0).intervals).toBe(
      MIN_INTERVALS,
    );
  });

  it("pomoPlanDone is false mid-plan and while paused inside an interval", () => {
    expect(pomoPlanDone(pomo(4))).toBe(false);
    const midBreak = runTo(pomo(4), T0 + WORK).clock;
    expect(pomoPlanDone(midBreak)).toBe(false);
    const pausedMidWork = { ...pomo(4), running: false, phaseBaseMs: WORK / 2, resumedAt: null };
    expect(pomoPlanDone(pausedMidWork)).toBe(false);
  });
});

describe("clockSpent — what Resume-all must leave alone (2026-08-22)", () => {
  it("is true for a pomodoro whose plan is done and a countdown that hit zero", () => {
    const done = advance(pomo(2), T0 + WORK).clock; // break starts
    const next = advance(done, T0 + WORK + BREAK).clock; // interval 2
    const end = advance(next, T0 + 2 * WORK + BREAK).clock; // pomo-end, paused
    expect(end.running).toBe(false);
    expect(clockSpent(end)).toBe(true);
    const cd: Clock = { ...pomo(null), mode: "countdown", targetMs: 10_000, workMs: null, breakMs: null };
    const zero = advance(cd, T0 + 10_000).clock;
    expect(zero.running).toBe(false);
    expect(clockSpent(zero)).toBe(true);
  });

  it("is false for a clock merely paused mid-run", () => {
    const paused: Clock = { ...pomo(4), running: false, resumedAt: null, phaseBaseMs: 1000 };
    expect(clockSpent(paused)).toBe(false);
    const cd: Clock = { ...pomo(null), mode: "countdown", targetMs: 10_000, running: false, resumedAt: null, clockBaseMs: 5000 };
    expect(clockSpent(cd)).toBe(false);
  });
});

describe("parseIntervals", () => {
  it("takes a plain count at or above the minimum", () => {
    expect(parseIntervals("4")).toBe(4);
    expect(parseIntervals(" 12 ")).toBe(12);
    expect(parseIntervals(String(MIN_INTERVALS))).toBe(MIN_INTERVALS);
  });

  it("REFUSES 1 rather than clamping it up — a typed 1 is a statement", () => {
    expect(parseIntervals("1")).toBeNull();
    expect(parseIntervals("0")).toBeNull();
  });

  it("refuses nonsense", () => {
    for (const bad of ["", "  ", "-3", "2.5", "four", "2:00"]) expect(parseIntervals(bad)).toBeNull();
  });
});
