/**
 * THE KEEPSAKE SNIPPET PIPELINE — substitute → sanitize → (shadow root).
 *
 * Owning ruling: [[Habit Artwork & Assets]] § Amended 2026-07-26. The contract
 * an author reads is [[Dev Manual Content]] § Keepsake tile format — the single
 * copy, deliberately not restated here.
 *
 * THREE THINGS THIS FILE IS NOT ALLOWED TO DO:
 *
 *  1 · IT NEVER SPEAKS. "At render, any failure → the fallback tile, never an
 *      error" — a finalized day must not shout about a broken tile, and the
 *      lettermark fallback is a legitimate permanent look. The talkative half
 *      (a live preview and named rejection reasons) belongs to the PASTE SLOT,
 *      which is step 10 and is not built here.
 *  2 · IT NEVER TRUSTS THE SHADOW ROOT. Encapsulation is not security: the
 *      shadow root exists so a snippet can carry its own `<style>` sealed from
 *      the app while custom properties still inherit through the boundary (the
 *      only reason theme dials keep resolving). Sanitization is the gate,
 *      regardless.
 *  3 · IT NEVER EVALUATES. Substitution is TEXT-ONLY — no template language, no
 *      loops, no expressions. Anything conditional is a CSS attribute selector
 *      over a substituted attribute, which is why snippets stay logic-free and
 *      the sanitizer's job stays small.
 *
 * Everything here is pure so the harness can drive it without a DOM; the React
 * host lives in `KeepsakeTile.tsx`.
 */
import { groupInt, hoursMinutes } from "../metrics/format";

// ── The values a snippet can ask for ─────────────────────────────────────────

/**
 * One habit's substitutions for one day. `cats` is keyed by definition key, so
 * `{{cat:keyboard_board}}` reads `cats["keyboard_board"]`.
 */
export interface KeepsakeValues {
  habitName: string;
  habitColor: string;
  date: string;
  /** The day's measure total, in its natural form. */
  value: string;
  /** That measure's unit label. */
  unit: string;
  /** The time total, formatted ("1h 35m"). */
  duration: string;
  /** The count total — only meaningful when the habit declares both measures. */
  count: string;
  /** How many bouts were logged. */
  sessions: string;
  cats: Readonly<Record<string, string>>;
  /** Active flags, space-separated — the `[data-flags~="8h"]` token list. */
  flags: string;
  rangeStart: string;
  rangeEnd: string;
  /** The two ends as 0–100 positions on the night axis. */
  rangeStartPct: string;
  rangeEndPct: string;
}

/**
 * The habit + day facts the values are derived from. Deliberately structural
 * (no Evolu types) so the harness can build one from literals.
 */
export interface KeepsakeInput {
  name: string;
  colourSlot: string;
  day: string;
  measuresTime: boolean;
  measuresCount: boolean;
  countUnit: string | null;
  /** The day's sessions for this habit. */
  rows: ReadonlyArray<{
    measure_kind: "time" | "count" | "range" | "none";
    value: number | null;
    start: string | null;
    end: string | null;
  }>;
  /** Merged session categoricals for the day — later bouts win. */
  cats: Readonly<Record<string, string>>;
  /** Derived-rule labels that HELD on the day, plus any true stored flags. */
  flags: ReadonlyArray<string>;
}

const minutesOf = (r: KeepsakeInput["rows"][number]): number => {
  if (r.measure_kind === "time") return r.value ?? 0;
  if (r.measure_kind === "range" && r.start != null && r.end != null)
    return Math.max(0, Math.round((Date.parse(r.end) - Date.parse(r.start)) / 60_000));
  return 0;
};

/** "23:40" out of a stored local "2026-07-26T23:40". */
const clock = (dt: string | null): string => (dt == null ? "" : dt.slice(11, 16));

/**
 * Position on the SLEEP AXIS — 18:00 → 18:00, the axis the frozen tile's span
 * bar is drawn against, so a normal night never wraps. A night that does wrap
 * (an evening nap logged as sleep) would otherwise draw a bar running backwards
 * off the tile, so the end clamps to the axis edge instead.
 */
export const nightPct = (dt: string | null): number => {
  if (dt == null) return 0;
  const mins = Number(dt.slice(11, 13)) * 60 + Number(dt.slice(14, 16));
  const from18 = (mins - 18 * 60 + 1440) % 1440;
  return Math.round((from18 / 1440) * 1000) / 10;
};

export function keepsakeValues(input: KeepsakeInput): KeepsakeValues {
  const timeMins = input.rows.reduce((a, r) => a + minutesOf(r), 0);
  const counts = input.rows
    .filter((r) => r.measure_kind === "count")
    .reduce((a, r) => a + (r.value ?? 0), 0);
  const range = input.rows.find((r) => r.measure_kind === "range");

  // `{{value}}` is "the day's measure total" — the count where a habit declares
  // one (Keyboard's words), otherwise the minutes (Embroidery's 45). Grouped,
  // because every drawn tile groups it; `{{duration}}` is the formatted twin.
  const primary = input.measuresCount ? counts : timeMins;
  const unit = input.measuresCount ? (input.countUnit ?? "") : "min";

  let startPct = 0;
  let endPct = 0;
  if (range != null) {
    startPct = nightPct(range.start);
    endPct = nightPct(range.end);
    if (endPct <= startPct) endPct = 100;
  }

  return {
    habitName: input.name,
    habitColor: `var(--${input.colourSlot})`,
    date: input.day,
    value: groupInt(primary),
    unit,
    duration: hoursMinutes(timeMins),
    count: groupInt(counts),
    sessions: String(input.rows.length),
    cats: input.cats,
    flags: input.flags.join(" "),
    rangeStart: clock(range?.start ?? null),
    rangeEnd: clock(range?.end ?? null),
    rangeStartPct: String(startPct),
    rangeEndPct: String(endPct),
  };
}

// ── Substitution ─────────────────────────────────────────────────────────────

/**
 * The one place a placeholder is spelled. Substituted values are HTML-ESCAPED:
 * a snippet's placeholder sits in text and attribute positions, and an entry
 * title or a hand-typed board carrying `<` or `"` would otherwise re-open the
 * markup the sanitizer just closed.
 */
const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const PLACEHOLDER = /\{\{\s*([a-z-]+(?::[A-Za-z0-9_-]+)?)\s*\}\}/g;

export function substitute(snippet: string, v: KeepsakeValues): string {
  return snippet.replace(PLACEHOLDER, (whole, token: string) => {
    if (token.startsWith("cat:")) return escapeHtml(v.cats[token.slice(4)] ?? "");
    switch (token) {
      case "habit-name": return escapeHtml(v.habitName);
      case "habit-color": return escapeHtml(v.habitColor);
      case "date": return escapeHtml(v.date);
      case "value": return escapeHtml(v.value);
      case "unit": return escapeHtml(v.unit);
      case "duration": return escapeHtml(v.duration);
      case "count": return escapeHtml(v.count);
      case "sessions": return escapeHtml(v.sessions);
      case "flags": return escapeHtml(v.flags);
      case "range-start": return escapeHtml(v.rangeStart);
      case "range-end": return escapeHtml(v.rangeEnd);
      case "range-start-pct": return escapeHtml(v.rangeStartPct);
      case "range-end-pct": return escapeHtml(v.rangeEndPct);
      // An unknown token is left standing rather than blanked: it is visible in
      // the paste preview (step 10) and harmless on the wall, where blanking it
      // would silently look like real-but-empty data.
      default: return whole;
    }
  });
}

// ── Sanitization ─────────────────────────────────────────────────────────────

/**
 * The tag whitelist. Deliberately generous on drawing elements (this is art)
 * and closed on anything that loads, executes or navigates.
 */
const ALLOWED_TAGS = new Set([
  "div", "span", "p", "b", "i", "em", "strong", "small", "br", "hr",
  "ul", "ol", "li", "dl", "dt", "dd", "h1", "h2", "h3", "h4", "h5", "h6",
  "figure", "figcaption", "img", "style", "table", "thead", "tbody", "tr", "td", "th",
  // inline SVG — the medium half the contract calls "code-drawn"
  "svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon",
  "text", "tspan", "defs", "lineargradient", "radialgradient", "stop", "clippath",
  "mask", "pattern", "use", "symbol", "filter", "fegaussianblur", "feoffset",
  "femerge", "femergenode", "feblend", "fecolormatrix", "title", "desc",
]);

const BLOCKED_TAGS = new Set(["script", "iframe", "object", "embed", "link", "base", "meta", "form", "input", "textarea", "button", "select", "a"]);

/**
 * A URL is legal iff it stays INSIDE the app. Read literally, the contract's
 * "no external URLs" also barred `images/embroidery/tile.png`, which made its
 * own degenerate case (a picture plus the measure) illegal by accident — the
 * one authoring route that needs no code. So: root-relative paths resolve;
 * anything carrying a scheme or a host is blocked; `data:` is blocked on SIZE
 * grounds, a snippet being synced data.
 */
export const urlIsInternal = (raw: string): boolean => {
  const url = raw.trim();
  if (url === "") return false;
  if (url.startsWith("//")) return false; // protocol-relative → a host
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return false; // any scheme, incl. data:
  if (url.startsWith("#")) return true;
  return true; // a plain relative or root-relative path
};

/** `url(...)` targets inside inline CSS get the same treatment as `src`. */
const cssIsSafe = (css: string): boolean => {
  const urls = css.match(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi) ?? [];
  for (const u of urls) {
    const inner = /url\(\s*(['"]?)([^'")]*)\1\s*\)/i.exec(u)?.[2] ?? "";
    if (!urlIsInternal(inner)) return false;
  }
  // `@import` reaches outside by definition, and `expression()` is executable.
  return !/@import/i.test(css) && !/expression\s*\(/i.test(css);
};

export interface SanitizeReport {
  /** Anything removed — the paste slot's raw material (step 10). Unused here. */
  removed: string[];
}

/**
 * Sanitize a live DOM subtree IN PLACE. Takes a container whose children are
 * the parsed fragment; returns what it stripped.
 *
 * Done on a parsed tree rather than by regex on purpose: HTML's own parser is
 * the only thing that agrees with the browser about where a tag ends, and every
 * regex sanitizer eventually disagrees with it.
 */
export function sanitizeTree(root: Element, doc: Document): SanitizeReport {
  const removed: string[] = [];
  const walk = (el: Element): void => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase();
      if (BLOCKED_TAGS.has(tag) || !ALLOWED_TAGS.has(tag)) {
        removed.push(`<${tag}>`);
        child.remove();
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on")) {
          removed.push(`${tag}[${name}]`);
          child.removeAttribute(attr.name);
          continue;
        }
        if ((name === "src" || name === "href" || name === "xlink:href") && !urlIsInternal(attr.value)) {
          removed.push(`${tag}[${name}]`);
          child.removeAttribute(attr.name);
          continue;
        }
        if (name === "style" && !cssIsSafe(attr.value)) {
          removed.push(`${tag}[style]`);
          child.removeAttribute(attr.name);
        }
      }
      if (tag === "style" && !cssIsSafe(child.textContent ?? "")) {
        removed.push("<style> (external reference)");
        child.remove();
        continue;
      }
      walk(child);
    }
  };
  walk(root);
  void doc;
  return { removed };
}

/**
 * The whole render path, DOM-side: substitute, parse, sanitize, and hand back a
 * fragment. Returns null when there is nothing to draw — the caller then shows
 * the lettermark fallback, silently.
 */
export function renderSnippet(
  snippet: string | null,
  values: KeepsakeValues,
  doc: Document,
): { node: DocumentFragment; removed: string[] } | null {
  if (snippet == null || snippet.trim() === "") return null;
  try {
    const html = substitute(snippet, values);
    const host = doc.createElement("div");
    host.innerHTML = html;
    const report = sanitizeTree(host, doc);
    if (host.children.length === 0) return null;
    const frag = doc.createDocumentFragment();
    while (host.firstChild) frag.appendChild(host.firstChild);
    return { node: frag, removed: report.removed };
  } catch {
    // Silence is the ruling. A snippet that cannot be drawn is a lettermark.
    return null;
  }
}
