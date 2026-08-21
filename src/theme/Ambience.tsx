/**
 * THE AMBIENCE LAYER — Build step 6a. One whole-window layer, the lowest in
 * .app-frame (titlebar · rail · content sit on top; an opaque rail covers its
 * column — that IS the rail's lever). On the Timers screen the timer surface
 * REPLACES the backdrop; absent → falls back to it.
 *
 * SCALING LAW (re-ruled 2026-07-31, superseding per-theme focal anchors):
 *   main  — "anchor the right top and bottom corners of the image to the app
 *           screen and shrink/grow from there" (user's words). Implementation:
 *           height-fit with the right edge pinned; a window wider than the
 *           art's aspect overscales just enough to cover, right edge still
 *           pinned, vertical crop centered — never a gap, never a stretch.
 *   timer — "dead center to dead center": plain centered cover-scale.
 * The computation is JS — never CSS percentage positioning (the standing
 * implementation constraint survives the re-rule). Patch loops render INSIDE
 * the scaled scene at master-coordinate fractions, so they ride its transform.
 *
 * Motion: pauses when the window is hidden/minimized (visibilitychange) and
 * sheds whole under reduce-effects (CSS hides it; JS also stops advancing/
 * playing). A broken video falls back to the still — silence is a valid look.
 *
 * THE SLIDESHOW (ruled 2026-08-20 — owning record [[Ambience Slideshow]]).
 * A surface in the SET form (`backdrops/` · `timers/`, ambienceAssets) plays
 * as a SHUFFLED DECK (theme/deck.ts, the tested core) on a per-device
 * interval, with a crossfade whose length is a per-device setting published
 * as `--amb-fade` on the root (settings/local.ts — ONE owner; the Settings
 * preview reads the same property). Mechanics, each a ruling's consequence:
 *   · Only the SHOWING picture and the PRELOADED next one are ever loaded —
 *     memory is two pictures regardless of set size. The next member is read
 *     and decoded PRELOAD_LEAD_MS before the swap so the fade's first frame
 *     is free; the outgoing picture is released after the fade.
 *   · The clock counts only while the window is visible and reduce-effects is
 *     off: hidden = PAUSED, NOT RESET (the patch-loop rule); reduce-effects =
 *     FROZEN on the current picture (the ambience kill-switch semantics).
 *   · Interval Off = the set's FIRST picture by filename, never swaps.
 *   · Each surface keeps its deck ACROSS screen switches (Daily ⇄ Timers), so
 *     a visit to the board never reshuffles the backdrop; only the ACTIVE
 *     surface holds a loaded picture. A theme apply resets both decks.
 *   · Timer source "shared" (user-ruled: "no timer surface at all — just
 *     continue with the backdrop") = Timers never swaps surfaces; the
 *     backdrop layer continues, same picture, same countdown, same crop.
 *   · The crossfade is two stacked `.ambdrop`s, the incoming one animating
 *     opacity 0→1 (`.ambfade`, shell.css). The BASE slot keeps one element
 *     identity across the commit, so the committed picture paints in the same
 *     frame the incoming layer leaves — no flash of the flat ground between.
 * MEASURED 2026-08-20 on the PC (16 logical cores · Monument Valley dev drop-in · a
 * five-still set including a 3840×2160 member · the whole cibo.exe + WebView2
 * process tree sampled per tick, no input during sampling):
 *   idle, 10 min interval (60 ticks, no swap)  CPU avg 0.01 % · max 0.29 % · GPU 0 %
 *                                              · working set 712–721 MB, flat
 *   30 s interval across ~5 swaps (70 ticks)   CPU avg 0.10 % · max 2.54 % (ONE tick —
 *                                              the read+decode+fade) · GPU max 1.1 %
 *                                              · working set 700–753 MB, oscillating
 *                                              by ~two decoded pictures and RETURNING
 *                                              to baseline (no growth across swaps)
 * Budget (owning note § The honest cost): idle indistinguishable from the static
 * backdrop · a fade ≤ a few % GPU under two seconds · peak memory ≤ two decoded
 * pictures — all three met. Re-measure if a fade ever gains a blur or a repaint.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { currentTheme } from "./loader";
import {
  loadStill,
  scanAmbience,
  type AmbienceAssets,
  type LoadedStill,
  type PatchLoop,
  type SetFile,
  type SurfaceAssets,
} from "./ambienceAssets";
import { advance, newDeck, showing, type Deck } from "./deck";
import {
  AMBIENCE_SETTINGS_EVENT,
  getAmbienceFade,
  getAmbienceInterval,
  getTimerAmbience,
  type TimerAmbience,
} from "../settings/local";

const reduceOn = (): boolean => document.documentElement.classList.contains("reduce-effects");

/** Watch the root's reduce-effects class (the corpus-wide mechanism). */
export function useReduceEffects(): boolean {
  const [on, setOn] = useState(reduceOn);
  useEffect(() => {
    const mo = new MutationObserver(() => setOn(reduceOn()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return on;
}

function Patch({ p, iw, ih }: { p: PatchLoop; iw: number; ih: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden || reduceOn()) return; // paused, not reset
      setI((v) => (v + 1) % p.frames.length);
    }, 1000 / p.fps);
    return () => clearInterval(id);
  }, [p]);
  const pct = (n: number) => `${n * 100}%`;
  return (
    <img
      className="ambpatch amb-motion"
      alt=""
      src={p.frames[i]}
      style={{ left: pct(p.x / iw), top: pct(p.y / ih), width: pct(p.w / iw), height: pct(p.h / ih) }}
    />
  );
}

function Scene({
  assets,
  anchor,
  className,
}: {
  assets: SurfaceAssets;
  anchor: "right" | "center";
  /** `ambfade` on the slideshow's incoming layer — the crossfade's animation hook. */
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [videoDead, setVideoDead] = useState(false);
  const reduced = useReduceEffects();

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Video lifecycle: pause when hidden or under reduce-effects, resume otherwise.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sync = () => {
      if (document.hidden || reduced) v.pause();
      else void v.play().catch(() => setVideoDead(true));
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [reduced, videoDead]);

  const { still } = assets;
  let scene = null;
  if (box && box.w > 0 && box.h > 0) {
    // Cover-scale (never stretch, never letterbox), then place per the ruling:
    // right-pinned (main) or dead-center (timer). Height-fit in right mode
    // lands top=0/bottom=box.h — the pinned corners, exactly.
    const scale = Math.max(box.w / still.w, box.h / still.h);
    const w = still.w * scale;
    const h = still.h * scale;
    const left = anchor === "right" ? box.w - w : (box.w - w) / 2;
    const top = (box.h - h) / 2;
    scene = (
      <div className="ambscene" style={{ width: w, height: h, left, top }}>
        <img className="ambstill" src={still.url} alt="" />
        {assets.video && !videoDead && (
          <video
            ref={videoRef}
            className="amb-motion"
            src={assets.video}
            muted
            loop
            autoPlay
            playsInline
            onError={() => setVideoDead(true)} // soft-fail: the still stands
          />
        )}
        {!assets.video &&
          assets.patches.map((p, i) => <Patch key={i} p={p} iw={still.w} ih={still.h} />)}
      </div>
    );
  }
  return (
    <div className={`ambdrop${className ? ` ${className}` : ""}`} aria-hidden ref={boxRef}>
      {scene}
    </div>
  );
}

// ── the slideshow ────────────────────────────────────────────────────────────

/** Lead time for the preload: the next picture is read + decoded this long before the swap. */
const PRELOAD_LEAD_MS = 3000;
const TICK_MS = 1000;
/** Slack past the CSS animation before the commit — the animation must be over before the layers swap. */
const COMMIT_SLACK_MS = 60;

interface AmbienceSettings {
  interval: number; // seconds; 0 = Off
  timer: TimerAmbience;
}
const readSettings = (): AmbienceSettings => ({ interval: getAmbienceInterval(), timer: getTimerAmbience() });

function useAmbienceSettings(): AmbienceSettings {
  const [s, setS] = useState(readSettings);
  useEffect(() => {
    const on = () => setS(readSettings());
    window.addEventListener(AMBIENCE_SETTINGS_EVENT, on);
    return () => window.removeEventListener(AMBIENCE_SETTINGS_EVENT, on);
  }, []);
  return s;
}

/** Rotate a deck so it opens on `member` (the picture already showing) — an Off⇄On flip never cuts. */
function openingOn(d: Deck, member: number | null): Deck {
  if (member == null) return d;
  const i = d.order.indexOf(member);
  if (i <= 0) return d;
  return { order: [...d.order.slice(i), ...d.order.slice(0, i)], pos: 0 };
}

const stillAssets = (s: LoadedStill): SurfaceAssets => ({ still: { url: s.url, w: s.w, h: s.h }, video: null, patches: [] });

/**
 * One surface's slideshow. The deck and elapsed time live in refs so they
 * SURVIVE `active` flipping off and on (the Daily ⇄ Timers switch); a loaded
 * picture is held only while active.
 */
function useSlideshow(
  files: SetFile[] | null,
  active: boolean,
  intervalS: number,
): { base: LoadedStill | null; incoming: LoadedStill | null } {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const deckRef = useRef<Deck>({ order: [], pos: 0 });
  const elapsedRef = useRef(0);
  const baseRef = useRef<LoadedStill | null>(null);
  const incomingRef = useRef<LoadedStill | null>(null);
  const nextRef = useRef<{ deck: Deck; still: LoadedStill } | null>(null);
  const loadingRef = useRef<Promise<void> | null>(null);
  const commitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filesKey = files ? files.map((f) => f.path).join("\n") : "";
  const off = intervalS === 0;

  const dropPictures = () => {
    if (commitRef.current) {
      clearTimeout(commitRef.current);
      commitRef.current = null;
    }
    baseRef.current?.release();
    incomingRef.current?.release();
    nextRef.current?.still.release();
    baseRef.current = incomingRef.current = null;
    nextRef.current = null;
  };

  // (1) The deck. A new set (theme apply) = a fresh shuffle, elapsed reset.
  //     An Off⇄On flip re-cuts the deck but OPENS ON THE PICTURE SHOWING.
  const prevKey = useRef<string | null>(null);
  useEffect(() => {
    const n = files?.length ?? 0;
    const fresh = prevKey.current !== filesKey;
    const was = fresh ? null : showing(deckRef.current);
    prevKey.current = filesKey;
    const d = off ? { order: n ? [0] : [], pos: 0 } : newDeck(n, Math.random);
    deckRef.current = off ? d : openingOn(d, was);
    if (fresh) elapsedRef.current = 0;
    // A new set, or an Off flip away from the first picture: whatever is held
    // is the wrong picture now — drop it so (2) loads the right one. (A fresh
    // set's old URLs are already revoked by the rescan; release is idempotent.)
    if (fresh || (off && was != null && was !== 0)) dropPictures();
    else {
      // A pending preload belongs to the old deck.
      nextRef.current?.still.release();
      nextRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey, off, files]);

  // (2) Hold a picture only while active; keep the deck when not.
  useEffect(() => {
    if (!active || !files?.length) {
      dropPictures();
      rerender();
      return;
    }
    const idx = showing(deckRef.current);
    if (idx == null) return;
    if (baseRef.current) return; // already holding the right picture
    let alive = true;
    loadStill(files[idx]).then(
      (s) => {
        if (!alive) {
          s.release();
          return;
        }
        baseRef.current = s;
        rerender();
      },
      (e) => console.warn(`Ambience: set member "${files[idx].name}" unreadable — skipped:`, e),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, filesKey, off]);

  // (3) The clock — counts only while visible and not under reduce-effects.
  useEffect(() => {
    if (!active || off || !files || files.length < 2) return;
    const intervalMs = intervalS * 1000;
    const id = setInterval(() => {
      if (document.hidden || reduceOn() || incomingRef.current) return; // paused, not reset
      elapsedRef.current += TICK_MS;
      // Preload the next member PRELOAD_LEAD_MS ahead.
      if (elapsedRef.current >= intervalMs - PRELOAD_LEAD_MS && !nextRef.current && !loadingRef.current) {
        const d = advance(deckRef.current, Math.random);
        const idx = showing(d);
        if (idx == null || idx === showing(deckRef.current)) return;
        loadingRef.current = loadStill(files[idx])
          .then(
            (s) => {
              nextRef.current = { deck: d, still: s };
            },
            (e) => {
              // Skip the unreadable member: the deck moves past it, the next tick tries the one after.
              console.warn(`Ambience: set member "${files[idx].name}" unreadable — skipped:`, e);
              deckRef.current = d;
            },
          )
          .finally(() => {
            loadingRef.current = null;
          });
      }
      // The swap — waits for the preload if a slow read is still in flight.
      if (elapsedRef.current >= intervalMs && nextRef.current) {
        const n = nextRef.current;
        nextRef.current = null;
        deckRef.current = n.deck;
        incomingRef.current = n.still;
        rerender();
        const fade = getAmbienceFade();
        commitRef.current = setTimeout(() => {
          commitRef.current = null;
          baseRef.current?.release();
          baseRef.current = incomingRef.current;
          incomingRef.current = null;
          elapsedRef.current = 0;
          rerender();
        }, fade + COMMIT_SLACK_MS);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [active, off, intervalS, filesKey, files]);

  // (4) Unmount: nothing stays loaded.
  useEffect(() => () => dropPictures(), []);

  return { base: baseRef.current, incoming: incomingRef.current };
}

/** Mounted once in Shell, first child of .app-frame. */
export function Ambience({ timers }: { timers: boolean }) {
  const [assets, setAssets] = useState<AmbienceAssets>({ backdrop: null, timer: null });
  useEffect(() => {
    let alive = true;
    const rescan = () => {
      void scanAmbience(currentTheme()?.dir ?? null).then((a) => {
        if (alive) setAssets(a);
      });
    };
    rescan();
    window.addEventListener("cibo:theme-applied", rescan);
    return () => {
      alive = false;
      window.removeEventListener("cibo:theme-applied", rescan);
    };
  }, []);
  const settings = useAmbienceSettings();

  // Timers: the timer surface replaces the backdrop; absent → falls back to
  // the backdrop (which keeps its own anchor — the fallback is the surface
  // as-is, not a re-anchored copy). Timer source "shared" = no timer surface
  // at all, by ruling: the backdrop continues untouched.
  const { backdrop, timer } = assets;
  const useTimer = timers && settings.timer === "own" && timer != null;

  // Both decks live here so a screen switch never reshuffles the other surface.
  // The timer deck is asked first: the backdrop stays ACTIVE until the timer's
  // first member is actually loaded, so entering the board never shows the
  // flat ground for the frames a set member takes to read and decode.
  const tm = useSlideshow(timer?.kind === "set" ? timer.files : null, useTimer && timer?.kind === "set", settings.interval);
  const timerReady = useTimer && (timer.kind === "single" || tm.base != null);
  const bd = useSlideshow(backdrop?.kind === "set" ? backdrop.files : null, !timerReady && backdrop?.kind === "set", settings.interval);

  const surface = timerReady ? timer : backdrop;
  const anchor = timerReady ? "center" : "right";
  const slot = timerReady ? "timer" : "main";
  if (!surface) return null; // silence — the flat --window-background ground
  if (surface.kind === "single") return <Scene key={slot} assets={surface.assets} anchor={anchor} />;

  const show = timerReady ? tm : bd;
  if (!show.base) return null; // the very first member is still loading — the flat ground, briefly
  return (
    <>
      {/* The BASE slot keeps its element across the commit (key = the slot, not
          the picture) — see the header: no flash between layers. */}
      <Scene key={`${slot}-base`} assets={stillAssets(show.base)} anchor={anchor} />
      {show.incoming && (
        <Scene key={`${slot}-in-${show.incoming.url}`} assets={stillAssets(show.incoming)} anchor={anchor} className="ambfade" />
      )}
    </>
  );
}
