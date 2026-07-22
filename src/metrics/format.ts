/**
 * Presentation formatters — how derived numbers read on the dashboard. Kept
 * beside the shapes (not in components) so every surface renders a given metric
 * identically. Pure string functions; no dials, no DOM.
 *
 * Duration values are MINUTES throughout (the sessions spine stores minutes).
 */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

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

/** A delta chip's payload: the arrow+magnitude text and its direction. */
export interface DeltaChip {
  text: string;
  down: boolean;
}

/** Build a delta chip from a signed magnitude and a unit suffix ("", "h", "m"). */
export const deltaChip = (delta: number, unit = ""): DeltaChip => {
  const down = delta < 0;
  const mag = Math.abs(delta);
  const num = unit === "" ? decimal1(mag) : `${decimal1(mag)}`;
  return { text: `${down ? "▼" : "▲"} ${num}${unit}`, down };
};
