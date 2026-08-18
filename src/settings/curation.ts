/**
 * PALETTE CURATION — the per-action enable/disable roster (Build step 10,
 * slice 4). [[Palette]]: the pinned nine-verb inventory is "user-curated in
 * Settings"; [[Settings & Configuration]] tags it **synced** ("a curation
 * encodes preference"), and disabling **hides, never deletes**.
 *
 * Stored as one `app_meta` row (`palette_off`) holding a comma-separated list
 * of hidden verb ids — a roster of nine booleans is one value, not nine rows,
 * and the app_meta value cap (1000 chars) is nowhere near reachable.
 *
 * Read the same two ways as the rest of settings/store.ts: a live query for
 * the pane that edits it, and a synchronous cache for the palette, which
 * builds its rows inside a memo and cannot await.
 */
import { NonEmptyString100, NonEmptyString1000 } from "@evolu/common";
import { evolu } from "../db/evolu";

export const PALETTE_OFF_KEY = "palette_off";

export const paletteOffQuery = evolu.createQuery((db) =>
  db
    .selectFrom("app_meta")
    .select(["id", "value"])
    .where("key", "=", PALETTE_OFF_KEY as never)
    .where("isDeleted", "is not", 1),
);

const parse = (raw: string | null): Set<string> =>
  new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== ""),
  );

let cache = new Set<string>();

/** Launch wiring (bootstrap.tsx, beside initSyncedSettings). */
export function initCuration(): void {
  const pull = () => {
    evolu.loadQuery(paletteOffQuery).then(
      (rows) => {
        cache = parse(rows[0] != null ? String(rows[0].value) : null);
      },
      (e) => console.error("curation: load failed", e),
    );
  };
  pull();
  evolu.subscribeQuery(paletteOffQuery)(() => pull());
}

/** The palette's read — hidden verbs never render. */
export const verbHidden = (id: string): boolean => cache.has(id);

/** The pane's read, off its own live rows. */
export const hiddenFrom = (rows: readonly { value: unknown }[]): Set<string> =>
  parse(rows[0] != null ? String(rows[0].value) : null);

export function setVerbEnabled(
  rows: readonly { id: unknown }[],
  hidden: Set<string>,
  id: string,
  enabled: boolean,
): boolean {
  const next = new Set(hidden);
  if (enabled) next.delete(id);
  else next.add(id);
  const value = [...next].join(",");
  const existing = rows[0];
  // An empty roster is stored as a tombstone rather than an empty string —
  // app_meta.value is NonEmptyString1000 and "" would be rejected.
  const res =
    existing != null
      ? value === ""
        ? evolu.update("app_meta", { id: existing.id as never, isDeleted: 1 })
        : evolu.update("app_meta", { id: existing.id as never, value: NonEmptyString1000.orThrow(value) })
      : value === ""
        ? { ok: true as const }
        : evolu.insert("app_meta", {
            key: NonEmptyString100.orThrow(PALETTE_OFF_KEY),
            value: NonEmptyString1000.orThrow(value),
          });
  if (!res.ok) console.error("curation: write failed", (res as { error?: unknown }).error);
  return res.ok;
}
