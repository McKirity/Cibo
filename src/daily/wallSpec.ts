/**
 * THE COVER WALL'S TILE VOCABULARY — spec-then-render, the step-4 pattern.
 *
 * Owning record: `Final/Daily state 2 (cover wall).md`. This file turns one
 * finalized day into a list of tiles with their u-multiple spans; `wallPack.ts`
 * decides where they go and `CoverWall.tsx` draws them. Nothing here decides
 * anything the corpus already ruled.
 *
 * THE SEVEN KINDS ON THE WALL (six from the handoff, plus the milestone family
 * cards the concurrent chat added):
 *
 *   cover / yt   consumption entries — the entry's own art, or the
 *                `kit-tile-fallback` treatment: slot colour as the field, title
 *                as the hero. Square-source entries render square.
 *   banner       creation entries — the 6×2 widest mass: banner + the numbers.
 *   keepsake     simple/range habits — the code-drawn snippet in its shadow
 *                root (`KeepsakeTile`).
 *   whimsy       the grout between the stones, quieter than a habit tile.
 *   milestone    one card per family that fired + the continuing-streaks card.
 *   unlogged     a uniform 1×1 grayed label-square, NEVER the logged shape.
 *   cluster      the unlogged remainder, collected into one labelled block.
 *
 * WHICH WHIMSY FOLDS, and why it is not all of them. The screen note says wall
 * whimsy comes from `feed_snapshot`, "absent → omitted, never faked" — and the
 * next sentence says the sun tile renders AT SOLAR NOON on a past day, which
 * only a recomputation can do. [[Calendar & Whimsy]] settles it: "cards on an
 * old wall compute FOR THAT DATE... Exception: the horoscope shows only what
 * was snapshotted." So the eight computed cards recompute here, and the three
 * NETWORK cards (weather · horoscope · tarot) are the ones `feed_snapshot`
 * owns — absent until the network tier, therefore omitted, never faked.
 */
import type { ContinuingStreak, MilestoneDay, MilestoneFamily, MilestoneItem } from "./milestones";
import type { FeedSnapshot, HoroscopeSnap, TarotSnap, WeatherSnap } from "./feedData";
import { hoursMinutes, groupInt } from "../metrics/format";
import { sessionMinutes } from "../metrics/shapes";
import type { KeepsakeValues } from "./keepsake";
import { keepsakeValues } from "./keepsake";
import { DEFAULT_BUDGET_HALF_ROWS, RANK, type PackInput, type Span } from "./wallPack";

// ── The tiles ────────────────────────────────────────────────────────────────

export type WhimsyWhich =
  | "sun"
  | "season"
  | "year"
  | "moon"
  | "word"
  | "fact"
  | "quote"
  | "otd"
  | "holiday";

export interface CoverTile {
  kind: "cover";
  /** Set when the entry's Medium reads as a square source (a channel pfp). */
  square: boolean;
  /** The day's biggest entry wears the taller span + the larger title. */
  big: boolean;
  slot: string;
  eyebrow: string;
  title: string;
  cover: string | null;
  duration: string;
  rating: number | null;
  entryId: string;
  habitKey: string | null;
  /** The habit's stored lucide name (`habits.icon`) — the cover's corner glyph. */
  icon: string | null;
}

export interface BannerTile {
  kind: "banner";
  slot: string;
  eyebrow: string;
  title: string;
  /** The bout's own categorical line ("Rough Draft · Characters"), or null. */
  stage: string | null;
  /** BOTH refs ride, and the tile shows both (user-ruled 2026-08-06: "I want
   *  the tile to show both"). The banner is the card-spanning background; the
   *  cover is a thumbnail in the info band. A banner-less entry promotes its
   *  cover to the background rather than drawing it twice. Both null = the
   *  slot-derived gradient field, still a designed look. */
  banner: string | null;
  cover: string | null;
  nums: string;
  entryId: string;
  habitKey: string | null;
}

export interface KeepsakeWallTile {
  kind: "keepsake";
  habitKey: string | null;
  habitName: string;
  colourSlot: string;
  snippet: string | null;
  values: KeepsakeValues;
  /** Range habits take the 4×2 horizontal; simple habits the 2×2 square. */
  wide: boolean;
}

export interface WhimsyTile {
  kind: "whimsy";
  which: WhimsyWhich;
}

/**
 * The three EPHEMERAL tiles — `feed_snapshot`'s tenants (the network tier,
 * 2026-07-27). Unlike the computed whimsy they never recompute: the wall shows
 * exactly what was captured on the day, and an uncaptured day shows nothing —
 * "absent → omitted, never faked" applies to these three literally.
 */
export interface WeatherWallTile {
  kind: "wx";
  snap: WeatherSnap;
}

export interface HoroscopeWallTile {
  kind: "horo";
  snap: HoroscopeSnap;
}

export interface TarotWallTile {
  kind: "tarot";
  snap: TarotSnap;
}

export interface MilestoneTile {
  kind: "milestone";
  family: MilestoneFamily;
  label: string;
  items: MilestoneItem[];
  /** Thresholds splits counts from accumulations; every other family is one list. */
  split: boolean;
}

export interface StreaksTile {
  kind: "streaks";
  streaks: ContinuingStreak[];
}

export interface UnloggedTile {
  kind: "unlogged";
  name: string;
}

export interface ClusterTile {
  kind: "cluster";
  names: string[];
}

export type WallTileBody =
  | CoverTile
  | BannerTile
  | KeepsakeWallTile
  | WhimsyTile
  | WeatherWallTile
  | HoroscopeWallTile
  | TarotWallTile
  | MilestoneTile
  | StreaksTile
  | UnloggedTile
  | ClusterTile;

export interface WallTile {
  /** Stable across renders — React's key and the pack's tie-break identity. */
  id: string;
  body: WallTileBody;
}

// ── Spans, in whole columns × HALF-rows (a whole unit = 2 half-rows) ─────────
//
// The row step halved at the 2026-07-26 milestone amendment; EVERY tile below
// spans 2N half-rows and is therefore pixel-identical to its frozen geometry.
// Only the milestone cards use the odd steps, and theirs are measured.

/** The creation banner's DRAWN column span. Exported because the wall's banner
 *  pass (CoverWall) starts from it and may reserve fewer columns once the art
 *  reports its aspect — two copies of the number would drift the first time
 *  this one moved. */
export const BANNER_COLS = 6;

const SPANS = {
  coverBig: { cols: 2, halfRows: 8 },   // 2×4
  cover: { cols: 2, halfRows: 6 },      // 2×3, the drawn default
  square: { cols: 2, halfRows: 4 },     // 2×2 — YouTube channels, simple keepsakes
  sleep: { cols: 4, halfRows: 4 },      // 4×2, the seed
  banner: { cols: BANNER_COLS, halfRows: 4 },  // 6×2, the widest mass
  glance: { cols: 1, halfRows: 2 },     // 1×1
  sliver: { cols: 2, halfRows: 2 },     // 2×1
  strip: { cols: 3, halfRows: 2 },      // 3×1
  wideStrip: { cols: 4, halfRows: 2 },  // 4×1
  cluster: { cols: 3, halfRows: 4 },    // 3×2
  /** 1×2 — the tarot, "the wall's only small vertical" (drawn anatomy). */
  tarotTall: { cols: 1, halfRows: 4 },
  /** Provisional only — a milestone card's real span is MEASURED at render. */
  milestone: { cols: 3, halfRows: 4 },
} as const satisfies Record<string, Span>;

/**
 * THE COVER HEIGHT CEILING (2026-08-02) — a cover tile may not grow past this
 * share of the visible wall, and when it would, its WIDTH gives way instead
 * (CoverWall's cover pass). Once heights come off the art, nothing else stops
 * one tall poster from owning the whole wall.
 *
 * A SHARE, not a pixel figure, because the wall unit is fixed while the window
 * is not: any px ceiling that behaves at 2560 lets a hero run away at 1920, and
 * one that behaves at 1920 crops every poster at 2560. The number is the
 * corpus's own — the drawn `big` cover stood 8 half-rows in an 18-half-row
 * viewport, and that is the tallest a cover was ever drawn.
 */
export const COVER_CAP_SHARE = SPANS.coverBig.halfRows / DEFAULT_BUDGET_HALF_ROWS;

const WHIMSY_SPANS: Record<WhimsyWhich, Span> = {
  sun: SPANS.sliver,
  season: SPANS.sliver,
  year: SPANS.sliver,
  moon: SPANS.glance,
  // Word + fact outgrew the drawn 1×1 glance at the first live pass
  // (user-ruled 2026-07-27): the fact text clipped mid-word, and the word tile
  // gained its definition — real content the FINAL's sample data never carried.
  word: SPANS.strip,
  fact: SPANS.sliver,
  quote: SPANS.strip,
  otd: SPANS.strip,
  holiday: SPANS.sliver,
};

export const spanOf = (t: WallTileBody): Span => {
  switch (t.kind) {
    case "cover":
      return t.square ? SPANS.square : t.big ? SPANS.coverBig : SPANS.cover;
    case "banner":
      return SPANS.banner;
    case "keepsake":
      return t.wide ? SPANS.sleep : SPANS.square;
    case "whimsy":
      return WHIMSY_SPANS[t.which];
    // The ephemeral three wear their drawn spans: weather = 1×1 glance,
    // horoscope = 4×1 strip, tarot = the 1×2 vertical.
    case "wx":
      return SPANS.glance;
    case "horo":
      return SPANS.wideStrip;
    case "tarot":
      return SPANS.tarotTall;
    case "milestone":
    case "streaks":
      return SPANS.milestone;
    case "unlogged":
      return SPANS.glance;
    case "cluster":
      return SPANS.cluster;
  }
};

export const rankOf = (t: WallTileBody, seedHabitKey: string | null): number => {
  switch (t.kind) {
    case "keepsake":
      // Sleep-seeded: the range keepsake lands mid-canvas and everything else
      // accretes around it.
      return t.habitKey === seedHabitKey ? RANK.seed : RANK.mass;
    case "cover":
    case "banner":
      return RANK.mass;
    case "milestone":
    case "streaks":
      return RANK.milestone;
    case "whimsy":
    case "wx":
    case "horo":
    case "tarot":
      // The snapshot tiles are grout exactly like the computed whimsy.
      return RANK.whimsy;
    case "unlogged":
      return RANK.unlogged;
    case "cluster":
      return RANK.cluster;
  }
};

// ── The input rows ───────────────────────────────────────────────────────────

export interface WallHabit {
  id: string;
  key: string | null;
  name: string;
  kind: "project" | "simple" | "range";
  sub_type: "consumption" | "creation" | null;
  colour_slot: string;
  icon: string | null;
  measures_time: boolean;
  measures_count: boolean;
  count_unit: string | null;
  keepsake_snippet: string | null;
  /** Derived-rule labels, so a keepsake's `{{flags}}` can carry them. */
  derived_rules: ReadonlyArray<{ label: string }>;
  sort_order: number | null;
}

export interface WallSession {
  id: string;
  habit_fk: string;
  entry_fk: string | null;
  measure_kind: "time" | "count" | "range" | "none";
  value: number | null;
  start: string | null;
  end: string | null;
  source: string;
}

export interface WallEntry {
  id: string;
  habit_fk: string;
  title: string;
  type: string | null;
  cover: string | null;
  banner: string | null;
  rating: number | null;
}

export interface WallInput {
  day: string;
  habits: ReadonlyArray<WallHabit>;
  sessions: ReadonlyArray<WallSession>;
  entries: ReadonlyArray<WallEntry>;
  /** session id → { definition key → value }. */
  cats: ReadonlyMap<string, Readonly<Record<string, string>>>;
  /** Derived-rule labels that held, per session id — the range flags. */
  ruleHits: ReadonlyMap<string, ReadonlyArray<string>>;
  milestones: MilestoneDay | null;
  /** Which computed whimsy tiles have something to say on this day. */
  whimsy: ReadonlyArray<WhimsyWhich>;
  /** The day's ephemeral capture — weather · horoscope · tarot, or null. */
  snapshot: FeedSnapshot | null;
}

// ── Small derivations ────────────────────────────────────────────────────────
// minutes-of-a-session = metrics/shapes.sessionMinutes (2026-07-30 dedup).

/** Family names, in the order the day's cards are built. */
const FAMILY_LABEL: Record<MilestoneFamily, string> = {
  threshold: "Thresholds",
  record: "Records",
  anniversary: "Anniversaries",
  lifecycle: "Lifecycle",
  rank: "Rank change",
};
const FAMILY_ORDER: MilestoneFamily[] = [
  "threshold",
  "record",
  "anniversary",
  "lifecycle",
  "rank",
];

// ── The builder ──────────────────────────────────────────────────────────────

export function buildWall(input: WallInput): WallTile[] {
  const tiles: WallTile[] = [];
  const entryById = new Map(input.entries.map((e) => [e.id, e]));
  const rowsByHabit = new Map<string, WallSession[]>();
  for (const s of input.sessions) {
    const list = rowsByHabit.get(s.habit_fk) ?? [];
    list.push(s);
    rowsByHabit.set(s.habit_fk, list);
  }

  // The day's biggest consumption entry takes the taller span and the larger
  // title — the FINAL's `.cover.big`. *(Build mechanic: the frozen file marks
  // one cover big by hand; "which one" was never ruled, and the day's longest
  // sitting is the honest reading of a keepsake.)*
  let bigEntryId: string | null = null;
  let bigMinutes = 0;

  for (const habit of input.habits) {
    const rows = rowsByHabit.get(habit.id) ?? [];
    if (rows.length === 0) continue;
    if (habit.kind !== "project" || habit.sub_type !== "consumption") continue;
    const byEntry = new Map<string, number>();
    for (const s of rows) {
      if (s.entry_fk == null) continue;
      byEntry.set(s.entry_fk, (byEntry.get(s.entry_fk) ?? 0) + sessionMinutes(s));
    }
    for (const [id, mins] of byEntry)
      if (mins > bigMinutes) ((bigMinutes = mins), (bigEntryId = id));
  }

  for (const habit of input.habits) {
    const rows = rowsByHabit.get(habit.id) ?? [];

    // ── unlogged: every active habit is on the wall, logged or not ──────────
    if (rows.length === 0) {
      tiles.push({
        id: `unlogged:${habit.id}`,
        body: { kind: "unlogged", name: habit.name },
      });
      continue;
    }

    // ── project habits: one tile per ENTRY touched that day ────────────────
    if (habit.kind === "project") {
      const byEntry = new Map<string, WallSession[]>();
      for (const s of rows) {
        if (s.entry_fk == null) continue;
        const list = byEntry.get(s.entry_fk) ?? [];
        list.push(s);
        byEntry.set(s.entry_fk, list);
      }
      for (const [entryId, bouts] of byEntry) {
        const entry = entryById.get(entryId);
        if (entry == null) continue;
        const mins = bouts.reduce((a, s) => a + sessionMinutes(s), 0);
        const counts = bouts
          .filter((s) => s.measure_kind === "count")
          .reduce((a, s) => a + (s.value ?? 0), 0);

        if (habit.sub_type === "creation") {
          // The bout's own categoricals make the stage line (Writing's
          // "Rough Draft · Characters"); a habit with none renders no line.
          const parts: string[] = [];
          for (const s of bouts)
            for (const v of Object.values(input.cats.get(s.id) ?? {}))
              if (v !== "" && v !== "true" && v !== "false" && !parts.includes(v)) parts.push(v);
          const nums = [
            mins > 0 ? hoursMinutes(mins) : null,
            counts > 0 ? `${groupInt(counts)} ${habit.count_unit ?? ""}`.trim() : null,
          ]
            .filter((x): x is string => x != null)
            .join("  ·  ");
          tiles.push({
            id: `banner:${entryId}`,
            body: {
              kind: "banner",
              slot: habit.colour_slot,
              eyebrow: habit.name,
              title: entry.title,
              stage: parts.length > 0 ? parts.join(" · ") : null,
              banner: entry.banner,
              cover: entry.cover,
              nums: nums === "" ? hoursMinutes(mins) : nums,
              entryId,
              habitKey: habit.key,
            },
          });
          continue;
        }

        // Consumption. A square-source entry renders square — shape follows
        // content, the ruling's own words; YouTube is the corpus's one such
        // Medium and the same vocab string the chunk-1 channel hall reads.
        const square = (entry.type ?? "").toLowerCase() === "youtube";
        tiles.push({
          id: `cover:${entryId}`,
          body: {
            kind: "cover",
            square,
            big: !square && entryId === bigEntryId,
            slot: habit.colour_slot,
            eyebrow: entry.type != null ? `${habit.name} · ${entry.type}` : habit.name,
            title: entry.title,
            cover: entry.cover,
            duration: hoursMinutes(mins),
            rating: entry.rating,
            entryId,
            habitKey: habit.key,
            icon: habit.icon,
          },
        });
      }
      continue;
    }

    // ── simple + range: the code-drawn keepsake ────────────────────────────
    const cats: Record<string, string> = {};
    for (const s of rows) Object.assign(cats, input.cats.get(s.id) ?? {});
    const flags = new Set<string>();
    for (const s of rows) {
      for (const label of input.ruleHits.get(s.id) ?? []) flags.add(label);
      for (const [k, v] of Object.entries(input.cats.get(s.id) ?? {}))
        if (v === "true") flags.add(k.includes("_") ? k.slice(k.indexOf("_") + 1) : k);
    }
    tiles.push({
      id: `keepsake:${habit.id}`,
      body: {
        kind: "keepsake",
        habitKey: habit.key,
        habitName: habit.name,
        colourSlot: habit.colour_slot,
        snippet: habit.keepsake_snippet,
        wide: habit.kind === "range",
        values: keepsakeValues({
          name: habit.name,
          colourSlot: habit.colour_slot,
          day: input.day,
          measuresTime: habit.measures_time,
          measuresCount: habit.measures_count,
          countUnit: habit.count_unit,
          rows,
          cats,
          flags: [...flags],
        }),
      },
    });
  }

  // ── the folded whimsy — the grout ──────────────────────────────────────────
  for (const which of input.whimsy)
    tiles.push({ id: `whimsy:${which}`, body: { kind: "whimsy", which } });

  // ── the ephemeral three — only what the day itself captured ───────────────
  if (input.snapshot?.weather != null)
    tiles.push({ id: "snap:wx", body: { kind: "wx", snap: input.snapshot.weather } });
  if (input.snapshot?.horoscope != null)
    tiles.push({ id: "snap:horo", body: { kind: "horo", snap: input.snapshot.horoscope } });
  if (input.snapshot?.tarot != null)
    tiles.push({ id: "snap:tarot", body: { kind: "tarot", snap: input.snapshot.tarot } });

  // ── the milestone family cards ────────────────────────────────────────────
  if (input.milestones != null) {
    for (const family of FAMILY_ORDER) {
      const items = input.milestones.items.filter((i) => i.family === family);
      if (items.length === 0) continue;
      tiles.push({
        id: `ms:${family}`,
        body: {
          kind: "milestone",
          family,
          label: FAMILY_LABEL[family],
          items,
          // The split earns its keep only when BOTH kinds are present; one kind
          // in two columns is a divider with nothing on the other side of it.
          split:
            family === "threshold" &&
            items.some((i) => i.bucket === "count") &&
            items.some((i) => i.bucket === "total"),
        },
      });
    }
    // Continuing streaks keep their OWN single card, never one per streak, and
    // it appears whether or not anything else fired — the wall is where the
    // day's streaks live, since the banner drops them on a quiet day.
    if (input.milestones.streaks.length > 0)
      tiles.push({
        id: "ms:streaks",
        body: { kind: "streaks", streaks: input.milestones.streaks },
      });
  }

  return tiles;
}

/** The pack's input: every tile with its span and its placement class. */
export const toPackInputs = (
  tiles: ReadonlyArray<WallTile>,
  seedHabitKey: string | null,
  measured: ReadonlyMap<string, Span>,
): PackInput<WallTile>[] =>
  tiles.map((t) => ({
    item: t,
    span: measured.get(t.id) ?? spanOf(t.body),
    rank: rankOf(t.body, seedHabitKey),
  }));
