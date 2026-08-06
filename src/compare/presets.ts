/**
 * kit-menu-preset's STORAGE — named partial configurations, stored VERBATIM
 * and synced (they ride `app_meta`, the synced key-value store; a preset
 * encodes a question, not device state — the ruled home, no schema change).
 *
 * One row PER preset (`cs_preset:<id>`): `app_meta.value` is capped at 1000
 * chars, which one preset never approaches but a combined roster could.
 * Rename edits the row's JSON; delete rides `isDeleted`. Relative windows are
 * stored as their MODE (`rel 30`), so they roll forward by construction;
 * absolute ones stay pinned — no staleness rule needed.
 *
 * Scopes store the habit KEY (stable, seed-canonical) rather than the row id,
 * so a preset written on one device resolves on the other.
 */
import { useMemo } from "react";
import { useQuery } from "@evolu/react";
import { NonEmptyString100, NonEmptyString1000 } from "@evolu/common";
import { evolu } from "../db/evolu";
import { showErrorToast } from "../shell/toast";
import type { ChartKind, MeasurePick, WindowCfg } from "./compareSpec";

/**
 * CS's own prefix stays the default everywhere, so the first consumer's call
 * sites are unchanged; Advanced Search passes `as_preset:` (the ruled mirror —
 * same mechanism, its own roster).
 */
/** The two preset rosters' `app_meta` key prefixes — EXPORTED 2026-08-04 so
 *  nothing spells them as bare literals (Settings → Presets did, for both). */
export const CS_PREFIX = "cs_preset:";
export const AS_PREFIX = "as_preset:";
const KEY_PREFIX = CS_PREFIX;

/** The stored (partial, verbatim) form — any subset of the four steps. */
export interface PresetCfg {
  scopes?: { habitKey: string; split?: { field: string; values: string[] } | null }[];
  measure?: MeasurePick | null;
  windows?: WindowCfg[];
  chart?: ChartKind | null;
  tiles?: boolean;
}

export interface Preset<C = PresetCfg> {
  id: string; // the app_meta row id
  name: string;
  cfg: C;
}

/**
 * One query PER PREFIX, narrowed in SQL — subscribing to ALL of app_meta made
 * every unrelated meta write (autosave_minutes, app_start…) re-fire the
 * preset menus (2026-07-30). Queries are cached module-side so a prefix's
 * query object is created once (a fresh object per render would re-subscribe).
 * SQLite LIKE is the narrowing only — the JS startsWith below stays the exact
 * authority (LIKE's `_` wildcard and ASCII case-folding are looser).
 */
const presetQueryByPrefix = new Map<string, ReturnType<typeof buildPresetsQuery>>();
const buildPresetsQuery = (prefix: string) =>
  evolu.createQuery((db) =>
    db
      .selectFrom("app_meta")
      .select(["id", "key", "value", "createdAt"])
      .where("isDeleted", "is not", 1)
      .where("key", "like", `${prefix}%` as never)
      .orderBy("createdAt"),
  );
const presetsQueryFor = (prefix: string) => {
  let q = presetQueryByPrefix.get(prefix);
  if (q == null) {
    q = buildPresetsQuery(prefix);
    presetQueryByPrefix.set(prefix, q);
  }
  return q;
};

export function usePresets<C = PresetCfg>(prefix: string = KEY_PREFIX): Preset<C>[] {
  const rows = useQuery(presetsQueryFor(prefix));
  return useMemo(() => {
    const out: Preset<C>[] = [];
    for (const r of rows) {
      if (r.key == null || !(r.key as string).startsWith(prefix) || r.value == null) continue;
      try {
        const parsed = JSON.parse(r.value as string) as { name?: unknown; cfg?: unknown };
        if (typeof parsed.name !== "string") continue;
        out.push({ id: r.id, name: parsed.name, cfg: (parsed.cfg ?? {}) as C });
      } catch {
        // an unreadable row is skipped, never fatal
      }
    }
    return out;
  }, [rows, prefix]);
}

/** Evolu mutations fail SILENTLY — check every Result (the 2026-07-23 lesson). */
export function savePreset(name: string, cfg: unknown, prefix: string = KEY_PREFIX): boolean {
  const json = JSON.stringify({ name, cfg });
  if (json.length > 1000) {
    showErrorToast("Preset too large to save — trim the configuration.");
    return false;
  }
  const id = Math.random().toString(36).slice(2, 10);
  const res = evolu.insert("app_meta", {
    key: NonEmptyString100.orThrow(`${prefix}${id}`),
    value: NonEmptyString1000.orThrow(json),
  });
  if (!res.ok) {
    console.error("cs_presets: save failed", res.error);
    showErrorToast("Saving the preset failed.");
    return false;
  }
  return true;
}

export function renamePreset(preset: Preset<unknown>, name: string): boolean {
  const json = JSON.stringify({ name, cfg: preset.cfg });
  if (json.length > 1000) {
    // the same surface savePreset's cap wears — a silent false read as success (2026-07-30)
    showErrorToast("Preset too large to save — use a shorter name.");
    return false;
  }
  const res = evolu.update("app_meta", {
    id: preset.id as never,
    value: NonEmptyString1000.orThrow(json),
  });
  if (!res.ok) {
    console.error("cs_presets: rename failed", res.error);
    showErrorToast("Renaming the preset failed.");
    return false;
  }
  return true;
}

export function deletePreset(preset: Preset<unknown>): boolean {
  const res = evolu.update("app_meta", { id: preset.id as never, isDeleted: 1 });
  if (!res.ok) {
    console.error("cs_presets: delete failed", res.error);
    showErrorToast("Deleting the preset failed.");
    return false;
  }
  return true;
}
