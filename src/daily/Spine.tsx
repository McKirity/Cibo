/**
 * DAILY — THE FORM SPINE. Translated from `Final/daily-state-1.html`'s
 * `.col.spine`; the CSS was already claimed into `daily.css` (~427–705), so this
 * file is markup and logic only.
 *
 * The five rulings it implements (owning record: the screen note
 * § Amended 2026-07-26 (2nd) — read that before changing anything here):
 *
 *  1 · FINALIZE IS THE ONLY OFFICIAL SAVE. The strips are a LIVE EDITOR over the
 *      day's real sessions — edits buffer via autosave.ts and land at the flush.
 *      Finalize is the state change into state 2 (the cover wall), not a submit;
 *      it flushes the buffer first, then flips the day.
 *  2 · ONE SESSION BLOCK IS ONE BOUT, NOT ONE ROW (see spineSpec.groupBouts).
 *  3 · THE KIND EYEBROW DERIVES (spineSpec.kindEyebrow).
 *  4 · SESSION REMOVE SHIPS WITH A MINIMAL UNDO TOAST (shell/toast.tsx).
 *  5 · KEYBOARD'S THREE DEFERRED CONTROLS LAND HERE — refresh · override ·
 *      board-only logging.
 *
 * Everything about a strip's SHAPE is read off the habit's own declarations;
 * there is no habit-key branch in this file. The one key-shaped fact — that
 * Keyboard's word count is Writing's — is imported from `db/derivedKeyboard.ts`,
 * which has been its code-side home since it was ruled.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { syncDerivedKeyboardForDay, WRITING_KEY } from "../db/derivedKeyboard";
import { showErrorToast, showUndoToast } from "../shell/toast";
import { useMilestoneDay } from "./useMilestoneDay";
import {
  buildStripSpec,
  dayRevision,
  derivedReadout,
  groupBouts,
  lettermark,
  minutesHint,
  orderStrips,
  type Bout,
  type SpineDefinition,
  type SpineHabit,
  type StripSpec,
} from "./spineSpec";
import { useDayData, type DayData, type DayEntry } from "./useDayData";
import { dayFromIndex, dayIndex } from "../metrics/dates";
import { requestHabitCreator, requestSettingsNav } from "../shell/navRequest";
import { nowLocalDateTime, todayLocal } from "../metrics/clock";
import {
  clearDay,
  createBout,
  finalizeDay,
  logBoard,
  overrideDerived,
  quickAddVocabValue,
  quickCreateEntry,
  refreshDerived,
  removeBout,
  restoreBout,
  setBoutEntry,
  setBoutSubunit,
  updateMeasureValue,
  updateRange,
} from "./spineWrites";
import { DateTimePicker } from "./DateTimePicker";
import { DangerConfirm } from "../shell/DangerConfirm";
import { subscribeHandoff, takeHandoffFor } from "../timers/logHandoff";
import {
  AUTOSAVE_DEFAULT_MINUTES,
  autosaveQuery,
  clampInterval,
  dropQueued,
  queueWrite,
  subscribePending,
  useAutosave,
} from "./autosave";

// ── Icons (lucide paths, exactly the FINAL's) ────────────────────────────────

const Svg = ({ cls, children }: { cls: string; children: React.ReactNode }) => (
  <svg className={cls} viewBox="0 0 24 24">
    {children}
  </svg>
);
const IChev = ({ cls = "ico chev" }: { cls?: string }) => (
  <Svg cls={cls}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);
const IChevDown = () => (
  <Svg cls="ico sm chevd">
    <path d="m6 9 6 6 6-6" />
  </Svg>
);
const IX = () => (
  <Svg cls="ico sm">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Svg>
);
const IPlus = () => (
  <Svg cls="ico sm">
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </Svg>
);
const ISearch = () => (
  <Svg cls="ico sm">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </Svg>
);
const ITimer = () => (
  <Svg cls="ico sm">
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2 2" />
    <path d="M5 3 2 6" />
    <path d="m22 6-3-3" />
  </Svg>
);
const IArrow = () => (
  <Svg cls="ico sm">
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Svg>
);
const IRefresh = () => (
  <Svg cls="ico sm">
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    <path d="M3 21v-5h5" />
  </Svg>
);
const IFinalize = () => (
  <Svg cls="ico">
    <path d="M4 4v16" />
    <path d="M4 5h13l-2.5 4L17 13H4" />
  </Svg>
);
const IEmblem = () => (
  <Svg cls="ico">
    <circle cx="12" cy="8" r="6" />
    <path d="M8.5 13.5 7 22l5-3 5 3-1.5-8.5" />
  </Svg>
);

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * A field is bigger than the input inside it. Clicking a picker's search icon,
 * or the padding beside a time, hit the WRAPPER and focused nothing, so the
 * popover never opened — user-ruled 2026-07-26: "I have to click the menus dead
 * on to activate them instead of being able to click in their peripheries."
 * Now the wrapper hands focus to its own field, and the whole chip is the
 * target.
 */
const focusFieldWithin = (e: React.MouseEvent<HTMLElement>, selector: string) => {
  if (e.target instanceof HTMLInputElement) return;
  // NOT when the click came from inside the open panel. A pick's mousedown
  // bubbles up to this wrapper, which would re-focus the field it had just been
  // closed by — the popover blinked shut and straight back open.
  if (e.target instanceof Element && e.target.closest(".pkdrop") != null) return;
  const input = e.currentTarget.querySelector<HTMLInputElement>(selector);
  if (input == null) return;
  e.preventDefault();
  input.focus();
};

/**
 * Enter/Space on a span acting as a button. The corpus draws these as `<span>`s
 * (a mockup has no behaviour to give them), so the app supplies the keyboard
 * half of what `role="button"` promises.
 */
const onActivate = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

// ── The spine ────────────────────────────────────────────────────────────────

/**
 * Writing's live day total, as a tiny per-mount EXTERNAL STORE (2026-07-30
 * efficiency pass). It changes on every Writing keystroke, and as parent state
 * it re-rendered every strip; only the Keyboard strip reads it, so that strip
 * subscribes directly (`useSyncExternalStore`) and typing repaints nothing else.
 */
interface WordTotalStore {
  get: () => number | null;
  set: (v: number) => void;
  subscribe: (cb: () => void) => () => void;
}

const createWordTotalStore = (): WordTotalStore => {
  let value: number | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (v) => {
      if (v === value) return;
      value = v;
      for (const l of listeners) l();
    },
    subscribe: (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
};

export function Spine({
  dayKey,
  onFinalized,
}: {
  dayKey: string;
  /** Daily swaps to the cover wall; the write itself happens here. */
  onFinalized?: () => void;
}) {
  const data = useDayData(dayKey);
  const [confirmClear, setConfirmClear] = useState(false);
  // AUTO-SAVE (user-ruled 2026-07-27). Writes buffer and flush on the interval,
  // on close, on hide, and on leaving the screen — see autosave.ts for what that
  // trades away.
  const autosaveRows = useQuery(autosaveQuery);
  const autosaveMinutes = clampInterval(
    Number(autosaveRows[0]?.value ?? AUTOSAVE_DEFAULT_MINUTES),
  );
  // THE KEYBOARD→WRITING AUTO-FOLLOW hangs off the flush, not off the write.
  // Buffering broke it: the sync used to fire inside `createBout`, where it read
  // Writing's word total before its own insert had reached the worker.
  const afterFlush = useCallback(() => {
    void syncDerivedKeyboardForDay(evolu, dayKey);
  }, [dayKey]);
  const { flushNow, pending } = useAutosave(autosaveMinutes, showErrorToast, afterFlush);

  // THE AUTO-FOLLOW IS A DERIVATION, so it is derived LIVE and the store catches
  // up at the flush — user-ruled 2026-07-27: "keyboard automatically updates
  // whenever I change word count in writing." Waiting for the flush meant the
  // tie only caught up every ten minutes, which is what made Refresh look like
  // the only way to move it. The Writing strip publishes its running total
  // (committed rows plus anything still buffered) into the per-mount word
  // store; the Keyboard strip alone subscribes.
  const wordsRef = useRef<WordTotalStore | null>(null);
  if (wordsRef.current == null) wordsRef.current = createWordTotalStore();
  const words = wordsRef.current;
  // Bumped by Clear all so every strip remounts: their drafts are local state,
  // and a cleared day should open each habit on a fresh empty session again.
  const [formEpoch, setFormEpoch] = useState(0);
  // Day-scoped and therefore tiny: what the banner needs to know is "did today's
  // rows change", not "did anything anywhere change".
  const revision = useMemo(
    () => dayRevision(data.sessions, data.cats),
    [data.sessions, data.cats],
  );
  const specs = useMemo(
    () =>
      orderStrips(data.habits).map((h) =>
        buildStripSpec(h, data.defsByHabit.get(h.id) ?? []),
      ),
    [data.habits, data.defsByHabit],
  );

  return (
    <>
      {/* The day header lives in the SPINE's head, not above the triptych
          (ruled 2026-07-18: day identity + finalize state lead the logging
          column). */}
      <div className="dayhdr">
        <div className="date">
          <span className="dow">{WEEKDAY.format(new Date(`${dayKey}T12:00:00`))} —</span>{" "}
          {DAY_MONTH_YEAR.format(new Date(`${dayKey}T12:00:00`))}
        </div>
        <span className="badge">
          <span className="ring" />
          {data.dayRow?.finalized ? "Finalized" : "Unfinalized"}
        </span>
      </div>

      {/* The one column the 2026-07-19 flex re-rule DOES height-neutralize: the
          form is lifted out of intrinsic sizing (absolute inside .form-wrap) so
          the spine contributes only its head to the triptych's height, and its
          internal scroll is the logging form's own designed behaviour — not a
          whimsy column's. */}
      <div className="form-wrap">
        <div className="form">
          <MilestoneBanner dayKey={dayKey} revision={revision} />

          {specs.length === 0 ? (
            <ZeroActiveHabits />
          ) : (
            specs.map((spec) => (
              <Strip
                key={`${spec.habit.id}|${formEpoch}`}
                spec={spec}
                data={data}
                dayKey={dayKey}
                flushNow={flushNow}
                words={words}
              />
            ))
          )}

          {/* The honest counterpart to buffering. The frozen screen's own
              "nothing is unsaved" stopped being true the moment writes started
              waiting, so the form says how many are waiting and offers the
              flush — quiet register, never a demand. */}
          {/* The DEV auto-save stand-in that sat here RETIRED 2026-08-04
              (the third audit): Settings → Tracking → Logging shipped the
              real stepper at step 10, which made this a second live writer
              of the same synced row on the app's front door. */}

          {pending > 0 && (
            <p className="fieldnote" style={{ marginTop: "var(--space-5)", textAlign: "right" }}>
              {pending} unsaved change{pending === 1 ? "" : "s"} · saves every {autosaveMinutes} min
              {" · "}
              <span className="door" role="button" tabIndex={0} onClick={flushNow} onKeyDown={onActivate(flushNow)}>
                save now
              </span>
            </p>
          )}

          <FinalizeButton
            dayKey={dayKey}
            finalized={data.dayRow?.finalized ?? false}
            flushNow={flushNow}
            onFinalized={onFinalized ?? (() => {})}
          />

          {/* CLEAR ALL — a Build-side addition to a frozen screen (user-asked
              2026-07-26; the FINAL draws no such control). Kept in the quiet
              `.rm` register rather than given a button: it is an escape hatch,
              not a peer of Finalize, and Finalize's ruled `--space-7` clearance
              is left alone by sitting below it. Hidden when the day is empty —
              there is nothing to clear and nothing to warn about. */}
          {data.sessions.length > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "var(--space-5)" }}>
              <span
                className="rm"
                role="button"
                tabIndex={0}
                onClick={() => setConfirmClear(true)}
                onKeyDown={onActivate(() => setConfirmClear(true))}
              >
                <IX />
                Clear all
              </span>
            </div>
          )}
        </div>
      </div>

      {confirmClear && (
        <DangerConfirm
          title={`Clear ${data.sessions.length === 1 ? "the session" : "all sessions"}?`}
          body={
            <>
              This permanently deletes{" "}
              <b>
                {data.sessions.length} session{data.sessions.length === 1 ? "" : "s"}
              </b>{" "}
              logged on <b>{DAY_MONTH_YEAR.format(new Date(`${dayKey}T12:00:00`))}</b>. This cannot
              be undone.
            </>
          }
          confirmLabel={`Delete ${data.sessions.length} session${data.sessions.length === 1 ? "" : "s"}`}
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            // Anything still buffered would re-create what this is deleting.
            dropQueued("");
            const res = clearDay(data.sessions, data.catRowIds);
            setConfirmClear(false);
            if (!res.ok) showErrorToast(res.reason);
            else setFormEpoch((n) => n + 1);
          }}
        />
      )}
    </>
  );
}

/**
 * kit-state-empty — the FORM REGION only; the sky, almanac and shelf keep
 * running. Covers both a skipped first-run setup and the archive-everything
 * case. An empty *logged* day is NOT this — that is just the resting form.
 */
function ZeroActiveHabits() {
  // Both escape doors LIVE since 2026-08-04 (the re-wire batch — they were
  // aria-disabled dead ends while their destinations existed): the navRequest
  // bridge lands Settings → Habits, with the creator open for "New habit".
  return (
    <div className="emptybox">
      <div className="eh">No active habits</div>
      <div className="es">Activate your seeded habits or create new ones to start logging days.</div>
      <div style={{ display: "flex", gap: "var(--space-4)", justifyContent: "center" }}>
        <button className="btn-accent" onClick={() => requestSettingsNav("habits")}>
          Settings → Habits
        </button>
        <button className="btn-plain" onClick={() => requestHabitCreator()}>
          New habit
        </button>
      </div>
    </div>
  );
}

/**
 * kit-control-finalize — the day's closing gesture, NOT a submit (ruling 1).
 *
 * IT MUST FLUSH FIRST. Writes buffer since 2026-07-27, so finalizing without a
 * flush would seal a day whose sessions are still in memory — a cover wall
 * built from a store that has not seen the day yet.
 *
 * ON AN ALREADY-FINALIZED DAY it is the way BACK to the wall, not a second
 * write. [[Day Finalize & Catch-Up]]: a finalized day stays editable behind the
 * light "edit this day" affordance and "remains finalized through the edit —
 * no unlock → edit → re-finalize dance". So the flag never moves here; only the
 * view does. *(Un-finalize is allowed by that ruling and has no drawn control;
 * it stays unbuilt rather than invented.)*
 */
function FinalizeButton({
  dayKey,
  finalized,
  flushNow,
  onFinalized,
}: {
  dayKey: string;
  finalized: boolean;
  flushNow: () => boolean;
  onFinalized: () => void;
}) {
  return (
    <button
      className="finalize"
      title={
        finalized
          ? "This day is already finalized — back to its cover wall."
          : "Finalize turns the day into its cover wall."
      }
      onClick={async () => {
        // The buffer first, always. Everything typed today has to be in the
        // store before the day is sealed — and a FAILED flush blocks the seal
        // (user-ruled 2026-07-30: "finalize should wait until save"). Sealing
        // anyway would finalize a day whose edits were silently dropped.
        const flushed = flushNow();
        if (finalized) {
          onFinalized();
          return;
        }
        if (!flushed) {
          showErrorToast("A change failed to save — the day was NOT finalized.");
          return;
        }
        const res = await finalizeDay(dayKey, nowLocalDateTime());
        if (!res.ok) showErrorToast(res.reason);
        else onFinalized();
      }}
    >
      <IFinalize />
      {finalized ? "Back to the wall" : "Finalize"}
    </button>
  );
}

// ── The milestone banner — a COUNT HEADLINE (ruled 2026-07-26) ───────────────

/**
 * THE BANNER STAYS CONDITIONAL — absent on days nothing was earned, so it reads
 * as an EVENT, not furniture. It counts; the full list lives on the cover wall's
 * family cards (state 2). Uniform even at one ("if we get specific, it quickly
 * balloons out of control"), and the streak count rides along only when the
 * banner is already showing.
 *
 * Its data is a debounced SNAPSHOT (useMilestoneDay), not a live whole-store
 * subscription — see that file for why the live version was the typing lag.
 */
function MilestoneBanner({ dayKey, revision }: { dayKey: string; revision: string }) {
  const result = useMilestoneDay(dayKey, revision);
  if (result == null || result.headline === "") return null;
  return (
    <div className="milestone" style={{ marginBottom: "var(--space-6)" }}>
      <div className="emblem">
        <IEmblem />
      </div>
      <div className="mh">{result.headline}</div>
    </div>
  );
}

// ── A strip ──────────────────────────────────────────────────────────────────

interface StripProps {
  spec: StripSpec;
  data: DayData;
  dayKey: string;
  flushNow: () => void;
  /** Writing's running word total for the day, buffered edits included. */
  words: WordTotalStore;
}

interface Draft {
  key: number;
  entryId: string | null;
  cats: Record<string, string>;
  flags: Record<string, boolean>;
  time: string;
  count: string;
  /** The range pair, held as four parts — picking a date must not invent a time. */
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  /** step 7 — the draft arrived through the timer hand-off (source: "timer"). */
  fromTimer?: boolean;
}

function Strip({ spec, data, dayKey, flushNow, words }: StripProps) {
  const { habit } = spec;
  const rows = useMemo(
    () => data.sessions.filter((s) => s.habit_fk === habit.id),
    [data.sessions, habit.id],
  );
  const bouts = useMemo(() => groupBouts(rows, data.cats), [rows, data.cats]);
  const entries = data.entriesByHabit.get(habit.id) ?? [];

  // THE SCREEN OPENS AT REST WITH EVERY STRIP COLLAPSED — the frozen file says
  // so in its own caption ("click any chevron to expand one in place") and not
  // one of its seven <details> carries `open`. An earlier pass here opened a
  // strip whenever the day already carried work for it; that was invented, and
  // it is what made the column read as a stack of huge cards.
  const [open, setOpen] = useState(false);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const draftId = useRef(1);

  // BUFFERED WRITES need an optimistic overlay: the live query cannot show an
  // edit that has not been written yet, so a picked value would snap back to
  // the stored one. Measure fields are exempt — they already hold their own
  // text — so this is only the fields whose display reads from the store.
  const [pendingCats, setPendingCats] = useState<Record<string, Record<string, string>>>({});
  const [pendingEntry, setPendingEntry] = useState<Record<string, string>>({});
  const [pendingMeasures, setPendingMeasures] = useState<Record<string, number>>({});
  const queuedDrafts = useRef<Set<number>>(new Set());

  // A flush emptied the queue, so the store now holds what the drafts held:
  // drop them and let the real bouts render.
  useEffect(
    () =>
      subscribePending((n) => {
        if (n !== 0 || queuedDrafts.current.size === 0) return;
        const done = queuedDrafts.current;
        queuedDrafts.current = new Set();
        setDrafts((d) => d.filter((x) => !done.has(x.key)));
      }),
    [],
  );

  const catsOf = (bout: Bout) => ({ ...bout.cats, ...(pendingCats[bout.key] ?? {}) });
  const entryOf = (bout: Bout) => pendingEntry[bout.key] ?? bout.entryId;

  /**
   * Writing's day total, as the form currently reads: every committed count row
   * with any buffered edit laid over it, plus the counts sitting in drafts.
   * Published into the word store on every change so the Keyboard strip can
   * mirror it immediately — the DB write still happens at the flush, and the
   * two agree by then.
   */
  const publishWordsIfWriting = (overrides: Record<string, number> = {}) => {
    if (habit.key !== WRITING_KEY) return;
    const pend = { ...pendingMeasures, ...overrides };
    let total = 0;
    for (const b of bouts) total += pend[`${b.key}|count`] ?? b.count?.value ?? 0;
    for (const d of drafts) {
      const v = Number(d.count);
      if (d.count.trim() !== "" && Number.isFinite(v)) total += v;
    }
    words.set(total);
  };
  useEffect(() => {
    publishWordsIfWriting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bouts, drafts, pendingMeasures]);

  // A range session's owning day is its END date (keystone), so a night runs
  // from yesterday into today — user-ruled 2026-07-26: "bedtime and wake should
  // come prefilled dates. Bedtime should show yesterday's date, wake should show
  // today." The TIMES stay empty; only the dates are known in advance.
  const newDraft = (): Draft => ({
    key: draftId.current++,
    entryId: null,
    cats: {},
    flags: {},
    time: "",
    count: "",
    startDate: spec.isRange ? dayFromIndex(dayIndex(dayKey) - 1) : "",
    startTime: "",
    endDate: spec.isRange ? dayKey : "",
    endTime: "",
  });

  const addDraft = () => setDrafts((d) => [...d, newDraft()]);

  // EVERY HABIT OPENS ON AN EMPTY SESSION — user-ruled 2026-07-26: "each habit
  // should start with an empty session instead of prompting me to add one." The
  // Add Session button stays for the second bout onward. Habits whose bout IS a
  // control (measureless, board-only) have nothing to draft.
  //
  // ONCE per habit-and-day, deliberately. Re-arming on "no bouts and no drafts"
  // reads as the same rule but fires again in the gap between a draft
  // committing and the live query repainting, leaving a ghost empty session
  // behind every save.
  // Gated on the strip being OPEN, which also settles a race: on first paint the
  // day query has not resolved, so `bouts.length` is 0 for every habit and
  // seeding then would hand a filled strip a ghost empty session beside its real
  // one. By the time a strip is opened the day has certainly loaded.
  const seeded = useRef("");
  useEffect(() => {
    if (!open) return;
    const mark = `${habit.id}|${dayKey}`;
    if (seeded.current === mark) return;
    seeded.current = mark;
    if (spec.isMeasureless || spec.derivesCount || bouts.length > 0) return;
    setDrafts([newDraft()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, habit.id, dayKey, bouts.length, spec.isMeasureless, spec.derivesCount]);

  const dropDraft = (key: number) => {
    dropQueued(`draft|${habit.id}|${key}`);
    queuedDrafts.current.delete(key);
    setDrafts((d) => d.filter((x) => x.key !== key));
  };

  /** A draft commits the moment it holds enough to be a valid bout. */
  const commit = (draft: Draft) => {
    const measures: Array<{ kind: "time" | "count"; value: number }> = [];
    for (const m of spec.measures) {
      const raw = m.kind === "time" ? draft.time : draft.count;
      if (raw.trim() === "") continue;
      const v = Number(raw);
      if (!Number.isFinite(v)) {
        setError("That is not a number.");
        return false;
      }
      measures.push({ kind: m.kind, value: v });
    }
    const range =
      spec.isRange &&
      draft.startDate !== "" && draft.startTime !== "" &&
      draft.endDate !== "" && draft.endTime !== ""
        ? {
            start: `${draft.startDate}T${draft.startTime}`,
            end: `${draft.endDate}T${draft.endTime}`,
          }
        : null;
    if (measures.length === 0 && range == null && !spec.isMeasureless) return false;
    if (spec.needsEntry && draft.entryId == null) {
      setError("Pick a title first.");
      return false;
    }
    const cats = [
      ...spec.categoricals.flatMap((d) =>
        draft.cats[d.key] ? [{ definitionId: d.id, value: draft.cats[d.key] }] : [],
      ),
      ...spec.flags.map((d) => ({
        definitionId: d.id,
        value: draft.flags[d.key] ? "true" : "false",
      })),
    ];
    // BUFFERED, not written: the draft stays on screen until the flush replaces
    // it with the real bout. Re-queuing under the same key means editing a
    // still-unflushed bout rewrites its pending create rather than stacking a
    // second one.
    queueWrite(`draft|${habit.id}|${draft.key}`, () =>
      createBout({
        habit,
        day: dayKey,
        entryId: draft.entryId,
        measures,
        range,
        measureless: spec.isMeasureless,
        cats,
        source: draft.fromTimer ? "timer" : undefined,
      }),
    );
    queuedDrafts.current.add(draft.key);
    setError(null);
    return true;
  };

  // ── step 7: the timer hand-off ─────────────────────────────────────────────
  // Staged accumulators (logHandoff.ts) become PREFILLED drafts, committed
  // immediately — the user's "Log" in the management window was the intent, and
  // the commit still rides the ordinary buffer, so nothing is official until
  // the flush. One summed session per tracked item, `source: "timer"`.
  // TODAY only: a staged item must never land on a browsed past day.
  useEffect(() => {
    const consume = () => {
      if (dayKey !== todayLocal()) return;
      const items = takeHandoffFor(habit.id);
      if (items.length === 0) return;
      // suppress the empty-session auto-seed — it REPLACES drafts when it fires
      seeded.current = `${habit.id}|${dayKey}`;
      const made = items.map((it) => ({
        ...newDraft(),
        entryId: it.entryId,
        time: String(it.minutes),
        fromTimer: true,
      }));
      setDrafts((prev) => [...prev, ...made]);
      for (const m of made) commit(m);
      setOpen(true);
    };
    consume();
    return subscribeHandoff(consume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habit.id, dayKey]);

  const remove = (bout: Bout, label: string) => {
    // The bout's buffered edits die with it (Clear-all's discipline): left in
    // the queue they would write onto the tombstoned rows — or insert orphan
    // subunit values — at the next flush, and an Undo would restore a bout
    // carrying half-applied edits.
    dropQueued(`sess|${bout.key}|`);
    const res = removeBout(bout, label, data.catRowIds);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    setError(null);
    showUndoToast(`Deleted “${label}”`, () => {
      const back = restoreBout(res.removed);
      if (!back.ok) showErrorToast(back.reason);
    });
  };

  // THE TITLE BELONGS TO THE SESSION, NEVER TO THE STRIP — user-ruled
  // 2026-07-26: "what if I decide to work on multiple stories one day?" The
  // frozen file draws Writing's title once above its two session blocks, which
  // silently caps a creation habit at one entry a day. Struck; every project
  // habit now picks its title per bout, the way the drawn Gaming strip does.
  return (
    <details className="strip" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        {/* The FINAL draws a lucide glyph per habit, but `habits.icon` is null on
            every seeded habit and [[Iconography]] rules the fallback: lucide as
            DATA, lettermark when the column is empty. The rail already reads the
            same way, so the two agree. A lucide name→path registry lands with
            the habit creator's icon picker (step 10). */}
        <span className="swatch" style={{ background: `var(--${habit.colour_slot})` }}>
          {lettermark(habit.name)}
        </span>
        <span className="hname">{habit.name}</span>
        <span className="kind">{spec.eyebrow}</span>
        <IChev />
      </summary>
      <div className="body">
        {spec.derivesCount ? (
          <BoardOnly
            spec={spec}
            data={data}
            dayKey={dayKey}
            bouts={bouts}
            words={words}
            queue={(field, run) => queueWrite(`board|${habit.id}|${field}`, run)}
            flushNow={flushNow}
            onError={setError}
          />
        ) : (
          <>
            {bouts.map((bout, i) => (
              <SessionBlock
                key={bout.key}
                index={i + 1}
                bout={bout}
                cats={catsOf(bout)}
                entryId={entryOf(bout)}
                queue={(field, run) => queueWrite(`sess|${bout.key}|${field}`, run)}
                onOptimistic={(field, value) => {
                  if (field.endsWith("|measure")) {
                    const kind = field.slice(0, field.indexOf("|"));
                    const num = Number(value);
                    setPendingMeasures((p) => ({ ...p, [`${bout.key}|${kind}`]: num }));
                    publishWordsIfWriting({ [`${bout.key}|${kind}`]: num });
                    return;
                  }
                  if (field === "entry") setPendingEntry((p) => ({ ...p, [bout.key]: value }));
                  else
                    setPendingCats((p) => ({
                      ...p,
                      [bout.key]: { ...(p[bout.key] ?? {}), [field]: value },
                    }));
                }}
                spec={spec}
                data={data}
                dayKey={dayKey}
                entries={entries}
                showEntry={spec.needsEntry}
                onRemove={() => remove(bout, `${habit.name} bout ${i + 1}`)}
                onError={setError}
              />
            ))}

            {drafts.map((draft, i) => (
              <DraftBlock
                key={draft.key}
                index={bouts.length + i + 1}
                draft={draft}
                spec={spec}
                entries={entries}
                showEntry={spec.needsEntry}
                onChange={(next) =>
                  setDrafts((d) => d.map((x) => (x.key === draft.key ? next : x)))
                }
                onCommit={commit}
                onDiscard={() => dropDraft(draft.key)}
                onError={setError}
              />
            ))}

            {spec.isMeasureless ? (
              <MeasurelessRow
                spec={spec}
                bouts={bouts}
                dayKey={dayKey}
                onRemove={remove}
                onError={setError}
              />
            ) : (
              <button className="addsess" onClick={addDraft}>
                <IPlus />
                Add Session
              </button>
            )}
          </>
        )}

        {error != null && (
          // Tier 2 of the failure model: a failure the user just caused stays
          // INLINE, where it was caused — never the toast.
          <p className="fieldnote" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
      </div>
    </details>
  );
}

// ── The measureless floor (Walking): the bout IS the checkbox ────────────────

/**
 * A BOOLEAN, wearing the app's own toggle chip — user-ruled 2026-07-26: the
 * drawn `.check` (a bare 20px box and a word on the panel ground) "feels bare
 * and disjointed with the rest of the app", where every other control is a
 * bordered chip. This is `.kb`'s chip, the same face the board list uses and
 * the same one that was signed off there, so nothing is invented and no CSS is
 * added: `.kb span.on` already carries the ruled selected state (accent border,
 * `--selected-wash`, the inset ring).
 */
function ToggleChip({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="kb">
      <span
        className={on ? "on" : undefined}
        role="checkbox"
        aria-checked={on}
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={onActivate(onToggle)}
      >
        {label}
      </span>
    </div>
  );
}

// ── The measureless floor (Walking): the bout IS the checkbox ────────────────

function MeasurelessRow({
  spec,
  bouts,
  dayKey,
  onRemove,
  onError,
}: {
  spec: StripSpec;
  bouts: Bout[];
  dayKey: string;
  onRemove: (b: Bout, label: string) => void;
  onError: (m: string | null) => void;
}) {
  const done = bouts.find((b) => b.none != null) ?? null;
  return (
    <div className="row">
      <span className="flbl">Logged</span>
      <ToggleChip
        label={spec.habit.name}
        on={done != null}
        onToggle={() => {
          if (done) {
            onRemove(done, spec.habit.name);
            return;
          }
          const res = createBout({
            habit: spec.habit,
            day: dayKey,
            entryId: null,
            measures: [],
            range: null,
            measureless: true,
            cats: [],
          });
          onError(res.ok ? null : res.reason);
        }}
      />
      {/* The drawn `.unit` "boolean" is dropped, not translated: the 2026-07-13
          annotation sweep already struck Walking's explainer line, and the word
          names the pre-flavor-vocabulary concept the Glossary now calls
          MEASURELESS — which the strip's own eyebrow already says. */}
    </div>
  );
}

// ── 5 · Keyboard's board-only face + refresh/override ────────────────────────

/**
 * "You never type a Keyboard word count — only the board is logged." Picking a
 * board writes the day's count session with `source: derived`, carrying
 * Writing's current word total; the readout then offers the two controls that
 * were parked in 2026-07-23 "with the (unbuilt) logging UI".
 */
function BoardOnly({
  spec,
  data,
  dayKey,
  bouts,
  words: wordStore,
  queue,
  flushNow,
  onError,
}: {
  spec: StripSpec;
  data: DayData;
  dayKey: string;
  bouts: Bout[];
  /** Writing's running total for the day — what a `derived` count mirrors. */
  words: WordTotalStore;
  queue: (field: string, run: () => { ok: boolean; reason?: string }) => void;
  flushNow: () => void;
  onError: (m: string | null) => void;
}) {
  // The one subscriber — Writing keystrokes repaint exactly this component.
  const liveWritingWords = useSyncExternalStore(wordStore.subscribe, wordStore.get);
  const def = spec.categoricals[0];
  const bout = bouts.find((b) => b.count != null) ?? null;
  const stored_ = def ? (bout ? (bout.cats[def.key] ?? null) : null) : null;
  // Optimistic, like every other buffered field: the pick has not been written
  // yet, so the store cannot show it.
  const [picked, setPicked] = useState<string | null>(null);
  const chosen = picked ?? stored_;
  const pickBoard = (v: string) => {
    if (def == null) return;
    setPicked(v);
    queue("board", () => logBoard(spec.habit, dayKey, def.id, def.key, v, bout, data.catRowIds));
  };
  // A DERIVED count mirrors Writing live; an overridden one is its own number
  // and is never auto-touched (the 2026-07-23 ruling).
  // Optimistic, like every other buffered field: `bout.countDerived` cannot
  // flip until the override write lands, and until then the live mirror would
  // stomp the number the user just typed.
  const [detached, setDetached] = useState<boolean | null>(null);
  const following = detached != null ? !detached : (bout?.countDerived ?? true);
  const stored =
    following && liveWritingWords != null ? liveWritingWords : (bout?.count?.value ?? null);
  const [words, setWords] = useState<string>(stored == null ? "" : String(stored));
  useEffect(() => {
    setWords(stored == null ? "" : String(stored));
  }, [stored]);

  if (def == null) return null;
  return (
    <>
      <div className="row" style={{ alignItems: "flex-start" }}>
        {/* The FINAL draws "Which one"; user-ruled 2026-07-26 to name the
            thing being chosen. Definition-driven, so any future picklist on a
            derived-count habit labels itself. */}
        <span className="flbl">Select a {def.label}</span>
        <div className="kb">
          {def.vocab.map((v) => (
            <span
              key={v}
              className={v === chosen ? "on" : undefined}
              role="radio"
              aria-checked={v === chosen}
              tabIndex={0}
              onKeyDown={onActivate(() => pickBoard(v))}
              onClick={() => pickBoard(v)}
            >
              {v}
            </span>
          ))}
        </div>
      </div>

      {bout?.count != null && (
        <div className="row">
          <span className="flbl">{spec.habit.count_unit ?? "Count"}</span>
          {/* ONE FIELD, not two (user-ruled 2026-07-26). The count itself is the
              input: typing in it IS the override, which is exactly what the
              2026-07-23 derive ruling says a hand-edit does ("a hand-edit
              overrides it → manual, never auto-touched again"). Refresh puts it
              back on Writing. An earlier pass showed a read-only derived readout
              beside a separate override box — two controls for one number. */}
          <input
            className="inp num"
            inputMode="numeric"
            value={words}
            onChange={(e) => setWords(e.target.value)}
            onBlur={() => {
              const v = Number(words);
              if (words.trim() === "" || !Number.isFinite(v)) {
                setWords(String(bout.count?.value ?? 0));
                return;
              }
              if (v === (bout.count?.value ?? 0)) return;
              setDetached(true);
              const id = bout.count!.id;
              queue("override", () => overrideDerived(id, v));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <span className="unit">{bout.countDerived ? "follows Writing" : "overridden"}</span>
          {/* ALWAYS PRESENT (user-ruled 2026-07-27). It was conditional on the
              count being overridden — nothing to refresh otherwise — but that
              made it look like the only way to move the number, and a control
              that comes and goes is worse than one that is occasionally a
              no-op. */}
          <button
            className="btn-plain btn-sm"
            title="Re-derive from Writing's current total"
            onClick={() => {
              // Flush first, or the re-derive reads a Writing total that is
              // still sitting in the buffer. The tick is Evolu's mutation
              // microtask, same as the post-flush sync.
              setDetached(false);
              flushNow();
              setTimeout(() => {
                void refreshDerived(bout.count!.id, dayKey).then((r) =>
                  onError(r.ok ? null : r.reason),
                );
              }, 0);
            }}
          >
            <IRefresh />
            Refresh
          </button>
        </div>
      )}

      {bout == null && (
        <p className="fieldnote">
          Pick the board you used — the word count follows Writing automatically.
        </p>
      )}
    </>
  );
}

// ── A committed bout ─────────────────────────────────────────────────────────

function SessionBlock({
  index,
  bout,
  cats,
  entryId,
  spec,
  data,
  dayKey,
  entries,
  showEntry,
  queue,
  onOptimistic,
  onRemove,
  onError,
}: {
  index: number;
  bout: Bout;
  /** The bout's answers WITH anything still buffered laid over them. */
  cats: Readonly<Record<string, string>>;
  entryId: string | null;
  spec: StripSpec;
  data: DayData;
  dayKey: string;
  entries: DayEntry[];
  showEntry: boolean;
  /** Buffer a write against this bout's field. */
  queue: (field: string, run: () => { ok: boolean; reason?: string }) => void;
  /** Show it before it is written. */
  onOptimistic: (field: string, value: string) => void;
  onRemove: () => void;
  onError: (m: string | null) => void;
}) {
  // The range pair is held locally for the same reason the other fields get an
  // overlay: a buffered edit has not been written, so reading it back from the
  // bout would snap the field to its stored value mid-edit.
  const stored = {
    sd: bout.range?.start?.slice(0, 10) ?? "",
    st: bout.range?.start?.slice(11, 16) ?? "",
    ed: bout.range?.end?.slice(0, 10) ?? "",
    et: bout.range?.end?.slice(11, 16) ?? "",
  };
  const [range, setRange] = useState(stored);
  useEffect(() => {
    setRange({
      sd: bout.range?.start?.slice(0, 10) ?? "",
      st: bout.range?.start?.slice(11, 16) ?? "",
      ed: bout.range?.end?.slice(0, 10) ?? "",
      et: bout.range?.end?.slice(11, 16) ?? "",
    });
  }, [bout.range?.start, bout.range?.end]);

  return (
    <div className="sess">
      <div className="stag">
        <span>Session {index}</span>
        {/* Provenance is the CLOCK GLYPH ALONE (ruled 2026-07-13). A timer
            session is dismissed differently, so it carries no `remove`. */}
        {bout.fromTimer ? (
          <span className="src">
            <ITimer />
          </span>
        ) : (
          <span
            className="rm"
            role="button"
            tabIndex={0}
            onClick={onRemove}
            onKeyDown={onActivate(onRemove)}
          >
            <IX />
            remove
          </span>
        )}
      </div>

      {showEntry && (
        <EntryRow
          entries={entries}
          habit={spec.habit}
          value={entryId}
          onPick={(id) => {
            onOptimistic("entry", id);
            queue("entry", () => setBoutEntry(bout, id));
          }}
          onError={onError}
        />
      )}

      <CategoricalRows
        spec={spec}
        value={cats}
        onPick={(def, v) => {
          onOptimistic(def.key, v);
          queue(def.key, () => setBoutSubunit(bout, def.id, def.key, v, data.catRowIds));
        }}
      />

      {spec.isRange ? (
        <RangeRows
          spec={spec}
          startDate={range.sd}
          startTime={range.st}
          endDate={range.ed}
          endTime={range.et}
          onChange={(sd, st, ed, et) => {
            setRange({ sd, st, ed, et });
            if (bout.range == null || sd === "" || st === "" || ed === "" || et === "") return;
            const id = bout.range.id;
            queue("range", () =>
              updateRange(id, `${sd}T${st}`, `${ed}T${et}`, spec.habit.range_max_midnights ?? 0),
            );
          }}
        />
      ) : (
        spec.measures.length > 0 && (
          <div className="row">
            <span className="flbl">
              {spec.measures.length > 1
                ? "Measures"
                : spec.measures[0].kind === "time"
                  ? "Duration"
                  : spec.measures[0].unit}
            </span>
            {spec.measures.map((m) => {
              const row = m.kind === "time" ? bout.time : bout.count;
              return (
                <MeasureField
                  key={m.kind}
                  kind={m.kind}
                  unit={m.unit}
                  value={row?.value ?? null}
                  onCommit={(v) => {
                    if (row == null) {
                      // A measure the bout does not yet carry: add its row,
                      // sharing this bout's entry and categorical answers.
                      queue(`add-${m.kind}`, () =>
                        createBout({
                          habit: spec.habit,
                          day: dayKey,
                          entryId,
                          measures: [{ kind: m.kind, value: v }],
                          range: null,
                          measureless: false,
                          cats: spec.categoricals.flatMap((d) =>
                            cats[d.key] ? [{ definitionId: d.id, value: cats[d.key] }] : [],
                          ),
                        }),
                      );
                      return;
                    }
                    onOptimistic(`${m.kind}|measure`, String(v));
                    queue(`${m.kind}-value`, () => updateMeasureValue(row.id, v));
                  }}
                />
              );
            })}
          </div>
        )
      )}

      {spec.flags.length > 0 && (
        <FlagRows
          spec={spec}
          value={cats}
          onToggle={(def, on) => {
            const v = on ? "true" : "false";
            onOptimistic(def.key, v);
            queue(def.key, () => setBoutSubunit(bout, def.id, def.key, v, data.catRowIds));
          }}
        />
      )}
    </div>
  );
}

// ── An uncommitted draft ─────────────────────────────────────────────────────

function DraftBlock({
  index,
  draft,
  spec,
  entries,
  showEntry,
  onChange,
  onCommit,
  onDiscard,
  onError,
}: {
  index: number;
  draft: Draft;
  spec: StripSpec;
  entries: DayEntry[];
  showEntry: boolean;
  onChange: (d: Draft) => void;
  onCommit: (d: Draft) => boolean;
  onDiscard: () => void;
  onError: (m: string | null) => void;
}) {
  // A DRAFT COMMITS WHEN FOCUS LEAVES THE BLOCK, never when it leaves a field
  // (user-ruled 2026-07-26: "when I'm tabbing to another entry field, it
  // shouldn't be saving and throwing me out"). Committing per field made the
  // draft become a real session mid-tab, unmounting the block the caret was in.
  // Ruling 1 still holds — nothing is unsaved once you have left the bout.
  const discarding = useRef(false);
  const onBlurBlock = (e: React.FocusEvent<HTMLDivElement>) => {
    if (discarding.current) return;
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    onCommit(draft);
  };

  return (
    <div className="sess" onBlur={onBlurBlock}>
      <div className="stag">
        <span>Session {index}</span>
        {/* A draft that never committed needs no toast — discarding it writes
            nothing (ruling 4's parenthesis). `mousedown` beats the block's own
            blur, so discarding never races the commit it would undo. */}
        <span
          className="rm"
          role="button"
          tabIndex={0}
          onMouseDown={() => {
            discarding.current = true;
          }}
          onClick={onDiscard}
          onKeyDown={onActivate(() => {
            discarding.current = true;
            onDiscard();
          })}
        >
          <IX />
          remove
        </span>
      </div>

      {showEntry && (
        <EntryRow
          entries={entries}
          habit={spec.habit}
          value={draft.entryId}
          onPick={(id) => onChange({ ...draft, entryId: id })}
          onError={onError}
        />
      )}

      <CategoricalRows
        spec={spec}
        value={draft.cats}
        onPick={(def, v) => onChange({ ...draft, cats: { ...draft.cats, [def.key]: v } })}
      />

      {spec.isRange ? (
        <RangeRows
          spec={spec}
          startDate={draft.startDate}
          startTime={draft.startTime}
          endDate={draft.endDate}
          endTime={draft.endTime}
          onChange={(startDate, startTime, endDate, endTime) => {
            // No commit here either: the block's own blur owns that, so filling
            // the fourth part does not yank the block away mid-entry.
            onChange({ ...draft, startDate, startTime, endDate, endTime });
          }}
        />
      ) : (
        spec.measures.length > 0 && (
          <div className="row">
            <span className="flbl">
              {spec.measures.length > 1
                ? "Measures"
                : spec.measures[0].kind === "time"
                  ? "Duration"
                  : spec.measures[0].unit}
            </span>
            {spec.measures.map((m) => (
              <MeasureField
                key={m.kind}
                kind={m.kind}
                unit={m.unit}
                value={null}
                draftText={m.kind === "time" ? draft.time : draft.count}
                onDraftChange={(t) =>
                  onChange(m.kind === "time" ? { ...draft, time: t } : { ...draft, count: t })
                }
                onCommit={() => undefined}
              />
            ))}
          </div>
        )
      )}

      {spec.flags.length > 0 && (
        <FlagRows
          spec={spec}
          value={Object.fromEntries(
            Object.entries(draft.flags).map(([k, v]) => [k, v ? "true" : "false"]),
          )}
          onToggle={(def, on) => onChange({ ...draft, flags: { ...draft.flags, [def.key]: on } })}
        />
      )}
    </div>
  );
}

// ── Widgets ──────────────────────────────────────────────────────────────────

/**
 * kit-picker-entry. The closed face shows the picked title (with its inline
 * type tag only where the habit declares one); focus swaps to the type-ahead
 * face and drops the anchored popover-tier dropdown over the rows beneath —
 * `:focus-within`, the same script-free discipline as the <details> strips.
 * The NO-MATCH face IS the quick-create door.
 */
function EntryRow({
  entries,
  habit,
  value,
  onPick,
  onError,
}: {
  entries: DayEntry[];
  habit: SpineHabit;
  value: string | null;
  onPick: (id: string) => void;
  onError: (m: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  // "↑↓ move the highlight (--hover-wash), Enter picks, Esc closes" — the frozen
  // picker amendment's own words. The highlight is a POSITION in the result
  // list, which is why `.pk-row.on` tracks it rather than the picked entry.
  const [cursor, setCursor] = useState(0);
  // Closing is a STATE, not a blur: the field keeps focus and its place in the
  // tab order, so Tab goes on to the next field and Shift+Tab comes back here.
  const [shut, setShut] = useState(false);
  const picked = entries.find((e) => e.id === value) ?? null;
  const q = query.trim().toLowerCase();
  const matches = q === "" ? entries.slice(0, 8) : entries.filter((e) => e.title.toLowerCase().includes(q)).slice(0, 8);
  const exact = entries.some((e) => e.title.trim().toLowerCase() === q);

  const create = () => {
    const res = quickCreateEntry(habit, habit.entry_attributes, query);
    if (!res.ok) {
      onError(res.reason);
      return;
    }
    onError(null);
    onPick(res.id);
    setQuery("");
  };

  return (
    <div className="row">
      <span className="flbl">Title</span>
      <span
        className={`picker pk-live${shut ? " shut" : ""}`}
        onMouseDown={(e) => {
          setShut(false);
          focusFieldWithin(e, ".pkin");
        }}
      >
        <ISearch />
        {/* The frozen file's `.face-rest`/`.face-open` swap is NOT reproduced:
            it hides the open face until `:focus-within`, and a hidden input can
            never take the focus that would reveal it. A mockup with no live
            input could afford that; the app cannot. So the picked title and the
            type-ahead field stand together, and `:focus-within` keeps its real
            job — dropping the anchored panel. */}
        {picked != null && (
          <>
            <span className="val">{picked.title}</span>
            {picked.type != null && <span className="type">{picked.type}</span>}
          </>
        )}
        <input
          className="pkin"
          value={query}
          placeholder={picked == null ? "Type to search titles…" : ""}
          onFocus={() => setShut(false)}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
            setShut(false);
          }}
          onKeyDown={(e) => {
            const last = matches.length - 1;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setShut(false);
              setCursor((c) => (shut ? c : Math.min(last < 0 ? 0 : last, c + 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setShut(false);
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const hit = matches[cursor];
              if (hit != null) {
                onPick(hit.id);
                setQuery("");
                setShut(true);
              } else if (q !== "" && !exact) {
                create();
                setShut(true);
              }
            } else if (e.key === "Escape") {
              e.preventDefault();
              setShut(true);
            }
          }}
        />
        <div className="pkdrop">
          {matches.map((e, i) => (
            <div
              key={e.id}
              className={`pk-row${i === cursor ? " on" : ""}`}
              onMouseDown={(ev) => {
                ev.preventDefault();
                // The wrapper's own mousedown re-opens (`setShut(false)`) and
                // runs AFTER this one — a pick must not bubble into it, or the
                // panel it just closed snaps straight back open.
                ev.stopPropagation();
                onPick(e.id);
                setQuery("");
                setShut(true);
              }}
            >
              <span className="pk-t">{e.title}</span>
              {e.type != null && <span className="pk-type">{e.type}</span>}
            </div>
          ))}
          {matches.length === 0 && <div className="pk-none">No titles match “{query}”.</div>}
          {q !== "" && !exact && (
            <div
              className="pk-new"
              onMouseDown={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                create();
                setShut(true);
              }}
            >
              <IPlus />
              Create “{query.trim()}”
              <span className="hint">title-only stub · enrich later on its dashboard</span>
            </div>
          )}
        </div>
      </span>
    </div>
  );
}

/**
 * Session-scope picklists. ONE declared picklist renders as a plain select row;
 * TWO OR MORE render as the drawn Writing face — a segmented "which one" plus
 * the dependent select — because they are alternatives, not co-fields. Both
 * faces fall out of the count of declarations; neither names a habit.
 */
function CategoricalRows({
  spec,
  value,
  onPick,
}: {
  spec: StripSpec;
  value: Readonly<Record<string, string>>;
  onPick: (def: SpineDefinition, v: string) => void;
}) {
  const defs = spec.categoricals;
  const active = defs.find((d) => value[d.key]) ?? defs[0];
  const [pickedDef, setPickedDef] = useState<string | null>(null);
  if (defs.length === 0) return null;
  const current = defs.find((d) => d.key === pickedDef) ?? active;

  if (defs.length === 1) {
    const def = defs[0];
    return (
      <div className="row">
        <span className="flbl">{def.label}</span>
        <VocabSelect def={def} value={value[def.key] ?? ""} onPick={(v) => onPick(def, v)} />
      </div>
    );
  }

  return (
    <div className="row">
      <span className="flbl">Kind</span>
      {/* The drawn `.seg` is a one-of-N switch — which declared categorical this
          bout is answering (Writing's Stage vs Wiki). It is a RADIO GROUP, so it
          takes one Tab stop and the arrows move within it, per the usual
          pattern; the corpus draws it as bare spans because a mockup has no
          behaviour to give them. Switching writes nothing: it only swaps which
          picklist the field below is showing. */}
      <span className="seg" role="radiogroup" aria-label="Which one">
        {defs.map((d, i) => (
          <span
            key={d.key}
            role="radio"
            aria-checked={d.key === current.key}
            tabIndex={d.key === current.key ? 0 : -1}
            className={d.key === current.key ? "on" : undefined}
            onClick={() => setPickedDef(d.key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setPickedDef(d.key);
                return;
              }
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const step = e.key === "ArrowRight" ? 1 : defs.length - 1;
              const nextIndex = (i + step) % defs.length;
              setPickedDef(defs[nextIndex].key);
              const sibling = e.currentTarget.parentElement?.children[nextIndex];
              if (sibling instanceof HTMLElement) sibling.focus();
            }}
          >
            {d.label}
          </span>
        ))}
      </span>
      <span className="dep">
        <IArrow />
        <VocabSelect
          def={current}
          value={value[current.key] ?? ""}
          onPick={(v) => onPick(current, v)}
        />
      </span>
    </div>
  );
}

/**
 * A picklist, wearing the app's OWN dropdown rather than a native `<select>`
 * (user-ruled 2026-07-26: the native menu "doesn't match the rest of the app").
 * It is the entry picker's `.pkdrop` — a field-anchored popover-tier panel
 * opened by `:focus-within`, the same script-free discipline the strips use —
 * hung under the drawn `.inp.sel` chip the FINAL already draws for this field.
 * So this borrows a face the corpus has, instead of inventing one.
 */
function VocabSelect({
  def,
  value,
  onPick,
}: {
  def: SpineDefinition;
  value: string;
  onPick: (v: string) => void;
}) {
  const at = Math.max(0, def.vocab.indexOf(value));
  const [cursor, setCursor] = useState(at);
  const [shut, setShut] = useState(false);
  // The ruled quick-add ("+ New value" inside the picklist — logging never
  // dead-ends on a missing value). The row flips to an inline input; commit
  // reuses an existing value case-insensitively (canonical casing wins) or
  // mints the new one and picks it.
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState("");
  const nearMatch =
    newVal.trim() !== ""
      ? (def.vocab.find(
          (e) => e.toLowerCase() === newVal.trim().toLowerCase() && e !== newVal.trim(),
        ) ?? null)
      : null;
  const commitNew = () => {
    const picked = quickAddVocabValue(def.id as never, def.vocab, newVal);
    setAdding(false);
    setNewVal("");
    if (picked != null) {
      onPick(picked);
      setShut(true);
    }
  };
  return (
    <span
      className={`inp sel pk-live${shut ? " shut" : ""}`}
      tabIndex={0}
      role="listbox"
      onMouseDown={() => setShut(false)}
      onFocus={() => {
        setCursor(Math.max(0, def.vocab.indexOf(value)));
        setShut(false);
      }}
      onKeyDown={(e) => {
        const last = def.vocab.length - 1;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setShut(false);
          setCursor((c) => (shut ? c : Math.min(last, c + 1)));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setShut(false);
          setCursor((c) => Math.max(0, c - 1));
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const hit = def.vocab[cursor];
          if (hit != null) {
            onPick(hit);
            setShut(true);
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          setShut(true);
        }
      }}
    >
      <span className={value === "" ? "cap" : undefined}>{value === "" ? "—" : value}</span>
      <IChevDown />
      <div className="pkdrop">
        {def.vocab.map((v, i) => (
          <div
            key={v}
            className={`pk-row${i === cursor ? " on" : ""}`}
            role="option"
            aria-selected={v === value}
            onMouseDown={(e) => {
              e.preventDefault();
              // Never bubble into the wrapper's re-opening mousedown (see the
              // entry picker's rows) — it would override this close.
              e.stopPropagation();
              onPick(v);
              setShut(true);
            }}
          >
            <span className="pk-t">{v}</span>
          </div>
        ))}
        {def.vocab.length === 0 && !adding && <div className="pk-none">No values yet.</div>}
        {!adding ? (
          <div
            className="pk-new"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setAdding(true);
            }}
          >
            <IPlus />
            New value
          </div>
        ) : (
          <div className="pk-new" onMouseDown={(e) => e.stopPropagation()}>
            <input
              className="pk-newin"
              value={newVal}
              placeholder="New value"
              spellCheck={false}
              autoFocus
              onChange={(e) => setNewVal(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitNew();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setAdding(false);
                  setNewVal("");
                }
              }}
              onBlur={() => {
                setAdding(false);
                setNewVal("");
              }}
            />
            {/* ASCII ONLY, deliberately: this string is read through whatever
                font the active theme registers, and the minted seats include
                full-pixel display faces that carry no curly quotes and no
                em-dash — a missing glyph draws an empty box, not a fallback. */}
            {nearMatch != null && (
              <span className="hint">"{nearMatch}" exists - Enter picks it</span>
            )}
          </div>
        )}
      </div>
    </span>
  );
}

/** Session-scope flags — the non-derivable stored ones (Sleep's `Med`). */
function FlagRows({
  spec,
  value,
  onToggle,
}: {
  spec: StripSpec;
  value: Readonly<Record<string, string>>;
  onToggle: (def: SpineDefinition, on: boolean) => void;
}) {
  return (
    <>
      {spec.flags.map((def) => {
        const on = value[def.key] === "true";
        return (
          <div className="row" key={def.key}>
            <span className="flbl">{def.label}</span>
            <ToggleChip
              label={`Took ${def.label.toLowerCase()}`}
              on={on}
              onToggle={() => onToggle(def, !on)}
            />
          </div>
        );
      })}
    </>
  );
}

/** A numeric measure. The unit slot reads back the h/m rendering when set. */
function MeasureField({
  kind,
  unit,
  value,
  draftText,
  onDraftChange,
  onCommit,
}: {
  kind: "time" | "count";
  unit: string;
  value: number | null;
  draftText?: string;
  onDraftChange?: (t: string) => void;
  onCommit: (v: number) => void;
}) {
  const controlled = draftText != null;
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => {
    if (!controlled) setText(value == null ? "" : String(value));
  }, [value, controlled]);
  const shown = controlled ? draftText : text;
  const asNumber = Number(shown);
  const hint =
    kind === "time" && shown !== "" && Number.isFinite(asNumber) ? minutesHint(asNumber) : unit;

  return (
    <>
      <input
        className={`inp num${shown === "" ? " ph" : ""}`}
        inputMode="numeric"
        placeholder="0"
        value={shown}
        onChange={(e) => (controlled ? onDraftChange?.(e.target.value) : setText(e.target.value))}
        onBlur={() => {
          // A field commits as you leave it (ruling 1). A cleared field REVERTS
          // to the stored value: removal is the `remove` control's job, so a
          // stray keystroke can never delete a session.
          if (shown.trim() === "") {
            if (!controlled) setText(value == null ? "" : String(value));
            return;
          }
          const v = Number(shown);
          if (!Number.isFinite(v)) return;
          if (!controlled && v === value) return;
          onCommit(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <span className="unit">{hint}</span>
    </>
  );
}

/**
 * The range pair + the derived readout. `derived_rules` is DATA; the results
 * below are computed here and never stored — the same two templates the range
 * dashboard evaluates, read for one session.
 */
function RangeRows({
  spec,
  startDate,
  startTime,
  endDate,
  endTime,
  onChange,
}: {
  spec: StripSpec;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  onChange: (startDate: string, startTime: string, endDate: string, endTime: string) => void;
}) {
  const whole = startDate && startTime && endDate && endTime;
  const readout = whole
    ? derivedReadout(`${startDate}T${startTime}`, `${endDate}T${endTime}`, spec.derivedRules)
    : [];
  return (
    <>
      <div className="row">
        <span className="flbl">Bedtime</span>
        <DateTimePicker
          date={startDate}
          time={startTime}
          onChange={(d, t) => onChange(d, t, endDate, endTime)}
        />
      </div>
      <div className="row">
        <span className="flbl">Wake</span>
        <DateTimePicker
          date={endDate}
          time={endTime}
          onChange={(d, t) => onChange(startDate, startTime, d, t)}
        />
      </div>
      {readout.length > 0 && (
        <div className="row">
          <span className="flbl">Derived</span>
          <span className="derived">
            {readout.map((r) =>
              r.isFlag ? (
                <span className="flag" key={r.label}>
                  {r.label} <b>{r.value}</b>
                </span>
              ) : (
                <span key={r.label}>
                  {r.label} <b>{r.value}</b>
                </span>
              ),
            )}
          </span>
        </div>
      )}
    </>
  );
}
