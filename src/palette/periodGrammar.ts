/**
 * The palette's PERIOD GRAMMAR — "periods are places" ([[Search & Quick-Find]]
 * / the frozen `Final/palette.html` state 3): a typed token resolves to a
 * cadence dashboard or a day. Pure — harness-testable, no store access.
 *
 * Accepted forms (case-insensitive):
 *   month name [+ year]        "june" · "jun 2025" · "june 2025"
 *   Wnn / week nn [+ year]     "W27" · "w27 2025" · "week 27"
 *   Qn [+ year]                "Q2" · "q2 2025"
 *   season [+ year]            "spring" · "Spring 2022" · "fall 2023"
 *   bare year                  "2025"
 *   full date                  "2026-07-03" (a day is a place too — `day/…`)
 *
 * IMPLEMENTATION, recorded as such (no drawn/ruled mapping exists): a season
 * resolves to its CALENDAR QUARTER in the northern convention — Winter→Q1 ·
 * Spring→Q2 · Summer→Q3 · Autumn/Fall→Q4 — because quarters are the app's
 * scale and the default quarter boundaries are calendar ([[Cadence & periods]]).
 *
 * Yearless tokens resolve to the most recent occurrence that has BEGUN.
 * A period wholly in the future is a dead route and is not offered at all
 * (the shell's openDay/dead-route law, applied at the grammar).
 *
 * A match FANS OUT to its owning ladder, exactly as drawn: June 2025 also
 * offers Q2 · 2025 (owning quarter) and 2025 (owning year).
 */
import { pad2 } from "../metrics/clock";
import { isoWeekMonday, isoWeeksInYear, weekNum, weekStart } from "../metrics/dates";
import { MONTHS_LONG, MONTHS_SHORT } from "../metrics/format";

export type PeriodScale = "week" | "month" | "quarter" | "year";

export interface PeriodPlace {
  kind: "period";
  scale: PeriodScale;
  /** Any day inside the period — the cadence route's anchor. */
  anchor: string;
  title: string;
  sub: string;
  /** The row indicator: a month-slot dial, or "--accent" for years. */
  colourVar: string;
  /** "exact period" on the direct hit; "owning quarter"/"owning year" on the ladder. */
  tierLabel: string;
}

export interface DayPlace {
  kind: "day";
  day: string;
  title: string;
  sub: string;
  colourVar: string;
  tierLabel: string;
}

export type PlaceMatch = PeriodPlace | DayPlace;

// Month faces + ISO-week math come from the shared metrics modules (the
// local copies died at the 2026-07-30 dedup pass). The grammar MATCHES on
// lowercase, so the two match rosters derive from the shared faces; the
// lowercase short names double as the month-slot dial suffixes ("--month-jun").
const MONTHS = MONTHS_LONG.map((m) => m.toLowerCase());
const MON3 = MONTHS_SHORT.map((m) => m.toLowerCase());

const SEASONS: Record<string, number> = { winter: 1, spring: 2, summer: 3, autumn: 4, fall: 4 };

/** The month-slot dial for a 1-based month ("--month-jun"). */
export const monthVar = (m1: number): string => `--month-${MON3[m1 - 1]}`;

/** A quarter wears its compact MIDDLE month's colour (the drawn convention). */
const quarterVar = (q: number): string => monthVar(q * 3 - 1);

function monthPlace(y: number, m1: number, tierLabel: string): PeriodPlace {
  return {
    kind: "period",
    scale: "month",
    anchor: `${y}-${pad2(m1)}-01`,
    title: `${MONTHS_LONG[m1 - 1]} ${y}`,
    sub: "monthly cadence",
    colourVar: monthVar(m1),
    tierLabel,
  };
}

function quarterPlace(y: number, q: number, tierLabel: string, seasonWord?: string): PeriodPlace {
  const startM = q * 3 - 2;
  const endM = q * 3;
  return {
    kind: "period",
    scale: "quarter",
    anchor: `${y}-${pad2(startM)}-01`,
    title: `Q${q} · ${y}`,
    sub: `quarterly cadence · ${MONTHS_SHORT[startM - 1]}–${MONTHS_SHORT[endM - 1]}${
      seasonWord != null ? ` · ${seasonWord}` : ""}`,
    colourVar: quarterVar(q),
    tierLabel,
  };
}

function yearPlace(y: number, tierLabel: string): PeriodPlace {
  return {
    kind: "period",
    scale: "year",
    anchor: `${y}-01-01`,
    title: String(y),
    sub: "yearly cadence",
    colourVar: "--accent",
    tierLabel,
  };
}

/**
 * A week place FOLLOWS THE WEEK-START DIAL (user-ruled 2026-08-04). The week
 * NUMBER stays ISO — that is the app-wide contract, a week is labelled by the
 * ISO week of the Thursday it contains — but the anchor and the "from" date
 * are the configured week's own first day. `weekStart(isoMonday)` is the
 * identity under a Monday start and steps back to the preceding Sunday under a
 * Sunday one, which is the configured week holding that same Thursday. Without
 * this the palette stated a Monday boundary for a week the nav calendar and the
 * cadence dashboards drew as starting a day earlier.
 */
function weekPlace(y: number, w: number, tierLabel: string): PeriodPlace {
  const start = weekStart(isoWeekMonday(y, w));
  return {
    kind: "period",
    scale: "week",
    anchor: start,
    title: `W${w} · ${y}`,
    sub: `weekly cadence · from ${start}`,
    colourVar: monthVar(Number(start.slice(5, 7))),
    tierLabel,
  };
}

/** The owning ladder under a direct period hit (drawn: month → quarter → year). */
function ladder(direct: PeriodPlace, today: string): PeriodPlace[] {
  const out: PeriodPlace[] = [direct];
  const y = Number(direct.anchor.slice(0, 4));
  const m1 = Number(direct.anchor.slice(5, 7));
  const q = Math.ceil(m1 / 3);
  if (direct.scale === "week" || direct.scale === "month") {
    out.push(quarterPlace(y, q, "owning quarter"));
    out.push(yearPlace(y, "owning year"));
  } else if (direct.scale === "quarter") {
    out.push(yearPlace(y, "owning year"));
  }
  // The future is a dead route — a ladder rung that has not begun is dropped.
  return out.filter((p) => p.anchor <= today);
}

/**
 * A stored period's display face (the Recent group re-renders visited periods
 * in the same anatomy a teleport match wears). Week titles carry the ISO week
 * of the anchor's Monday.
 */
export function periodDisplay(
  scale: PeriodScale,
  anchor: string,
): { title: string; sub: string; colourVar: string } {
  const y = Number(anchor.slice(0, 4));
  const m1 = Number(anchor.slice(5, 7));
  if (scale === "month") {
    const p = monthPlace(y, m1, "");
    return { title: p.title, sub: p.sub, colourVar: p.colourVar };
  }
  if (scale === "quarter") {
    const q = Math.ceil(m1 / 3);
    const p = quarterPlace(y, q, "");
    return { title: p.title, sub: "quarterly cadence", colourVar: p.colourVar };
  }
  if (scale === "year") return { title: String(y), sub: "yearly cadence", colourVar: "--accent" };
  // week — dates.weekNum owns this: it labels the CONFIGURED week by the ISO
  // week of the Thursday it contains. This block hand-rolled the derivation in
  // raw Date math (Monday-fixed), which the dedup pass missed when it adopted
  // the module's ISO inverses just above.
  const { week: w, year: isoY } = weekNum(anchor);
  return {
    title: `W${w} · ${isoY}`,
    sub: "weekly cadence",
    colourVar: monthVar(m1),
  };
}

/**
 * Parse a query into period/day places. Returns [] when the query is not a
 * period token — the palette then ranks the ordinary index.
 */
export function parsePeriods(rawQuery: string, today: string): PlaceMatch[] {
  const q = rawQuery.trim().toLowerCase();
  if (q === "") return [];
  const thisYear = Number(today.slice(0, 4));
  const thisMonth = Number(today.slice(5, 7));

  // full date → a day place (day/… is a route; the shell refuses the future)
  const dateM = q.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateM != null) {
    const day = q;
    if (day > today) return [];
    const m1 = Number(dateM[2]);
    if (m1 < 1 || m1 > 12) return [];
    // real-calendar check (2026-07-30): "2025-02-31" parses but must not mint
    // a live door to a phantom day — the date must round-trip
    const dd = Number(dateM[3]);
    const dt = new Date(Date.UTC(Number(dateM[1]), m1 - 1, dd));
    if (dt.getUTCFullYear() !== Number(dateM[1]) || dt.getUTCMonth() !== m1 - 1 || dt.getUTCDate() !== dd)
      return [];
    return [
      {
        kind: "day",
        day,
        title: day,
        sub: "daily · that day's dashboard",
        colourVar: monthVar(m1),
        tierLabel: "exact day",
      },
      ...ladder(monthPlace(Number(dateM[1]), m1, "owning month"), today),
    ];
  }

  // bare year
  const yearM = q.match(/^(\d{4})$/);
  if (yearM != null) {
    const y = Number(yearM[1]);
    if (y < 1970 || y > thisYear) return [];
    return [yearPlace(y, "exact period")];
  }

  // Wnn / week nn [+ year]
  const weekM = q.match(/^(?:w|week\s*)(\d{1,2})(?:\s+(\d{4}))?$/);
  if (weekM != null) {
    const w = Number(weekM[1]);
    let y = weekM[2] != null ? Number(weekM[2]) : thisYear;
    if (w < 1 || w > isoWeeksInYear(y)) return [];
    // The begun-year test reads the CONFIGURED week's first day, matching the
    // anchor weekPlace builds (and the `direct.anchor > today` guard below).
    if (weekM[2] == null && weekStart(isoWeekMonday(y, w)) > today) {
      y -= 1; // most recent begun
      // the decremented year may hold only 52 weeks — re-check or a yearless
      // "w53" early in a year mislabels (2026-07-30)
      if (w > isoWeeksInYear(y)) return [];
    }
    const direct = weekPlace(y, w, "exact period");
    if (direct.anchor > today) return [];
    return ladder(direct, today);
  }

  // Qn [+ year]
  const qM = q.match(/^q([1-4])(?:\s+(\d{4}))?$/);
  if (qM != null) {
    const qn = Number(qM[1]);
    let y = qM[2] != null ? Number(qM[2]) : thisYear;
    if (qM[2] == null && qn * 3 - 2 > thisMonth) y -= 1;
    const direct = quarterPlace(y, qn, "exact period");
    if (direct.anchor > today) return [];
    return ladder(direct, today);
  }

  // season [+ year] → its calendar quarter (implementation mapping, header)
  const seasonM = q.match(/^([a-z]+)(?:\s+(\d{4}))?$/);
  if (seasonM != null && SEASONS[seasonM[1]] != null) {
    const qn = SEASONS[seasonM[1]];
    let y = seasonM[2] != null ? Number(seasonM[2]) : thisYear;
    if (seasonM[2] == null && qn * 3 - 2 > thisMonth) y -= 1;
    const word = seasonM[1][0].toUpperCase() + seasonM[1].slice(1);
    const direct = quarterPlace(y, qn, "exact period", word);
    if (direct.anchor > today) return [];
    return ladder(direct, today);
  }

  // month name [+ year] — full names and the MON3 abbreviations; a PREFIX of a
  // month name ≥3 chars also resolves ("juno" does not, "jun"/"june" do)
  const monM = q.match(/^([a-z]{3,})(?:\s+(\d{4}))?$/);
  if (monM != null) {
    const token = monM[1];
    let m1 = MONTHS.findIndex((m) => m === token || (token.length >= 3 && m.startsWith(token))) + 1;
    if (m1 === 0) m1 = MON3.findIndex((m) => m === token) + 1;
    if (m1 > 0) {
      let y = monM[2] != null ? Number(monM[2]) : thisYear;
      if (monM[2] == null && m1 > thisMonth) y -= 1;
      const direct = monthPlace(y, m1, "exact period");
      if (direct.anchor > today) return [];
      return ladder(direct, today);
    }
  }

  return [];
}
