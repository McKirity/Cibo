/**
 * Build step 6 catch-up — the Map: the table of contents. A translation of
 * `Final/map.html` (two collapsible outline trunks, Time · Content; every
 * line a door, text not tiles — the one visual is the habit identity dot).
 * The outline is screen-specific composition, NOT a kit block (ruled at the
 * freeze; the day-log-tree kinship was closed, no shared block).
 *
 * Interaction (the per-screen note's mechanics + "every line a door"):
 * clicking a header ROW (or its chevron) toggles the level; the door LABEL
 * itself navigates. Leaf rows navigate on any click. Laziness is the render:
 * a closed level renders nothing (React conditional = the drawn lazy fill).
 * Collapse state is component state — view-only, never persisted.
 *
 * Doors wear the chip-face tooltip (kit-tooltip's first app tenant).
 */
import { useMemo, useState, type ReactNode } from "react";
import {
  buildTimeTrunk,
  monthDayRows,
  pageEntries,
  MONTHS,
  type TimeYear,
} from "./mapSpec";
import { useMapData, type MapHabit } from "./useMapData";
import { pagerCells } from "../library/librarySpec";
import { HabitIcon, hasIcon } from "../shell/habitIcons";
import type { CadenceScale } from "../metrics/cadence";
import "./map.css";

export interface MapNav {
  openCadence(scale: CadenceScale, anchor: string): void;
  openDay(day: string): void;
  openHabit(key: string): void;
  openEntry(id: string, habitKey: string): void;
}

// Clean Up queue A: todayLocal() joins the app-wide dedupe when the hold lifts.
const todayLocal = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function MapScreen({ nav }: { nav: MapNav }) {
  const today = todayLocal();
  const data = useMapData(Number(today.slice(0, 4)));
  const time = useMemo(() => buildTimeTrunk(data.firstYear, today), [data.firstYear, today]);

  // open-node set — view-only, resets with the mount (never persisted)
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // per-habit entry page (user-ruled 2026-07-30: entry lists PAGINATE) —
  // view-only like the collapse state, resets on leave
  const [pageByHabit, setPageByHabit] = useState<ReadonlyMap<string, number>>(() => new Map());

  return (
    <div className="mapscreen">
      <div className="maphead">
        <span className="mt">Map</span>
      </div>
      <div className="trunks">
        <section className="trunk">
          <div className="trunk-head">
            {/* "Period", not the drawn "Time" (user-ruled 2026-07-30) —
                matches the app's period vocabulary; the notes' "Time trunk"
                stays the internal name. Header icons user-ruled the same day
                (calendar · library — chrome glyphs, never data). */}
            <svg className="ico" viewBox="0 0 24 24">
              <rect width="18" height="18" x="3" y="4" rx="2" />
              <path d="M16 2v4" />
              <path d="M8 2v4" />
              <path d="M3 10h18" />
            </svg>
            <span className="th">Period</span>
          </div>
          <div className="trunk-body">
            {time.map((yr) => (
              <YearNode key={yr.year} yr={yr} today={today} open={open} onToggle={toggle} nav={nav} />
            ))}
          </div>
        </section>
        <section className="trunk">
          <div className="trunk-head">
            <svg className="ico" viewBox="0 0 24 24">
              <path d="m16 6 4 14" />
              <path d="M12 6v14" />
              <path d="M8 8v12" />
              <path d="M4 4v16" />
            </svg>
            <span className="th">Content</span>
          </div>
          <div className="trunk-body">
            {data.habits.map((h) => (
              <HabitNode
                key={h.id}
                habit={h}
                entries={data.entriesByHabit.get(h.id) ?? []}
                open={open.has(`h-${h.id}`)}
                page={pageByHabit.get(h.id) ?? 0}
                onPage={(p) => setPageByHabit((prev) => new Map(prev).set(h.id, p))}
                onToggle={() => toggle(`h-${h.id}`)}
                nav={nav}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ── outline building blocks (screen-specific composition) ── */

function Node({ open, row, children }: { open: boolean; row: ReactNode; children?: ReactNode }) {
  return (
    <div className="node" data-open={open ? "true" : "false"}>
      {row}
      {open && <div className="children">{children}</div>}
    </div>
  );
}

function HeadRow({
  label,
  variant,
  tip,
  lead,
  onToggle,
  onOpen,
}: {
  label: string;
  variant: string;
  tip: string;
  lead?: ReactNode;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    // The row is the keyboard toggle (2026-07-30): the twist stays out of the
    // tab order so the level costs one stop, not two — the door beside it is
    // already a real button.
    <div
      className={`row head ${variant}`}
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <button className="twist" aria-label="Expand / collapse" tabIndex={-1}>
        <svg className="ico" viewBox="0 0 24 24">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
      {lead}
      <button
        className="door"
        data-tip={tip}
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
      >
        {label}
      </button>
    </div>
  );
}

function LeafRow({
  label,
  variant,
  tip,
  onOpen,
}: {
  label: string;
  variant: string;
  tip: string;
  onOpen: () => void;
}) {
  return (
    <div className={`row leaf ${variant}`} onClick={onOpen}>
      <span className="leafcx" />
      <button className="door" data-tip={tip}>
        {label}
      </button>
    </div>
  );
}

/* ── Time trunk ── */

function YearNode({
  yr,
  today,
  open,
  onToggle,
  nav,
}: {
  yr: TimeYear;
  today: string;
  open: ReadonlySet<string>;
  onToggle: (id: string) => void;
  nav: MapNav;
}) {
  const yid = `y-${yr.year}`;
  return (
    <Node
      open={open.has(yid)}
      row={
        <HeadRow
          label={`${yr.year}`}
          variant="year"
          tip={`${yr.year} → year dashboard`}
          onToggle={() => onToggle(yid)}
          onOpen={() => nav.openCadence("year", yr.anchor)}
        />
      }
    >
      {yr.quarters.map((q) => {
        const qid = `q-${yr.year}-${q.q}`;
        return (
          <Node
            key={qid}
            open={open.has(qid)}
            row={
              <HeadRow
                label={q.label}
                variant="quarter"
                tip={`Q${q.q} ${yr.year} → quarter dashboard`}
                onToggle={() => onToggle(qid)}
                onOpen={() => nav.openCadence("quarter", q.anchor)}
              />
            }
          >
            {q.months.map((m) => {
              const mid = `m-${m.y}-${m.m}`;
              return (
                <Node
                  key={mid}
                  open={open.has(mid)}
                  row={
                    <HeadRow
                      label={m.label}
                      variant="month"
                      tip={`${m.label} ${m.y} → month dashboard`}
                      onToggle={() => onToggle(mid)}
                      onOpen={() => nav.openCadence("month", m.anchor)}
                    />
                  }
                >
                  {open.has(mid) &&
                    monthDayRows(m.y, m.m, today).map((d) => (
                      <LeafRow
                        key={d.iso}
                        label={d.label}
                        variant="day"
                        tip={`${d.label.slice(0, 3)} ${Number(d.iso.slice(8, 10))} ${MONTHS[m.m - 1]} ${m.y} → that day's Daily`}
                        onOpen={() => nav.openDay(d.iso)}
                      />
                    ))}
                </Node>
              );
            })}
          </Node>
        );
      })}
    </Node>
  );
}

/* ── Content trunk ── */

function HabitNode({
  habit,
  entries,
  open,
  page,
  onPage,
  onToggle,
  nav,
}: {
  habit: MapHabit;
  entries: { id: string; title: string }[];
  open: boolean;
  page: number;
  onPage: (p: number) => void;
  onToggle: () => void;
  nav: MapNav;
}) {
  const pg = pageEntries(entries, page);
  return (
    <Node
      open={open}
      row={
        <HeadRow
          label={habit.name}
          variant="habit"
          tip={`${habit.name} → stats dashboard`}
          // the TINTED GLYPH (user-ruled 2026-07-30, second step — the box
          // struck): the icon itself wears the habit colour; tinted
          // lettermark = the icon-less fallback
          lead={
            <span className="hglyph" style={{ color: `var(--${habit.colourSlot})` }}>
              {hasIcon(habit.icon) ? <HabitIcon icon={habit.icon} /> : habit.name[0]?.toUpperCase()}
            </span>
          }
          onToggle={onToggle}
          onOpen={() => nav.openHabit(habit.key)}
        />
      }
    >
      {pg.shown.map((e) => (
        <LeafRow
          key={e.id}
          label={e.title}
          variant="entry-row"
          tip={`${e.title} → entry dashboard`}
          onOpen={() => nav.openEntry(e.id, habit.key)}
        />
      ))}
      {/* an expanded habit with no entries says so (2026-07-30) — an empty
          region reads as a render failure */}
      {pg.total === 0 && (
        <div className="row emptyrow">
          <span className="leafcx" />
          <span className="noentries">No entries yet</span>
        </div>
      )}
      {/* entry lists PAGINATE, NUMBERED (user-ruled 2026-07-30 ×2) — the
          library's pager face at outline scale, its pagerCells window reused
          (1-based there, 0-based here); the drawn "+ N more" disclosure row
          died with the first ruling */}
      {pg.pages > 1 && (
        <div className="row pagerrow">
          <span className="leafcx" />
          <div className="pgnums">
            <button
              className="pgnum arrow"
              title="Previous page"
              disabled={pg.page === 0}
              onClick={() => onPage(pg.page - 1)}
            >
              <svg className="ico" viewBox="0 0 24 24">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            {pagerCells(pg.page + 1, pg.pages).map((c, i) =>
              c === "…" ? (
                <span key={`e${i}`} className="pgell">
                  …
                </span>
              ) : (
                <button
                  key={c}
                  className={`pgnum${c === pg.page + 1 ? " on" : ""}`}
                  onClick={() => onPage(c - 1)}
                >
                  {c}
                </button>
              ),
            )}
            <button
              className="pgnum arrow"
              title="Next page"
              disabled={pg.page === pg.pages - 1}
              onClick={() => onPage(pg.page + 1)}
            >
              <svg className="ico" viewBox="0 0 24 24">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
          <span className="pgcount">
            {pg.from}–{pg.to} of {pg.total}
          </span>
        </div>
      )}
    </Node>
  );
}
