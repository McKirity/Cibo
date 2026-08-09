/**
 * THE DATE CHIP — the app's own date field, typed primary with a calendar
 * popover fallback. `.datefield` is the FINAL's own name for it
 * (`first-run-setup.html` draws the chip twice); the app had it as `.fudate`
 * only because it was born inside the first-run screen.
 *
 * HOISTED OUT OF `firstrun/FirstRunSetup.tsx` 2026-08-09, user-ruled
 * (*"Just swap"*) at tour 7 station 7, when Settings → Whimsy's two native
 * `<input type="date">` — the app's last — were replaced with this. It was
 * always a shared piece waiting for a second tenant: [[Sync & Per-Device
 * Settings]]-era notes flagged it as "a kit-block CANDIDATE the moment Whimsy
 * adopts it", and Whimsy has now adopted it.
 *
 * ⚠ THE ORIGINAL JUSTIFICATION IS SPENT, AND THE RULING OUTLIVED IT. This was
 * built because WebView2's native date input measured ~2 s PER ROW against
 * 6–10 ms in Chromium. Re-measured at tour 7 on this WebView2 build, at one row
 * and at ten: **instant both times — the stall does not reproduce.** The swap
 * went ahead anyway on the ground that replaced it: a native picker is drawn by
 * the OS, so it takes no theme dials, ignores compact, carries no decoration,
 * and renders as a different control again on macOS — in an app whose premise
 * is that a theme re-skins the whole of it. *Speed was the reason it exists;
 * consistency is the reason it spread.*
 *
 * WHAT THE NATIVE CONTROL GAVE UP, recorded so the trade is not re-litigated
 * blind: OS date formatting, per-segment arrow-key editing, and screen-reader
 * semantics all came free and are now this component's own debt. Typed entry is
 * canonical `YYYY-MM-DD`; Enter commits, Escape reverts, blur commits.
 *
 * FUTURE DATES ARE LEGAL, deliberately: countdowns are the whole point, and the
 * "future = dead route" law governs day DOORS (logging surfaces), never an
 * event's date. Year chevrons flank the month pair because a birthdate lives
 * decades back — typing stays the fast path.
 *
 * The popover surface is kit.css's shared `.calpop`; this component only
 * anchors it (the DateTimePicker discipline: focus-within opens, `.shut` is a
 * state and not a blur).
 */
import { useState } from "react";
import { pad2, todayLocal } from "../metrics/clock";
import { monthGridCells, weekDayLetters } from "../metrics/dates";
import { MONTHS_LONG } from "../metrics/format";

/** "YYYY-M-D" (typed) → canonical "YYYY-MM-DD", or null if not a real date. */
export const parseDay = (raw: string): string | null => {
  const m = raw.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
};

export function DateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (d: string) => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null);
  const [shut, setShut] = useState(false);
  const today = todayLocal();
  const anchor = value !== "" ? value : today;
  const view = cursor ?? { y: Number(anchor.slice(0, 4)), m: Number(anchor.slice(5, 7)) - 1 };
  const cells = monthGridCells(view.y, view.m);
  const shown = typed ?? value;

  const stepMonth = (delta: number) => {
    const m = view.m + delta;
    setCursor({ y: view.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 });
  };
  const stepYear = (dy: number) => setCursor({ y: view.y + dy, m: view.m });

  const commit = () => {
    if (typed == null) return;
    if (typed.trim() === "") onChange("");
    else {
      const d = parseDay(typed);
      if (d != null) onChange(d);
    }
    setTyped(null);
  };

  /**
   * ↑/↓ step the date by a day — the one piece of the native control's keyboard
   * behaviour worth carrying, and the cheapest (per-SEGMENT stepping would need
   * a caret model this field does not have). It steps the COMMITTED value, so
   * a half-typed string is left alone rather than parsed mid-edit.
   */
  const step = (days: number) => {
    if (typed != null) return;
    const base = value !== "" ? parseDay(value) : today;
    if (base == null) return;
    const d = new Date(Number(base.slice(0, 4)), Number(base.slice(5, 7)) - 1, Number(base.slice(8)));
    d.setDate(d.getDate() + days);
    onChange(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`);
    setCursor(null);
  };

  return (
    <span
      className={`datefield${shut ? " shut" : ""}`}
      onMouseDown={(e) => {
        setShut(false);
        // The chip is bigger than the field inside it — clicking the glyph or
        // padding must still focus the input (the DateTimePicker fix).
        if (e.target instanceof HTMLInputElement) return;
        const input = e.currentTarget.querySelector<HTMLInputElement>(".datefield-in");
        if (input == null) return;
        e.preventDefault();
        input.focus();
      }}
    >
      <svg className="datefield-ico" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />
      </svg>
      <input
        className="datefield-in"
        placeholder="YYYY-MM-DD"
        maxLength={10}
        value={shown}
        spellCheck={false}
        onFocus={() => setShut(false)}
        onChange={(e) => {
          setTyped(e.target.value);
          setShut(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            setShut(true);
          }
          if (e.key === "Escape") {
            setTyped(null);
            setShut(true);
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            step(1);
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            step(-1);
          }
        }}
      />
      <div className="calpop">
        <div className="caltop">
          <span className="m">
            {MONTHS_LONG[view.m]} {view.y}
          </span>
          <span className="nav">
            <span className="b" title="Previous year" onMouseDown={(e) => (e.preventDefault(), stepYear(-1))}>
              <svg className="datefield-ico" viewBox="0 0 24 24"><path d="m11 17-5-5 5-5" /><path d="m18 17-5-5 5-5" /></svg>
            </span>
            <span className="b" title="Previous month" onMouseDown={(e) => (e.preventDefault(), stepMonth(-1))}>
              <svg className="datefield-ico" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>
            </span>
            <span className="b" title="Next month" onMouseDown={(e) => (e.preventDefault(), stepMonth(1))}>
              <svg className="datefield-ico" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
            </span>
            <span className="b" title="Next year" onMouseDown={(e) => (e.preventDefault(), stepYear(1))}>
              <svg className="datefield-ico" viewBox="0 0 24 24"><path d="m13 17 5-5-5-5" /><path d="m6 17 5-5-5-5" /></svg>
            </span>
          </span>
        </div>
        <div className="cgrid">
          {weekDayLetters().map((d, i) => (
            <div className="cdow" key={i}>{d}</div>
          ))}
          {cells.map((c) => {
            const cls = [
              "cd",
              c.out ? "out" : "",
              c.day === today ? "today" : "",
              c.day === value ? "sel" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div
                className={cls}
                key={c.day}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation(); // the wrapper's mousedown would re-open
                  if (c.out) return;
                  onChange(c.day);
                  setTyped(null);
                  setShut(true);
                }}
              >
                {Number(c.day.slice(8))}
              </div>
            );
          })}
        </div>
      </div>
    </span>
  );
}
