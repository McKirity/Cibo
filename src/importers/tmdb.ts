/**
 * The TMDB pair (media) — Movies + TV as TWO split sources, `tmdb-movie` /
 * `tmdb-tv`, dissolving the old plugin's id collision by construction (movie
 * #500 and TV #500 are different pairs AND different cover filenames —
 * [[Old Importer Survey]] § bugs not to inherit).
 *
 * Keyed: v3 `api_key` query-param style (not Bearer) — the key lives in
 * `app_meta` (synced plain; Settings → Importers owns entry). A missing key
 * is a LEGIBLE state, never a silent empty search:
 * the source's `notice` names it, and a keyless fetch fails with the same
 * message.
 *
 * Validated old knowledge carried ([[Importer Specs]] §2): movie detail needs
 * `append_to_response=credits` (directors = crew job "Director", first 3); TV
 * does NOT (`created_by[]` rides the base payload); search adds
 * `include_adult=false`; posters `w780` for import, `w342` thumbs; year from
 * `release_date`/`first_air_date`.slice(0,4) folds into the title.
 *
 * Field map ([[Importer Field Mapping]] §2): type "Movie"/"TV Show" · status
 * Planned · genre BLANK deliberately (only Calibre + AO3 import genres).
 */
import type { FetchOutcome, ImportCandidate, ImporterSource } from "./types";
import { importJson } from "./http";
import { cleanTitle } from "./titles";
import { cleanDescription, foldYear } from "./text";
import { getImporterKey } from "./keys";

const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

const KEY_MISSING = "TMDB API key not set — add it in Settings → Importers.";

const poster = (path: string | null | undefined, size: "w342" | "w780"): string | null =>
  path ? `${IMG}/${size}${path}` : null;

interface SearchRow {
  id?: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
}

const yearOf = (date: string | null | undefined): string | null =>
  date && /^\d{4}/.test(date) ? date.slice(0, 4) : null;

const searchFor =
  (kind: "movie" | "tv") =>
  async (term: string): Promise<ImportCandidate[]> => {
    const key = await getImporterKey("tmdb");
    if (key == null) throw new Error(KEY_MISSING);
    const url =
      `${API}/search/${kind}?api_key=${encodeURIComponent(key)}` +
      `&query=${encodeURIComponent(term)}&include_adult=false`;
    const json = (await importJson(url)) as { results?: SearchRow[] } | null;
    const rows = Array.isArray(json?.results) ? json.results : [];
    return rows
      .filter((r) => r.id != null)
      .map((r) => {
        const rawTitle = (kind === "movie" ? r.title : r.name) ?? "";
        const year = yearOf(kind === "movie" ? r.release_date : r.first_air_date);
        return {
          externalId: String(r.id),
          title: cleanTitle(rawTitle),
          subtitle: year,
          coverUrl: poster(r.poster_path, "w342"),
        };
      })
      .filter((c) => c.title !== "");
  };

/** One classifier per area — a URL for the OTHER area gets a legible pointer,
 * not a silent miss (the AniList anime/manga cross-rejection pattern). */
const classifyFor =
  (kind: "movie" | "tv") =>
  (line: string): { externalId: string } | { error: string } | null => {
    const t = line.trim();
    if (t === "") return null;
    if (/^\d+$/.test(t)) return { externalId: t };
    if (/themoviedb\.org/i.test(t)) {
      const m = /themoviedb\.org\/(movie|tv)\/(\d+)/i.exec(t);
      if (!m) return { error: "TMDB URL without a /movie/<id> or /tv/<id> segment" };
      if (m[1].toLowerCase() !== kind)
        return {
          error: `that is a ${m[1] === "movie" ? "Movie" : "TV"} URL — switch to the ${
            m[1] === "movie" ? "Movies" : "TV"
          } area`,
        };
      return { externalId: m[2] };
    }
    return { error: "Not a themoviedb.org URL or numeric id" };
  };

interface MovieDetail {
  title?: string;
  release_date?: string;
  overview?: string;
  poster_path?: string | null;
  production_companies?: { name?: string }[];
  credits?: { crew?: { job?: string; name?: string }[] };
}

interface TvDetail {
  name?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  created_by?: { name?: string }[];
  networks?: { name?: string }[];
}

const names = (xs: { name?: string }[] | undefined): string[] =>
  Array.isArray(xs) ? xs.map((x) => x.name ?? "").filter((n) => n !== "") : [];

const fetchMovie = async (id: string): Promise<FetchOutcome> => {
  const key = await getImporterKey("tmdb");
  if (key == null) return { kind: "failed", reason: KEY_MISSING };
  const data = (await importJson(
    `${API}/movie/${id}?api_key=${encodeURIComponent(key)}&append_to_response=credits`,
  )) as MovieDetail | null;
  const title = cleanTitle(data?.title ?? "");
  if (title === "") return { kind: "failed", reason: "TMDB movie payload carried no title" };
  const directors = (data?.credits?.crew ?? [])
    .filter((c) => c.job === "Director")
    .map((c) => c.name ?? "")
    .filter((n) => n !== "")
    .slice(0, 3);
  return {
    kind: "entry",
    entry: {
      title: foldYear(title, yearOf(data?.release_date)),
      description: cleanDescription(data?.overview),
      creators: directors,
      studios: names(data?.production_companies),
      type: "Movie",
      genre: [],
      series: null,
      seriesOrder: null,
      words: null,
      coverUrl: poster(data?.poster_path, "w780"),
      status: "Planned",
    },
  };
};

const fetchTv = async (id: string): Promise<FetchOutcome> => {
  const key = await getImporterKey("tmdb");
  if (key == null) return { kind: "failed", reason: KEY_MISSING };
  const data = (await importJson(
    `${API}/tv/${id}?api_key=${encodeURIComponent(key)}`,
  )) as TvDetail | null;
  const title = cleanTitle(data?.name ?? "");
  if (title === "") return { kind: "failed", reason: "TMDB TV payload carried no title" };
  return {
    kind: "entry",
    entry: {
      title: foldYear(title, yearOf(data?.first_air_date)),
      description: cleanDescription(data?.overview),
      creators: names(data?.created_by),
      studios: names(data?.networks),
      type: "TV Show",
      genre: [],
      series: null,
      seriesOrder: null,
      words: null,
      coverUrl: poster(data?.poster_path, "w780"),
      status: "Planned",
    },
  };
};

/** The ruled probe: `/3/configuration` with the stored key — the canonical
 * cheapest keyed call ([[Importer Runtime & External Access]]). */
const probe = async (): Promise<{ ok: boolean; detail: string }> => {
  const key = await getImporterKey("tmdb");
  if (key == null) return { ok: false, detail: KEY_MISSING };
  try {
    const json = (await importJson(
      `${API}/configuration?api_key=${encodeURIComponent(key)}`,
    )) as { images?: unknown } | null;
    return json?.images != null
      ? { ok: true, detail: "TMDB reachable, key accepted" }
      : { ok: false, detail: "TMDB responded but the probe payload was unexpected" };
  } catch (e) {
    const msg = String(e);
    return {
      ok: false,
      detail: /HTTP 401/.test(msg) ? "TMDB rejected the API key (401)" : `TMDB unreachable — ${msg}`,
    };
  }
};

const notice = async (): Promise<string | null> =>
  (await getImporterKey("tmdb")) == null ? KEY_MISSING : null;

export const tmdbMovieSource: ImporterSource = {
  key: "tmdb-movie",
  areaLabel: "Movies",
  sourceName: "TMDB",
  habitKey: "media",
  searchPlaceholder: "Search TMDB movies…",
  pasteHelp:
    "One themoviedb.org/movie/<id> URL or numeric id per line. The fallback lane — use it when catalog search is unavailable.",
  searchMode: "debounce",
  search: searchFor("movie"),
  classifyLine: classifyFor("movie"),
  fetchItem: fetchMovie,
  probe,
  notice,
};

export const tmdbTvSource: ImporterSource = {
  key: "tmdb-tv",
  areaLabel: "TV",
  sourceName: "TMDB",
  habitKey: "media",
  searchPlaceholder: "Search TMDB TV shows…",
  pasteHelp:
    "One themoviedb.org/tv/<id> URL or numeric id per line. The fallback lane — use it when catalog search is unavailable.",
  searchMode: "debounce",
  search: searchFor("tv"),
  classifyLine: classifyFor("tv"),
  fetchItem: fetchTv,
  probe,
  notice,
};
