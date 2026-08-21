import { describe, expect, it } from "vitest";
import { advance, newDeck, showing, shuffle } from "./deck";

/** A tiny deterministic LCG so runs are reproducible. */
const lcg = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

describe("the slideshow deck", () => {
  it("shuffle is a permutation", () => {
    const rng = lcg(7);
    for (const n of [1, 2, 5, 12]) {
      const s = shuffle(n, rng);
      expect([...s].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });

  it("an empty set shows nothing and never advances into anything", () => {
    const d = newDeck(0, lcg(1));
    expect(showing(d)).toBeNull();
    expect(showing(advance(d, lcg(1)))).toBeNull();
  });

  it("a one-member set always shows member 0", () => {
    let d = newDeck(1, lcg(3));
    for (let i = 0; i < 5; i++) {
      expect(showing(d)).toBe(0);
      d = advance(d, lcg(3));
    }
  });

  it("plays every member once per deck, then reshuffles", () => {
    const rng = lcg(11);
    const n = 6;
    let d = newDeck(n, rng);
    const firstDeck: number[] = [];
    for (let i = 0; i < n; i++) {
      firstDeck.push(showing(d)!);
      d = advance(d, rng);
    }
    expect([...firstDeck].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(d.pos).toBe(0); // a fresh deck after the last card
  });

  it("never shows the same member twice in a row across a reshuffle (the one rule)", () => {
    // Many seeds, many decks: the reshuffle seam is where a naive shuffle repeats.
    for (let seed = 1; seed < 400; seed++) {
      const rng = lcg(seed);
      for (const n of [2, 3, 4]) {
        let d = newDeck(n, rng);
        let prev = showing(d)!;
        for (let i = 0; i < 12 * n; i++) {
          d = advance(d, rng);
          const cur = showing(d)!;
          expect(cur).not.toBe(prev);
          prev = cur;
        }
      }
    }
  });

  it("a two-member set strictly alternates", () => {
    const rng = lcg(5);
    let d = newDeck(2, rng);
    const seen: number[] = [];
    for (let i = 0; i < 10; i++) {
      seen.push(showing(d)!);
      d = advance(d, rng);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBe(1 - seen[i - 1]);
  });
});
