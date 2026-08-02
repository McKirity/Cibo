/**
 * kit — THE COVER FACE. One place that turns a stored `cover` REFERENCE into
 * displayable art, for every surface that draws entry covers.
 *
 * Born 2026-07-31 at step 8's first GUI pass, resolving the watch item recorded
 * hours earlier the same day: `importers/covers.ts` owns the images-root
 * convention because the importer created it, but the readers are everywhere —
 * the library grid, the entry rail + series strip, the 5★ hall, the creation
 * hero cards, the bulk-edit picker. The second reader landed immediately, so
 * the READ half hoists here and `covers.ts` keeps the storage half.
 *
 * WHY THIS EXISTS AT ALL: until this step nothing ever WROTE a cover ref, so
 * every one of those surfaces drew its lettermark placeholder unconditionally
 * and no one noticed the display half was missing. Backfilling real covers
 * exposed all of them at once.
 *
 * Two faces, because the tenants differ:
 *  · `useCoverUrl(ref)` — the hook, for surfaces that already own their cover
 *    BOX and its placeholder (the entry rail's `.cover`/`.cinit`, the hall).
 *    They keep their own anatomy and just paint art into it.
 *  · `<CoverArt>` — the capsule-shaped component, for surfaces built on the
 *    library's cover-card vocabulary.
 *
 * A ref that fails to resolve falls back to the placeholder SILENTLY — the
 * lettermark is a legitimate permanent look, never an error state
 * ([[Habit Artwork & Assets]]).
 */
import { useEffect, useState } from "react";
import { coverBlob } from "../importers/covers";
import { coverAbbr } from "../library/librarySpec";

/**
 * A stored cover ref → a displayable blob URL, or null while loading / if the
 * file is gone. Null is the caller's cue to draw its own placeholder.
 */
export function useCoverUrl(cover: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSrc(null);
    if (cover != null && cover !== "") void coverBlob(cover).then((b) => live && setSrc(b));
    return () => {
      live = false;
    };
  }, [cover]);
  return src;
}

/**
 * The INSIDE of a cover box the caller owns and positions (the entry rail's
 * `.cover`, the 5★ hall's `.cover` — both already `position:relative` +
 * `overflow:hidden`, both already draw a `.cinit` lettermark).
 *
 * Art REPLACES the lettermark rather than covering it: `.cinit` is a scrim'd
 * caption, so leaving it under real art would double the title that the art
 * already carries.
 */
export function CoverInner({
  cover,
  label,
}: {
  cover: string | null | undefined;
  label: string;
}) {
  const src = useCoverUrl(cover);
  if (src == null) return <span className="cinit">{label}</span>;
  return <img className="cimg" src={src} alt="" draggable={false} />;
}

/** The capsule-shaped face: art when present, the hatch + lettermark otherwise. */
export function CoverArt({
  title,
  cover,
  className,
}: {
  title: string;
  cover: string | null | undefined;
  className?: string;
}) {
  const src = useCoverUrl(cover);
  return (
    <div className={`capsule${src != null ? " coverart" : ""}${className != null ? ` ${className}` : ""}`}>
      {src != null ? (
        <img className="cimg" src={src} alt="" draggable={false} />
      ) : (
        <span className="cwm">{coverAbbr(title)}</span>
      )}
    </div>
  );
}
