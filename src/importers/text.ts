/**
 * Shared text cleanup for the importers — the old plugin's validated
 * `cleanDescription` behavior, re-made deliberately ([[Importer Field
 * Mapping]] § descriptions: "short overviews and cleaned long synopses
 * (spoiler-marker stripping, entity decoding) all land in the one
 * `description` column").
 *
 * Lives beside titles.ts at the SHARED tier: AniList, Calibre and AO3 all
 * ship HTML-ish synopses and each running its own cleanup is exactly the
 * per-module duplication the one-interface contract exists to prevent.
 */

/** The release-year fold — "Dune (2021)"; no year column ([[Importer Field
 * Mapping]] § titles). A missing/zero year folds nothing. */
export const foldYear = (title: string, year: number | string | null | undefined): string => {
  const y = year == null ? "" : String(year);
  return /^\d{4}$/.test(y) ? `${title} (${y})` : title;
};

/**
 * Synopsis → plain text for the `description` column:
 *  · AniList spoiler markers (`~!…!~`) and `<spoiler>` blocks drop whole
 *  · `<br>`/`<p>` become line breaks BEFORE tag stripping (keeps paragraphs)
 *  · remaining tags strip + entities decode in one DOMParser pass (webview
 *    string work — no network, no ruling implicated)
 *  · a trailing "(Source: …)" / "(Written by …)" credit truncates
 * Returns null for empty results so skip-never-overwrite composes.
 */
export const cleanDescription = (raw: string | null | undefined): string | null => {
  if (raw == null) return null;
  let s = raw
    .replace(/~![\s\S]*?!~/g, "")
    .replace(/<spoiler>[\s\S]*?<\/spoiler>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?p[^>]*>/gi, "\n");
  s = new DOMParser().parseFromString(s, "text/html").documentElement.textContent ?? "";
  s = s
    .replace(/\((?:Source|Written by)[^)]*\)\s*$/i, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s === "" ? null : s;
};
