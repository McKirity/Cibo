/**
 * DATA DOCTOR — the mute list (Build step 13).
 *
 * [[Data Doctor (Reduced)]] § Carried mechanics, the one genuinely portable
 * piece of the old plugin's design: "per-finding mute, **re-keyed from
 * `check::file::field` to `check::row-id::field`**, with a restorable
 * **Ignored** list. Mutes are stored **via the settings mechanism** (synced) —
 * no schema change; the locked keystone is untouched."
 *
 * Synced rather than per-device on purpose: a mute is a JUDGEMENT about the
 * data ("this fanfic has no cover and never will"), and the data travels. The
 * error log next door is the opposite case and stays local.
 *
 * STORAGE: one `app_meta` row per mute, key `dd_mute:<check>::<row-id>::<field>`
 * — the `cs_preset:<id>` shape exactly (src/compare/presets.ts, the precedent).
 * Recorded as an implementation choice, not a ruling: a single JSON row would
 * have been tidier but `app_meta.value` caps at 1000 characters, which is about
 * twenty mutes — a ceiling a user could actually hit, and hitting it would fail
 * silently. One row per mute has no ceiling.
 *
 * The value is the ISO day it was muted, so the Ignored list can say when.
 */
import { NonEmptyString100, NonEmptyString1000 } from "@evolu/common";
import { evolu } from "./evolu";

import { todayLocal } from "../metrics/clock";
const PREFIX = "dd_mute:";
/** `app_meta.key` is NonEmptyString100; leave room for the prefix. */
const KEY_MAX = 92;

/** djb2 — only ever used to shorten an over-long row id (a file path). */
const shortHash = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

/**
 * The ruled key shape. `field` names WHICH column of the row is at fault, so
 * two different complaints about one entry mute independently.
 */
export const muteKey = (check: string, rowId: string, field: string): string => {
  const full = `${check}::${rowId}::${field}`;
  return full.length <= KEY_MAX ? full : `${check}::#${shortHash(rowId)}::${field}`;
};

export interface MutedFinding {
  /** The row id in `app_meta`, for the un-mute write. */
  id: string;
  key: string;
  check: string;
  since: string;
}

const mutesQuery = evolu.createQuery((db) =>
  db
    .selectFrom("app_meta")
    .select(["id", "key", "value"])
    .where("key", "like", `${PREFIX}%` as never)
    .where("isDeleted", "is not", 1),
);

/** The live query, for the Ignored list's own rendering. */
export const doctorMutesQuery = mutesQuery;

export const decodeMutes = (rows: readonly { id: unknown; key: unknown; value: unknown }[]): MutedFinding[] =>
  rows.flatMap((r) => {
    const k = String(r.key ?? "");
    // SQLite LIKE narrows; this is the exact test (the presets precedent).
    if (!k.startsWith(PREFIX)) return [];
    const key = k.slice(PREFIX.length);
    return [{ id: String(r.id), key, check: key.split("::")[0] ?? "", since: String(r.value ?? "") }];
  });

/** Every muted key, for the runner's filter. */
export const loadMutes = async (): Promise<Set<string>> =>
  new Set(decodeMutes(await evolu.loadQuery(mutesQuery)).map((m) => m.key));

export function muteFinding(key: string): boolean {
  const res = evolu.insert("app_meta", {
    key: NonEmptyString100.orThrow(`${PREFIX}${key}`),
    value: NonEmptyString1000.orThrow(todayLocal()),
  });
  if (!res.ok) console.error("doctor: mute failed", res.error);
  return res.ok;
}

/** Restore an ignored finding — the ruled "restorable Ignored list". */
export function unmuteFinding(rowId: string): boolean {
  const res = evolu.update("app_meta", { id: rowId as never, isDeleted: 1 });
  if (!res.ok) console.error("doctor: un-mute failed", res.error);
  return res.ok;
}
