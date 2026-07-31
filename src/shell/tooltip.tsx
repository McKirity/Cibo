/**
 * kit-tooltip — the app's hover whisper, mounted ONCE by the shell.
 * Two blessed faces (Overlays & dialogs sheet, movement 05):
 *   - the DATA CHIP  — `data-tip="..."`      (size-small, nowrap);
 *   - the LONG FORM  — `data-tip-long="..."` (size-caption, wraps, max 340px).
 * Declarative: any element carries the attribute; this layer listens at
 * document level (the frozen mockups' machinery, ported). Content renders as
 * TEXT, never HTML — tips carry user data (entry titles).
 * Hover-only, never persistent; pointer-events: none by rule. First app
 * tenant: the Map's door rows.
 */
import { useEffect, useRef } from "react";

export function TooltipLayer() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tip = ref.current;
    if (!tip) return;

    const show = (text: string, long: boolean, target: Element) => {
      tip.textContent = text;
      tip.classList.toggle("long", long);
      tip.classList.add("show");
      const r = (target as HTMLElement).getBoundingClientRect();
      // measure after content lands, centre above the target, clamp to window
      const tr = tip.getBoundingClientRect();
      let left = r.left + r.width / 2 - tr.width / 2;
      left = Math.max(6, Math.min(left, window.innerWidth - tr.width - 6));
      let top = r.top - tr.height - 10;
      if (top < 6) top = r.bottom + 10; // no room above → flip below
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    };
    const hide = () => tip.classList.remove("show");

    const onOver = (e: MouseEvent) => {
      const t = (e.target as Element | null)?.closest?.("[data-tip], [data-tip-long]");
      if (!t) return;
      const long = t.getAttribute("data-tip-long");
      const chip = t.getAttribute("data-tip");
      const text = long ?? chip;
      if (text == null || text === "") {
        hide();
        return;
      }
      show(text, long != null, t);
    };
    const onOut = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.("[data-tip], [data-tip-long]")) hide();
    };

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
    };
  }, []);

  return <div className="tooltip" ref={ref} />;
}
