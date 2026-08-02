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
 */
import { useEffect, useRef, useState } from "react";
import { currentTheme } from "./loader";
import { scanAmbience, type AmbienceAssets, type PatchLoop, type SurfaceAssets } from "./ambienceAssets";

const reduceOn = (): boolean => document.documentElement.classList.contains("reduce-effects");

/** Watch the root's reduce-effects class (the corpus-wide mechanism). */
function useReduceEffects(): boolean {
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

function Scene({ assets, anchor }: { assets: SurfaceAssets; anchor: "right" | "center" }) {
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
    <div className="ambdrop" aria-hidden ref={boxRef}>
      {scene}
    </div>
  );
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

  // Timers: the timer surface replaces the backdrop; absent → falls back to
  // the backdrop (which keeps its own anchor — the fallback is the surface
  // as-is, not a re-anchored copy).
  const useTimer = timers && assets.timer != null;
  const surface = useTimer ? assets.timer : assets.backdrop;
  if (!surface) return null; // silence — the flat --window-background ground
  return <Scene key={useTimer ? "timer" : "main"} assets={surface} anchor={useTimer ? "center" : "right"} />;
}
