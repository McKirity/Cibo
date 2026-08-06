/**
 * Comparing Statistics — the query WORKSPACE (Build step 6 catch-up).
 * Translated from `Final/comparing-statistics.html` + the owning notes: a
 * fixed left BUILDER (--builder-w, four numbered steps: scope → measure →
 * period(s) → chart) + a fluid right RESULTS canvas. Opens BLANK; results are
 * ephemeral — a named preset is the only way back. The comparability gate
 * reads through the pickers (compareSpec.ts computes what each offers).
 *
 * The FINAL names the two-track grid `.shell` — a name App.css already
 * claims, so every claimed rule here is RE-SCOPED under `.csdash` (the
 * `.cadash`/`.wallscreen` precedent); the grid wears `.cs-shell`.
 *
 * Charts: the SVG carries only bars/lines/gridlines and axis labels are HTML —
 * and since 2026-08-04 the SVGs are BOX-SIZED via useBox (charts.tsx owns the
 * conversion note), retiring this header's old preserveAspectRatio="none"
 * claim with the stretch it named.
 */
import { useMemo, useState, type ReactElement } from "react";
import {
  AVG_SCOPES,
  AVG_SCOPE_MIN_DAYS,
  CHART_LABEL,
  ENTRY_FIELD,
  buildResult,
  countUnits,
  daySets,
  emptyCfg,
  measureColumns,
  pickedScopes,
  resolveWindow,
  type AvgScope,
  type ChartKind,
  type CompareCfg,
  type MeasureFamily,
  type MeasurePick,
  type ScopeCfg,
  type SplitField,
} from "./compareSpec";
import { CAT_SLOTS } from "../dashboard/specShared";
import { useCompareData } from "./useCompareData";
// The chart renderers + Legend + the window dash roster (split out 2026-07-30,
// dedup pass wave 4) — pure functions of CmpChart/CmpSeries.
import { BarsChart, Donut, HBars, Legend, LineChart } from "./charts";
import { PeriodPicker } from "../kit/PeriodPicker";
import { PresetControl } from "../kit/PresetMenu";
// The app's ONE anchored-menu component (the .libmenu popover surface —
// close-on-pick, capture-phase click-out, Esc). Library-born; hoisted to the
// kit 2026-07-30 when the third consumer landed.
import { Menu, type MenuItem } from "../kit/Menu";
// Habit identity = icon stroked in the habit colour (user-ruled 2026-07-27,
// overriding the FINAL's colour dots); the dot survives as the fallback for
// icon-less habits. Chart series + legend swatches stay colour — the key.
import { HabitIcon, hasIcon } from "../shell/habitIcons";
import { Ico, ICONS } from "../shell/icons";
import { todayLocal } from "../metrics/clock";
import type { PresetCfg } from "./presets";

// Shared glyphs (caret/plus/check/back/x/warning) come from shell/icons.
// The two below have no roster match — their drawn paths are this screen's own.
const ISplit = () => (
  <svg className="ico" viewBox="0 0 24 24">
    <line x1="6" x2="6" y1="3" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </svg>
);
const IStats = () => (
  <svg className="ico" viewBox="0 0 24 24">
    <path d="M3 3v16a2 2 0 0 0 2 2h16" />
    <path d="M18 17V9" />
    <path d="M13 17V5" />
    <path d="M8 17v-3" />
  </svg>
);

// The four chart-picker preview glyphs, verbatim from the FINAL.
const GLine = () => (
  <svg className="g" viewBox="0 0 60 42">
    <polyline points="4,32 16,20 28,25 40,11 56,15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const GGroup = () => (
  <svg className="g" viewBox="0 0 60 42">
    <g fill="currentColor">
      <rect x="8" y="16" width="7" height="22" />
      <rect x="17" y="8" width="7" height="30" opacity=".45" />
      <rect x="36" y="22" width="7" height="16" />
      <rect x="45" y="12" width="7" height="26" opacity=".45" />
    </g>
  </svg>
);
const GStack = () => (
  <svg className="g" viewBox="0 0 60 42">
    <g fill="currentColor">
      <rect x="14" y="22" width="12" height="16" />
      <rect x="14" y="9" width="12" height="11" opacity=".45" />
      <rect x="36" y="26" width="12" height="12" />
      <rect x="36" y="11" width="12" height="13" opacity=".45" />
    </g>
  </svg>
);
const GTiles = () => (
  <svg className="g" viewBox="0 0 60 42">
    <g fill="none" stroke="currentColor" strokeWidth="2.5">
      <rect x="6" y="11" width="22" height="20" rx="3" />
      <rect x="34" y="11" width="20" height="20" rx="3" />
    </g>
  </svg>
);
const GArea = () => (
  <svg className="g" viewBox="0 0 60 42">
    <polygon points="4,38 4,24 18,14 32,20 46,8 56,12 56,38" fill="currentColor" opacity=".28" />
    <polyline points="4,24 18,14 32,20 46,8 56,12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const GHBar = () => (
  <svg className="g" viewBox="0 0 60 42">
    <g fill="currentColor">
      <rect x="6" y="8" width="46" height="7" rx="3" />
      <rect x="6" y="18" width="32" height="7" rx="3" opacity=".62" />
      <rect x="6" y="28" width="18" height="7" rx="3" opacity=".38" />
    </g>
  </svg>
);
const GDonut = () => (
  <svg className="g" viewBox="0 0 60 42">
    <g transform="translate(30,21)">
      <circle r="13" fill="none" stroke="currentColor" strokeWidth="8" opacity=".3" />
      <circle
        r="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
        strokeDasharray={`${2 * Math.PI * 13 * 0.62} ${2 * Math.PI * 13 * 0.38}`}
        transform="rotate(-90)"
      />
    </g>
  </svg>
);

const IUndo = () => (
  <svg className="ico" viewBox="0 0 24 24">
    <path d="M3 7v6h6" />
    <path d="M3 13a9 9 0 1 0 3-7.7L3 8" />
  </svg>
);

/**
 * A step's reset (user-asked 2026-07-27). NOT the daily form's Clear all
 * anatomy: that one deletes sessions, so it takes the count-carrying danger
 * confirm; this clears BUILDER STATE only — results are ephemeral by ruling,
 * so nothing is destroyed and a confirm would be theatre. Rendered only when
 * there is something to clear, so no step wears a dead control.
 */
function ClearBtn({ show, onClear, title }: { show: boolean; onClear: () => void; title: string }) {
  if (!show) return null;
  return (
    <button className="bclear" onClick={onClear} title={title}>
      Clear
    </button>
  );
}

// Family glyphs (user-ruled 2026-07-27, over the FINAL's flat words) — control
// furniture in the chart picker's glyph-per-option family, not data icons, so
// the Iconography boundary is untouched. One glyph per FAMILY now that the
// column carries the subject.
const FAMILY_GLYPHS: Record<MeasureFamily, string[]> = {
  total: ["M4 6h16", "M4 12h10", "M4 18h13"],
  average: ["m12 14 4-4", "M3.34 19a10 10 0 1 1 17.32 0"],
};

const FAMILY_LABEL: Record<MeasureFamily, string> = {
  total: "Total",
  average: "Average",
};

function FamilyGlyph({ family }: { family: MeasureFamily }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
      {FAMILY_GLYPHS[family].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/**
 * The split's value picker. Searchable for the entry split, which can run to
 * hundreds on a consumption habit (user-ruled 2026-07-27) — the filter is
 * local to the panel and never touches the selection, so a value chosen
 * before a search stays chosen after it. Selected values are always shown,
 * even when the filter excludes them, or a search would look like a delete.
 */
function SplitPanel({
  field,
  selected,
  onToggle,
}: {
  field: SplitField;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [q, setQ] = useState("");
  const nameOf = (v: string) => field.valueLabel?.[v] ?? v;
  const needle = q.trim().toLowerCase();
  const shown =
    needle === ""
      ? field.values
      : field.values.filter((v) => selected.includes(v) || nameOf(v).toLowerCase().includes(needle));
  const capped = needle === "" && field.searchable ? shown.slice(0, 60) : shown;
  const hidden = shown.length - capped.length;

  return (
    <div className="split">
      {/* The drawn copy reads "Type — a Medium field"; Medium is
          [[Glossary]]-specific (entry `type` + the session categoricals), so
          Fandom/Engine/Entry say what they are instead. */}
      <p className="sl">
        {field.label} —{" "}
        {field.isMedium ? "a Medium field" : field.field === "__entry" ? "one series each" : "an entry field"}
      </p>
      {field.searchable && (
        <input
          className="splitsearch"
          value={q}
          placeholder={`Search ${field.values.length} entries…`}
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      <div className="checks">
        {capped.map((v) => {
          const on = selected.includes(v);
          // Colour by position in the SELECTION so the chip matches its series.
          // CAT_SLOTS, never a literal 8: compareSpec retired its own `= 8`
          // copy at the 6a sweep for being a second source of truth, and missed
          // this one. The roster's length IS the cycle length.
          const pos = selected.indexOf(v);
          const slot = CAT_SLOTS[(on ? pos : 0) % CAT_SLOTS.length];
          return (
            <span
              key={v}
              className={`chk${on ? " on" : ""}`}
              style={{ ["--seriescolor" as string]: `var(${slot})` }}
              onClick={() => onToggle(v)}
            >
              <span className="box">
                <Ico d={ICONS.check} />
              </span>
              {nameOf(v)}
            </span>
          );
        })}
      </div>
      {hidden > 0 && <p className="splitmore">{hidden} more — search to narrow</p>}
    </div>
  );
}

/** A level-2 chip row — the refinements a family needs, at the panel's foot. */
function Refine({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="refine">
      <span className="refine-l">{label}</span>
      <div className="refine-opts">
        {options.map((o) => (
          <button
            key={o.id}
            className={`opt${value === o.id ? " on" : ""}`}
            onClick={() => onPick(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── The screen ───────────────────────────────────────────────────────────────

/**
 * No habit door remains on this screen — the builder's habit name became a
 * pure selection (user-ruled 2026-07-27), which is the drawn
 * identity-is-a-door law yielding where following it would throw away the
 * comparison being built. If a door is wanted back, the stat tile's label is
 * its natural home.
 */
export function CompareDashboard() {
  const data = useCompareData();
  const [cfg, setCfg] = useState<CompareCfg>(emptyCfg);
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const today = todayLocal();

  const activeHabits = useMemo(
    () => data.habits.filter((h) => !h.archived).sort((a, b) => a.sortOrder - b.sortOrder),
    [data.habits],
  );
  // pickedScopes computed ONCE per (cfg, data) and threaded into every gate
  // call — it was re-derived ~5× per render (2026-07-30).
  const picked = useMemo(() => pickedScopes(cfg, data), [cfg, data]);
  const columns = useMemo(() => measureColumns(cfg, data, picked), [cfg, data, picked]);
  const units = useMemo(() => countUnits(cfg, data, picked), [cfg, data, picked]);
  const sets = useMemo(() => daySets(cfg, data, picked), [cfg, data, picked]);
  const result = useMemo(() => buildResult(cfg, data, today), [cfg, data, today]);
  const cross = picked.length > 1;
  const pick = cfg.measure;

  /**
   * Level 1. Carries forward whatever the new pick can still use — swapping
   * Total→Average keeps the count unit, so only the genuinely new question is
   * asked — and pre-answers a single-option refinement rather than posing a
   * question with one answer.
   */
  const choose = (column: MeasurePick["column"], family: MeasureFamily) =>
    setCfg((c) => {
      const prev = c.measure;
      const next: MeasurePick = { column, family };
      if (column === "count")
        next.unit = prev?.unit != null && units.some((u) => u.id === prev.unit)
          ? prev.unit
          : units.length === 1
            ? units[0].id
            : null;
      if (column === "day" && family === "total") next.daySet = prev?.daySet ?? "active";
      if (family === "average") next.scope = prev?.scope ?? null;
      return { ...c, measure: next };
    });

  /**
   * The Period panel's floor: an average needs a window that holds one whole
   * period of its scope, so the relative chips below that length gray out.
   */
  const minWindowDays =
    pick?.family === "average" && pick.scope != null ? AVG_SCOPE_MIN_DAYS[pick.scope] : 0;

  const patchScope = (i: number, s: Partial<ScopeCfg>) =>
    setCfg((c) => ({ ...c, scopes: c.scopes.map((sc, j) => (j === i ? { ...sc, ...s } : sc)) }));

  /** Drop a scope — or empty it, when it is the only one left. */
  const removeScope = (i: number) =>
    setCfg((c) => ({
      ...c,
      scopes:
        c.scopes.length > 1
          ? c.scopes.filter((_, j) => j !== i)
          : [{ habitId: null, split: null }],
    }));

  // The stored (partial, verbatim) form of the live configuration.
  const currentCfg: PresetCfg = useMemo(
    () => ({
      scopes: picked.map(({ scope, habit }) => ({
        habitKey: habit.key,
        split: scope.split,
      })),
      measure: cfg.measure,
      windows: cfg.windows.filter((w) => w.mode !== "none"),
      chart: cfg.chart,
      tiles: cfg.tiles,
    }),
    [picked, cfg],
  );

  const applyPreset = (p: PresetCfg) => {
    // Entry-split values whose entries were deleted resolve INCOMPLETE like a
    // stale habit or measure would (2026-07-30): dead values drop, and an
    // all-dead split drops whole rather than yielding raw-id series.
    const entryIds = new Set(data.entries.map((e) => e.id));
    const liveSplit = (s: NonNullable<PresetCfg["scopes"]>[number]["split"]) => {
      if (s == null) return null;
      if (s.field !== ENTRY_FIELD) return s;
      const values = s.values.filter((v) => entryIds.has(v));
      return values.length > 0 ? { ...s, values } : null;
    };
    setCfg((c) => ({
      scopes:
        p.scopes != null && p.scopes.length > 0
          ? p.scopes.map((s) => ({
              habitId: data.habits.find((h) => h.key === s.habitKey)?.id ?? null,
              split: liveSplit(s.split ?? null),
            }))
          : c.scopes,
      measure: p.measure !== undefined ? p.measure : c.measure,
      windows: p.windows != null && p.windows.length > 0 ? p.windows : c.windows,
      chart: p.chart !== undefined ? p.chart : c.chart,
      tiles: p.tiles ?? c.tiles,
    }));
  };

  const hasWindow = cfg.windows.some((w) => resolveWindow(w, today) != null);
  // What each step can reset, and the whole-workspace reset.
  const scopeSet = cfg.scopes.length > 1 || cfg.scopes[0]?.habitId != null;
  const chartSet = cfg.chart != null;
  const anySet = scopeSet || cfg.measure != null || hasWindow || chartSet || !cfg.tiles;
  const clearScopes = () => setCfg((c) => ({ ...c, scopes: emptyCfg().scopes, measure: null }));
  const clearMeasure = () => setCfg((c) => ({ ...c, measure: null }));
  const clearWindows = () => setCfg((c) => ({ ...c, windows: emptyCfg().windows }));
  // One panel, one reset: back to no chart and the tiles showing.
  const clearChart = () => setCfg((c) => ({ ...c, chart: null, tiles: true }));

  return (
    <div className="csdash">
      {/* The drawn sub-line under the title (the config read back / "opens
          blank · results are ephemeral") is REMOVED — user-ruled 2026-07-27;
          the builder already states the configuration. */}
      <div className="cs-head">
        <div className="cs-title">Comparing Statistics</div>
        <div className="cs-acts">
          {anySet && (
            <button className="clearall" onClick={() => setCfg(emptyCfg())} title="Reset the whole builder">
              <IUndo />
              Clear all
            </button>
          )}
          <PresetControl
            currentCfg={currentCfg}
            hasCurrent={picked.length > 0 && (cfg.measure != null || hasWindow)}
            onApply={applyPreset}
          />
        </div>
      </div>

      <div className="cs-shell">
        {/* ---- BUILDER ---- */}
        <div className="builder">
          <div className="bsec">
            <div className="bhead">
              <span className="bstep">1</span>
              <span className="btitle">Scope</span>
              <ClearBtn show={scopeSet} onClear={clearScopes} title="Clear every scope" />
            </div>
            {cfg.scopes.map((scope, i) => {
              const habit = data.habits.find((h) => h.id === scope.habitId) ?? null;
              const fields = habit != null ? data.splitFields.get(habit.id) ?? [] : [];
              const split = scope.split;
              const splitField = split != null ? fields.find((f) => f.field === split.field) ?? null : null;
              const pickerId = `habit-${i}`;
              return (
                <div className="scopeblock" key={i}>
                  {/* The remove sits BESIDE the field, not floating over it:
                      as an absolute corner control it landed under the
                      positioned field and collided with its caret. */}
                  <div className="scopetop">
                  <div className="fieldwrap">
                    <div
                      className={`field${habit == null ? " placeholder" : ""}`}
                      onClick={() => setOpenPicker((o) => (o === pickerId ? null : pickerId))}
                    >
                      {habit != null &&
                        (hasIcon(habit.icon) ? (
                          <span className="hico" style={{ color: `var(--${habit.colour})` }}>
                            <HabitIcon icon={habit.icon} />
                          </span>
                        ) : (
                          <span className="dot" style={{ background: `var(--${habit.colour})` }} />
                        ))}
                      {/* NOT a door (user-ruled 2026-07-27): inside the builder
                          the habit name is a SELECTION, so clicking it opens the
                          picker like the rest of the field — navigating away
                          mid-build was the drawn identity-is-a-door law applied
                          where it costs the user their work. */}
                      <span className="fname">{habit?.name ?? "Pick a habit to begin"}</span>
                      <span className="caret">
                        <Ico d={ICONS.chevron} />
                      </span>
                    </div>
                    {openPicker === pickerId && (
                      <Menu
                        onClose={() => setOpenPicker(null)}
                        items={[
                          ...activeHabits.map<MenuItem>((h) => ({
                            key: h.id,
                            selected: h.id === scope.habitId,
                            label: (
                              <span className="mrow">
                                {hasIcon(h.icon) ? (
                                  <span className="hico" style={{ color: `var(--${h.colour})` }}>
                                    <HabitIcon icon={h.icon} />
                                  </span>
                                ) : (
                                  <span className="dot" style={{ background: `var(--${h.colour})` }} />
                                )}
                                {h.name}
                              </span>
                            ),
                            onPick: () => patchScope(i, { habitId: h.id, split: null }),
                          })),
                        ]}
                      />
                    )}
                  </div>
                    {(cfg.scopes.length > 1 || habit != null) && (
                      /* Per-scope remove (user-ruled 2026-07-27, widened the
                         same pass): on the LAST scope it empties the row
                         rather than deleting it, so clearing one habit no
                         longer means the panel-wide Clear — which would take
                         the measure with it. */
                      <button
                        className="scoperm"
                        title={cfg.scopes.length > 1 ? "Remove this scope" : "Clear this scope"}
                        onClick={() => removeScope(i)}
                      >
                        <Ico d={ICONS.close} />
                      </button>
                    )}
                  </div>
                  {habit != null && (
                    /* ONE split per scope: picking a dimension replaces the
                       previous one, so a scope is a habit fanned exactly one
                       way (user-ruled 2026-07-27). */
                    <div className="opts">
                      {fields.map((f) => (
                        <span
                          key={f.field}
                          className={`opt${split?.field === f.field ? " on" : ""}`}
                          onClick={() =>
                            patchScope(i, {
                              split:
                                split?.field === f.field
                                  ? null
                                  : { field: f.field, values: f.values.slice(0, 2) },
                            })
                          }
                        >
                          <ISplit />
                          split by {f.label.toLowerCase()}
                        </span>
                      ))}
                    </div>
                  )}
                  {splitField != null && split != null && (
                    <SplitPanel
                      field={splitField}
                      selected={split.values}
                      onToggle={(v) =>
                        patchScope(i, {
                          split: {
                            field: split.field,
                            values: split.values.includes(v)
                              ? split.values.filter((x) => x !== v)
                              : [...split.values, v],
                          },
                        })
                      }
                    />
                  )}
                </div>
              );
            })}
            <button
              className="addrow"
              onClick={() =>
                setCfg((c) => ({ ...c, scopes: [...c.scopes, { habitId: null, split: null }] }))
              }
            >
              <Ico d={ICONS.plus} />
              Add scope
            </button>
          </div>

          <div className="bsec">
            <div className="bhead">
              <span className="bstep">2</span>
              <span className="btitle">Measure</span>
              <ClearBtn show={cfg.measure != null} onClear={clearMeasure} title="Clear the measure" />
            </div>
            {columns.length === 0 ? (
              <div className="segpick">
                <button disabled>Pick a scope first</button>
              </div>
            ) : (
              <>
                <div className="mcols">
                  {columns.map((col) => (
                    <div className="mcol" key={col.key}>
                      <p className="mcol-l">{col.label}</p>
                      <div className="segpick stack">
                        {col.families.map((fam) => (
                          <button
                            key={fam}
                            aria-pressed={pick?.column === col.key && pick.family === fam}
                            onClick={() => choose(col.key, fam)}
                          >
                            <FamilyGlyph family={fam} />
                            {FAMILY_LABEL[fam]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {/* LEVEL 2 — the refinements the pick still needs, at the
                    panel's foot (user-ruled placement). Count asks its unit
                    FIRST, then the average scope, so the questions read in
                    the order they are answered. */}
                {pick != null && (
                  <div className="refines">
                    {pick.column === "count" && units.length > 0 && (
                      <Refine
                        label="Types"
                        options={units}
                        value={pick.unit ?? null}
                        onPick={(id) =>
                          // derive from c.measure, never the render-scope pick —
                          // a queued update would resurrect the stale measure (2026-07-30)
                          setCfg((c) =>
                            c.measure == null ? c : { ...c, measure: { ...c.measure, unit: id } },
                          )
                        }
                      />
                    )}
                    {pick.column === "day" && pick.family === "total" && sets.length > 1 && (
                      <Refine
                        label="Day set"
                        options={sets}
                        value={pick.daySet ?? "active"}
                        onPick={(id) =>
                          setCfg((c) =>
                            c.measure == null ? c : { ...c, measure: { ...c.measure, daySet: id } },
                          )
                        }
                      />
                    )}
                    {pick.family === "average" && (
                      <Refine
                        label="Average per"
                        options={AVG_SCOPES.map((s) => ({ id: s, label: s[0].toUpperCase() + s.slice(1) }))}
                        value={pick.scope ?? null}
                        onPick={(id) =>
                          setCfg((c) =>
                            c.measure == null
                              ? c
                              : { ...c, measure: { ...c.measure, scope: id as AvgScope } },
                          )
                        }
                      />
                    )}
                    {/* No prompt line — the unanswered chip row IS the prompt
                        (the screen's own no-explainer-prose law; the note was
                        removed 2026-07-27). */}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="bsec">
            <div className="bhead">
              <span className="bstep">3</span>
              <span className="btitle">Period</span>
              <ClearBtn show={hasWindow || cfg.windows.length > 1} onClear={clearWindows} title="Clear every window" />
            </div>
            <PeriodPicker
              windows={cfg.windows}
              single={cross}
              today={today}
              minWindowDays={minWindowDays}
              minWindowReason={pick?.scope != null ? `one ${pick.scope}` : null}
              onChange={(windows) => setCfg((c) => ({ ...c, windows: windows.length > 0 ? windows : [{ mode: "none" }] }))}
            />
          </div>

          <div className="bsec">
            <div className="bhead">
              <span className="bstep">4</span>
              <span className="btitle">Chart</span>
              <ClearBtn show={chartSet || !cfg.tiles} onClear={clearChart} title="Tiles only, no chart" />
            </div>
            <div className="chartpick three">
              {(
                [
                  ["line", CHART_LABEL.line, GLine],
                  ["area", CHART_LABEL.area, GArea],
                  ["gbar", CHART_LABEL.gbar, GGroup],
                  ["sbar", CHART_LABEL.sbar, GStack],
                  ["hbar", CHART_LABEL.hbar, GHBar],
                  ["donut", CHART_LABEL.donut, GDonut],
                ] as [ChartKind, string, () => ReactElement][]
              ).map(([kind, label, Glyph]) => (
                <button
                  key={kind}
                  className="cpopt"
                  disabled={!result.allowed[kind]}
                  aria-pressed={cfg.chart === kind}
                  // A second press clears it — a chart is optional now that
                  // the tiles are their own section.
                  onClick={() => setCfg((c) => ({ ...c, chart: c.chart === kind ? null : kind }))}
                >
                  <Glyph />
                  <span className="cl">{label}</span>
                </button>
              ))}
            </div>
            {/* Stat tiles live INSIDE this panel as an option (user-ruled
                2026-07-27, re-cut from their own step): they are a second
                reading of the configuration, not a fourth shape, so they can
                accompany any chart — or stand alone with none picked.
                Expressed as kit-toggle-segmented (`.segctl`), NOT a sliding
                switch: the corpus has no switch anatomy, and there is direct
                precedent for a binary choice riding the segmented control
                (the type-keyed area switch was ruled reuse, not a mint). */}
            <div className="tilerow">
              <GTiles />
              <span className="cl">Stat tiles</span>
              <div className="segctl">
                <button
                  aria-pressed={cfg.tiles}
                  onClick={() => setCfg((c) => ({ ...c, tiles: true }))}
                >
                  Show
                </button>
                <button
                  aria-pressed={!cfg.tiles}
                  onClick={() => setCfg((c) => ({ ...c, tiles: false }))}
                >
                  Hide
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ---- RESULTS ---- */}
        <div className="results">
          {result.error != null ? (
            /* A legal pick the data cannot answer — stated where the answer
               would have been, per Failure & Error UX's inline-where-caused
               tier, never a toast and never a silent zero. */
            <div className="emptybox bad">
              <div className="eglyph">
                {/* ICONS.warning — same drawn path (closepath spelled Z vs z, the same command) */}
                <Ico d={ICONS.warning} />
              </div>
              <div className="et">That window is too short</div>
              <span className="es">{result.error}</span>
            </div>
          ) : !result.complete ? (
            <div className="emptybox">
              <div className="eglyph">
                <IStats />
              </div>
              <div className="et">Nothing compared yet</div>
              <span className="ehint">
                <Ico d={ICONS.back} />
                {pick == null ? "Start in the builder — pick a scope" : "Finish the measure — the builder says what's missing"}
              </span>
            </div>
          ) : result.tiles.length === 0 && result.chart == null ? (
            /* Both outputs switched off — a complete question with nothing
               asked to answer it. */
            <div className="emptybox">
              <div className="eglyph">
                <IStats />
              </div>
              <div className="et">Nothing to show</div>
              <span className="ehint">
                <Ico d={ICONS.back} />
                Turn the stat tiles on, or pick a chart
              </span>
            </div>
          ) : (
            <>
              {result.tiles.length > 0 && (
              <div className="panel">
                <div className="trow">
                  {result.tiles.map((t, i) => (
                    <div className="tile" key={i}>
                      {/* Tiles keep their DOTS: [[Iconography]] § the boundary rules
                          stat tiles icon-free ("number + label"), and the drawn CS
                          face agrees. The icon swap covers identity CHROME only —
                          builder field, menu rows, rail. */}
                      <span className="tl">
                        {t.dotSlot != null && <span className="dot" style={{ background: `var(--${t.dotSlot})` }} />}
                        {t.label}
                      </span>
                      <span className="tv">
                        {t.value}
                        {t.unit !== "" && <span className="u">{t.unit}</span>}
                      </span>
                      <span className="ts">{t.subtitle}</span>
                    </div>
                  ))}
                  {result.delta != null && (
                    <div className="tile">
                      <span className="tl">Difference</span>
                      <div className="tvrow">
                        <span className="tv">
                          {result.delta.value}
                          {result.delta.unit !== "" && <span className="u">{result.delta.unit}</span>}
                        </span>
                        <span className="deltachip">▲ {result.delta.winner}</span>
                      </div>
                      {/* empty .ts keeps the tile's line box level with its siblings */}
                      <span className="ts" />
                    </div>
                  )}
                </div>
              </div>
              )}
              {result.chart != null && (
                <div className="panel">
                  <div className="phead">
                    <span className="ptitle">{result.chart.title}</span>
                  </div>
                  <div className="chartwrap">
                    <Legend chart={result.chart} />
                    {result.chart.kind === "donut" ? (
                      <Donut chart={result.chart} />
                    ) : result.chart.kind === "hbar" ? (
                      <HBars chart={result.chart} />
                    ) : result.chart.kind === "line" || result.chart.kind === "area" ? (
                      <LineChart chart={result.chart} />
                    ) : (
                      <BarsChart chart={result.chart} />
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

