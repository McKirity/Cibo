/**
 * Date + bucket helpers for the derivation layer. All calendar math rides
 * integer UTC day-indices (days since epoch) so DST never shifts a boundary,
 * and every function is pure — "today" is always passed in, never read from the
 * clock, so metrics stay deterministic and testable.
 *
 * Day strings are the schema's "YYYY-MM-DD" (local wall-clock, no timezone —
 * Day Boundary & Logging Cutoff); we treat them as opaque calendar labels.
 *
 * THE WEEK-START DIAL (2026-08-04 — the `week_start` synced setting, wired):
 * week bucketing, calendar layout and week labels all follow ONE module-level
 * parameter, pushed in by settings/store when its cache loads (the settings
 * layer imports down into metrics, never the reverse). It is the one
 * deliberate crack in this module's purity: set at launch + on the rare
 * setting change, constant within any derivation pass — dashboards re-read at
 * mount (the synced-settings freshness doctrine). ISO week NUMBERS stay
 * ISO-defined (Monday-based); a configurable week is LABELED by the ISO week
 * of the Thursday it contains (`weekNum`), which is the identity function for
 * Monday-start weeks and the least-surprising number for Sunday-start ones.
 */
import { pad2 } from "./clock";

/** 1 = Monday (the ruled default) · 0 = Sunday — `Date.getUTCDay` numbering. */
let WEEK_START_DOW: 0 | 1 = 1;
export const setWeekStartDow = (d: 0 | 1): void => {
  WEEK_START_DOW = d;
};
export const weekStartDow = (): 0 | 1 => WEEK_START_DOW;

/** Day names in `getUTCDay` order — the base every rotated face reads. */
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"] as const;

/** The i-th column's day name under the configured week start (0 = start). */
export const weekDayName = (i: number): string => DAY_NAMES[(WEEK_START_DOW + i) % 7];
/** Single-letter header row for the calendar grids, week-start first. */
export const weekDayLetters = (): string[] =>
  Array.from({ length: 7 }, (_, i) => DAY_LETTERS[(WEEK_START_DOW + i) % 7]);
/** The heatmaps' alternating gutter labels (rows 0·2·4·6), week-start first. */
export const heatRowLabels = (): string[] =>
  Array.from({ length: 7 }, (_, i) => (i % 2 === 0 ? weekDayName(i) : ""));

/** Days since the Unix epoch for a "YYYY-MM-DD" label (calendar, not instant). */
export function dayIndex(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Inverse of dayIndex → "YYYY-MM-DD". */
export function dayFromIndex(idx: number): string {
  const dt = new Date(idx * 86_400_000);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Whole days from a to b (b − a); negative if b precedes a. */
export const dayGap = (a: string, b: string): number => dayIndex(b) - dayIndex(a);

/** "YYYY-MM" — the calendar-month bucket key. */
export const monthKey = (day: string): string => day.slice(0, 7);

/** "YYYY" — the calendar-year bucket key. */
export const yearKey = (day: string): string => day.slice(0, 4);

/** The first day of a day's week (the configured week start), as a day string. */
export function weekStart(day: string): string {
  const idx = dayIndex(day);
  const dow = new Date(idx * 86_400_000).getUTCDay(); // 0=Sun … 6=Sat
  const back = (dow - WEEK_START_DOW + 7) % 7;
  return dayFromIndex(idx - back);
}

/** The Thursday of a day's (configured) week — the day that carries its label. */
export const weekThursday = (day: string): string =>
  dayFromIndex(dayIndex(weekStart(day)) + ((4 - WEEK_START_DOW + 7) % 7));

/**
 * The week's DISPLAY number + week-year: the ISO week of the Thursday this
 * (configured) week contains. Identical to `isoWeek(day)` under Monday start;
 * under Sunday start it numbers the week by the six days it shares with the
 * ISO week rather than by its leading Sunday.
 */
export const weekNum = (day: string): { week: number; year: number } => isoWeek(weekThursday(day));

/** ISO-8601 week number + week-year (weeks start Monday; wk 1 holds Jan 4). */
export function isoWeek(day: string): { week: number; year: number } {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // Mon=0
  dt.setUTCDate(dt.getUTCDate() - dow + 3); // to the Thursday of this week
  const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const firstDow = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDow + 3);
  const week =
    1 + Math.round((dt.getTime() - firstThu.getTime()) / (7 * 86_400_000));
  return { week, year: dt.getUTCFullYear() };
}

/** Every day string from `from` to `to` inclusive (ascending). */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let i = dayIndex(from), end = dayIndex(to); i <= end; i++)
    out.push(dayFromIndex(i));
  return out;
}

/** The Monday of ISO week `week` of ISO year `year` — the inverse of `isoWeek`. */
export function isoWeekMonday(year: number, week: number): string {
  // Jan 4 is always in ISO week 1; walk back to its Monday, then step weeks.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = (jan4.getUTCDay() + 6) % 7; // Mon=0
  const week1Mon = Date.UTC(year, 0, 4 - dow);
  return dayFromIndex(Math.floor(week1Mon / 86_400_000) + (week - 1) * 7);
}

/** ISO weeks in a year (52 or 53). */
export function isoWeeksInYear(year: number): number {
  // 53 ISO weeks iff Jan 1 is Thursday, or it's a leap year and Jan 1 is Wednesday.
  const jan1 = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return jan1 === 4 || (leap && jan1 === 3) ? 53 : 52;
}

/** One calendar-popover cell: the full day string + whether it pads a neighbour month. */
export interface MonthGridCell {
  day: string;
  out: boolean;
}

/**
 * The month grid every calendar popover draws — leading days of the previous
 * month, this month, then trailing days: always whole weeks, week-start first
 * (the configured dial). Flat (the popovers render a 7-column CSS grid, not
 * week rows); `month0` is 0-based, matching the popovers' view cursors.
 */
export function monthGridCells(year: number, month0: number): MonthGridCell[] {
  const first = `${year}-${pad2(month0 + 1)}-01`;
  const firstIdx = dayIndex(first);
  // The weekday comes from `getUTCDay`, the same form `weekStart` uses — NOT
  // from the "epoch day 0 is a Thursday" shortcut `(firstIdx + 4) % 7`. That
  // identity holds only for non-negative day indices: JavaScript's `%` takes
  // the sign of the dividend, so a pre-1970 month produced a NEGATIVE lead,
  // emitted no pad cells, and drew the 1st in the first column whatever weekday
  // it really was (bug `calendar-1`, 2026-08-07).
  const dow = new Date(firstIdx * 86_400_000).getUTCDay();
  const lead = (dow - WEEK_START_DOW + 7) % 7;
  const total = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const cells: MonthGridCell[] = [];
  for (let i = lead; i > 0; i--) cells.push({ day: dayFromIndex(firstIdx - i), out: true });
  for (let d = 1; d <= total; d++)
    cells.push({ day: `${year}-${pad2(month0 + 1)}-${pad2(d)}`, out: false });
  while (cells.length % 7 !== 0)
    cells.push({ day: dayFromIndex(dayIndex(cells[cells.length - 1].day) + 1), out: true });
  return cells;
}
