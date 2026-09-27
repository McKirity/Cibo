import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The per-picker pick ledgers (2026-09-27). The device store is stubbed with
 * an in-memory map — the ordering and the ledger bookkeeping touch nothing else.
 */
const mem = new Map<string, string>();
vi.mock("../settings/deviceStore", () => ({
  deviceGet: (k: string) => mem.get(k) ?? null,
  deviceSet: (k: string, v: string | null) => (v == null ? mem.delete(k) : mem.set(k, v)),
}));

const { byRecentPick, readPicks, recordPicks } = await import("./entryPicks");

const rows = (...ids: string[]) => ids.map((id) => ({ id }));
const ids = (list: { id: string }[]) => list.map((e) => e.id);

beforeEach(() => mem.clear());

describe("byRecentPick", () => {
  it("puts picked entries first, most recent on top, the rest in incoming order", () => {
    expect(ids(byRecentPick(rows("a", "b", "c", "d"), ["c", "a"]))).toEqual(["c", "a", "b", "d"]);
  });

  it("ignores picks that are not in the list", () => {
    expect(ids(byRecentPick(rows("a", "b"), ["zz", "b"]))).toEqual(["b", "a"]);
  });

  it("is the incoming order when nothing was picked", () => {
    expect(ids(byRecentPick(rows("b", "a"), []))).toEqual(["b", "a"]);
  });
});

describe("recordPicks", () => {
  it("moves a re-pick to the front without duplicating it", () => {
    recordPicks("daily", ["a"]);
    recordPicks("daily", ["b"]);
    expect(recordPicks("daily", ["a"])).toEqual(["a", "b"]);
  });

  it("keeps the two ledgers apart", () => {
    recordPicks("timer", ["t"]);
    recordPicks("daily", ["d"]);
    expect(readPicks("timer")).toEqual(["t"]);
    expect(readPicks("daily")).toEqual(["d"]);
  });

  it("reads a corrupt value as empty", () => {
    mem.set("cibo.picks.daily", "{not json");
    expect(readPicks("daily")).toEqual([]);
  });
});
