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
import { useMemo, useState } from "react";
import { buildCadenceModel, type CadenceModel, type HabitRowVM, type StripVM } from "./cadenceSpec";
import { useCadenceData } from "./useCadenceData";
import { todayLocal } from "../metrics/clock";
import { Ico } from "../shell/icons";
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
  onOpenDay,
}: {
  scale: CadenceScale;
  anchor: string;
  onNavigate: (nav: CadenceNav) => void;
  onOpenHabit: (habitKey: string) => void;
  onOpenDay?: (day: string) => void;
}) {
  const data = useCadenceData();
  // The other dashboards' today idiom — read the clock once per mount, not on
  // every render (conformed 2026-07-30).
  const [today] = useState(todayLocal);
  const model = useMemo(
    () => (data.ready ? buildCadenceModel(data, scale, anchor, today) : null),
    [data, scale, anchor, today],
  );
  if (!model) return <div className="cadash"><p className="perf-line">Loading…</p></div>;
  return (
    <CadenceView
      model={model}
      onNavigate={onNavigate}
      onOpenHabit={onOpenHabit}
      onOpenDay={onOpenDay}
      today={today}
    />
  );
}

function CadenceView({
  model,
  onNavigate,
  onOpenHabit,
  onOpenDay,
  today,
}: {
  model: CadenceModel;
  onNavigate: (nav: CadenceNav) => void;
  onOpenHabit: (key: string) => void;
  onOpenDay?: (day: string) => void;
  today: string;
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
      {/* 1 · PERIOD HEADER */}
      <div className="cpanel tighthead">
        <div className="perhead">
          <button className="arrow" title={m.header.prevTip} onClick={() => onNavigate({ scale: m.scale, anchor: m.bounds.prevAnchor })}>
            <Ico d={["m15 18-6-6 6-6"]} />
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
              <Ico d={["m9 18 6-6-6-6"]} />
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
              <div className="vhdr"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
              <div className="vcal">
                {Array.from({ length: m.verdict.lead }, (_, i) => <div key={`b${i}`} className="vc blank" />)}
                {m.verdict.cells.map((c, i) => {
                  const go = dayDoor(c.day);
                  return (
                  <div key={c.day ?? `x${i}`} className={`vc ${c.cls}${c.best ? " best" : ""}${go ? " door" : ""}`} title={c.tip ?? undefined} onClick={go} role={go ? "button" : undefined} tabIndex={go ? 0 : undefined} onKeyDown={go ? onKeyActivate(go) : undefined}>
                    <span className="dn">{c.label}</span>
                    {c.cls === "gap" && <span className="hc">gap · 0/{c.active}</span>}
                    {c.cls === "unf" && <span className="hc">unfinalized</span>}
                    {c.best && c.done != null && <span className="hc">best · {c.done}/{c.active}</span>}
                  </div>
                  );
                })}
              </div>
              <div className="calnote"><b>Shade</b> = habits done · <b>dashed</b> = unfinalized · <b>ring</b> = best day</div>
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
                <div key={c.day ?? i} className={`wcol ${c.cls}${c.best ? " best" : ""}${go ? " door" : ""}`} title={c.tip ?? undefined} onClick={go} role={go ? "button" : undefined} tabIndex={go ? 0 : undefined} onKeyDown={go ? onKeyActivate(go) : undefined}>
                  <span className="wdow">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}</span>
                  <span className="wdate">{c.label}</span>
                  <span className="wcount">{c.done != null ? <>{c.done}<span className="u"> / {c.active}</span></> : "—"}</span>
                  <span className="wfin">{c.cls === "unf" ? "unfinalized — unknown" : c.cls === "blank future" ? "future" : c.best ? "best day · finalized" : "finalized"}</span>
                </div>
                );
              })}
            </div>
            <div className="calnote"><b>Shade</b> = habits done · <b>dashed</b> = unfinalized · <b>ring</b> = best day</div>
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
          <div className="phead"><span className="ptitle">Where the time went</span></div>
          <div className="bars">
            {m.compositionRows.map((r) => (
              <div key={r.habitKey} className="brow" title={`${r.name} · ${Math.round(r.minutes / 60)} h`}>
                <span className="blabel"><span className="cdot" style={{ background: `var(--${r.colour})` }} />{r.name}</span>
                <div className="btrack"><div className="bfill" style={{ width: `${r.pct}%`, background: `var(--${r.colour})` }} /></div>
                <span className="bval">{Math.round(r.minutes / 60)} h</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {m.stacked && (
        <div className="cpanel">
          <div className="phead"><span className="ptitle">Where the year went</span></div>
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
          <div className="phead"><span className="ptitle">Milestones this week</span></div>
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
          <span className="ptitle">Habits this {m.scale}</span>
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
                ["M", "T", "W", "T", "F", "S", "S"].map((l, i) => <span key={i} className="hnum">{l}</span>)}
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
              moreShown={moreShown.has(r.key)}
              onShowMore={() => setMoreShown(new Set(moreShown).add(r.key))}
            />
          ))}
          {m.rowLegendSleep && (
            <div className="rowlegend">
              <span className="lg"><span className="cell d" /> done</span>
              <span className="lg"><span className="cell m" /> missed</span>
              <span className="lg"><span className="cell u" /> unknown</span>
              <span className="lg"><span className="cell d" style={{ ["--cell-ink" as string]: "var(--habit-6)" }} /> 8 h+ night</span>
            </div>
          )}
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
  r, open, onToggle, onOpen, moreShown, onShowMore,
}: {
  r: HabitRowVM;
  open: boolean;
  onToggle: () => void;
  onOpen: () => void;
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
      >
        <span className={`chev${r.expandable ? "" : " none"}`}><Ico d={["m9 18 6-6-6-6"]} /></span>
        <span className="hlab"><span className="cdot" style={{ background: ink }} /><span className="hname">{r.name}</span></span>
        <span className="htotal">{r.total}{r.totalSub && <span className="sub"> {r.totalSub}</span>}</span>
        <span className="hbest">{r.best}</span>
        <CellStrip cells={r.cells} />
        <span className="hdone">{r.done}</span>
        <span
          className="hdoor"
          title={`Open ${r.name}`}
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
        >
          <Ico d={["M5 12h14", "m12 5 7 7-7 7"]} />
        </span>
      </div>
      {r.expansion && open && (
        /* --cell-ink rides the wrapper so the strips' engaged cells, ticks, and
           micro-bars all wear the habit hue (the first GUI pass had them
           falling back to --verdict-done green / --text-muted grey). */
        <div className="exp" style={{ ["--cell-ink" as string]: ink }}>
          {r.expansion.sleepLine && <SleepLine v={r.expansion.sleepLine} />}
          {r.expansion.storyCard && (
            <div className="scard">
              {r.expansion.storyCard.story.map((s, i) => <StripView key={`s${i}`} s={s} story />)}
              {r.expansion.storyCard.groups.map((g) => (
                <div key={g.heading}>
                  <div className="shead">{g.heading}</div>
                  {g.strips.map((s, i) => <StripView key={i} s={s} />)}
                </div>
              ))}
            </div>
          )}
          {(moreShown ? r.expansion.strips : r.expansion.strips.slice(0, r.expansion.cap)).map((s, i) => (
            <StripView key={i} s={s} />
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

function StripView({ s, story }: { s: StripVM; story?: boolean }) {
  return (
    <div className={`estrip${s.door ? " door" : ""}${story ? " story" : ""}${s.inner ? " inner" : ""}`}>
      <span className="et">{!s.inner && <span className="tick" />}{s.title}</span>
      <span className="etot">{s.total}</span>
      <span className="ebest">{s.best}</span>
      {s.cells && (
        <span className="cells" style={{ gridTemplateColumns: `repeat(${s.cells.length},1fr)` }}>
          {s.cells.map((c, i) => <span key={i} className={`cell ${c === "f" ? "fut" : c === "d" ? "d" : c === "u" ? "u" : "e"}`} />)}
        </span>
      )}
      <span className="edoor">{s.door && <Ico d={["M5 12h14", "m12 5 7 7-7 7"]} />}</span>
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
