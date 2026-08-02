/**
 * The AO3 source (reading) — the fifth importer and the first HTML scraper:
 * AO3 has NO JSON API ([[Importer Runtime & External Access]] § AO3), so the
 * Rust-side fetch (plugin-http, the allowlisted path) returns work/search
 * PAGES and this module parses them.
 *
 * Implementation note, recorded (mechanic, not a ruling): the step note
 * drafted a Rust `scraper`-crate parse; built instead on the webview's
 * DOMParser over the SAME Rust-fetched HTML — the network ruling ("the
 * webview never talks to the network") is untouched, parsing is pure string
 * work, and AO3's PROVISIONAL selectors iterate under hot reload instead of
 * recompiles. Selectors verified against live pages 2026-08-01 (search
 * blurbs + work meta + the adult-interstitial recovery below).
 *
 * The ruled input shape: **search fires on EXPLICIT SUBMIT only** (Enter /
 * the Search button — never the 300 ms debounce; AO3 soft-bans keystroke
 * scrapers), and candidates come from the metadata-rich search BLURBS — the
 * full work page is fetched only for queued items.
 *
 * Two legible failure paths, verified live:
 *  · restricted works redirect to /users/login → failed with a named reason
 *    (Mode B machinery, deferred);
 *  · the adult-content interstitial (a `?view_adult=true` lost across AO3's
 *    /works → /chapters redirect) → ONE refetch of the effective URL with
 *    the param re-appended.
 *
 * Field map ([[Importer Field Mapping]] §5): title · authors → creators
 * ("Anonymous"/orphaned as-shown) · summary → description · words ·
 * AO3 series + position → series/series_order · **fandoms → genre, IMPORTED**
 * (auto-added, the Calibre pattern) · type "Fanfiction" (hardcoded) · status
 * Planned · NO cover ever — the lettermark is the legitimate look.
 */
import type { FetchOutcome, ImportCandidate, ImporterSource } from "./types";
import { importFetch } from "./http";
import { cleanTitle } from "./titles";

const HOST = "https://archiveofourown.org";

const parseDoc = (html: string): Document =>
  new DOMParser().parseFromString(html, "text/html");

const text = (el: Element | null): string => el?.textContent?.replace(/\s+/g, " ").trim() ?? "";

const search = async (term: string): Promise<ImportCandidate[]> => {
  const res = await importFetch(
    `${HOST}/works/search?work_search%5Bquery%5D=${encodeURIComponent(term)}`,
  );
  const doc = parseDoc(await res.text());
  const out: ImportCandidate[] = [];
  for (const li of doc.querySelectorAll("li.work.blurb.group")) {
    const link = li.querySelector('h4.heading a[href*="/works/"]');
    const m = /\/works\/(\d+)/.exec(link?.getAttribute("href") ?? "");
    if (link == null || m == null) continue;
    const title = cleanTitle(text(link));
    if (title === "") continue;
    const author = text(li.querySelector('a[rel="author"]')) || "Anonymous";
    out.push({ externalId: m[1], title, subtitle: author, coverUrl: null });
  }
  return out;
};

const classifyLine = (line: string): { externalId: string } | { error: string } | null => {
  const t = line.trim();
  if (t === "") return null;
  if (/^\d+$/.test(t)) return { externalId: t };
  if (/archiveofourown\.org/i.test(t)) {
    const m = /\/works\/(\d+)/.exec(t);
    if (m) return { externalId: m[1] };
    return { error: "AO3 URL without a /works/<id> segment" };
  }
  return { error: "Not an archiveofourown.org work URL or numeric work id" };
};

/** Fetch a work page, riding out the login redirect and the adult
 * interstitial (both verified live — see the header). */
const fetchWorkPage = async (
  id: string,
): Promise<{ doc: Document } | { failed: string }> => {
  let res = await importFetch(`${HOST}/works/${id}?view_adult=true`);
  if (/\/users\/login/.test(res.url))
    return {
      failed: "restricted work — only available to logged-in AO3 users (not supported)",
    };
  let html = await res.text();
  if (html.includes("Adult Content Warning")) {
    // The /works → /chapters redirect dropped the param; re-append it on the
    // effective URL. One extra request, only on interstitial pages.
    const sep = res.url.includes("?") ? "&" : "?";
    res = await importFetch(`${res.url}${sep}view_adult=true`);
    if (/\/users\/login/.test(res.url))
      return {
        failed: "restricted work — only available to logged-in AO3 users (not supported)",
      };
    html = await res.text();
  }
  return { doc: parseDoc(html) };
};

const fetchItem = async (id: string): Promise<FetchOutcome> => {
  const page = await fetchWorkPage(id);
  if ("failed" in page) return { kind: "failed", reason: page.failed };
  const doc = page.doc;

  const title = cleanTitle(text(doc.querySelector("h2.title.heading")));
  if (title === "")
    return {
      kind: "failed",
      reason: "work page carried no title — deleted work, or AO3 changed its markup",
    };

  // Byline: pseud links, or the literal byline text ("Anonymous", orphaned).
  const bylineLinks = [...doc.querySelectorAll('h3.byline.heading a[rel="author"]')]
    .map((a) => text(a))
    .filter((n) => n !== "");
  const byline = text(doc.querySelector("h3.byline.heading"));
  const creators = bylineLinks.length > 0 ? bylineLinks : byline !== "" ? [byline] : [];

  const meta = doc.querySelector("dl.work.meta.group");
  const fandoms = [...(meta?.querySelectorAll("dd.fandom.tags a.tag") ?? [])]
    .map((a) => text(a))
    .filter((f) => f !== "");

  const wordsText = text(meta?.querySelector("dd.words") ?? null).replace(/[,.\s ]/g, "");
  const words = /^\d+$/.test(wordsText) ? Number(wordsText) : null;

  // "Part N of <a>Series name</a>" — absent on series-less works.
  let series: string | null = null;
  let seriesOrder: number | null = null;
  const position = meta?.querySelector("dd.series span.series .position") ?? null;
  if (position != null) {
    const name = text(position.querySelector("a"));
    const pm = /part\s+(\d+)\s+of/i.exec(text(position));
    if (name !== "") {
      series = name;
      seriesOrder = pm != null ? Math.max(1, Number(pm[1])) : null;
    }
  }

  // The WORK-level summary is the first preface's; chapter summaries sit
  // further down the document.
  const summary = text(doc.querySelector(".preface .summary blockquote.userstuff"));

  return {
    kind: "entry",
    entry: {
      title,
      description: summary === "" ? null : summary,
      creators,
      studios: [],
      type: "Fanfiction",
      genre: fandoms,
      series,
      seriesOrder,
      words,
      coverUrl: null, // fanfic has no cover art — lettermark by rule
      status: "Planned",
    },
  };
};

/** Reachability probe — one GET of the archive's front page (no cheaper
 * stable endpoint exists on a site with no API; on-demand only). */
const probe = async (): Promise<{ ok: boolean; detail: string }> => {
  try {
    const res = await importFetch(`${HOST}/`);
    const html = await res.text();
    return html.includes("Archive of Our Own")
      ? { ok: true, detail: "AO3 reachable" }
      : { ok: false, detail: "AO3 responded but the page was unexpected" };
  } catch (e) {
    const msg = String(e);
    return {
      ok: false,
      detail: /HTTP 429/.test(msg)
        ? "AO3 is rate-limiting this address — wait a while before importing"
        : `AO3 unreachable — ${msg}`,
    };
  }
};

const notice = async (): Promise<string | null> =>
  "AO3 search runs on Enter or the Search button — the archive rate-limits rapid requests.";

export const ao3Source: ImporterSource = {
  key: "ao3",
  areaLabel: "Fanfiction",
  sourceName: "AO3",
  habitKey: "reading",
  // Paste is PRIMARY here (user-ruled 2026-08-01) — the URL you already have
  // beats a rate-limited scrape; search stays the secondary door.
  defaultTab: "paste",
  searchPlaceholder: "Search AO3 works — press Enter to run…",
  pasteHelp:
    "One archiveofourown.org/works/<id> URL or numeric work id per line. Restricted (login-only) works cannot be imported.",
  searchMode: "submit",
  search,
  classifyLine,
  fetchItem,
  probe,
  notice,
};
