/**
 * SCROLL-REVEAL — the JS half of the 2026-07-18 scrollbar ruling (built
 * 2026-08-01 with the four scrollbar dials). The ruling's fork was taken
 * deliberately: hover-reveal alone is pure CSS, but the WHILE-SCROLLING
 * reveal plus an idle fade-out is what makes the behaviour read as macOS
 * rather than hidden-until-hunted, and it costs a few lines here.
 *
 * Mechanism: a `.scrolling` class on whatever element is scrolling, removed
 * after IDLE_MS of quiet. kit.css § Scrollbars paints the thumb for
 * `:hover` OR `.scrolling`; everything else about the bar is dials.
 *
 * A PAGE-LIFETIME SINGLETON (the close-intercept doctrine): a per-mount
 * listener would stack under HMR. `scroll` does not bubble, so the listener
 * is capture-phase on the document — one listener for every scroll port in
 * the app, including ones that do not exist yet.
 *
 * The class is cosmetic and self-healing: if React re-renders a container
 * and drops it, the next scroll frame puts it back, and a stale one expires
 * on its own timer.
 */

/** Quiet time before the thumb fades back out. */
const IDLE_MS = 900;
const CLASS = "scrolling";

let started = false;

export function initScrollReveal(): void {
  if (started) return;
  started = true;

  const timers = new WeakMap<Element, number>();

  document.addEventListener(
    "scroll",
    (e) => {
      // Document-targeted scrolls belong to the root element (that is where a
      // class can be hung and where the pseudo-elements resolve).
      const el = e.target instanceof Element ? e.target : document.documentElement;
      el.classList.add(CLASS);
      const prev = timers.get(el);
      if (prev !== undefined) window.clearTimeout(prev);
      timers.set(
        el,
        window.setTimeout(() => {
          el.classList.remove(CLASS);
          timers.delete(el);
        }, IDLE_MS),
      );
    },
    { capture: true, passive: true },
  );
}
