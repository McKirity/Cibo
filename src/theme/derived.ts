/**
 * DERIVED DIALS — Build step 6a's ramp-transcription fix (the 5b dial debt).
 *
 * `--heatmap-ramp` and `--cat-ramp` are multi-stop dials, and CSS cannot
 * `var()` one stop of a multi-stop value — so the frozen corpus transcribed
 * their complements inline at every use-site under the named lint carve-out,
 * always to the Default's numbers (six independent copies by the 2026-07-31
 * survey; Void's shifted ramps rendered stale). Here the stops are READ from
 * the applied theme once per theme-apply and published as per-level
 * BACKGROUND-share dials that every use-site can `var()`:
 *
 *   --heat-bg-1 … --heat-bg-4   = 100% − the Nth --heatmap-ramp stop
 *   --cat-bg-1  … --cat-bg-4    = 100% − the Nth --cat-ramp stop
 *
 * (The ramp stops are the COLOUR's share; a use-site color-mix names the
 * BACKGROUND's share — theme.css's own convention note.) Nothing is ever
 * transcribed again: this dissolves the carve-out for every present and
 * future theme at once.
 *
 * Parse-failure guard only (a use-site can never see an absent dial — the
 * static Default import always defines both ramps at the cascade bottom):
 * the Default's shipped stops, which MUST match the dial (the carve-out's
 * citation discipline — --heatmap-ramp: 10 38 66 100 · --cat-ramp: 22 48 74 100).
 */

const DEFAULT_HEAT_STOPS = [10, 38, 66, 100]; // citation: --heatmap-ramp
const DEFAULT_CAT_STOPS = [22, 48, 74, 100]; // citation: --cat-ramp

function publish(computed: CSSStyleDeclaration, dial: string, prefix: string, guard: number[]): void {
  const stops = computed
    .getPropertyValue(dial)
    .trim()
    .split(/\s+/)
    .map((s) => Number.parseFloat(s))
    .filter((n) => Number.isFinite(n));
  const use = stops.length === 4 ? stops : guard;
  const root = document.documentElement.style;
  use.forEach((stop, i) => {
    const bg = Math.min(100, Math.max(0, 100 - stop));
    root.setProperty(`${prefix}${i + 1}`, `${bg}%`);
  });
}

/** Recompute the published derivations from the applied theme's dials.
 *  Runs at boot and after every theme apply (the loader announces). */
export function applyDerivedDials(): void {
  const computed = getComputedStyle(document.documentElement);
  publish(computed, "--heatmap-ramp", "--heat-bg-", DEFAULT_HEAT_STOPS);
  publish(computed, "--cat-ramp", "--cat-bg-", DEFAULT_CAT_STOPS);
}
