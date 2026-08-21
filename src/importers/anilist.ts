/**
 * The ANILIST pair — anime (media) + manga (reading), keyless GraphQL over
 * `graphql.anilist.co`. TWO split sources on one transport helper, the
 * tmdb.ts shape.
 *
 * The two ruled quirk-handlings ([[Importer Runtime & External Access]]):
 *  · **GraphQL errors arrive in `payload.errors[]` under HTTP 200** — the
 *    helper checks the array, never the status alone.
 *  · **The degraded-search window** (200 + empty `media[]` while `Media(id:)`
 *    still works) — empty search is NEVER fatal; the Paste-URLs lane is the
 *    ruled working fallback, which is why paste is load-bearing here.
 *
 * Creators filter — deviation from the old plugin's substring regexes,
 * recorded: live staff payloads carry roles like "Storyboard (eps 4, 13)"
 * and "Art Direction", which the old `/story/i`-class substring matches
 * would wrongly import. Roles are normalized (lowercase, parenthetical
 * stripped) and matched WHOLE against the validated creator set instead.
 *
 * Field map ([[Importer Field Mapping]] §§2–3): title english ‖ romaji
 * (+year) · anime staff (original creator/story/story) + main studio · manga
 * staff (story/art/original) deduped · description cleaned · cover
 * extraLarge ‖ large · type "Anime" / **"Manga" hardcoded** (user-ruled;
 * rare novels/one-shots fixed by hand) · status Planned · genre BLANK.
 */
import type { FetchOutcome, ImportCandidate, ImporterSource, SearchOpts } from "./types";
import { importFetch } from "./http";
import { cleanTitle } from "./titles";
import { cleanDescription, foldYear } from "./text";

const ENDPOINT = "https://graphql.anilist.co";

type MediaKind = "ANIME" | "MANGA";

const gql = async (
  query: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown> | null> => {
  const res = await importFetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as {
    data?: Record<string, unknown>;
    errors?: { message?: string }[];
  };
  // Errors under HTTP 200 — check the array, never the status alone.
  if (Array.isArray(json.errors) && json.errors.length > 0)
    throw new Error(json.errors.map((e) => e.message ?? "GraphQL error").join("; "));
  return json.data ?? null;
};

interface AlTitle {
  english?: string | null;
  romaji?: string | null;
}
interface AlMedia {
  id?: number;
  title?: AlTitle;
  startDate?: { year?: number | null };
  description?: string | null;
  coverImage?: { extraLarge?: string | null; large?: string | null; medium?: string | null };
  staff?: { edges?: { role?: string; node?: { name?: { full?: string } } }[] };
  studios?: { edges?: { isMain?: boolean; node?: { name?: string } }[] };
}

const titleOf = (m: AlMedia): string => cleanTitle(m.title?.english ?? m.title?.romaji ?? "");

/** Whole-role match after normalization — see the header's recorded deviation. */
const CREATOR_ROLES: Record<MediaKind, Set<string>> = {
  ANIME: new Set(["original creator", "original story", "story"]),
  MANGA: new Set(["story & art", "story&art", "story + art", "story", "art", "original creator", "original story"]),
};

const creatorsOf = (m: AlMedia, kind: MediaKind): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const edge of m.staff?.edges ?? []) {
    const role = (edge.role ?? "")
      .toLowerCase()
      .replace(/\(.*?\)/g, "")
      .trim();
    if (!CREATOR_ROLES[kind].has(role)) continue;
    const name = edge.node?.name?.full ?? "";
    if (name !== "" && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
};

// perPage 10, not 12 (2026-08-20): the results grid is 5 columns wide and every
// source returns a multiple of 5 (Steam's storesearch hard-caps at 10), so the
// grid's rows always fill — a count is the grid's business here, not AniList's.
const SEARCH_QUERY = `query ($search: String, $type: MediaType, $isAdult: Boolean) {
  Page(page: 1, perPage: 10) {
    media(search: $search, type: $type, isAdult: $isAdult) {
      id title { english romaji } startDate { year }
      coverImage { large medium }
    }
  }
}`;

const DETAIL_QUERY = `query ($id: Int, $type: MediaType) {
  Media(id: $id, type: $type) {
    id title { english romaji } startDate { year }
    description(asHtml: false)
    coverImage { extraLarge large }
    staff { edges { role node { name { full } } } }
    studios { edges { isMain node { name } } }
  }
}`;

const searchFor =
  (kind: MediaKind) =>
  async (term: string, opts?: SearchOpts): Promise<ImportCandidate[]> => {
    // R18 hidden unless the area's lever says "only" (verified live: the
    // isAdult search arg filters cleanly in both polarities).
    const data = await gql(SEARCH_QUERY, {
      search: term,
      type: kind,
      isAdult: opts?.adult === "only",
    });
    const media =
      ((data?.Page as { media?: AlMedia[] } | undefined)?.media ?? []).filter(
        (m) => m.id != null,
      );
    // Degraded-search window: empty is a normal answer, never an error.
    return media
      .map((m) => ({
        externalId: String(m.id),
        title: titleOf(m),
        subtitle: m.startDate?.year != null ? String(m.startDate.year) : null,
        coverUrl: m.coverImage?.large ?? m.coverImage?.medium ?? null,
      }))
      .filter((c) => c.title !== "");
  };

const classifyFor =
  (kind: MediaKind) =>
  (line: string): { externalId: string } | { error: string } | null => {
    const t = line.trim();
    if (t === "") return null;
    if (/^\d+$/.test(t)) return { externalId: t };
    if (/anilist\.co/i.test(t)) {
      const m = /anilist\.co\/(anime|manga)\/(\d+)/i.exec(t);
      if (!m) return { error: "AniList URL without an /anime/<id> or /manga/<id> segment" };
      const urlKind = m[1].toLowerCase() === "anime" ? "ANIME" : "MANGA";
      if (urlKind !== kind)
        return {
          error:
            kind === "ANIME"
              ? "that is a manga URL — use the reading library's Manga importer"
              : "that is an anime URL — use the media library's Anime importer",
        };
      return { externalId: m[2] };
    }
    return { error: "Not an anilist.co URL or numeric id" };
  };

const fetchFor =
  (kind: MediaKind) =>
  async (id: string): Promise<FetchOutcome> => {
    const data = await gql(DETAIL_QUERY, { id: Number(id), type: kind });
    const m = (data?.Media ?? null) as AlMedia | null;
    if (m?.id == null) return { kind: "failed", reason: `AniList carried no ${kind.toLowerCase()} #${id}` };
    const title = titleOf(m);
    if (title === "") return { kind: "failed", reason: "AniList payload carried no title" };
    const mainStudios =
      kind === "ANIME"
        ? (m.studios?.edges ?? [])
            .filter((e) => e.isMain === true)
            .map((e) => e.node?.name ?? "")
            .filter((n) => n !== "")
        : [];
    return {
      kind: "entry",
      entry: {
        title: foldYear(title, m.startDate?.year),
        description: cleanDescription(m.description),
        creators: creatorsOf(m, kind),
        studios: mainStudios,
        type: kind === "ANIME" ? "Anime" : "Manga",
        genre: [],
        series: null,
        seriesOrder: null,
        words: null,
        coverUrl: m.coverImage?.extraLarge ?? m.coverImage?.large ?? null,
        status: "Planned",
      },
    };
  };

/** The ruled probe: the trivial `{ Media(id:1) { id } }` query. */
const probe = async (): Promise<{ ok: boolean; detail: string }> => {
  try {
    const data = await gql("query { Media(id: 1) { id } }", {});
    return (data?.Media as { id?: number } | null)?.id === 1
      ? { ok: true, detail: "AniList reachable" }
      : { ok: false, detail: "AniList responded but the probe payload was unexpected" };
  } catch (e) {
    return { ok: false, detail: `AniList unreachable — ${String(e)}` };
  }
};

export const anilistAnimeSource: ImporterSource = {
  key: "anilist-anime",
  areaLabel: "Anime",
  sourceName: "AniList",
  habitKey: "media",
  adultFilter: true,
  searchPlaceholder: "Search AniList anime…",
  pasteHelp:
    "One anilist.co/anime/<id> URL or numeric id per line. Load-bearing fallback: AniList search periodically degrades to empty results while id lookups keep working.",
  searchMode: "debounce",
  search: searchFor("ANIME"),
  classifyLine: classifyFor("ANIME"),
  fetchItem: fetchFor("ANIME"),
  probe,
};

export const anilistMangaSource: ImporterSource = {
  key: "anilist-manga",
  areaLabel: "Manga",
  sourceName: "AniList",
  habitKey: "reading",
  adultFilter: true,
  searchPlaceholder: "Search AniList manga…",
  pasteHelp:
    "One anilist.co/manga/<id> URL or numeric id per line. Load-bearing fallback: AniList search periodically degrades to empty results while id lookups keep working.",
  searchMode: "debounce",
  search: searchFor("MANGA"),
  classifyLine: classifyFor("MANGA"),
  fetchItem: fetchFor("MANGA"),
  probe,
};
