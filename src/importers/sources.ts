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
const SOURCES: ImporterSource[] = [
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
 * ONE "Import" door per library (user-ruled 2026-08-01 — the per-source
 * doors collapsed; the modal's area switch owns source selection). Live for
 * every label since all five source families built the same day.
 */
export const importDoorReady = (label: string): boolean => label === "Import";
