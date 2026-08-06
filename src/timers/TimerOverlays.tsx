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
  handoffMinutes,
  itemMs,
  parseTarget,
  type Clock,
  type TimerMode,
  type TrackedItem, modeLabel} from "./timerCore";
import {
  addTracked,
  closeManage,
  createClock,
  discardClock,
  removeTracked,
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
} from "./TrackedPicker";
import { Ico, ICONS } from "../shell/icons";
import { useOverlayEsc } from "../shell/overlayHooks";
import { getPomoBreak, getPomoWork } from "../settings/local";
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
  return { habits, entryTitles };
};

/** Every hand-off is one summed session per tracked item, source "timer". */
const toHandoff = (items: TrackedItem[], clock: Clock) =>
  items.map((t) => ({
    habitId: t.habitId,
    entryId: t.entryId,
    minutes: handoffMinutes(itemMs(clock, t, Date.now())),
  }));

// ── the create flow ──────────────────────────────────────────────────────────

/** The pomodoro default pair — Settings → Timers owns it (per-clock values
 *  stay set at creation, this is only what the form opens with). */
const DEFAULT_TARGET = "25:00";

export function CreateClockModal({ onClose }: { onClose: () => void }) {
  const { habits, entryTitles } = usePickerData();
  const [mode, setMode] = useState<TimerMode>("stopwatch");
  const [selection, setSelection] = useState<PickerSelection>({});
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [work, setWork] = useState(() => `${getPomoWork()}:00`);
  const [brk, setBrk] = useState(() => `${getPomoBreak()}:00`);

  // Esc closes — the shared overlay stack (top overlay only).
  useOverlayEsc(onClose);

  const items = selectionToItems(selection, habits, entryTitles);
  const targetMs = parseTarget(target);
  const workMs = parseTarget(work);
  const breakMs = parseTarget(brk);
  const configOk =
    mode === "stopwatch" ||
    (mode === "countdown" ? targetMs != null : workMs != null && breakMs != null);
  const canStart = items.length > 0 && configOk;

  const start = () => {
    if (!canStart) return;
    createClock({
      mode,
      tracked: items,
      targetMs: targetMs,
      workMs,
      breakMs,
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
            <span className="mo-title">New session</span>
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

function ManageWindow({ clock, onGoToForm }: { clock: Clock; onGoToForm: () => void }) {
  const [adding, setAdding] = useState(false);
  const [selection, setSelection] = useState<PickerSelection>({});
  const { habits, entryTitles } = usePickerData();
  const now = Date.now();

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
    const items = selectionToItems(selection, habits, entryTitles);
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
            <span className="mo-title">Manage clock</span>
            {/* the modal's SUBJECT rides the chassis's subtitle slot (2026-07-28) */}
            <span className="mo-sub">
              {clock.mode === "stopwatch"
                ? "Stopwatch"
                : clock.mode === "countdown"
                  ? "Countdown"
                  : "Pomodoro"}{" "}
              · <span className="mono">{fmtMs(clockMs(clock, now))}</span> · paused
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
          <button className="btn-plain" onClick={() => resumeFromManage(clock.id)}>
            <IPlay />
            Resume
          </button>
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
