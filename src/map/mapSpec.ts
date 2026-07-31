/**
 * Build step 6 catch-up — the Map (table of contents): the PURE layer.
 * Translated from `Final/map.html` (frozen 2026-07-12) + its per-screen note.
 * Two trunks: Time (years → quarters → months → days) · Content (project
 * habits → entry title-lines only). Every line a door; text, not tiles.
 *
 * Rulings folded in (user, 2026-07-30):
 *  - the Content trunk FOLLOWS THE MOCKUP — project habits only (the drawn
 *    script omits simple/range habits; overrides the notes' all-habits
 *    reading);
 *  - habit order = the rail/settings order (`sort_order`), NOT the drawn
 *    alphabetical sort — the owning notes' rail-order clause outranks the
 *    sample script's localeCompare. Entries WITHIN a habit stay alphabetical
 *    as drawn.
 *
 * Future time never lists (a future day is a dead route app-wide); the Time
 * trunk runs first-logged-year → today. Collapse state is view-only, never
 * persisted (the library sort/filter stays the app's ONE persisted view
 * state).
 */

import { MONTHS_LONG, MONTHS_SHORT } from "../metrics/format";

// The month faces are the app-wide shared arrays (dedup pass 2026-07-30);
// the exports keep their Map-local names so consumers don't churn.
export const MONTHS = MONTHS_LONG;
export const MABBR = MONTHS_SHORT;
/** Day-of-week faces, SUNDAY-FIRST — indexed by `Date.getDay()`. Deliberately
 * NOT consolidated: the app's calendar helpers are Monday-first (dates.ts),
 * so a shared array would invite an off-by-one; this one exists only to label
 * getDay() results. */
export const DABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** The drawn quarter labels — month spans read inline, no tooltip needed. */
export const Q_LABELS = ["Q1 · Jan – Mar", "Q2 · Apr – Jun", "Q3 · Jul – Sep", "Q4 · Oct – Dec"];

const pad = (n: number): string => String(n).padStart(2, "0");

export interface TimeMonth {
  y: number;
  m: number; // 1-indexed
  label: string;
  /** Cadence anchor — any date inside the period (periodBounds contract). */
  anchor: string;
}
export interface TimeQuarter {
  q: number; // 1-indexed
  label: string;
  anchor: string;
  months: TimeMonth[];
}
export interface TimeYear {
  year: number;
  anchor: string;
  quarters: TimeQuarter[];
}

/**
 * Years newest-first (the drawn order), quarters/months oldest-first within.
 * The current year drops quarters/months entirely ahead of today — future
 * time never lists. Years run down to `firstYear` (the first-ever logged
 * year); a whole first year lists even if logging began mid-year, as drawn.
 */
export function buildTimeTrunk(firstYear: number, today: string): TimeYear[] {
  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7));
  const floor = Math.min(firstYear, ty);
  const years: TimeYear[] = [];
  for (let y = ty; y >= floor; y--) {
    const quarters: TimeQuarter[] = [];
    for (let q = 0; q < 4; q++) {
      const qStart = q * 3 + 1;
      if (y === ty && qStart > tm) continue;
      const months: TimeMonth[] = [];
      for (let mi = 0; mi < 3; mi++) {
        const m = qStart + mi;
        if (y === ty && m > tm) continue;
        months.push({ y, m, label: MONTHS[m - 1], anchor: `${y}-${pad(m)}-01` });
      }
      quarters.push({ q: q + 1, label: Q_LABELS[q], anchor: `${y}-${pad(qStart)}-01`, months });
    }
    years.push({ year: y, anchor: `${y}-01-01`, quarters });
  }
  return years;
}

export interface DayRow {
  iso: string;
  /** The drawn day-line face: "Sat 11 Jul" (mono). */
  label: string;
}

const daysInMonth = (y: number, m: number): number => new Date(y, m, 0).getDate();

/** Day-lines for one month, capped at today in the current month. */
export function monthDayRows(y: number, m: number, today: string): DayRow[] {
  const isCur = `${y}-${pad(m)}` === today.slice(0, 7);
  const last = isCur ? Number(today.slice(8, 10)) : daysInMonth(y, m);
  const rows: DayRow[] = [];
  for (let d = 1; d <= last; d++) {
    const wd = DABBR[new Date(y, m - 1, d).getDay()];
    rows.push({ iso: `${y}-${pad(m)}-${pad(d)}`, label: `${wd} ${d} ${MABBR[m - 1]}` });
  }
  return rows;
}

/**
 * Entry lists PAGINATE (user-ruled 2026-07-30 at the GUI pass: "use pagination
 * for the collapsed entries") — REVERSING the drawn "+ N more" clause, which
 * was disclosure-not-pagination. A page window of 12 title-lines (the richest
 * drawn expansion) swaps in place; hundreds of entries never enter the DOM at
 * once.
 */
export const ENTRY_PAGE = 12;

export interface EntryPage<T> {
  shown: T[];
  /** Clamped 0-based page. */
  page: number;
  pages: number;
  total: number;
  /** 1-based display bounds ("13–24 of 214"); 0–0 when empty. */
  from: number;
  to: number;
}

export function pageEntries<T>(all: T[], page: number): EntryPage<T> {
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / ENTRY_PAGE));
  const p = Math.min(Math.max(0, page), pages - 1);
  const shown = all.slice(p * ENTRY_PAGE, (p + 1) * ENTRY_PAGE);
  return {
    shown,
    page: p,
    pages,
    total,
    from: total === 0 ? 0 : p * ENTRY_PAGE + 1,
    to: total === 0 ? 0 : p * ENTRY_PAGE + shown.length,
  };
}
