/**
 * The STEAM source (gaming) — keyless, the chassis exhibit. Endpoints are the
 * storefront pair the old plugin validated ([[Importer Specs]] §1; survey
 * 2026-07-31): `storesearch` for the candidate grid, `appdetails` per item,
 * the static portrait CDN for covers (header image fallback).
 *
 * The SILENT-SKIP validation is load-bearing and carried verbatim in spirit:
 * `success !== true` (region-blocked/unavailable) and `data.type !== "game"`
 * (DLC · demo · soundtrack) both count as SKIPPED with no error surfaced —
 * the old plugin's `silent: true` outcome, now a first-class FetchOutcome.
 *
 * Field map ([[Importer Field Mapping]] §1): name → title · developers[] →
 * studios · short_description (whitespace-collapsed) → description · appid →
 * (`steam`, external_id) · portrait ‖ header → cover ref · status Planned ·
 * genre BLANK deliberately (only Calibre + AO3 import genres) · gaming has no
 * `type`.
 */
import type { FetchOutcome, ImportCandidate, ImporterSource } from "./types";
import { importJson } from "./http";
import { cleanTitle } from "./titles";

const CC = "US";
const LANG = "en";

const portraitUrl = (appid: string): string =>
  `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`;

interface StoreSearchItem {
  id?: number | string;
  name?: string;
  tiny_image?: string;
}

interface AppDetailsData {
  type?: string;
  name?: string;
  developers?: string[];
  short_description?: string;
  header_image?: string;
}

const search = async (term: string): Promise<ImportCandidate[]> => {
  const url =
    "https://store.steampowered.com/api/storesearch/" +
    `?term=${encodeURIComponent(term)}&cc=${CC}&l=${LANG}`;
  const json = (await importJson(url)) as { items?: StoreSearchItem[] } | null;
  const items = Array.isArray(json?.items) ? json.items : [];
  return items
    .filter((it) => it.id != null && typeof it.name === "string")
    .map((it) => ({
      externalId: String(it.id),
      title: cleanTitle(it.name as string),
      subtitle: null,
      // The portrait capsule; a 404 falls back to the lettermark (thumb
      // failure is cosmetic — tiny_image is deliberately not chained, the
      // portrait IS the library's cover shape).
      coverUrl: portraitUrl(String(it.id)),
    }));
};

const classifyLine = (line: string): { externalId: string } | { error: string } | null => {
  const t = line.trim();
  if (t === "") return null;
  if (/^\d+$/.test(t)) return { externalId: t };
  if (/steampowered\.com|steamcommunity\.com/i.test(t)) {
    const m = /\/app\/(\d+)/i.exec(t);
    if (m) return { externalId: m[1] };
    return { error: "Steam URL without an /app/<id> segment" };
  }
  return { error: "Not a Steam store URL or numeric appID" };
};

const fetchItem = async (appid: string): Promise<FetchOutcome> => {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=${CC}&l=${LANG}`;
  const payload = (await importJson(url)) as Record<
    string,
    { success?: boolean; data?: AppDetailsData }
  > | null;
  const entry = payload?.[appid];
  if (!entry || entry.success !== true || !entry.data)
    return { kind: "skipped", reason: "region-blocked or unavailable", silent: true };
  const data = entry.data;
  if (data.type !== "game")
    return { kind: "skipped", reason: `non-game type: ${data.type ?? "unknown"}`, silent: true };
  const title = cleanTitle(data.name ?? "");
  if (title === "") return { kind: "failed", reason: "appdetails carried no name" };
  return {
    kind: "entry",
    entry: {
      title,
      description: data.short_description
        ? data.short_description.replace(/\s+/g, " ").trim() || null
        : null,
      creators: [],
      studios: Array.isArray(data.developers) ? data.developers.filter(Boolean) : [],
      type: null,
      genre: [],
      series: null,
      seriesOrder: null,
      words: null,
      coverUrl: portraitUrl(appid),
      coverFallbackUrl: data.header_image ?? null,
      status: "Planned",
    },
  };
};

/** The ruled probe: `appdetails` for a fixed known appid — one keyless GET.
 * 620 = Portal 2, stable for a decade. */
const probe = async (): Promise<{ ok: boolean; detail: string }> => {
  try {
    const payload = (await importJson(
      `https://store.steampowered.com/api/appdetails?appids=620&cc=${CC}&l=${LANG}`,
    )) as Record<string, { success?: boolean }> | null;
    return payload?.["620"]?.success === true
      ? { ok: true, detail: "Steam storefront reachable" }
      : { ok: false, detail: "Steam responded but the probe payload was unexpected" };
  } catch (e) {
    return { ok: false, detail: `Steam unreachable — ${String(e)}` };
  }
};

export const steamSource: ImporterSource = {
  key: "steam",
  areaLabel: "Games",
  sourceName: "Steam",
  habitKey: "gaming",
  searchPlaceholder: "Search the Steam catalog…",
  pasteHelp:
    "One Steam store URL or numeric appID per line. The fallback lane — use it when catalog search is unavailable.",
  searchMode: "debounce",
  search,
  classifyLine,
  fetchItem,
  probe,
};
