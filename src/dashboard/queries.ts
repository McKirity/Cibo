/**
 * Queries shared by the dashboard assembly hooks.
 *
 * Born 2026-08-04 (the third audit's dedup pass): `finalizedDaysQuery` existed
 * as five byte-identical module-level declarations — one per hook — which meant
 * five separate live subscriptions over the same row set, every one of them
 * re-running on any `days` write. Evolu dedupes the SQL, not the subscription
 * bookkeeping, and five copies is five places for a predicate to drift.
 *
 * The rule this file encodes: a query used by more than one hook lives HERE;
 * a query used by exactly one stays with its hook, where its shape is readable
 * beside the mapping that consumes it.
 */
import { evolu } from "../db/evolu";

/**
 * Every finalized day. `finalized` is the sole finalize truth (the sparse
 * `days` ledger — a row exists once a day has bookkeeping of any kind), so the
 * verdict layers read this rather than inferring completion from sessions.
 */
export const finalizedDaysQuery = evolu.createQuery((db) =>
  db
    .selectFrom("days")
    .select(["date"])
    .where("finalized", "=", 1)
    .where("isDeleted", "is not", 1),
);
