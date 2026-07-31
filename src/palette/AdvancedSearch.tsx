/**
 * ADVANCED SEARCH — the palette's in-place MORPH into the set-query workspace
 * ([[Search & Quick-Find]]: one overlay, two states — no separate screen, no
 * route). It finds SETS; CS finds amounts. NO DRAWN FINAL EXISTS — the morph
 * target is Build-side by standing ruling, so this face is a first build on
 * CS's builder idiom (`--builder-w`, minted "shared-ready" for exactly this)
 * and iterates at the GUI pass.
 *
 * The ruled flow: Target (Days | Entries — gates every later control) →
 * Period (kit-picker-period REUSED — the second consumer; optional for entry
 * queries, where it scopes engagement conditions) → Conditions (typed,
 * definition-driven rows) → Match all / Match any (ONE switch, no nested
 * boolean trees) → LIVE results (no Run button; a count + the list update on
 * every change) — and RESULTS ARE DOORS: day rows deep-link to their day
 * dashboards, entry rows to their entry dashboards.
 *
 * Presets mirror CS exactly (kit-menu-preset REUSED): opens blank, results
 * ephemeral, named presets = partial form configurations stored verbatim in
 * `app_meta` under `as_preset:<id>` — habit-KEY-addressed, synced; the Manage
 * door stays inert until step 10's Settings → Presets.
 *
 * The BUILDER-CHASSIS MINT — deferred by ruling to this session — is decided
 * NO MINT: the genuinely shared pieces are already kit blocks (the period
 * picker · the preset menu); the two builders share the numbered-step column
 * IDIOM (`.bsec`/`.bhead`, scoped `:is(.csdash,.advs)`), not an anatomy —
 * different steps, different container (screen panel vs. morphing overlay).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WindowCfg } from "../compare/compareSpec";
import { DayField, PeriodPicker } from "../compare/PeriodPicker";
import { PresetControl } from "../compare/PresetMenu";
import { Menu, type MenuItem } from "../library/bits";
import { HabitIcon, hasIcon } from "../shell/habitIcons";
import type { PaletteNav } from "./Palette";
import {
  dayCondComplete,
  entryCondComplete,
  searchDays,
  searchEntries,
  type ASCfg,
  type ASHabit,
  type DayCond,
  type EntryCond,
  type MatchMode,
  type SearchTarget,
} from "./advancedSpec";
import type { SearchData } from "./useSearchData";

const AS_PREFIX = "as_preset:";
const CAP = 60;

const IX = () => (
  <svg className="ico" viewBox="0 0 24 24"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
);
const IBack = () => (
  <svg className="ico" viewBox="0 0 24 24"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
);
const IPlus = () => (
  <svg className="ico" viewBox="0 0 24 24"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
);
const ICaret = () => (
  <svg className="ico" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
);

// ── Condition vocab (labels for the add menu + the row eyebrows) ─────────────

const DAY_KINDS: { kind: DayCond["kind"]; label: string; make: () => DayCond }[] = [
  { kind: "habitDone", label: "Habit done", make: () => ({ kind: "habitDone", habitKey: null }) },
  { kind: "habitMissed", label: "Habit missed", make: () => ({ kind: "habitMissed", habitKey: null }) },
  { kind: "entryLogged", label: "Entry logged", make: () => ({ kind: "entryLogged", entryId: null }) },
  { kind: "doneCount", label: "Habits-done count", make: () => ({ kind: "doneCount", op: ">=", n: 5 }) },
  {
    kind: "dayTotal",
    label: "Day total",
    make: () => ({ kind: "dayTotal", habitKey: null, basis: "time", op: ">=", value: 8 }),
  },
];

const ENTRY_KINDS: { kind: EntryCond["kind"]; label: string; make: () => EntryCond }[] = [
  { kind: "habit", label: "Habit", make: () => ({ kind: "habit", habitKey: null }) },
  { kind: "status", label: "Status", make: () => ({ kind: "status", value: null }) },
  { kind: "type", label: "Type", make: () => ({ kind: "type", value: null }) },
  { kind: "genre", label: "Genre", make: () => ({ kind: "genre", value: null }) },
  { kind: "priority", label: "Priority", make: () => ({ kind: "priority", op: ">=", n: 2 }) },
  { kind: "rating", label: "Rating", make: () => ({ kind: "rating", op: ">=", n: 4 }) },
  { kind: "purchased", label: "Purchased", make: () => ({ kind: "purchased", value: true }) },
  { kind: "creator", label: "Creator / studio", make: () => ({ kind: "creator", text: "" }) },
  { kind: "series", label: "Series", make: () => ({ kind: "series", text: "" }) },
  {
    kind: "lastSession",
    label: "Last session",
    make: () => ({ kind: "lastSession", dir: "before", day: null }),
  },
  { kind: "totalTime", label: "Total time", make: () => ({ kind: "totalTime", op: ">=", hours: 10 }) },
];

// ── Row identity ─────────────────────────────────────────────────────────────

/**
 * Condition rows KEY by a stable per-row id — index keys migrate a removed
 * row's open-popover state onto its neighbour (2026-07-30). UI-only: presets
 * store the verbatim form, so the id is stripped at save and re-minted at
 * apply (a stored counter would collide with the live one).
 */
type IdCond<C> = C & { id: number };
let nextCondId = 1;
const withId = <C extends DayCond | EntryCond>(c: C): IdCond<C> =>
  ({ ...c, id: nextCondId++ }) as IdCond<C>;
const stripId = <C extends DayCond | EntryCond>(c: IdCond<C>): C => {
  const copy = { ...c };
  delete (copy as { id?: number }).id;
  return copy as C;
};

export function AdvancedSearch({
  data,
  today,
  nav,
  onBack,
  onClose,
}: {
  data: SearchData;
  today: string;
  nav: PaletteNav;
  onBack: () => void;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<SearchTarget>("days");
  const [window_, setWindow] = useState<WindowCfg>({ mode: "none" });
  const [match, setMatch] = useState<MatchMode>("all");
  const [dayConds, setDayConds] = useState<IdCond<DayCond>[]>([]);
  const [entryConds, setEntryConds] = useState<IdCond<EntryCond>[]>([]);

  // Esc closes the OVERLAY (the top layer); the popovers' capture-phase
  // handlers win first, exactly the app-wide discipline.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const win = window_.mode === "none" ? undefined : window_;
  // RESULTS RUN ON DEMAND (user-ruled 2026-07-29, REVERSING the ruled "live
  // as you build — no Run button" clause; recorded in [[Search & Quick-Find]]
  // § Amended): the Search button SNAPSHOTS the builder and the results
  // render from that snapshot; until it is pressed the results column is
  // EMPTY, and edits after a run leave the last run standing until the next
  // press.
  const [submitted, setSubmitted] = useState<{
    target: SearchTarget;
    window?: WindowCfg;
    match: MatchMode;
    dayConds: DayCond[];
    entryConds: EntryCond[];
  } | null>(null);
  const runSearch = () =>
    setSubmitted({ target, window: win, match, dayConds, entryConds });
  const dayResult = useMemo(
    () =>
      submitted != null && submitted.target === "days"
        ? searchDays(submitted.dayConds, submitted.match, submitted.window, data, today, CAP)
        : null,
    [submitted, data, today],
  );
  const entryResult = useMemo(
    () =>
      submitted != null && submitted.target === "entries"
        ? searchEntries(submitted.entryConds, submitted.match, submitted.window, data, today, CAP)
        : null,
    [submitted, data, today],
  );

  // ── Presets — the CS mirror, its own roster ────────────────────────────────
  const currentCfg = useMemo<ASCfg>(
    () => ({
      target,
      window: window_,
      match,
      dayConds: dayConds.map(stripId),
      entryConds: entryConds.map(stripId),
    }),
    [target, window_, match, dayConds, entryConds],
  );
  const hasCurrent =
    dayConds.length > 0 || entryConds.length > 0 || window_.mode !== "none";
  const applyCfg = (cfg: ASCfg) => {
    // Verbatim-partial: blanks keep the current state; a habit key the store
    // no longer carries degrades to the unanswered pick (CS's resolve rule).
    const keys = new Set(data.habits.flatMap((h) => (h.key != null ? [h.key] : [])));
    const entryIds = new Set(data.entries.map((e) => e.id));
    if (cfg.target !== undefined) setTarget(cfg.target);
    if (cfg.window !== undefined) setWindow(cfg.window);
    if (cfg.match !== undefined) setMatch(cfg.match);
    if (cfg.dayConds !== undefined)
      setDayConds(
        cfg.dayConds.map((c) =>
          withId(
            "habitKey" in c && c.habitKey != null && !keys.has(c.habitKey)
              ? { ...c, habitKey: null }
              : c.kind === "entryLogged" && c.entryId != null && !entryIds.has(c.entryId)
                ? { ...c, entryId: null }
                : c,
          ),
        ),
      );
    if (cfg.entryConds !== undefined)
      setEntryConds(
        cfg.entryConds.map((c) =>
          withId(
            c.kind === "habit" && c.habitKey != null && !keys.has(c.habitKey)
              ? { ...c, habitKey: null }
              : c,
          ),
        ),
      );
  };

  const conds = target === "days" ? dayConds : entryConds;
  const habitByKey = useMemo(
    () => new Map(data.habits.filter((h) => h.key != null).map((h) => [h.key as string, h])),
    [data.habits],
  );
  const habitById = useMemo(() => new Map(data.habits.map((h) => [h.id, h])), [data.habits]);

  // PANEL ONLY — the scrim lives in PaletteOverlay and persists across the
  // morph (2026-07-29 GUI-pass fix): when each face carried its own scrim,
  // swapping remounted it and replayed the dim's fade-in from 0 — a frame of
  // undimmed app read as a white flash.
  return (
      <div
        className="palette advs"
        role="dialog"
        aria-label="Advanced Search"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* head — back to the simple palette · title · presets */}
        <div className="advs-head">
          <button className="advs-back" onClick={onBack} title="Back to the palette">
            <IBack />
          </button>
          <div className="advs-titlewrap">
            <span className="advs-title">Advanced Search</span>
            <span className="advs-sub">finds sets — results are doors</span>
          </div>
          <div className="advs-acts">
            <PresetControl<ASCfg>
              currentCfg={currentCfg}
              hasCurrent={hasCurrent}
              onApply={applyCfg}
              prefix={AS_PREFIX}
            />
          </div>
          {/* the head's Esc kbd died with the notes (user-ruled 2026-07-29) */}
        </div>

        <div className="advs-grid">
          {/* ── builder (the shared numbered-step idiom) ── */}
          <div className="builder advs-builder">
            <div className="bsec">
              <div className="bhead">
                <span className="bstep">1</span>
                <span className="btitle">Target</span>
              </div>
              <div className="segctl">
                <button aria-pressed={target === "days"} onClick={() => setTarget("days")}>
                  Days
                </button>
                <button aria-pressed={target === "entries"} onClick={() => setTarget("entries")}>
                  Entries
                </button>
              </div>
              {/* the explainer notes died 2026-07-29 (user-ruled, in-canvas) —
                  the no-explainer-prose law reasserting itself */}
            </div>

            <div className="bsec">
              <div className="bhead">
                <span className="bstep">2</span>
                <span className="btitle">Period</span>
                {window_.mode !== "none" && (
                  <button className="bclear" onClick={() => setWindow({ mode: "none" })}>
                    Clear
                  </button>
                )}
              </div>
              <PeriodPicker
                windows={[window_]}
                single
                today={today}
                allowAllTime
                onChange={(w) => setWindow(w[0] ?? { mode: "none" })}
              />
            </div>

            <div className="bsec">
              <div className="bhead">
                <span className="bstep">3</span>
                <span className="btitle">Conditions</span>
                {conds.length > 0 && (
                  <button
                    className="bclear"
                    onClick={() => (target === "days" ? setDayConds([]) : setEntryConds([]))}
                  >
                    Clear
                  </button>
                )}
              </div>
              {target === "days" ? (
                <DayCondRows
                  conds={dayConds}
                  data={data}
                  habitByKey={habitByKey}
                  habitById={habitById}
                  today={today}
                  onChange={setDayConds}
                />
              ) : (
                <EntryCondRows
                  conds={entryConds}
                  data={data}
                  habitByKey={habitByKey}
                  today={today}
                  onChange={setEntryConds}
                />
              )}
              <AddCondition target={target} onAdd={(c) => {
                if (target === "days") setDayConds((l) => [...l, withId(c as DayCond)]);
                else setEntryConds((l) => [...l, withId(c as EntryCond)]);
              }} />
              {conds.length > 1 && (
                <div className="advs-match">
                  <span className="mlabel">Combine</span>
                  <div className="segctl">
                    <button aria-pressed={match === "all"} onClick={() => setMatch("all")}>
                      Match all
                    </button>
                    <button aria-pressed={match === "any"} onClick={() => setMatch("any")}>
                      Match any
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* the RUN control (user-ruled 2026-07-29) — results wait for it */}
            <button className="btn-accent advs-run" onClick={runSearch}>
              Search
            </button>
          </div>

          {/* ── results — doors; EMPTY until Search is pressed ── */}
          <div className="advs-results">
            {dayResult != null && (
              <>
                <div className="advs-count">
                  <b>{dayResult.total.toLocaleString()}</b> {dayResult.total === 1 ? "day matches" : "days match"}
                </div>
                {dayResult.total > CAP && (
                  <div className="advs-capnote">showing the {CAP} most recent of {dayResult.total.toLocaleString()}</div>
                )}
                <div className="pal-list">
                  {dayResult.hits.map((h) => (
                    <button
                      className="pal-row"
                      key={h.day}
                      onClick={() => {
                        onClose();
                        nav.openDay(h.day);
                      }}
                    >
                      <span className="pal-lead">
                        <span
                          className="pal-dot"
                          style={{ background: `var(--month-${["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"][Number(h.day.slice(5, 7)) - 1]})` }}
                        />
                      </span>
                      <span className="pal-txt">
                        <span className="pal-title">{h.day}</span>
                        <span className="pal-sub">
                          {h.doneCount} {h.doneCount === 1 ? "habit" : "habits"}
                          {h.finalized ? " · finalized" : ""}
                        </span>
                      </span>
                      <span className="pal-meta"><span className="pal-enter">↵ Open</span></span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {entryResult != null && (
              <>
                <div className="advs-count">
                  <b>{entryResult.total.toLocaleString()}</b> {entryResult.total === 1 ? "entry matches" : "entries match"}
                </div>
                {entryResult.total > CAP && (
                  <div className="advs-capnote">showing the first {CAP} of {entryResult.total.toLocaleString()}</div>
                )}
                <div className="pal-list">
                  {entryResult.hits.map((h) => (
                    <button
                      className="pal-row"
                      key={h.entry.id}
                      onClick={() => {
                        if (h.habit?.key == null) return;
                        onClose();
                        nav.openEntry(h.entry.id, h.habit.key);
                      }}
                    >
                      {/* LEAD RULING 2026-07-29: an entry wears its habit's
                          glyph tinted in the habit colour; the dot is the
                          icon-less fallback (days keep the dot). */}
                      {h.habit != null && hasIcon(h.habit.icon) ? (
                        <span className="pal-lead" style={{ color: `var(--${h.habit.colourSlot})` }}>
                          <HabitIcon icon={h.habit.icon} />
                        </span>
                      ) : (
                        <span className="pal-lead">
                          <span
                            className="pal-dot"
                            style={{ background: `var(--${h.habit?.colourSlot ?? "accent"})` }}
                          />
                        </span>
                      )}
                      <span className="pal-txt">
                        <span className="pal-title">{h.entry.title}</span>
                        <span className="pal-sub">{h.habit?.name ?? "—"}</span>
                      </span>
                      <span className="pal-meta">
                        {h.lastDay != null && <span className="pal-tier">{h.lastDay}</span>}
                        <span className="pal-enter">↵ Open</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
  );
}

// ── Shared row furniture ─────────────────────────────────────────────────────

function HabitField({
  habitKey,
  habitByKey,
  habits,
  placeholder,
  onPick,
}: {
  habitKey: string | null;
  habitByKey: Map<string, ASHabit>;
  habits: ASHabit[];
  placeholder: string;
  onPick: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const h = habitKey != null ? habitByKey.get(habitKey) : undefined;
  const items: MenuItem[] = habits
    .filter((x) => x.key != null)
    .map((x) => ({
      key: x.key as string,
      selected: x.key === habitKey,
      label: (
        <span className="mrow">
          {hasIcon(x.icon) ? (
            <span className="hico" style={{ color: `var(--${x.colourSlot})` }}>
              <HabitIcon icon={x.icon} />
            </span>
          ) : (
            <span className="dot" style={{ background: `var(--${x.colourSlot})` }} />
          )}
          {x.name}
        </span>
      ),
      onPick: () => onPick(x.key as string),
    }));
  return (
    <div className="fieldwrap">
      <button
        className={`field${h == null ? " placeholder" : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        {h != null && (hasIcon(h.icon) ? (
          <span className="hico" style={{ color: `var(--${h.colourSlot})` }}>
            <HabitIcon icon={h.icon} />
          </span>
        ) : (
          <span className="dot" style={{ background: `var(--${h.colourSlot})` }} />
        ))}
        <span className="fname">{h?.name ?? placeholder}</span>
        <span className="caret"><ICaret /></span>
      </button>
      {open && <Menu items={items} onClose={() => setOpen(false)} />}
    </div>
  );
}

function ValueField({
  value,
  options,
  placeholder,
  onPick,
}: {
  value: string | null;
  options: string[];
  placeholder: string;
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fieldwrap">
      <button className={`field${value == null ? " placeholder" : ""}`} onClick={() => setOpen((o) => !o)}>
        <span className="fname">{value ?? placeholder}</span>
        <span className="caret"><ICaret /></span>
      </button>
      {open && (
        <Menu
          items={options.map((o) => ({ key: o, selected: o === value, label: o, onPick: () => onPick(o) }))}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * The entry pick — SEARCH over a short result list, because a consumption
 * habit runs to hundreds (the timers sub-pick's consumption face, same
 * reasoning). Its own popover on the shared `.libmenu` surface + the Menu's
 * capture-phase discipline — an input can't legally nest inside Menu's
 * item buttons.
 */
function EntryField({
  entryId,
  data,
  habitById,
  onPick,
}: {
  entryId: string | null;
  data: SearchData;
  habitById: Map<string, ASHabit>;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const picked = entryId != null ? data.entries.find((e) => e.id === entryId) : undefined;
  const needle = q.trim().toLowerCase();
  const hits = data.entries
    .filter((e) => needle === "" || e.title.toLowerCase().includes(needle))
    .slice(0, 12);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current != null && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div className="fieldwrap" ref={boxRef}>
      <button className={`field${picked == null ? " placeholder" : ""}`} onClick={() => setOpen((o) => !o)}>
        <span className="fname">{picked?.title ?? "pick an entry"}</span>
        <span className="caret"><ICaret /></span>
      </button>
      {open && (
        <div className="libmenu" role="menu">
          <input
            className="splitsearch"
            autoFocus
            placeholder="Search entries…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {hits.map((e) => (
            <button
              key={e.id}
              className={`libmenu-item${e.id === entryId ? " on" : ""}`}
              role="menuitem"
              onClick={() => {
                onPick(e.id);
                setOpen(false);
                setQ("");
              }}
            >
              <span className="mrow">
                <span
                  className="dot"
                  style={{ background: `var(--${habitById.get(e.habitId)?.colourSlot ?? "accent"})` }}
                />
                {e.title}
              </span>
            </button>
          ))}
          {hits.length === 0 && <div className="pempty">No entry matches.</div>}
        </div>
      )}
    </div>
  );
}

function OpChips<T extends string>({
  op,
  ops,
  onPick,
}: {
  op: T;
  ops: readonly T[];
  onPick: (o: T) => void;
}) {
  return (
    <div className="wopts">
      {ops.map((o) => (
        <span key={o} className={`opt${op === o ? " on" : ""}`} onClick={() => onPick(o)}>
          {o === ">=" ? "≥" : o === "<=" ? "≤" : "="}
        </span>
      ))}
    </div>
  );
}

const NumInput = ({ value, onChange }: { value: number; onChange: (n: number) => void }) => (
  <input
    className="advs-num"
    type="number"
    min={0}
    value={Number.isFinite(value) ? value : ""}
    onChange={(e) => onChange(Number(e.target.value))}
  />
);

function CondShell({
  label,
  incomplete,
  onRemove,
  children,
}: {
  label: string;
  incomplete: boolean;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div className="advs-cond">
      <div className="advs-cond-top">
        <span className="mlabel">{label}</span>
        {incomplete && <span className="advs-incomplete">unanswered — contributes nothing</span>}
        <button className="wclose" title="Remove condition" onClick={onRemove}>
          <IX />
        </button>
      </div>
      <div className="advs-cond-body">{children}</div>
    </div>
  );
}

function AddCondition({ target, onAdd }: { target: SearchTarget; onAdd: (c: DayCond | EntryCond) => void }) {
  const [open, setOpen] = useState(false);
  const kinds = target === "days" ? DAY_KINDS : ENTRY_KINDS;
  return (
    <div className="fieldwrap advs-add">
      <button className="addrow" onClick={() => setOpen((o) => !o)}>
        <IPlus />
        Add condition
      </button>
      {open && (
        <Menu
          items={kinds.map((k) => ({ key: k.kind, label: k.label, onPick: () => onAdd(k.make()) }))}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ── Day condition rows ───────────────────────────────────────────────────────

function DayCondRows({
  conds,
  data,
  habitByKey,
  habitById,
  today,
  onChange,
}: {
  conds: IdCond<DayCond>[];
  data: SearchData;
  habitByKey: Map<string, ASHabit>;
  habitById: Map<string, ASHabit>;
  today: string;
  onChange: (c: IdCond<DayCond>[]) => void;
}) {
  void today;
  const patch = (i: number, c: IdCond<DayCond>) => onChange(conds.map((x, j) => (j === i ? c : x)));
  const remove = (i: number) => onChange(conds.filter((_, j) => j !== i));
  const label = (c: DayCond) => DAY_KINDS.find((k) => k.kind === c.kind)?.label ?? c.kind;

  return (
    <>
      {conds.map((c, i) => (
        <CondShell key={c.id} label={label(c)} incomplete={!dayCondComplete(c)} onRemove={() => remove(i)}>
          {(c.kind === "habitDone" || c.kind === "habitMissed") && (
            <HabitField
              habitKey={c.habitKey}
              habitByKey={habitByKey}
              habits={data.habits}
              placeholder="pick a habit"
              onPick={(key) => patch(i, { ...c, habitKey: key })}
            />
          )}
          {c.kind === "entryLogged" && (
            <EntryField
              entryId={c.entryId}
              data={data}
              habitById={habitById}
              onPick={(id) => patch(i, { ...c, entryId: id })}
            />
          )}
          {c.kind === "doneCount" && (
            <div className="advs-inline">
              <OpChips op={c.op} ops={[">=", "=", "<="]} onPick={(o) => patch(i, { ...c, op: o })} />
              <NumInput value={c.n} onChange={(n) => patch(i, { ...c, n })} />
              <span className="advs-unit">habits</span>
            </div>
          )}
          {c.kind === "dayTotal" && (
            <>
              <HabitField
                habitKey={c.habitKey}
                habitByKey={habitByKey}
                habits={data.habits.filter((h) => h.measuresTime || h.measuresCount || h.kind === "range")}
                placeholder="pick a habit"
                onPick={(key) => {
                  const h = habitByKey.get(key);
                  const timeful = h != null && (h.measuresTime || h.kind === "range");
                  patch(i, { ...c, habitKey: key, basis: timeful ? "time" : "count" });
                }}
              />
              <div className="advs-inline">
                {(() => {
                  const h = c.habitKey != null ? habitByKey.get(c.habitKey) : undefined;
                  const offerTime = h == null || h.measuresTime || h.kind === "range";
                  const offerCount = h == null ? false : h.measuresCount;
                  return (
                    <div className="wopts">
                      {offerTime && (
                        <span
                          className={`opt${c.basis === "time" ? " on" : ""}`}
                          onClick={() => patch(i, { ...c, basis: "time" })}
                        >
                          Hours
                        </span>
                      )}
                      {offerCount && (
                        <span
                          className={`opt${c.basis === "count" ? " on" : ""}`}
                          onClick={() => patch(i, { ...c, basis: "count" })}
                        >
                          {h?.countUnit ?? "count"}
                        </span>
                      )}
                    </div>
                  );
                })()}
                <OpChips op={c.op} ops={[">=", "<="]} onPick={(o) => patch(i, { ...c, op: o })} />
                <NumInput value={c.value} onChange={(value) => patch(i, { ...c, value })} />
                <span className="advs-unit">{c.basis === "time" ? "hours" : ""}</span>
              </div>
            </>
          )}
        </CondShell>
      ))}
    </>
  );
}

// ── Entry condition rows ─────────────────────────────────────────────────────

function EntryCondRows({
  conds,
  data,
  habitByKey,
  today,
  onChange,
}: {
  conds: IdCond<EntryCond>[];
  data: SearchData;
  habitByKey: Map<string, ASHabit>;
  today: string;
  onChange: (c: IdCond<EntryCond>[]) => void;
}) {
  const patch = (i: number, c: IdCond<EntryCond>) => onChange(conds.map((x, j) => (j === i ? c : x)));
  const remove = (i: number) => onChange(conds.filter((_, j) => j !== i));
  const label = (c: EntryCond) => ENTRY_KINDS.find((k) => k.kind === c.kind)?.label ?? c.kind;
  const projects = data.habits.filter((h) => h.kind === "project");

  return (
    <>
      {conds.map((c, i) => (
        <CondShell key={c.id} label={label(c)} incomplete={!entryCondComplete(c)} onRemove={() => remove(i)}>
          {c.kind === "habit" && (
            <HabitField
              habitKey={c.habitKey}
              habitByKey={habitByKey}
              habits={projects}
              placeholder="pick a habit"
              onPick={(key) => patch(i, { ...c, habitKey: key })}
            />
          )}
          {c.kind === "status" && (
            <ValueField value={c.value} options={data.statusVocab} placeholder="pick a status" onPick={(v) => patch(i, { ...c, value: v })} />
          )}
          {c.kind === "type" && (
            <ValueField value={c.value} options={data.typeVocab} placeholder="pick a type" onPick={(v) => patch(i, { ...c, value: v })} />
          )}
          {c.kind === "genre" && (
            <ValueField value={c.value} options={data.genreVocab} placeholder="pick a genre" onPick={(v) => patch(i, { ...c, value: v })} />
          )}
          {c.kind === "priority" && (
            <div className="advs-inline">
              <OpChips op={c.op} ops={[">=", "=", "<="]} onPick={(o) => patch(i, { ...c, op: o })} />
              <div className="wopts">
                {[0, 1, 2, 3].map((n) => (
                  <span key={n} className={`opt${c.n === n ? " on" : ""}`} onClick={() => patch(i, { ...c, n })}>
                    P{n}
                  </span>
                ))}
              </div>
            </div>
          )}
          {c.kind === "rating" && (
            <div className="advs-inline">
              <OpChips op={c.op} ops={[">=", "=", "<="]} onPick={(o) => patch(i, { ...c, op: o })} />
              <div className="wopts">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} className={`opt${c.n === n ? " on" : ""}`} onClick={() => patch(i, { ...c, n })}>
                    {"★".repeat(n)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {c.kind === "purchased" && (
            <div className="wopts">
              <span className={`opt${c.value ? " on" : ""}`} onClick={() => patch(i, { ...c, value: true })}>
                Owned
              </span>
              <span className={`opt${!c.value ? " on" : ""}`} onClick={() => patch(i, { ...c, value: false })}>
                Not owned
              </span>
            </div>
          )}
          {(c.kind === "creator" || c.kind === "series") && (
            <input
              className="splitsearch"
              placeholder={c.kind === "creator" ? "name contains…" : "series contains…"}
              value={c.text}
              onChange={(e) => patch(i, { ...c, text: e.target.value })}
            />
          )}
          {c.kind === "lastSession" && (
            <div className="advs-inline">
              <div className="wopts">
                <span className={`opt${c.dir === "before" ? " on" : ""}`} onClick={() => patch(i, { ...c, dir: "before" })}>
                  before
                </span>
                <span className={`opt${c.dir === "after" ? " on" : ""}`} onClick={() => patch(i, { ...c, dir: "after" })}>
                  after
                </span>
              </div>
              <DayField label="Date" value={c.day} today={today} onPick={(day) => patch(i, { ...c, day })} />
            </div>
          )}
          {c.kind === "totalTime" && (
            <div className="advs-inline">
              <OpChips op={c.op} ops={[">=", "<="]} onPick={(o) => patch(i, { ...c, op: o })} />
              <NumInput value={c.hours} onChange={(hours) => patch(i, { ...c, hours })} />
              <span className="advs-unit">hours</span>
            </div>
          )}
        </CondShell>
      ))}
    </>
  );
}
