/** Routing vocabulary — the `View` union + the titlebar title derivation. Split out of Shell.tsx 2026-07-30 (dedup pass wave 4); step 9's route serialization will live here. */
import type { CadenceScale } from "../metrics/cadence";

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
  | { kind: "map" };

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
