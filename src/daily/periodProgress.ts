/**
 * PERIOD PROGRESS — five nested periods, ONE rule.
 *
 * Minted 2026-08-12 with the whimsy re-mint of the period-progress card. The
 * card it replaces computed its five readings on FOUR different rules, and the
 * design handoff called the arithmetic "the largest part of this card and it is
 * wrong today":
 *
 *   · day     `msIntoDay / DAY_MS`, where `msIntoDay` fell back to a whole
 *             `DAY_MS` for any day that is not today — so **every back-dated day
 *             read exactly 100%**, and the card's worst failure (a ring claiming
 *             a finished day) was its ordinary behaviour on the catch-up queue.
 *   · week    `(dow + msIntoDay/DAY_MS) / 7` — whole days counted inclusive.
 *   · month   `(date - 1 + msIntoDay/DAY_MS) / daysInMonth`, same shape.
 *   · year    `(doy - 1 + msIntoDay/DAY_MS) / daysInYear`, same shape.
 *   · quarter noon-anchored real time — matching neither of the other two rules.
 *
 * THE ONE RULE: elapsed real time over the period's real length, at one instant.
 * `(now - start) / (end - start)`, clamped to 0…1, for all five.
 *
 * ⚠ EVERY DENOMINATOR IS A REAL LOCAL INTERVAL, never a constant. A DST day is
 * 23 or 25 hours and its quarter 89.96 or 92.04 days; `elapsed / 86_400_000`
 * reads ~4% high for the whole of the spring-forward Sunday. `new Date(y, m, d)`
 * is local midnight by construction and `new Date(y, m, d + 7)` rolls the month
 * for us, so both ends of every period are real instants and their difference is
 * the true length.
 *
 * ⚠ FLOOR, NEVER ROUND, for the printed number. 99.6% of a day is not a finished
 * day, and at 23:50 on 31 December rounding prints a finished year on four of the
 * five rings. `0` is a legal reading and must print as `0`, not vanish.
 *
 * The RAW fraction drives the arc (the dial is continuous) and the FLOORED
 * integer is what the key prints — which is why they are returned separately and
 * the caller never derives one from the other.
 *
 * Pure by construction: it takes the instant and the week-start dial as
 * arguments and touches no store, so it is testable without a mock.
 */

/** The five nested periods the card draws, outermost reading to innermost. */
export interface PeriodProgress {
  /** Raw 0…1 fractions — the arcs. */
  day: number;
  week: number;
  month: number;
  quarter: number;
  year: number;
  /** ISO week number of the day, for the note. */
  weekNumber: number;
  /** 1…4, for the note. */
  quarter1: number;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Elapsed over real length, clamped. The one rule, applied five times. */
const share = (now: number, start: Date, end: Date): number =>
  clamp01((now - start.getTime()) / (end.getTime() - start.getTime()));

/**
 * The printed reading. FLOORED — see the header. Returns an integer 0…100.
 */
export const pct = (fraction: number): number => Math.floor(clamp01(fraction) * 100);

/**
 * @param dayKey the day being viewed, `YYYY-MM-DD` — the periods are the ones
 *   CONTAINING it, so a back-dated day reads the progress of ITS week and month.
 * @param now the instant to measure at. A past day clamps to 1 and a future day
 *   to 0 by the same rule, with no special case — which is the point.
 * @param weekStartDow 0 = Sunday, 1 = Monday (the Settings dial).
 */
export function periodProgress(dayKey: string, now: Date, weekStartDow: 0 | 1): PeriodProgress {
  const y = Number(dayKey.slice(0, 4));
  const m = Number(dayKey.slice(5, 7)) - 1;
  const d = Number(dayKey.slice(8, 10));
  const t = now.getTime();

  // Local midnight, and the day's REAL length (23h / 24h / 25h across a DST
  // boundary) as the difference between two of them.
  const midnight = (yy: number, mm: number, dd: number): Date => new Date(yy, mm, dd);
  const dayStart = midnight(y, m, d);

  // The week runs from the CONFIGURED start, not a hardcoded Monday — this card
  // sits beside the nav calendar and the cadence dashboards, and a fixed Mon–Sun
  // made its week ring disagree with both (the 2026-08-04 dial).
  const dow = (dayStart.getDay() - weekStartDow + 7) % 7;
  const q = Math.floor(m / 3);

  return {
    day: share(t, dayStart, midnight(y, m, d + 1)),
    week: share(t, midnight(y, m, d - dow), midnight(y, m, d - dow + 7)),
    month: share(t, midnight(y, m, 1), midnight(y, m + 1, 1)),
    quarter: share(t, midnight(y, q * 3, 1), midnight(y, q * 3 + 3, 1)),
    year: share(t, midnight(y, 0, 1), midnight(y + 1, 0, 1)),
    weekNumber: isoWeekNumber(dayStart),
    quarter1: q + 1,
  };
}

/**
 * ISO-8601 week number. Kept here rather than imported from `metrics/dates`
 * because that module's `weekNum` takes a day STRING and this one already holds
 * the Date — and because a pure core with no imports is a pure core.
 * A week is labelled by the ISO week of its Thursday, always, regardless of the
 * week-start dial (the app's standing rule: the dial moves the BUCKET, never the
 * NUMBER).
 */
export function isoWeekNumber(day: Date): number {
  const t = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  // Thursday of this ISO week (ISO weeks always start Monday).
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const jan4 = new Date(t.getFullYear(), 0, 4);
  const jan4Thu = new Date(jan4.getFullYear(), jan4.getMonth(), jan4.getDate());
  jan4Thu.setDate(jan4Thu.getDate() + 3 - ((jan4Thu.getDay() + 6) % 7));
  return 1 + Math.round((t.getTime() - jan4Thu.getTime()) / (7 * 24 * 3600 * 1000));
}
