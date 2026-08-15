/**
 * The almanac tier — the cards that are neither sky math nor network.
 *
 * Two kinds live here:
 *
 * - **Bundled datasets** (quote · word · fun fact · holidays). Classed "stable
 *   external / bundled" by [[Calendar & Whimsy]]: deterministic per day, no
 *   network, effectively re-derivable — so, like the pure-function tier, they
 *   need no snapshot-at-fetch. The pools are small on purpose and grow by
 *   editing an array; selection is by day-of-year so a given date always yields
 *   the same entry, on any device, forever.
 *
 * - **Pure functions over the user's own config or data** (countdowns ·
 *   lifetime · on-this-day · year progress).
 *
 * HOLIDAYS are a neutral international set by default — national holidays are
 * locale-specific and the user has not picked one, so swapping this array is the
 * whole change.
 */
import type { DatedEvent } from "./whimsyConfig";
import { dayStart } from "./sky";
/* The `../metrics/dates` import went with `timeProgress` (below): `weekNum` and
 * `weekStartDow` were its only readers in this file. Nothing else here is
 * week-aware — the almanac deals in days and dates. */

const DAY_MS = 86_400_000;

/** Day of year, 1…366. The selector for every bundled dataset. `round`, not
 * `floor`: local-midnight diffs are N·24h ± 1h across a DST change, and a
 * floored N−1 would break "the same date always yields the same entry" for
 * every date between spring-forward and fall-back (the 2026-07-30 audit). */
export const dayOfYear = (dayKey: string): number => {
  const d = dayStart(dayKey);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.round((d.getTime() - jan1.getTime()) / DAY_MS) + 1;
};

/**
 * Deterministic pick. Mixing the year in would break "the same date always
 * gives the same entry", which is the property that lets a past day's card be
 * recomputed years later instead of snapshotted — so it deliberately does not.
 */
const pickFor = <T,>(pool: T[], dayKey: string, salt: number): T =>
  pool[(dayOfYear(dayKey) * 7 + salt * 13) % pool.length];

// ── bundled pools ─────────────────────────────────────────────────────────────

export interface Quote {
  text: string;
  who: string;
}

const QUOTES: Quote[] = [
  { text: "The mountain is the mountain, and the way is the way.", who: "Dogen" },
  { text: "What we do now echoes in eternity.", who: "Marcus Aurelius" },
  { text: "It is not that we have a short time to live, but that we waste much of it.", who: "Seneca" },
  { text: "A year from now you may wish you had started today.", who: "Karen Lamb" },
  { text: "Little by little, one travels far.", who: "J. R. R. Tolkien" },
  { text: "The obstacle is the way.", who: "Marcus Aurelius" },
  { text: "Nothing is less productive than to make more efficient what should not be done at all.", who: "Peter Drucker" },
  { text: "We are what we repeatedly do.", who: "Will Durant" },
  { text: "Slowness is a form of attention.", who: "Anon." },
  { text: "The best time to plant a tree was twenty years ago. The second best time is now.", who: "Proverb" },
  { text: "Perfection is achieved when there is nothing left to take away.", who: "Antoine de Saint-Exupéry" },
  { text: "You do not rise to the level of your goals; you fall to the level of your systems.", who: "James Clear" },
  { text: "Patience is not passive; it is concentrated strength.", who: "Edward G. Bulwer-Lytton" },
  { text: "Amateurs sit and wait for inspiration; the rest of us just get up and go to work.", who: "Stephen King" },
  { text: "The days are long but the decades are short.", who: "Sam Altman" },
  { text: "How we spend our days is, of course, how we spend our lives.", who: "Annie Dillard" },
  { text: "Begin, be bold, and venture to be wise.", who: "Horace" },
  { text: "Simplicity is the ultimate sophistication.", who: "Leonardo da Vinci" },
  { text: "A ship in harbour is safe, but that is not what ships are built for.", who: "John A. Shedd" },
  { text: "Order and simplification are the first steps toward mastery.", who: "Thomas Mann" },
  { text: "Well begun is half done.", who: "Aristotle" },
  { text: "The journey of a thousand miles begins beneath one's feet.", who: "Laozi" },
  { text: "Energy and persistence conquer all things.", who: "Benjamin Franklin" },
  { text: "You can't use up creativity. The more you use, the more you have.", who: "Maya Angelou" },
];

export interface WordOfDay {
  word: string;
  kind: string;
  meaning: string;
  /** Rendered in `.pr` before the part of speech, as the FINAL draws it. */
  ipa: string;
  /** The `.ety` block. `em` marks the source words the FINAL italicises. */
  etymology: string;
}

const WORDS: WordOfDay[] = [
  { word: "petrichor", kind: "noun", meaning: "the smell of rain on dry earth", ipa: "/\u02c8p\u025btr\u026ak\u0254\u02d0r/", etymology: "from Greek petra 'rock' + \u012bch\u014dr, the blood of the gods." },
  { word: "sonder", kind: "noun", meaning: "the realisation that every passer-by has a life as vivid as your own", ipa: "/\u02c8s\u0252nd\u0259/", etymology: "coined 2012 in the Dictionary of Obscure Sorrows." },
  { word: "apricity", kind: "noun", meaning: "the warmth of the sun in winter", ipa: "/\u0259\u02c8pr\u026as\u026ati/", etymology: "from Latin apricus 'exposed to the sun'." },
  { word: "eucatastrophe", kind: "noun", meaning: "a sudden turn to the good when all seemed lost", ipa: "/ju\u02d0k\u0259\u02c8tastr\u0259fi/", etymology: "coined by J. R. R. Tolkien, from Greek eu- 'good' + catastrophe." },
  { word: "hiraeth", kind: "noun", meaning: "longing for a home you cannot return to", ipa: "/\u02c8h\u026ar\u0251\u026a\u03b8/", etymology: "Welsh; no direct English equivalent." },
  { word: "limerence", kind: "noun", meaning: "the involuntary, absorbing early state of infatuation", ipa: "/\u02c8l\u026am\u0259r\u0259ns/", etymology: "coined by psychologist Dorothy Tennov in the 1970s." },
  { word: "susurrus", kind: "noun", meaning: "a soft murmuring or rustling", ipa: "/s\u028a\u02c8s\u028cr\u0259s/", etymology: "from Latin susurrus 'a humming, whispering'." },
  { word: "vellichor", kind: "noun", meaning: "the strange wistfulness of second-hand bookshops", ipa: "/\u02c8v\u025bl\u026ak\u0254\u02d0r/", etymology: "coined on the model of petrichor, from vellum." },
  { word: "meraki", kind: "noun", meaning: "doing something with soul, creativity, and love", ipa: "/me\u02c8raki/", etymology: "Modern Greek, from Turkish merak 'labour of love'." },
  { word: "komorebi", kind: "noun", meaning: "sunlight filtering through leaves", ipa: "/ko\u02c8mo\u027ebe\u032f/", etymology: "Japanese \u6728\u6f0f\u308c\u65e5, literally 'tree-leak-sun'." },
  { word: "saudade", kind: "noun", meaning: "a deep nostalgic longing for something absent", ipa: "/sa\u028a\u02c8d\u0251\u02d0d\u0259/", etymology: "Portuguese, from Latin solitas 'solitude'." },
  { word: "nemophilist", kind: "noun", meaning: "one who is fond of forests", ipa: "/n\u026a\u02c8m\u0252f\u026al\u026ast/", etymology: "from Greek nemos 'grove' + philos 'loving'." },
  { word: "eudaimonia", kind: "noun", meaning: "flourishing; the good life well lived", ipa: "/ju\u02d0d\u026a\u02c8mo\u028ani\u0259/", etymology: "Greek eu- 'good' + daim\u014dn 'spirit'; central to Aristotle." },
  { word: "sprezzatura", kind: "noun", meaning: "studied carelessness; art that hides the effort", ipa: "/spr\u025bts\u0259\u02c8t\u028a\u0259r\u0259/", etymology: "Italian, coined by Castiglione in 1528." },
  { word: "wabi-sabi", kind: "noun", meaning: "beauty in imperfection and impermanence", ipa: "/\u02c8w\u0251\u02d0bi \u02c8s\u0251\u02d0bi/", etymology: "Japanese \u4fab\u5bc2, from wabi 'austere beauty' + sabi 'patina'." },
  { word: "solivagant", kind: "adj.", meaning: "wandering alone", ipa: "/s\u0259\u02c8l\u026av\u0259\u0261\u0259nt/", etymology: "from Latin solus 'alone' + vagari 'to wander'." },
  { word: "quiddity", kind: "noun", meaning: "the inherent nature of a thing; its whatness", ipa: "/\u02c8kw\u026ad\u026ati/", etymology: "from Latin quidditas, from quid 'what'." },
  { word: "halcyon", kind: "adj.", meaning: "calm, peaceful, golden in memory", ipa: "/\u02c8halsi\u0259n/", etymology: "from Greek halky\u014dn, a bird said to calm the winter sea." },
  { word: "ineffable", kind: "adj.", meaning: "too great to be expressed in words", ipa: "/\u026a\u02c8n\u025bf\u0259b(\u0259)l/", etymology: "from Latin in- 'not' + effabilis 'utterable'." },
  { word: "liminal", kind: "adj.", meaning: "occupying a threshold; between two states", ipa: "/\u02c8l\u026am\u026an(\u0259)l/", etymology: "from Latin limen 'threshold'." },
  { word: "numinous", kind: "adj.", meaning: "suggesting the presence of something beyond comprehension", ipa: "/\u02c8nju\u02d0m\u026an\u0259s/", etymology: "from Latin numen 'divine will'." },
  { word: "obdurate", kind: "adj.", meaning: "stubbornly refusing to change one's course", ipa: "/\u02c8\u0252bdj\u028ar\u0259t/", etymology: "from Latin obduratus 'hardened'." },
];

export interface FunFact {
  text: string;
  /** Drawn as `.chip-cat`, tinted from the categorical palette. */
  category: string;
  /** 1..8 — indexes --cat-N. */
  cat: number;
}

const FACTS: FunFact[] = [
  { text: "A day on Venus is longer than its year.", category: "Astronomy", cat: 1 },
  { text: "Honey found in Egyptian tombs was still edible after 3,000 years.", category: "History", cat: 3 },
  { text: "Octopuses have three hearts, and two stop beating when they swim.", category: "Biology", cat: 2 },
  { text: "There are more possible games of chess than atoms in the observable universe.", category: "Mathematics", cat: 4 },
  { text: "Bananas are berries; strawberries are not.", category: "Biology", cat: 2 },
  { text: "The Eiffel Tower can be up to 15 cm taller in summer as the iron expands.", category: "Physics", cat: 5 },
  { text: "Wombat droppings are cube-shaped.", category: "Biology", cat: 2 },
  { text: "Sharks existed before trees did.", category: "Biology", cat: 2 },
  { text: "A group of flamingos is called a flamboyance.", category: "Language", cat: 6 },
  { text: "Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid.", category: "History", cat: 3 },
  { text: "Sea otters hold hands while sleeping so they do not drift apart.", category: "Biology", cat: 2 },
  { text: "Oxford University is older than the Aztec Empire.", category: "History", cat: 3 },
  { text: "The shortest war in history lasted 38 minutes.", category: "History", cat: 3 },
  { text: "Water can boil and freeze at the same time — the triple point.", category: "Physics", cat: 5 },
  { text: "A bolt of lightning is roughly five times hotter than the surface of the sun.", category: "Physics", cat: 5 },
  { text: "Snails can sleep for up to three years.", category: "Biology", cat: 2 },
  { text: "The dot over a lowercase i is called a tittle.", category: "Language", cat: 6 },
  { text: "Scotland's national animal is the unicorn.", category: "Culture", cat: 7 },
  { text: "Hot water freezes faster than cold under some conditions — the Mpemba effect.", category: "Physics", cat: 5 },
  { text: "Venus is the only planet that spins clockwise.", category: "Astronomy", cat: 1 },
];

/**
 * A neutral international set — nothing national, since no locale is picked.
 * `md` is `MM-DD`; every entry here is fixed-date (moveable feasts like Easter
 * need a computus and are deliberately out of scope for a whimsy card).
 */
const HOLIDAYS: Array<{ md: string; name: string }> = [
  { md: "01-01", name: "New Year's Day" },
  { md: "02-02", name: "World Wetlands Day" },
  { md: "02-14", name: "Valentine's Day" },
  { md: "03-08", name: "International Women's Day" },
  { md: "03-14", name: "Pi Day" },
  { md: "03-20", name: "International Day of Happiness" },
  { md: "04-01", name: "April Fools' Day" },
  { md: "04-22", name: "Earth Day" },
  { md: "04-23", name: "World Book Day" },
  { md: "05-01", name: "May Day" },
  { md: "05-04", name: "Star Wars Day" },
  { md: "06-05", name: "World Environment Day" },
  { md: "06-21", name: "World Music Day" },
  { md: "07-20", name: "Moon Landing Day" },
  { md: "08-12", name: "World Elephant Day" },
  { md: "09-08", name: "International Literacy Day" },
  { md: "09-21", name: "International Day of Peace" },
  { md: "10-01", name: "International Coffee Day" },
  { md: "10-31", name: "Halloween" },
  { md: "11-13", name: "World Kindness Day" },
  { md: "12-21", name: "Winter Solstice" },
  { md: "12-25", name: "Christmas Day" },
  { md: "12-31", name: "New Year's Eve" },
];

/**
 * On-this-day. Classed pure-function because it is *re-fetchable per date* —
 * the same date yields the same history forever, so nothing needs locking. A
 * bundled set stands in for a future feed without changing the card's contract.
 */
const ON_THIS_DAY: Array<{ md: string; year: number; what: string }> = [
  { md: "01-03", year: 1888, what: "The drinking straw was patented." },
  { md: "02-12", year: 1809, what: "Charles Darwin and Abraham Lincoln were both born." },
  { md: "03-10", year: 1876, what: "The first intelligible telephone call was made." },
  { md: "04-12", year: 1961, what: "Yuri Gagarin became the first human in space." },
  { md: "05-29", year: 1953, what: "Hillary and Tenzing reached the summit of Everest." },
  { md: "06-18", year: 1178, what: "Monks at Canterbury recorded an explosion on the Moon." },
  { md: "07-20", year: 1969, what: "Apollo 11 landed on the Moon." },
  { md: "07-25", year: 1978, what: "Louise Brown, the first IVF baby, was born." },
  { md: "08-27", year: 1883, what: "Krakatoa erupted; the sound was heard 3,000 miles away." },
  { md: "09-09", year: 1947, what: "The first literal computer bug — a moth — was logged." },
  { md: "10-04", year: 1957, what: "Sputnik 1 became the first artificial satellite." },
  { md: "11-09", year: 1989, what: "The Berlin Wall opened." },
  { md: "12-17", year: 1903, what: "The Wright brothers achieved powered flight." },
];

/** ALL entries for the date — the FINAL draws a timeline, not a single line. */
export const onThisDay = (dayKey: string): Array<{ year: number; what: string }> =>
  ON_THIS_DAY.filter((h) => h.md === dayKey.slice(5))
    .map((h) => ({ year: h.year, what: h.what }))
    .sort((a, b) => a.year - b.year);

/**
 * The timeline's own `.tl-ev.now` row — the entry about YOU rather than about
 * history ("3 years since your first Reading session · 1 year of tracking with
 * Cibo"). Derived from the store, never stored.
 *
 * An anniversary is a first-session date whose month/day matches today and
 * whose year is at least one back — the day itself is not an anniversary.
 */
export interface Anniversary {
  habitName: string;
  years: number;
}

export function anniversariesFor(
  firsts: Array<{ name: string; day: string }>,
  dayKey: string,
): Anniversary[] {
  const md = dayKey.slice(5);
  const year = Number(dayKey.slice(0, 4));
  return firsts
    .filter((f) => f.day.slice(5) === md && Number(f.day.slice(0, 4)) < year)
    .map((f) => ({ habitName: f.name, years: year - Number(f.day.slice(0, 4)) }))
    .sort((a, b) => b.years - a.years);
}

/** Whole years of tracking, when today is the anniversary of the first day. */
export function trackingAnniversary(firstEverDay: string | null, dayKey: string): number | null {
  if (!firstEverDay) return null;
  if (firstEverDay.slice(5) !== dayKey.slice(5)) return null;
  const years = Number(dayKey.slice(0, 4)) - Number(firstEverDay.slice(0, 4));
  return years >= 1 ? years : null;
}

/**
 * Rediscover — a past day of the user's OWN data, surfaced to be revisited.
 * Deterministic per day so it doesn't reshuffle on every repaint, and it is a
 * door to that day's cover wall (inert until the wall exists).
 */
export const rediscover = (pastDays: string[], dayKey: string): string | null => {
  if (pastDays.length === 0) return null;
  return pastDays[(dayOfYear(dayKey) * 17) % pastDays.length];
};

export const quoteFor = (dayKey: string): Quote => pickFor(QUOTES, dayKey, 1);
export const wordFor = (dayKey: string): WordOfDay => pickFor(WORDS, dayKey, 2);
export const factFor = (dayKey: string): FunFact => pickFor(FACTS, dayKey, 3);

/** Null on the vast majority of days — the card is absent, not empty. */
export const holidayFor = (dayKey: string): string | null =>
  HOLIDAYS.find((h) => h.md === dayKey.slice(5))?.name ?? null;

// ── config- and data-driven ───────────────────────────────────────────────────

/* `timeProgress` and its `TimeProgress` interface RETIRED 2026-08-14.
 *
 * They were the ORIGINAL rule for the five period fractions. `periodProgress`
 * replaced them on the progress card (2026-08-13) but the cover wall's year
 * tile still called this one, which left TWO implementations of one set of
 * numbers — agreeing except across a DST boundary, where this rule's fixed
 * 86_400_000 denominator runs ~4% out on a 23- or 25-hour day. The wall tile
 * is drawn at 23:59 of the day itself, which is exactly where that divergence
 * is largest.
 *
 * The wall migrated at the 2026-08-14 sweep and this had no other reader, so it
 * goes rather than lingering as a second answer somebody could pick up again.
 * `dayOfYear` STAYS — two live readers remain in this file.
 * The one rule now lives in daily/periodProgress.ts, under test. */


export interface Countdown {
  /**
   * The source event's id. Rows MUST key on this: label+date collide the moment
   * two events share a name and a day, and duplicate React keys corrupt
   * reconciliation (observed: seven rows rendering on a four-row page).
   */
  id: string;
  label: string;
  /** Negative = already past (only possible for non-recurring events). */
  days: number;
  /**
   * Days since the most recent PAST occurrence — null when the event has never
   * happened yet (a one-shot still in the future). A recurring event always has
   * one, because there is always a last time round.
   *
   * User-ruled 2026-07-25: the card shows both directions, not just the
   * countdown — "it also shows how many days has since passed".
   */
  sinceDays: number | null;
  date: string;
  recurring: boolean;
}

/**
 * Countdowns to the user's dated events. A recurring event always resolves to
 * its NEXT occurrence (today counts as 0, not as 365); a one-shot that has
 * passed is reported with a negative count so the card can phrase it as "ago".
 */
export function countdowns(events: DatedEvent[], dayKey: string): Countdown[] {
  const today = dayStart(dayKey);
  const out: Countdown[] = events.map((e) => {
    const src = dayStart(e.date);
    if (!e.recurring) {
      const days = Math.round((src.getTime() - today.getTime()) / DAY_MS);
      return {
        id: e.id,
        label: e.label,
        days,
        // A one-shot has only happened if its date is not in the future.
        sinceDays: days <= 0 ? -days : null,
        date: e.date,
        recurring: false,
      };
    }
    // Next anniversary: this year's, or next year's if it has already gone by.
    let next = new Date(today.getFullYear(), src.getMonth(), src.getDate());
    if (next.getTime() < today.getTime()) next = new Date(today.getFullYear() + 1, src.getMonth(), src.getDate());
    // Last anniversary: this year's if it has already been, else last year's.
    let last = new Date(today.getFullYear(), src.getMonth(), src.getDate());
    if (last.getTime() > today.getTime()) last = new Date(today.getFullYear() - 1, src.getMonth(), src.getDate());
    return {
      id: e.id,
      label: e.label,
      days: Math.round((next.getTime() - today.getTime()) / DAY_MS),
      sinceDays: Math.round((today.getTime() - last.getTime()) / DAY_MS),
      date: e.date,
      recurring: true,
    };
  });
  return (
    out
      /**
       * A one-shot that has been and gone leaves the chart entirely (user-ruled
       * 2026-07-25). Only recurring events survive their own date, because they
       * roll to the next occurrence — so nothing here is ever negative, and the
       * card never becomes a list of things that already happened.
       *
       * `days === 0` stays: that is today, not the past.
       */
      .filter((c) => c.recurring || c.days >= 0)
      // Soonest first. With past one-shots gone there is no past tier to sort.
      .sort((a, b) => a.days - b.days)
  );
}

/**
 * The zodiac sign, from the birthdate. The horoscope's PROSE is ephemeral and
 * network-fed, but the sign is a pure function of the birthdate — so the card's
 * identity block (`.sign > .disc2 > .gl` + `.nm`) renders without the network,
 * and only the paragraph waits.
 */
export interface SunSign {
  name: string;
  glyph: string;
}

const ZODIAC: Array<{ from: string; name: string; glyph: string }> = [
  { from: "01-20", name: "Aquarius", glyph: "♒" },
  { from: "02-19", name: "Pisces", glyph: "♓" },
  { from: "03-21", name: "Aries", glyph: "♈" },
  { from: "04-20", name: "Taurus", glyph: "♉" },
  { from: "05-21", name: "Gemini", glyph: "♊" },
  { from: "06-21", name: "Cancer", glyph: "♋" },
  { from: "07-23", name: "Leo", glyph: "♌" },
  { from: "08-23", name: "Virgo", glyph: "♍" },
  { from: "09-23", name: "Libra", glyph: "♎" },
  { from: "10-23", name: "Scorpio", glyph: "♏" },
  { from: "11-22", name: "Sagittarius", glyph: "♐" },
  { from: "12-22", name: "Capricorn", glyph: "♑" },
];

/**
 * Glyph by sign NAME — the wall's horoscope tile renders the SNAPSHOTTED sign,
 * which stays honest even if the configured birthdate later changes.
 */
export function signGlyph(name: string): string | null {
  return ZODIAC.find((z) => z.name === name)?.glyph ?? null;
}

export function sunSign(birthdate: string | null): SunSign | null {
  if (!birthdate) return null;
  const md = birthdate.slice(5);
  // Walk backwards to the last cusp on or before the birthday; anything before
  // 20 January belongs to the Capricorn span that wraps the year end.
  for (let i = ZODIAC.length - 1; i >= 0; i--) {
    if (md >= ZODIAC[i].from) return { name: ZODIAC[i].name, glyph: ZODIAC[i].glyph };
  }
  return { name: "Capricorn", glyph: "♑" };
}
