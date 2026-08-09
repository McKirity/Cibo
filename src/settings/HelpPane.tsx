/**
 * SETTINGS → HELP (Build step 10, slice 6) — Manual · Hotkeys · About.
 *
 * THE MANUAL READER LANDED 2026-08-03 (user-ruled the same day — the accuracy
 * pass over the 22 articles ran first, and "just code it in now" closed the
 * hold; the author's voice pass stays free: the content is `manual.md`, prose,
 * never code). The reader is `kit-viewer-manual` — the roster/detail chassis
 * the Vocabulary pane claimed early, now serving its DRAWN first tenant: a
 * grouped 22-door roster beside the reading surface on the pane's type ramp
 * (`.helpart`, the frozen specimen's own family). Door icons are transcribed
 * from the frozen FINAL's 22 rows. A palette deep-link lands with its article
 * open (the creator-pending pattern); the rest state opens the first article,
 * never a blank reader.
 *
 * HELP IS THE ONE SURFACE WHERE EXPLANATORY PROSE IS LEGITIMATE (the frozen
 * Settings note's own words), which is why these tabs read differently from
 * every other pane in this screen.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Ico, ICONS } from "../shell/icons";
import {
  ArticleBody,
  MANUAL_ARTICLE_EVENT,
  MANUAL_GROUPS,
  articleText,
  findArticle,
  peekManualArticle,
  takeManualArticle,
} from "./manualContent";

type Tab = "manual" | "hotkeys" | "about";

/**
 * The canonical FOUR ([[Shell Mechanics]] § 7 — the set is closed), read-only:
 * "every app-wide shortcut; rebinding = a future call" and an update-channel
 * style option was ruled out with it.
 *
 * Back/Forward names its three bindings rather than only the keys — the mouse
 * buttons and the titlebar arrows are the same action, and a reference that
 * listed one third of it would be the kind of half-truth this table exists to
 * prevent. Still ONE hotkey, not three.
 */
const HOTKEYS: { action: string; keys: string; note?: string }[] = [
  { action: "Command palette", keys: "Ctrl K" },
  { action: "Back / Forward", keys: "Alt ← · Alt →", note: "also the mouse side buttons, and the titlebar arrows" },
  { action: "Today's Daily", keys: "Ctrl H" },
  { action: "Close overlay", keys: "Esc", note: "the top overlay only" },
];

/**
 * EXTERNAL-LINKS TRANSPARENCY ([[Settings & Configuration]] § About). The app
 * is local-first and talks to very little; this says exactly what, and why,
 * because "trust me" is not a claim a personal app should have to make. The
 * roster is the Tauri capability allowlist — nothing can be reached that is
 * not on it, so this list is complete BY CONSTRUCTION rather than by promise.
 */
const HOSTS: { host: string; why: string }[] = [
  { host: "api.open-meteo.com", why: "the day's weather, for the sky card" },
  { host: "freehoroscopeapi.com", why: "the horoscope card" },
  { host: "store.steampowered.com", why: "Steam game details + cover art" },
  { host: "shared.cloudflare.steamstatic.com", why: "Steam cover images" },
  { host: "api.themoviedb.org", why: "film and TV details" },
  { host: "image.tmdb.org", why: "film and TV posters" },
  { host: "graphql.anilist.co", why: "anime and manga details" },
  { host: "s4.anilist.co", why: "AniList cover images" },
  { host: "www.googleapis.com", why: "YouTube channel details" },
  { host: "yt3.ggpht.com · yt3.googleusercontent.com", why: "YouTube channel avatars" },
  { host: "archiveofourown.org", why: "fanfiction details" },
  { host: "www.gstatic.com", why: "one empty request, to tell 'you are offline' from 'they are down'" },
];

export function HelpPane() {
  // A palette deep-link parks its article before navigating here; a fresh
  // mount PEEKS it (StrictMode double-runs initializers, so consuming here
  // would lose it) and clears it in the mount effect below.
  const [deepLink] = useState(() => peekManualArticle());
  const [tab, setTab] = useState<Tab>(deepLink != null ? "manual" : "hotkeys");
  const [articleId, setArticleId] = useState<string>(
    deepLink ?? MANUAL_GROUPS[0]?.articles[0]?.id ?? "",
  );
  // …and an already-mounted pane hears the event instead (same one-shot).
  useEffect(() => {
    takeManualArticle(); // consumed by this mount
    const onLink = () => {
      const id = takeManualArticle();
      if (id != null) {
        setTab("manual");
        setArticleId(id);
      }
    };
    window.addEventListener(MANUAL_ARTICLE_EVENT, onLink);
    return () => window.removeEventListener(MANUAL_ARTICLE_EVENT, onLink);
  }, []);
  return (
    <>
      <div className="ttabs">
        {(
          [
            ["manual", "Manual"],
            ["hotkeys", "Hotkeys"],
            ["about", "About"],
          ] as const
        ).map(([t, label]) => (
          <button key={t} className={`ttab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      <div className="pbody">
        {tab === "manual" ? (
          <ManualTab articleId={articleId} onOpen={setArticleId} />
        ) : tab === "hotkeys" ? (
          <HotkeysTab />
        ) : (
          <AboutTab />
        )}
      </div>
    </>
  );
}

/** The 22 door icons, transcribed from the frozen FINAL's roster rows. */
const ARTICLE_ICONS: Record<string, ReactNode> = {
  "why-i-made-it": <svg className="ico" viewBox="0 0 24 24"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg>,
  "how-it-works": <svg className="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></svg>,
  "general-app-layout": <svg className="ico" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /></svg>,
  data: <svg className="ico" viewBox="0 0 24 24"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>,
  "getting-started": <svg className="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></svg>,
  "what-are-habits": <svg className="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" x2="12.01" y1="17" y2="17" /></svg>,
  "how-to-log-your-habits": <svg className="ico" viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>,
  "visualizing-your-habits": <svg className="ico" viewBox="0 0 24 24"><line x1="6" x2="6" y1="20" y2="16" /><line x1="12" x2="12" y1="20" y2="10" /><line x1="18" x2="18" y1="20" y2="4" /></svg>,
  "archiving-your-habits": <svg className="ico" viewBox="0 0 24 24"><rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></svg>,
  "creating-new-habits": <svg className="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M8 12h8" /><path d="M12 8v8" /></svg>,
  themes: <svg className="ico" viewBox="0 0 24 24"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></svg>,
  timers: <svg className="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  importers: <svg className="ico" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>,
  backups: <svg className="ico" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></svg>,
  "data-doctor": <svg className="ico" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
  palette: <svg className="ico" viewBox="0 0 24 24"><path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" /></svg>,
  "comparing-statistics": <svg className="ico" viewBox="0 0 24 24"><path d="M3 3v18h18" /><path d="m7 14 4-4 4 4 5-5" /></svg>,
  search: <svg className="ico" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>,
  map: <svg className="ico" viewBox="0 0 24 24"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><line x1="9" x2="9" y1="3" y2="18" /><line x1="15" x2="15" y1="6" y2="21" /></svg>,
  library: <svg className="ico" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>,
  "bulk-editor": <svg className="ico" viewBox="0 0 24 24"><path d="M9 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-4" /><path d="M12 2v13" /><path d="m9 5 3-3 3 3" /></svg>,
  "whimsy-the-calendar": <svg className="ico" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>,
};

function ManualTab({ articleId, onOpen }: { articleId: string; onOpen: (id: string) => void }) {
  // The roster search (added 2026-08-09, user-asked at tour 7 station 11 —
  // an ADDITION to the drawn face). It narrows the ROSTER only: matches run
  // over titles AND body text (`articleText`), groups without matches
  // collapse, and the open article stays open even when the filter hides its
  // door — narrowing a list must never navigate. An unmatched query states
  // the miss and offers nothing, the search grammar's own rule.
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const groups =
    needle === ""
      ? MANUAL_GROUPS
      : MANUAL_GROUPS.map((g) => ({
          name: g.name,
          articles: g.articles.filter(
            (a) => a.title.toLowerCase().includes(needle) || articleText(a).includes(needle),
          ),
        })).filter((g) => g.articles.length > 0);
  const article = findArticle(articleId) ?? MANUAL_GROUPS[0]?.articles[0];
  if (article == null) return null;
  return (
    <div className="manual">
      <aside className="mroster">
        <div className="pk-search">
          <Ico d={ICONS.search} />
          <input
            value={q}
            placeholder="Search the manual…"
            spellCheck={false}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <nav className="mtoc">
          {groups.map((g) => (
            <div key={g.name}>
              <div className="mgrp">{g.name}</div>
              {g.articles.map((a) => (
                <button
                  key={a.id}
                  className={`mdoc${a.id === article.id ? " active" : ""}`}
                  onClick={() => onOpen(a.id)}
                >
                  {ARTICLE_ICONS[a.id]}
                  <span className="mt">{a.title}</span>
                </button>
              ))}
            </div>
          ))}
          {groups.length === 0 && <p className="mtoc-miss">Nothing mentions "{q.trim()}".</p>}
        </nav>
        <p className="mtoc-note">
          Every article is a place — the palette teleports straight to any of these pages
          (<strong>Ctrl K</strong> → type a title).
        </p>
      </aside>
      {/* keyed so switching articles remounts the reader at the top */}
      <article className="mread" key={article.id}>
        <div className="mread-crumb">
          User manual <b>›</b> {article.group} <b>›</b> {article.title}
        </div>
        <div className="helpart">
          <h3>{article.title}</h3>
          <ArticleBody article={article} />
        </div>
      </article>
    </div>
  );
}

function HotkeysTab() {
  return (
    <div className="hscroll">
      <div className="ctrlstack">
        {HOTKEYS.map((k) => (
          <div className="crow two" key={k.action}>
            <span className="clabel">
              {k.action}
              {k.note != null && <span className="mgtag">{k.note}</span>}
            </span>
            <span className="cright">
              <span className="field">{k.keys}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="vnote foot">
        These four are fixed. Everything else in the app is reachable from the command palette.
      </p>
    </div>
  );
}

function AboutTab() {
  return (
    <div className="hscroll">
      <div className="ctrlstack">
        <div className="crow two">
          <span className="clabel">Version</span>
          <span className="cright">
            <span className="field">
              Cibo {__APP_VERSION__} · build {__BUILD_DATE__}
            </span>
          </span>
        </div>
        <div className="crow two">
          <span className="clabel">
            Updates
            <span className="mgtag">not wired up yet</span>
          </span>
          <span className="cright">
            <button className="btn-plain" aria-disabled="true">
              <Ico d={["M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", "M8 16H3v5"]} />
              Check for updates
            </button>
          </span>
        </div>
      </div>
      <p className="vnote">
        Updates install themselves when you quit, once that is switched on before release. This
        button is the manual path for when you don't want to wait.
      </p>

      <div className="hgroup">
        <p className="hglbl">
          What this app talks to
          <span className="runline">{HOSTS.length} addresses</span>
        </p>
        <div className="vlist">
          {HOSTS.map((h) => (
            <span className="vrow wide" key={h.host}>
              <span className="vval mono">{h.host}</span>
              <span className="vwhy">{h.why}</span>
            </span>
          ))}
        </div>
        <p className="vnote foot">
          Nothing else can be reached — the list is enforced by the app itself, not just
          intended. Your habits, entries and sessions are never sent anywhere: everything above
          is fetching public details about a game, a book, a film, or the weather.
        </p>
      </div>
    </div>
  );
}
