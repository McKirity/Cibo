/**
 * The cadence chassis (Build step 6 chunk 4) — ONE component for all four
 * scales, rendering `buildCadenceModel`'s output against the frozen cadence
 * FINALs. The five zones: period header · verdict visualization (+ the six-
 * tile stat block as its aside) · composition · review · habit rows.
 *
 * Doors wired: prev/next arrows · the containment updoors · habit rows → the
 * habit dashboards. Day-cell doors (verdict calendar · weekly strip · quarterly
 * ribbon · the Best-day tile) went LIVE 2026-07-27 with Daily state 2 — every
 * past day is a door to its cover wall, and a FUTURE day stays a dead route
 * (no target until the date arrives).
 */
import { useMemo, useState , type ReactNode } from "react";
import { buildCadenceModel, type CadenceModel, type HabitRowVM, type StripVM } from "./cadenceSpec";
import { dashboardListCap } from "../settings/store";
import { useCadenceData } from "./useCadenceData";
import { todayLocal } from "../metrics/clock";
import { weekDayLetters, weekDayName } from "../metrics/dates";
import { Ico, ICONS } from "../shell/icons";
import type { CadenceScale } from "../metrics/cadence";
import "./cadence.css";

export interface CadenceNav {
  scale: CadenceScale;
  anchor: string;
}

export function CadenceDashboard({
  scale,
  anchor,
  onNavigate,
  onOpenHabit,
  onOpenEntry,
  onOpenDay,
}: {
  scale: CadenceScale;
  anchor: string;
  onNavigate: (nav: CadenceNav) => void;
  onOpenHabit: (habitKey: string) => void;
  onOpenEntry: (id: string, habitKey: string) => void;
  onOpenDay?: (day: string) => void;
}) {
  const data = useCadenceData();
  // The other dashboards' today idiom — read the clock once per mount, not on
  // every render (conformed 2026-07-30).
  const [today] = useState(todayLocal);
  // Timed like the other five families (2026-08-15). This was the ONE dashboard
  // family with no `.perf-line`, which made it the one family step 4's latency
  // re-measure could not read — and the four cadence scales are exactly where
  // the wide year heatmaps put the budget under pressure.
  const { model, ms } = useMemo(() => {
    if (!data.ready) return { model: null as CadenceModel | null, ms: 0 };
    const t0 = performance.now();
    // listCap: the Settings → Tracking → Metrics value; read at build time — a
    // changed cap is live from the next navigation.
    const model = buildCadenceModel(data, scale, anchor, today, { listCap: dashboardListCap() });
    return { model, ms: performance.now() - t0 };
  }, [data, scale, anchor, today]);
  if (!model) return <div className="cadash"><p className="perf-line">Loading…</p></div>;
  return (
    <CadenceView
      model={model}
      ms={ms}
      onNavigate={onNavigate}
      onOpenHabit={onOpenHabit}
      onOpenEntry={onOpenEntry}
      onOpenDay={onOpenDay}
      today={today}
      sessionCount={data.sessions.length}
      entryCount={data.entries.length}
    />
  );
}

function CadenceView({
  model,
  ms,
  onNavigate,
  onOpenHabit,
  onOpenEntry,
  onOpenDay,
  today,
  sessionCount,
  entryCount,
}: {
  model: CadenceModel;
  ms: number;
  onNavigate: (nav: CadenceNav) => void;
  onOpenHabit: (key: string) => void;
  onOpenEntry: (id: string, habitKey: string) => void;
  onOpenDay?: (day: string) => void;
  today: string;
  sessionCount: number;
  entryCount: number;
}) {
  // A past or present day is a door to its cover wall; the future is a dead
  // route, which is the same rule the prev/next arrows already obey.
  const dayDoor = (day: string | null | undefined) =>
    onOpenDay != null && day != null && day <= today ? () => onOpenDay(day) : undefined;
  const m = model;
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [allOpen, setAllOpen] = useState(false);
  const [stackMode, setStackMode] = useState<"monthly" | "weekly">("monthly");
  const [moreShown, setMoreShown] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    const next = new Set(open);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpen(next);
  };
  const expandAll = () => {
    if (allOpen) {
      setOpen(new Set());
      setAllOpen(false);
    } else {
      setOpen(new Set(m.rows.filter((r) => r.expandable).map((r) => r.key)));
      setAllOpen(true);
    }
  };

  const cellsN =
    m.cellHeaders.kind === "daynums"
      ? m.cellHeaders.count
      : m.cellHeaders.kind === "weeknums"
        ? m.cellHeaders.nums.length
        : 12;

  return (
    <div className="cadash" data-scale={m.scale} style={{ ["--heat-ink" as string]: m.heatInk }}>
      <div className="perf-line">
        derived in {ms.toFixed(1)} ms · {sessionCount} sessions · {entryCount} entries ·
        {" "}{m.scale} {m.header.id}
      </div>

      {/* 1 · PERIOD HEADER */}
      <div className="cpanel tighthead">
        <div className="perhead">
          <button className="arrow" title={m.header.prevTip} onClick={() => onNavigate({ scale: m.scale, anchor: m.bounds.prevAnchor })}>
            <Ico d={ICONS.chevronLeft} />
          </button>
          <div className="idblock">
            <div className="pid">{m.header.id}</div>
            <div className="ctx">{m.header.ctx}</div>
          </div>
          <div className="doors">
            {m.header.up.map((u) => (
              <button key={u.scale} className="updoor" title={`Up to ${u.label}`} onClick={() => onNavigate({ scale: u.scale, anchor: m.bounds.from })}>
                {u.label} <Ico d={["M12 19V5", "m5 12 7-7 7 7"]} />
              </button>
            ))}
          </div>
          <div className="fin">
            <span className="finmark"><span className="dotm" />{m.header.finalized}</span>
            <button
              className={`arrow${m.header.nextDead ? " dead" : ""}`}
              title={m.header.nextDead ? "The future is a dead route" : m.header.nextTip}
              disabled={m.header.nextDead}
              onClick={() => onNavigate({ scale: m.scale, anchor: m.bounds.nextAnchor })}
            >
              <Ico d={ICONS.chevronRight} />
            </button>
          </div>
        </div>
      </div>

      {/* 2 · VERDICT + the six-tile stat block */}
      <div className="cpanel">
        <div className="phead"><span className="ptitle">The {m.scale}</span></div>
        {m.verdict.kind === "calendar" && (
          <div className="headliner">
            <div className="calside">
              {/* weekDayLetters, never a literal row: the CELLS already shift
                  with the week-start dial (verdict.lead is dial-aware), so a
                  fixed M-T-W-T-F-S-S mislabeled every column under Sunday. */}
              <div className="vhdr">{weekDayLetters().map((l, i) => <span key={i}>{l}</span>)}</div>
              <div className="vcal">
                {Array.from({ length: m.verdict.lead }, (_, i) => <div key={`b${i}`} className="vc blank" />)}
                {m.verdict.cells.map((c, i) => {
                  const go = dayDoor(c.day);
                  return (
                  /* No state captions on gap/unfinalized cells (user-ruled
                     2026-07-31): the appearance carries the state, the tooltip
                     keeps the words (the legend line did too, until every
                     verdict legend was removed 2026-08-16, user-ruled). Best
                     keeps its caption — it carries a count, not a state. */
                  <div key={c.day ?? `x${i}`} className={`vc ${c.cls}${c.best ? " best" : ""}${go ? " door" : ""}`} title={c.tip ?? undefined} onClick={go} role={go ? "button" : undefined} tabIndex={go ? 0 : undefined} onKeyDown={go ? onKeyActivate(go) : undefined}>
                    <span className="dn">{c.label}</span>
                    {c.best && c.done != null && <span className="hc">best · {c.done}/{c.active}</span>}
                  </div>
                  );
                })}
              </div>
            </div>
            <StatGrid m={m} cols={2} dayDoor={dayDoor} />
          </div>
        )}
        {m.verdict.kind === "strip" && (
          <>
            <div className="wstrip">
              {m.verdict.cells.map((c, i) => {
                const go = dayDoor(c.day);
                return (
                /* The .wfin state line is GONE (user-ruled 2026-07-31): its
                   whole vocabulary (unfinalized/future/finalized) restated
                   the column's appearance; the tooltip keeps the words (the
                   legend did too, until every verdict legend was removed
                   2026-08-16, user-ruled). */
                <div key={c.day ?? i} className={`wcol ${c.cls}${c.best ? " best" : ""}${go ? " door" : ""}`} title={c.tip ?? undefined} onClick={go} role={go ? "button" : undefined} tabIndex={go ? 0 : undefined} onKeyDown={go ? onKeyActivate(go) : undefined}>
                  <span className="wdow">{weekDayName(i)}</span>
                  <span className="wdate">{c.label}</span>
                  <span className="wcount">{c.done != null ? <>{c.done}<span className="u"> / {c.active}</span></> : "—"}</span>
                </div>
                );
              })}
            </div>
            <StatGrid m={m} cols={6} dayDoor={dayDoor} />
          </>
        )}
        {m.verdict.kind === "ribbon" && (
          <div className={m.scale === "year" ? "heatsplit" : "ribbonsplit"}>
            <div className={m.scale === "year" ? "heatmain" : "ribbonmain"}>
              <div className={m.scale === "year" ? "heatmap" : "ribbon"}>
                {m.verdict.cols.map((col) => (
                  <div key={col.weekNum} className={`${m.scale === "year" ? "hcol" : "rcol"}${col.monthTick ? (m.scale === "year" ? " qtick" : " tick") : ""}`}>
                    {m.scale === "quarter" && <span className="wklab">{col.weekNum}</span>}
                    {col.cells.map((c, i) => {
                      const go = dayDoor(c.day);
                      return <div key={i} className={`ncell ${c.cls}${go ? " door" : ""}`} title={c.tip ?? undefined} onClick={go} role={go ? "button" : undefined} />;
                    })}
                  </div>
                ))}
              </div>
              {m.verdict.monthLabels && (
                /* aligned to the sections (ruled): each label at its month's
                   first owned week column, on the same column grid as the map */
                <div
                  className="monthlabels aligned"
                  style={{ gridTemplateColumns: `repeat(${m.verdict.cols.length},1fr)` }}
                >
                  {m.verdict.monthLabels.map((l) => (
                    <span key={l.label} style={{ gridColumn: `${l.col + 1} / span 4`, gridRow: 1 }}>{l.label}</span>
                  ))}
                </div>
              )}
            </div>
            <div className={m.scale === "year" ? "heataside" : "ribbonaside"}>
              <StatGrid m={m} cols={m.scale === "year" ? 6 : 3} dayDoor={dayDoor} />
            </div>
          </div>
        )}
      </div>

      {/* 3 · COMPOSITION (month and up) */}
      {m.compositionRows && m.compositionRows.length > 0 && (
        <div className="cpanel">
          <div className="phead"><span className="ptitle">Where the Time Went</span></div>
          <div className="bars">
            {m.compositionRows.map((r) => (
              <div key={r.habitKey} className="brow" title={`${r.name} · ${Math.round(r.minutes / 60)} h`}>
                <span className="blabel"><span className="cdot" style={{ background: `var(--${r.colour})` }} />{r.name}</span>
                <div className="btrack"><div className="bfill" style={{ width: `${r.pct}%`, ["--series" as string]: `var(--${r.colour})` }} /></div>
                <span className="bval">{Math.round(r.minutes / 60)} h</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {m.stacked && (
        <div className="cpanel">
          <div className="phead"><span className="ptitle">Where the Year Went</span></div>
          <div className="comphead">
            <div className="ctoggle">
              <button aria-pressed={stackMode === "monthly"} onClick={() => setStackMode("monthly")}>Monthly</button>
              <button aria-pressed={stackMode === "weekly"} onClick={() => setStackMode("weekly")}>Weekly · {m.stacked.weekly.totals.length} bars</button>
            </div>
          </div>
          <StackChart data={stackMode === "monthly" ? m.stacked.monthly : m.stacked.weekly} weekly={stackMode === "weekly"} />
          {stackMode === "monthly" && (
            <div className="stacklabels">{m.stacked.monthLabels.map((l) => <span key={l}>{l}</span>)}</div>
          )}
          {/* The weekly view had NO x axis at all (fixed 2026-08-10). Fifty-three
              labels will not fit, so the row is thinned to the first bar and
              every fifth — the SAME rule the habit table's day-number header
              uses, reused verbatim rather than invented, so the app states
              "label an interval" one way. The blanks are rendered, not skipped:
              the labels share the bars' column grid, so every bar needs its
              cell or the numbers slide off the bars they name. */}
          {stackMode === "weekly" && (
            <div
              className="stacklabels weekly"
              style={{ gridTemplateColumns: `repeat(${m.stacked.weekLabels.length},1fr)` }}
            >
              {m.stacked.weekLabels.map((w, i) => (
                <span key={i}>{i === 0 || (i + 1) % 5 === 0 ? w : ""}</span>
              ))}
            </div>
          )}
          <div className="complegend">
            {m.stacked.legend.map((l) => (
              <span key={l.name} className="lg"><span className="sw" style={{ background: `var(--${l.colour})` }} />{l.name} <b>{Math.round(l.minutes / 60)} h</b></span>
            ))}
          </div>
        </div>
      )}

      {/* 4 · REVIEW / milestone band */}
      {m.milestoneCards && m.milestoneCards.length > 0 && (
        <div className="cpanel">
          <div className="phead"><span className="ptitle">Milestones This Week</span></div>
          <div className="mband">
            {m.milestoneCards.map((c, i) => (
              <div key={i} className="mcard">
                <span className="mmark"><Ico d={c.kind === "landmark" ? ["M12 7v14", "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"] : ["M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z", "m15 5 4 4"]} /></span>
                <span className="mbody">
                  <span className="mtitle" dangerouslySetInnerHTML={{ __html: c.title }} />
                  {c.when && <span className="mwhen">{c.when}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {m.review && m.review.some((col) => col.lines.length > 0) && (
        <div className="cpanel">
          <div className="phead"><span className="ptitle">{m.reviewTitle}</span></div>
          <div className="review">
            {m.review.map((col) => (
              <div key={col.label} className="rcol-r">
                <p className="rlabel">{col.label}</p>
                <div className="rlist">
                  {col.lines.length === 0 && <div className="rline"><span className="rmark">—</span><span className="rquiet">a quiet {m.scale}</span></div>}
                  {col.lines.map((l, i) => (
                    <div key={i} className="rline"><span className="rmark">—</span><span dangerouslySetInnerHTML={{ __html: l.html }} /></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5 · HABIT ROWS */}
      <div className="cpanel">
        <div className="phead">
          <span className="ptitle">Habits This {m.scale.charAt(0).toUpperCase() + m.scale.slice(1)}</span>
          <div className="pright">
            <button className="expandall" onClick={expandAll}>
              <Ico d={["m7 15 5 5 5-5", "m7 9 5-5 5 5"]} />
              <span>{allOpen ? "Collapse all" : "Expand all"}</span>
            </button>
          </div>
        </div>
        <div className="hgrid">
          <div className="hrow hdr">
            <span /><span>habit</span><span>period total</span><span>{m.bestColLabel}</span>
            {/* The cells-column header, per the FINALs' fill scripts: monthly =
                day numbers at 1 + every 5th · weekly = M T W T F S S ·
                quarterly = the majority week numbers · yearly = month letters.
                The grid columns are set inline (the base .cells head carries
                none — without this the numbers stack vertically). */}
            <span className="cells hnums" style={{ gridTemplateColumns: `repeat(${cellsN},1fr)` }}>
              {m.cellHeaders.kind === "daynums" && m.cellHeaders.count === 7 &&
                weekDayLetters().map((l, i) => <span key={i} className="hnum">{l}</span>)}
              {m.cellHeaders.kind === "daynums" && m.cellHeaders.count !== 7 &&
                Array.from({ length: m.cellHeaders.count }, (_, i) => (
                  <span key={i} className="hnum">{i + 1 === 1 || (i + 1) % 5 === 0 ? i + 1 : ""}</span>
                ))}
              {m.cellHeaders.kind === "weeknums" && m.cellHeaders.nums.map((n) => <span key={n} className="hnum">{n}</span>)}
              {m.cellHeaders.kind === "months" && ["J","F","M","A","M","J","J","A","S","O","N","D"].map((l, i) => <span key={i} className="hnum">{l}</span>)}
            </span>
            <span style={{ textAlign: "right" }}>done</span><span />
          </div>
          {m.rows.map((r) => (
            <HabitRowView
              key={r.key}
              r={r}
              open={open.has(r.key)}
              onToggle={() => toggle(r.key)}
              onOpen={() => onOpenHabit(r.key)}
              onOpenEntry={(id) => onOpenEntry(id, r.key)}
              moreShown={moreShown.has(r.key)}
              onShowMore={() => setMoreShown(new Set(moreShown).add(r.key))}
            />
          ))}
          {/* The sleep row legend is GONE with every other verdict legend
              (user-ruled 2026-08-16). ⚠ It was the one on-screen place stating
              that Sleep's filled cell means an 8 h+ NIGHT rather than merely a
              logged one (the quality rule in buildHabitRow) — that meaning now
              lives nowhere the user can read; surfaced at the removal, not
              resolved. */}
        </div>
      </div>
    </div>
  );
}

function StatGrid({ m, cols, dayDoor }: { m: CadenceModel; cols: number; dayDoor: (d: string | null | undefined) => (() => void) | undefined }) {
  return (
    <div className={`statgrid c${cols}`}>
      {m.stats.map((t) => {
        const go = t.door ? dayDoor(t.doorDay) : undefined;
        return (
        <div key={t.label} className={`tile${t.door ? " doortile" : ""}`} title={go ? "Open this day" : undefined} onClick={go} role={go ? "button" : undefined} tabIndex={go ? 0 : undefined} onKeyDown={go ? onKeyActivate(go) : undefined}>
          <span className="tl">{t.label}</span>
          <span className={`tv${t.door ? " date" : ""}`}>{t.value}{t.unit && <span className="u">{t.unit}</span>}</span>
          <span className="ts">{t.sub}</span>
        </div>
        );
      })}
    </div>
  );
}

/** Enter/Space on a non-button door — the corpus draws these as plain cells. */
const onKeyActivate = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

function StackChart({ data, weekly }: { data: { totals: number[]; segs: { colour: string; minutes: number }[][] }; weekly: boolean }) {
  const max = Math.max(1, ...data.totals);
  return (
    <div className={`stackrow ${weekly ? "weekly" : "monthly"}`} style={{ gridTemplateColumns: `repeat(${data.totals.length},1fr)` }}>
      {data.segs.map((col, i) => (
        <div key={i} className="stackcol" style={{ height: `${(data.totals[i] / max) * 100}%` }} title={`${Math.round(data.totals[i] / 60)} h`}>
          {col.map((seg, j) => (
            <div key={j} className="sseg" style={{ height: `${data.totals[i] > 0 ? (seg.minutes / data.totals[i]) * 100 : 0}%`, background: `var(--${seg.colour})` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function HabitRowView({
  r, open, onToggle, onOpen, onOpenEntry, moreShown, onShowMore,
}: {
  r: HabitRowVM;
  open: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onOpenEntry: (entryId: string) => void;
  moreShown: boolean;
  onShowMore: () => void;
}) {
  const ink = `var(--${r.colour})`;
  return (
    <div className={`hgroup${open ? " open" : ""}`}>
      <div
        className="hrow body"
        role="button"
        tabIndex={0}
        style={{ ["--cell-ink" as string]: ink, cursor: r.expandable ? "pointer" : "default" }}
        onClick={() => (r.expandable ? onToggle() : onOpen())}
        onKeyDown={onKeyActivate(() => (r.expandable ? onToggle() : onOpen()))}
      >
        <span className={`chev${r.expandable ? "" : " none"}`}><Ico d={ICONS.chevronRight} /></span>
        {/* Identity is clickable (shell law): the NAME doors to the habit even on
            expandable rows, where the row body itself toggles the strips. The
            frozen face is script-free and drew the whole row as one button with
            an accent-on-hover name — which reads as a link, so it must be one. */}
        <span className="hlab" title={`Open ${r.name}`} onClick={(e) => { e.stopPropagation(); onOpen(); }}>
          <span className="cdot" style={{ background: ink }} /><span className="hname">{r.name}</span>
        </span>
        <span className="htotal">{r.total}{r.totalSub && <span className="sub"> {r.totalSub}</span>}</span>
        <span className="hbest">{r.best}</span>
        <CellStrip cells={r.cells} />
        <span className="hdone">{r.done}</span>
        <span
          className="hdoor"
          title={`Open ${r.name}`}
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
        >
          <Ico d={ICONS.forward} />
        </span>
      </div>
      {r.expansion && open && (
        /* --cell-ink rides the wrapper so the strips' engaged cells, ticks, and
           micro-bars all wear the habit hue (the first GUI pass had them
           falling back to --verdict-done green / --text-muted grey). */
        <div className="exp" style={{ ["--cell-ink" as string]: ink }}>
          {r.expansion.sleepLine && <SleepLine v={r.expansion.sleepLine} />}
          {/* ONE CARD PER ENTRY (user-ruled 2026-08-15). The list obeys the same
              `cap`/"+ N more" the plain strips do — a habit sets one list or the
              other, never both, so the expander governs whichever is present. */}
          {r.expansion.storyCards && (
            <StoryCards
              cards={moreShown ? r.expansion.storyCards : r.expansion.storyCards.slice(0, r.expansion.cap)}
              onOpenEntry={onOpenEntry}
            />
          )}
          {(moreShown ? r.expansion.strips : r.expansion.strips.slice(0, r.expansion.cap)).map((s, i) => (
            <StripView key={i} s={s} onOpenEntry={onOpenEntry} />
          ))}
          {r.expansion.more > 0 && !moreShown && (
            <div className="estrip more" onClick={onShowMore}>
              <span className="et">+ {r.expansion.more} more</span>
            </div>
          )}
          {r.expansion.measureStrip && (
            <div className="mstrip">
              <span className="mlbl"><b>{r.expansion.measureStrip.label}</b></span>
              <span className="mbars" style={{ gridTemplateColumns: `repeat(${r.expansion.measureStrip.bars.length},1fr)` }}>
                {r.expansion.measureStrip.bars.map((v, i) => (
                  <span key={i} className={`mb${v === 0 ? " z" : ""}`} style={{ height: v > 0 ? `${Math.max(8, v * 100)}%` : undefined }} />
                ))}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CellStrip({ cells }: { cells: HabitRowVM["cells"] }) {
  if ("states" in cells)
    return (
      <span className="cells" style={{ gridTemplateColumns: `repeat(${cells.states.length},1fr)` }}>
        {cells.states.map((c, i) => <span key={i} className={`cell ${c === "f" ? "fut" : c}`} />)}
      </span>
    );
  return (
    <span className="cells" style={{ gridTemplateColumns: `repeat(${cells.intensities.length},1fr)` }}>
      {cells.intensities.map((v, i) => <span key={i} className={`cell iv${v}`} />)}
    </span>
  );
}

/** Entry strips door to their entry dashboard (identity is clickable) — the
 *  spec marked them `door: true` from the start and the CSS reserves the
 *  `.edoor` arrow column; the click and the arrow were never wired (found at
 *  the 2026-07-31 GUI pass). Vocab strips stay inert. */
/**
 * The per-entry breakdown cards, each collapsible (user-ruled 2026-08-15:
 * *"only have the first be fully expanded, rest is closed upon opening"*).
 *
 * ⚠ THE DEFAULT RE-ARMS BECAUSE THIS COMPONENT MOUNTS WITH THE EXPANSION. The
 * habit row renders it only while open, so closing the row unmounts it and the
 * next open starts from a fresh `useState` — first card expanded, the rest
 * closed, every time. Holding the set in `HabitRowView` would have needed an
 * effect watching `open` to reset it; mounting IS the reset.
 *
 * ⚠ THE CHEVRON IS ITS OWN CONTROL, NOT THE ROW. The entry line is a DOOR —
 * clicking it opens that entry's dashboard — so hanging the toggle on the strip
 * would have made one target mean two things. A card with no categoricals gets
 * no chevron at all: there is nothing under it to reveal, and an affordance
 * that opens onto nothing is worse than none.
 */
function StoryCards({
  cards,
  onOpenEntry,
}: {
  cards: { story: StripVM; groups: { heading: string; strips: StripVM[] }[] }[];
  onOpenEntry?: (entryId: string) => void;
}) {
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]));
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(i)) next.add(i);
      return next;
    });
  return (
    <>
      {cards.map((card, ci) => {
        const has = card.groups.length > 0;
        const isOpen = has && open.has(ci);
        return (
          <div className={`scard${has ? " foldable" : ""}${isOpen ? " open" : ""}`} key={ci}>
            {/* ⚠ THE FOLD RIDES IN THE STRIP'S OWN COLUMN 1, not in a wrapper
                around it. `.estrip` shares `--row-cols` with the habit row and
                starts its title at column 2 — column 1 IS the chevron gutter,
                already reserved so the two tiers line up. Wrapping the strip in
                a flex row to sit a button beside it pushed the whole seven-column
                grid right by a chevron's width and, because the strip stopped
                being a direct child of `.scard`, silently dropped the negative
                margin that pulls it flush. Two indents from one wrapper. */}
            <StripView
              s={card.story}
              story
              onOpenEntry={onOpenEntry}
              lead={
                has ? (
                  <button
                    className="sfold"
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? "Collapse" : "Expand"} ${card.story.title}`}
                    onClick={(e) => {
                      e.stopPropagation(); // the strip itself is a door to the entry
                      toggle(ci);
                    }}
                  >
                    <Ico d={ICONS.chevronRight} />
                  </button>
                ) : undefined
              }
            />
            {isOpen &&
              card.groups.map((g) => (
                <div key={g.heading}>
                  <div className="shead">{g.heading}</div>
                  {g.strips.map((s, i) => <StripView key={i} s={s} />)}
                </div>
              ))}
          </div>
        );
      })}
    </>
  );
}

function StripView({
  s,
  story,
  lead,
  onOpenEntry,
}: {
  s: StripVM;
  story?: boolean;
  /** Rendered in the grid's column 1 — the gutter `.et` leaves free. */
  lead?: ReactNode;
  onOpenEntry?: (entryId: string) => void;
}) {
  const go = s.door && s.entryId != null && onOpenEntry != null ? () => onOpenEntry(s.entryId!) : undefined;
  return (
    <div
      className={`estrip${s.door ? " door" : ""}${story ? " story" : ""}${s.inner ? " inner" : ""}`}
      title={go ? `Open ${s.title}` : undefined}
      onClick={go}
      role={go ? "button" : undefined}
      tabIndex={go ? 0 : undefined}
      onKeyDown={go ? onKeyActivate(go) : undefined}
    >
      {lead}
      <span className="et">{!s.inner && <span className="tick" />}{s.title}</span>
      <span className="etot">{s.total}</span>
      <span className="ebest">{s.best}</span>
      {s.cells && (
        <span className="cells" style={{ gridTemplateColumns: `repeat(${s.cells.length},1fr)` }}>
          {/* ⚠ THE STATE IS PASSED THROUGH, as `CellStrip` above already does
              (2026-08-15). This mapped everything that was not f/d/u onto
              `.cell.e` — a FILLED grey — so a strip cell for "closed day, this
              entry not touched" drew as a grey block while the habit row above
              it drew the same fact as an empty outline. One meaning, two faces,
              in the same column. `.cell.e` has no producer left. */}
          {s.cells.map((c, i) => <span key={i} className={`cell ${c === "f" ? "fut" : c}`} />)}
        </span>
      )}
      <span className="edoor">{s.door && <Ico d={ICONS.forward} />}</span>
    </div>
  );
}

function SleepLine({ v }: { v: import("./cadenceSpec").SleepLineVM }) {
  return (
    <div className="sleepline">
      <div className="sl-track" />
      <div className="sl-band" style={{ left: `${v.bed.left}%`, width: `${v.bed.width}%` }}>
        <span className="blab">{v.bedLabel}</span>
      </div>
      <div className="sl-avg" style={{ left: `${v.bed.avg}%` }} />
      <div className="sl-band" style={{ left: `${v.wake.left}%`, width: `${v.wake.width}%` }}>
        <span className="blab">{v.wakeLabel}</span>
      </div>
      <div className="sl-avg" style={{ left: `${v.wake.avg}%` }} />
      {v.ticks.map((t) => (
        <span key={t.label} className="sl-tick" style={{ left: `${t.left}%` }}>{t.label}</span>
      ))}
    </div>
  );
}

// Ico is the shell's shared path-only wrapper (shell/icons.tsx) — the local
// copy adopted away at the dedup pass (identical markup).
