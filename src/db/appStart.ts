/**
 * The app's own start date — "when I started using this app as another thing to
 * track" (user-ruled 2026-07-26, an addition to the on-this-day card's personal
 * row; owning record: Final/Daily state 1 (working day).md § the ANNIVERSARIES
 * ruling).
 *
 * WHY THIS IS A NEW DATUM. The card already draws a tracking anniversary, but it
 * reads the EARLIEST SESSION in the store, which is a different fact: on the
 * seeded dev store that says five years while the app is hours old, and for any
 * real user who back-dates or imports history it will always run ahead of the
 * truth. The two lines coexist — "N years since your first Reading session" is
 * about the habit, this one is about Cibo.
 *
 * Stored in `app_meta` (the key-value table whose first tenant is the seed
 * version), so there is no schema change.
 *
 * BACKFILL. Stores created before this shipped carry no row. Rather than stamp
 * them "today" — which would silently reset the very fact being recorded — the
 * backfill reads the OLDEST `createdAt` in the store. Batch 1 of the seed is the
 * first thing ever written to a Cibo store, so that timestamp IS the store's
 * birthday. Only a store with no habits at all (impossible after a successful
 * seed) falls through to today.
 */
import { NonEmptyString100, NonEmptyString1000, type Evolu } from "@evolu/common";
import { Schema } from "./schema";

// Taken as a parameter, never the singleton, so the mock harness can drive it
// (the derivedKeyboard.ts precedent).
type CiboEvolu = Evolu<typeof Schema>;

const APP_START_KEY = "app_started";

/** Local calendar date of a timestamp — the store speaks local wall-clock. */
const toDateOnly = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * The pure half: given the stored row (or null) and the store's oldest known
 * timestamp (or null), what date should be recorded, and does it need writing?
 * Extracted so the decision is testable without Evolu — the
 * `resolveKeyboardWrite` pattern.
 */
export const resolveAppStart = (
  stored: string | null,
  oldestCreatedAt: string | null,
  today: string,
): { date: string; write: boolean } => {
  if (stored != null && /^\d{4}-\d{2}-\d{2}$/.test(stored)) {
    return { date: stored, write: false };
  }
  // Backfill: the store's own birthday, else today.
  const birthday =
    oldestCreatedAt != null && oldestCreatedAt.length >= 10
      ? oldestCreatedAt.slice(0, 10)
      : today;
  // A birthday can never be in the future; a skewed clock must not poison it.
  return { date: birthday > today ? today : birthday, write: true };
};

/**
 * Reads the app start date, writing it once if absent. Called at launch, after
 * the seed — so the backfill can see batch 1's rows on a fresh install.
 *
 * Returns the date, or null if the row could not be established (the caller
 * simply omits the line rather than inventing one — whimsy fails silent).
 */
export const ensureAppStartDate = async (
  evolu: CiboEvolu,
): Promise<string | null> => {
  const metaRows = await evolu.loadQuery(
    evolu.createQuery((db) =>
      db
        .selectFrom("app_meta")
        .select(["id", "value"])
        .where("key", "=", NonEmptyString100.orThrow(APP_START_KEY))
        .where("isDeleted", "is not", 1),
    ),
  );
  const stored = metaRows[0] ? String(metaRows[0].value) : null;

  // The store's birthday: batch 1's habits are the first rows ever written.
  const oldest = await evolu.loadQuery(
    evolu.createQuery((db) =>
      db
        .selectFrom("habits")
        .select((eb) => eb.fn.min("createdAt").as("first"))
        .where("isDeleted", "is not", 1),
    ),
  );
  const oldestCreatedAt = oldest[0]?.first != null ? String(oldest[0].first) : null;

  const { date, write } = resolveAppStart(stored, oldestCreatedAt, toDateOnly(new Date()));
  if (!write) return date;

  // Evolu mutations fail SILENTLY — check the Result (the 2026-07-23 lesson).
  const res = evolu.insert("app_meta", {
    key: NonEmptyString100.orThrow(APP_START_KEY),
    value: NonEmptyString1000.orThrow(date),
  });
  if (!res.ok) {
    console.error("appStart: recording app_started failed", res.error);
    return null;
  }
  return date;
};

/**
 * Whole years of using Cibo, when today is the anniversary of the start date.
 * Same shape as `trackingAnniversary` — the day itself is not an anniversary.
 */
export const appAnniversary = (
  startDate: string | null,
  dayKey: string,
): number | null => {
  if (!startDate) return null;
  if (startDate.slice(5) !== dayKey.slice(5)) return null;
  const years = Number(dayKey.slice(0, 4)) - Number(startDate.slice(0, 4));
  return years >= 1 ? years : null;
};
