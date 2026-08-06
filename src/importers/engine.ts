/**
 * The IMPORT ENGINE — one run loop every source rides ([[Importer Field
 * Mapping]] § shared mechanics + [[Importer Runtime & External Access]]
 * § error policy). The laws, in code:
 *
 *  · `(source, external_id)` dedup — existing entries are SKIPPED, never
 *    overwritten. The batch also dedups against ITSELF (the old Calibre
 *    lesson: two same-titled books in one run must not both land).
 *  · The ADOPTION contract — before creating, a title-similar MANUAL entry
 *    (null identity pair) is adopted instead: the pair is filled and only
 *    EMPTY columns backfill; hand-entered data always wins.
 *  · Per-item failure collection — one bad item never aborts the batch
 *    (the retry policy itself lives in http.ts, one backoff on 429/5xx).
 *  · Covers download at import time, named by ENTRY id; failure is non-fatal.
 *  · Inter-item pacing (the old plugin's 200 ms, kept — polite by default).
 *  · Every mutation Result is CHECKED (the 2026-07-23 silent-failure lesson).
 */
import { NonEmptyString100, NonEmptyString1000, NonNegativeInt, PositiveInt } from "@evolu/common";
import { evolu } from "../db/evolu";
// titleKey is IMPORTED, never re-declared: db/duplicates records that the
// detector must fold titles exactly as the importer does, or it reports
// duplicates the importer had no way to prevent. This file carried a
// byte-identical private copy until 2026-08-04 — two copies that could drift
// apart silently, which is the very failure that note guards against.
import { titleKey } from "../db/duplicates";
import { stringListToJson, type EntryId, type HabitId } from "../db/schema";
import { saveCover } from "./covers";
import { ensureGenreVocab } from "./vocabAdd";
import type { FetchedEntry, ImportSummary, ItemState, QueueItem, ImporterSource } from "./types";

const INTER_ITEM_MS = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The existing-entry slice the engine dedups/adopts against. */
export interface ExistingEntry {
  id: EntryId;
  title: string;
  source: string | null;
  external_id: string | null;
  cover: string | null;
  description: string | null;
  creators: string | null;
  studios: string | null;
  type: string | null;
  genre: string | null;
  series: string | null;
  series_order: number | null;
  words: number | null;
  // NO `status` (deleted 2026-08-04): it was selected, mapped and typed for
  // nobody. `adoptPatch` backfills description/creators/studios/type/genre/
  // series/series_order/words and deliberately not status, and the insert path
  // reads `ctx.bundleHasStatus` + the FETCHED entry's status instead.
}

export interface EngineCtx {
  habitKey: string;
  habitId: HabitId;
  /** Whether the habit's entry bundle declares `status` (seed Planned/Finished only then). */
  bundleHasStatus: boolean;
  existing: ExistingEntry[];
}


const listJson = (xs: string[]) =>
  xs.length > 0 ? stringListToJson(xs.map((x) => NonEmptyString1000.orThrow(x))) : null;

/** The insert-shape a FetchedEntry maps to (skip-never-overwrite composes:
 * unset fields stay null). */
const insertPatch = (e: FetchedEntry, ctx: EngineCtx, item: QueueItem) => ({
  habit_fk: ctx.habitId,
  title: NonEmptyString1000.orThrow(e.title),
  source: NonEmptyString100.orThrow(item.source),
  external_id: NonEmptyString100.orThrow(item.externalId),
  status: ctx.bundleHasStatus ? NonEmptyString100.orThrow(e.status) : null,
  description: e.description,
  creators: listJson(e.creators),
  studios: listJson(e.studios),
  type: e.type != null ? NonEmptyString100.orThrow(e.type) : null,
  genre: listJson(e.genre),
  series: e.series != null ? NonEmptyString1000.orThrow(e.series) : null,
  series_order: e.seriesOrder != null ? PositiveInt.orThrow(e.seriesOrder) : null,
  words: e.words != null ? NonNegativeInt.orThrow(e.words) : null,
});

/** Backfill patch for an ADOPTED entry — empty columns only, hand data wins. */
const adoptPatch = (target: ExistingEntry, e: FetchedEntry, item: QueueItem) => {
  const patch: Record<string, unknown> = {
    id: target.id,
    source: NonEmptyString100.orThrow(item.source),
    external_id: NonEmptyString100.orThrow(item.externalId),
  };
  if (target.description == null && e.description != null) patch.description = e.description;
  if (target.creators == null && e.creators.length > 0) patch.creators = listJson(e.creators);
  if (target.studios == null && e.studios.length > 0) patch.studios = listJson(e.studios);
  if (target.type == null && e.type != null) patch.type = NonEmptyString100.orThrow(e.type);
  if (target.genre == null && e.genre.length > 0) patch.genre = listJson(e.genre);
  if (target.series == null && e.series != null)
    patch.series = NonEmptyString1000.orThrow(e.series);
  if (target.series_order == null && e.seriesOrder != null)
    patch.series_order = PositiveInt.orThrow(e.seriesOrder);
  if (target.words == null && e.words != null) patch.words = NonNegativeInt.orThrow(e.words);
  return patch;
};

const downloadCover = async (
  ctx: EngineCtx,
  entryId: string,
  e: FetchedEntry,
): Promise<string | null> => {
  if (e.coverUrl == null) return null;
  const first = await saveCover(ctx.habitKey, entryId, e.coverUrl);
  if (first != null) return first;
  if (e.coverFallbackUrl != null) return saveCover(ctx.habitKey, entryId, e.coverFallbackUrl);
  return null;
};

/**
 * Run one import batch. `onItem` streams per-item state to the progress rows;
 * `isCancelled` lets an unmounting modal stop scheduling FURTHER items (the
 * in-flight item still lands whole — writes are never torn mid-item).
 */
export const runImport = async (
  items: QueueItem[],
  sources: Map<string, ImporterSource>,
  ctx: EngineCtx,
  onItem: (index: number, state: ItemState) => void,
  isCancelled: () => boolean = () => false,
): Promise<ImportSummary> => {
  const summary: ImportSummary = { added: 0, skipped: 0, failed: 0, failures: [] };
  // Pairs seen this run — batch-local dedup ahead of the store's own.
  const seenPairs = new Set(
    ctx.existing
      .filter((x) => x.source != null && x.external_id != null)
      .map((x) => `${x.source}:${x.external_id}`),
  );
  // Adoption pool: manual entries (null pair), keyed by normalized title.
  const manualByTitle = new Map(
    ctx.existing
      .filter((x) => x.source == null && x.external_id == null)
      .map((x) => [titleKey(x.title), x] as const),
  );

  for (let i = 0; i < items.length; i++) {
    if (isCancelled()) {
      for (let j = i; j < items.length; j++)
        onItem(j, { phase: "skipped", reason: "cancelled" });
      summary.skipped += items.length - i;
      break;
    }
    const item = items[i];
    const pairKey = `${item.source}:${item.externalId}`;
    if (seenPairs.has(pairKey)) {
      summary.skipped++;
      onItem(i, { phase: "skipped", reason: "already in library" });
      continue;
    }
    const source = sources.get(item.source);
    if (source == null) {
      summary.failed++;
      summary.failures.push({ title: item.title, reason: `unknown source ${item.source}` });
      onItem(i, { phase: "failed", reason: `unknown source ${item.source}` });
      continue;
    }
    onItem(i, { phase: "importing" });
    try {
      const outcome = await source.fetchItem(item.externalId);
      if (outcome.kind === "skipped") {
        summary.skipped++;
        onItem(i, { phase: "skipped", reason: outcome.reason });
      } else if (outcome.kind === "failed") {
        summary.failed++;
        summary.failures.push({ title: item.title, reason: outcome.reason });
        onItem(i, { phase: "failed", reason: outcome.reason });
      } else {
        const e = outcome.entry;
        // The identity to WRITE — canonical when it only resolved at fetch
        // time (YouTube @handle → UC-id). Dedup re-checks on the final pair.
        const finalId = e.canonicalExternalId ?? item.externalId;
        const finalPair = `${item.source}:${finalId}`;
        if (finalPair !== pairKey && seenPairs.has(finalPair)) {
          summary.skipped++;
          onItem(i, { phase: "skipped", reason: "already in library" });
          continue;
        }
        const writeItem: QueueItem = { ...item, externalId: finalId };
        seenPairs.add(pairKey);
        seenPairs.add(finalPair);
        // Genre discipline: reconcile imported genres against the habit's
        // picklist (auto-add, canonical casing wins) BEFORE the entry write —
        // only Calibre + AO3 ship non-empty genre lists.
        if (e.genre.length > 0)
          e.genre = await ensureGenreVocab(ctx.habitId, ctx.habitKey, e.genre);
        const adoptee = manualByTitle.get(titleKey(e.title));
        if (adoptee != null) {
          const res = evolu.update("entries", adoptPatch(adoptee, e, writeItem) as never);
          if (!res.ok) throw new Error("adoption write rejected");
          manualByTitle.delete(titleKey(e.title));
          if (adoptee.cover == null) {
            const ref = await downloadCover(ctx, String(adoptee.id), e);
            if (ref != null) {
              const cres = evolu.update("entries", {
                id: adoptee.id,
                cover: NonEmptyString1000.orThrow(ref),
              } as never);
              if (!cres.ok) console.error("cover ref write rejected", cres.error);
            }
          }
          summary.added++;
          onItem(i, { phase: "adopted" });
        } else {
          const res = evolu.insert("entries", insertPatch(e, ctx, writeItem) as never);
          if (!res.ok) throw new Error("entry insert rejected");
          const id = (res.value as { id: EntryId }).id;
          const ref = await downloadCover(ctx, String(id), e);
          if (ref != null) {
            const cres = evolu.update("entries", {
              id,
              cover: NonEmptyString1000.orThrow(ref),
            } as never);
            if (!cres.ok) console.error("cover ref write rejected", cres.error);
          }
          summary.added++;
          onItem(i, { phase: "added" });
        }
      }
    } catch (err) {
      summary.failed++;
      const reason = err instanceof Error ? err.message : String(err);
      summary.failures.push({ title: item.title, reason });
      onItem(i, { phase: "failed", reason });
    }
    if (i < items.length - 1) await sleep(INTER_ITEM_MS);
  }
  return summary;
};
