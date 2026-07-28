/**
 * `kit-tile-keepsake`'s HOST — the shell the app owns and a snippet never draws.
 *
 * The snippet is injected into a SHADOW ROOT. That is load-bearing rather than
 * a nicety: it seals each snippet's own `<style>` from the app while CSS custom
 * properties still inherit through the boundary, which is the only reason theme
 * dials keep resolving inside a sealed fragment.
 *
 * FAILURE IS SILENT AND PERMANENT-LOOKING. No snippet, an unparseable one, or
 * one sanitized down to nothing all resolve to the lettermark fallback — "a
 * finalized day never shouts about a broken tile", and a habit without art is
 * always safe. The talkative half of that ruling lives in the paste slot
 * (step 10), not here.
 */
import { useEffect, useMemo, useRef } from "react";
import { renderSnippet, type KeepsakeValues } from "./keepsake";

export function KeepsakeTile({
  snippet,
  values,
  colourSlot,
}: {
  snippet: string | null;
  values: KeepsakeValues;
  colourSlot: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);
  // The values object is rebuilt on every render of the wall; re-injecting the
  // fragment each time would throw away the shadow tree for nothing. A cheap
  // signature makes the effect fire only when a drawn value actually moved.
  const signature = useMemo(() => JSON.stringify(values), [values]);

  useEffect(() => {
    const host = hostRef.current;
    if (host == null) return;
    if (shadowRef.current == null) {
      // `attachShadow` throws if called twice on one element, and React can
      // re-run this effect against the same node.
      shadowRef.current = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    }
    const shadow = shadowRef.current;
    shadow.replaceChildren();
    const rendered = renderSnippet(snippet, values, document);
    if (rendered != null) shadow.appendChild(rendered.node);
    // The fallback is rendered by React below; the host only carries the class
    // that reveals it, so there is one source of truth for "did the art draw".
    host.classList.toggle("blank", rendered == null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snippet, signature]);

  return (
    <>
      <div className="ksh" ref={hostRef} />
      {/* Always present, revealed by `.ksh.blank` — the lettermark tile, which
          is the FINAL's own `.keep-square` anatomy with the habit's initial
          where Walking's done-mark sits. */}
      <div className="ksfall" style={{ ["--slot" as string]: `var(--${colourSlot})` }}>
        <span className="lm">{values.habitName.slice(0, 1).toUpperCase()}</span>
        <span className="lbl">{values.habitName}</span>
        <span className="sub">{values.value === "0" ? "logged" : `${values.value} ${values.unit}`}</span>
      </div>
    </>
  );
}
