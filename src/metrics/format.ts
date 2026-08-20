/**
 * Presentation formatters — how derived numbers read on the dashboard. Kept
 * beside the shapes (not in components) so every surface renders a given metric
 * identically. Pure string functions; no dials, no DOM.
 *
 * Duration values are MINUTES throughout (the sessions spine stores minutes).
 */

/** "Jan"…"Dec" — the app's three-letter month faces. */
export const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "January"…"December" — the full faces (calendar heads, period titles). */
export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTHS = MONTHS_SHORT; // internal alias — the formatters below don't churn

/** Thousands-grouped integer: 1980 → "1,980". Locale-independent. */
export const groupInt = (n: number): string =>
  Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Whole hours with a unit: 74400 min → "1,240h" (totals). */
export const hoursWhole = (min: number): string => `${groupInt(min / 60)}h`;

/** One-decimal hours, trailing ".0" trimmed: "4.4h", "19h" (per-week/month averages). */
export const hoursTrim1 = (min: number): string =>
  `${(min / 60).toFixed(1).replace(/\.0$/, "")}h`;

/** Hours + zero-padded minutes: 63 → "1h 03m", 400 → "6h 40m", 45 → "45m". */
export const hoursMinutes = (min: number): string => {
  const mm = Math.round(min);
  const h = Math.floor(mm / 60);
  const m = mm % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};

/** One-decimal count, trailing ".0" trimmed: 4.2 → "4.2", 18.0 → "18". */
export const decimal1 = (n: number): string => n.toFixed(1).replace(/\.0$/, "");

/** "12 Nov 2024" — the D Mon YYYY date form (no leading zero on the day). */
export const fmtDMY = (day: string): string => {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

/** "Dec 2023" from a "YYYY-MM" month key. */
export const fmtMonY = (mk: string): string => {
  const [y, m] = mk.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

/** A day range → "8 Feb–1 Mar 2026" (year shown once when shared, else on both). */
export const fmtRange = (from: string, to: string): string => {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const left = fy === ty ? `${fd} ${MONTHS[fm - 1]}` : `${fd} ${MONTHS[fm - 1]} ${fy}`;
  return `${left}–${td} ${MONTHS[tm - 1]} ${ty}`;
};

/** N stars as glyphs: 5 → "★★★★★". */
export const stars = (n: number): string => "★".repeat(n);

/**
 * COUNT + NOUN, agreeing in number: `plural(1, "entry", "entries")` → "1 entry".
 *
 * Born 2026-08-19 because the app had no such helper and five count-carrying
 * strings said "1 entries" · "1 sessions" · "1 cover images" · "1 files". Every
 * one of them is a DANGER CONFIRM or its button — the surfaces where a number is
 * the whole point — and a confirm that miscounts the thing it is about to delete
 * undermines the one sentence the user is being asked to trust.
 *
 * ⚠ IT WAS NEVER A DISAGREEMENT ABOUT STYLE, ONLY A MISSING PLACE TO PUT IT:
 * `FirstRunSetup` already hand-rolled the ternary correctly, and `BulkEditModal`
 * pluralised "entry/entries" correctly THREE times in the very sentence where it
 * left "sessions" and "image files" plural. The authors knew; there was nothing
 * shared to reach for, so each site paid for it separately and most did not.
 *
 * The plural form is REQUIRED rather than derived by appending "s" — English
 * does not honour that (entry/entries), and a helper that is right for four
 * nouns and wrong for the fifth is worse than none.
 */
export const nounFor = (n: number, one: string, many: string): string =>
  n === 1 ? one : many;

/**
 * The whole phrase, when the count is not marked up separately.
 *
 * ⚠ BOTH EXPORTS EARN THEIR KEEP — the split is not ceremony. Half the tenants
 * bold the NUMBER and leave the noun plain (`<strong>{n}</strong> entries`), so
 * they can only take the noun; the rest want the phrase whole. One helper would
 * have forced the bolded sites back to a hand-rolled ternary, which is exactly
 * the state this replaces.
 */
export const plural = (n: number, one: string, many: string): string =>
  `${n} ${nounFor(n, one, many)}`;

/**
 * ELAPSED label (user-ruled 2026-07-29 for the palette's visit ledger: "show
 * how many minutes/hours/days ago when I opened it" — precise, never a bucket
 * word). Born in palette/recents; MOVED HERE 2026-08-04 when the Backups pane
 * became its third consumer across a second area — a pure formatter belongs in
 * the formatter module, not behind a cross-screen import.
 *
 * Pure when given both arguments; the default is the convenience the call
 * sites want.
 */
export function relLabel(atMs: number, nowMs: number = Date.now()): string {
  const mins = Math.floor((nowMs - atMs) / 60000);
  if (!Number.isFinite(mins) || mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * HTML-escape for derived strings that land in innerHTML (review lines,
 * keepsake substitution). The FIVE-entity contract — & < > " ' — because an
 * escaped value sits in text AND attribute positions; a 3-entity escape
 * (& < > only, cadenceSpec's old copy) is unsafe inside attributes, where an
 * unescaped quote re-opens the markup.
 */
export const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** A delta chip's payload: the arrow+magnitude text and its direction. */
export interface DeltaChip {
  text: string;
  down: boolean;
}

/** Build a delta chip from a signed magnitude and a unit suffix ("", "h", "m"). */
export const deltaChip = (delta: number, unit = ""): DeltaChip => {
  const down = delta < 0;
  const num = decimal1(Math.abs(delta));
  return { text: `${down ? "▼" : "▲"} ${num}${unit}`, down };
};
