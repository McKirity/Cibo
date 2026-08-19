/**
 * The day-ledger twin planner over synthetic rows (the doctor.test discipline:
 * pure decisions tested, the Evolu writes exercised live). The fixture shapes
 * mirror the two real stores the repair was built against on 2026-08-18 —
 * the dev store's twinned 08-17 and the real store's 08-09/08-14 pairs (one
 * finalized twin each) and 08-16 triple.
 */
import { describe, expect, it } from "vitest";
import { planDayMerges, type DayRowLike } from "./dayLedger";

const row = (over: Partial<DayRowLike> & { id: string; date: string }): DayRowLike => ({
  finalized: 0,
  finalized_at: null,
  feed_snapshot: null,
  createdAt: "2026-08-18T00:00:00.000Z",
  ...over,
});

describe("planDayMerges", () => {
  it("plans nothing for a healthy ledger", () => {
    expect(
      planDayMerges([
        row({ id: "a", date: "2026-08-17" }),
        row({ id: "b", date: "2026-08-16", finalized: 1 }),
      ]),
    ).toEqual([]);
  });

  it("keeps the oldest row and tombstones the rest", () => {
    const plans = planDayMerges([
      row({ id: "mac", date: "2026-08-17", createdAt: "2026-08-18T05:43:05.399Z" }),
      row({ id: "pc", date: "2026-08-17", createdAt: "2026-08-18T03:59:33.807Z" }),
    ]);
    expect(plans).toEqual([
      { date: "2026-08-17", survivorId: "pc", update: null, tombstoneIds: ["mac"] },
    ]);
  });

  it("carries a twin's finalize onto an unfinalized survivor (the stuck-queue case)", () => {
    const plans = planDayMerges([
      row({ id: "old", date: "2026-08-09", createdAt: "2026-08-09T07:05:41.269Z" }),
      row({
        id: "new",
        date: "2026-08-09",
        finalized: 1,
        finalized_at: "2026-08-10T21:08",
        createdAt: "2026-08-10T04:58:24.355Z",
      }),
    ]);
    expect(plans[0].survivorId).toBe("old");
    expect(plans[0].update).toEqual({ finalized: 1, finalized_at: "2026-08-10T21:08" });
    expect(plans[0].tombstoneIds).toEqual(["new"]);
  });

  it("never touches a survivor's own finalize stamp", () => {
    const plans = planDayMerges([
      row({
        id: "old",
        date: "2026-08-14",
        finalized: 1,
        finalized_at: "2026-08-14T22:42",
        createdAt: "2026-08-15T01:26:16.923Z",
      }),
      row({
        id: "new",
        date: "2026-08-14",
        finalized: 1,
        finalized_at: "2026-08-15T09:00",
        createdAt: "2026-08-15T05:36:38.885Z",
      }),
    ]);
    expect(plans[0].update).toBeNull();
  });

  it("fills a null snapshot from the oldest twin that has one — and never overwrites", () => {
    const filled = planDayMerges([
      row({ id: "a", date: "2026-08-16", createdAt: "2026-08-15T20:00:00.000Z" }),
      row({ id: "b", date: "2026-08-16", feed_snapshot: "{}", createdAt: "2026-08-17T02:00:00.000Z" }),
    ]);
    expect(filled[0].update).toEqual({ feed_snapshot: "{}" });

    const kept = planDayMerges([
      row({ id: "a", date: "2026-08-16", feed_snapshot: "{mine}", createdAt: "2026-08-15T20:00:00.000Z" }),
      row({ id: "b", date: "2026-08-16", feed_snapshot: "{theirs}", createdAt: "2026-08-17T02:00:00.000Z" }),
    ]);
    expect(kept[0].update).toBeNull();
  });

  it("collapses a triple into one survivor and two tombstones", () => {
    const plans = planDayMerges([
      row({ id: "c", date: "2026-08-16", createdAt: "2026-08-17T06:21:09.615Z" }),
      row({ id: "a", date: "2026-08-16", createdAt: "2026-08-15T20:34:58.504Z" }),
      row({ id: "b", date: "2026-08-16", createdAt: "2026-08-17T02:43:17.310Z" }),
    ]);
    expect(plans[0].survivorId).toBe("a");
    expect(plans[0].tombstoneIds).toEqual(["b", "c"]);
  });

  it("breaks createdAt ties by id, so every device plans the same merge", () => {
    const twins = [
      row({ id: "z", date: "2026-08-17" }),
      row({ id: "a", date: "2026-08-17" }),
    ];
    expect(planDayMerges(twins)[0].survivorId).toBe("a");
    expect(planDayMerges([...twins].reverse())[0].survivorId).toBe("a");
  });
});
