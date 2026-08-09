/**
 * DEV-ONLY — un-finalize the most recent finalized days, so a tester can put
 * days back into the catch-up queue.
 *
 * WHY THIS EXISTS, recorded because the reason is a real gap and not a
 * convenience: **un-finalize is ruled LEGAL and has never been built** — it has
 * no drawn control anywhere, and has sat on the carried-seams list since Build.
 * That cost nothing until Phase 2 step 2's tour 7 asked for the rail's known
 * worst case — *a 6-week month WITH the catch-up flag lit* — and there turned
 * out to be no way to create the condition on a store whose past is fully
 * finalized (2026-08-08, user: *"You'll have to manually clear a few finalized
 * days to test this"*). A store cannot be edited from outside either: it is a
 * CRDT, so hand-editing the SQLite image would bypass the merge layer.
 *
 * **This is NOT the un-finalize feature.** It is a test instrument, and it is
 * deliberately shaped like one — newest-first, count-bounded, no picker, no
 * confirm, no undo. The real control (if it is ever ruled to have one) belongs
 * on the day surface, guarded, and would set `finalized_at` back to null
 * through the day-ledger chain like every other day write.
 *
 * DEV-GATED AT THE CALL SITE + dynamically imported, the `seedRich` precedent,
 * so this module is verifiably absent from a production bundle.
 *
 * Takes `evolu` as a parameter rather than reaching for the singleton — the
 * convention every evolu-touching helper here follows.
 */
import { type Evolu } from "@evolu/common";
import { Schema } from "../db/schema";

type CiboEvolu = Evolu<typeof Schema>;

/**
 * Clear the `finalized` flag on the `count` most recently finalized days.
 *
 * Newest-first is the deliberate choice: the catch-up queue is "days behind
 * today", so the days nearest today are the ones that put the flag on screen
 * with the least disturbance to the seeded history.
 *
 * Returns the days actually cleared, so the caller can name them rather than
 * report a number the user has to take on trust.
 */
export async function unfinalizeRecentDays(
  evolu: CiboEvolu,
  count: number,
): Promise<{ cleared: string[] }> {
  const finalizedDays = evolu.createQuery((db) =>
    db
      .selectFrom("days")
      .select(["id", "date"])
      .where("isDeleted", "is not", 1)
      .where("finalized", "=", 1)
      .orderBy("date", "desc"),
  );
  const rows = (await evolu.loadQuery(finalizedDays)).slice(0, Math.max(1, count));

  const cleared: string[] = [];
  for (const row of rows) {
    // `finalized_at` goes back to null with the flag. Leaving a stamp behind on
    // an unfinalized day would be a row that contradicts itself, and the doctor
    // would be right to be confused by it later.
    const res = evolu.update("days", {
      id: row.id as never,
      finalized: 0,
      finalized_at: null,
    });
    if (res.ok) cleared.push(String(row.date));
    else console.error("devUnfinalize: update failed", res.error);
  }
  return { cleared };
}
