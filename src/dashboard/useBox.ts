import { useLayoutEffect, useRef, useState } from "react";

/**
 * Measure an element's pixel box (client width/height) synchronously before
 * paint and keep it in sync via a ResizeObserver + window resize. Used by the
 * box-sized-viewBox charts (kit's TrendChart, CreationTrend) so the SVG's
 * viewBox equals its real pixel box (the ruled 1:1 technique — no stretch).
 * `clientWidth` in the layout effect forces a synchronous measure so the chart
 * draws on the first frame.
 */
export function useBox<T extends Element>(): { ref: React.MutableRefObject<T | null>; w: number; h: number } {
  const ref = useRef<T | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return { ref, ...box };
}
