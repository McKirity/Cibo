/**
 * kit-palette — the Ctrl+K COMMAND LAYER, translated from the frozen
 * `Final/palette.html` (stage-6 extension; kit-shell-overlay tenant at
 * `--modal-confirm-w`, top-third placement, zero block-own dials).
 *
 * Two roles, one boundary ([[Palette]]): TELEPORT (places — entries · habits ·
 * screens · periods via the route grammar) and ACTIONS (the pinned, CLOSED
 * ten-verb inventory — additions only against real friction, never here; the
 * themes-folder door on 2026-08-09 was exactly that case, taking it nine → ten).
 * Ranking is deterministic, no cleverness, ever (paletteSpec). Never a route;
 * Esc closes; one overlay at a time; also summoned by the rail's Search entry
 * (the recorded overlay exception).
 *
 * Four live states: at-rest — RESTRUCTURED 2026-07-29 (user-ruled, in-canvas
 * at the palette exhibit; a knowing delta over the FINAL's verb-inventory
 * face): RECENT nouns lead (the visit ledger ALONE, recents.ts — the
 * logging-recency merge was removed the same day, second pass), the
 * commands follow as ONE flat ALPHABETICAL list with the last-used verb
 * lifted, and Advanced Search moved to the WELL as a search escalation ·
 * mid-typing (grouped ranked results) · the period-grammar teleport
 * (periodGrammar; a period match fans out to its owning ladder) · unmatched —
 * a stated miss and NOTHING ELSE (user-ruled 2026-07-29: "if something
 * doesn't exist, then it doesn't exist — it's not the search's job to make
 * it"; the drawn state 4's quick-create handoff is STRUCK, overriding the
 * FINAL and [[Search & Quick-Find]]'s quick-create clause). Entry creation
 * survives in the palette only as the New-entry VERB (habit pick → the frozen
 * creation modal — cited, reused, never redrawn).
 *
 * The fifth face — the ADVANCED SEARCH MORPH — was never drawn (Build-side by
 * standing ruling); AdvancedSearch.tsx owns it. The morph replaces this face
 * in place: one overlay, two states, no separate screen, no route.
 *
 * A verb whose target hasn't landed renders DISABLED with its GROUP name in
 * the meta — the nav rail's disabled-Tools precedent. NONE left since
 * 2026-08-16: Check for updates went live at step 5's updater wiring (the
 * backup pair went with step 12); the mechanism stays for any future verb.
 * A verb hidden by Settings → Palette curation is
 * ABSENT, never greyed. (The Map row joined 2026-07-30 when the Map landed;
 * the Settings-sections + manual-pages tier joined 2026-08-03 with the manual
 * reader — the last absent teleport group.)
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EntryCreationModal } from "../library/EntryCreationModal";
import { HabitIcon, hasIcon } from "../shell/habitIcons";
import { AdvancedSearch } from "./AdvancedSearch";
import { useOverlayEsc } from "../shell/overlayHooks";
import { rankPalette, type PalIndexItem, type RankedGroup } from "./paletteSpec";
import { PALETTE_VERBS, type VerbId, type VerbMeta } from "./verbs";
import { verbHidden } from "../settings/curation";
import { SECTIONS, sectionsHere } from "../settings/SettingsScreen";
import { MANUAL_GROUPS } from "../settings/manualContent";
import { Ico } from "../shell/icons";
import { showErrorToast, showInfoToast } from "../shell/toast";
import { backupsRunHere, getBackupsRoot, revealBackupsFolder, runBackup } from "../backup/backup";
import { checkUpdatesNow } from "../shell/updater";
import { openThemesFolder } from "../theme/loader";
import { publishDoctor, runDoctor } from "../db/doctor";
import { requestProbeAll } from "../shell/navRequest";
import type { SettingsSection } from "../shell/views";
import { parsePeriods, type PeriodScale, type PlaceMatch } from "./periodGrammar";
import { readLastVerb, recordLastVerb } from "./recents";
import { useSearchData } from "./useSearchData";
import "./palette.css";

export interface PaletteNav {
  openDay(day: string): void;
  openHabit(key: string): void;
  openLibrary(habitKey: string): void;
  openEntry(id: string, habitKey: string): void;
  openCadence(scale: PeriodScale, anchor: string): void;
  openCompare(): void;
  openTimers(): void;
  openMap(): void;
  /** Settings → Habits with the creator open (the New habit verb). */
  openHabitCreator(): void;
  /** A settings section — the Settings & manual teleport tier (joined 2026-08-03). */
  openSettings(section: SettingsSection): void;
  /** A manual page — Settings → Help with that article open. */
  openManual(articleId: string): void;
}

// ── The pinned TEN-verb inventory (CLOSED — [[Palette]]; never re-litigate) ──

type PalAction =
  | { t: "habit"; key: string }
  | { t: "library"; key: string }
  | { t: "entry"; id: string; habitKey: string }
  | { t: "screen"; s: "daily" | "timers" | "compare" | "map" }
  | { t: "verb"; v: VerbId; live: boolean }
  | { t: "setting"; section: SettingsSection }
  | { t: "manual"; id: string };

// Icons transcribed from the frozen FINAL's rows (lucide, 24×24 stroke).
const I = {
  mag: (
    <svg className="ico pal-mag" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
  ),
  plus: <svg className="ico" viewBox="0 0 24 24"><path d="M5 12h14" /><path d="M12 5v14" /></svg>,
  newEntry: (
    <svg className="ico" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M8 12h8" /><path d="M12 8v8" /></svg>
  ),
  backup: (
    <svg className="ico" viewBox="0 0 24 24"><line x1="22" x2="2" y1="12" y2="12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /><line x1="6" x2="6.01" y1="16" y2="16" /><line x1="10" x2="10.01" y1="16" y2="16" /></svg>
  ),
  test: (
    <svg className="ico" viewBox="0 0 24 24"><path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" /></svg>
  ),
  checks: <svg className="ico" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>,
  imp: (
    <svg className="ico" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
  ),
  upd: (
    <svg className="ico" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></svg>
  ),
  theme: (
    <svg className="ico" viewBox="0 0 24 24"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></svg>
  ),
  folder: (
    <svg className="ico" viewBox="0 0 24 24"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>
  ),
  adv: (
    <svg className="ico" viewBox="0 0 24 24"><line x1="21" x2="14" y1="4" y2="4" /><line x1="10" x2="3" y1="4" y2="4" /><line x1="21" x2="12" y1="12" y2="12" /><line x1="8" x2="3" y1="12" y2="12" /><line x1="21" x2="16" y1="20" y2="20" /><line x1="12" x2="3" y1="20" y2="20" /><line x1="14" x2="14" y1="2" y2="6" /><line x1="8" x2="8" y1="10" y2="14" /><line x1="16" x2="16" y1="18" y2="22" /></svg>
  ),
  cal: (
    <svg className="ico" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>
  ),
  screen: (
    <svg className="ico" viewBox="0 0 24 24"><rect width="20" height="14" x="2" y="3" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" /></svg>
  ),
  timer: (
    <svg className="ico" viewBox="0 0 24 24"><path d="M10 2h4" /><path d="M12 14l3-3" /><path d="M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" /></svg>
  ),
  chart: (
    <svg className="ico" viewBox="0 0 24 24"><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>
  ),
  map: (
    <svg className="ico" viewBox="0 0 24 24"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 21.381V8.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" /><path d="M15 5.764v15" /><path d="M9 3.236v15" /></svg>
  ),
  book: (
    <svg className="ico" viewBox="0 0 24 24"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
  ),
  sun: (
    <svg className="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>
  ),
};

/** The roster moved to ./verbs 2026-08-02 (step 10, slice 4) so Settings →
 *  Palette can curate it without importing this overlay. Icons stay here —
 *  they are JSX and only the palette draws them. */
interface Verb extends VerbMeta {
  icon: ReactNode;
}

const VERB_ICON: Record<VerbId, ReactNode> = {
  "new-habit": I.plus,
  "new-entry": I.newEntry,
  backup: I.backup,
  "test-connection": I.test,
  "data-checks": I.checks,
  updates: I.upd,
  theme: I.theme,
  "backups-folder": I.folder,
  "themes-folder": I.folder,
  advanced: I.adv,
};

/** Curated: a verb the user switched off in Settings is ABSENT, never greyed
 *  ([[Palette]] — "disabling hides, never deletes"). */
const VERBS: Verb[] = PALETTE_VERBS.filter((v) => !verbHidden(v.id)).map((v) => ({
  ...v,
  icon: VERB_ICON[v.id],
}));

// ── Row descriptors (one flat keyboard order over whatever the body draws) ───

/** ONE row-key derivation — the rows memo and GroupedBody must agree on it. */
const rowKeyFor = (group: string, it: { title: string; action: unknown }): string =>
  `${group}-${it.title}-${(it.action as { id?: string }).id ?? ""}`;

interface Row {
  key: string;
  selectable: boolean;
  fire: () => void;
  node: (sel: boolean, onHover: () => void) => ReactNode;
}

export function PaletteOverlay({
  today,
  nav,
  onClose,
}: {
  today: string;
  nav: PaletteNav;
  onClose: () => void;
}) {
  const data = useSearchData();
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [mode, setMode] = useState<
    | { m: "palette" }
    | { m: "advanced" }
    | { m: "create"; habitKey: string }
  >({ m: "palette" });
  const inputRef = useRef<HTMLInputElement>(null);

  const close = onClose;
  const go = useCallback(
    (fn: () => void) => {
      close();
      fn();
    },
    [close],
  );

  // ── The searchable index ───────────────────────────────────────────────────
  const index = useMemo<PalIndexItem<PalAction>[]>(() => {
    const items: PalIndexItem<PalAction>[] = [];
    for (const h of data.habits) {
      if (h.key == null) continue; // keyless custom habits aren't routable yet (shell parity)
      items.push({
        group: "habits",
        title: h.name,
        sub: h.subType != null ? `${h.subType} · project` : h.kind,
        recency: data.habitRecency.get(h.id) ?? null,
        action: { t: "habit", key: h.key },
      });
      if (h.kind === "project" && h.subType === "consumption") {
        items.push({
          group: "habits",
          title: `${h.name} — Library`,
          sub: "catalog",
          aliases: ["library"],
          recency: data.habitRecency.get(h.id) ?? null,
          action: { t: "library", key: h.key },
        });
      }
    }
    items.push(
      { group: "screens", title: "Today", sub: "daily", aliases: ["daily", "home"], action: { t: "screen", s: "daily" } },
      { group: "screens", title: "Timers", sub: "screen", action: { t: "screen", s: "timers" } },
      {
        group: "screens",
        title: "Comparing Statistics",
        sub: "screen",
        aliases: ["statistics", "compare"],
        action: { t: "screen", s: "compare" },
      },
      // joined 2026-07-30 when the Map landed (the flagged stand-in closed)
      {
        group: "screens",
        title: "Map",
        sub: "screen",
        aliases: ["table of contents", "browse"],
        action: { t: "screen", s: "map" },
      },
    );
    for (const v of VERBS) {
      // No backup doors on the Mac (PC-only backups, user-ruled 2026-08-16 —
      // "no actual door"): both verbs are ABSENT there, like a curated-off
      // verb, never greyed. The machinery behind them stays whole.
      if (!backupsRunHere() && (v.id === "backup" || v.id === "backups-folder")) continue;
      items.push({
        group: "actions",
        title: v.title,
        aliases: v.aliases,
        action: { t: "verb", v: v.id, live: v.live },
      });
    }
    const habitById = new Map(data.habits.map((h) => [h.id, h]));
    for (const e of data.entries) {
      const h = habitById.get(e.habitId);
      if (h?.key == null) continue;
      items.push({
        group: "entries",
        title: e.title,
        sub: h.name,
        recency: data.entryRecency.get(e.id) ?? null,
        action: { t: "entry", id: e.id, habitKey: h.key },
      });
    }
    // The Settings & manual tier — the last absent teleport group, joined
    // 2026-08-03 when the manual reader landed ("every article is a place").
    // sectionsHere, not SECTIONS: the Mac lists no Backups section (no door).
    for (const s of sectionsHere()) {
      items.push({
        group: "settings",
        title: s.name,
        sub: "settings",
        aliases: ["settings"],
        action: { t: "setting", section: s.key },
      });
    }
    for (const g of MANUAL_GROUPS) {
      for (const a of g.articles) {
        items.push({
          group: "settings",
          title: a.title,
          sub: "manual page",
          aliases: ["manual", "help"],
          action: { t: "manual", id: a.id },
        });
      }
    }
    return items;
  }, [data]);

  const periods = useMemo<PlaceMatch[]>(() => parsePeriods(query, today), [query, today]);
  const groups = useMemo<RankedGroup<PalAction>[]>(
    () => (query.trim() === "" ? [] : rankPalette(query, index)),
    [query, index],
  );
  const empty = query.trim() !== "" && groups.length === 0 && periods.length === 0;

  const fireAction = useCallback(
    (a: PalAction) => {
      if (a.t === "habit") return go(() => nav.openHabit(a.key));
      if (a.t === "library") return go(() => nav.openLibrary(a.key));
      if (a.t === "entry") return go(() => nav.openEntry(a.id, a.habitKey));
      if (a.t === "screen") {
        if (a.s === "daily") return go(() => nav.openDay(today));
        if (a.s === "timers") return go(() => nav.openTimers());
        if (a.s === "map") return go(() => nav.openMap());
        return go(() => nav.openCompare());
      }
      if (a.t === "setting") return go(() => nav.openSettings(a.section));
      if (a.t === "manual") return go(() => nav.openManual(a.id));
      // verbs — a fired verb becomes the alphabetical list's one lifted row
      if (!a.live) return;
      recordLastVerb(a.v);
      if (a.v === "advanced") return setMode({ m: "advanced" });
      // The creator's ruled SECOND door ("+ New habit lives on Settings →
      // Habits only, plus a palette action") — live since step 10 slice 3.
      if (a.v === "new-habit") return go(() => nav.openHabitCreator());
      // Step 12's pair — same pipeline as the health row / Backups pane.
      // (On the Mac neither verb is listed at all — the no-door ruling — and
      // runBackup refuses every reason there regardless, the callee rule.)
      if (a.v === "backup") return go(() => void runBackup("manual"));
      // LIVE 2026-08-16 (step 5) — the last dormant verb. The loud door on a
      // silent machine: launch checks never toast, this one always answers.
      if (a.v === "updates") return go(() => void checkUpdatesNow());
      if (a.v === "backups-folder")
        return go(() => {
          if (getBackupsRoot() == null)
            showErrorToast("No backups folder set — pick one in Settings → Backups.", "Backups");
          else void revealBackupsFolder();
        });
      // Its twin, added 2026-08-09 — the other folder the user puts things
      // INTO. No null-check or toast here on purpose: openThemesFolder owns
      // both (and the create-if-absent), so this door and Settings → Appearance
      // cannot drift apart. The backups verb above keeps its inline check
      // because revealBackupsFolder is the thinner shape with one caller.
      if (a.v === "themes-folder") return go(() => void openThemesFolder());
      // The Health pair + the theme door — live 2026-08-04 (the completeness
      // audit's re-wire batch; each verb's ruled form is quoted in verbs.ts).
      if (a.v === "data-checks")
        return go(() => {
          // Ruled: "triggers the scan WITHOUT navigating to Settings → Health".
          // Full pass (fs tier included), feeds the rail dot, and SAYS what it
          // found — a silent scan reads as a dead action (the no-words lesson).
          void runDoctor({ withFs: true }).then(
            (r) => {
              publishDoctor(r);
              const n = r.checks.reduce((sum, c) => sum + c.findings.length, 0);
              showInfoToast(
                n === 0
                  ? "Data checks ran — nothing to flag."
                  : `Data checks: ${n} finding${n === 1 ? "" : "s"}${
                      r.errors > 0 ? ` (${r.errors} error${r.errors === 1 ? "" : "s"})` : ""
                    } — see Settings → Health.`,
              );
            },
            (e) => showErrorToast(`Data checks failed — ${String(e)}`, "Data Doctor"),
          );
        });
      if (a.v === "test-connection")
        return go(() => {
          // "per importer + test all", delivered as test-all: land on the
          // health home and every importer row runs its probe (one-shot).
          requestProbeAll();
          nav.openSettings("health");
        });
      if (a.v === "theme") return go(() => nav.openSettings("appearance"));
      if (a.v === "new-entry") {
        // the verb path: no unmatched title to carry — straight to the pick
        setQuery("");
        setSel(0);
        setPicking(true);
      }
    },
    [go, nav, today],
  );

  const firePlace = useCallback(
    (p: PlaceMatch) => {
      if (p.kind === "day") return go(() => nav.openDay(p.day));
      return go(() => nav.openCadence(p.scale, p.anchor));
    },
    [go, nav],
  );

  // "New entry" without an unmatched title still needs the habit-pick step.
  const [picking, setPicking] = useState(false);
  const projectHabits = useMemo(() => data.habits.filter((h) => h.kind === "project" && h.key != null), [data.habits]);
  const entryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of data.entries) m.set(e.habitId, (m.get(e.habitId) ?? 0) + 1);
    return m;
  }, [data.entries]);

  const [lastVerb] = useState(readLastVerb);

  // ── Row list (render order = keyboard order) ──────────────────────────────
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const palRow = (
      key: string,
      lead: ReactNode,
      title: string,
      opts: { sub?: string; meta?: ReactNode; disabled?: boolean; fire?: () => void },
    ): Row => ({
      key,
      selectable: !opts.disabled,
      fire: opts.fire ?? (() => undefined),
      node: (isSel, onHover) => (
        <button
          key={key}
          className={`pal-row${isSel ? " sel" : ""}${opts.disabled ? " off" : ""}`}
          onMouseEnter={opts.disabled ? undefined : onHover}
          onClick={opts.disabled ? undefined : opts.fire}
          disabled={opts.disabled}
        >
          {lead}
          <span className="pal-txt">
            <span className="pal-title">{title}</span>
            {opts.sub != null && <span className="pal-sub">{opts.sub}</span>}
          </span>
          <span className="pal-meta">
            {opts.meta}
            {isSel && !opts.disabled && <span className="pal-enter">↵ Open</span>}
          </span>
        </button>
      ),
    });

    const verbLead = (v: Verb) => <span className="pal-lead">{v.icon}</span>;
    const habitLead = (colourSlot: string, icon: string | null, name: string) => (
      <span className="pal-lead sw" style={{ background: `var(--${colourSlot})` }}>
        {hasIcon(icon) ? <HabitIcon icon={icon} /> : <span className="pal-letter">{name[0] ?? "?"}</span>}
      </span>
    );
    // The hue handoff (2026-08-03) — `--pal-hue` rather than an inline
    // background, so a theme's rules can restyle the dot (Blame! turns it into
    // an indicator lens). Render-identical by default. See shell.css § the hue
    // handoff for the pattern and its reasoning.
    const dotLead = (colourVar: string) => (
      <span className="pal-lead">
        <span className="pal-dot" style={{ ["--pal-hue" as string]: `var(${colourVar})` }} />
      </span>
    );
    const habitByKey = new Map(data.habits.filter((h) => h.key != null).map((h) => [h.key as string, h]));
    // LEAD RULING (user-ruled 2026-07-29): an ENTRY wears its owning habit's
    // GLYPH tinted in the habit colour — the dot survives only on days/periods.
    const entryLead = (h: (typeof data.habits)[number] | undefined) =>
      h != null && hasIcon(h.icon) ? (
        <span className="pal-lead" style={{ color: `var(--${h.colourSlot})` }}>
          <HabitIcon icon={h.icon} />
        </span>
      ) : (
        dotLead(`--${h?.colourSlot ?? "accent"}`)
      );

    if (picking) {
      // The New-entry VERB's habit-pick step — the one creation path left in
      // the palette. QUICK-CREATE FROM AN UNMATCHED QUERY IS REMOVED
      // (user-ruled 2026-07-29: "if something doesn't exist, then it doesn't
      // exist — it's not the search's job to make it"); an unmatched query
      // now states the miss and offers nothing.
      for (const h of projectHabits) {
        const count = entryCounts.get(h.id) ?? 0;
        out.push(
          palRow(
            `pick-${h.id}`,
            habitLead(h.colourSlot, h.icon, h.name),
            h.name,
            {
              sub: `${count} ${count === 1 ? "entry" : "entries"}`,
              fire: () => setMode({ m: "create", habitKey: h.key as string }),
            },
          ),
        );
      }
      return out;
    }

    if (query.trim() === "") {
      // STATE 1 — at rest. THE COMMANDS ARE THE WHOLE FACE (user-ruled
      // 2026-08-15: *"remove the most recent section. When I open the palette, I
      // found that I want to go straight to actions"* — both canvases).
      //
      // This SUPERSEDES the 2026-07-29 restructure, which had put a Recent group
      // of visited nouns above the verbs so that ↵ opened a THING by default and
      // typing read as filtering. The nouns are still reachable in one keystroke
      // — they are what typing searches — so what the group actually cost was the
      // top of the list, every summon, to a guess about where you were going.
      // ⚠ It also carried the FINAL's own rest face BACK, which was a verb
      // inventory; the 2026-07-29 note called itself "a knowing delta over the
      // FINAL" and this returns to it rather than inventing a third shape.
      //
      // ⚠ ONE THING WENT WITH IT, surfaced rather than quietly absorbed: the
      // period grammar ("Q3", "week 31") had no hint anywhere else. The FINAL's
      // prose hint was CUT on 2026-07-29 *because* Recent's period row taught it
      // by example, and with the group gone nothing teaches it. Flagged to the
      // user the day this landed; the manual still documents it.
      // THE COMMANDS (user-ruled 2026-07-29): ONE flat list, ALPHABETICAL,
      // with the LAST-TOUCHED live verb lifted to the top — marked in the
      // tier slot ("last used"), never with a second header. Advanced Search
      // is NOT here: it moved to the well as a search escalation. Curation
      // (hide, never disable) stays step 10.
      const restVerbs = [...VERBS]
        .filter((v) => v.id !== "advanced")
        // ⚠ THE BACKUP FILTER BELONGS HERE TOO, AND DID NOT (found 2026-08-19,
        // the Mac visual sweep). The guard at the search index above has been
        // right since 2026-08-16, so typing "back" correctly returns nothing —
        // but STATE 1 is a second, independent list, and it was still offering
        // "Back up now" and "Open backups folder" on macOS. That is the state
        // you see the instant you press the hotkey, i.e. the one a person
        // actually meets, against a ruling whose words were *"no actual door"*.
        // The door was also inert: runBackup refuses on macOS by the callee
        // rule and writes no record and no toast, so clicking it did nothing at
        // all, silently.
        // ⚠ Two lists, one behaviour — the drift this codebase keeps naming.
        // Both now read the same test; a third list must read it as well.
        .filter((v) => backupsRunHere() || (v.id !== "backup" && v.id !== "backups-folder"))
        .sort((a, b) => a.title.localeCompare(b.title));
      const lifted = lastVerb != null ? restVerbs.find((v) => v.id === lastVerb && v.live) : undefined;
      const ordered = lifted != null ? [lifted, ...restVerbs.filter((v) => v !== lifted)] : restVerbs;
      for (const v of ordered) {
        out.push(
          palRow(`verb-${v.id}`, verbLead(v), v.title, {
            meta: (
              <>
                {v.live ? v.meta : [v.meta, v.group].filter(Boolean).join(" · ")}
                {v === lifted && <span className="pal-tier">last used</span>}
              </>
            ),
            disabled: !v.live,
            fire: () => fireAction({ t: "verb", v: v.id, live: v.live }),
          }),
        );
      }
      return out;
    }

    // STATES 2 + 3 — ranked groups, period places folded into Screens & periods
    const verbsById = new Map(VERBS.map((v) => [v.id, v]));
    for (const g of groups) {
      if (g.group === "screens" && periods.length > 0) continue; // drawn: periods own the group
      for (const it of g.items) {
        const a = it.action;
        const lead =
          a.t === "habit" || a.t === "library"
            ? (() => {
                const h = habitByKey.get(a.key);
                return h != null ? habitLead(h.colourSlot, h.icon, h.name) : dotLead("--accent");
              })()
            : a.t === "entry"
              ? entryLead(habitByKey.get(a.habitKey))
              : a.t === "screen"
                ? (
                    <span className="pal-lead">
                      {a.s === "timers" ? I.timer : a.s === "compare" ? I.chart : a.s === "map" ? I.map : I.sun}
                    </span>
                  )
                : a.t === "setting"
                  ? (
                      <span className="pal-lead">
                        <Ico d={SECTIONS.find((s) => s.key === a.section)?.icon ?? []} />
                      </span>
                    )
                  : a.t === "manual"
                    ? <span className="pal-lead">{I.book}</span>
                    : verbLead(verbsById.get(a.v) as Verb);
        const disabled = a.t === "verb" && !a.live;
        const verb = a.t === "verb" ? verbsById.get(a.v) : undefined;
        out.push(
          palRow(rowKeyFor(g.group, it), lead, it.title, {
            sub: it.sub,
            meta: (
              <>
                {a.t === "verb" &&
                  (disabled
                    ? [verb?.meta, verb?.group].filter(Boolean).join(" · ")
                    : verb?.meta)}
                <span className="pal-tier">{it.quality}</span>
              </>
            ),
            disabled,
            fire: () => fireAction(a),
          }),
        );
      }
    }
    if (periods.length > 0) {
      for (const p of periods) {
        out.push(
          palRow(`period-${p.title}`, dotLead(p.colourVar), p.title, {
            sub: p.sub,
            meta: <span className="pal-tier">{p.tierLabel}</span>,
            fire: () => firePlace(p),
          }),
        );
      }
    }
    return out;
  }, [picking, query, projectHabits, entryCounts, groups, periods, data.habits, data.entries, lastVerb, today, go, nav, fireAction, firePlace]);

  const selectable = useMemo(() => rows.filter((r) => r.selectable), [rows]);

  useEffect(() => {
    setSel(0);
  }, [query, picking]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  // Esc closes the top layer — the habit-pick step first, else the overlay
  // (the shared overlay stack; capture-phase popovers still pre-empt it).
  useOverlayEsc(() => {
    if (picking) setPicking(false);
    else close();
  }, mode.m === "palette");

  // Keyboard: ↑↓ move · ↵ open (Esc rides the overlay stack above).
  useEffect(() => {
    if (mode.m !== "palette") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        // zero rows would compute min(-1, …) and strand sel negative (2026-07-30)
        setSel((s) =>
          selectable.length === 0 ? s : Math.max(0, Math.min(selectable.length - 1, s + 1)),
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(0, s - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        selectable[sel]?.fire();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode.m, selectable, sel]);

  // ── The three faces ────────────────────────────────────────────────────────

  if (mode.m === "create") {
    // The New-entry verb's target — the frozen creation modal (cited, reused).
    return (
      <EntryCreationModal
        habitKey={mode.habitKey}
        onClose={close}
        onOpenEntry={(id) => go(() => nav.openEntry(id, mode.habitKey))}
      />
    );
  }

  const selKey = selectable[sel]?.key;

  // ONE scrim across both faces (2026-07-29 GUI-pass fix): when the palette
  // and the morph each carried their own scrim, the swap remounted it and
  // replayed the dim's fade-in from opacity 0 — a frame of undimmed app that
  // read as a white flash. The scrim persists here; only the PANEL swaps (its
  // pal-in fade is the morph's appear motion, over a stable dim).
  return (
    <div className="pal-scrim" onMouseDown={close} role="presentation">
      {mode.m === "advanced" ? (
        <AdvancedSearch
          data={data}
          today={today}
          nav={nav}
          onBack={() => setMode({ m: "palette" })}
          onClose={close}
        />
      ) : (
      <div
        className="palette"
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* search well · kit-input anatomy */}
        <div className="pal-well">
          {I.mag}
          <div className="pal-qwrap">
            <input
              ref={inputRef}
              className="pal-in"
              placeholder="Search or run a command…"
              value={query}
              autoFocus
              onChange={(e) => {
                setPicking(false);
                setQuery(e.target.value);
              }}
            />
          </div>
          {/* the Advanced Search door — promoted out of the Actions list into
              the well (user-ruled 2026-07-29: a search ESCALATION, not a verb).
              It replaces the well's Esc kbd; the foot legend keeps Esc. */}
          <button
            className="pal-advs-door"
            title="Advanced Search — filter this palette"
            onClick={() => setMode({ m: "advanced" })}
          >
            {I.adv}
            Advanced
          </button>
        </div>

        <div className="pal-body">
          {picking ? (
            // the New-entry VERB's habit-pick step (the quick-create-from-
            // unmatched flow is REMOVED — user-ruled 2026-07-29)
            <>
              <div className="pal-pickhead">
                <span className="pal-eyebrow">New entry · which habit?</span>
                <span className="pal-prompt">
                  A title needs a home. The palette has no default habit, so it asks — pick one
                  and <b>↵</b> opens the new-entry form.
                </span>
              </div>
              <div className="pal-list">{rows.map((r) => r.node(r.key === selKey, () => setSel(selectable.findIndex((s) => s.key === r.key))))}</div>
            </>
          ) : empty ? (
            // an unmatched query states the miss and offers NOTHING — "if
            // something doesn't exist, then it doesn't exist; it's not the
            // search's job to make it" (user-ruled 2026-07-29, striking the
            // drawn state 4)
            <div className="pal-none">
              No entry, habit, screen, or period matches <b>“{query.trim()}”</b>.
            </div>
          ) : query.trim() === "" ? (
            // At rest the palette IS its verb inventory (user-ruled 2026-08-15).
            // The header stays: the typing face groups its results under headers
            // too, so dropping this one would make the two faces disagree about
            // whether a list carries a name.
            <>
              <div className="pal-grp">Actions</div>
              <div className="pal-list">
                {rows
                  .filter((r) => r.key.startsWith("verb-"))
                  .map((r) => r.node(r.key === selKey, () => setSel(selectable.findIndex((s) => s.key === r.key))))}
              </div>
            </>
          ) : (
            <GroupedBody
              rows={rows}
              groups={groups}
              periods={periods}
              selKey={selKey}
              onHoverKey={(k) => setSel(selectable.findIndex((s) => s.key === k))}
            />
          )}
        </div>

        {/* footer legend — as drawn */}
        <div className="pal-foot">
          <span className="pal-legend"><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span className="pal-legend"><kbd>↵</kbd> open</span>
          <span className="pal-legend"><kbd>Esc</kbd> close</span>
        </div>
      </div>
      )}
    </div>
  );
}

/**
 * The typing face: group headers in tier order with their rows, the period
 * hint above the period group (drawn state 3), and honest overflow lines.
 */
function GroupedBody({
  rows,
  groups,
  periods,
  selKey,
  onHoverKey,
}: {
  rows: Row[];
  groups: RankedGroup<PalAction>[];
  periods: PlaceMatch[];
  selKey: string | undefined;
  onHoverKey: (key: string) => void;
}) {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const draw = (keys: string[]) => (
    <div className="pal-list">
      {keys.flatMap((k) => {
        const r = byKey.get(k);
        return r != null ? [r.node(r.key === selKey, () => onHoverKey(r.key))] : [];
      })}
    </div>
  );
  return (
    <>
      {periods.length > 0 && (
        <div className="pal-hint">
          <svg className="ico" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>
          Periods are places — a month, a week (W27), a quarter (Q2), a season (Spring 2022), or a year.
        </div>
      )}
      {groups.map((g) => {
        if (g.group === "screens" && periods.length > 0) return null;
        return (
          <div key={g.group}>
            <div className="pal-grp">{g.label}</div>
            {draw(g.items.map((it) => rowKeyFor(g.group, it)))}
            {g.more > 0 && <div className="pal-more">…and {g.more} more — keep typing</div>}
          </div>
        );
      })}
      {periods.length > 0 && (
        <div>
          <div className="pal-grp">Screens &amp; periods</div>
          {draw(periods.map((p) => `period-${p.title}`))}
        </div>
      )}
    </>
  );
}
