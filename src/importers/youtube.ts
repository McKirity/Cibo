/**
 * The YOUTUBE source (media) — channels only, the one square-cover grid
 * (`squareCovers`: channel pfps are 1:1, not 2:3). Keyed (`key` query param,
 * Data API v3); the key lives in `app_meta` beside TMDB's.
 *
 * Validated old knowledge carried ([[Importer Specs]] §2 + the survey):
 * channel lookup = `channels?part=snippet` with EITHER `id=UC…` OR
 * `forHandle=@handle`; legacy `/c/` and `/user/` URLs are REJECTED ("use the
 * @handle URL"); the canonical identity is the **UC-id from the RESPONSE,
 * never the input handle** (`canonicalExternalId` — the engine re-checks
 * dedup on it); thumbnails `maxres ?? high ?? medium ?? default`.
 *
 * Field map ([[Importer Field Mapping]] §2): snippet.title → title · NO
 * creators/studios/description (the validated old map carries none) · type
 * **"Youtube"** — the SEEDED canonical picklist string (the old plugin wrote
 * `YouTube` here while the vocab said `Youtube`, the recorded case trap; the
 * canonical string is written from this one constant, never retyped) ·
 * status **"Finished"** (already-followed, the one exception to Planned).
 */
import type { FetchOutcome, ImportCandidate, ImporterSource } from "./types";
import { importJson } from "./http";
import { cleanTitle } from "./titles";
import { getImporterKey } from "./keys";

const API = "https://www.googleapis.com/youtube/v3";

const KEY_MISSING = "YouTube API key not set — add it in Settings → Importers.";

/** The canonical seeded media-type string — see seed.ts's media picklist. */
const TYPE_YOUTUBE = "Youtube";

interface Thumbnails {
  maxres?: { url?: string };
  high?: { url?: string };
  medium?: { url?: string };
  default?: { url?: string };
}

const thumbOf = (t: Thumbnails | undefined): string | null =>
  t?.maxres?.url ?? t?.high?.url ?? t?.medium?.url ?? t?.default?.url ?? null;

const search = async (term: string): Promise<ImportCandidate[]> => {
  const key = await getImporterKey("youtube");
  if (key == null) throw new Error(KEY_MISSING);
  const url =
    `${API}/search?part=snippet&type=channel&maxResults=10` +
    `&q=${encodeURIComponent(term)}&key=${encodeURIComponent(key)}`;
  const json = (await importJson(url)) as {
    items?: { id?: { channelId?: string }; snippet?: { title?: string; thumbnails?: Thumbnails } }[];
  } | null;
  const items = Array.isArray(json?.items) ? json.items : [];
  return items
    .filter((it) => it.id?.channelId != null && it.snippet?.title != null)
    .map((it) => ({
      externalId: it.id!.channelId!,
      title: cleanTitle(it.snippet!.title!),
      subtitle: null,
      coverUrl: thumbOf(it.snippet!.thumbnails),
    }));
};

const classifyLine = (line: string): { externalId: string } | { error: string } | null => {
  const t = line.trim();
  if (t === "") return null;
  if (/^UC[\w-]{20,}$/.test(t)) return { externalId: t };
  if (/^@[\w.\-]+$/.test(t)) return { externalId: t };
  if (/youtube\.com|youtu\.be/i.test(t)) {
    const ch = /youtube\.com\/channel\/(UC[\w-]{20,})/i.exec(t);
    if (ch) return { externalId: ch[1] };
    const handle = /youtube\.com\/(@[\w.\-]+)/i.exec(t);
    if (handle) return { externalId: handle[1] };
    if (/youtube\.com\/(c|user)\//i.test(t))
      return { error: "legacy /c/ and /user/ URLs are ambiguous — use the channel's @handle URL" };
    return { error: "YouTube URL without a /channel/UC… or /@handle segment" };
  }
  return { error: "Not a YouTube channel URL, UC-id, or @handle" };
};

const fetchItem = async (externalId: string): Promise<FetchOutcome> => {
  const key = await getImporterKey("youtube");
  if (key == null) return { kind: "failed", reason: KEY_MISSING };
  const param = externalId.startsWith("@")
    ? `forHandle=${encodeURIComponent(externalId)}`
    : `id=${encodeURIComponent(externalId)}`;
  const json = (await importJson(
    `${API}/channels?part=snippet&${param}&key=${encodeURIComponent(key)}`,
  )) as { items?: { id?: string; snippet?: { title?: string; thumbnails?: Thumbnails } }[] } | null;
  const item = json?.items?.[0];
  if (item?.id == null)
    return { kind: "failed", reason: `no channel found for ${externalId}` };
  const title = cleanTitle(item.snippet?.title ?? "");
  if (title === "") return { kind: "failed", reason: "channel payload carried no title" };
  return {
    kind: "entry",
    entry: {
      title,
      description: null,
      creators: [],
      studios: [],
      type: TYPE_YOUTUBE,
      genre: [],
      series: null,
      seriesOrder: null,
      words: null,
      coverUrl: thumbOf(item.snippet?.thumbnails),
      status: "Finished",
      // The response's UC-id IS the identity — a pasted @handle never lands
      // as external_id.
      canonicalExternalId: item.id,
    },
  };
};

/** The ruled probe: a minimal keyed `i18nLanguages` call — cheapest quota
 * cost in the API (the "exact pick" the design note left to Build). */
const probe = async (): Promise<{ ok: boolean; detail: string }> => {
  const key = await getImporterKey("youtube");
  if (key == null) return { ok: false, detail: KEY_MISSING };
  try {
    const json = (await importJson(
      `${API}/i18nLanguages?part=snippet&key=${encodeURIComponent(key)}`,
    )) as { items?: unknown[] } | null;
    return Array.isArray(json?.items)
      ? { ok: true, detail: "YouTube Data API reachable, key accepted" }
      : { ok: false, detail: "YouTube responded but the probe payload was unexpected" };
  } catch (e) {
    const msg = String(e);
    return {
      ok: false,
      detail: /HTTP 4\d\d/.test(msg)
        ? `YouTube rejected the key or quota (${msg})`
        : `YouTube unreachable — ${msg}`,
    };
  }
};

const notice = async (): Promise<string | null> =>
  (await getImporterKey("youtube")) == null ? KEY_MISSING : null;

export const youtubeSource: ImporterSource = {
  key: "youtube",
  areaLabel: "YouTube",
  sourceName: "YouTube",
  habitKey: "media",
  searchPlaceholder: "Search YouTube channels…",
  pasteHelp:
    "One channel per line: a youtube.com/@handle or /channel/UC… URL, a bare @handle, or a UC-id. Legacy /c/ and /user/ URLs are not accepted.",
  searchMode: "debounce",
  squareCovers: true,
  search,
  classifyLine,
  fetchItem,
  probe,
  notice,
};
