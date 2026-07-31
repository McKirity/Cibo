/**
 * DAILY — STATE 2, THE COVER WALL.
 *
 * The day's keepsake: a thin HEAD (date + the edit-day corner button — and no
 * day-summary stats line, because this is a keepsake, not a report) over a
 * full-bleed masonry WALL. The two zones never rearrange; only the wall's
 * population changes.
 *
 * Translated from `Final/daily-state-2.html`. What the FINAL could not give:
 *
 *  · THE PACK. The frozen file hand-places its three walls "to demonstrate" and
 *    says so; `wallPack.ts` is the centre-out algorithm it left to Build.
 *  · THE KEEPSAKE ART. The FINAL froze the tile ANATOMY and stood in
 *    placeholder art; the real six were authored 2026-07-26 and ship as
 *    pre-seeded snippets, drawn here through `KeepsakeTile`'s shadow root.
 *  · THE MILESTONE FAMILY CARDS. Nothing milestone-bearing is drawn in the
 *    frozen file — a Build-side addition designed ahead of the build (direction
 *    D, "the sealed certificate").
 *
 * THE MILESTONE CARDS ARE MEASURED, NOT AUTHORED. Width is the fewest whole
 * columns that hold the longest line; height is the measured content quantised
 * to the half-unit step. That is this screen's own "shape follows content" rule
 * applied to a text card — and the exhibit recorded that hand-assigning the
 * spans was wrong twice in two attempts, so they are computed here.
 */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { dayRevision } from "./spineSpec";
import {
  buildWall,
  toPackInputs,
  type ClusterTile,
  type BannerTile,
  type CoverTile,
  type HoroscopeWallTile,
  type KeepsakeWallTile,
  type MilestoneTile,
  type StreaksTile,
  type TarotWallTile,
  type UnloggedTile,
  type WallTile,
  type WeatherWallTile,
  type WhimsyWhich,
} from "./wallSpec";
import { packWall, type Span } from "./wallPack";
import { KeepsakeTile } from "./KeepsakeTile";
import { useWallData } from "./useWallData";
import { useMilestoneDay } from "./useMilestoneDay";
import { displayTemp, weatherWords } from "./feedData";
import { holidayFor, factFor, onThisDay, quoteFor, signGlyph, timeProgress, wordFor } from "./almanac";
import { moonDiscPaths, moonInfo, seasonBand, seasonInfo, sunInfo } from "./sky";
import { loadWhimsyConfig } from "./whimsyConfig";
import { HabitIcon, hasIcon } from "../shell/habitIcons";
import { hoursMinutes } from "../metrics/format";
import "./daily.css";

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const MONTH_VARS = [
  "--month-jan", "--month-feb", "--month-mar", "--month-apr",
  "--month-may", "--month-jun", "--month-jul", "--month-aug",
  "--month-sep", "--month-oct", "--month-nov", "--month-dec",
];

// ── The screen ───────────────────────────────────────────────────────────────

export function CoverWall({
  dayKey,
  onEditDay,
  onOpenEntry,
}: {
  dayKey: string;
  onEditDay: () => void;
  onOpenEntry?: (entryId: string, habitKey: string | null) => void;
}) {
  const data = useWallData(dayKey);
  const revision = useMemo(
    () => dayRevision(data.sessions, data.cats),
    [data.sessions, data.cats],
  );
  const milestones = useMilestoneDay(dayKey, revision);
  const [config] = useState(loadWhimsyConfig);

  // The eight COMPUTED whimsy cards recompute for the date ("time-travelling
  // shows the day as it was"). The three ephemeral ones — weather · horoscope ·
  // tarot — come from `feed_snapshot` (live since the network tier, 2026-07-27):
  // exactly what the day captured, and absent means OMITTED, never faked.
  const whimsy = useMemo<WhimsyWhich[]>(() => {
    const list: WhimsyWhich[] = ["sun", "season", "moon", "word", "fact", "quote", "year"];
    if (onThisDay(dayKey).length > 0) list.push("otd");
    if (holidayFor(dayKey) != null) list.push("holiday");
    return list;
  }, [dayKey]);

  const tiles = useMemo(
    () =>
      buildWall({
        day: dayKey,
        habits: data.habits,
        sessions: data.sessions,
        entries: data.entries,
        cats: data.cats,
        ruleHits: data.ruleHits,
        milestones,
        whimsy,
        snapshot: data.snapshot,
      }),
    [dayKey, data, milestones, whimsy],
  );

  // ── the measuring pass ────────────────────────────────────────────────────
  // Milestone/streaks cards probe all three candidate widths; the horoscope
  // tile joined 2026-07-27 (user-ruled: "the card just flexes to include the
  // entire text") at its FIXED drawn width — 4 columns, height measured.
  const probeRef = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<Map<string, Span>>(new Map());
  // The probe UNMOUNTS once its tiles are measured (2026-07-30 efficiency
  // pass) — it used to stay in the DOM for the wall's whole life. The key
  // carries the tiles' CONTENT, not just their ids, so a same-id card whose
  // text changed re-mounts the probe and re-measures.
  const [measuredKey, setMeasuredKey] = useState<string | null>(null);
  const textTiles = useMemo(
    () =>
      tiles.filter(
        (t) => t.body.kind === "milestone" || t.body.kind === "streaks" || t.body.kind === "horo",
      ),
    [tiles],
  );
  const probeWidths = (t: WallTile): number[] => (t.body.kind === "horo" ? [4] : [2, 3, 4]);
  const probeKey = useMemo(
    () => textTiles.map((t) => `${t.id}:${JSON.stringify(t.body)}`).join("|"),
    [textTiles],
  );
  const probeLive = textTiles.length > 0 && measuredKey !== probeKey;

  useLayoutEffect(() => {
    if (textTiles.length === 0) {
      if (measured.size > 0) setMeasured(new Map());
      setMeasuredKey(probeKey);
      return;
    }
    const probe = probeRef.current;
    if (probe == null) return; // already measured for this content — probe unmounted
    const cs = getComputedStyle(document.documentElement);
    const unit = parseFloat(cs.getPropertyValue("--wall-unit")) || 128;
    const gap = parseFloat(cs.getPropertyValue("--wall-gap")) || 12;
    const step = (unit - gap) / 2 + gap; // one half-row plus its own gap
    const next = new Map<string, Span>();
    for (const t of textTiles) {
      // One clone per candidate width. The narrowest width whose height
      // matches the widest IS "the fewest columns that hold the longest
      // line" — measured by its consequence, so no nowrap trickery. A
      // fixed-width tile (horo) renders one clone; the find below then lands
      // on that width because the missing candidates read Infinity.
      const heights: Record<number, number> = {};
      for (const cols of probeWidths(t)) {
        const el = probe.querySelector<HTMLElement>(`[data-probe="${t.id}:${cols}"]`);
        if (el != null) heights[cols] = el.getBoundingClientRect().height;
      }
      const widest = heights[4] ?? 0;
      const cols = [2, 3, 4].find((c) => (heights[c] ?? Infinity) <= widest + 0.5) ?? 3;
      const need = heights[cols] ?? 0;
      const halfRows = Math.max(2, Math.ceil((need + gap) / step));
      next.set(t.id, { cols, halfRows });
    }
    const same =
      next.size === measured.size &&
      [...next].every(([k, v]) => {
        const old = measured.get(k);
        return old != null && old.cols === v.cols && old.halfRows === v.halfRows;
      });
    if (!same) setMeasured(next);
    setMeasuredKey(probeKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probeKey]);

  const seedKey = useMemo(
    () => data.habits.find((h) => h.kind === "range")?.key ?? null,
    [data.habits],
  );

  // THE VIEWPORT BUDGET (re-ruled 2026-07-27): the wall should fit without
  // scrolling whenever its tiles can, so the pack needs to know how many
  // half-rows are actually visible. Measured off the scroll container and
  // re-measured on resize — the rail collapse reflows 2180 → 2560 and the
  // budget rides along.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (el == null) return;
    const compute = () => {
      const cs = getComputedStyle(document.documentElement);
      const unit = parseFloat(cs.getPropertyValue("--wall-unit")) || 128;
      const gap = parseFloat(cs.getPropertyValue("--wall-gap")) || 12;
      const pad = (parseFloat(cs.getPropertyValue("--space-6")) || 16) * 2;
      const step = (unit - gap) / 2 + gap;
      // n half-rows occupy n·step − gap, so n = (h + gap) / step.
      const n = Math.floor((el.clientHeight - pad + gap) / step);
      setBudget((prev) => {
        const next = Math.max(4, n);
        return prev === next ? prev : next;
      });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const opts = budget != null ? { budgetHalfRows: budget } : undefined;
    const packed = packWall(toPackInputs(tiles, seedKey, measured), opts);
    if (packed.overflowUnlogged.length === 0) return packed;
    // The unlogged remainder — whatever did not land in a hole inside the
    // island — collects into ONE neat labelled cluster block, which is then
    // packed like any other tile.
    const overflow = new Set(packed.overflowUnlogged);
    const names = packed.overflowUnlogged
      .map((t) => (t.body.kind === "unlogged" ? t.body.name : ""))
      .filter((n) => n !== "");
    const cluster: WallTile = { id: "cluster", body: { kind: "cluster", names } };
    const keep = tiles.filter((t) => !overflow.has(t));
    return packWall(toPackInputs([...keep, cluster], seedKey, measured), opts);
  }, [tiles, seedKey, measured, budget]);

  const finalized = data.dayRow?.finalized ?? false;
  const d = new Date(`${dayKey}T12:00:00`);

  return (
    <div className="wallscreen">
      <div className="head">
        <div className="date">
          <span className="dow">{WEEKDAY.format(d)} —</span> {DAY_MONTH_YEAR.format(d)}
          {finalized && (
            <span className="fin-tag">
              <span className="fm" />
              Finalized
            </span>
          )}
        </div>
        <button
          className="edit-day"
          title="Reopen this day (back to the working state)"
          onClick={onEditDay}
        >
          <svg className="ico" viewBox="0 0 24 24" style={{ width: 15, height: 15 }}>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          Edit day
        </button>
      </div>

      <div className="wall-wrap" ref={wrapRef}>
        <div className="wall">
          {layout.placed.map((p) => {
            const door = tileDoor(p.item, onOpenEntry);
            return (
              <div
                key={p.item.id}
                className={`tile ${tileClass(p.item)}`}
                style={{
                  ...tileStyle(p.item),
                  gridColumn: `${p.col} / span ${p.cols}`,
                  gridRow: `${p.row} / span ${p.halfRows}`,
                }}
                onClick={door}
                role={door ? "button" : undefined}
                tabIndex={door ? 0 : undefined}
                onKeyDown={
                  door
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          door();
                        }
                      }
                    : undefined
                }
              >
                <TileBody tile={p.item} dayKey={dayKey} config={config} />
              </div>
            );
          })}
          {layout.placed.length === 0 && (
            <p className="island-note">Nothing was logged on this day.</p>
          )}
        </div>
      </div>

      {/* The measuring pass — mounted only until this content is measured.
          Inside `.wall` on purpose: the plate rules are `.ms-tile.plate ...`,
          and a probe parked outside its own wall measures the wrong height —
          the exhibit paid for that once already. */}
      {probeLive && (
        <div className="wall wall-probe" aria-hidden="true" ref={probeRef}>
          {textTiles.map((t) =>
            probeWidths(t).map((cols) => (
              <div
                key={`${t.id}:${cols}`}
                data-probe={`${t.id}:${cols}`}
                className={`tile ${tileClass(t)}`}
                style={{ width: `calc(${cols} * var(--wall-unit) + ${cols - 1} * var(--wall-gap))` }}
              >
                <TileBody tile={t} dayKey={dayKey} config={config} />
              </div>
            )),
          )}
        </div>
      )}
    </div>
  );
}

/** The `--slot` a tile paints itself with; only the art-bearing kinds carry one. */
const tileStyle = (t: WallTile): Record<string, string> => {
  const b = t.body;
  if (b.kind === "cover" || b.kind === "banner") return { ["--slot"]: `var(--${b.slot})` };
  if (b.kind === "keepsake") return { ["--slot"]: `var(--${b.colourSlot})` };
  return {};
};

/**
 * "Identity is clickable, metrics are not" — a cover or a banner is an entry, so
 * it opens that entry's dashboard. Keepsakes, whimsy and milestone cards carry
 * no identity to open.
 */
const tileDoor = (
  t: WallTile,
  onOpenEntry?: (entryId: string, habitKey: string | null) => void,
): (() => void) | undefined => {
  const b = t.body;
  if (onOpenEntry == null) return undefined;
  if (b.kind === "cover" || b.kind === "banner")
    return () => onOpenEntry(b.entryId, b.habitKey);
  return undefined;
};

const tileClass = (t: WallTile): string => {
  const b = t.body;
  switch (b.kind) {
    case "cover":
      return b.square ? "yt" : `cover${b.big ? " big" : ""}`;
    case "banner":
      return "banner";
    case "keepsake":
      return "keep";
    case "whimsy":
      return `whim ${WHIMSY_CLASS[b.which]}`;
    case "wx":
      return "whim glance whim-weather";
    case "horo":
      return "whim strip-tile whim-horo";
    case "tarot":
      return "whim whim-tarot";
    case "milestone":
      return `ms-tile${b.items.length === 1 ? " plate" : ""}`;
    case "streaks":
      return "ms-tile";
    case "unlogged":
      return "unlogged";
    case "cluster":
      return "cluster";
  }
};

const WHIMSY_CLASS: Record<WhimsyWhich, string> = {
  sun: "whim-sun",
  season: "whim-ribbon",
  year: "whim-ribbon",
  moon: "glance whim-moon",
  fact: "glance whim-fact",
  word: "strip-tile whim-word",
  quote: "strip-tile whim-quote",
  otd: "strip-tile whim-otd",
  holiday: "glance whim-holiday",
};

function TileBody({
  tile,
  dayKey,
  config,
}: {
  tile: WallTile;
  dayKey: string;
  config: ReturnType<typeof loadWhimsyConfig>;
}) {
  const b = tile.body;
  switch (b.kind) {
    case "cover":
      return <Cover t={b} />;
    case "banner":
      return <Banner t={b} />;
    case "keepsake":
      return <Keepsake t={b} />;
    case "whimsy":
      return <Whimsy which={b.which} dayKey={dayKey} config={config} />;
    case "wx":
      return <WeatherWall t={b} config={config} />;
    case "horo":
      return <HoroscopeWall t={b} />;
    case "tarot":
      return <TarotWall t={b} />;
    case "milestone":
      return <MilestoneCard t={b} />;
    case "streaks":
      return <StreaksCard t={b} />;
    case "unlogged":
      return <Unlogged t={b} />;
    case "cluster":
      return <Cluster t={b} />;
  }
}

// ── Habit tiles ──────────────────────────────────────────────────────────────

function Cover({ t }: { t: CoverTile }) {
  // Square-source entries render square — shape follows content.
  if (t.square)
    return (
      <>
        <span className="pfp">{t.title.slice(0, 1).toUpperCase()}</span>
        <span className="ch">{t.title}</span>
        <span className="sub">
          {t.eyebrow} · {t.duration}
        </span>
      </>
    );
  return (
    <>
      {/* Real cover art at runtime; the typographic keepsake underneath is the
          `kit-tile-fallback` treatment, which stays the permanent look for an
          entry that never got art. A cover that 404s (the seeded paths point at
          files that do not exist) removes itself the same way — silently, per
          the fail-to-fallback law. */}
      {t.cover != null && (
        <img
          className="art"
          src={t.cover}
          alt=""
          onError={(e) => e.currentTarget.remove()}
        />
      )}
      <span className="kind">{t.eyebrow}</span>
      {hasIcon(t.icon) && (
        <span className="glyph">
          <HabitIcon icon={t.icon} />
        </span>
      )}
      <div className="ttl">{t.title}</div>
      <div className="meta">
        <span className="chip dur">{t.duration}</span>
        {t.rating != null && (
          <span className="stars">
            {"★".repeat(t.rating)}
            {"☆".repeat(Math.max(0, 5 - t.rating))}
          </span>
        )}
      </div>
    </>
  );
}

/**
 * The creation banner — re-cut 2026-07-27 (user-ruled, the old wall's
 * WritingPanel face): the banner art spans the WHOLE card as a shadowed
 * background and the content sits above it. No art → the slot-derived
 * gradient field; a 404 removes itself and the field shows, per the
 * fail-to-fallback law.
 */
function Banner({ t }: { t: BannerTile }) {
  return (
    <>
      {t.banner != null && (
        <img className="art" src={t.banner} alt="" onError={(e) => e.currentTarget.remove()} />
      )}
      <span className="kind">{t.eyebrow}</span>
      <div className="foot">
        <div className="ttl">{t.title}</div>
        <div className="meta">
          {t.stage != null && <span className="stage">{t.stage}</span>}
          <span className="nums">{t.nums}</span>
        </div>
      </div>
    </>
  );
}

function Keepsake({ t }: { t: KeepsakeWallTile }) {
  return <KeepsakeTile snippet={t.snippet} values={t.values} colourSlot={t.colourSlot} />;
}

function Unlogged({ t }: { t: UnloggedTile }) {
  return (
    <>
      <span className="nm">{t.name}</span>
      <span className="st">not logged</span>
    </>
  );
}

function Cluster({ t }: { t: ClusterTile }) {
  return (
    <>
      <span className="cl">Not logged · {t.names.length}</span>
      <div className="grid">
        {t.names.map((n) => (
          <span className="u" key={n}>
            {n}
          </span>
        ))}
      </div>
    </>
  );
}

// ── The folded whimsy — the grout ────────────────────────────────────────────

function Whimsy({
  which,
  dayKey,
  config,
}: {
  which: WhimsyWhich;
  dayKey: string;
  config: ReturnType<typeof loadWhimsyConfig>;
}) {
  switch (which) {
    case "sun": {
      // "The sun tile renders at SOLAR NOON on a past day" — a fact about the
      // day, not about when it was finalized (the tile's own copy says so).
      const sun = sunInfo(dayKey, config.lat, config.lon);
      return (
        <>
          <span className="wl">Sun</span>
          <div className="sky" />
          <div className="disc" />
          <span className="len">{hoursMinutes(Math.round(sun.dayLengthMin))}</span>
          <span className="noon">solar noon</span>
        </>
      );
    }
    case "season": {
      const info = seasonInfo(dayKey, config.lat);
      const band = seasonBand(dayKey, config.lat, info.northern);
      return (
        <>
          <span className="wl">Season</span>
          <div className="band">
            {band.segments.map((s, i) => (
              <i
                key={i}
                style={{
                  flex: s.days,
                  background: s.current
                    ? `var(${s.monthVar})`
                    : `color-mix(in oklch, var(${s.monthVar}), var(--panel-background) 45%)`,
                }}
              />
            ))}
            <div className="tick" style={{ left: `${band.todayPct}%` }} />
          </div>
          <div className="foot">
            <span>{info.season}</span>
            <span>
              <b>day {info.dayIndex}</b> of {info.length}
            </span>
          </div>
        </>
      );
    }
    case "year": {
      const p = timeProgress(dayKey, new Date(`${dayKey}T23:59:00`));
      return (
        <>
          <span className="wl">Year</span>
          <div className="band">
            {MONTH_VARS.map((v) => (
              <i key={v} style={{ flex: 1, background: `var(${v})` }} />
            ))}
            <div className="tick" style={{ left: `${Math.round(p.yearPct * 100)}%` }} />
          </div>
          <div className="foot">
            <span>{dayKey.slice(0, 4)}</span>
            <span>
              <b>{Math.round(p.yearPct * 100)}%</b>
            </span>
          </div>
        </>
      );
    }
    case "moon": {
      const m = moonInfo(dayKey, config.lat, config.lon);
      const g = moonDiscPaths(m.illumination, m.phase, 20, 22, 22);
      return (
        <>
          <span className="wl">Moon</span>
          <div className="body">
            <svg
              className="disc"
              viewBox="0 0 44 44"
              aria-hidden="true"
              style={m.mirrored ? { transform: "scaleX(-1)" } : undefined}
            >
              <circle
                cx="22"
                cy="22"
                r="20"
                fill="var(--whimsy-night)"
                stroke="color-mix(in oklch, var(--whimsy-moon), var(--whimsy-night) 58%)"
                strokeWidth="1"
              />
              <path d={g.half} fill="var(--whimsy-moon)" />
              <path
                d={g.terminator}
                fill={m.illumination > 0.5 ? "var(--whimsy-moon)" : "var(--whimsy-night)"}
              />
            </svg>
            <div>
              <div className="il">{Math.round(m.illumination * 100)}%</div>
              <div className="ph">{m.name}</div>
            </div>
          </div>
        </>
      );
    }
    case "word": {
      const w = wordFor(dayKey);
      return (
        <>
          <span className="wl">Word</span>
          <div className="body">
            <span className="w">
              {w.word} <span className="pos">{w.kind}</span>
            </span>
            <span className="rule" />
            <span className="def">{w.meaning}</span>
          </div>
        </>
      );
    }
    case "fact": {
      const f = factFor(dayKey);
      return (
        <>
          <span className="wl">Fact</span>
          <div className="body">
            <span className="chip" style={{ ["--c" as string]: `var(--cat-${f.cat})` }}>
              {f.category}
            </span>
            <span className="tx">{f.text}</span>
          </div>
        </>
      );
    }
    case "quote": {
      const q = quoteFor(dayKey);
      return (
        <>
          <span className="qm" aria-hidden="true">
            &#8220;
          </span>
          <p>{q.text}</p>
          <span className="by">— {q.who}</span>
        </>
      );
    }
    case "otd": {
      const events = onThisDay(dayKey).slice(0, 2);
      return (
        <>
          {events.map((e) => (
            <div className="row" key={e.year}>
              <span className="yr">{e.year}</span>
              <span className="ev">{e.what}</span>
            </div>
          ))}
        </>
      );
    }
    case "holiday": {
      const name = holidayFor(dayKey);
      const month = new Intl.DateTimeFormat(undefined, { month: "short" }).format(
        new Date(`${dayKey}T12:00:00`),
      );
      // Tinted by the holiday's ACTUAL month (user-ruled 2026-07-30) — the
      // frozen --month-jun was the FINAL's sample month, not a rule.
      const monthVar = MONTH_VARS[Number(dayKey.slice(5, 7)) - 1];
      return (
        <>
          <span className="wl">Holiday</span>
          <div className="body">
            <div className="dt" style={{ "--c": `var(${monthVar})` } as CSSProperties}>
              <span className="d">{Number(dayKey.slice(8, 10))}</span>
              <span className="mon">{month}</span>
            </div>
            <span className="nm">{name}</span>
          </div>
        </>
      );
    }
  }
}

// ── The ephemeral three — feed_snapshot's tenants, drawn faces verbatim ──────

function WeatherWall({
  t,
  config,
}: {
  t: WeatherWallTile;
  config: ReturnType<typeof loadWhimsyConfig>;
}) {
  const { cond } = weatherWords(t.snap.code);
  return (
    <>
      <span className="wl">Weather</span>
      <div className="body">
        <span className="t">{displayTemp(t.snap.tempC, config.tempUnit)}&deg;</span>
        <span className="c">{cond}</span>
      </div>
    </>
  );
}

function HoroscopeWall({ t }: { t: HoroscopeWallTile }) {
  // The SNAPSHOTTED sign, not the configured one — the wall shows the day as
  // it was, even if the birthdate later changes.
  const glyph = signGlyph(t.snap.sign);
  return (
    <>
      <span className="sign">
        {glyph != null && (
          <span className="glyph" aria-hidden="true">
            {glyph}
          </span>
        )}
        {t.snap.sign}
      </span>
      <p>{t.snap.text}</p>
    </>
  );
}

/**
 * The mini card face — the state-2 FINAL's own tarot anatomy (fewer stars, no
 * figure lines) with the drawn draw's numeral and name in place of the frozen
 * sample's. Reversed turns the pictorial group, as on state 1.
 */
function TarotWall({ t }: { t: TarotWallTile }) {
  const longName = t.snap.name.length > 11;
  return (
    <svg viewBox="0 0 104 182" aria-hidden="true">
      <rect x="2" y="2" width="100" height="178" rx="7" fill="var(--whimsy-parchment)" stroke="var(--whimsy-ink)" strokeWidth="1.5" />
      <rect x="8" y="8" width="88" height="166" rx="4" fill="none" stroke="var(--whimsy-star)" strokeWidth="1" />
      <text x="52" y="26" textAnchor="middle" fontFamily="var(--font-heading)" fontSize="11" letterSpacing="1.5" fill="var(--whimsy-ink)">
        {t.snap.numeral}
      </text>
      <g transform={t.snap.reversed ? "rotate(180 52 91)" : undefined}>
        <g fill="var(--whimsy-star)">
          <path d="M52 49 L55.9 62.1 L69 66 L55.9 69.9 L52 83 L48.1 69.9 L35 66 L48.1 62.1 Z" />
          <circle cx="24" cy="34" r="1.6" />
          <circle cx="80" cy="30" r="1.4" />
          <circle cx="52" cy="31" r="1.5" />
          <circle cx="30" cy="58" r="1.2" />
          <circle cx="74" cy="60" r="1.3" />
        </g>
        <g fill="none" stroke="var(--whimsy-ink)" strokeWidth="1.3" strokeLinecap="round">
          <path d="M14 128 q11 -6 22 0 t22 0 t22 0" />
          <path d="M14 140 q11 -6 22 0 t22 0 t22 0" opacity="0.6" />
        </g>
      </g>
      <text
        x="52"
        y="169"
        textAnchor="middle"
        fontFamily="var(--font-ui)"
        fontSize="8.5"
        letterSpacing="2"
        fill="var(--whimsy-ink)"
        textLength={longName ? 84 : undefined}
        lengthAdjust={longName ? "spacingAndGlyphs" : undefined}
      >
        {t.snap.name.toUpperCase()}
      </text>
    </svg>
  );
}

// ── The milestone family cards — direction D, "the sealed certificate" ───────

/**
 * One device per family inside a constant seal (user-ruled: the seal is the
 * constant, the glyph varies, so six read as one set at wall distance while
 * each is identifiable up close). Transcribed from `FINAL Milestone Exhibit.html`.
 */
const SEAL: Record<string, string[]> = {
  threshold: ["M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z", "M4 22V4"],
  record: [
    "M18 2H6v7a6 6 0 0 0 12 0V2Z",
    "M6 9H4.5a2.5 2.5 0 0 1 0-5H6",
    "M18 9h1.5a2.5 2.5 0 0 0 0-5H18",
    "M10 15v3c0 .6-.4 1-1 1-1.1.4-2 1.9-2 3",
    "M14 15v3c0 .6.4 1 1 1 1.1.4 2 1.9 2 3",
    "M4 22h16",
  ],
  streaks: [
    "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",
  ],
  lifecycle: [
    "M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0",
    "M3 18c2-4 4-4 6 0s4 4 6 0 4-4 6 0",
  ],
  anniversary: [
    "M3 4h18v18H3z",
    "M16 2v4",
    "M8 2v4",
    "M3 10h18",
  ],
  rank: ["M12 3v18", "m6 9 6-6 6 6"],
};

function Seal({ family }: { family: string }) {
  return (
    <span className="ms-mark">
      <svg className="ico" viewBox="0 0 24 24">
        {(SEAL[family] ?? []).map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
    </span>
  );
}

function Item({ value, subject }: { value: string; subject: string }) {
  // A value-less item — every Rank change entry — spans the whole row instead
  // of being laid into the auto-sized value track, where it would size to its
  // own max-content and blow the measure.
  if (value === "")
    return (
      <div className="ms-it plain">
        <span className="ms-t">{subject}</span>
      </div>
    );
  return (
    <div className="ms-it">
      <span className="ms-n">{value}</span>
      <span className="ms-t">{subject}</span>
    </div>
  );
}

function MilestoneCard({ t }: { t: MilestoneTile }) {
  const plate = t.items.length === 1;
  const counts = t.items.filter((i) => i.bucket === "count");
  const totals = t.items.filter((i) => i.bucket === "total");
  // The column header names the unit so the items stop repeating it. "Days"
  // and "Hours" are the drawn labels; they widen only when the bucket really
  // holds something else, so the common day reads exactly as frozen.
  const countHead = counts.every((i) => i.subject !== "session logged") ? "Days" : "Counts";
  const totalHead = totals.every((i) => i.value.endsWith(" h")) ? "Hours" : "Totals";

  return (
    <>
      <div className="ms-head">
        <Seal family={t.family} />
        <span className="ms-fam">{t.label}</span>
      </div>
      {plate && <span className="ms-rule" />}
      {t.split ? (
        <div className="ms-list split">
          <div className="ms-col">
            <span className="ms-colh">{countHead}</span>
            {counts.map((i, k) => (
              <Item key={k} value={i.value} subject={i.subject} />
            ))}
          </div>
          <span className="ms-split-rule" />
          <div className="ms-col">
            <span className="ms-colh">{totalHead}</span>
            {totals.map((i, k) => (
              <Item key={k} value={i.value} subject={i.subject} />
            ))}
          </div>
        </div>
      ) : (
        <div className="ms-list">
          {t.items.map((i, k) => (
            <Item key={k} value={i.value} subject={i.subject} />
          ))}
        </div>
      )}
    </>
  );
}

function StreaksCard({ t }: { t: StreaksTile }) {
  return (
    <>
      <div className="ms-head">
        <Seal family="streaks" />
        <span className="ms-fam">Streaks</span>
      </div>
      <div className="ms-list">
        {t.streaks.map((s, i) => (
          <div className="ms-it" key={i}>
            <span className="ms-n">{s.value}</span>
            <span className="ms-t">
              {s.subject}
              {s.longest && (
                <span className="ms-star" title="longest streak">
                  {" ★"}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

