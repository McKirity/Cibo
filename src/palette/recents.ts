/**
 * The palette's RECENT-PLACES ledger — the at-rest face leads with nouns
 * (user-ruled 2026-07-29, in-canvas at the palette exhibit): the entries,
 * habits, periods and catalogs you touched most recently, drawn in the exact
 * row anatomy a query returns.
 *
 * ONE source: this VISIT ledger — the shell records place-shaped navigations
 * (habit · library · entry · period · a specific day), timestamped. A
 * logging-recency merge lived here for a day and was REMOVED (user-ruled
 * 2026-07-29, second pass): the section is "recently OPENED", and a session's
 * owning day has no clock, so merged rows could only say "today" — the exact
 * label the elapsed-time ruling had just struck. Something logged but never
 * opened is simply not recent HERE.
 *
 * Storage is the per-device settings file (settings/deviceStore, 2026-08-04):
 * recents are device texture, not synced data, and a `days ago` label needs
 * no CRDT.
 * Also here: the LAST-USED VERB (the one moving row the alphabetical Actions
 * list lifts to its top — user-ruled the same day).
 */

export type RecentPlace =
  | { kind: "entry"; id: string; habitKey: string }
  | { kind: "habit"; key: string }
  | { kind: "library"; habitKey: string }
  | { kind: "period"; scale: "week" | "month" | "quarter" | "year"; anchor: string }
  | { kind: "day"; day: string };

export interface RecentVisit {
  place: RecentPlace;
  /** epoch ms of the visit */
  at: number;
}

import { deviceGet, deviceSet } from "../settings/deviceStore";

const PLACES_KEY = "cibo.palette.recentPlaces";
const VERB_KEY = "cibo.palette.lastVerb";
const CAP = 20;

export const placeId = (p: RecentPlace): string => {
  if (p.kind === "entry") return `entry:${p.id}`;
  if (p.kind === "habit") return `habit:${p.key}`;
  if (p.kind === "library") return `library:${p.habitKey}`;
  if (p.kind === "period") return `period:${p.scale}:${p.anchor}`;
  return `day:${p.day}`;
};

/**
 * Per-KIND field validation (2026-07-30): the palette slices a period's
 * `anchor` and a day's `day` at render, so a corrupted row carrying the right
 * kind but missing its fields would throw past the JSON.parse guard.
 */
const validPlace = (p: unknown): p is RecentPlace => {
  if (typeof p !== "object" || p == null) return false;
  const r = p as Record<string, unknown>;
  if (r.kind === "entry") return typeof r.id === "string" && typeof r.habitKey === "string";
  if (r.kind === "habit") return typeof r.key === "string";
  if (r.kind === "library") return typeof r.habitKey === "string";
  if (r.kind === "period")
    return (
      (r.scale === "week" || r.scale === "month" || r.scale === "quarter" || r.scale === "year") &&
      typeof r.anchor === "string"
    );
  if (r.kind === "day") return typeof r.day === "string";
  return false;
};

export function readRecents(): RecentVisit[] {
  try {
    const raw = deviceGet(PLACES_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as RecentVisit[];
    return Array.isArray(parsed) ? parsed.filter((v) => validPlace(v?.place)) : [];
  } catch {
    return [];
  }
}

export function recordRecent(place: RecentPlace): void {
  try {
    const id = placeId(place);
    const next = [
      { place, at: Date.now() },
      ...readRecents().filter((v) => placeId(v.place) !== id),
    ].slice(0, CAP);
    deviceSet(PLACES_KEY, JSON.stringify(next));
  } catch {
    // per-device sugar — never worth an error surface
  }
}

export function readLastVerb(): string | null {
  return deviceGet(VERB_KEY);
}

export function recordLastVerb(verbId: string): void {
  deviceSet(VERB_KEY, verbId);
}

/* `relLabel` MOVED to metrics/format 2026-08-04 — it gained a third consumer
   in a second area (the Backups pane), and a pure formatter belongs in the
   formatter module rather than behind a cross-screen import. */

/* relDayLabel (day-granular buckets for logging recency) left with the
   logging merge, 2026-07-29 — no tenant. */
