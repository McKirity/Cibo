/**
 * How an entry's image files are NAMED — the pure half of the cover pipeline,
 * kept apart from `covers.ts` because that module reaches the filesystem and
 * the network and can never be imported by a test.
 *
 * *It lives here for a reason worth keeping:* the first attempt put this in
 * `covers.ts` and the test could not import it — `covers.ts` pulls in the
 * transport tier, which carries a build-time `__APP_VERSION__` define. That is
 * the standing check working as designed (*"the day a core test needs jsdom or
 * a mock, the module under test has stopped being pure"*). The answer is to
 * extract the pure rule, never to teach the test config about the app config.
 *
 * **THE RULE (user-ruled 2026-08-08).** An imported entry's images are named
 * after the entry's OWN identity — `<source>-<external_id>` — not its database
 * id. Hand-made entries have no external identity and keep the entry id.
 *
 * *Why.* The entry id is stable for as long as the row lives, and the row is
 * exactly what does not survive a store wipe or a restore. Re-importing the
 * same book minted a new row, a new id and therefore a NEW FILE, leaving the
 * old one stranded against a row that no longer existed — so one
 * restore-and-reimport cycle doubled the folder. It happened twice in one day.
 * An identity outlives any number of database rebuilds, so the same book always
 * lands on the same filename and the write is an overwrite.
 *
 * *Why it is safe now and was not before.* `covers.ts` used to record the old
 * TMDB collision — movie 500 and TV 500 both writing `tmdb-500.jpg` — as the
 * reason for entry-id naming. **That reason is spent:** the app splits the
 * sources (`tmdb-movie`/`tmdb-tv`, `anilist-anime`/`anilist-manga`), which is
 * what makes `(source, external_id)` unique together in the schema, and the
 * same split makes it unique as a filename. All eight source keys were checked
 * before this landed.
 *
 * Owning record: [[Images & Cover Assets]], amended with this change.
 */

/**
 * Filename-safe. External ids are numeric or hex in practice, but they are
 * parsed out of URLs and remote payloads, so nothing is trusted into a path.
 *
 * **The dot is NOT in the allowed set**, and that is deliberate: a first pass
 * allowed it, and the test immediately produced `ao3-.._.._evil_.._x_y` from a
 * traversal-shaped id. Stripping the separators already made that a single flat
 * filename rather than a path, so it was not exploitable — but no external id
 * this app handles needs a dot (uuids, numerics and YouTube's `UC…` ids do
 * not), the extension is appended separately, and a name that is all dots or
 * ends in one is its own problem on Windows. Denying it costs nothing.
 */
const safeSeg = (v: string): string => v.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);

/**
 * The stem an entry's image files are named with — its OWN identity where it
 * has one, else its database id.
 *
 * One place, because the download half and the user-pick half must not drift
 * onto different names for the same entry: that would write two files where the
 * whole point is to write one.
 *
 * Both halves of the identity or neither — a half-identity is not an identity,
 * and `validateEntryExternalIdentity` refuses to store one anyway.
 */
export const imageStem = (
  entryId: string,
  source: string | null | undefined,
  externalId: string | null | undefined,
): string =>
  source != null && source !== "" && externalId != null && externalId !== ""
    ? `${safeSeg(source)}-${safeSeg(externalId)}`
    : entryId;
