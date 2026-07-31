/**
 * The period-window VOCABULARY — the shape kit-picker-period edits and both
 * query workspaces (Comparing Statistics · Advanced Search) resolve. Hoisted
 * out of compare/compareSpec.ts 2026-07-30 (the dedup pass, wave 2): the
 * picker is a kit component, so the type it speaks lives beside it rather
 * than inside one consumer's spec. compareSpec re-exports everything here,
 * so its public API is unchanged.
 */
import { dayFromIndex, dayIndex } from "../metrics/dates";
import { MONTHS_SHORT } from "../metrics/format";

export type WindowCfg =
  | { mode: "none" }
  | { mode: "today" }
  | { mode: "rel"; days: number }
  | { mode: "daterange"; from: string | null; to: string | null }
  | { mode: "month"; from: string | null; to: string | null } // "YYYY-MM"
  | { mode: "year"; from: number; to: number };

export const RELATIVE_DAYS = [7, 30, 90, 365];

export interface ResolvedWindow {
  from: string;
  to: string;
  label: string;
  days: number;
}

const monLabel = (mk: string): string =>
  `${MONTHS_SHORT[Number(mk.slice(5, 7)) - 1]} ${mk.slice(0, 4)}`;

/** Month/year shorthand expands to full day spans — every window downstream is one shape. */
export function resolveWindow(w: WindowCfg, today: string): ResolvedWindow | null {
  if (w.mode === "none") return null;
  if (w.mode === "today") return { from: today, to: today, label: "Today", days: 1 };
  if (w.mode === "rel") {
    const from = dayFromIndex(dayIndex(today) - (w.days - 1));
    return { from, to: today, label: `Last ${w.days} days`, days: w.days };
  }
  if (w.mode === "daterange") {
    if (w.from == null || w.to == null || w.from > w.to) return null;
    return {
      from: w.from,
      to: w.to,
      label: `${w.from} → ${w.to}`,
      days: dayIndex(w.to) - dayIndex(w.from) + 1,
    };
  }
  if (w.mode === "month") {
    if (w.from == null || w.to == null || w.from > w.to) return null;
    const from = `${w.from}-01`;
    const [y, m] = [Number(w.to.slice(0, 4)), Number(w.to.slice(5, 7))];
    const to = `${w.to}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
    const label = w.from === w.to ? monLabel(w.from) : `${monLabel(w.from)} – ${monLabel(w.to)}`;
    return { from, to, label, days: dayIndex(to) - dayIndex(from) + 1 };
  }
  // year
  if (w.from > w.to) return null;
  const from = `${w.from}-01-01`;
  const to = `${w.to}-12-31`;
  const label = w.from === w.to ? `${w.from} · Jan – Dec` : `${w.from} – ${w.to}`;
  return { from, to, label, days: dayIndex(to) - dayIndex(from) + 1 };
}
