/**
 * CUSTOM habit colours — the 12-slot palette's overflow ([[Color Coding]]:
 * "habit colours pick-from-12, hard-unique, custom-hex overflow (absolute)").
 *
 * Mechanics, marked as such: 43 render sites across the app draw
 * `var(--${colour_slot})` and rewriting them for a raw hex would be a sweep.
 * Instead a custom pick stores `colour_slot = "custom-<habitKey>"` and the hex
 * itself in `app_meta` (`custom_colour:<habitKey>` — SYNCED, a colour is data
 * not device state), and this module publishes `--custom-<habitKey>: <hex>` on
 * the root at launch and on every store change. Every render site then works
 * unchanged, and the hex is ABSOLUTE by construction — a root inline style no
 * theme sheet touches.
 */
import { NonEmptyString100, NonEmptyString1000 } from "@evolu/common";
import { evolu } from "../db/evolu";

export const CUSTOM_PREFIX = "custom_colour:";

export const customSlotName = (habitKey: string): string => `custom-${habitKey}`;

export const isValidHex = (s: string): boolean => /^#[0-9a-fA-F]{6}$/.test(s);

const customColoursQuery = evolu.createQuery((db) =>
  db
    .selectFrom("app_meta")
    .select(["id", "key", "value"])
    .where("key", "like", `${CUSTOM_PREFIX}%` as never)
    .where("isDeleted", "is not", 1),
);

const applied = new Set<string>();

const publish = (rows: readonly { key: unknown; value: unknown }[]): void => {
  const root = document.documentElement;
  const seen = new Set<string>();
  for (const r of rows) {
    const habitKey = String(r.key).slice(CUSTOM_PREFIX.length);
    const hex = String(r.value);
    if (!isValidHex(hex)) continue;
    const varName = `--${customSlotName(habitKey)}`;
    root.style.setProperty(varName, hex);
    seen.add(varName);
    applied.add(varName);
  }
  // A cleared custom colour must stop resolving (the slot pick replaced it).
  for (const varName of applied) {
    if (!seen.has(varName)) {
      root.style.removeProperty(varName);
      applied.delete(varName);
    }
  }
};

/** Launch wiring (main.tsx) — publish now and follow the store. */
export function initCustomColours(): void {
  const pull = () => {
    evolu.loadQuery(customColoursQuery).then(publish, (e) => {
      console.error("customColours: load failed", e);
    });
  };
  pull();
  evolu.subscribeQuery(customColoursQuery)(() => pull());
}

/** Write (or update) a habit's custom hex. Result-checked, like every mutation. */
export const writeCustomColour = async (habitKey: string, hex: string): Promise<boolean> => {
  if (!isValidHex(hex)) return false;
  const rows = await evolu.loadQuery(customColoursQuery);
  const key = `${CUSTOM_PREFIX}${habitKey}`;
  const existing = rows.find((r) => String(r.key) === key);
  const res = existing
    ? evolu.update("app_meta", { id: existing.id as never, value: NonEmptyString1000.orThrow(hex) })
    : evolu.insert("app_meta", {
        key: NonEmptyString100.orThrow(key),
        value: NonEmptyString1000.orThrow(hex),
      });
  if (!res.ok) console.error("customColours: write failed", res.error);
  else publish(await evolu.loadQuery(customColoursQuery));
  return res.ok;
};
