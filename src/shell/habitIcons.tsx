/**
 * The habit-icon registry — ICONS AS DATA ([[Iconography]]: a habit's icon is
 * a stored lucide NAME in `habits.icon`; lettermark = the ruled fallback).
 *
 * THE ROSTER IS THE REAL LUCIDE SET SINCE 2026-08-02 (step 10, slice 2's GUI
 * pass — user: "the icon list is extremely limited"). Until then this file
 * held ELEVEN hand-transcribed paths: the seven the frozen frame drew (seed
 * batch 7) plus the four archived habits' (batch 9). That was never the design
 * — [[Iconography]] rules "a searchable browser over ~1,500 names" and that the
 * app "ships a locked lucide version", with the Data Doctor's `unknown-icon`
 * check testing stored names against that pinned set. The transcriptions were
 * a stand-in for a dependency the app had simply never installed, and the
 * picker built on them inherited the stand-in.
 *
 * THE PIN: `lucide` 1.28.0, EXACT in package.json (no caret) — "stored names
 * cannot break between releases"; a bump is the ruled deliberate maintenance
 * pass. 2003 exported names over 1756 distinct icons (the surplus are lucide's
 * own deprecated aliases, kept: searching "alert" should still find
 * `circle-alert`).
 *
 * WHY THE VANILLA PACKAGE, not `lucide-react`: this one ships icons as DATA
 * (`[tag, attrs]` node arrays) rather than components that render their own
 * `<svg>` with their own stroke attributes. Rendering the data into our own
 * `.ico` element is what keeps the theme's icon dials (colour · size · stroke
 * width) governing every glyph — the three-token surface [[Iconography]] rules.
 *
 * RECORDED DEVIATION — the one-shape-vocabulary convention is spent here. The
 * old transcriptions converted lucide's rects/circles/lines into paths so this
 * file spoke one shape language. Upstream draws with seven element types, so
 * `HabitIcon` is now a GENERIC node renderer. Nothing is lost: the attributes
 * are geometry only, and the outline look is the `.ico` rule's, not the data's.
 * (24 icons carry an explicit `fill="currentColor"` on individual nodes —
 * ChartScatter's dots and kin. That is deliberate upstream and correct: the
 * `.ico` rule's `fill:none` sets the inherited default, a node that asks to be
 * filled still is.)
 *
 * NAME RESOLUTION IS HYPHEN- AND CASE-INSENSITIVE, which is what makes this
 * safe: a stored name normalizes (strip hyphens, lowercase) before lookup, so
 * every canonical lucide name resolves — verified against all 1756 of the
 * package's own icon filenames — and so do the 11 names already in the store.
 * The 14 normalization collisions in the export map are pure casing variants
 * of identical glyphs (`Grid2X2` / `Grid2x2`), so a collision cannot pick a
 * wrong drawing.
 */
import { icons as LUCIDE } from "lucide";

/** One drawn element: the tag plus its geometry attributes. */
type IconNode = [string, Record<string, string | number>];

const normalize = (name: string): string => name.replace(/-/g, "").toLowerCase();

/**
 * PascalCase export key → the kebab name we display and store.
 *
 * Faithful for 1974 of 2003 names. The 29 exceptions are digit/acronym runs
 * where lucide's own filename groups differently (`axis-3d` · `arrow-down-a-z`
 * read here as `axis-3-d` · `arrow-down-az`); they are display-only, because
 * lookup normalizes hyphens away. Recorded rather than special-cased — the
 * affected names are sort and 3D-transform icons no habit is likely to wear,
 * and a hardcoded exception table would be one more thing to re-verify at the
 * next pin bump.
 */
const toKebab = (key: string): string =>
  key
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/([A-Za-z])([0-9])/g, "$1-$2")
    .replace(/([0-9])([A-Za-z])/g, "$1-$2")
    .replace(/([A-Z])(?=[A-Z])/g, "$1-")
    .toLowerCase();

/** normalized name → drawn nodes. Built once; the module is imported eagerly
 *  because the rail draws icons on first paint. */
const NODES = new Map<string, IconNode[]>();
/** The picker's inventory — every name, sorted. */
const NAMES: string[] = [];

for (const key of Object.keys(LUCIDE)) {
  const nodes = (LUCIDE as unknown as Record<string, IconNode[]>)[key];
  if (!Array.isArray(nodes)) continue;
  const kebab = toKebab(key);
  const norm = normalize(key);
  if (!NODES.has(norm)) NODES.set(norm, nodes);
  NAMES.push(kebab);
}
NAMES.sort();

/** The full roster, kebab-cased and sorted — `kit-picker-icon`'s inventory. */
export const ICON_NAMES: readonly string[] = NAMES;

/** The stored name's nodes, or null when the name is absent from the pinned
 *  set (the `unknown-icon` case — the caller draws its lettermark). */
export const iconNodes = (icon: string | null | undefined): IconNode[] | null =>
  icon == null ? null : NODES.get(normalize(icon)) ?? null;

/**
 * What the pinned set actually contains — Settings → Habits → Icons.
 *
 * `names` and `icons` differ because lucide keeps its retired names as
 * aliases pointing at the same drawing (`alert-circle` → `circle-alert`), and
 * this app keeps them so search still finds an icon by the name you remember.
 * The distinct count therefore has to compare DRAWINGS, not names.
 *
 * Computed on first ask and cached: it walks every glyph's node data, which is
 * pointless work at launch for a number only one settings tab ever reads.
 */
let stats: { names: number; icons: number } | null = null;
export function iconStats(): { names: number; icons: number } {
  if (stats == null) {
    const drawings = new Set<string>();
    for (const nodes of NODES.values()) drawings.add(JSON.stringify(nodes));
    stats = { names: NAMES.length, icons: drawings.size };
  }
  return stats;
}

/** The pinned lucide version (vite injects it from package.json's pin). */
export const LUCIDE_VERSION: string =
  typeof __LUCIDE_VERSION__ === "string" ? __LUCIDE_VERSION__ : "unknown";

/**
 * The stored icon, or null when the name is absent/unknown — the caller
 * renders its own lettermark fallback (the fallback's SHAPE is per-surface:
 * a letter in the rail swatch, a colour dot in a comparison tile).
 */
export function HabitIcon({
  icon,
  className = "ico",
}: {
  icon: string | null | undefined;
  className?: string;
}) {
  const nodes = iconNodes(icon);
  if (nodes == null) return null;
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {nodes.map(([Tag, attrs], i) => (
        // Geometry-only attributes, passed through as-is — see the header.
        <Tag key={i} {...attrs} />
      ))}
    </svg>
  );
}

export const hasIcon = (icon: string | null | undefined): boolean =>
  iconNodes(icon) != null;
