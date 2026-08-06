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
 * TYPING IS THE PRIMARY PATH; the popovers are the fallback (the frozen file
 * says so in its own `.tnote`). Both open on `:focus-within`, the same
 * script-free discipline the strips use.
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

  const scrub = useRef<HTMLDivElement>(null);
  const scrubTo = (clientX: number) => {
    const box = scrub.current?.getBoundingClientRect();
    if (box == null || box.width === 0) return;
    const frac = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    const mins = Math.min(1435, Math.round((frac * 1439) / 5) * 5);
    setTyped(null);
    onChange(date, `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`);
  };

  const stepMonth = (delta: number) => {
    const m = view.m + delta;
    setCursor({ y: view.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 });
  };

  // The fallback strip: seven half-hour cells centred on the current value.
  const baseMinutes = /^\d{2}:\d{2}$/.test(shownTime)
    ? Number(shownTime.slice(0, 2)) * 60 + Number(shownTime.slice(3, 5))
    : 12 * 60;
  const centre = Math.round(baseMinutes / 30) * 30;
  const strip = Array.from({ length: 7 }, (_, i) => {
    const m = (((centre + (i - 3) * 30) % 1440) + 1440) % 1440;
    return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  });

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
          <div className="calnote">
            Future days (after today) are dead for logging — you can't have done a session tomorrow.
            Empty ≠ future.
          </div>
        </div>
      </span>

      <span
        className={`dpart time${shutTime ? " shut" : ""}`}
        onMouseDown={(e) => {
          setShutTime(false);
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
          <div className="thead">Time — type 24h, or pick</div>
          <div className="tstrip">
            {strip.map((t) => (
              <span
                className={`tcell${t === time ? " sel" : ""}`}
                key={t}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation(); // the wrapper's mousedown would re-open
                  setTyped(null);
                  onChange(date, t);
                  setShutTime(true);
                }}
              >
                {t}
              </span>
            ))}
          </div>
          {/* A DRAGGABLE DIAL. The frozen file draws `.tscrub` as a static
              indicator, but it is shaped like a control and reads as one — the
              user went straight for it, and grabbing it merely stole focus from
              the input and closed the whole popover. It now scrubs the day,
              snapped to 5 minutes, and `preventDefault` keeps the focus (and so
              the popover) where it is. */}
          <div
            className="tscrub"
            ref={scrub}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={1439}
            aria-valuenow={baseMinutes}
            onMouseDown={(e) => {
              e.preventDefault();
              scrubTo(e.clientX);
              const move = (ev: MouseEvent) => scrubTo(ev.clientX);
              const up = () => {
                window.removeEventListener("mousemove", move);
                window.removeEventListener("mouseup", up);
              };
              window.addEventListener("mousemove", move);
              window.addEventListener("mouseup", up);
            }}
          >
            <i style={{ left: `${(baseMinutes / 1440) * 100}%` }} />
          </div>
          <div className="tnote">
            Typing the 24h time is the primary path; this strip is the fallback.
          </div>
        </div>
      </span>
    </span>
  );
}
