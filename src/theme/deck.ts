/**
 * THE SLIDESHOW DECK — the pure core of the ambience slideshow (ruled
 * 2026-08-20; owning record [[Ambience Slideshow]]).
 *
 * "Shuffles through the images on a timer" (user's words) means a SHUFFLED
 * DECK, not a loop: the set is shuffled once, played through in that order,
 * and reshuffled when spent — with ONE rule, that the first card of the new
 * deck is never the card just shown. Every picture is seen evenly, nothing
 * repeats back-to-back, and no two launches open on the same picture.
 *
 * Pure by construction (the project's tested-core pattern): the RNG is a
 * parameter, so the test drives it deterministically and the app passes
 * Math.random. Nothing here knows about files, timers or the DOM. The caller
 * computes `advance` ONCE per swap (at preload time) and keeps the result —
 * there is deliberately no `peek`, because a peek that consumes the rng would
 * not agree with the advance that follows it.
 */

export interface Deck {
  /** Member indices in play order. */
  order: number[];
  /** Position of the SHOWING member within `order`. */
  pos: number;
}

/** Fisher–Yates over 0..n-1 with a caller-supplied `rng` in [0, 1). */
export function shuffle(n: number, rng: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A fresh deck over `n` members. `n` ≤ 0 yields an empty deck (nothing to show). */
export function newDeck(n: number, rng: () => number): Deck {
  return { order: n > 0 ? shuffle(n, rng) : [], pos: 0 };
}

/** The member index the deck is showing, or null for an empty deck. */
export const showing = (d: Deck): number | null => (d.order.length ? d.order[d.pos] : null);

/**
 * The deck after one advance. Inside the deck it is a step; at the end it is
 * a reshuffle whose first card is never the one just shown (so a 2-member set
 * strictly alternates and a 1-member set never "changes" — the caller decides
 * whether a same-member advance is worth a fade; it isn't).
 */
export function advance(d: Deck, rng: () => number): Deck {
  const n = d.order.length;
  if (n === 0) return d;
  if (d.pos + 1 < n) return { order: d.order, pos: d.pos + 1 };
  const last = d.order[d.pos];
  if (n === 1) return { order: d.order, pos: 0 };
  const next = shuffle(n, rng);
  if (next[0] === last) {
    // Swap the repeat away rather than re-rolling: bounded work, still uniform
    // over the decks that satisfy the rule, and never loops on a bad rng.
    const k = 1 + Math.floor(rng() * (n - 1));
    [next[0], next[k]] = [next[k], next[0]];
  }
  return { order: next, pos: 0 };
}
