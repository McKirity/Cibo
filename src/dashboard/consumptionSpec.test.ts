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

/**
 * The distributions + Catalog re-ruling of 2026-08-22 (user: *"By Status
 * should show ALL entry statuses… it should've shown Planned"* · *"By rating
 * isn't appearing either even though one entry has already been rated"* ·
 * *"there shouldn't be any catalog sections except for Youtube"*).
 */
const FRESH: EntryRow[] = [
  { id: "e1", title: "Alpha", status: "Planned", genre: [], rating: 4, type: null },
  { id: "e2", title: "Beta", status: "Planned", genre: [], rating: null, type: null },
];

const freshInput = (entries: EntryRow[], typeVocab: string[] = []): BuildInput => ({
  colourSlot: "habit-2",
  name: "Gaming",
  archived: false,
  sessions: [sess("2026-01-14", "e1")],
  entries,
  finalized: new Set(["2026-01-14"]),
  today: "2026-01-14",
  typeVocab,
  appActiveDays: ["2026-01-14"],
});

const dist = (m: ReturnType<typeof buildConsumptionDashboard>, title: string) =>
  m.distributions.find((d) => d.title === title);

describe("a fresh habit's distributions", () => {
  it("shows By Status with a single value — every entry Planned reads Planned", () => {
    const m = buildConsumptionDashboard(freshInput(FRESH), { kind: "all" });
    expect(dist(m, "By Status")?.rows.map((r) => [r.label, r.value])).toEqual([["Planned", "2"]]);
  });

  it("shows By Rating once ONE entry is rated", () => {
    const m = buildConsumptionDashboard(freshInput(FRESH), { kind: "all" });
    expect(dist(m, "By Rating")?.rows).toHaveLength(1);
  });

  it("still drops a distribution with nothing in it (no genres yet)", () => {
    const m = buildConsumptionDashboard(freshInput(FRESH), { kind: "all" });
    expect(dist(m, "By Genre")).toBeUndefined();
  });

  it("never merges a non-YouTube habit into a Catalog zone, however sparse", () => {
    const m = buildConsumptionDashboard(freshInput([FRESH[1]]), { kind: "all" });
    expect(m.mergedCatalog).toBeNull();
    expect(m.catalog.map((t) => t.label)).toEqual(["Titles tracked"]);
  });
});

describe("the YouTube Catalog zone", () => {
  const CHANNELS: EntryRow[] = [
    { id: "e1", title: "Kurzgesagt", status: "Current", genre: ["Science"], rating: null, type: "Youtube" },
    { id: "e2", title: "Noclip", status: "Current", genre: ["Gaming"], rating: null, type: "Youtube" },
  ];

  it("merges the channel count + By Genre on the YouTube face only", () => {
    const input = freshInput(CHANNELS, ["Youtube", "Film"]);
    const yt = buildConsumptionDashboard(input, { kind: "all" }, "Youtube");
    expect(yt.mergedCatalog?.hallTitle).toBe("Channels");
    expect(yt.mergedCatalog?.dist?.title).toBe("By Genre");
    // the hall ranks by logged time, so only the channel with a session lists
    expect(yt.mergedCatalog?.tile.list?.rows.map((r) => r.k)).toEqual(["Kurzgesagt"]);
    // the merged pieces leave their old homes; the one-value status stays a distribution
    expect(yt.catalog).toEqual([]);
    expect(yt.distributions.map((d) => d.title)).toEqual(["By Status"]);
    // the All-types face of the same habit is NOT merged
    const all = buildConsumptionDashboard(input, { kind: "all" }, null);
    expect(all.mergedCatalog).toBeNull();
  });

  it("keeps the hall when no channel carries a genre yet", () => {
    const bare = CHANNELS.map((c) => ({ ...c, genre: [] }));
    const yt = buildConsumptionDashboard(freshInput(bare, ["Youtube"]), { kind: "all" }, "Youtube");
    expect(yt.mergedCatalog).not.toBeNull();
    expect(yt.mergedCatalog?.dist).toBeNull();
  });
});
