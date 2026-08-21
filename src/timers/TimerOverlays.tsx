/**
 * Build step 7 — the timer overlays, mounted ONCE by the shell (overlays are
 * never routes, and the machinery can open them from any screen: a pomodoro
 * work-interval boundary opens the management window wherever you are, and the
 * crash-recovery prompt is launch-moment).
 *
 *  - CreateClockModal  (board-invoked; `kit-shell-overlay` on the kit chassis)
 *  - ManageWindow      (kit-prompt-interval — a stop ≡ an interval-end, ONE block)
 *  - RecoveryDialog    (kit-dialog-recovery — crash-only; one dialog per clock,
 *                       sequentially: the ruled multi-clock presentation)
 *
 * FORM-FIRST is structural: no verb in any of these writes a session. Log
 * verbs stage a hand-off (logHandoff.ts) that Daily's spine consumes into
 * prefilled drafts.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@evolu/react";
import {
  clockMs,
  fmtMs,
  fmtTarget,
  handoffMinutes,
  itemMs,
  parseIntervals,
  parseTarget,
  pomoPlanDone,
  MIN_INTERVALS,
  type Clock,
  type TimerMode,
  type TrackedItem, modeLabel, catsLabel} from "./timerCore";
import {
  addTracked,
  closeManage,
  createClock,
  discardClock,
  removeTracked,
  restartPomodoro,
  resumeFromManage,
  recoveryContinue,
  recoveryDiscard,
  recoveryLogNow,
  takeAllTracked,
  takeTracked,
  useTimers,
} from "./timerStore";
import { stageHandoff } from "./logHandoff";
import {
  selectionToItems,
  timerEntriesQuery,
  timerHabitsQuery,
  TrackedPicker,
  type PickerSelection,
  usePickerDefinitions,
} from "./TrackedPicker";
import { Ico, ICONS } from "../shell/icons";
import { useOverlayEsc } from "../shell/overlayHooks";
import { getPomoBreak, getPomoIntervals, getPomoWork } from "../settings/local";
import "./timers.css";

// Glyphs from the shell roster (dedup pass 2026-07-30) — paths verified
// identical per glyph before adopting.
const IClose = () => <Ico d={ICONS.close} />;
const IPlay = () => <Ico d={ICONS.play} />;
const IPlus = () => <Ico d={ICONS.plus} />;
const IPencil = () => <Ico d={ICONS.edit} />;
const IWarn = () => <Ico d={ICONS.warning} />;
const ITrash = () => <Ico d={ICONS.trash} />;

/** The picker's two queries + the id→title map — the create + manage windows
 * ran this verbatim twice (dedup pass 2026-07-30). */
const usePickerData = () => {
  const habits = useQuery(timerHabitsQuery);
  const entries = useQuery(timerEntriesQuery);
  const entryTitles = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) if (e.title != null) m.set(e.id, e.title);
    return m;
  }, [entries]);
  const defsByHabit = usePickerDefinitions();
  return { habits, entryTitles, defsByHabit };
};

/** Every hand-off is one summed session per tracked item, source "timer" —
 *  the categorical answers picked at join ride along (2026-08-20). */
const toHandoff = (items: TrackedItem[], clock: Clock) =>
  items.map((t) => ({
    habitId: t.habitId,
    entryId: t.entryId,
    cats: t.cats,
    minutes: handoffMinutes(itemMs(clock, t, Date.now())),
  }));

// ── the create flow ──────────────────────────────────────────────────────────

/** The pomodoro default pair — Settings → Timers owns it (per-clock values
 *  stay set at creation, this is only what the form opens with). */
const DEFAULT_TARGET = "25:00";

export function CreateClockModal({ onClose }: { onClose: () => void }) {
  const { habits, entryTitles, defsByHabit } = usePickerData();
  const [mode, setMode] = useState<TimerMode>("stopwatch");
  const [selection, setSelection] = useState<PickerSelection>({});
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [work, setWork] = useState(() => `${getPomoWork()}:00`);
  const [brk, setBrk] = useState(() => `${getPomoBreak()}:00`);
  const [ivals, setIvals] = useState(() => String(getPomoIntervals()));

  // Esc closes — the shared overlay stack (top overlay only).
  useOverlayEsc(onClose);

  const items = selectionToItems(selection, habits, entryTitles, defsByHabit);
  const targetMs = parseTarget(target);
  const workMs = parseTarget(work);
  const breakMs = parseTarget(brk);
  const intervals = parseIntervals(ivals);
  const configOk =
    mode === "stopwatch" ||
    (mode === "countdown"
      ? targetMs != null
      : workMs != null && breakMs != null && intervals != null);
  const canStart = items.length > 0 && configOk;

  const start = () => {
    if (!canStart) return;
    createClock({
      mode,
      tracked: items,
      targetMs: targetMs,
      workMs,
      breakMs,
      intervals,
    });
    onClose();
  };

  return (
    <div className="dimlayer" onMouseDown={onClose} role="presentation">
      <div
        className="mo timer-mo timer-create"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mo-head">
          <div className="mo-titlewrap">
            <span className="mo-title">New Session</span>
          </div>
          {/* no escnote — user-ruled 2026-07-28: no annotations in the timer modals */}
          <div className="mo-esc">
            <button className="mo-close" title="Close" onClick={onClose}>
              <IClose />
            </button>
          </div>
        </div>
        <div className="mo-body">
          <div className="create-card">
            {/* appearance pass 2026-07-28: ordinals dropped — order IS the
                numbering; the step label is the corpus's one section idiom */}
            <div className="cstep">
              <span className="steplbl">Mode</span>
              {/* .segctl (kit) + .modeseg (the local flex-fill/padding delta) */}
              <div className="segctl modeseg" role="tablist">
                {(["stopwatch", "countdown", "pomodoro"] as const).map((m) => (
                  <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
                    {modeLabel(m)}
                  </button>
                ))}
              </div>
            </div>
            <div className="cstep">
              <span className="steplbl">Habits</span>
              <TrackedPicker selection={selection} onChange={setSelection} />
            </div>
            {/* the stopwatch has no length — the SECTION hides rather than
                carrying the "Counts up — nothing to set." note (the annotations
                sweep, user-ruled 2026-07-28) */}
            {mode !== "stopwatch" && (
            <div className="cstep">
              <span className="steplbl">Length</span>
              {mode === "countdown" && (
                <div className="setrow">
                  <span className="setlbl">Target</span>
                  <span className="minifield">
                    <input
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      aria-invalid={targetMs == null}
                    />
                  </span>
                </div>
              )}
              {mode === "pomodoro" && (
                <>
                  <div className="setrow">
                    <span className="setlbl">Intervals</span>
                    <span className="minifield">
                      <input
                        value={ivals}
                        onChange={(e) => setIvals(e.target.value)}
                        aria-invalid={intervals == null}
                      />
                    </span>
                  </div>
                  <div className="setrow">
                    <span className="setlbl">Work</span>
                    <span className="minifield">
                      <input
                        value={work}
                        onChange={(e) => setWork(e.target.value)}
                        aria-invalid={workMs == null}
                      />
                    </span>
                  </div>
                  <div className="setrow">
                    <span className="setlbl">Break</span>
                    <span className="minifield">
                      <input
                        value={brk}
                        onChange={(e) => setBrk(e.target.value)}
                        aria-invalid={breakMs == null}
                      />
                    </span>
                  </div>
                  {/* The plan in one sentence, because "4 intervals" alone
                      does not say where the breaks fall — and the whole point
                      of the amendment is that they fall BETWEEN, never at
                      either end. */}
                  <p className="planline">
                    {intervals != null && workMs != null && breakMs != null
                      ? `${intervals} work intervals of ${fmtTarget(workMs)}, with ${
                          intervals - 1
                        } × ${fmtTarget(breakMs)} break${intervals - 1 === 1 ? "" : "s"} between them.`
                      : `Intervals must be ${MIN_INTERVALS} or more — breaks sit between them.`}
                  </p>
                </>
              )}
            </div>
            )}
          </div>
        </div>
        <div className="mo-foot">
          <button className="btn-accent" aria-disabled={!canStart} onClick={start}>
            <IPlay />
            Start clock
          </button>
          <button className="btn-plain" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── the management window (kit-prompt-interval) ──────────────────────────────

/**
 * The end-of-plan re-run (user-ruled 2026-08-08: *"At the last interval, if I
 * want to resume, it prompts me to set another amount of intervals + work time
 * + breaks"*). It replaces Resume in the footer for exactly one state — a
 * pomodoro that has finished its last interval — because resuming a spent plan
 * has no meaning: the fields ARE the resume.
 *
 * Pre-filled with the plan just finished: the common re-run is "same again",
 * and a blank form would make the common case the expensive one.
 */
function PomoRerun({ clock }: { clock: Clock }) {
  const [open, setOpen] = useState(false);
  const [ivals, setIvals] = useState(() => String(clock.intervals ?? getPomoIntervals()));
  const [work, setWork] = useState(() => fmtTarget(clock.workMs ?? getPomoWork() * 60_000));
  const [brk, setBrk] = useState(() => fmtTarget(clock.breakMs ?? getPomoBreak() * 60_000));

  const intervals = parseIntervals(ivals);
  const workMs = parseTarget(work);
  const breakMs = parseTarget(brk);
  const ok = intervals != null && workMs != null && breakMs != null;

  if (!open)
    return (
      <button className="btn-plain" onClick={() => setOpen(true)}>
        <IPlay />
        Run another set…
      </button>
    );

  return (
    <div className="rerun">
      <div className="rerunfields">
        <span className="setlbl">Intervals</span>
        <span className="minifield">
          <input value={ivals} onChange={(e) => setIvals(e.target.value)} aria-invalid={intervals == null} />
        </span>
        <span className="setlbl">Work</span>
        <span className="minifield">
          <input value={work} onChange={(e) => setWork(e.target.value)} aria-invalid={workMs == null} />
        </span>
        <span className="setlbl">Break</span>
        <span className="minifield">
          <input value={brk} onChange={(e) => setBrk(e.target.value)} aria-invalid={breakMs == null} />
        </span>
      </div>
      <button
        className="btn-accent"
        aria-disabled={!ok}
        onClick={() => {
          if (!ok) return;
          restartPomodoro(clock.id, { intervals, workMs, breakMs });
        }}
      >
        <IPlay />
        Start
      </button>
      <button className="btn-plain" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}

function ManageWindow({ clock, onGoToForm }: { clock: Clock; onGoToForm: () => void }) {
  const [adding, setAdding] = useState(false);
  const [selection, setSelection] = useState<PickerSelection>({});
  const { habits, entryTitles, defsByHabit } = usePickerData();
  const now = Date.now();
  // The one state that gets the re-run instead of Resume.
  const planDone = pomoPlanDone(clock);

  // Esc closes — the shared overlay stack (top overlay only).
  useOverlayEsc(closeManage);


  // Emptying the set closes BOTH the window and the clock (user-ruled
  // 2026-07-28, overriding the drawn "Resume + Add remain" clause): a clock
  // whose last item was logged or removed has nothing left to time.
  const discardIfEmptied = () => {
    if (clock.tracked.length === 1) discardClock(clock.id);
  };
  const logOne = (index: number) => {
    const item = takeTracked(clock.id, index);
    if (item != null) stageHandoff(toHandoff([item], clock));
    discardIfEmptied();
  };
  const removeOne = (index: number) => {
    removeTracked(clock.id, index);
    discardIfEmptied();
  };
  const logAll = () => {
    const items = takeAllTracked(clock.id);
    stageHandoff(toHandoff(items, clock));
    onGoToForm();
  };
  const addPicked = () => {
    const items = selectionToItems(selection, habits, entryTitles, defsByHabit);
    if (items.length === 0) return;
    addTracked(clock.id, items); // a newly added item starts at 0
    setSelection({});
    setAdding(false);
  };

  const hasItems = clock.tracked.length > 0;

  return (
    <div className="dimlayer" onMouseDown={() => closeManage()} role="presentation">
      <div
        className="mo timer-mo timer-manage"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mo-head">
          <div className="mo-titlewrap">
            <span className="mo-title">Manage Clock</span>
            {/* the modal's SUBJECT rides the chassis's subtitle slot (2026-07-28) */}
            <span className="mo-sub">
              {modeLabel(clock.mode)} ·{" "}
              <span className="mono">{fmtMs(clockMs(clock, now))}</span> ·{" "}
              {planDone
                ? `${clock.intervals ?? clock.interval} interval${
                    (clock.intervals ?? clock.interval) === 1 ? "" : "s"
                  } done`
                : "paused"}
            </span>
          </div>
          <div className="mo-esc">
            <button className="mo-close" title="Close" onClick={() => closeManage()}>
              <IClose />
            </button>
          </div>
        </div>
        <div className="mo-body">
          <div className="mset">
            {clock.tracked.map((t, i) => (
              <div className="mrow" key={`${t.habitId}|${t.entryId ?? ""}`}>
                <span className="dot" style={{ background: `var(--${t.colourSlot})` }} />
                <span className="mnwrap">
                  <div className="mn">
                    {t.habitName}
                    {t.entryTitle != null && <span className="ent"> · {t.entryTitle}</span>}
                    {catsLabel(t) !== "" && <span className="ent"> · {catsLabel(t)}</span>}
                  </div>
                </span>
                <span className="macc">{fmtMs(itemMs(clock, t, now))}</span>
                <span className="macts">
                  <button className="cbtn quiet" onClick={() => logOne(i)}>
                    <IPencil />
                    Log
                  </button>
                  <button className="cbtn quiet danger" onClick={() => removeOne(i)}>
                    Remove
                  </button>
                </span>
              </div>
            ))}
          </div>
          {adding ? (
            <>
              <TrackedPicker selection={selection} onChange={setSelection} />
              <div style={{ display: "flex", gap: "var(--space-3)" }}>
                <button className="cbtn plain" onClick={addPicked}>
                  Add to the set
                </button>
                <button className="cbtn quiet" onClick={() => setAdding(false)}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button className="maddrow" onClick={() => setAdding(true)}>
              <IPlus />
              Add habit / entry to the set
            </button>
          )}
        </div>
        <div className="mo-foot">
          {hasItems && (
            <button className="btn-accent" onClick={logAll}>
              <IPencil />
              Log all
            </button>
          )}
          {planDone ? (
            <PomoRerun clock={clock} />
          ) : (
            <button className="btn-plain" onClick={() => resumeFromManage(clock.id)}>
              <IPlay />
              Resume
            </button>
          )}
          <span style={{ marginLeft: "auto" }} />
          {/* Per-clock scrap (user-ruled 2026-07-28): every clock can be
              discarded whole from its own window. No ceremony — nothing was
              written (the recovery dialog's Discard precedent); it sits in the
              far corner, spacer-separated from Resume. */}
          <button className="btn-danger" onClick={() => discardClock(clock.id)}>
            <ITrash />
            Discard clock
          </button>
        </div>
      </div>
    </div>
  );
}

// ── the crash-recovery dialog (kit-dialog-recovery) ──────────────────────────

function RecoveryDialog({ clock }: { clock: Clock }) {
  const now = Date.now();
  // Deliberately NOT dismissable by dim-click/Esc — the three verbs are the
  // only exits (Discard is the destructive corner; an accidental Esc must not
  // pick for you).
  //
  // APPEARANCE PASS 2026-07-28 — re-anatomised onto kit-dialog-confirm
  // (.confirm/.confirm-body/.ch/.confirm-actions): a short, decision-led,
  // prose-led dialog quotes the confirm verbatim; only the icon colour differs
  // (--attention-dot — attention, not destruction).
  return (
    <div className="dimlayer" role="presentation">
      <div className="confirm timer-mo timer-recovery" role="alertdialog" aria-modal="true">
        <div className="confirm-body">
          <div className="ch">
            <IWarn />
            Timer recovery
          </div>
          <p>
            A clock was still running when Cibo <b>closed unexpectedly</b>. These are its{" "}
            <b>last-persisted</b> accumulators.
          </p>
          <div className="mset">
            {clock.tracked.map((t) => (
              <div className="mrow" key={`${t.habitId}|${t.entryId ?? ""}`}>
                <span className="dot" style={{ background: `var(--${t.colourSlot})` }} />
                <span className="mnwrap">
                  <div className="mn">
                    {t.habitName}
                    {t.entryTitle != null && <span className="ent"> · {t.entryTitle}</span>}
                    {catsLabel(t) !== "" && <span className="ent"> · {catsLabel(t)}</span>}
                  </div>
                </span>
                <span className="macc">{fmtMs(itemMs(clock, t, now))}</span>
              </div>
            ))}
          </div>
          <div className="confirm-actions">
            <button className="btn-accent" onClick={() => recoveryContinue()}>
              <IPlay />
              Continue
            </button>
            <button className="btn-plain" onClick={() => recoveryLogNow()}>
              <IPencil />
              Log now
            </button>
            <span style={{ marginLeft: "auto" }} />
            <button className="btn-danger" onClick={() => recoveryDiscard()}>
              <ITrash />
              Discard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── the shell mount ──────────────────────────────────────────────────────────

export function TimerOverlays({ onGoToForm }: { onGoToForm: () => void }) {
  const state = useTimers();
  const manageClock =
    state.manageId != null ? (state.clocks.find((c) => c.id === state.manageId) ?? null) : null;
  const recovery = state.recoveryQueue[0] ?? null;
  // The launch-moment recovery queue outranks the management window — never
  // both at once, so Esc always addresses the top (and only) overlay.
  return (
    <>
      {manageClock != null && recovery == null && (
        <ManageWindow clock={manageClock} onGoToForm={onGoToForm} />
      )}
      {recovery != null && <RecoveryDialog clock={recovery} />}
    </>
  );
}
