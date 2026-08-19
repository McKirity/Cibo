/**
 * THE DAY-LEDGER TWIN REPAIR (2026-08-18) — the third always-run launch
 * reconciler, beside `ensureHabitIcons` and `ensureSleepMedLabel`.
 *
 * WHY IT EXISTS: `days.date` is app-unique, but the app can only check ITS OWN
 * store before inserting — two devices that each touch the same un-rowed day
 * before sync converges both insert, and the CRDT merge keeps both (found
 * 2026-08-18: the catch-up banner drew two "Yesterday" chips off a twinned
 * 2026-08-17; the real store carried twins on 08-09/08-14/08-16, each landing
 * on a two-device convergence moment). `withDayLedger` guards the
 * SINGLE-device race; the cross-device twin cannot be prevented, only healed
 * after the merge — which is exactly reconcile-at-launch territory, since the
 * repair is idempotent.
 *
 * WHY IT MATTERS beyond a doubled banner chip: `finalizeDay` seals the first
 * row it reads, so a twinned day whose OTHER row stays `finalized = 0` can
 * never leave the catch-up queue — a day the user finalized keeps reading as
 * "Still open" forever.
 *
 * MERGE RULES (user-ruled 2026-08-18, "yes" to the offered shape):
 *   · the OLDEST row survives (createdAt, id as the deterministic tie-break);
 *   · finalized flags OR together — any finalized twin finalizes the
 *     survivor, and the earliest twin `finalized_at` rides along (a survivor
 *     already finalized keeps its own stamp);
 *   · the survivor keeps its own feed snapshot; only a NULL one is filled
 *     from the oldest twin that has one (skip-never-overwrite, the importer
 *     idiom — a day must not lose its snapshot to the repair);
 *   · every other twin is tombstoned. Sessions are untouched by construction:
 *     they own their day as a DATE string, never as a days-row FK.
 *
 * The planner is pure and tested (dayLedger.test.ts); the runner follows the
 * sibling reconcilers' discipline — every mutation Result checked via
 * `verifiedUpdate`, never throws from the launch path, a failure logs and
 * retries next launch.
 */
import type { Evolu } from "@evolu/common";
import type { Schema } from "./schema";
import { verifiedUpdate } from "./seed";

type CiboEvolu = Evolu<typeof Schema>;

/** The slice of a `days` row the planner reasons over (already isDeleted-filtered). */
export interface DayRowLike {
  id: string;
  date: string;
  finalized: number;
  finalized_at: string | null;
  feed_snapshot: string | null;
  createdAt: string;
}

export interface DayMergePlan {
  date: string;
  survivorId: string;
  /** Fields to write onto the survivor; null when it already carries the merge. */
  update: { finalized?: 1; finalized_at?: string | null; feed_snapshot?: string } | null;
  tombstoneIds: string[];
}

/** Oldest-first, id as the tie-break so two devices plan identically. */
const byAge = (a: DayRowLike, b: DayRowLike): number =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1;

export function planDayMerges(rows: readonly DayRowLike[]): DayMergePlan[] {
  const byDate = new Map<string, DayRowLike[]>();
  for (const r of rows) {
    const list = byDate.get(r.date);
    if (list == null) byDate.set(r.date, [r]);
    else list.push(r);
  }
  const plans: DayMergePlan[] = [];
  for (const [date, twins] of byDate) {
    if (twins.length < 2) continue;
    twins.sort(byAge);
    const [survivor, ...rest] = twins;
    const update: NonNullable<DayMergePlan["update"]> = {};
    if (survivor.finalized !== 1 && rest.some((t) => t.finalized === 1)) {
      update.finalized = 1;
      // the earliest finalize stamp among the finalized twins — the moment the
      // user actually sealed the day
      update.finalized_at = rest
        .filter((t) => t.finalized === 1)
        .map((t) => t.finalized_at)
        .sort()[0];
    }
    if (survivor.feed_snapshot == null) {
      const snap = rest.find((t) => t.feed_snapshot != null)?.feed_snapshot;
      if (snap != null) update.feed_snapshot = snap;
    }
    plans.push({
      date,
      survivorId: survivor.id,
      update: Object.keys(update).length > 0 ? update : null,
      tombstoneIds: rest.map((t) => t.id),
    });
  }
  return plans;
}

/**
 * The launch runner. Survivor updates land BEFORE the tombstones: if the run
 * dies between the two, the store holds a healed survivor plus a twin the next
 * launch removes — never a tombstoned finalize that failed to transfer.
 */
export async function ensureUniqueDayRows(evolu: CiboEvolu): Promise<void> {
  try {
    const q = evolu.createQuery((db) =>
      db
        .selectFrom("days")
        .select(["id", "date", "finalized", "finalized_at", "feed_snapshot", "createdAt"])
        .where("isDeleted", "is not", 1),
    );
    const rows = (await evolu.loadQuery(q)).map((r) => ({
      id: String(r.id),
      date: String(r.date),
      finalized: Number(r.finalized ?? 0),
      finalized_at: r.finalized_at == null ? null : String(r.finalized_at),
      feed_snapshot: r.feed_snapshot == null ? null : String(r.feed_snapshot),
      createdAt: String(r.createdAt),
    }));
    const plans = planDayMerges(rows);
    if (plans.length === 0) return;
    console.info(
      `Day ledger: merging twin rows on ${plans.map((p) => `${p.date}×${p.tombstoneIds.length + 1}`).join(", ")}`,
    );
    for (const plan of plans) {
      if (plan.update != null) {
        await verifiedUpdate(
          (opts) =>
            evolu.update(
              "days",
              { id: plan.survivorId, ...plan.update } as never,
              opts,
            ),
          `Day ledger merge (${plan.date})`,
        );
      }
      for (const id of plan.tombstoneIds) {
        await verifiedUpdate(
          (opts) => evolu.update("days", { id, isDeleted: 1 } as never, opts),
          `Day ledger tombstone (${plan.date})`,
        );
      }
    }
  } catch (e) {
    console.error("Day ledger: twin repair failed (will retry next launch)", e);
  }
}
