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

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MON3 = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_LABEL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SLOT = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const SEASONS: Record<string, number> = { winter: 1, spring: 2, summer: 3, autumn: 4, fall: 4 };

const pad = (n: number) => String(n).padStart(2, "0");

/** The month-slot dial for a 1-based month ("--month-jun"). */
const monthVar = (m1: number): string => `--month-${SLOT[m1 - 1]}`;

/** A quarter wears its compact MIDDLE month's colour (the drawn convention). */
const quarterVar = (q: number): string => monthVar(q * 3 - 1);

/** ISO week: the Monday of week `w` of ISO year `y` (local-safe arithmetic). */
function isoWeekMonday(y: number, w: number): string {
  // Jan 4 is always in ISO week 1; walk back to its Monday, then step weeks.
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const dow = (jan4.getUTCDay() + 6) % 7; // Mon=0
  const week1Mon = Date.UTC(y, 0, 4 - dow);
  const t = week1Mon + (w - 1) * 7 * 86400000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** ISO weeks in a year (52 or 53). */
function isoWeeksInYear(y: number): number {
  // A year has 53 ISO weeks iff Jan 1 is Thursday, or it's a leap year and Jan 1 is Wednesday.
  const jan1 = new Date(Date.UTC(y, 0, 1)).getUTCDay();
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return jan1 === 4 || (leap && jan1 === 3) ? 53 : 52;
}

function monthPlace(y: number, m1: number, tierLabel: string): PeriodPlace {
  return {
    kind: "period",
    scale: "month",
    anchor: `${y}-${pad(m1)}-01`,
    title: `${MONTH_LABEL[m1 - 1]} ${y}`,
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
    anchor: `${y}-${pad(startM)}-01`,
    title: `Q${q} · ${y}`,
    sub: `quarterly cadence · ${MON3[startM - 1][0].toUpperCase()}${MON3[startM - 1].slice(1)}–${
      MON3[endM - 1][0].toUpperCase()}${MON3[endM - 1].slice(1)}${seasonWord != null ? ` · ${seasonWord}` : ""}`,
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

function weekPlace(y: number, w: number, tierLabel: string): PeriodPlace {
  const mon = isoWeekMonday(y, w);
  return {
    kind: "period",
    scale: "week",
    anchor: mon,
    title: `W${w} · ${y}`,
    sub: `weekly cadence · from ${mon}`,
    colourVar: monthVar(Number(mon.slice(5, 7))),
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
    if (weekM[2] == null && isoWeekMonday(y, w) > today) y -= 1; // most recent begun
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
