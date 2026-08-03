/**
 * THE CATCH-UP QUEUE — one query, two doors (Build step 9, 2026-08-01).
 *
 * [[Day Finalize & Catch-Up]] gives the queue two entrances: Daily's catch-up
 * card (built 2026-07-27) and the nav calendar's **catch-up flag + popover**
 * (built now). They are the same machinery seen twice, not two features — so
 * the query lives here once rather than being copied into the rail, which is
 * the mistake the 2026-07-30 dedup pass spent four waves undoing elsewhere.
 *
 * MEMBERSHIP IS THE SPARSE LEDGER'S CALL, and it is the easy thing to get
 * wrong: a day is in the queue when it HAS a `days` row that is not finalized.
 * A past day with **no row at all is not a member** — it is an empty day, which
 * stays a first-class door on the calendar (back-dating) while owing nothing.
 * "Finalized + absent = didn't do; unfinalized + absent = not yet logged" is
 * the ruling, and only the first of those ever generates a row.
 */
import { evolu } from "../db/evolu";

/** Every unfinalized ledger row, newest first. Filter by date at the use-site:
 *  Daily wants "before the day being viewed", the rail wants "before today". */
export const unfinalizedQuery = evolu.createQuery((db) =>
  db
    .selectFrom("days")
    .select(["date"])
    .where("isDeleted", "is not", 1)
    .where("finalized", "=", 0)
    .orderBy("date", "desc"),
);

/** Rows → day strings strictly before `before` — today is never "behind". */
export const catchUpDays = (
  rows: readonly { date: unknown }[],
  before: string,
): string[] => rows.map((r) => String(r.date)).filter((d) => d < before);
