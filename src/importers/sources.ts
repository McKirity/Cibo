/**
 * The per-door source registry — which importer areas a habit's Import door
 * offers ([[Dashboard Composition]]: gaming Steam · media Movies/TV/Anime/
 * YouTube · reading Calibre/Manga/AO3). ALL EIGHT SOURCES LIVE as of
 * 2026-08-01 (step 8's source pass); registration order per habit IS the
 * modal's area-switch order.
 */
import type { ImporterSource } from "./types";
import { steamSource } from "./steam";
import { tmdbMovieSource, tmdbTvSource } from "./tmdb";
import { anilistAnimeSource, anilistMangaSource } from "./anilist";
import { youtubeSource } from "./youtube";
import { calibreSource } from "./calibre";
import { ao3Source } from "./ao3";

/** Live sources, in area-switch order per habit. */
export const SOURCES: ImporterSource[] = [
  steamSource,
  tmdbMovieSource,
  tmdbTvSource,
  anilistAnimeSource,
  youtubeSource,
  calibreSource,
  anilistMangaSource,
  ao3Source,
];

export const sourcesForHabit = (habitKey: string): ImporterSource[] =>
  SOURCES.filter((s) => s.habitKey === habitKey);

/**
 * One entry per SERVICE, for the health home's "per importer" rows — the
 * eight sources collapse to six services (TMDB's movie/TV split and AniList's
 * anime/manga split are one endpoint and one key each, so probing both would
 * ask the same question twice).
 */
export const importerServices = (): { name: string; probe: ImporterSource }[] => {
  const out: { name: string; probe: ImporterSource }[] = [];
  for (const s of SOURCES) {
    if (!out.some((x) => x.name === s.sourceName)) out.push({ name: s.sourceName, probe: s });
  }
  return out;
};

/* ONE "Import" door per library (user-ruled 2026-08-01 — the per-source doors
 * collapsed; the modal's area switch owns source selection). The
 * `importDoorReady` gate that lived here died 2026-08-04: every door has been
 * live since step 8 closed, so the check was dead code. */
