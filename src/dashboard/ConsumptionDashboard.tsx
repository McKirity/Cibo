/**
 * Build step 6 — the consumption habit-dashboard, generalized from the step-4
 * Gaming slice. ONE component now renders every consumption habit (Gaming ·
 * Reading · Media) off its habit key: schema → indexed Evolu fetch
 * (useConsumptionData) → the shared derivation layer (../metrics) → the
 * composition spec (consumptionSpec) → the kit blocks (kit.tsx).
 *
 * The Medium-bearing variant (Reading/Media, the frozen `reading-stats.html`)
 * is the same template plus the entry-level `type`: a live Medium sub-scope in
 * the masthead + a leading "By type" distribution — both definition-driven off
 * the habit's declared type vocab, both absent for Gaming (empty vocab).
 */
import { useMemo, useState, type CSSProperties } from "react";
import { todayLocal } from "../metrics/clock";
import { requestLibraryImport, requestSettingsNav } from "../shell/navRequest";
import { HabitIcon, hasIcon } from "../shell/habitIcons";
import { useConsumptionData } from "./useConsumptionData";
import { buildConsumptionDashboard, type DashboardModel, type ScopeSel } from "./consumptionSpec";
import { HEAT_CLASS } from "./specShared";
import {
  DistributionColumns,
  Heatmap,
  LeaderboardColumns,
  Panel,
  StatGroup,
  TrendPanel,
} from "./kit";
import { EntryCreationModal } from "../library/EntryCreationModal";
import "../dashboard.css";
import "./screen.css";

// Zero-level heat word is per-habit — Reading reads, Media watches, the rest
// play (the entrySpec wave-verb mapping, mirrored 2026-07-30). The duration
// words stay shared.
const HEAT_ZERO_WORD: Record<string, string> = {
  reading: "no reading",
  media: "no watching",
};

export function ConsumptionDashboard({
  habitKey,
  onOpenEntry,
  onOpenLibrary,
}: {
  habitKey: string;
  /** Entry doors (chunk 5) — leaderboard rows, hall covers, catalog cards. */
  onOpenEntry?: (entryId: string) => void;
  /** The masthead's library door (live since the step-6 catch-up). */
  onOpenLibrary?: () => void;
}) {
  const data = useConsumptionData(habitKey);
  const [today] = useState(todayLocal);
  const [scope, setScope] = useState<ScopeSel>({ kind: "all" });
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  // The empty state's "Add entries" door — the creation modal summoned from
  // this dashboard, the CreationDashboard pattern (2026-07-30).
  const [creationOpen, setCreationOpen] = useState(false);

  const { model, ms } = useMemo(() => {
    // Cheap early return before ready — never derive a model from a half-loaded
    // store (EntryDashboard's pattern, conformed 2026-07-30).
    if (!data.ready) return { model: null as DashboardModel | null, ms: 0 };
    const t0 = performance.now();
    const model = buildConsumptionDashboard(
      {
        colourSlot: data.colourSlot,
        name: data.name,
        archived: data.archived,
        sessions: data.sessions,
        entries: data.entries,
        finalized: data.finalized,
        today,
        typeVocab: data.typeVocab,
        appActiveDays: data.appActiveDays,
      },
      scope,
      typeFilter,
    );
    return { model, ms: performance.now() - t0 };
  }, [data, scope, today, typeFilter]);

  if (!data.ready || model == null) return <div className="gsdash">Loading {habitKey}…</div>;

  const m = model;
  const color = m.colorVar;

  return (
    <div className="gsdash" style={{ "--heat-hue": `var(${color})` } as CSSProperties}>
      <div className="perf-line">
        derived in {ms.toFixed(1)} ms · {data.sessions.length} sessions · {data.entries.length} entries ·
        scope {scope.kind === "all" ? "All Time" : scope.year}
        {m.masthead.activeType ? ` · ${m.masthead.activeType}` : ""}
      </div>

      {m.masthead.empty ? (
        <EmptyState
          name={m.masthead.name}
          entryCount={data.entries.length}
          onOpenLibrary={onOpenLibrary}
          onAddEntries={() => setCreationOpen(true)}
          onRunImport={
            onOpenLibrary == null
              ? undefined
              : () => {
                  requestLibraryImport();
                  onOpenLibrary();
                }
          }
        />
      ) : (
        <div className="gs">
          {/* ── Masthead ── */}
          <section className="panel mast">
            {/* Icon first, lettermark as fallback — the FINALs draw an icon here
                (restored 2026-08-06; see SimpleDashboard's note). */}
            <div className="art" style={{ ["--habit-hue" as string]: `var(${color})` }}>
              {hasIcon(data.icon) ? <HabitIcon icon={data.icon} /> : <span>{m.masthead.name[0]?.toUpperCase()}</span>}
            </div>
            <div className="idcol">
              <div className="idrow">
                <span className="hname">{m.masthead.name}</span>
                {m.masthead.heat && (
                  // inline display defeats the claimed `.heatchip.cold{display:none}`
                  // — same as the other three dashboards, so COLD renders here too.
                  <span className={`heatchip ${HEAT_CLASS[m.masthead.heat]}`} style={{ display: "inline-flex" }}>
                    {m.masthead.heat}
                  </span>
                )}
              </div>
              <div className="since">{m.masthead.sinceLive}</div>
              <div className="tabs">
                {m.masthead.tabs.map((tab) => (
                  <button
                    key={tab.key}
                    className={`tab${tab.key === m.masthead.activeKey ? " on" : ""}`}
                    onClick={() =>
                      setScope(tab.key === "all" ? { kind: "all" } : { kind: "year", year: tab.key })
                    }
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {m.masthead.typeTabs.length > 0 && (
                <div className="subtabs">
                  <span className="stlabel">Type</span>
                  {m.masthead.typeTabs.map((tab) => (
                    <button
                      key={tab.key ?? "all"}
                      className={`subtab${tab.key === m.masthead.activeType ? " on" : ""}`}
                      onClick={() => setTypeFilter(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="libdoor"
              type="button"
              title={`Open the ${data.name} library`}
              onClick={onOpenLibrary}
            >
              {/* the drawn face: book glyph · Library · door arrow (gaming FINAL) */}
              <svg className="ico" viewBox="0 0 24 24">
                <path d="M12 7v14" />
                <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
              </svg>
              Library
              <svg
                className="ico"
                viewBox="0 0 24 24"
                style={{
                  width: "var(--icon-size-small)",
                  height: "var(--icon-size-small)",
                  color: "var(--text-muted)",
                }}
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </button>
          </section>

          <div className="gs-body">
            {/* ── At a glance ── */}
            <Panel title="At a Glance">
              <StatGroup label="Engagement" tiles={m.engagement} tall />
              <StatGroup label="Volume" tiles={m.volume} />
              {m.catalog.length > 0 && <StatGroup label="Catalog" tiles={m.catalog} />}
            </Panel>

            {/* ── Catalog (the YouTube face ONLY since 2026-08-22, user-ruled).
                 Designed in Claude Design: stacked sections — the By-genre
                 bars, then a "Channels" hall of ranked cover-cards
                 (name → hours). The bars section skips when no channel carries
                 a genre yet. ── */}
            {m.mergedCatalog && (
              <Panel title="Catalog">
                {m.mergedCatalog.dist && (
                <div className="catsec">
                  <div className="dcol">
                    <div className="chead">
                      <span className="ct">{m.mergedCatalog.dist.title}</span>
                    </div>
                    <div className="bars">
                      {m.mergedCatalog.dist.rows.map((r, i) => (
                        <div className="brow" key={i} title={r.tip}>
                          <span className="blabel">{r.label}</span>
                          <div className="btrack">
                            <div className="bfill" style={{ width: `${r.pct}%`, ["--series" as string]: `var(${r.colorVar})` }} />
                          </div>
                          <span className="bval">{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                )}
                <div className="catsec">
                  <div className="dcol">
                    <div className="chead">
                      <span className="ct">{m.mergedCatalog.hallTitle}</span>
                    </div>
                    <div className="hall">
                      {m.mergedCatalog.tile.list?.rows.map((r, i) => (
                        <div
                          className="cover"
                          key={i}
                          title={`${r.k} · ${r.v}`}
                          role={r.entryId && onOpenEntry ? "button" : undefined}
                          onClick={r.entryId && onOpenEntry ? () => onOpenEntry(r.entryId!) : undefined}
                        >
                          <span className="rk">{i + 1}</span>
                          <div className="chan">
                            <span className="cn">{r.k}</span>
                            <span className="ch">{r.v}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Panel>
            )}

            {/* ── Distributions ── */}
            {m.distributions.length > 0 && (
              <Panel title="Distributions">
                <DistributionColumns columns={m.distributions} />
              </Panel>
            )}

            {/* ── Leaderboards (degradation: the zone doesn't render when every
                 column dropped — e.g. a pinned type + a year before it existed) ── */}
            {m.leaderboards.length > 0 && (
              <Panel title="Leaderboards">
                <LeaderboardColumns columns={m.leaderboards} onOpenEntry={onOpenEntry} />
              </Panel>
            )}

            {/* ── Trends ── */}
            <TrendPanel
              caption={m.trend.caption}
              line={m.trend.line}
              vmax={m.trend.vmax}
              xticks={m.trend.xticks}
              sparkTitle={m.trend.sparkTitle}
              sparkDelta={m.trend.sparkDelta}
              spark={m.trend.spark}
              sparkMax={m.trend.sparkMax}
              color={color}
            />

            {/* ── Activity heatmap (Intensity · By-Type toggle when Medium-bearing) ── */}
            <Heatmap
              cells={m.heatmap.cells}
              months={m.heatmap.months}
              trio={m.heatmap.trio}
              hasTypes={m.heatmap.hasTypes}
              legend={m.heatmap.legend}
              zeroWord={HEAT_ZERO_WORD[habitKey]}
            />
          </div>
        </div>
      )}

      {creationOpen && (
        <EntryCreationModal
          habitKey={habitKey}
          onClose={() => setCreationOpen(false)}
          onOpenEntry={(id) => {
            setCreationOpen(false);
            onOpenEntry?.(id);
          }}
        />
      )}
    </div>
  );
}

/**
 * The zero state. `empty` is computed from SESSIONS alone (consumptionSpec's
 * `fullFirst == null`), which is right for a stats screen — with nothing logged
 * there are no statistics to draw.
 *
 * ⚠ BUT ENTRIES CAN EXIST WHILE SESSIONS DO NOT, and until 2026-08-09 this face
 * hid them (bug `dash-1`, found by the user at Phase 2 tour 7 while setting up
 * `vocab-1`'s test habit). The only route to a populated library was **"Run an
 * import"** — which does navigate there, but by asking for something the user
 * did not want and opening a modal over the thing they did. The copy said
 * *"Nothing tracked yet"* to someone looking at a habit whose entries they had
 * just created.
 *
 * So the door and the words are both conditioned on entries now. **This is an
 * ADDITION to the drawn face** (recorded as such, not as a conform): the FINAL
 * draws three doors, composed when the only way to get entries into a
 * consumption habit was an importer that also logs sessions. FOURTH instance of
 * this project's most-repeated copy failure — the library caption, the wall's
 * channel tile and the AO3 queue's "click a cover" were all written around a
 * state that a later state contradicted.
 */
function EmptyState({
  name,
  entryCount = 0,
  onAddEntries,
  onOpenLibrary,
  onRunImport,
}: {
  name: string;
  entryCount?: number;
  onAddEntries?: () => void;
  onOpenLibrary?: () => void;
  onRunImport?: () => void;
}) {
  const hasEntries = entryCount > 0;
  return (
    <div className="gs-empty" style={{ display: "block" }}>
      <div className="emptybox gen">
        <div className="eh">{hasEntries ? "Nothing logged yet" : "Nothing tracked yet"}</div>
        <div className="es">
          {hasEntries
            ? `${name} has ${entryCount} ${entryCount === 1 ? "entry" : "entries"} but nothing logged against them yet — log a session to bring this dashboard to life.`
            : `${name} has no sessions yet — log one, run an import, or set an icon to bring this dashboard to life.`}
        </div>
        {/* The original three doors are live since 2026-08-04 (the re-wire
            batch): "Run an import" opens the library WITH its import modal (the
            one-shot navRequest pattern); "Set an icon" routes to Settings →
            Habits. "Open library" joins them only when there is a library worth
            opening — an empty habit's library is the same nothing this screen
            is already showing, and a door onto nothing is noise. */}
        <div className="edoors">
          <button className="btn-accent" type="button" onClick={onAddEntries}>Add entries</button>
          {hasEntries && onOpenLibrary != null && (
            <button className="btn-plain" type="button" onClick={onOpenLibrary}>Open library</button>
          )}
          <button className="btn-plain" type="button" disabled={onRunImport == null} onClick={onRunImport}>Run an import</button>
          <button className="btn-plain" type="button" title="Opens Settings → Habits" onClick={() => requestSettingsNav("habits")}>Set an icon</button>
        </div>
      </div>
    </div>
  );
}
