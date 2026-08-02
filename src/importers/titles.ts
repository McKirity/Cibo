/**
 * Title normalization for EVERY importer (user-ruled 2026-07-31, at the first
 * Steam GUI pass: *"A lot of titles often come with a tm in it. I want to make
 * sure that DOESN'T get imported in"*).
 *
 * Storefront titles carry legal marks the catalog has no use for — Steam is the
 * worst offender (`DOOM® Eternal` · `Sekiro™: Shadows Die Twice` · `Tom
 * Clancy's The Division™ 2`), but AniList and Calibre tags carry them too, so
 * this lives at the SHARED tier and every source runs its titles through it
 * rather than each re-solving it (the one-interface contract).
 *
 * Applied at BOTH ends of the same dispatch path — the search candidates you
 * see and the entry that gets written — so the queued chip and the stored row
 * can never disagree.
 *
 * Deliberately NOT a general sanitizer: it strips the four legal marks and
 * repairs the whitespace they leave behind. It does not touch punctuation,
 * case, subtitles, or the release-year fold — those are title CONTENT.
 */

/** ™ (U+2122) · ® (U+00AE) · © (U+00A9) · ℠ (U+2120). */
const LEGAL_MARKS = /[™®©℠]/g;

/**
 * Strip legal marks and repair the gaps they leave.
 *
 * `DOOM® Eternal` → `DOOM Eternal` · `Sekiro™: Shadows Die Twice` →
 * `Sekiro: Shadows Die Twice` · `Warhammer 40,000™: Space Marine® 2` →
 * `Warhammer 40,000: Space Marine 2`.
 *
 * The space repair matters: removing a mark that sat directly before
 * punctuation would otherwise leave `Sekiro : Shadows`, and one that sat
 * between words would leave a double space.
 */
export const cleanTitle = (raw: string): string => {
  // No mark, no edit: the whitespace repairs below must never touch a title
  // that had nothing stripped, or a legitimately odd title ("Half-Life : Alyx")
  // would get silently rewritten. Only damage WE caused gets repaired.
  if (!LEGAL_MARKS.test(raw)) return raw.trim();
  LEGAL_MARKS.lastIndex = 0; // the /g flag makes .test() stateful
  return raw
    .replace(LEGAL_MARKS, "")
    // a mark sitting before punctuation leaves an orphan space: "Sekiro : X"
    .replace(/\s+([:,;.!?)\]])/g, "$1")
    // ...and one sitting between words leaves a double space
    .replace(/\s{2,}/g, " ")
    .trim();
};
