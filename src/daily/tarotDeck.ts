/**
 * The bundled tarot deck — the 22 major arcana.
 *
 * The daily draw is LOCAL (user-ruled 2026-07-27, network-tier fork C): the
 * ruling's real requirement is ephemerality + snapshot-at-fetch, which a random
 * draw satisfies with zero network and zero failure modes. The deck itself is
 * static data — fetching it would add a host to fetch what never changes. The
 * old plugin's deterministic seeded pick is deliberately NOT restored: a
 * deterministic pick is recomputable forever, and this card is ruled ephemeral —
 * the draw happens once, is snapshotted into `feed_snapshot`, and an unopened
 * day honestly has none.
 *
 * Keywords are the compact two/three-word riff the drawn face carries
 * ("hope · renewal"), one set per orientation.
 */

export interface TarotCardDef {
  /** 0–21, the card's index in the majors. */
  n: number;
  numeral: string;
  name: string;
  upright: string[];
  reversed: string[];
}

export const MAJOR_ARCANA: readonly TarotCardDef[] = [
  { n: 0, numeral: "0", name: "The Fool", upright: ["beginnings", "leap of faith"], reversed: ["hesitation", "recklessness"] },
  { n: 1, numeral: "I", name: "The Magician", upright: ["will", "resourcefulness"], reversed: ["scattered focus", "trickery"] },
  { n: 2, numeral: "II", name: "The High Priestess", upright: ["intuition", "stillness"], reversed: ["ignored instinct", "secrets"] },
  { n: 3, numeral: "III", name: "The Empress", upright: ["abundance", "nurture"], reversed: ["smothering", "creative block"] },
  { n: 4, numeral: "IV", name: "The Emperor", upright: ["structure", "authority"], reversed: ["rigidity", "domination"] },
  { n: 5, numeral: "V", name: "The Hierophant", upright: ["tradition", "guidance"], reversed: ["dogma", "rebellion"] },
  { n: 6, numeral: "VI", name: "The Lovers", upright: ["union", "a true choice"], reversed: ["disharmony", "avoidance"] },
  { n: 7, numeral: "VII", name: "The Chariot", upright: ["drive", "victory"], reversed: ["stalling", "lost direction"] },
  { n: 8, numeral: "VIII", name: "Strength", upright: ["courage", "gentle power"], reversed: ["self-doubt", "raw nerve"] },
  { n: 9, numeral: "IX", name: "The Hermit", upright: ["solitude", "inner light"], reversed: ["isolation", "withdrawal"] },
  { n: 10, numeral: "X", name: "Wheel of Fortune", upright: ["turning point", "luck"], reversed: ["resistance", "bad spin"] },
  { n: 11, numeral: "XI", name: "Justice", upright: ["fairness", "truth"], reversed: ["imbalance", "avoided account"] },
  { n: 12, numeral: "XII", name: "The Hanged Man", upright: ["surrender", "new angle"], reversed: ["stalling", "martyrdom"] },
  { n: 13, numeral: "XIII", name: "Death", upright: ["ending", "transformation"], reversed: ["clinging", "stagnation"] },
  { n: 14, numeral: "XIV", name: "Temperance", upright: ["balance", "patience"], reversed: ["excess", "impatience"] },
  { n: 15, numeral: "XV", name: "The Devil", upright: ["attachment", "shadow"], reversed: ["release", "reclaimed power"] },
  { n: 16, numeral: "XVI", name: "The Tower", upright: ["upheaval", "revelation"], reversed: ["averted disaster", "dread"] },
  { n: 17, numeral: "XVII", name: "The Star", upright: ["hope", "renewal"], reversed: ["doubt", "faded faith"] },
  { n: 18, numeral: "XVIII", name: "The Moon", upright: ["dream", "uncertainty"], reversed: ["clarity", "fear released"] },
  { n: 19, numeral: "XIX", name: "The Sun", upright: ["joy", "vitality"], reversed: ["dimmed spark", "impatience"] },
  { n: 20, numeral: "XX", name: "Judgement", upright: ["awakening", "reckoning"], reversed: ["self-judgement", "deaf call"] },
  { n: 21, numeral: "XXI", name: "The World", upright: ["completion", "wholeness"], reversed: ["loose ends", "almost there"] },
];

export interface TarotDraw {
  /** The card's index — resolution against the deck is the renderer's job… */
  n: number;
  /** …but the resolved fields are ALSO snapshotted, so a day renders exactly
   *  what it drew even if the deck's wording is ever edited. */
  numeral: string;
  name: string;
  keywords: string[];
  reversed: boolean;
}

/** One draw. Genuinely random — that is what makes it ephemeral. */
export const drawCard = (): TarotDraw => {
  const card = MAJOR_ARCANA[Math.floor(Math.random() * MAJOR_ARCANA.length)];
  const reversed = Math.random() < 0.25;
  return {
    n: card.n,
    numeral: card.numeral,
    name: card.name,
    keywords: reversed ? card.reversed : card.upright,
    reversed,
  };
};
