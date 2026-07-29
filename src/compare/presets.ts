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

const KEY_PREFIX = "cs_preset:";

/** The stored (partial, verbatim) form — any subset of the four steps. */
export interface PresetCfg {
  scopes?: { habitKey: string; split?: { field: string; values: string[] } | null }[];
  measure?: MeasurePick | null;
  windows?: WindowCfg[];
  chart?: ChartKind | null;
  tiles?: boolean;
}

export interface Preset {
  id: string; // the app_meta row id
  name: string;
  cfg: PresetCfg;
}

const presetsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("app_meta")
    .select(["id", "key", "value", "createdAt"])
    .where("isDeleted", "is not", 1)
    .orderBy("createdAt"),
);

export function usePresets(): Preset[] {
  const rows = useQuery(presetsQuery);
  return useMemo(() => {
    const out: Preset[] = [];
    for (const r of rows) {
      if (r.key == null || !(r.key as string).startsWith(KEY_PREFIX) || r.value == null) continue;
      try {
        const parsed = JSON.parse(r.value as string) as { name?: unknown; cfg?: unknown };
        if (typeof parsed.name !== "string") continue;
        out.push({ id: r.id, name: parsed.name, cfg: (parsed.cfg ?? {}) as PresetCfg });
      } catch {
        // an unreadable row is skipped, never fatal
      }
    }
    return out;
  }, [rows]);
}

/** Evolu mutations fail SILENTLY — check every Result (the 2026-07-23 lesson). */
export function savePreset(name: string, cfg: PresetCfg): boolean {
  const json = JSON.stringify({ name, cfg });
  if (json.length > 1000) {
    showErrorToast("Preset too large to save — trim the configuration.");
    return false;
  }
  const id = Math.random().toString(36).slice(2, 10);
  const res = evolu.insert("app_meta", {
    key: NonEmptyString100.orThrow(`${KEY_PREFIX}${id}`),
    value: NonEmptyString1000.orThrow(json),
  });
  if (!res.ok) {
    console.error("cs_presets: save failed", res.error);
    showErrorToast("Saving the preset failed.");
    return false;
  }
  return true;
}

export function renamePreset(preset: Preset, name: string): boolean {
  const json = JSON.stringify({ name, cfg: preset.cfg });
  if (json.length > 1000) return false;
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

export function deletePreset(preset: Preset): boolean {
  const res = evolu.update("app_meta", { id: preset.id as never, isDeleted: 1 });
  if (!res.ok) {
    console.error("cs_presets: delete failed", res.error);
    showErrorToast("Deleting the preset failed.");
    return false;
  }
  return true;
}
