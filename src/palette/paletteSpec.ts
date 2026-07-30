/**
 * kit-palette's PURE half — the searchable index shape and the DETERMINISTIC
 * ranker ([[Search & Quick-Find]], quoted by the frozen FINAL's docs):
 *
 *   1 · match quality   exact › prefix › word-start › fuzzy-contains
 *   2 · type tier       on ties: habits/screens › actions › entries › settings/manual
 *   3 · recency         most-recent activity breaks the last tie
 *
 * "No cleverness, ever" — no scores, no weights, no fuzzy distance; a plain
 * lexicographic sort over the three ruled keys (then title, so the order is
 * total and stable). Harness-testable; the component owns only the drawing.
 */

export type PalGroup = "habits" | "screens" | "actions" | "entries" | "settings";

/** The drawn group headers, in tier order (groups render in this order). */
export const GROUP_LABEL: Record<PalGroup, string> = {
  habits: "Habits",
  screens: "Screens & periods",
  actions: "Actions",
  entries: "Entries",
  settings: "Settings & manual",
};
export const GROUP_ORDER: PalGroup[] = ["habits", "screens", "actions", "entries", "settings"];

/** Type tier (rank 2): habits/screens share the top tier by ruling. */
const TIER: Record<PalGroup, number> = {
  habits: 0,
  screens: 0,
  actions: 1,
  entries: 2,
  settings: 3,
};

export interface PalIndexItem<A = unknown> {
  group: PalGroup;
  title: string;
  /** The muted line beside the title ("Gaming", "consumption · project"…). */
  sub?: string;
  /** Extra needles the query may hit ("statistics" for Comparing Statistics). */
  aliases?: string[];
  /** Recency-of-activity day ("YYYY-MM-DD") — the last tiebreak; null sorts last. */
  recency?: string | null;
  /** Opaque payload the component turns into a door/verb. */
  action: A;
}

export type MatchQuality = "exact" | "prefix" | "word-start" | "fuzzy";
const QUALITY_RANK: Record<MatchQuality, number> = { exact: 0, prefix: 1, "word-start": 2, fuzzy: 3 };

export interface RankedItem<A = unknown> extends PalIndexItem<A> {
  quality: MatchQuality;
}

/** Match quality of one needle; null = no match. */
export function matchQuality(query: string, needle: string): MatchQuality | null {
  const q = query.trim().toLowerCase();
  const n = needle.toLowerCase();
  if (q === "" || n === "") return null;
  if (n === q) return "exact";
  if (n.startsWith(q)) return "prefix";
  // word-start: any later word begins with the query
  const words = n.split(/[\s\-–—·:/(),.]+/).filter(Boolean);
  if (words.some((w, i) => i > 0 && w.startsWith(q))) return "word-start";
  if (n.includes(q)) return "fuzzy";
  return null;
}

/** An item's best quality across title + aliases. */
function bestQuality(query: string, item: PalIndexItem): MatchQuality | null {
  let best: MatchQuality | null = matchQuality(query, item.title);
  for (const a of item.aliases ?? []) {
    const q = matchQuality(query, a);
    if (q != null && (best == null || QUALITY_RANK[q] < QUALITY_RANK[best])) best = q;
  }
  return best;
}

export interface RankedGroup<A = unknown> {
  group: PalGroup;
  label: string;
  items: RankedItem<A>[];
  /** Overflow beyond the per-group cap — stated, never silent. */
  more: number;
}

/** Per-group visible cap — the palette is a teleport, not a browser. */
export const GROUP_CAP = 6;

/**
 * Rank the index against a query and fold into drawn groups (tier order).
 * Groups with no hits are absent; each group is internally sorted by the
 * ruled keys and capped at GROUP_CAP with the remainder counted.
 */
export function rankPalette<A>(query: string, index: PalIndexItem<A>[]): RankedGroup<A>[] {
  const hits: RankedItem<A>[] = [];
  for (const item of index) {
    const q = bestQuality(query, item);
    if (q != null) hits.push({ ...item, quality: q });
  }
  hits.sort((a, b) => {
    const dq = QUALITY_RANK[a.quality] - QUALITY_RANK[b.quality];
    if (dq !== 0) return dq;
    const dt = TIER[a.group] - TIER[b.group];
    if (dt !== 0) return dt;
    const ra = a.recency ?? "";
    const rb = b.recency ?? "";
    if (ra !== rb) return ra > rb ? -1 : 1; // newer first; absent last
    return a.title.localeCompare(b.title);
  });

  const grouped = new Map<PalGroup, RankedItem<A>[]>();
  for (const h of hits) {
    const list = grouped.get(h.group);
    if (list != null) list.push(h);
    else grouped.set(h.group, [h]);
  }
  const out: RankedGroup<A>[] = [];
  for (const g of GROUP_ORDER) {
    const items = grouped.get(g);
    if (items == null || items.length === 0) continue;
    out.push({
      group: g,
      label: GROUP_LABEL[g],
      items: items.slice(0, GROUP_CAP),
      more: Math.max(0, items.length - GROUP_CAP),
    });
  }
  return out;
}
