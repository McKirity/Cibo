/**
 * THE NAV CALENDAR — the rail's month grid (Build step 9, 2026-08-01),
 * translated from `Final/frame.html` § nav calendar. Its CSS is shell.css's
 * `.rail .cal` family, claimed with it.
 *
 * The ruling it serves ([[Calendar & Whimsy]] § the month grid · [[Nav Rail]]):
 * the calendar is NOT a destination — it has no nav entry and it IS the
 * navigation for the cadence dashboards, which have no doors of their own.
 * So every label here is a door: year · quarter · month · week · day.
 *
 * Three laws are load-bearing in the cell logic below, and each is easy to
 * break silently:
 *  · **An empty past day is a DOOR, never a queue member.** Back-dating is
 *    first-class, so a day with no bookkeeping row is reachable and hoverable —
 *    it just carries no marker. Only the sparse `days` ledger decides catch-up
 *    membership, and that is a different question from "is this clickable".
 *  · **Empty is not future.** A day ahead of today is a DEAD ROUTE: drawn
 *    faintest, `pointer-events:none`, and refused again at `openDay` (which
 *    re-reads `todayLocal()` at click time — the render-captured date is stale
 *    across midnight).
 *  · **Markings read the ledger, not the sessions.** `finalized` is the sole
 *    finalize truth; a row exists once a day has bookkeeping of any kind.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { DateOnly } from "../db/schema";
import { catchUpDays, unfinalizedQuery } from "../daily/catchUp";
import { useDismiss } from "./overlayHooks";
import { Ico, ICONS } from "./icons";
import { dayFromIndex, dayIndex, weekDayLetters, weekNum, weekStart } from "../metrics/dates";
import { quarterOf, type CadenceScale } from "../metrics/cadence";
import { MONTHS_LONG, MONTHS_SHORT } from "../metrics/format";


/* Header letters follow the configured week start (dates.weekDayLetters). */

/** The calendar icon of the Jump control, verbatim from the frozen frame. */
const JUMP_ICON = [
  "M21 12V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5.6",
  "M16 2v4",
  "M8 2v4",
  "M3 10h18",
];

/** The 1st of the month `delta` months from `anchor` — Date.UTC rolls the year
 *  over for us, so December + 1 lands on the next January without a special
 *  case. Always the 1st: the anchor only ever names a MONTH here. */
function stepMonth(anchor: string, delta: number): string {
  const y = Number(anchor.slice(0, 4));
  const m = Number(anchor.slice(5, 7));
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** One rendered cell. `inMonth` false = a spill day from a neighbouring month. */
interface Cell {
  day: string;
  num: number;
  inMonth: boolean;
}

/** The six-ish week rows a month spans, week-start first (the configured
 *  dial), spill days included. */
function monthGrid(anchor: string): {
  weeks: Cell[][];
  from: string;
  to: string;
} {
  const y = Number(anchor.slice(0, 4));
  const m = Number(anchor.slice(5, 7));
  const first = `${anchor.slice(0, 7)}-01`;
  const lastDom = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${anchor.slice(0, 7)}-${String(lastDom).padStart(2, "0")}`;
  const startIdx = dayIndex(weekStart(first));
  // Through the END of the week holding the last day — +6 from its start.
  const endIdx = dayIndex(weekStart(last)) + 6;
  const weeks: Cell[][] = [];
  for (let i = startIdx; i <= endIdx; i += 7) {
    const row: Cell[] = [];
    for (let d = 0; d < 7; d++) {
      const day = dayFromIndex(i + d);
      row.push({
        day,
        num: Number(day.slice(8, 10)),
        inMonth: day.slice(0, 7) === anchor.slice(0, 7),
      });
    }
    weeks.push(row);
  }
  return { weeks, from: dayFromIndex(startIdx), to: dayFromIndex(endIdx) };
}

export function NavCalendar({
  today,
  viewingDay,
  openDay,
  onCadence,
}: {
  today: string;
  /**
   * The day the Daily screen is currently showing, when it is showing one — the
   * "you are here" marker (user-ruled 2026-08-09).
   *
   * The grid drew `today` and nothing else, so it could never say which day you
   * were LOOKING at. That gap existed on every back-dated visit; the day-cutoff
   * walk is merely what made it visible, because with a cutoff set the app OPENS
   * on a day the rail is not pointing at (the form read Aug 8 while the rail lit
   * Aug 9 — both correct, and together confusing).
   */
  viewingDay?: string | null;
  openDay: (day: string) => void;
  onCadence: (scale: CadenceScale, anchor: string) => void;
}) {
  // The displayed month, today's at mount. TWO controls move it: the header
  // chevrons for near targets (user-ruled 2026-08-01, reversing the frozen
  // face's Jump-only navigation) and Jump for far ones — which is still the
  // ruled year → month narrowing prompt, unchanged.
  const [anchor, setAnchor] = useState(today);
  // Which way the month last moved — the grid's entrance animation is
  // directional for a step and a cross-fade for a jump (the census lists
  // "advance + jump" together; only one of them has a direction).
  const [step, setStep] = useState<"next" | "prev" | "jump" | null>(null);
  const goMonth = (delta: number) => {
    setStep(delta > 0 ? "next" : "prev");
    setAnchor((a) => stepMonth(a, delta));
  };
  const [jumpOpen, setJumpOpen] = useState(false);
  const jumpBtn = useRef<HTMLButtonElement>(null);
  const { weeks, from, to } = useMemo(() => monthGrid(anchor), [anchor]);

  // The ledger slice under the grid — bounded to the visible range, so this
  // stays a small query however far the store grows. A day is FINALIZED, or
  // UNFINALIZED (a row exists, bookkeeping happened, finalize did not), or has
  // no row at all — the three states the markings draw.
  const ledgerQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("days")
          .select(["date", "finalized"])
          .where("isDeleted", "is not", 1)
          .where("date", ">=", DateOnly.orThrow(from))
          .where("date", "<=", DateOnly.orThrow(to)),
      ),
    [from, to],
  );
  const ledger = useQuery(ledgerQuery);
  const marks = useMemo(() => {
    const m = new Map<string, boolean>(); // day → finalized
    for (const row of ledger)
      if (row.date != null) m.set(String(row.date), row.finalized === 1);
    return m;
  }, [ledger]);

  const monthLabel = MONTHS_LONG[Number(anchor.slice(5, 7)) - 1];
  const year = anchor.slice(0, 4);

  return (
    <>
      <div className="calhead">
        <div className="chain">
          <button
            className="doorlink"
            onClick={() => onCadence("year", anchor)}
          >
            {year}
          </button>
          <button
            className="doorlink"
            onClick={() => onCadence("quarter", anchor)}
          >
            Q{quarterOf(anchor)}
          </button>
        </div>
        {/* The wrapper is the dismiss guard's containment root: without it the
            guard contains against `.calhead`, and clicking the month label
            would navigate while leaving the picker hanging open. It is also
            the grid item the `auto` column sizes to. */}
        <div className="jumpwrap">
          <button
            ref={jumpBtn}
            className="jump"
            onClick={() => setJumpOpen((o) => !o)}
            title="Jump to a period"
          >
            <Ico d={JUMP_ICON} size={14} />
            Jump
          </button>
          {jumpOpen && (
            <JumpPicker
              anchor={anchor}
              btn={jumpBtn}
              onPick={(day) => {
                setStep("jump");
                setAnchor(day);
                setJumpOpen(false);
              }}
              onYear={(y) => {
                setJumpOpen(false);
                onCadence("year", `${y}-01-01`);
              }}
              onClose={() => setJumpOpen(false)}
            />
          )}
        </div>
        {/* MONTH STEPPERS — user-ruled 2026-08-01: "I also want chevrons by the
            month header to navigate between months without needing to open
            jump." This REVERSES the frozen face, which deliberately draws no
            prev/next control and leaves Jump as the whole of month navigation.
            Jump stays for far targets (the ruled narrowing prompt); the
            chevrons are the near ones. They also answer the no-way-home
            problem flagged when Jump landed — stepping back to the current
            month no longer means opening a picker. */}
        <div className="monthrow">
          <button
            className="mstep"
            aria-label="Previous month"
            onClick={() => goMonth(-1)}
          >
            <Ico d={ICONS.chevronLeft} size={16} />
          </button>
          <button
            className="month doorlink"
            onClick={() => onCadence("month", anchor)}
          >
            {monthLabel}
          </button>
          <button
            className="mstep"
            aria-label="Next month"
            onClick={() => goMonth(1)}
          >
            <Ico d={ICONS.chevronRight} size={16} />
          </button>
          {/* BACK TO TODAY — user-ruled 2026-08-04 (the completeness audit,
              option A): appears ONLY when the viewed month is not the current
              one, and snaps home. Closes the "no one-click return" gap the
              Jump work surfaced and deliberately left for a user call. */}
          {anchor.slice(0, 7) !== today.slice(0, 7) && (
            <button
              className="mstep mtoday"
              aria-label="Back to the current month"
              title="Back to the current month"
              onClick={() => {
                setStep("jump");
                setAnchor(today);
              }}
            >
              <Ico d={TODAY_ICON} size={16} />
            </button>
          )}
        </div>
      </div>

      {/* `key` is the MONTH, not the anchor day: remounting is what replays
          the CSS entrance, and it must fire once per month change rather than
          on every anchor value. */}
      <div className={`cal${step != null ? ` step-${step}` : ""}`} key={anchor.slice(0, 7)}>
        <div className="wk" />
        {weekDayLetters().map((d, i) => (
          <div className="dow" key={i}>
            {d}
          </div>
        ))}

        {weeks.map((row) => {
          const monday = row[0].day; // the week-START day (Monday by default)
          const { week } = weekNum(monday);
          // "The current week's label is highlighted" — the week holding today,
          // not the week of the anchored month, so it lights only on the month
          // you are actually in.
          const isCurrentWeek = weekStart(today) === monday;
          return (
            <Row
              key={monday}
              monday={monday}
              week={week}
              current={isCurrentWeek}
              cells={row}
              today={today}
              viewingDay={viewingDay}
              marks={marks}
              openDay={openDay}
              onCadence={onCadence}
            />
          );
        })}
      </div>

      <CatchUpFlag today={today} openDay={openDay} />
    </>
  );
}

/**
 * THE JUMP PICKER — the FAR-target re-anchor control. It was the whole of
 * month navigation when built (the frozen grid draws no prev/next arrows), but
 * the header chevrons joined 2026-08-01 (user-ruled, reversing the Jump-only
 * face) and back-to-today 2026-08-04 — Jump now owns only the far targets.
 *
 * The ruling's shape is a **narrowing prompt: year → month**, which is what
 * the two tiers here are — step the year, then pick a month. The year label is
 * itself a door to that year's dashboard: the frozen face styles it with the
 * dotted-underline doorlink idiom, and every label on this widget is a door.
 *
 * Each month chip carries its seasonally-anchored month colour from the 34-slot
 * registry (`--month-jan` … `--month-dec`) — the one place in the rail those
 * dials surface.
 */
/* Month names, abbreviations and chevrons all come from the shared rosters
   (metrics/format · shell/icons) since 2026-08-04 — this file hand-transcribed
   three month tables and both chevron paths, having landed at step 9 after the
   dedup pass that routed everyone else through them. */
/** A target: ring + centre dot — "back to the current month". */
const TODAY_ICON = ["M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0", "M12 12h.01"];

function JumpPicker({
  anchor,
  btn,
  onPick,
  onYear,
  onClose,
}: {
  anchor: string;
  btn: RefObject<HTMLButtonElement | null>;
  onPick: (day: string) => void;
  onYear: (year: number) => void;
  onClose: () => void;
}) {
  const [year, setYear] = useState(Number(anchor.slice(0, 4)));
  const ref = useRef<HTMLDivElement>(null);
  // `ignore: btn`, not `parentRoot` — the panel is PORTALED to document.body
  // (below), so its DOM parent no longer contains the trigger; `parentRoot`
  // against <body> would make the whole page the containment zone and the
  // panel undismissable (the `pickers-1` fault). The detached-trigger option
  // exists for exactly this shape.
  useDismiss(ref, onClose, { ignore: btn });
  const rect = useAnchorRect(btn, true);
  // Above the early return, like every hook in this file — the hook-order crash
  // of 2026-08-04 was exactly one of these sitting below one.
  const panelHeight = usePanelHeight(ref, rect != null);
  if (rect == null) return null;
  const curMonth = Number(anchor.slice(5, 7));
  const curYear = Number(anchor.slice(0, 4));
  // PORTALED OUT OF THE RAIL (2026-08-17, Mac). `position: fixed` was supposed
  // to escape the rail's `overflow: hidden auto` clip, and on Windows
  // (Chromium) it does. On macOS WebKit the panel rendered clipped at the
  // rail's edge — reading as "hidden beneath the main pane" — so the panel now
  // mounts at document.body, where no rail ancestry (scroller, stacking
  // context, transform transition) can reach it on any engine. The fixed
  // coordinates are viewport-relative and unchanged. Theme exposure checked
  // 2026-08-17: every seat styles `.jumppop`/`.catchpop` at class scope, none
  // under `.rail`, so no theme rule is stranded by the move.
  return createPortal(
    <div
      ref={ref}
      className="jumppop"
      role="dialog"
      aria-label="Jump to a period"
      style={{ left: rect.left, top: clampToViewport(rect.bottom + 8, panelHeight) }}
    >
      <div className="jump-head">
        <button
          className="jump-step"
          aria-label="Previous year"
          onClick={() => setYear(year - 1)}
        >
          <Ico d={ICONS.chevronLeft} size={16} />
        </button>
        <button
          className="yr"
          onClick={() => onYear(year)}
          title={`Open ${year}`}
        >
          {year}
        </button>
        <button
          className="jump-step"
          aria-label="Next year"
          onClick={() => setYear(year + 1)}
        >
          <Ico d={ICONS.chevronRight} size={16} />
        </button>
      </div>
      <div className="jump-grid">
        {MONTHS_SHORT.map((label, i) => (
          <button
            key={label}
            className={`jump-m${year === curYear && i + 1 === curMonth ? " cur" : ""}`}
            onClick={() =>
              onPick(`${year}-${String(i + 1).padStart(2, "0")}-01`)
            }
          >
            <span
              className="md"
              style={{ background: `var(--month-${label.toLowerCase()})` }}
            />
            {label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

/**
 * THE CATCH-UP FLAG + its queue popover — the queue's other door (Daily's card
 * is the first; both read `catchUp.ts`'s one query).
 *
 * It is a **labelled button, not a bare dot** — ruled 2026-07-09, when the two
 * attention-badge tenants were settled: they share the DOT TOKEN, never an
 * anatomy. So the dot here is `--dot-size`/`--attention-dot` exactly as the
 * titlebar's restore badge will be, and everything around it is this button's
 * own business.
 *
 * It lights only while unfinalized days exist ANYWHERE behind today — not just
 * in the month on screen, which is why this reads the unbounded queue query
 * rather than the grid's visible-range slice.
 */
function CatchUpFlag({
  today,
  openDay,
}: {
  today: string;
  openDay: (day: string) => void;
}) {
  const rows = useQuery(unfinalizedQuery);
  const days = useMemo(() => catchUpDays(rows, today), [rows, today]);
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // `ignore: btnRef`, not `parentRoot` — the panel is PORTALED to
  // document.body (below), so the wrapper no longer contains it and wrapper
  // containment would close-then-reopen on every flag click (the dead-toggle
  // fault `parentRoot` existed to prevent). `ignore` is the detached-trigger
  // form of the same guarantee: the flag's mousedown is left to its own
  // onClick, which toggles.
  useDismiss(popRef, () => setOpen(false), { enabled: open, ignore: btnRef });

  // The flag dies with the last row — and the popover must die with it, or a
  // day finalized from inside the popover leaves an empty panel hanging.
  useEffect(() => {
    if (days.length === 0) setOpen(false);
  }, [days.length]);

  // POSITION: the frozen face places the popover just right of the rail at a
  // fixed offset, which assumes a frame that never scrolls. The live rail
  // scrolls AND clips (`overflow: hidden auto`), so an absolutely-positioned
  // child would be cut off at the rail's edge. `position: fixed` off the
  // button's measured rect escapes the clip; the rect is re-measured on scroll
  // and resize so the panel stays welded to the flag rather than stranded
  // where it opened (a fixed element does not move with its anchor for free).
  //
  // This MUST sit above the empty-queue return: the queue empties and refills
  // under a mounted rail (finalizing the last day, or a day going unfinalized),
  // and a hook below the return changes the hook count between those renders.
  const rect = useAnchorRect(btnRef, open);
  const panelHeight = usePanelHeight(popRef, open && rect != null);

  if (days.length === 0) return null;

  return (
    <div className="catchwrap">
      <button
        ref={btnRef}
        className="catch-flag"
        onClick={() => setOpen((o) => !o)}
        title="Open the catch-up queue"
      >
        <span className="dot" />
        <span className="lbl">Days to finalize</span>
        <span className="cnt">{days.length}</span>
      </button>
      {/* PORTALED OUT OF THE RAIL (2026-08-17, Mac) — same move and reasoning
          as the Jump panel above: on macOS WebKit the fixed panel rendered
          clipped at the rail's edge instead of escaping it, so it mounts at
          document.body where no rail ancestry can clip or re-stack it. The
          measured-rect coordinates are viewport-relative and unchanged. */}
      {open && rect != null && createPortal(
        <div
          ref={popRef}
          className="catchpop"
          role="dialog"
          aria-label="Catch-up queue"
          style={{ left: rect.right + 8, top: clampToViewport(rect.top, panelHeight) }}
        >
          {/* DATES ONLY — user-ruled 2026-08-01: "that needs to be more
              concise. All i need are the dates, everything else is
              extraneous." This SUPERSEDES the frozen face, which draws a
              title, a per-row "open entry form" hint and an explanatory
              footer. The rows were always the whole content; the rest was
              mockup captioning that only reads as instruction once. */}
          {days.map((d) => (
            <button
              key={d}
              className="prow"
              onClick={() => {
                setOpen(false);
                openDay(d);
              }}
            >
              <span className="pd">
                {POP_DATE.format(new Date(`${d}T12:00:00`))}
              </span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

const POP_DATE = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "long",
});

/**
 * The anchor's viewport rect while `active`, re-measured on scroll (capture
 * phase, so the RAIL's own scroll counts and not just the window's) and on
 * resize. Null when inactive or unmounted.
 */
/**
 * THE VIEWPORT CLAMP (bug `calendar-2`, 2026-08-08).
 *
 * `position: fixed` gets these panels out of the rail's `overflow: hidden auto`
 * clip — and then nothing else holds them anywhere. The panels are welded to
 * their anchor ON PURPOSE (they follow the rail's scroll rather than stranding
 * themselves where they opened), but a scrolling anchor eventually leaves the
 * window, and it TOWS THE PANEL WITH IT: `top` goes negative and the panel is
 * cut off by the top of the screen. Read carelessly that looks like the rail
 * clipping it again, which is the wrong diagnosis — escaping the rail was never
 * the problem.
 *
 * So the panel's OWN edges are what get clamped, never the anchor's. The
 * anchoring ruling is untouched; it just stops at the window.
 */
const VIEWPORT_INSET = 8;

const clampToViewport = (top: number, height: number): number => {
  const lowest = window.innerHeight - height - VIEWPORT_INSET;
  // The inner `max` keeps a panel TALLER than the window pinned to the top
  // rather than pushed off it — its own `max-height` handles the overflow.
  return Math.max(VIEWPORT_INSET, Math.min(top, Math.max(VIEWPORT_INSET, lowest)));
};

/**
 * The panel's rendered height, watched. A ResizeObserver rather than a one-shot
 * measure because the catch-up list SHRINKS under a mounted panel — finalizing
 * a day from inside it removes a row — and a stale height would clamp against a
 * size the panel no longer has.
 */
function usePanelHeight(ref: RefObject<HTMLElement | null>, active: boolean): number {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    if (!active) {
      setHeight(0);
      return;
    }
    const el = ref.current;
    if (el == null) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, active]);
  return height;
}

function useAnchorRect(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!active) {
      setRect(null);
      return;
    }
    const measure = () => setRect(ref.current?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [active, ref]);
  return rect;
}

function Row({
  monday,
  week,
  current,
  cells,
  today,
  viewingDay,
  marks,
  openDay,
  onCadence,
}: {
  monday: string;
  week: number;
  current: boolean;
  cells: Cell[];
  today: string;
  viewingDay?: string | null;
  marks: Map<string, boolean>;
  openDay: (day: string) => void;
  onCadence: (scale: CadenceScale, anchor: string) => void;
}) {
  return (
    <>
      <button
        className={`wk${current ? " cur" : ""}`}
        onClick={() => onCadence("week", monday)}
        title={`Week ${week}`}
      >
        W{week}
      </button>
      {cells.map((c) => {
        const finalized = marks.get(c.day);
        const isToday = c.day === today;
        const future = c.day > today;
        // "YOU ARE HERE" — and ONLY when it has something to say. On today the
        // cell already reads as today, so a second marker would add nothing and
        // would make the rail's ordinary resting state (which is today, nearly
        // always) permanently louder. Scoped in-month for the same reason `.unf`
        // is: a spill day's story belongs to its own month.
        const viewing = viewingDay != null && c.day === viewingDay && c.inMonth && !isToday;
        // Class order mirrors the frozen face's own vocabulary so the drawn CSS
        // reads unchanged: out · future · today · fin · unf · empty.
        const cls = [
          "d",
          !c.inMonth ? "out" : "",
          future ? "future" : "",
          isToday ? "today" : "",
          finalized === true ? "fin" : "",
          // A marker ring only where the ledger says "unfinalized", and only
          // in-month — the drawn ruling scopes the attention outline to the
          // month being shown, so a spill day never lights the rail.
          finalized === false && c.inMonth ? "unf" : "",
          finalized === undefined && !future && !isToday ? "empty" : "",
          viewing ? "viewing" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={c.day}
            className={cls}
            onClick={future ? undefined : () => openDay(c.day)}
            disabled={future}
            title={c.day}
          >
            {c.num}
            {/* Spill days carry NO marker even when they have a ledger row —
                the frozen face draws `.d.out` as a bare number. The month on
                screen owns the bookkeeping story; a neighbouring month's marks
                are its own month's business. */}
            {finalized !== undefined && c.inMonth && <span className="m" />}
          </button>
        );
      })}
    </>
  );
}
