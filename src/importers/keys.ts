/**
 * The two importer API keys — TMDB + YouTube, the app's ONLY keys (Steam /
 * AniList / AO3 keyless; [[Importer Runtime & External Access]]'s access
 * table). Ruled storage: **synced, stored plain** in `app_meta`
 * ([[Sync & Per-Device Settings]] — not secrets); the ONE entry surface is
 * Settings → Importers (the dev panel's duplicate rows were deleted with the
 * whole dev surface, 2026-08-04 user-ruled).
 *
 * NOTE (2026-08-01): the old vault's gitignored `data.json` — the Phase 1
 * Overview's build-time-retrieval source — carries BOTH keys empty, so there
 * was nothing to migrate; the keys arrive by hand through the dev panel.
 *
 * DEV FALLBACK (2026-08-01, user-supplied keys): `.env.local` (gitignored —
 * the repo is PUBLIC, keys never enter git) may carry
 * `VITE_IMPORTER_TMDB_KEY` / `VITE_IMPORTER_YOUTUBE_KEY`. On first read with
 * no app_meta row, the env value SEEDS the row — from then on the store (the
 * ruled, synced home) is the truth and the env file is inert. Both keys were
 * validated live at entry (TMDB /configuration · YouTube i18nLanguages).
 */
import { NonEmptyString100, NonEmptyString1000 } from "@evolu/common";
import { evolu } from "../db/evolu";

export type ImporterKeyName = "tmdb" | "youtube";

const KEY_PREFIX = "importer_key:";

/** Session cache — sources read a key per search/fetch; one query is plenty. */
const cache = new Map<string, string | null>();

const metaQuery = (k: string) =>
  evolu.createQuery((db) =>
    db
      .selectFrom("app_meta")
      .select(["id", "value"])
      .where("key", "=", NonEmptyString100.orThrow(k))
      .where("isDeleted", "is not", 1),
  );

/** The .env.local dev fallback values (undefined outside dev setups). */
const envKey = (name: ImporterKeyName): string | null => {
  const raw =
    name === "tmdb"
      ? (import.meta.env.VITE_IMPORTER_TMDB_KEY as string | undefined)
      : (import.meta.env.VITE_IMPORTER_YOUTUBE_KEY as string | undefined);
  const v = raw?.trim() ?? "";
  return v === "" ? null : v;
};

export const getImporterKey = async (name: ImporterKeyName): Promise<string | null> => {
  const k = KEY_PREFIX + name;
  const hit = cache.get(k);
  if (hit !== undefined) return hit;
  const rows = await evolu.loadQuery(metaQuery(k));
  const raw = rows[0]?.value != null ? String(rows[0].value).trim() : "";
  let val = raw === "" ? null : raw;
  if (val == null) {
    // Seed from .env.local once; the store is the truth afterwards. A
    // rejected write still returns the env value (usable this session).
    const fromEnv = envKey(name);
    if (fromEnv != null) {
      const res = evolu.insert("app_meta", {
        key: NonEmptyString100.orThrow(k),
        value: NonEmptyString1000.orThrow(fromEnv),
      });
      if (!res.ok) console.error(`importer key env-seed rejected (${name})`, res.error);
      val = fromEnv;
    }
  }
  cache.set(k, val);
  return val;
};

/**
 * Write (or clear — empty string) a key. `app_meta.value` is non-nullable, so
 * clearing tombstones the row via `isDeleted`. Every mutation Result is
 * checked (the 2026-07-23 silent-failure lesson).
 */
export const setImporterKey = async (name: ImporterKeyName, value: string): Promise<boolean> => {
  const k = KEY_PREFIX + name;
  const trimmed = value.trim();
  const rows = await evolu.loadQuery(metaQuery(k));
  const existing = rows[0] ?? null;
  let ok: boolean;
  if (trimmed === "") {
    ok = existing == null ? true : evolu.update("app_meta", { id: existing.id, isDeleted: 1 }).ok;
  } else if (existing != null) {
    ok = evolu.update("app_meta", {
      id: existing.id,
      value: NonEmptyString1000.orThrow(trimmed),
    }).ok;
  } else {
    ok = evolu.insert("app_meta", {
      key: NonEmptyString100.orThrow(k),
      value: NonEmptyString1000.orThrow(trimmed),
    }).ok;
  }
  if (ok) cache.set(k, trimmed === "" ? null : trimmed);
  else console.error(`importer key write rejected (${name})`);
  return ok;
};
