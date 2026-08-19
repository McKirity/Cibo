/**
 * FIT-TO-WIDTH — shrink a label just enough that it fits its slot.
 *
 * USER-RULED 2026-08-18: *"if the name was too big for the card, then the font
 * simply shrank until it fit."* Born for the rail's habit cards, where
 * `EMBROIDERY` renders ~6% wider on macOS than on Windows, overflows its slot by
 * ~10px and spends the card's padding — which is not spare space but
 * `--frame-clear-hcard`, the room a theme's decoration frame paints in.
 *
 * ⚠ WHY THIS IS NOT CSS. `clamp()` with container units scales a label against
 * its CONTAINER, so every habit would shrink because one of them is long. The
 * question here is per-label — how wide is THIS string in THIS font — and CSS
 * cannot measure text. Nothing short of measurement answers it, which is why the
 * user's own attempt came out "only a partial fix".
 *
 * ⚠ IT IS A NO-OP WHERE THE TEXT ALREADY FITS, and that is what makes it safe to
 * put in shared code under the standing don't-touch-the-PC ruling: on Windows
 * `EMBROIDERY` fits its slot with the full 16px gutter intact, the scale
 * resolves to 1, and the rendering is byte-identical. It only ever acts where
 * something would otherwise overflow.
 *
 * The label publishes `--fit` and the stylesheet multiplies its own size by it,
 * so the type ramp stays the dial's — this never writes a px value.
 */
import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * The floor. Below this a label is no longer reading as the same UI, and the
 * honest answer becomes a shorter name rather than smaller type — so it stops
 * here and lets the last sliver overflow rather than shrinking into illegibility.
 */
const MIN_SCALE = 0.78;

export function useFitText<T extends HTMLElement>(dep: string): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el == null) return;

    const fit = (): void => {
      const parent = el.parentElement;
      if (parent == null) return;
      // Measure at full size — a stale scale would compound on every pass.
      el.style.setProperty("--fit", "1");
      const pcs = getComputedStyle(parent);
      let avail =
        parent.clientWidth - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight);
      // everything else on the line takes its share first (the swatch, and the
      // gaps between all of them)
      for (const sib of Array.from(parent.children)) {
        if (sib !== el) avail -= (sib as HTMLElement).offsetWidth;
      }
      const gap = parseFloat(pcs.columnGap === "normal" ? "0" : pcs.columnGap);
      if (Number.isFinite(gap)) avail -= gap * Math.max(0, parent.children.length - 1);

      const natural = el.scrollWidth;
      if (natural <= 0 || avail <= 0) return;
      const scale = Math.max(MIN_SCALE, Math.min(1, avail / natural));
      // 0.995 rather than 1: sub-pixel noise should not write a scale nobody
      // can see, and writing one on every pass would thrash the style attribute.
      el.style.setProperty("--fit", scale > 0.995 ? "1" : scale.toFixed(3));
    };

    fit();

    // ⚠ THE RE-RUNS ARE THE LOAD-BEARING PART — a one-shot measurement is right
    // exactly once and wrong after anything that moves type or geometry:
    //   · the box resizing (rail width, UI-scale zoom, compact crossing)
    //   · a THEME applying, which can swap the font family entirely (6b's fonts
    //     channel registers faces at apply time, so widths change under us)
    //   · webfonts arriving after first paint, when the first measure was taken
    //     against a fallback face
    const ro = new ResizeObserver(fit);
    ro.observe(el.parentElement ?? el);
    window.addEventListener("cibo:theme-applied", fit);
    void document.fonts?.ready.then(fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("cibo:theme-applied", fit);
    };
  }, [dep]);

  return ref;
}
