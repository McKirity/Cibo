/**
 * Routing vocabulary — the `View` union, the titlebar title derivation, and
 * (since 2026-08-01, step 9) the ROUTE STRING form. Split out of Shell.tsx at
 * the 2026-07-30 dedup pass.
 *
 * The `View` union is the in-memory route and remains the thing every door,
 * the history stack and the titlebar actually pass around. The string form
 * below is the address vocabulary [[Shell Mechanics]] § 2 rules — `day/…`,
 * `month/…`, `habit/<key>/library` and the rest — the spelling that makes
 * "history, deep links, nav-calendar doors and search results one mechanism".
 *
 * **Stated plainly: only three of those four are live.** History, the calendar's
 * doors and search results already share one mechanism — the union itself —
 * and they never needed strings to do it. **Deep links are the consumer these
 * functions exist for, and the app has none yet**: single window, no URL bar,
 * no registered OS scheme. So this is the vocabulary written down and made
 * round-trippable, not a wiring change; nothing in the app routes through
 * strings today, and pretending otherwise would be the kind of speculative
 * plumbing this codebase has been good at avoiding.
 *
 * Deliberately NOT converted onto it: `palette/recents.ts`'s `RecentPlace`.
 * It is a narrower vocabulary on purpose (place-shaped visits only, no Timers
 * or Map) and it carries per-kind field validation added after a real crash —
 * routing it through strings would trade that validation for parse risk. Two
 * vocabularies, each earning its keep, is the honest state.
 *
 * `settings/*` joined 2026-08-02 (step 10) — a SECTION is the route unit
 * ([[Settings & Configuration]]: "a section = a `settings/...` route, so the
 * palette and the health glance-dot deep-link straight to a pane category");
 * tabs inside a pane are never routes.
 */
import type { CadenceScale } from "../metrics/cadence";
import { isoWeek, isoWeekMonday, isoWeeksInYear } from "../metrics/dates";

/** The 13 ruled sections, left-pane order ([[Settings & Configuration]]). */
export const SETTINGS_SECTIONS = [
  "habits",
  "tracking",
  "appearance",
  "timers",
  "whimsy",
  "importers",
  "backups",
  "storage",
  "presets",
  "palette",
  "health",
  "developer",
  "help",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export type View =
  /**
   * The front door. "Launch opens to Daily — there is NO homepage."
   * `day` addresses ANY date: a past unfinalized day is the same working state,
   * date-addressed, and a finalized one is its cover wall. Absent = today.
   */
  | { kind: "daily"; day?: string }
  /** The dev logging view — hosts the seed/activation panels until step 15. */
  | { kind: "log" }
  | { kind: "habit"; key: string }
  /** The consumption catalog — the stats-vs-library split's second screen. */
  | { kind: "library"; habitKey: string }
  | { kind: "cadence"; scale: CadenceScale; anchor: string }
  | { kind: "entry"; id: string; habitKey: string }
  /** Comparing Statistics — the Tools-rail query workspace (step 6 catch-up). */
  | { kind: "compare" }
  /** Timers — the Tools-rail board of independent clocks (step 7). */
  | { kind: "timers" }
  /** The Map — the Tools-rail table of contents (the catch-up's last screen). */
  | { kind: "map" }
  /** Settings — the configuration home; the section is the route unit (step 10). */
  | { kind: "settings"; section: SettingsSection };

/** The titlebar title, derived from the current view + the active habit roster. */
export function viewTitle(
  view: View,
  active: readonly { key: string | null; name: string | null }[],
  today: string,
): string {
  return view.kind === "habit"
    ? active.find((h) => h.key === view.key)?.name ?? "Cibo"
    : view.kind === "library"
      ? `${active.find((h) => h.key === view.habitKey)?.name ?? "Cibo"} — Library`
      : view.kind === "entry"
      ? active.find((h) => h.key === view.habitKey)?.name ?? "Cibo"
      : view.kind === "compare"
        ? "Comparing Statistics"
      : view.kind === "timers"
        ? "Timers"
      : view.kind === "map"
        ? "Map"
      : view.kind === "settings"
        ? "Settings"
        : view.kind === "cadence"
        ? { week: "Weekly", month: "Monthly", quarter: "Quarterly", year: "Yearly" }[view.scale]
        : view.kind === "daily" && view.day != null && view.day !== today
          ? // The FINAL's titlebar carries the viewed day, not the word
            // "Today", the moment the screen is date-addressed.
            new Intl.DateTimeFormat(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            }).format(new Date(`${view.day}T12:00:00`))
          : "Today";
}

// ── The route string form ([[Shell Mechanics]] § 2's address table) ──────────

const pad2 = (n: number): string => String(n).padStart(2, "0");
/**
 * A REAL calendar date, not merely a date-shaped string: `2026-13-99` matches
 * the shape and does not exist, and the first caller of `parseView` will be a
 * deep link — text from outside the app. Round-tripping through Date is the
 * cheap total check (JS rolls invalid components over, so a mismatch after
 * formatting means the input was never a real day).
 */
const isDay = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
};

/**
 * A view's address. The cadence scales spell their period the way the ruled
 * table does — `week/2026-W27` · `month/2026-07` · `quarter/2026-Q3` ·
 * `year/2026` — so a route names the PERIOD, never the arbitrary day inside it
 * that the union happens to carry as its anchor.
 */
export function serializeView(view: View): string {
  switch (view.kind) {
    // "Absent = today" in the union; the address spells that `day/today` so a
    // route is always a complete address rather than a bare `day/`.
    case "daily":
      return view.day == null ? "day/today" : `day/${view.day}`;
    case "habit":
      return `habit/${view.key}`;
    case "library":
      return `habit/${view.habitKey}/library`;
    case "entry":
      return `entry/${view.id}`;
    case "cadence": {
      const y = view.anchor.slice(0, 4);
      if (view.scale === "year") return `year/${y}`;
      if (view.scale === "month") return `month/${view.anchor.slice(0, 7)}`;
      if (view.scale === "quarter")
        return `quarter/${y}-Q${Math.floor((Number(view.anchor.slice(5, 7)) - 1) / 3) + 1}`;
      // The ISO week-YEAR, not the anchor's calendar year: 2024-12-31 is
      // week 1 of 2025, and `week/2024-W01` would address the wrong week.
      const w = isoWeek(view.anchor);
      return `week/${w.year}-W${pad2(w.week)}`;
    }
    case "compare":
      return "compare";
    case "timers":
      return "timers";
    case "map":
      return "map";
    case "settings":
      return `settings/${view.section}`;
    case "log":
      return "log";
  }
}

/**
 * The inverse, total and forgiving: an unparseable address returns null rather
 * than throwing, because the first real caller will be a deep link — i.e. text
 * from outside the app, which is never to be trusted.
 *
 * `entry/<id>` round-trips LOSSILY: the union carries `habitKey` for routing
 * and the ruled address does not spell it, so a parsed entry route needs the
 * habit resolved from the store before it can become a `View`. That is the one
 * place the address table and the union genuinely disagree, and it is recorded
 * rather than papered over — `parseView` returns null for it.
 */
export function parseView(route: string): View | null {
  const parts = route.replace(/^\/+|\/+$/g, "").split("/");
  const [head, arg, tail] = parts;
  if (head === "compare") return { kind: "compare" };
  if (head === "timers") return { kind: "timers" };
  if (head === "map") return { kind: "map" };
  if (head === "log") return { kind: "log" };
  if (head === "settings") {
    // Bare `settings` = the first section, the drawn default face.
    if (arg == null || arg === "") return { kind: "settings", section: "habits" };
    const sec = SETTINGS_SECTIONS.find((s) => s === arg);
    return sec != null && tail == null ? { kind: "settings", section: sec } : null;
  }
  if (head === "day") {
    if (arg === "today" || arg == null || arg === "") return { kind: "daily" };
    return isDay(arg) ? { kind: "daily", day: arg } : null;
  }
  if (head === "habit" && arg != null && arg !== "") {
    if (tail === "library") return { kind: "library", habitKey: arg };
    return tail == null ? { kind: "habit", key: arg } : null;
  }
  if (head === "year" && arg != null && /^\d{4}$/.test(arg))
    return { kind: "cadence", scale: "year", anchor: `${arg}-01-01` };
  if (head === "month" && arg != null && /^\d{4}-\d{2}$/.test(arg))
    return { kind: "cadence", scale: "month", anchor: `${arg}-01` };
  if (head === "quarter" && arg != null && /^\d{4}-Q[1-4]$/.test(arg)) {
    const q = Number(arg.slice(6));
    return { kind: "cadence", scale: "quarter", anchor: `${arg.slice(0, 4)}-${pad2(q * 3 - 2)}-01` };
  }
  if (head === "week" && arg != null && /^\d{4}-W\d{2}$/.test(arg)) {
    const wy = Number(arg.slice(0, 4));
    const wn = Number(arg.slice(6));
    if (wn < 1 || wn > isoWeeksInYear(wy)) return null;
    return { kind: "cadence", scale: "week", anchor: isoWeekMonday(wy, wn) };
  }
  return null;
}
