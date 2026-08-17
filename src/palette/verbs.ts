/**
 * THE PINNED ACTION INVENTORY — the palette's TEN verbs, as DATA. It was ten
 * until 2026-08-04 (when "Run import now" was removed — the note below), nine
 * from then, and ten again since 2026-08-09 (the themes-folder door, user-ruled).
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
  | "updates" | "theme" | "backups-folder" | "themes-folder" | "advanced";

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
  // LIVE 2026-08-04 (the completeness audit's re-wire batch) — lands on the
  // health home and every importer row runs its probe (the ruled "per importer
  // + test all", delivered as test-all; per-importer stays the rows' buttons).
  { id: "test-connection", title: "Test connection", meta: "per importer + all", aliases: ["importer test"], live: true, group: "Health" },
  // LIVE 2026-08-04 — the ruled form exactly: "triggers the Data Doctor scan
  // WITHOUT navigating to Settings → Health". Full pass (fs tier included),
  // feeds the rail dot, reports through the info toast.
  { id: "data-checks", title: "Run data checks", aliases: ["data doctor", "health"], live: true, group: "Health" },
  // "Run import now" was REMOVED 2026-08-04 (user-ruled at the completeness
  // audit: "Remove that, that's pretty outdated now") — its ruled behaviour
  // (a headless per-importer fetch) described machinery the explicit-submit
  // importers never grew, and the library's Import door is the real path.
  // The pinned inventory is NINE since.
  // LIVE 2026-08-16 — Phase 2 step 5, the updater wiring. The LAST dormant
  // verb: the palette's inventory is fully live for the first time.
  { id: "updates", title: "Check for updates", aliases: ["update"], live: true, group: "Updates" },
  // LIVE 2026-08-04 — the swap's door: Settings → Appearance owns the pick.
  { id: "theme", title: "Switch theme", aliases: ["appearance"], live: true, group: "Appearance" },
  // LIVE since step 12 — reveals the backups root in the file manager.
  { id: "backups-folder", title: "Open backups folder", aliases: ["reveal backups"], live: true, group: "Backups" },
  // ADDED 2026-08-09, user-ruled — the inventory goes NINE → TEN. The twin of
  // the backups door for the other folder the user actually puts things into:
  // a theme is installed by dropping a folder in, so this is the shortcut to
  // the one place that lifecycle happens. Settings → Appearance carries the
  // same door; both call theme/loader.ts's openThemesFolder, which owns the
  // create-if-absent and the messaging (the probe-1 callee rule).
  { id: "themes-folder", title: "Open themes folder", aliases: ["reveal themes", "drop in theme"], live: true, group: "Appearance" },
  { id: "advanced", title: "Advanced Search", meta: "filters this palette", aliases: ["search sets", "query"], live: true },
];
