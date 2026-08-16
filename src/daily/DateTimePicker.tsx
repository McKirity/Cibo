/**
 * kit-picker-datetime — the range habit's datetime pair, and the ONE tenant of
 * the click-fallbacks in the whole app (the Sleep strip).
 *
 * Ruled 2026-07-26: **translate as frozen** (`Final/daily-form-pickers.html`,
 * all its CSS rules already claimed), with a re-design owed. **THE REVISIT RAN
 * 2026-08-04 (the completeness audit) and the verdict was small: "Picker is
 * mostly fine, just need to make it opaque"** — the popover surface moved to
 * the ladder's opaque tier (kit.css § kit-picker-datetime) and the anatomy
 * stands as drawn. The owed re-design is DISCHARGED.
 *
 * TYPING IS THE PRIMARY PATH; the popovers are the fallback — the FROZEN file
 * said so in a `.tnote`, which is where this reading comes from. The note
 * itself is gone (2026-08-15, below): the design still holds, only the caption
 * announcing it does not. Both open on `:focus-within`, the same script-free
 * discipline the strips use.
 *
 * THE DATE AND THE TIME ARE HELD SEPARATELY — user-ruled 2026-07-26: "once a
 * date has been selected via calendar, it shouldn't auto fill the time either."
 * An earlier pass carried one `YYYY-MM-DDTHH:MM` string, which forced the
 * calendar to invent a time (it wrote noon) just to have a value to store. Two
 * fields means picking a date says nothing about the time, and the owning form
 * writes a session only once all four parts are real.
 *
 * `.calpop` is NOT the nav calendar. The frozen file draws it (280px, 7 columns,
 * today/selected/out/dead) as a component wholly separate from `.cal` (week
 * numbers, finalize markers, catch-up outlines), so step 9 neither helps this
 * nor is helped by it.
 */
import { useRef, useState } from "react";
import { monthGridCells, weekDayLetters } from "../metrics/dates";
import { MONTHS_LONG } from "../metrics/format";
import { pad2 as pad, todayLocal } from "../metrics/clock";

/* Header letters follow the configured week start (dates.weekDayLetters). */

/** "Thu 3 Jul" — the frozen face's date label. The formatter is hoisted (every
 *  sibling in this folder hoists its own; Intl construction is the expensive
 *  part and a Sleep strip renders two pickers). */
const DATE_LABEL = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});
/**
 * ⚠ THE THREE ANNOTATIONS ARE GONE (user-ruled 2026-08-15: *"remove all the
 * annotations from it"*): the calendar's "Future days … Empty ≠ future", the
 * time popover's "Time — type 24h, or pick" head, and its "Typing the 24h time
 * is the primary path" foot. All three explained the CONTROL'S OWN MECHANICS
 * rather than saying anything about the data — a dead day is already drawn
 * dead, and a field you can type into does not need to announce that typing is
 * allowed. Comparing Statistics struck its equivalent on 2026-07-27 under the
 * same no-explainer-prose law; this picker predates that sweep and was missed.
 */
const dateLabel = (day: string): string => DATE_LABEL.format(new Date(`${day}T12:00:00`));

/**
 * 24-HOUR ONLY (user-ruled 2026-07-26: "it should be military time too").
 * Accepts `7:40` · `07:40` · `0740`; rejects anything past 23:59 and any am/pm
 * form, and normalises to `HH:MM` on the way out. Returns null for "not a time
 * yet", which the caller treats as "leave it alone".
 */
export const normalizeTime = (raw: string): string | null => {
  const m = raw.trim().match(/^(\d{1,2})[:.]?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${pad(h)}:${pad(mi)}`;
};

const ICal = () => (
  <svg className="ico sm" viewBox="0 0 24 24">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4" />
    <path d="M8 2v4" />
    <path d="M3 10h18" />
  </svg>
);
const IClock = () => (
  <svg className="ico sm" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4l3 2" />
  </svg>
);

export function DateTimePicker({
  date,
  time,
  onChange,
}: {
  /** "YYYY-MM-DD", or "" when unset. */
  date: string;
  /** "HH:MM" 24h, or "" when unset. */
  time: string;
  onChange: (date: string, time: string) => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null);
  // Closing is a STATE, not a blur — see daily.css's `.shut` note. Blurring to
  // dismiss a panel throws away the tab position, which is what made Shift+Tab
  // jump to the end of the document after any pick.
  const [shutDate, setShutDate] = useState(false);
  const [shutTime, setShutTime] = useState(false);

  const today = todayLocal();
  const anchor = date !== "" ? date : today;
  const view = cursor ?? { y: Number(anchor.slice(0, 4)), m: Number(anchor.slice(5, 7)) - 1 };
  const shownTime = typed ?? time;

  // The grid: leading days of the previous month, this month, then trailing —
  // always whole weeks, week-start first (metrics/dates.monthGridCells — 2026-07-30 dedup).
  const cells = monthGridCells(view.y, view.m);

  const hourCol = useRef<HTMLDivElement>(null);
  const minCol = useRef<HTMLDivElement>(null);

  const stepMonth = (delta: number) => {
    const m = view.m + delta;
    setCursor({ y: view.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 });
  };

  /* THE FALLBACK IS TWO ABSOLUTE COLUMNS (user-ruled 2026-08-15). It was a
     seven-cell half-hour strip centred on the current value, stacked over a
     full-day scrub bar, and the pair was the problem: the strip was RELATIVE
     (±90 min around your answer) and the bar ABSOLUTE (midnight to midnight),
     so the dot's position said nothing about which cell was lit — two mental
     models in one popover. The strip also re-centred after every pick, so the
     row jumped under the cursor, and seven cells came to ~450px inside a 340px
     box with `overflow: hidden`, which sliced the last one and a half in half.
     Hours and minutes match the `HH:MM` the field already asks you to type, so
     the popover and the keyboard path now teach the same thing. */
  const valid = /^\d{2}:\d{2}$/.test(shownTime);
  const curHour = valid ? shownTime.slice(0, 2) : null;
  const curMin = valid ? shownTime.slice(3, 5) : null;
  const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
  const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5));
  /* The columns scroll, so the selected row has to be brought into view when
     the popover appears. It appears on `:focus-within` — pure CSS, no mount to
     hook — so the field's own focus is the event, and `offsetTop` is used
     rather than `scrollIntoView`, which would also scroll the page. */
  const revealSelected = () => {
    for (const ref of [hourCol, minCol]) {
      const col = ref.current;
      const sel = col?.querySelector<HTMLElement>(".tcell.sel");
      if (col != null && sel != null) col.scrollTop = sel.offsetTop - col.clientHeight / 2 + sel.offsetHeight / 2;
    }
  };

  return (
    <span className="dt dt-live">
      <span
        className={`dpart date${shutDate ? " shut" : ""}`}
        tabIndex={0}
        onMouseDown={() => setShutDate(false)}
        onFocus={() => setShutDate(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setShutDate(true);
          }
        }}
      >
        <ICal />
        {date === "" ? <span className="cap">pick a date</span> : dateLabel(date)}
        <span className="cue">
          <svg className="ico sm" viewBox="0 0 24 24">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </span>
        <div className="calpop">
          <div className="caltop">
            <span className="m">
              {MONTHS_LONG[view.m]} {view.y}
            </span>
            <span className="nav">
              <span className="b" onMouseDown={(e) => (e.preventDefault(), stepMonth(-1))}>
                <svg className="ico sm" viewBox="0 0 24 24">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </span>
              <span className="b" onMouseDown={(e) => (e.preventDefault(), stepMonth(1))}>
                <svg className="ico sm" viewBox="0 0 24 24">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </span>
            </span>
          </div>
          <div className="cgrid">
            {weekDayLetters().map((d, i) => (
              <div className="cdow" key={i}>
                {d}
              </div>
            ))}
            {cells.map((c) => {
              const dead = c.day > today;
              const cls = [
                "cd",
                c.out ? "out" : "",
                dead ? "dead" : "",
                c.day === today ? "today" : "",
                c.day === date ? "sel" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <div
                  className={cls}
                  key={c.day}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    // The wrapper's mousedown re-opens (`setShutDate(false)`)
                    // and runs after this one — a pick must not bubble into it,
                    // or the close below is overridden and the popover stays.
                    e.stopPropagation();
                    if (dead || c.out) return;
                    // The date, and ONLY the date — picking a day says nothing
                    // about what time of day it was.
                    onChange(c.day, time);
                    setShutDate(true);
                  }}
                >
                  {Number(c.day.slice(8))}
                </div>
              );
            })}
          </div>
        </div>
      </span>

      <span
        className={`dpart time${shutTime ? " shut" : ""}`}
        onFocus={revealSelected}
        onMouseDown={(e) => {
          setShutTime(false);
          // The popover is about to appear; bring the picked rows into view.
          requestAnimationFrame(revealSelected);
          // The chip is bigger than the 5-character field inside it; clicking
          // the clock glyph or the padding used to focus nothing, so the
          // popover never opened.
          if (e.target instanceof HTMLInputElement) return;
          const input = e.currentTarget.querySelector<HTMLInputElement>(".timein");
          if (input == null) return;
          e.preventDefault();
          input.focus();
        }}
      >
        <IClock />
        <input
          className="timein"
          placeholder="--:--"
          inputMode="numeric"
          maxLength={5}
          value={shownTime}
          onFocus={() => setShutTime(false)}
          onChange={(e) => {
            setTyped(e.target.value);
            setShutTime(false);
          }}
          onBlur={() => {
            const t = typed == null ? null : normalizeTime(typed);
            if (t != null) onChange(date, t);
            setTyped(null);
          }}
          onKeyDown={(e) => {
            // Enter commits and closes; Esc closes without committing what was
            // half-typed — the picker amendment's ruled pair.
            if (e.key === "Enter") {
              const t = typed == null ? null : normalizeTime(typed);
              if (t != null) onChange(date, t);
              setTyped(null);
              setShutTime(true);
            }
            if (e.key === "Escape") {
              setTyped(null);
              setShutTime(true);
            }
          }}
        />
        <div className="timepop">
          <div className="tcols">
            <div className="tcol" ref={hourCol}>
              {HOURS.map((h) => (
                <span
                  className={`tcell${h === curHour ? " sel" : ""}`}
                  key={h}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation(); // the wrapper's mousedown would re-open
                    setTyped(null);
                    onChange(date, `${h}:${curMin ?? "00"}`);
                  }}
                >
                  {h}
                </span>
              ))}
            </div>
            <div className="tcol" ref={minCol}>
              {MINUTES.map((mm) => (
                <span
                  className={`tcell${mm === curMin ? " sel" : ""}`}
                  key={mm}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setTyped(null);
                    onChange(date, `${curHour ?? "00"}:${mm}`);
                  }}
                >
                  {mm}
                </span>
              ))}
            </div>
          </div>
        </div>
      </span>
    </span>
  );
}
