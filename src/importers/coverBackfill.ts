/**
 * A DEV-ONLY cover backfill — throwaway tooling, in the seeder's tradition
 * (user-asked 2026-07-31: *"I want to test the covers in the library, but I
 * don't want to go through all the trouble of importing, finalizing new days,
 * etc. Is it possible to pull covers from steam based on the seed data?"*).
 *
 * It walks the Gaming habit's EXISTING entries (the rich seeder's, which carry
 * no cover and a null identity pair), matches each title against Steam's
 * storefront search, downloads the portrait, and writes the `cover` ref plus
 * the `(steam, appid)` identity — which is exactly the ADOPTION contract the
 * engine already performs at import time, run as a batch over seeded rows.
 *
 * SAFETY, because a wrong appid would stick to a row permanently:
 *  · the match must be EXACT on the normalized title (case/punctuation/legal
 *    marks folded away). A fuzzy or multi-candidate result is SKIPPED and
 *    reported, never guessed — this is a convenience tool, not a repair path.
 *  · entries that already carry a cover are left alone (idempotent, re-runnable).
 *  · every mutation Result is checked (the 2026-07-23 silent-failure lesson).
 *
 * Throwaway like `seedRich`: real covers arrive through the importer proper,
 * and the Hardening full-scope seeding pass supersedes this.
 */
import { NonEmptyString100, NonEmptyString1000 } from "@evolu/common";
import { evolu } from "../db/evolu";
import type { EntryId, HabitId } from "../db/schema";
import { saveCover } from "./covers";
import { steamSource } from "./steam";
import { cleanTitle } from "./titles";
import { isSeedIdentity } from "../db/duplicates";

const INTER_ITEM_MS = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fold to a comparison key: legal marks gone, case/punctuation/space ignored. */
const matchKey = (t: string): string =>
  cleanTitle(t)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

export interface BackfillResult {
  scanned: number;
  filled: number;
  /** Seed-fiction identities (`steam-6`) rewritten to the real appid. */
  identityRepaired: number;
  skippedHasCover: number;
  noMatch: string[];
  failed: { title: string; reason: string }[];
}

export const backfillGamingCovers = async (
  onProgress?: (done: number, total: number, title: string) => void,
): Promise<BackfillResult> => {
  const out: BackfillResult = {
    scanned: 0,
    filled: 0,
    identityRepaired: 0,
    skippedHasCover: 0,
    noMatch: [],
    failed: [],
  };

  const habitRows = await evolu.loadQuery(
    evolu.createQuery((db) =>
      db
        .selectFrom("habits")
        .select(["id"])
        .where("key", "=", NonEmptyString100.orThrow("gaming"))
        .where("isDeleted", "is not", 1),
    ),
  );
  const habitId = habitRows[0]?.id as HabitId | undefined;
  if (habitId == null) throw new Error("no gaming habit found");

  const entries = await evolu.loadQuery(
    evolu.createQuery((db) =>
      db
        .selectFrom("entries")
        .select(["id", "title", "cover", "source", "external_id"])
        .where("habit_fk", "=", habitId)
        .where("isDeleted", "is not", 1),
    ),
  );

  out.scanned = entries.length;
  let done = 0;
  for (const e of entries) {
    const title = (e.title as string | null) ?? "";
    done++;
    onProgress?.(done, entries.length, title);
    const seedFiction = isSeedIdentity(e.source as string | null, e.external_id as string | null);
    // A row is done only when it has BOTH its art and a real identity. Skipping
    // on cover alone would leave every already-covered row wearing its seed id
    // for good — and the seed id is what lets a duplicate in (2026-07-31).
    if (e.cover != null && !seedFiction) {
      out.skippedHasCover++;
      continue;
    }
    try {
      const hits = await steamSource.search(title);
      const key = matchKey(title);
      const exact = hits.filter((h) => matchKey(h.title) === key);
      if (exact.length !== 1) {
        out.noMatch.push(title);
        await sleep(INTER_ITEM_MS);
        continue;
      }
      const hit = exact[0];
      // Already-covered rows are here ONLY for the identity repair — don't
      // re-download art they already have.
      const ref =
        e.cover != null
          ? (e.cover as string)
          : hit.coverUrl != null
            ? await saveCover("gaming", String(e.id as EntryId), hit.coverUrl)
            : null;
      if (ref == null) {
        out.failed.push({ title, reason: "cover download failed" });
        await sleep(INTER_ITEM_MS);
        continue;
      }
      // Adopt the REAL identity so a later Steam import dedupes against these
      // rows instead of creating twins. Two cases qualify, and only two:
      //  · a null pair (a genuinely manual row), and
      //  · a SEED-SHAPED pair (`steam-6`) — fiction planted by seedRich, which
      //    is precisely what let a second "Dark Souls III" in on 2026-07-31:
      //    the pair dedup read `steam-6` vs `374320` as two products and the
      //    adoption pass skipped the row for not being manual.
      // A REAL existing id is never touched — skip-never-overwrite holds.
      const idIsFree = e.source == null && e.external_id == null;
      const takesIdentity = idIsFree || seedFiction;
      const res = evolu.update("entries", {
        id: e.id as EntryId,
        cover: NonEmptyString1000.orThrow(ref),
        ...(takesIdentity
          ? {
              source: NonEmptyString100.orThrow("steam"),
              external_id: NonEmptyString100.orThrow(hit.externalId),
            }
          : {}),
      } as never);
      if (!res.ok) {
        out.failed.push({ title, reason: "write rejected" });
        continue;
      }
      if (seedFiction) out.identityRepaired++;
      if (e.cover == null) out.filled++;
    } catch (err) {
      out.failed.push({ title, reason: err instanceof Error ? err.message : String(err) });
    }
    await sleep(INTER_ITEM_MS);
  }
  return out;
};
