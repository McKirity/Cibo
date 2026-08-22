# Migration rules

How Cibo's data layer changes shape without ever losing data. Written at the
Phase-2 completion audit (2026-08-06), re-trued at v1.0.0 (2026-08-21); the
mechanisms live in `src/db/seed.ts` and `src/db/schema.ts`. `SEED_VERSION` is
10 at v1.0.0.

## The rules

- **Forward-only, always.** There is no down-migration. A released schema
  change is permanent; anything wrong is fixed by a further forward change.
- **Additive by default.** New columns are nullable and apply live, lossless,
  and writable (verified at Build step 2). A removed column simply parks in the
  store, harmless. Renames are additions + readers that accept both.
- **Version-gate what must run once; reconcile-at-launch what is idempotent.**
  One-shot data plants ride `SEED_VERSION`-gated batches; anything safe to
  re-run runs at every launch instead — idempotence beats bookkeeping. The
  three live reconcilers are the worked examples: `ensureHabitIcons` (every
  habit carries an icon), `ensureSleepMedLabel` (rewrites ONLY the exact old
  label string, so a deliberate later rename is never fought) and
  `ensureUniqueDayRows` (`dayLedger.ts` — two devices creating the same
  day's row before syncing twin it; oldest survives, `finalized` ORs, extras
  tombstone). A rename shipped as a gated batch once simply never ran (the
  session was hot-reloading); it was idempotent and should have been a
  reconciler from the start.
- **A version-gated batch must verify before it latches** (the batch-4
  pattern, paid for 2026-07-23): check every mutation `Result`, await
  `onComplete`, re-read a planted row, and THROW to hold the gate if anything
  is missing. Evolu mutations fail silently — an unchecked `Result` can drop a
  whole transaction with no log.
- **Never trust a batch's first run to a hot reload.** The re-read guard sees
  the optimistic layer, not the disk; verify at a clean launch.
- **Chains must run in sequence.** A long-offline device updates across
  several app versions at once, so batches must apply cleanly in order from
  any starting version. Phase 2 step 2's test battery exercises this
  (forward-only, in sequence, from each historical `SEED_VERSION`).
- **Sync-safe by construction.** Migrations only ever ADD rows/columns or
  write via CRDT mutations, so two devices at different app versions merge
  without conflict. **Version-skew** (an old app reading a newer store) is
  survivable because unknown columns are ignored and unknown rows are inert —
  in practice the two devices have run a version apart across every release
  so far (one machine updates on quit before the other) without incident.
