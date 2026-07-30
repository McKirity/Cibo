/**
 * ADVANCED SEARCH's PURE half — "which ones" ([[Search & Quick-Find]] §
 * Advanced Search; CS answers "how much" and shares the engine's fence:
 * catalog-shape compositions only, indexed slice-fetches, no custom formulas).
 *
 * The ruled flow this file computes: target (Days | Entries) → an optional
 * period window (the CS picker; all-time when unset; for ENTRY queries it
 * scopes the ENGAGEMENT conditions only — attributes are timeless) → a list
 * of condition rows → Match all / Match any (ONE switch, no nested boolean
 * trees) → a live result set (no Run button).
 *
 * A row with an unanswered pick is INCOMPLETE and contributes nothing (the
 * CS precedent — an incomplete pick draws nothing rather than guessing).
 * With no complete rows, the result is the whole universe in the window —
 * honest, and it makes the live count move from the first keystroke.
 */
import type { WindowCfg } from "../compare/compareSpec";
import { resolveWindow } from "../compare/compareSpec";

export type SearchTarget = "days" | "entries";
export type MatchMode = "all" | "any";
export type NumOp = ">=" | "=" | "<=";

// ── Condition rows (ruled inventories, [[Search & Quick-Find]] step 3) ───────

export type DayCond =
  | { kind: "habitDone"; habitKey: string | null }
  | { kind: "habitMissed"; habitKey: string | null } // finalized + absent
  | { kind: "entryLogged"; entryId: string | null }
  | { kind: "doneCount"; op: NumOp; n: number } // "5+ habits"
  | {
      kind: "dayTotal"; // "slept ≥ 8 h" · "walked ≥ 10k steps"
      habitKey: string | null;
      basis: "time" | "count";
      op: ">=" | "<=";
      value: number; // hours for time, the unit for count
    };

export type EntryCond =
  | { kind: "habit"; habitKey: string | null }
  | { kind: "status"; value: string | null }
  | { kind: "type"; value: string | null }
  | { kind: "genre"; value: string | null }
  | { kind: "priority"; op: NumOp; n: number }
  | { kind: "rating"; op: NumOp; n: number }
  | { kind: "purchased"; value: boolean }
  | { kind: "creator"; text: string } // contains, over creators + studios
  | { kind: "series"; text: string } // contains
  | { kind: "lastSession"; dir: "before" | "after"; day: string | null } // "untouched for 6 months"
  | { kind: "totalTime"; op: ">=" | "<="; hours: number };

export type AnyCond = DayCond | EntryCond;

/** The stored (verbatim, partial) preset form — `as_preset:` rows mirror CS. */
export interface ASCfg {
  target?: SearchTarget;
  window?: WindowCfg;
  match?: MatchMode;
  dayConds?: DayCond[];
  entryConds?: EntryCond[];
}

// ── Plain input rows (the hook fetches, this file never touches the store) ───

export interface ASHabit {
  id: string;
  key: string | null;
  name: string;
  colourSlot: string;
  icon: string | null;
  kind: string;
  subType: string | null;
  measuresTime: boolean;
  measuresCount: boolean;
  countUnit: string | null;
}

export interface ASEntry {
  id: string;
  habitId: string;
  title: string;
  status: string | null;
  type: string | null;
  genre: string[];
  priority: number | null;
  rating: number | null;
  purchased: boolean;
  creators: string[];
  studios: string[];
  series: string | null;
}

export interface ASSession {
  habitId: string;
  entryId: string | null;
  day: string;
  measureKind: string | null; // MeasureKind: "time" | "count" | "range" | "none"
  /**
   * Minutes for "time", the unit for "count". A RANGE session stores null in
   * the DB — the HOOK derives its minutes from start/end before this layer,
   * so "range" rows arrive minutes-carrying here.
   */
  value: number | null;
}

export interface ASData {
  habits: ASHabit[];
  entries: ASEntry[];
  sessions: ASSession[];
  finalizedDays: Set<string>;
}

// ── Completeness (an unanswered row contributes nothing) ─────────────────────

export function dayCondComplete(c: DayCond): boolean {
  if (c.kind === "habitDone" || c.kind === "habitMissed") return c.habitKey != null;
  if (c.kind === "entryLogged") return c.entryId != null;
  if (c.kind === "dayTotal") return c.habitKey != null && Number.isFinite(c.value) && c.value > 0;
  return Number.isFinite(c.n);
}

export function entryCondComplete(c: EntryCond): boolean {
  if (c.kind === "habit") return c.habitKey != null;
  if (c.kind === "status" || c.kind === "type" || c.kind === "genre") return c.value != null;
  if (c.kind === "creator" || c.kind === "series") return c.text.trim() !== "";
  if (c.kind === "lastSession") return c.day != null;
  if (c.kind === "totalTime") return Number.isFinite(c.hours) && c.hours > 0;
  if (c.kind === "purchased") return true;
  return Number.isFinite(c.n);
}

const cmp = (a: number, op: NumOp | ">=" | "<=", b: number): boolean =>
  op === ">=" ? a >= b : op === "<=" ? a <= b : a === b;

// ── Day search ────────────────────────────────────────────────────────────────

export interface DayHit {
  day: string;
  /** Distinct habits with a session that day — the row's honest sub-line. */
  doneCount: number;
  finalized: boolean;
}

export interface SearchResult<H> {
  hits: H[];
  total: number;
}

/** Sessions minutes for a duration row; count rows return their unit value. */
const sessionAmount = (s: ASSession, basis: "time" | "count"): number => {
  if (basis === "time") {
    // range rows arrive with hook-derived minutes (see ASSession.value)
    return s.measureKind === "time" || s.measureKind === "range" ? s.value ?? 0 : 0;
  }
  return s.measureKind === "count" ? s.value ?? 0 : 0;
};

export function searchDays(
  conds: DayCond[],
  match: MatchMode,
  window: WindowCfg | undefined,
  data: ASData,
  today: string,
  cap = 60,
): SearchResult<DayHit> {
  const w = window != null ? resolveWindow(window, today) : null;
  const inWindow = (d: string) => w == null || (d >= w.from && d <= w.to);

  // Per-day indexes, one pass over sessions.
  const habitsByDay = new Map<string, Set<string>>();
  const entriesByDay = new Map<string, Set<string>>();
  const totals = new Map<string, number>(); // `${day}|${habitId}|${basis}`
  for (const s of data.sessions) {
    if (!inWindow(s.day)) continue;
    let hs = habitsByDay.get(s.day);
    if (hs == null) habitsByDay.set(s.day, (hs = new Set()));
    hs.add(s.habitId);
    if (s.entryId != null) {
      let es = entriesByDay.get(s.day);
      if (es == null) entriesByDay.set(s.day, (es = new Set()));
      es.add(s.entryId);
    }
    for (const basis of ["time", "count"] as const) {
      const amt = sessionAmount(s, basis);
      if (amt > 0) {
        const k = `${s.day}|${s.habitId}|${basis}`;
        totals.set(k, (totals.get(k) ?? 0) + amt);
      }
    }
  }

  // Universe: any day with bookkeeping — logged or finalized — in the window.
  const universe = new Set<string>(habitsByDay.keys());
  for (const d of data.finalizedDays) if (inWindow(d)) universe.add(d);

  const habitByKey = new Map(data.habits.filter((h) => h.key != null).map((h) => [h.key as string, h]));
  const active = conds.filter(dayCondComplete);

  const evalCond = (c: DayCond, day: string): boolean => {
    if (c.kind === "habitDone") {
      const h = habitByKey.get(c.habitKey as string);
      return h != null && (habitsByDay.get(day)?.has(h.id) ?? false);
    }
    if (c.kind === "habitMissed") {
      const h = habitByKey.get(c.habitKey as string);
      return (
        h != null && data.finalizedDays.has(day) && !(habitsByDay.get(day)?.has(h.id) ?? false)
      );
    }
    if (c.kind === "entryLogged") return entriesByDay.get(day)?.has(c.entryId as string) ?? false;
    if (c.kind === "doneCount") return cmp(habitsByDay.get(day)?.size ?? 0, c.op, c.n);
    // dayTotal
    const h = habitByKey.get(c.habitKey as string);
    if (h == null) return false;
    const raw = totals.get(`${day}|${h.id}|${c.basis}`) ?? 0;
    const amount = c.basis === "time" ? raw / 60 : raw;
    return cmp(amount, c.op, c.value);
  };

  const hits: DayHit[] = [];
  for (const day of universe) {
    if (day > today) continue; // the future is a dead route
    const ok =
      active.length === 0 ||
      (match === "all" ? active.every((c) => evalCond(c, day)) : active.some((c) => evalCond(c, day)));
    if (ok) {
      hits.push({
        day,
        doneCount: habitsByDay.get(day)?.size ?? 0,
        finalized: data.finalizedDays.has(day),
      });
    }
  }
  hits.sort((a, b) => (a.day > b.day ? -1 : 1)); // recent first
  return { hits: hits.slice(0, cap), total: hits.length };
}

// ── Entry search ─────────────────────────────────────────────────────────────

export interface EntryHit {
  entry: ASEntry;
  habit: ASHabit | null;
  lastDay: string | null;
  totalMinutes: number;
}

export function searchEntries(
  conds: EntryCond[],
  match: MatchMode,
  window: WindowCfg | undefined,
  data: ASData,
  today: string,
  cap = 60,
): SearchResult<EntryHit> {
  // The window scopes ENGAGEMENT conditions only — attributes are timeless.
  const w = window != null ? resolveWindow(window, today) : null;
  const inWindow = (d: string) => w == null || (d >= w.from && d <= w.to);

  const lastDay = new Map<string, string>();
  const minutes = new Map<string, number>();
  for (const s of data.sessions) {
    if (s.entryId == null || !inWindow(s.day)) continue;
    const prev = lastDay.get(s.entryId);
    if (prev == null || s.day > prev) lastDay.set(s.entryId, s.day);
    const m = s.measureKind === "time" || s.measureKind === "range" ? s.value ?? 0 : 0;
    if (m > 0) minutes.set(s.entryId, (minutes.get(s.entryId) ?? 0) + m);
  }

  const habitById = new Map(data.habits.map((h) => [h.id, h]));
  const habitByKey = new Map(data.habits.filter((h) => h.key != null).map((h) => [h.key as string, h]));
  const active = conds.filter(entryCondComplete);

  const evalCond = (c: EntryCond, e: ASEntry): boolean => {
    if (c.kind === "habit") return habitByKey.get(c.habitKey as string)?.id === e.habitId;
    if (c.kind === "status") return e.status === c.value;
    if (c.kind === "type") return e.type === c.value;
    if (c.kind === "genre") return e.genre.includes(c.value as string);
    if (c.kind === "priority") return e.priority != null && cmp(e.priority, c.op, c.n);
    if (c.kind === "rating") return e.rating != null && cmp(e.rating, c.op, c.n);
    if (c.kind === "purchased") return e.purchased === c.value;
    if (c.kind === "creator") {
      const t = c.text.trim().toLowerCase();
      return [...e.creators, ...e.studios].some((x) => x.toLowerCase().includes(t));
    }
    if (c.kind === "series") {
      const t = c.text.trim().toLowerCase();
      return e.series != null && e.series.toLowerCase().includes(t);
    }
    if (c.kind === "lastSession") {
      const d = lastDay.get(e.id);
      if (c.dir === "before") return d != null && d < (c.day as string); // untouched since — but touched once
      return d != null && d > (c.day as string);
    }
    // totalTime
    return cmp((minutes.get(e.id) ?? 0) / 60, c.op, c.hours);
  };

  const hits: EntryHit[] = [];
  for (const e of data.entries) {
    const ok =
      active.length === 0 ||
      (match === "all" ? active.every((c) => evalCond(c, e)) : active.some((c) => evalCond(c, e)));
    if (ok) {
      hits.push({
        entry: e,
        habit: habitById.get(e.habitId) ?? null,
        lastDay: lastDay.get(e.id) ?? null,
        totalMinutes: minutes.get(e.id) ?? 0,
      });
    }
  }
  hits.sort((a, b) => a.entry.title.localeCompare(b.entry.title));
  return { hits: hits.slice(0, cap), total: hits.length };
}
