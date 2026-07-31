/**
 * kit-picker-period — the window stack (spec'd SHARED; Advanced Search is the
 * second consumer). Translated from `Final/comparing-statistics.html`:
 * each window = a resolved mono value + two mode rows (relative: today ·
 * 7/30/90/365 days · custom: date → date · month · year), one mode active per
 * window; the custom shapes reveal their resolved pickers. Cross-comparison
 * shares ONE window (no remove, tagged "1 shared window"); self stacks many,
 * each removable. Unequal lengths allowed and unjudged. "Last 24 hours" is
 * deliberately absent — "today" is its honest equivalent.
 *
 * The date popover reuses the `.calpop` anatomy (kit-picker-datetime family,
 * claimed at the form spine; the classes are bare-scoped in daily.css by that
 * claim) — positioning glue lives in kit.css under `:is(.csdash, .advs)`.
 *
 * HOISTED compare/ → kit/ 2026-07-30 (the dedup pass, wave 2) with the shared
 * CSS families; the window vocabulary rides beside it in kit/periodWindow.ts.
 */
import { useRef, useState } from "react";
import { pad2 } from "../metrics/clock";
import { monthGridCells } from "../metrics/dates";
import { MONTHS_LONG, MONTHS_SHORT } from "../metrics/format";
import { Ico, ICONS } from "../shell/icons";
import { useDismiss } from "../shell/overlayHooks";
import { RELATIVE_DAYS, type WindowCfg } from "./periodWindow";

const DOW = ["M", "T", "W", "T", "F", "S", "S"];

/* The calendar glyph KEEPS its own drawn path — it starts the rect at the
 * opposite corner to shell/icons' `calendar` (visually identical, path data
 * not), and the hoist preserves rendered bytes. The chevrons/✕/+ matched the
 * shared roster exactly and were swapped onto it. */
const ICal = () => (
  <svg className="ico" viewBox="0 0 24 24">
    <path d="M21 12V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z" />
    <path d="M16 2v4" />
    <path d="M8 2v4" />
    <path d="M3 10h18" />
  </svg>
);

/**
 * A date field opening the shared `.calpop` calendar (past days only).
 * Exported for Advanced Search's date conditions (the second consumer).
 */
export function DayField({
  label,
  value,
  today,
  onPick,
}: {
  label: string;
  value: string | null;
  today: string;
  onPick: (day: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Capture phase + Escape — the shared dismiss discipline.
  useDismiss(boxRef, () => setOpen(false), { enabled: open });

  const anchor = value ?? today;
  const view = cursor ?? { y: Number(anchor.slice(0, 4)), m: Number(anchor.slice(5, 7)) - 1 };
  const cells = monthGridCells(view.y, view.m);

  const stepMonth = (delta: number) => {
    const m = view.m + delta;
    setCursor({ y: view.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 });
  };

  return (
    <div className="cpfield" ref={boxRef}>
      <span className="cplbl">{label}</span>
      <span className="cpval" onClick={() => setOpen((o) => !o)}>
        {value ?? "pick a date"}
        <ICal />
      </span>
      {open && (
        <div className="calpop">
          <div className="caltop">
            <span className="m">
              {MONTHS_LONG[view.m]} {view.y}
            </span>
            <span className="nav">
              <span className="b" onMouseDown={(e) => (e.preventDefault(), stepMonth(-1))}>
                <Ico d={ICONS.chevronLeft} />
              </span>
              <span className="b" onMouseDown={(e) => (e.preventDefault(), stepMonth(1))}>
                <Ico d={ICONS.chevronRight} />
              </span>
            </span>
          </div>
          <div className="cgrid">
            {DOW.map((d, i) => (
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
                    if (dead || c.out) return;
                    onPick(c.day);
                    setOpen(false);
                  }}
                >
                  {Number(c.day.slice(8))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** A month field — year stepper + the 12-month grid, same popover tier. */
function MonthField({
  label,
  value, // "YYYY-MM" | null
  today,
  onPick,
}: {
  label: string;
  value: string | null;
  today: string;
  onPick: (mk: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useDismiss(boxRef, () => setOpen(false), { enabled: open });

  const y = year ?? Number((value ?? today).slice(0, 4));
  const thisMonth = today.slice(0, 7);

  return (
    <div className="cpfield" ref={boxRef}>
      <span className="cplbl">{label}</span>
      <span className="cpval" onClick={() => setOpen((o) => !o)}>
        {value != null
          ? `${MONTHS_SHORT[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`
          : "pick a month"}
        <Ico d={ICONS.chevron} />
      </span>
      {open && (
        <div className="calpop monthpop">
          <div className="caltop">
            <span className="m">{y}</span>
            <span className="nav">
              <span className="b" onMouseDown={(e) => (e.preventDefault(), setYear(y - 1))}>
                <Ico d={ICONS.chevronLeft} />
              </span>
              <span className="b" onMouseDown={(e) => (e.preventDefault(), setYear(y + 1))}>
                <Ico d={ICONS.chevronRight} />
              </span>
            </span>
          </div>
          <div className="mgrid">
            {MONTHS_SHORT.map((m, i) => {
              const mk = `${y}-${pad2(i + 1)}`;
              const dead = mk > thisMonth;
              return (
                <span
                  key={m}
                  className={`mcell${mk === value ? " sel" : ""}${dead ? " dead" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (dead) return;
                    onPick(mk);
                    setOpen(false);
                  }}
                >
                  {m}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function YearStep({
  label,
  value,
  maxYear,
  onChange,
}: {
  label: string;
  value: number;
  maxYear: number;
  onChange: (y: number) => void;
}) {
  return (
    <div className="cpstep">
      <span className="cplbl">{label}</span>
      <span className="stepper">
        <button aria-label="Previous year" onClick={() => onChange(value - 1)}>
          <Ico d={ICONS.chevronLeft} />
        </button>
        <span className="sv">{value}</span>
        <button aria-label="Next year" onClick={() => onChange(Math.min(maxYear, value + 1))}>
          <Ico d={ICONS.chevronRight} />
        </button>
      </span>
    </div>
  );
}

export function PeriodPicker({
  windows,
  single,
  today,
  minWindowDays = 0,
  minWindowReason = null,
  allowAllTime = false,
  onChange,
}: {
  windows: WindowCfg[];
  /** Cross-comparison: exactly one shared window (no remove, no add). */
  single: boolean;
  today: string;
  /**
   * Shortest window the current measure can answer — an average by month
   * cannot read a 30-day window, so those relative chips gray out (ruled
   * 2026-07-27). Custom ranges are NOT gated here: a date range is picked in
   * pieces and would fight a disabled state, so a short one is caught in the
   * results canvas instead.
   */
  minWindowDays?: number;
  /** What the floor is for ("one month") — the disabled chips' tooltip. */
  minWindowReason?: string | null;
  /**
   * Advanced Search's face ([[Search & Quick-Find]] step 2: "all time ·
   * relative presets · custom"): a leading "All time" chip that maps to
   * `{mode:"none"}` — which CS reads as UNSET and Advanced Search reads as
   * unbounded. CS never passes this, so its face is unchanged.
   */
  allowAllTime?: boolean;
  onChange: (windows: WindowCfg[]) => void;
}) {
  const shown = single ? windows.slice(0, 1) : windows;
  const thisYear = Number(today.slice(0, 4));

  const patch = (i: number, w: WindowCfg) => {
    const next = [...windows];
    next[i] = w;
    onChange(next);
  };
  const remove = (i: number) => onChange(windows.filter((_, j) => j !== i));

  return (
    <>
      <div className="windows">
        {shown.map((w, i) => {
          const customMode = w.mode === "daterange" || w.mode === "month" || w.mode === "year" ? w.mode : "";
          const removable = !single && shown.length > 1;
          return (
            <div
              className={`window${removable ? " removable" : ""}`}
              data-custom={customMode}
              key={i}
            >
              {/* The FINAL draws a resolved-value header on every window; it is
                  REMOVED in both modes (user-ruled 2026-07-27) — the mode chips
                  and the revealed pickers already state the window, so the row
                  only repeated them. The remove ✕ it used to carry moves to the
                  window's own corner. */}
              {removable && (
                <button className="wclose float" title="Remove window" onClick={() => remove(i)}>
                  <Ico d={ICONS.close} />
                </button>
              )}
              <div className="wmodes">
                {/* `.many` = the wrap-alignment face (≥5 chips: the row may
                    take a second line, the label pins to the first) — counted
                    HERE rather than asked of the DOM via :has(), which
                    re-ran style recalc on every hover (2026-07-29 lag fix). */}
                <div className={`wmode${1 + RELATIVE_DAYS.length + (allowAllTime ? 1 : 0) >= 5 ? " many" : ""}`}>
                  <span className="mlabel">Relative</span>
                  <div className={`wopts${1 + RELATIVE_DAYS.length + (allowAllTime ? 1 : 0) >= 5 ? " many" : ""}`}>
                  {allowAllTime && (
                    <span
                      className={`opt${w.mode === "none" ? " on" : ""}`}
                      onClick={() => patch(i, { mode: "none" })}
                    >
                      All time
                    </span>
                  )}
                  {[{ days: 1, label: "Today", cfg: { mode: "today" } as WindowCfg }].concat(
                    RELATIVE_DAYS.map((d) => ({
                      days: d,
                      label: `${d} days`,
                      cfg: { mode: "rel", days: d } as WindowCfg,
                    })),
                  ).map((o) => {
                    const short = o.days < minWindowDays;
                    const on =
                      o.cfg.mode === "today"
                        ? w.mode === "today"
                        : w.mode === "rel" && w.days === o.days;
                    return (
                      <span
                        key={o.label}
                        className={`opt${on ? " on" : ""}${short ? " off" : ""}`}
                        title={
                          short && minWindowReason != null
                            ? `Too short to average by ${minWindowReason}`
                            : undefined
                        }
                        onClick={() => {
                          if (short) return;
                          patch(i, o.cfg);
                        }}
                      >
                        {o.label}
                      </span>
                    );
                  })}
                  </div>
                </div>
                <div className="wmode">
                  <span className="mlabel">Custom</span>
                  <div className="wopts">
                  <span
                    className={`opt${w.mode === "daterange" ? " on" : ""}`}
                    onClick={() => patch(i, { mode: "daterange", from: null, to: null })}
                  >
                    Date → Date
                  </span>
                  <span
                    className={`opt${w.mode === "month" ? " on" : ""}`}
                    onClick={() => patch(i, { mode: "month", from: null, to: null })}
                  >
                    Month
                  </span>
                  <span
                    className={`opt${w.mode === "year" ? " on" : ""}`}
                    onClick={() => patch(i, { mode: "year", from: thisYear, to: thisYear })}
                  >
                    Year
                  </span>
                  </div>
                </div>
              </div>
              <div className="cpick">
                {w.mode === "daterange" && (
                  <div className="cp cp-daterange">
                    <DayField
                      label="From"
                      value={w.from}
                      today={today}
                      onPick={(d) => patch(i, { ...w, from: d, to: w.to != null && w.to < d ? d : w.to })}
                    />
                    <span className="cparrow">→</span>
                    <DayField
                      label="To"
                      value={w.to}
                      today={today}
                      onPick={(d) => patch(i, { ...w, to: d, from: w.from != null && w.from > d ? d : w.from })}
                    />
                  </div>
                )}
                {w.mode === "month" && (
                  <div className="cp cp-month">
                    <MonthField
                      label="From"
                      value={w.from}
                      today={today}
                      onPick={(m) => patch(i, { ...w, from: m, to: w.to != null && w.to < m ? m : w.to })}
                    />
                    <span className="cparrow">→</span>
                    <MonthField
                      label="To"
                      value={w.to}
                      today={today}
                      onPick={(m) => patch(i, { ...w, to: m, from: w.from != null && w.from > m ? m : w.from })}
                    />
                  </div>
                )}
                {w.mode === "year" && (
                  <div className="cp cp-year">
                    <YearStep
                      label="From"
                      value={w.from}
                      maxYear={thisYear}
                      onChange={(y) => patch(i, { mode: "year", from: y, to: Math.max(y, w.to) })}
                    />
                    <span className="cparrow">→</span>
                    <YearStep
                      label="To"
                      value={w.to}
                      maxYear={thisYear}
                      onChange={(y) => patch(i, { mode: "year", from: Math.min(y, w.from), to: y })}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!single && (
        <button className="addrow" onClick={() => onChange([...windows, { mode: "none" }])}>
          <Ico d={ICONS.plus} />
          Add window
        </button>
      )}
    </>
  );
}
