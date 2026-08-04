/**
 * SETTINGS → HELP (Build step 10, slice 6) — Manual · Hotkeys · About.
 *
 * SPLIT AT THE USER'S CALL, 2026-08-03: Hotkeys and About build now; **the
 * MANUAL waits for the author's own pass over its content**. That is the right
 * order — the 22 articles are prose in the author's voice ([[User Manual
 * Content]], including "Why I made it", explicitly "not Claude's to invent"),
 * and the reader is a day's wiring once the words are settled. The tab renders
 * its door and says so rather than pretending to be empty.
 *
 * HELP IS THE ONE SURFACE WHERE EXPLANATORY PROSE IS LEGITIMATE (the frozen
 * Settings note's own words), which is why these two tabs read differently
 * from every other pane in this screen.
 */
import { useState } from "react";
import { Ico } from "../shell/icons";

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
  const [tab, setTab] = useState<Tab>("hotkeys");
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
        {tab === "manual" ? <ManualTab /> : tab === "hotkeys" ? <HotkeysTab /> : <AboutTab />}
      </div>
    </>
  );
}

function ManualTab() {
  return (
    <div className="hscroll">
      <p className="pending">
        Not built yet — the manual's 22 articles are written but want a read-through before they
        go in. The reader itself is the roster-and-page layout the Vocabulary tab already uses.
      </p>
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
