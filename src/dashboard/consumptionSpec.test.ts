import { describe, expect, it } from "vitest";
import { buildConsumptionDashboard, type BuildInput } from "./consumptionSpec";
import type { EntryRow, SessionRow } from "../metrics/shapes";

/**
 * The third clause of matrix probe **A2** — *"archiving ends any running
 * streak"* — which lives here rather than in `shapes.ts`: `streaks()` knows
 * nothing about a habit's lifecycle, so the clamp is the spec layer's, applied
 * on the way to the tile (user-ruled 2026-08-06, audit fork D — the minimal
 * cut: the CURRENT streak reads 0, every other tile keeps its face).
 *
 * The live-streak case is asserted first on purpose. Without it, the archived
 * assertion could pass against a fixture that simply had no streak to end.
 */

let seq = 0;
const sess = (day: string, entry_fk: string | null = "e1"): SessionRow => ({
  id: `s${++seq}`,
  entry_fk,
  day,
  measure_kind: "time",
  value: 60,
});

const ENTRIES: EntryRow[] = [
  { id: "e1", title: "Alpha", status: "Current", genre: ["RPG"], rating: 4, type: null },
];

/** Three consecutive finalized, played days ending at `today` → a 3-day streak. */
const DAYS = ["2026-01-12", "2026-01-13", "2026-01-14"];

const input = (archived: boolean): BuildInput => ({
  colourSlot: "habit-2",
  name: "Gaming",
  archived,
  sessions: DAYS.map((d) => sess(d)),
  entries: ENTRIES,
  finalized: new Set(DAYS),
  today: "2026-01-14",
  typeVocab: [],
  appActiveDays: DAYS,
});

const streakTile = (m: { engagement: { label: string; value: string; subtitle?: string }[] }, label: string) =>
  m.engagement.find((t) => t.label === label);

describe("archive ends a running streak", () => {
  it("reads the live streak while the habit is active", () => {
    const m = buildConsumptionDashboard(input(false), { kind: "all" });
    expect(streakTile(m, "Current streak")?.value).toBe("3");
  });

  it("clamps the CURRENT streak to zero once archived, and says why", () => {
    const m = buildConsumptionDashboard(input(true), { kind: "all" });
    expect(streakTile(m, "Current streak")).toMatchObject({
      value: "0",
      subtitle: "archived — streaks ended",
    });
  });

  it("leaves the LONGEST streak alone — archiving ends a run, it does not erase one", () => {
    const active = buildConsumptionDashboard(input(false), { kind: "all" });
    const filed = buildConsumptionDashboard(input(true), { kind: "all" });
    expect(streakTile(filed, "Longest streak")?.value).toBe(streakTile(active, "Longest streak")?.value);
    expect(streakTile(filed, "Longest streak")?.value).toBe("3");
  });

  it("keeps the year face historical — it reads 'Last streak', not a clamped current one", () => {
    // A year scope is a look back, so the clamp is deliberately not applied
    // there; the tile is already labelled as history.
    const m = buildConsumptionDashboard(input(true), { kind: "year", year: "2026" });
    expect(streakTile(m, "Current streak")).toBeUndefined();
    expect(streakTile(m, "Last streak")).toBeDefined();
  });

  it("does not otherwise change the dashboard when a habit is archived", () => {
    // Fork D's "minimal cut": only the streak tile moves.
    const active = buildConsumptionDashboard(input(false), { kind: "all" });
    const filed = buildConsumptionDashboard(input(true), { kind: "all" });
    expect(filed.volume).toEqual(active.volume);
    expect(filed.catalog).toEqual(active.catalog);
    expect(filed.distributions).toEqual(active.distributions);
  });
});
