/**
 * THE PINNED ACTION INVENTORY — the palette's ten verbs, as DATA.
 *
 * Split out of Palette.tsx 2026-08-02 (step 10, slice 4) because Settings →
 * Palette curates this roster and must list it without importing the overlay
 * (which drags in Advanced Search, the entry-creation modal and the whole
 * search index). The icons stay in Palette.tsx: they are JSX, only the palette
 * draws them, and a roster of ids/titles is the part two surfaces share.
 *
 * `live: false` = the verb's target step has not landed, so the palette draws
 * it disabled and Settings shows it locked off — curating something that
 * cannot run would be a promise the app can't keep.
 */
export type VerbId =
  | "new-habit" | "new-entry" | "backup" | "test-connection" | "data-checks"
  | "run-import" | "updates" | "theme" | "backups-folder" | "advanced";

export interface VerbMeta {
  id: VerbId;
  title: string;
  meta?: string;
  aliases: string[];
  live: boolean;
  /**
   * The domain an unlanded verb belongs to — shown in its meta INSTEAD of
   * "later" (user-ruled 2026-07-29: "show what it's 'grouped' under").
   */
  group?: string;
}

export const PALETTE_VERBS: VerbMeta[] = [
  // LIVE since step 10 slice 3 — the creator exists, and the palette action is
  // its ruled second door ("+ New habit lives on Settings → Habits only, plus
  // a palette action").
  { id: "new-habit", title: "New habit", aliases: ["habit creator", "create habit"], live: true, group: "Habits" },
  { id: "new-entry", title: "New entry", aliases: ["create entry"], live: true },
  // LIVE since step 12 — runs the one backup pipeline (health row's twin).
  { id: "backup", title: "Back up now", aliases: ["backup"], live: true, group: "Backups" },
  { id: "test-connection", title: "Test connection", meta: "per importer + all", aliases: ["importer test"], live: false, group: "Health" },
  { id: "data-checks", title: "Run data checks", aliases: ["data doctor", "health"], live: false, group: "Health" },
  { id: "run-import", title: "Run import now", meta: "per importer", aliases: ["import"], live: false, group: "Importers" },
  { id: "updates", title: "Check for updates", aliases: ["update"], live: false, group: "Updates" },
  { id: "theme", title: "Switch theme", aliases: ["appearance"], live: false, group: "Appearance" },
  // LIVE since step 12 — reveals the backups root in the file manager.
  { id: "backups-folder", title: "Open backups folder", aliases: ["reveal backups"], live: true, group: "Backups" },
  { id: "advanced", title: "Advanced Search", meta: "filters this palette", aliases: ["search sets", "query"], live: true },
];
