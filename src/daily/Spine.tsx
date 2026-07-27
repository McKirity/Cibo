/**
 * DAILY — THE FORM SPINE. Translated from `Final/daily-state-1.html`'s
 * `.col.spine`; the CSS was already claimed into `daily.css` (~427–705), so this
 * file is markup and logic only.
 *
 * The five rulings it implements (owning record: the screen note
 * § Amended 2026-07-26 (2nd) — read that before changing anything here):
 *
 *  1 · FINALIZE IS THE ONLY OFFICIAL SAVE. The strips are a LIVE EDITOR over the
 *      day's real sessions — a field commits as you leave it, so nothing is ever
 *      "unsaved". Finalize is the state change into state 2, not a submit, and
 *      it stays inert until state 2 is built.
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
import { useEffect, useMemo, useRef, useState } from "react";
import { showErrorToast, showUndoToast } from "../shell/toast";
import { useMilestoneDay } from "./useMilestoneDay";
import {
  buildStripSpec,
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
import {
  clearDay,
  createBout,
  logBoard,
  overrideDerived,
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
 * Dismiss whatever popover is open. Every dropdown here shows on
 * `:focus-within`, so releasing focus IS the close — user-ruled 2026-07-26:
 * "when I select something from the dropdown menus, it should close it
 * automatically instead of forcing me to click elsewhere."
 */
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

const nowLocalDateTime = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// ── The spine ────────────────────────────────────────────────────────────────

export function Spine({ dayKey }: { dayKey: string }) {
  const data = useDayData(dayKey);
  const [confirmClear, setConfirmClear] = useState(false);
  // Bumped by Clear all so every strip remounts: their drafts are local state,
  // and a cleared day should open each habit on a fresh empty session again.
  const [formEpoch, setFormEpoch] = useState(0);
  // Day-scoped and therefore tiny: what the banner needs to know is "did today's
  // rows change", not "did anything anywhere change".
  const revision = useMemo(
    () => data.sessions.map((s) => `${s.id}:${s.value}:${s.start}:${s.end}`).join("|"),
    [data.sessions],
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
              />
            ))
          )}

          <FinalizeButton dayKey={dayKey} finalized={data.dayRow?.finalized ?? false} />

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
  return (
    <div className="emptybox">
      <div className="eh">No active habits</div>
      <div className="es">Activate your seeded habits or create new ones to start logging days.</div>
      <div style={{ display: "flex", gap: "var(--space-4)", justifyContent: "center" }}>
        <button className="btn-accent" aria-disabled="true">
          Settings → Habits
        </button>
        <button className="btn-plain" aria-disabled="true">
          New habit
        </button>
      </div>
    </div>
  );
}

/**
 * kit-control-finalize — the day's closing gesture, NOT a submit (ruling 1).
 * Inert until state 2 exists: it would write the `days` ledger and swap the
 * screen for the cover wall, and there is no cover wall yet.
 */
function FinalizeButton({ dayKey, finalized }: { dayKey: string; finalized: boolean }) {
  return (
    <button
      className="finalize"
      aria-disabled="true"
      title="Finalize turns the day into its cover wall — state 2, the next slice."
      onClick={() => {
        showErrorToast(
          finalized
            ? `${dayKey} is already finalized — the cover wall is the next slice.`
            : "Finalize lands with the cover wall (state 2).",
        );
      }}
    >
      <IFinalize />
      Finalize
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
}

function Strip({ spec, data, dayKey }: StripProps) {
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

  const dropDraft = (key: number) => setDrafts((d) => d.filter((x) => x.key !== key));

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
    const res = createBout({
      habit,
      day: dayKey,
      entryId: draft.entryId,
      measures,
      range,
      measureless: spec.isMeasureless,
      cats,
    });
    if (!res.ok) {
      setError(res.reason);
      return false;
    }
    setError(null);
    dropDraft(draft.key);
    return true;
  };

  const remove = (bout: Bout, label: string) => {
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
          <BoardOnly spec={spec} data={data} dayKey={dayKey} bouts={bouts} onError={setError} />
        ) : (
          <>
            {bouts.map((bout, i) => (
              <SessionBlock
                key={bout.key}
                index={i + 1}
                bout={bout}
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
  onError,
}: {
  spec: StripSpec;
  data: DayData;
  dayKey: string;
  bouts: Bout[];
  onError: (m: string | null) => void;
}) {
  const def = spec.categoricals[0];
  const bout = bouts.find((b) => b.count != null) ?? null;
  const chosen = def ? (bout ? (bout.cats[def.key] ?? null) : null) : null;
  const stored = bout?.count?.value ?? null;
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
              onKeyDown={onActivate(() => {
                void logBoard(spec.habit, dayKey, def.id, def.key, v, bout, data.catRowIds).then(
                  (r) => onError(r.ok ? null : r.reason),
                );
              })}
              onClick={() => {
                void logBoard(spec.habit, dayKey, def.id, def.key, v, bout, data.catRowIds).then(
                  (r) => onError(r.ok ? null : r.reason),
                );
              }}
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
              const r = overrideDerived(bout.count!.id, v);
              onError(r.ok ? null : r.reason);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <span className="unit">{bout.countDerived ? "follows Writing" : "overridden"}</span>
          {!bout.countDerived && (
            <button
              className="btn-plain btn-sm"
              title="Re-derive from Writing's current total"
              onClick={() => {
                void refreshDerived(bout.count!.id, dayKey).then((r) =>
                  onError(r.ok ? null : r.reason),
                );
              }}
            >
              <IRefresh />
              Refresh
            </button>
          )}
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
  spec,
  data,
  dayKey,
  entries,
  showEntry,
  onRemove,
  onError,
}: {
  index: number;
  bout: Bout;
  spec: StripSpec;
  data: DayData;
  dayKey: string;
  entries: DayEntry[];
  showEntry: boolean;
  onRemove: () => void;
  onError: (m: string | null) => void;
}) {
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
          value={bout.entryId}
          onPick={(id) => {
            const r = setBoutEntry(bout, id);
            onError(r.ok ? null : r.reason);
          }}
          onError={onError}
        />
      )}

      <CategoricalRows
        spec={spec}
        value={bout.cats}
        onPick={(def, v) => {
          const r = setBoutSubunit(bout, def.id, def.key, v, data.catRowIds);
          onError(r.ok ? null : r.reason);
        }}
      />

      {spec.isRange ? (
        <RangeRows
          spec={spec}
          startDate={bout.range?.start?.slice(0, 10) ?? ""}
          startTime={bout.range?.start?.slice(11, 16) ?? ""}
          endDate={bout.range?.end?.slice(0, 10) ?? ""}
          endTime={bout.range?.end?.slice(11, 16) ?? ""}
          onChange={(sd, st, ed, et) => {
            if (bout.range == null || sd === "" || st === "" || ed === "" || et === "") return;
            const r = updateRange(
              bout.range.id,
              `${sd}T${st}`,
              `${ed}T${et}`,
              spec.habit.range_max_midnights ?? 0,
            );
            onError(r.ok ? null : r.reason);
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
                      const res = createBout({
                        habit: spec.habit,
                        day: dayKey,
                        entryId: bout.entryId,
                        measures: [{ kind: m.kind, value: v }],
                        range: null,
                        measureless: false,
                        cats: spec.categoricals.flatMap((d) =>
                          bout.cats[d.key] ? [{ definitionId: d.id, value: bout.cats[d.key] }] : [],
                        ),
                      });
                      onError(res.ok ? null : res.reason);
                      return;
                    }
                    const r = updateMeasureValue(row.id, v, {
                      habitKey: spec.habit.key,
                      measure: m.kind,
                      day: dayKey,
                    });
                    onError(r.ok ? null : r.reason);
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
          value={bout.cats}
          onToggle={(def, on) => {
            const r = setBoutSubunit(bout, def.id, def.key, on ? "true" : "false", data.catRowIds);
            onError(r.ok ? null : r.reason);
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
              onPick(v);
              setShut(true);
            }}
          >
            <span className="pk-t">{v}</span>
          </div>
        ))}
        {def.vocab.length === 0 && <div className="pk-none">No values yet.</div>}
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

export { nowLocalDateTime };
