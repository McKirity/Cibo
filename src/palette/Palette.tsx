/**
 * kit-palette — the Ctrl+K COMMAND LAYER, translated from the frozen
 * `Final/palette.html` (stage-6 extension; kit-shell-overlay tenant at
 * `--modal-confirm-w`, top-third placement, zero block-own dials).
 *
 * Two roles, one boundary ([[Palette]]): TELEPORT (places — entries · habits ·
 * screens · periods via the route grammar) and ACTIONS (the pinned, CLOSED
 * ten-verb inventory — additions only against real friction, never here).
 * Ranking is deterministic, no cleverness, ever (paletteSpec). Never a route;
 * Esc closes; one overlay at a time; also summoned by the rail's Search entry
 * (the recorded overlay exception).
 *
 * Four live states, exactly the drawn four: at-rest (the verb inventory under
 * a one-line hint) · mid-typing (grouped ranked results) · the period-grammar
 * teleport (periodGrammar; a period match fans out to its owning ladder) ·
 * unmatched → the QUICK-CREATE handoff ("Create entry 'X'…" → habit pick →
 * the frozen creation modal PRE-FILLED — cited, reused, never redrawn).
 *
 * The fifth face — the ADVANCED SEARCH MORPH — was never drawn (Build-side by
 * standing ruling); AdvancedSearch.tsx owns it. The morph replaces this face
 * in place: one overlay, two states, no separate screen, no route.
 *
 * Stand-ins, flagged: verbs whose targets belong to later steps (importers 8 ·
 * creator/settings/theme 10+ · backups · updater) render DISABLED with a
 * "later" meta — the nav rail's disabled-Tools precedent. Per the curation
 * ruling a HIDDEN verb is absent, but curation itself is step 10's Settings
 * section; until it exists the drawn inventory renders whole. The Settings-
 * sections and manual-pages teleport groups are absent for the same reason —
 * their screens don't exist yet. The Map row joins when the Map lands.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EntryCreationModal } from "../library/EntryCreationModal";
import { HabitIcon, hasIcon } from "../shell/habitIcons";
import { AdvancedSearch } from "./AdvancedSearch";
import { rankPalette, type PalIndexItem, type RankedGroup } from "./paletteSpec";
import { parsePeriods, type PeriodScale, type PlaceMatch } from "./periodGrammar";
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
}

// ── The pinned ten-verb inventory (CLOSED — [[Palette]]; never re-litigate) ──

type VerbId =
  | "new-habit" | "new-entry" | "backup" | "test-connection" | "data-checks"
  | "run-import" | "updates" | "theme" | "backups-folder" | "advanced";

interface Verb {
  id: VerbId;
  title: string;
  meta?: string;
  aliases: string[];
  /** false = the target's step hasn't landed — drawn disabled, "later" meta. */
  live: boolean;
  icon: ReactNode;
}

type PalAction =
  | { t: "habit"; key: string }
  | { t: "library"; key: string }
  | { t: "entry"; id: string; habitKey: string }
  | { t: "screen"; s: "daily" | "timers" | "compare" }
  | { t: "verb"; v: VerbId; live: boolean };

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
  book: (
    <svg className="ico" viewBox="0 0 24 24"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
  ),
  sun: (
    <svg className="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>
  ),
};

const VERBS: Verb[] = [
  { id: "new-habit", title: "New habit", aliases: ["habit creator", "create habit"], live: false, icon: I.plus },
  { id: "new-entry", title: "New entry", aliases: ["create entry"], live: true, icon: I.newEntry },
  { id: "backup", title: "Back up now", aliases: ["backup"], live: false, icon: I.backup },
  { id: "test-connection", title: "Test connection", meta: "per importer + all", aliases: ["importer test"], live: false, icon: I.test },
  { id: "data-checks", title: "Run data checks", aliases: ["data doctor", "health"], live: false, icon: I.checks },
  { id: "run-import", title: "Run import now", meta: "per importer", aliases: ["import"], live: false, icon: I.imp },
  { id: "updates", title: "Check for updates", aliases: ["update"], live: false, icon: I.upd },
  { id: "theme", title: "Switch theme", aliases: ["appearance"], live: false, icon: I.theme },
  { id: "backups-folder", title: "Open backups folder", aliases: ["reveal backups"], live: false, icon: I.folder },
  { id: "advanced", title: "Advanced Search", meta: "filters this palette", aliases: ["search sets", "query"], live: true, icon: I.adv },
];

// ── Row descriptors (one flat keyboard order over whatever the body draws) ───

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
    | { m: "create"; habitKey: string; title: string }
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
    );
    for (const v of VERBS) {
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
        return go(() => nav.openCompare());
      }
      // verbs
      if (!a.live) return;
      if (a.v === "advanced") return setMode({ m: "advanced" });
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
    const dotLead = (colourVar: string) => (
      <span className="pal-lead">
        <span className="pal-dot" style={{ background: `var(${colourVar})` }} />
      </span>
    );

    if (picking || (empty && query.trim() !== "")) {
      // STATE 4 — unmatched → quick-create (or the New-entry verb's pick step)
      const title = picking ? "" : query.trim();
      for (const h of projectHabits) {
        const count = entryCounts.get(h.id) ?? 0;
        out.push(
          palRow(
            `pick-${h.id}`,
            habitLead(h.colourSlot, h.icon, h.name),
            h.name,
            {
              sub: `${count} ${count === 1 ? "entry" : "entries"}`,
              fire: () => setMode({ m: "create", habitKey: h.key as string, title }),
            },
          ),
        );
      }
      return out;
    }

    if (query.trim() === "") {
      // STATE 1 — at rest: the pinned verb inventory (curation = step 10)
      for (const v of VERBS) {
        out.push(
          palRow(`verb-${v.id}`, verbLead(v), v.title, {
            meta: v.live ? v.meta : [v.meta, "later"].filter(Boolean).join(" · "),
            disabled: !v.live,
            fire: () => fireAction({ t: "verb", v: v.id, live: v.live }),
          }),
        );
      }
      return out;
    }

    // STATES 2 + 3 — ranked groups, period places folded into Screens & periods
    const verbsById = new Map(VERBS.map((v) => [v.id, v]));
    const habitByKey = new Map(data.habits.filter((h) => h.key != null).map((h) => [h.key as string, h]));
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
              ? dotLead(`--${habitByKey.get(a.habitKey)?.colourSlot ?? "accent"}`)
              : a.t === "screen"
                ? (
                    <span className="pal-lead">
                      {a.s === "timers" ? I.timer : a.s === "compare" ? I.chart : I.sun}
                    </span>
                  )
                : verbLead(verbsById.get(a.v) as Verb);
        const disabled = a.t === "verb" && !a.live;
        const verbMeta = a.t === "verb" ? verbsById.get(a.v)?.meta : undefined;
        out.push(
          palRow(`${g.group}-${it.title}-${(a as { id?: string }).id ?? ""}`, lead, it.title, {
            sub: it.sub,
            meta: (
              <>
                {a.t === "verb" && (disabled ? [verbMeta, "later"].filter(Boolean).join(" · ") : verbMeta)}
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
  }, [picking, empty, query, projectHabits, entryCounts, groups, periods, data.habits, fireAction, firePlace]);

  const selectable = useMemo(() => rows.filter((r) => r.selectable), [rows]);

  useEffect(() => {
    setSel(0);
  }, [query, picking]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  // Keyboard: ↑↓ move · ↵ open · Esc closes (the top layer — here, the overlay).
  useEffect(() => {
    if (mode.m !== "palette") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (picking) {
          setPicking(false);
          return;
        }
        close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(selectable.length - 1, s + 1));
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
  }, [mode.m, picking, selectable, sel, close]);

  // ── The three faces ────────────────────────────────────────────────────────

  if (mode.m === "create") {
    // The handoff target — the frozen creation modal, PRE-FILLED (cited, reused).
    return (
      <EntryCreationModal
        habitKey={mode.habitKey}
        initialTitle={mode.title === "" ? undefined : mode.title}
        onClose={close}
        onOpenEntry={(id) => go(() => nav.openEntry(id, mode.habitKey))}
      />
    );
  }

  if (mode.m === "advanced") {
    return (
      <AdvancedSearch
        data={data}
        today={today}
        nav={nav}
        onBack={() => setMode({ m: "palette" })}
        onClose={close}
      />
    );
  }

  const selKey = selectable[sel]?.key;
  const showCreateBody = (empty && query.trim() !== "") || picking;

  return (
    <div className="pal-scrim" onMouseDown={close} role="presentation">
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
          <kbd>Esc</kbd>
        </div>

        <div className="pal-body">
          {showCreateBody ? (
            <>
              {!picking && (
                <>
                  <div className="pal-none">
                    No entry, habit, screen, or period matches <b>“{query.trim()}”</b>.
                  </div>
                  <div className="pal-list">
                    {/* the drawn create door — the pick below is its next step */}
                    <div className="pal-row static">
                      <span className="pal-lead">{I.plus}</span>
                      <span className="pal-txt">
                        <span className="pal-title">Create entry “{query.trim()}”…</span>
                      </span>
                      <span className="pal-meta">pick a habit ›</span>
                    </div>
                  </div>
                </>
              )}
              <div className="pal-pickhead">
                <span className="pal-eyebrow">New entry · which habit?</span>
                <span className="pal-prompt">
                  A title needs a home. The palette has no default habit, so it asks — pick one
                  and <b>↵</b> opens the new-entry form{!picking && ", pre-filled with the title"}.
                </span>
              </div>
              <div className="pal-list">{rows.map((r) => r.node(r.key === selKey, () => setSel(selectable.findIndex((s) => s.key === r.key))))}</div>
            </>
          ) : query.trim() === "" ? (
            <>
              <div className="pal-hint">
                {I.cal}
                Type to teleport — an entry, a habit, a screen, or a period (“June 2025” · “W27” ·
                “Spring 2022”). Verbs run from here too.
              </div>
              <div className="pal-grp">Actions</div>
              <div className="pal-list">{rows.map((r) => r.node(r.key === selKey, () => setSel(selectable.findIndex((s) => s.key === r.key))))}</div>
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
            {draw(g.items.map((it) => `${g.group}-${it.title}-${(it.action as { id?: string }).id ?? ""}`))}
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
