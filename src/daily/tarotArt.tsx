/**
 * The deck's 22 pictorial faces — one art group per major arcanum.
 *
 * Pulled from `Exhibit - Tarot card art.html` (Claude Design, authored
 * 2026-08-06), which closes network-tier fork D: "per-card SVGs are authored
 * once the network is confirmed working" (user-ruled 2026-07-27). The shared
 * Star emblem stood in on all 22 until now; it survives here as card 17, which
 * IS The Star.
 *
 * THE FORMAT CONTRACT (the exhibit's, and the reason a theme re-skins the whole
 * deck for free):
 *  · Flat vector only — paths, circles, lines. No raster, gradient, filter or
 *    text. The numeral and the name are the CHASSIS's, drawn by the call sites.
 *  · Two pigments, always by dial: `--whimsy-star` fills the gilt hero mass,
 *    `--whimsy-ink` strokes the linework at 1.3 with round caps. The parchment
 *    ground belongs to the chassis.
 *  · The art zone is x 12–92 · y 32–158, inside the gilt inner frame.
 *  · A reversed draw turns the whole group 180° about (52, 96) — the centre
 *    lives HERE, not at the call sites, because it drifted once already (the
 *    wall's mini face was turning about 91 while Daily turned about 96).
 *
 * The grammar, agreed with the exhibit: one armature, 22 heroes — a gilt mass
 * at y≈45–95, ink support at y≈95–140, an ink horizon at y≈145–152. Cards are
 * drawn as their ATTRIBUTE, never as a figure (a person is a smudge at the
 * wall's half-size mini face), and no two share a primary silhouette. Radially
 * symmetric cards (Wheel · Sun · World) read the same reversed by design; the
 * numeral carries the orientation.
 *
 * Budget per card: ≤9 primitives · one gilt hero · nothing thinner than ≈3px.
 */
import type { ReactNode } from "react";

/** The gilt pigment — the emblem tier, one hero mass per card. */
const Gilt = ({ children }: { children: ReactNode }) => <g fill="var(--whimsy-star)">{children}</g>;

/** The ink pigment — linework, fixed weight and cap by contract. */
const Ink = ({ children }: { children: ReactNode }) => (
  <g fill="none" stroke="var(--whimsy-ink)" strokeWidth="1.3" strokeLinecap="round">
    {children}
  </g>
);

/** Keyed by the card's index in the majors — `TarotDraw.n`. */
const ART: Record<number, ReactNode> = {
  // 0 · The Fool — the bindle: a gilt sun over the cliff edge's step off.
  0: (
    <>
      <Gilt>
        <circle cx="38" cy="58" r="10" />
        <circle cx="58" cy="50" r="3" />
        <circle cx="68" cy="44" r="2.2" />
        <circle cx="76" cy="39" r="1.6" />
      </Gilt>
      <Ink>
        <path d="M16 118 H48 L48 150 H90" />
        <path d="M20 126 H44" />
      </Ink>
    </>
  ),

  // I · The Magician — the wand upright over the table of tools.
  1: (
    <>
      <Gilt>
        <circle cx="52" cy="50" r="8" />
        <rect x="49" y="58" width="6" height="38" rx="3" />
        <circle cx="38" cy="122" r="2.4" />
        <circle cx="66" cy="122" r="2.4" />
      </Gilt>
      <Ink>
        <path d="M22 128 H82" />
        <path d="M30 128 V146 M74 128 V146" />
        <path d="M16 150 H88" />
      </Ink>
    </>
  ),

  // II · The High Priestess — the veil arch between her two pillars.
  2: (
    <>
      <Gilt>
        <path d="M32 80 A20 20 0 0 1 72 80 L66 80 A14 14 0 0 0 38 80 Z" />
        <circle cx="52" cy="68" r="4.5" />
      </Gilt>
      <Ink>
        <path d="M40 82 V132 M52 82 V138 M64 82 V132" />
        <path d="M18 148 H86" />
      </Ink>
    </>
  ),

  // III · The Empress — the seeded disc over a growing stalk. (pilot)
  3: (
    <>
      <Gilt>
        <circle cx="52" cy="58" r="12" />
        <path d="M33 70 A19 19 0 0 0 71 70 L66 70 A14 14 0 0 1 38 70 Z" />
        <circle cx="38" cy="103" r="2.2" />
        <circle cx="52" cy="96" r="2.4" />
        <circle cx="66" cy="103" r="2.2" />
      </Gilt>
      <Ink>
        <path d="M52 140 V100" />
        <path d="M52 140 q-6 -20 -13 -34" />
        <path d="M52 140 q6 -20 13 -34" />
        <path d="M18 148 q17 -5 34 0 t34 0" />
      </Ink>
    </>
  ),

  // IV · The Emperor — the squared crown over the throne's steps.
  4: (
    <>
      <Gilt>
        <path d="M34 84 V60 h6 v-8 h6 v8 h12 v-8 h6 v8 h6 v24 Z" />
      </Gilt>
      <Ink>
        <path d="M42 86 V128 M62 86 V128" />
        <path d="M36 128 H68 M32 138 H72 M28 148 H76" />
      </Ink>
    </>
  ),

  // V · The Hierophant — the triple crown over the keys.
  5: (
    <>
      <Gilt>
        <circle cx="52" cy="52" r="8" />
        <circle cx="36" cy="74" r="7" />
        <circle cx="68" cy="74" r="7" />
      </Gilt>
      <Ink>
        <path d="M36 81 L52 92 L68 81" />
        <path d="M52 92 V142 M40 106 H64 M44 118 H60" />
        <path d="M18 150 H86" />
      </Ink>
    </>
  ),

  // VI · The Lovers — two rings and the gilt vesica they share.
  6: (
    <>
      <Gilt>
        <path d="M52 56 A17 17 0 0 0 52 80 A17 17 0 0 0 52 56 Z" />
      </Gilt>
      <Ink>
        <circle cx="40" cy="68" r="17" />
        <circle cx="64" cy="68" r="17" />
        <path d="M52 86 V138" />
        <path d="M18 150 H86" />
      </Ink>
    </>
  ),

  // VII · The Chariot — the gilt spearhead over the wheeled car.
  7: (
    <>
      <Gilt>
        <path d="M52 44 L74 88 L52 78 L30 88 Z" />
      </Gilt>
      <Ink>
        <path d="M32 108 H72 L76 128 H28 Z" />
        <circle cx="38" cy="138" r="7" />
        <circle cx="66" cy="138" r="7" />
        <path d="M16 150 H88" />
      </Ink>
    </>
  ),

  // VIII · Strength — the half-disc dome over the linked chain.
  8: (
    <>
      <Gilt>
        <path d="M30 84 A22 22 0 0 1 74 84 Z" />
      </Gilt>
      <Ink>
        <circle cx="36" cy="112" r="5" />
        <circle cx="52" cy="112" r="5" />
        <circle cx="68" cy="112" r="5" />
        <path d="M41 112 H47 M57 112 H63" />
        <path d="M18 148 H86" />
      </Ink>
    </>
  ),

  // IX · The Hermit — the lantern hung from the crook of the staff.
  9: (
    <>
      <Gilt>
        <path d="M56 56 L68 66 L68 82 L56 92 L44 82 L44 66 Z" />
      </Gilt>
      <Ink>
        <path d="M34 148 V56 q0 -8 8 -8 t10 8" />
        <path d="M52 56 V60" />
        <path d="M16 150 H88" />
      </Ink>
    </>
  ),

  // X · Wheel of Fortune — the annulus and hub over the mountain. (pilot)
  10: (
    <>
      <Gilt>
        <path fillRule="evenodd" d="M52 50 A20 20 0 1 1 51.99 50 Z M52 57 A13 13 0 1 0 51.99 57 Z" />
        <circle cx="52" cy="70" r="5" />
      </Gilt>
      <Ink>
        <path d="M52 57 V64 M52 76 V83 M39 70 H46 M58 70 H65" />
        <path d="M52 90 V112" />
        <path d="M34 140 L52 112 L70 140" />
        <path d="M20 146 H84" />
      </Ink>
    </>
  ),

  // XI · Justice — the gilt blade over the balance beam.
  11: (
    <>
      <Gilt>
        <path d="M32 50 H72 L52 86 Z" />
      </Gilt>
      <Ink>
        <path d="M52 86 V140 M26 108 H78" />
        <path d="M26 108 V114 M78 108 V114" />
        <path d="M20 114 a6 6 0 0 0 12 0 M72 114 a6 6 0 0 0 12 0" />
        <path d="M18 150 H86" />
      </Ink>
    </>
  ),

  // XII · The Hanged Man — the inverted teardrop under the gallows beam.
  12: (
    <>
      <Gilt>
        <path d="M52 132 L41 107 A11 11 0 1 1 63 107 Z" />
      </Gilt>
      <Ink>
        <path d="M18 46 H86" />
        <path d="M52 46 V96" />
        <path d="M22 46 L32 56 M82 46 L72 56" />
        <path d="M18 150 H86" />
      </Ink>
    </>
  ),

  // XIII · Death — the gilt scythe blade on its shaft.
  13: (
    <>
      <Gilt>
        <path d="M34 52 A26 26 0 0 1 74 72 L68 77 A20 20 0 0 0 37 58 Z" />
      </Gilt>
      <Ink>
        <path d="M71 76 L48 140" />
        <path d="M56 116 L68 122" />
        <path d="M18 150 H86" />
      </Ink>
    </>
  ),

  // XIV · Temperance — the twin cones of the glass over the pour.
  14: (
    <>
      <Gilt>
        <path d="M34 46 H70 L52 68 Z" />
        <path d="M34 90 H70 L52 68 Z" />
      </Gilt>
      <Ink>
        <path d="M52 92 q-9 11 0 22 t0 22" />
        <path d="M22 142 q15 -6 30 0 t30 0" />
        <path d="M18 152 H86" />
      </Ink>
    </>
  ),

  // XV · The Devil — the horned vessel over two loose rings.
  15: (
    <>
      <Gilt>
        <path d="M38 66 H66 L60 90 H44 Z" />
        <path d="M38 66 L29 45 L45 60 Z" />
        <path d="M66 66 L75 45 L59 60 Z" />
      </Gilt>
      <Ink>
        <path d="M40 90 V106 M64 90 V106" />
        <circle cx="40" cy="112" r="6" />
        <circle cx="64" cy="112" r="6" />
        <path d="M18 150 H86" />
      </Ink>
    </>
  ),

  // XVI · The Tower — the bolt striking the crenellated tower. (pilot)
  16: (
    <>
      <Gilt>
        <path d="M44 40 L62 40 L52 62 L64 62 L40 96 L48 70 L36 70 Z" />
        <circle cx="74" cy="80" r="2.4" />
        <circle cx="81" cy="98" r="1.9" />
        <circle cx="70" cy="107" r="1.6" />
      </Gilt>
      <Ink>
        <path d="M40 148 L44 104 M64 148 L60 104" />
        <path d="M43 104 H61" />
        <path d="M43 104 V97 h6 v7 m6 0 v-7 h6 v7" />
        <path d="M18 150 H86" />
      </Ink>
    </>
  ),

  // XVII · The Star — the original stand-in, kept: it IS The Star.
  17: (
    <>
      <Gilt>
        <path d="M52 49 L55.9 62.1 L69 66 L55.9 69.9 L52 83 L48.1 69.9 L35 66 L48.1 62.1 Z" />
        <path d="M60.5 57.5 L56 66 L60.5 74.5 L52 70 L43.5 74.5 L48 66 L43.5 57.5 L52 62 Z" />
        <circle cx="24" cy="36" r="1.6" />
        <circle cx="80" cy="36" r="1.4" />
        <circle cx="52" cy="34" r="1.5" />
        <circle cx="30" cy="58" r="1.2" />
        <circle cx="74" cy="60" r="1.3" />
        <circle cx="20" cy="88" r="1.2" />
        <circle cx="84" cy="90" r="1.4" />
      </Gilt>
      <Ink>
        <path d="M46 98 q-3 13 -5 28" />
        <path d="M60 98 q3 13 6 28" />
        <path d="M14 132 q11 -6 22 0 t22 0 t22 0" />
        <path d="M14 144 q11 -6 22 0 t22 0 t22 0" />
      </Ink>
    </>
  ),

  // XVIII · The Moon — the crescent over the two towers and the path. (pilot)
  18: (
    <>
      <Gilt>
        <path d="M52 46 A20 20 0 1 0 52 86 A26 26 0 0 1 52 46 Z" />
        <circle cx="72" cy="58" r="2.2" />
        <circle cx="80" cy="72" r="1.7" />
        <circle cx="68" cy="80" r="1.5" />
      </Gilt>
      <Ink>
        <path d="M24 148 V126 L28 120 L32 126 V148" />
        <path d="M72 148 V126 L76 120 L80 126 V148" />
        <path d="M52 150 q-9 -11 0 -20 t0 -20" />
        <path d="M16 150 H88" />
      </Ink>
    </>
  ),

  // XIX · The Sun — the rayed disc over the garden wall.
  19: (
    <>
      <Gilt>
        <circle cx="52" cy="68" r="13" />
        <path d="M49 51 L55 51 L52 43 Z M49 85 L55 85 L52 93 Z M69 65 L69 71 L77 68 Z M35 65 L35 71 L27 68 Z M66.1 58.1 L61.9 53.9 L69.7 50.3 Z M37.9 58.1 L42.1 53.9 L34.3 50.3 Z M66.1 77.9 L61.9 82.1 L69.7 85.7 Z M37.9 77.9 L42.1 82.1 L34.3 85.7 Z" />
      </Gilt>
      <Ink>
        <path d="M26 124 H78" />
        <path d="M34 124 V138 M52 124 V138 M70 124 V138" />
        <path d="M16 150 H88" />
      </Ink>
    </>
  ),

  // XX · Judgement — three rising chevrons over the open tomb.
  20: (
    <>
      <Gilt>
        <path d="M36 60 L52 46 L68 60 L62 62 L52 52 L42 62 Z" />
        <path d="M36 76 L52 62 L68 76 L62 78 L52 68 L42 78 Z" />
        <path d="M36 92 L52 78 L68 92 L62 94 L52 84 L42 94 Z" />
      </Gilt>
      <Ink>
        <path d="M32 140 V118 M72 140 V118" />
        <path d="M28 140 H76" />
        <path d="M16 150 H88" />
      </Ink>
    </>
  ),

  // XXI · The World — the closed wreath with its four corner marks.
  21: (
    <>
      <Gilt>
        <path
          fillRule="evenodd"
          d="M52 42 A22 30 0 0 1 52 102 A22 30 0 0 1 52 42 Z M52 49 A15 23 0 0 0 52 95 A15 23 0 0 0 52 49 Z"
        />
        <circle cx="24" cy="46" r="2.6" />
        <circle cx="80" cy="46" r="2.6" />
        <circle cx="24" cy="98" r="2.6" />
        <circle cx="80" cy="98" r="2.6" />
      </Gilt>
      <Ink>
        <path d="M52 62 V82 M42 72 H62" />
        <path d="M34 116 H70" />
        <path d="M18 150 H86" />
      </Ink>
    </>
  ),
};

/**
 * The card's pictorial group, turned when the draw is reversed. Both faces —
 * Daily's whimsy card and the cover wall's mini tile — render the SAME group;
 * the grammar was drawn for the mini's half size, so there is no reduced
 * variant to keep in step.
 *
 * An unknown `n` draws NOTHING rather than falling back to another card's face.
 * The chassis still carries the snapshotted numeral and name, so the tile stays
 * honest about what was drawn; substituting The Star would put a star on Death.
 */
export function TarotArt({ n, reversed }: { n: number; reversed: boolean }) {
  const art = ART[n];
  if (art == null) return null;
  return <g transform={reversed ? "rotate(180 52 96)" : undefined}>{art}</g>;
}
