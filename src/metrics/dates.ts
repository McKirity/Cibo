/**
 * Date + bucket helpers for the derivation layer. All calendar math rides
 * integer UTC day-indices (days since epoch) so DST never shifts a boundary,
 * and every function is pure — "today" is always passed in, never read from the
 * clock, so metrics stay deterministic and testable.
 *
 * Day strings are the schema's "YYYY-MM-DD" (local wall-clock, no timezone —
 * Day Boundary & Logging Cutoff); we treat them as opaque calendar labels.
 */

/** Days since the Unix epoch for a "YYYY-MM-DD" label (calendar, not instant). */
export function dayIndex(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Inverse of dayIndex → "YYYY-MM-DD". */
export function dayFromIndex(idx: number): string {
  const dt = new Date(idx * 86_400_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

/** Whole days from a to b (b − a); negative if b precedes a. */
export const dayGap = (a: string, b: string): number => dayIndex(b) - dayIndex(a);

/** "YYYY-MM" — the calendar-month bucket key. */
export const monthKey = (day: string): string => day.slice(0, 7);

/** "YYYY" — the calendar-year bucket key. */
export const yearKey = (day: string): string => day.slice(0, 4);

/** The Monday (week start, Mon–Sun default) of a day's week, as a day string. */
export function weekStart(day: string): string {
  const idx = dayIndex(day);
  const dow = new Date(idx * 86_400_000).getUTCDay(); // 0=Sun … 6=Sat
  const backToMon = (dow + 6) % 7;
  return dayFromIndex(idx - backToMon);
}

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
