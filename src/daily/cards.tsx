/**
 * The whimsy tier — sixteen ambient cards.
 *
 * Shells are KIT (`.card` = panel background + border + radius + low shadow +
 * the type ramp); interiors are theme-authored art drawn ONLY from the
 * theme-owned whimsy palette (`--whimsy-*`) and the whimsy TYPE tier
 * (`--whimsy-size-*`). Habit, month and state slots are barred from here by
 * ruling — whimsy colours are keepsake colours and ride into the cover wall
 * when these fold at finalize.
 *
 * Art dimensions are CEILINGS, never fixed sizes: art fills the width it is
 * given and reaches its max there, scaling below when squeezed. That is what
 * keeps Daily's sealed frame from ballooning.
 *
 * Three cards are ephemeral (horoscope · tarot · weather) and render from the
 * day's `feed_snapshot` — the network tier landed 2026-07-27. Absent means a
 * quiet waiting face, never fabricated content; on a past day absence is
 * permanent and the copy says so.
 */
import { useState, type CSSProperties } from "react";
import { TarotArt } from "./tarotArt";
import {
  buildWxCurve,
  displayTemp,
  weatherWords,
  wxLede,
  WX_BOX,
  WX_BOX_DESKTOP,
  type WxLede,
  type HoroscopeSnap,
  type TarotSnap,
  type WeatherGlyph,
  type WeatherSnap,
} from "./feedData";
import {
  atLocation,
  moonDiscPaths,
  moonInfo,
  seasonBand,
  seasonInfo,
  nextSunrise,
  SUN_ARC,
  sunAltitude,
  sunArcPath,
  sunArcPoint,
  sunInfo,
  sunReadingInstant,
  sunStateSentence,
  tonightsFeature,
  tonightsSky,
  type MoonInfo,
  type SunInfo,
} from "./sky";
import {
  countdowns,
  type Anniversary,
  dayOfYear,
  factFor,
  holidayFor,
  onThisDay,
  quoteFor,
  rediscover,
  sunSign,
  wordFor,
} from "./almanac";
import { MONTHS_LONG, MONTHS_SHORT } from "../metrics/format";
import { weekStartDow } from "../metrics/dates";
import { pad2, todayLocal } from "../metrics/clock";
import { useCompact } from "../theme/compact";
import { periodProgress, pct } from "./periodProgress";
import type { WhimsyConfig } from "./whimsyConfig";

// Not metrics/format.hoursMinutes: the sun face always carries the hour
// ("0h 45m" beside "24h 00m"). Round BEFORE splitting or 119.6 min reads "1h 60m".
const hm = (min: number): string => {
  const mm = Math.round(min);
  return `${Math.floor(mm / 60)}h ${String(mm % 60).padStart(2, "0")}m`;
};

// -- sky column: translated from Final/daily-state-1.html ---------------------

/** The `.ovl > .ovl-t` header the FINAL gives every whimsy card. */
function Ovl({ label, d }: { label: string; d: string[] }) {
  return (
    <div className="ovl">
      <span className="ovl-t">
        <svg className="ico" viewBox="0 0 24 24">
          {d.map((seg, i) =>
            seg.startsWith("circle:") ? (
              <circle key={i} cx="12" cy="12" r={seg.slice(7)} />
            ) : (
              <path key={i} d={seg} />
            ),
          )}
        </svg>
        {label}
      </span>
    </div>
  );
}

const I_SUN = ["circle:4", "M12 2v2", "M12 20v2", "m4.93 4.93 1.41 1.41", "m17.66 17.66 1.41 1.41", "M2 12h2", "M20 12h2", "m6.34 17.66-1.41 1.41", "m19.07 4.93-1.41 1.41"];
const I_WX = ["M12 2v2", "m4.93 4.93 1.41 1.41", "M20 12h2", "m19.07 4.93-1.41 1.41", "M15.947 12.65a4 4 0 0 0-5.925-4.128", "M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"];
const I_SEASON = ["M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z", "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"];
const I_MOON = ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"];
const I_STAR = ["M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z", "M20 3v4", "M22 5h-4", "M4 17v2", "M5 18H3"];

/**
 * THE SUN CARD — re-minted 2026-08-12 (`Mint - Sun card.html`).
 *
 * The arc is gone. A horizon and a sun that rises and falls against it, and the
 * component's whole job is to declare ONE NUMBER the CSS draws everything from.
 *
 * WHAT IT WRITES:
 *   --sun-alt   normalised solar altitude (see `sunAltitude`). Height, both sky
 *               stops, the land, the star scatter and the concealment at night
 *               all derive from it, so there is exactly one number to be right
 *               about. Precedent for a component-written custom property:
 *               --wall-cols, which CoverWall reads off computed style rather
 *               than keeping a second copy of.
 *   --sun-warm  which twilight the horizon tends toward — a POINTER at an
 *               existing dial, never a colour of its own. CSS cannot infer it:
 *               altitude .58 is the same picture morning and afternoon, and
 *               this is the only thing telling them apart.
 *   .is-night   the sun is down. It does not switch the picture (the geometry
 *               already conceals the disc); it drops a stale rise/set pair and
 *               lifts the label's contrast.
 *   .is-polar   no rise and no set exist to print.
 *
 * ⚠ THE INLINE BASIS IS LOAD-BEARING, not cosmetic. `.sun-field` has zero
 * intrinsic height by construction — every child is absolutely positioned — so
 * without a basis the card collapses to fit-content, the field resolves to 0px,
 * and every percentage in the CSS resolves against nothing. 223 is the sum of
 * its parts: 16 overline + 120 field + 23 reading row + 24 gaps + 40 padding.
 * ⚠ The padding term is 40 SINCE 2026-08-16: the whimsy-clearance revert took
 * `--frame-clear-whimsy` back to 12px on every canvas (padding = 12 + 8 per
 * side), and the basis moved 215 → 223 with it (2026-08-17, the Mac walk —
 * on a height-squeezed window the un-carried 8px came out of the card's
 * bottom padding; the desktop 285 below was always budgeted at 12px). A
 * clearance change MUST re-visit this sum — the basis is a budget, and a term
 * that moves without it silently shortens the figure.
 * (The number's real owner is the span calculator, not this file — the open
 * --whimsy-span-unit item. Do not tune it here.)
 *
 * THE HEADLINE IS LIVE NOW. It used to be day length: a fact about the DAY that
 * does not change between midnights, printed under a figure that swept the sky,
 * so every daylight state read identically. It is now light remaining — the
 * same countdown the night state was already running, applied to daylight too —
 * and day length demotes to the denominator, which is what it was doing
 * semantically all along. `0m` at sunset is the range endpoint, not an error.
 */
function SunCardSmall({ sun, lat, lon, dayKey, now }: {
  sun: SunInfo;
  lat: number;
  lon: number;
  dayKey: string;
  now: Date;
}) {
  const at = sunReadingInstant(sun, dayKey, now);
  const alt = sunAltitude(sun, lat, lon, at);
  const rising = at.getTime() < sun.solarNoon.getTime();
  const night = sun.state === "normal" && alt < 0;

  // The two readings, by state. `null` means the figure has no honest value and
  // the label carries the sentence alone.
  let head: string | null;
  let label: string;
  if (sun.state === "midnight-sun") {
    head = "24h 00m";
    label = "of light — no sunset today";
  } else if (sun.state === "polar-night") {
    head = "0h 00m";
    label = "of light — no sunrise today";
  } else if (night) {
    const rise = nextSunrise(lat, lon, at);
    head = rise ? hm((rise.getTime() - at.getTime()) / 60000) : null;
    label = "until sunrise";
  } else {
    // Clamped at zero: a reading taken a few seconds past sunset would
    // otherwise print a negative countdown while the disc sits on the line.
    head = hm(Math.max(0, (sun.sunset!.getTime() - at.getTime()) / 60000));
    label = `of ${hm(sun.dayLengthMin)}`;
  }

  return (
    <div
      className={"card whimsy sun-card" + (night ? " is-night" : "") + (sun.state !== "normal" ? " is-polar" : "")}
      style={{
        flex: "2.2 0 223px",
        // A pointer at a dial, resolved by the theme — never a colour value.
        "--sun-warm": rising ? "var(--whimsy-dawn)" : "var(--whimsy-dusk)",
        "--sun-alt": alt.toFixed(4),
      } as CSSProperties}
    >
      <Ovl label="Sun" d={I_SUN} />
      {/* The sky band is its own box and CLIPS: altitude 0 puts the disc's
          centre on its bottom edge, and the translate(-50%,-50%) the disc
          already carries makes that exactly half visible. Below zero it is
          simply gone — no night rule, no fade, no second drawing. */}
      <div className="field sun-field">
        <div className="sun-sky"><div className="sun-disc" /></div>
        <div className="sun-ground" />
      </div>
      <div className="sun-read">
        {head && <span className="whead">{head}</span>}
        <span className="delta">{label}</span>
        {sun.state === "normal" && !night && (
          <span className="sun-span">
            {sun.sunrise ? atLocation(sun.sunrise, lon) : "—"}
            {"–"}
            {sun.sunset ? atLocation(sun.sunset, lon) : "—"}
          </span>
        )}
        <span className="kit-sr">{sunStateSentence(sun.state, alt, rising)}</span>
      </div>
    </div>
  );
}

/**
 * THE CONDITION MARK — re-drawn 2026-08-12 for the weather re-mint.
 *
 * Was a 78px illustration in its own tile, costing a quarter of the art row to
 * say what `.cond` says in words beside it. It is now a 22px mark INSIDE the
 * reading block, where it costs the plot nothing and the card no height at all
 * — 22px inside a 23px line box.
 *
 * FILLED, NOT OUTLINED, and that is a size decision: at 22px beside a bold
 * figure a 1.5px outline is a wisp, and it desaturates under the 85% UI scale
 * for the reason the sun card's small circles did. SHAPE carries the reading —
 * disc for clear, body for cloud, rules for fog — so nothing depends on colour
 * telling them apart. Paint comes off three CSS classes (`g-sun` · `g-cloud` ·
 * `g-mist`) rather than attributes, so every mark rides dials.
 *
 * ⚠ EVERY viewBox CARRIES TWO TO THREE UNITS OF AIR. Cut to the path's own
 * bounds each mark filled its box corner to corner and read as bursting out of
 * it — a glyph needs sidebearings for the same reason a letter does. Opened to
 * five, the padding did the shrinking instead: at a fixed 22px box, air inside
 * the viewBox comes straight off the drawing.
 *
 * ⚠ AND FOG IS NOT A CLOUD. Drawn as a cloud over two rules it needed half again
 * the height of the others, so at a shared box height its cloud rendered
 * visibly smaller than the overcast cloud beside it — the same shape at two
 * sizes, which reads as an error rather than a distinction. Three rules alone
 * say fog, sit in a short wide box, and are unmistakably NOT the cloud.
 *
 * ⚠ THE MINT DREW FOUR OF THESE; THE APP HAS SEVEN CONDITIONS. Sun, cloud and
 * fog are the mint's own drawings verbatim. Partly, rain, snow and storm are
 * drawn HERE in its vocabulary, which the mint explicitly delegates ("that
 * inventory is the component's to settle, not this sheet's"). They are the one
 * part of this card that is authored rather than translated, and the part to
 * look at first.
 * ⚠ THE CONSTRAINT THAT SHAPES THEM is the fog lesson above: box height is what
 * scales the drawing, so a precipitation mark stacking marks BELOW a
 * full-height cloud would render its cloud visibly smaller than the overcast
 * cloud beside it. The cloud is lifted and the marks tucked close, holding every
 * box to 31–37 units so no cloud differs from another by more than ~15%.
 */
/**
 * The hour axis's five ticks.
 *
 * ⚠ RE-CUT WITH THE PLOT BOX (2026-08-12). These were 4.2 / 27.1 / 50 / 72.9 /
 * 95.8 — the old box's 10-unit inset expressed as percentages — and they were
 * CORRECT for it. The re-mint runs the curve edge to edge, so the same
 * percentages would now sit an hour off their own ticks at both ends. The axis
 * and the curve share one x-space, and this is the other half of that.
 */
/**
 * The DESKTOP axis — the inset box's positions (restored 2026-08-14). These
 * ARE the 4.2/27.1/50/72.9/95.8 the small card's list replaced: correct for a
 * curve inset 10 units of 240 each side, wrong for one that runs edge to edge.
 * Two boxes, two axes; each is exact for its own.
 */
const WX_HOURS_DESKTOP: Array<[left: string, label: string]> = [
  ["4.2%", "12a"], ["27.1%", "6a"], ["50%", "12p"], ["72.9%", "6p"], ["95.8%", "12a"],
];

const WX_HOURS: Array<[left: string, label: string]> = [
  ["0%", "12a"], ["25%", "6a"], ["50%", "12p"], ["75%", "6p"], ["100%", "12a"],
];

const CLOUD = "M16 38 a9 9 0 0 1 1-17 a11 11 0 0 1 21 2 a8 8 0 0 1 -1 15 z";
/** The same body lifted 6 units, so precipitation fits without a taller box. */
const CLOUD_HIGH = "M16 32 a9 9 0 0 1 1-17 a11 11 0 0 1 21 2 a8 8 0 0 1 -1 15 z";

function WxGlyph({ glyph }: { glyph: WeatherGlyph }) {
  switch (glyph) {
    case "sun":
      return (
        <svg viewBox="14 8 32 32" aria-hidden="true">
          <circle className="g-sun" cx="30" cy="24" r="14" />
        </svg>
      );
    case "partly":
      return (
        <svg viewBox="5 4 47 36" aria-hidden="true">
          <circle className="g-sun" cx="41" cy="15" r="9" />
          <path className="g-cloud" d={CLOUD} />
        </svg>
      );
    case "cloud":
      return (
        <svg viewBox="5 9 44 31" aria-hidden="true">
          <path className="g-cloud" d={CLOUD} />
        </svg>
      );
    case "fog":
      return (
        <svg viewBox="5 11 44 26" aria-hidden="true">
          <path className="g-mist" d="M8 14 h38" />
          <path className="g-mist" d="M14 24 h28" />
          <path className="g-mist" d="M10 34 h34" />
        </svg>
      );
    case "rain":
      // Slanted, because a vertical tick beside three horizontal fog rules is
      // the same mark rotated; rain falls at an angle and reads as motion.
      return (
        <svg viewBox="5 3 44 37" aria-hidden="true">
          <path className="g-cloud" d={CLOUD_HIGH} />
          <path className="g-mist" d="M22 34 l-2 4" />
          <path className="g-mist" d="M29 34 l-2 4" />
          <path className="g-mist" d="M36 34 l-2 4" />
        </svg>
      );
    case "snow":
      // Discs, not rules — snow's whole distinction from rain is that it does
      // not streak, and at this size a shorter tick would only read as rain.
      return (
        <svg viewBox="5 3 44 37" aria-hidden="true">
          <path className="g-cloud" d={CLOUD_HIGH} />
          <circle className="g-cloud" cx="21" cy="36" r="2" />
          <circle className="g-cloud" cx="28" cy="36" r="2" />
          <circle className="g-cloud" cx="35" cy="36" r="2" />
        </svg>
      );
    case "storm":
      return (
        <svg viewBox="5 3 44 37" aria-hidden="true">
          <path className="g-cloud" d={CLOUD_HIGH} />
          <path className="g-cloud" d="M30 33 l-8 7 l5 0 l-3 5 l9 -8 l-5 0 z" />
        </svg>
      );
  }
}

/** The lede's arrow. A diagonal shaft with a head — it TRAVELS, where a chevron
 *  only points and a plus/minus reads as arithmetic on the figure beside it.
 *  Mirrored for a fall, so one drawing serves both directions. */
const WxArrow = ({ up }: { up: boolean }) => (
  <svg viewBox="0 0 12 12" aria-hidden="true">
    {up ? (
      <>
        <path d="M2 10 L10 2" />
        <path d="M5 2 L10 2 L10 7" />
      </>
    ) : (
      <>
        <path d="M2 2 L10 10" />
        <path d="M5 10 L10 10 L10 5" />
      </>
    )}
  </svg>
);

/** "15:00" from an hour offset — the lede's landing time. 24 wraps to 00:00. */
const atHourLabel = (h: number): string => `${pad2(Math.round(h) % 24)}:00`;

/**
 * The card's state in words, for readers who cannot see it. A screen reader got
 * "Weather · 31° · Overcast · H 31° L 21°" — the numbers, and no picture: no
 * trend, no shape, and no indication of whether the reading is five minutes or
 * five hours old. Built from the same values the drawing is.
 */
function wxSentence(
  cond: string,
  snap: WeatherSnap,
  unit: "F" | "C",
  lede: WxLede | null,
  stale: boolean,
  obsT: number,
): string {
  const trend =
    lede == null
      ? ""
      : ` ${lede.delta > 0 ? "Rising" : "Falling"} ${Math.abs(lede.delta)} degrees by ${atHourLabel(lede.atHour)}.`;
  const age = stale ? ` Last measured at ${atHourLabel(obsT)}.` : "";
  return (
    `${cond}, ${displayTemp(snap.tempC, unit)} degrees.${trend}` +
    ` High of ${displayTemp(snap.hiC, unit)}, low of ${displayTemp(snap.loC, unit)}.${age}`
  );
}

/**
 * THE WEATHER CARD — re-minted 2026-08-12 (`Mint - Weather card.html`).
 *
 * One 24h curve running the card's full interior, SPLIT AT NOW: what has
 * happened is veiled back toward the card's ground, what is coming is left
 * clear, and the seam between them is the rule that says *now*. The card reads
 * top to bottom as a header block over its evidence — masthead, reading block,
 * plot, axis.
 *
 * WHAT IT WRITES, in the `--sun-alt` idiom:
 *   --wx-now   where NOW is along the plotted window, 0→1. Drives the veil's
 *              width and therefore the seam; there is no separate line element,
 *              so the seam cannot drift from the shading it bounds.
 *   --wx-obs   where the OBSERVATION sits on the same axis. The CSS defaults it
 *              to --wx-now, so the fresh case needs no write at all.
 *   --wx-lvl   the observation's height in the plot box (see WxCurve.lvl).
 *
 * ⚠ --wx-obs IS NOT AN EDGE CASE HERE, IT IS THE ORDINARY STATE, and wiring it
 * fixed a real defect. The weather snapshot is captured ONCE PER DAY —
 * `ensureTodayFeeds` fetches only when the day has no weather yet — so
 * `snap.tempC` is the temperature at capture, typically the first time the app
 * was opened. The old card drew its marker at NOW and labelled it with that
 * CAPTURE temperature: a reading from 08:00 presented as the 20:00 reading,
 * with nothing on screen saying so. Now the marker sits where the reading
 * actually came from and the seam sits at now, so **the gap between them IS the
 * staleness, drawn**, and it grows on its own while nothing re-renders.
 *
 * A PAST DAY needs no state of its own: the whole day is elapsed, so --wx-now
 * is 1 and the field is fully veiled, while the marker stays at the hour the
 * forecast was captured. Honest by construction.
 */
function WeatherCardSmall({
  snap,
  unit,
  isToday,
  now,
}: {
  snap: WeatherSnap | null;
  unit: "F" | "C";
  isToday: boolean;
  now: Date;
}) {
  if (snap == null) {
    // Quiet absence, never fabricated. On a past day it is permanent — the
    // capture moment only ever existed then ("honest and unrecoverable").
    // THE INSTRUMENT STAYS, THE READING GOES: the field keeps its ground and
    // gains a dashed baseline, so the card holds its height in the column.
    // Whimsy fails silent, not short — a card that shrinks when the network
    // drops re-lays the whole sky column out from under the reader. No mark: a
    // reserved empty slot holding the figure's indent reads as a failure to
    // draw something rather than as an absence.
    // 238, not 230 — the wx budget (small.css § the wx basis) moved +8 with
    // the 2026-08-16 whimsy-clearance revert, exactly as the sun card's did;
    // the ruled 15px sun↔wx offset is preserved (223 + 15).
    return (
      <div className="card whimsy wx-card is-nodata" style={{ flex: "1.2 0 238px" }}>
        <Ovl label="Weather" d={I_WX} />
        <div className="wx-read">
          <span className="whead">{"—"}</span>
          <span className="cond">{isToday ? "Waiting on the forecast" : "No forecast"}</span>
        </div>
        <div className="field wx-field" />
        <div className="wx-hours" aria-hidden="true">
          {WX_HOURS.map(([left, label], i) => (
            <span key={i} style={{ left }}>
              {label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const { cond, glyph } = weatherWords(snap.code);
  // THE OBSERVATION IS THE CAPTURE HOUR, on today and on a past day alike — it
  // is the hour `snap.tempC` belongs to, and the marker's whole job is to sit
  // where the reading came from. `now` is a separate number (below).
  const obsT = snap.hour;
  const curve = buildWxCurve(snap.hourlyC, obsT);
  // A past day is wholly elapsed: the veil covers the field and the seam sits
  // at the right edge, which is what a finished day looks like.
  const nowT = isToday ? now.getHours() + now.getMinutes() / 60 : 24;
  // Stale once the reading is over an hour behind the clock. Below that the two
  // marks overlap and the distinction is not worth a state; above it the gap is
  // legible on its own, and the hollow marker says this is the memory of a
  // measurement rather than a measurement. A past day is never "stale" — its
  // reading is as current as that day is ever going to get.
  const stale = isToday && nowT - obsT >= 1;
  const lede = isToday ? wxLede(snap.hourlyC, nowT, unit) : null;

  return (
    <div
      className={"card whimsy wx-card" + (stale ? " is-stale" : "")}
      style={
        {
          flex: "1.2 0 238px", // +8 with the clearance revert — see the is-nodata twin above

          "--wx-now": (nowT / 24).toFixed(4),
          // Written ONLY when it differs — the CSS defaults it to --wx-now, so
          // the fresh case stays a one-line definition rather than a repetition.
          ...(stale || !isToday ? { "--wx-obs": (obsT / 24).toFixed(4) } : {}),
          ...(curve?.lvl != null ? { "--wx-lvl": curve.lvl.toFixed(4) } : {}),
        } as CSSProperties
      }
    >
      <div className="ovl">
        <span className="ovl-t">
          <svg className="ico" viewBox="0 0 24 24">
            {I_WX.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </svg>
          Weather
        </span>
        {/* A SLASH, not "H 31 L 21": at header size the two letters were the
            widest and least informative thing in the line, and high-before-low
            needs no labelling. Not an en dash either — "−9–−2" puts a dash
            between two minus signs, and no typographic fix for that survives a
            font change. A slash survives every value the card can hold. */}
        <span className="meta">
          {displayTemp(snap.hiC, unit)}&deg; / {displayTemp(snap.loC, unit)}&deg;
        </span>
      </div>
      <div className="wx-read">
        <i className="wx-glyph" aria-hidden="true">
          <WxGlyph glyph={glyph} />
        </i>
        <span className="whead">{displayTemp(snap.tempC, unit)}&deg;</span>
        <span className="cond">{cond}</span>
        {lede != null && (
          <span className="wx-lede">
            <WxArrow up={lede.delta > 0} />
            {Math.abs(lede.delta)} by {atHourLabel(lede.atHour)}
          </span>
        )}
        <span className="kit-sr">{wxSentence(cond, snap, unit, lede, stale, obsT)}</span>
      </div>
      <div className="field wx-field">
        {curve != null && (
          <svg
            className="wx-graph"
            viewBox={`0 0 ${WX_BOX.w} ${WX_BOX.h}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path className="wx-area" d={curve.areaPath} />
            <path className="wx-line" d={curve.linePath} />
          </svg>
        )}
        <i className="wx-past" aria-hidden="true" />
        {curve?.lvl != null && <i className="wx-dot" aria-hidden="true" />}
        {/* The marker's value (user-ruled 2026-08-13). It is the SAME number as
            `.whead` — the recomposition put the observation's own temperature in
            the masthead — so this restates it beside the picture rather than
            adding a reading; `aria-hidden` for that reason, since the hidden
            sentence and the figure both already carry it.
            THE SIDE IS DECIDED HERE, not in CSS: the field clips, so a label
            anchored to a data position runs off the right edge in the last
            fifth of the window. Past 0.62 it hangs off the dot's left instead —
            0.62 rather than 0.5 because the label is ~30px in a ~296px field,
            so flipping at the midpoint would send it left for a third of the
            day it did not need to. */}
        {curve?.lvl != null && (
          <span
            className={obsT / 24 > 0.62 ? "wx-val on-left" : "wx-val"}
            aria-hidden="true"
          >
            {displayTemp(snap.tempC, unit)}&deg;
          </span>
        )}
      </div>
      <div className="wx-hours" aria-hidden="true">
        {WX_HOURS.map(([left, label], i) => (
          <span key={i} style={{ left }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}


/* ══ THE DESKTOP CARDS ═══════════════════════════════════════════════════════
   User-ruled 2026-08-14: the whimsy re-mints are the SMALL canvas's cards, and
   at 2K the originals come back. Each pair is chosen by `useCompact()`, so only
   one tree ever renders and the two stylesheets never meet on one element.

   ⚠ THESE ARE THE FROZEN DESIGNS. They correspond to the FINALs and, by this
   project's law, do not change without a ruling — which is why keeping both is
   not "two implementations to maintain". The SMALL cards are the ones that
   evolve. Exactly one deviation was ruled in, on the weather marker below.

   ⚠ AND THE DRAWINGS COME BACK, NOT THE ARITHMETIC. Every number these cards
   read is the tested one the small cards use: `periodProgress` for the rings
   (the old `timeProgress` drew a finished ring on every back-dated day, and is
   retired for cause), and the real observation for the weather marker. ONE
   SOURCE OF NUMBERS, TWO PICTURES. The one exception is `sunArcPoint`, which is
   not arithmetic at all — it samples the drawn curve, so it belongs to the
   drawing that has it. ═══════════════════════════════════════════════════ */

/** The arc-era sun: a dashed parabola with the disc riding it. */
function SunCardDesktop({ sun, lon, now }: { sun: SunInfo; lon: number; now: Date }) {
  const p = sunArcPoint(sun, now);
  const len =
    sun.state === "midnight-sun" ? "24h 00m" : sun.state === "polar-night" ? "0h 00m" : hm(sun.dayLengthMin);
  return (
    <div className="card whimsy sun-card" style={{ flex: "2.2 0 285px" }}>
      <Ovl label="Sun" d={I_SUN} />
      <div className="sun-len">
        <span className="whead">{len}</span>
        <span className="delta">
          {sun.deltaMin === 0
            ? "same as yesterday"
            : (sun.deltaMin > 0 ? "▲ " : "▼ ") + hm(Math.abs(sun.deltaMin)) + " vs yesterday"}
        </span>
      </div>
      <div className="field sun-field">
        <svg className="arc" viewBox={`0 0 ${SUN_ARC.w} ${SUN_ARC.h}`} preserveAspectRatio="none" aria-hidden="true">
          <line
            x1="0"
            y1={SUN_ARC.horizon}
            x2={SUN_ARC.w}
            y2={SUN_ARC.horizon}
            stroke="color-mix(in oklab, var(--whimsy-dusk), var(--whimsy-day) 46%)"
            strokeWidth="1.5"
          />
          <path d={sunArcPath()} fill="none" stroke="var(--whimsy-sun)" strokeWidth="2" strokeDasharray="3 7" strokeLinecap="round" />
        </svg>
        {p.visible && <div className="sun-disc" style={{ left: p.xPct + "%", top: p.yPct + "%" }} />}
        {sun.state === "normal" ? (
          <>
            <span className="sun-end rise">
              rise<b className="kv">{sun.sunrise ? atLocation(sun.sunrise, lon) : "—"}</b>
            </span>
            <span className="sun-end set">
              set<b className="kv">{sun.sunset ? atLocation(sun.sunset, lon) : "—"}</b>
            </span>
          </>
        ) : (
          <span className="sun-end rise">{sun.state === "midnight-sun" ? "does not set" : "does not rise"}</span>
        )}
      </div>
    </div>
  );
}

/** The 78px illustrated condition marks — the desktop card's own family, drawn
 *  in the frozen face's stroke vocabulary. The small card's 22px marks are a
 *  separate set (`WxGlyph`) and deliberately so: these are illustrations sized
 *  for their own tile, those are glyphs sized to sit inside a line of type. */
const WX_CLOUD_STROKE = "color-mix(in oklch, var(--whimsy-day), var(--text-strong) 22%)";

function WxGlyphDesktop({ glyph }: { glyph: WeatherGlyph }) {
  const sun = (cx: number, cy: number, r: number, ray: number) => (
    <g stroke="var(--whimsy-sun)" strokeWidth="1.8" strokeLinecap="round">
      <circle cx={cx} cy={cy} r={r} fill="var(--whimsy-sun)" stroke="none" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        const r1 = r + 3.5;
        const r2 = r + 3.5 + ray;
        return <line key={i} x1={cx + r1 * Math.cos(a)} y1={cy + r1 * Math.sin(a)} x2={cx + r2 * Math.cos(a)} y2={cy + r2 * Math.sin(a)} />;
      })}
    </g>
  );
  const cloud = (d: string) => <path d={d} fill="var(--panel-background)" stroke={WX_CLOUD_STROKE} strokeWidth="1.5" />;
  const CLOUD_LOW = "M18 42 a8 8 0 0 1 1-15 a10 10 0 0 1 19 2 a7 7 0 0 1 -1 13 z";
  const CLOUD_MID = "M17 36 a8 8 0 0 1 1-15 a10 10 0 0 1 19 2 a7 7 0 0 1 -1 13 z";
  const box = (kids: React.ReactNode) => (
    <svg width="54" height="46" viewBox="0 0 60 48" aria-hidden="true">{kids}</svg>
  );
  switch (glyph) {
    case "sun":
      return box(sun(30, 24, 8.5, 4.5));
    case "partly":
      return box(<>{sun(24, 16, 7.5, 4)}{cloud(CLOUD_LOW)}</>);
    case "cloud":
      return box(cloud("M16 38 a9 9 0 0 1 1-17 a11 11 0 0 1 21 2 a8 8 0 0 1 -1 15 z"));
    case "fog":
      return box(
        <>
          {cloud(CLOUD_MID)}
          <g stroke={WX_CLOUD_STROKE} strokeWidth="1.5" strokeLinecap="round">
            <line x1="15" y1="41" x2="41" y2="41" />
            <line x1="20" y1="45" x2="36" y2="45" />
          </g>
        </>,
      );
    case "rain":
      return box(
        <>
          {cloud(CLOUD_MID)}
          <g stroke={WX_CLOUD_STROKE} strokeWidth="1.6" strokeLinecap="round">
            <line x1="22" y1="40" x2="20" y2="46" />
            <line x1="29" y1="40" x2="27" y2="46" />
            <line x1="36" y1="40" x2="34" y2="46" />
          </g>
        </>,
      );
    case "snow":
      return box(
        <>
          {cloud(CLOUD_MID)}
          <g fill={WX_CLOUD_STROKE}>
            <circle cx="22" cy="42" r="1.5" />
            <circle cx="29" cy="45" r="1.5" />
            <circle cx="36" cy="42" r="1.5" />
          </g>
        </>,
      );
    case "storm":
      return box(
        <>
          {cloud(CLOUD_MID)}
          <path d="M28 39 L22 47 L27 47 L25 52 L33 43 L28 43 Z" fill="var(--whimsy-sun)" stroke="none" />
        </>,
      );
  }
}

/** The row-layout weather card: glyph tile · now-block · curve panel. */
function WeatherCardDesktop({
  snap,
  unit,
  isToday,
}: {
  snap: WeatherSnap | null;
  unit: "F" | "C";
  isToday: boolean;
}) {
  if (snap == null) {
    return (
      <div className="card whimsy" style={{ flex: "1.2 0 156px" }}>
        <Ovl label="Weather" d={I_WX} />
        <div className="art wx">
          <div className="wx-nowblock">
            <span className="whead">{"—"}</span>
            <div className="cond">{isToday ? "Waiting on the forecast" : "No weather captured"}</div>
          </div>
        </div>
      </div>
    );
  }
  const { cond, glyph } = weatherWords(snap.code);
  // ⚠ THE ONE RULED DEVIATION FROM THE FROZEN DESIGN (2026-08-14, user-ruled
  // "fix weather, it's fine if it isn't frozen"). The original placed the marker
  // at NOW while labelling it `snap.tempC` — the CAPTURE temperature. The
  // snapshot is fetched once a day, so on any afternoon that drew an 08:00
  // reading at the 20:00 position with nothing on screen saying so. The marker
  // now sits at the hour the reading belongs to, which makes the picture and its
  // label the same fact. The FINAL was drawn before anybody noticed.
  const curve = buildWxCurve(snap.hourlyC, snap.hour, WX_BOX_DESKTOP);
  const B = WX_BOX_DESKTOP;
  return (
    <div className="card whimsy" style={{ flex: "1.2 0 156px" }}>
      <Ovl label="Weather" d={I_WX} />
      <div className="art wx">
        <div className="wx-glyph">
          <WxGlyphDesktop glyph={glyph} />
        </div>
        <div className="wx-nowblock">
          <span className="whead">{displayTemp(snap.tempC, unit)}&deg;</span>
          <div className="cond">{cond}</div>
          <div className="hl">
            H {displayTemp(snap.hiC, unit)}&deg;&emsp;L {displayTemp(snap.loC, unit)}&deg;
          </div>
        </div>
        {curve != null && (
          <div className="wx-curve">
            <div className="wx-plot">
              <svg viewBox={`0 0 ${B.w} ${B.h}`} preserveAspectRatio="none" aria-hidden="true">
                <path d={curve.areaPath} fill="color-mix(in oklch, var(--whimsy-sun), transparent var(--chart-area-mix))" stroke="none" />
                <path d={curve.linePath} fill="none" stroke="var(--whimsy-sun)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {curve.mark != null && (
                  <>
                    <line x1={curve.mark.x} y1={curve.mark.y} x2={curve.mark.x} y2={B.h} stroke="var(--whimsy-ink)" strokeWidth="1" strokeDasharray="2 3" opacity="0.5" />
                    <circle cx={curve.mark.x} cy={curve.mark.y} r="3" fill="var(--whimsy-ink)" />
                  </>
                )}
              </svg>
              {curve.mark != null && (
                <span
                  className="wx-mark"
                  style={{ left: `${((curve.mark.x / B.w) * 100).toFixed(1)}%`, top: `${((curve.mark.y / B.h) * 100).toFixed(1)}%` }}
                >
                  {displayTemp(snap.tempC, unit)}&deg;
                </span>
              )}
            </div>
            <div className="wx-hours" aria-hidden="true">
              {WX_HOURS_DESKTOP.map(([left, label], i) => (
                <span key={i} style={{ left }}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 2·pi·r for r=28.5 in the 64-unit ring viewBox — the dash arithmetic's
 *  constant. The SMALL card needs no equivalent: its arcs carry pathLength="100"
 *  so CSS does the same sum without a circumference. */
const RING_C = 179.07;

/** One ring of the five-donut grid. */
function Ring({ value, stroke, label }: { value: number; stroke: string; label: string }) {
  const on = Math.max(0, Math.min(1, value)) * RING_C;
  return (
    <div className="tp">
      <svg className="tp-ring" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="28.5" fill="none" stroke="var(--inset-background)" strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r="28.5"
          fill="none"
          stroke={stroke}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={on.toFixed(2) + " " + RING_C}
          transform="rotate(-90 32 32)"
          // color mirrors stroke because drop-shadow() reads `color`, never
          // stroke — without it a theme cannot light this arc in its own hue.
          style={{ color: stroke }}
        />
        <text x="32" y="32" textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-mono)" fontSize="15" fontWeight="700" fill="var(--text-strong)">
          {pct(value) + "%"}
        </text>
      </svg>
      <span className="tp-lbl">{label}</span>
    </div>
  );
}

/** The five-donut grid — the FINAL's period-progress card. */
function TimeProgressCardDesktop({ dayKey, now }: { dayKey: string; now: Date }) {
  // ⚠ FED BY `periodProgress`, NOT THE OLD `timeProgress`. The drawing is
  // restored; the arithmetic is not. The old rule read 100% from midnight on
  // every back-dated day — a finished ring on an unfinished day, on the very
  // surface the catch-up queue sits beside.
  const t = periodProgress(dayKey, now, weekStartDow());
  const mi = Number(dayKey.slice(5, 7)) - 1;
  const monthVar = "var(" + MON_VAR[mi] + ")";
  // Quarter takes the quarter's MIDDLE month, week a shaded month — the derived
  // period colours the registry calls for; the year is the theme accent.
  const qMid = "var(" + MON_VAR[Math.floor(mi / 3) * 3 + 1] + ")";
  const weekVar = "color-mix(in oklch, " + monthVar + ", var(--window-background) var(--week-shade-mix))";
  const d = new Date(dayKey + "T12:00:00");
  const doy = dayOfYear(dayKey);
  const yr = Number(dayKey.slice(0, 4));
  const daysInYear = Math.round((new Date(yr + 1, 0, 1).getTime() - new Date(yr, 0, 1).getTime()) / 86_400_000);
  return (
    <div className="card whimsy timeprog" style={ALMANAC_FLEX}>
      <div className="ovl">
        <span className="ovl-t">
          <svg className="ico" viewBox="0 0 24 24">
            {I_TIME.map((seg, i) => (
              <path key={i} d={seg} />
            ))}
          </svg>
          Period progress
        </span>
        <span className="meta">elapsed time &middot; not a goal</span>
      </div>
      <div className="art" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div className="tp-grid">
          <Ring value={t.day} stroke={monthVar} label="Day" />
          <Ring value={t.week} stroke={weekVar} label="Week" />
          <Ring value={t.month} stroke={monthVar} label="Month" />
          <Ring value={t.quarter} stroke={qMid} label="Quarter" />
          <Ring value={t.year} stroke="var(--accent)" label="Year" />
        </div>
        <div className="tp-note">
          {"Day " + doy + " of " + daysInYear + " · week " + t.weekNumber + " · Q" + t.quarter1 + " · " + WEEKDAY_FMT.format(d) + " " + pad2(now.getHours()) + ":" + pad2(now.getMinutes())}
        </div>
      </div>
    </div>
  );
}

/* ── THE THREE CHOOSERS ──────────────────────────────────────────────────
   One line each, and the branch is the WHOLE difference between the canvases.
   `useCompact()` is a subscription to the root class, so the Developer screen
   toggle re-dresses these live — no reload. */
export function SunCard(props: { sun: SunInfo; lat: number; lon: number; dayKey: string; now: Date }) {
  return useCompact() ? <SunCardSmall {...props} /> : <SunCardDesktop sun={props.sun} lon={props.lon} now={props.now} />;
}

export function WeatherCard(props: { snap: WeatherSnap | null; unit: "F" | "C"; isToday: boolean; now: Date }) {
  return useCompact() ? <WeatherCardSmall {...props} /> : <WeatherCardDesktop snap={props.snap} unit={props.unit} isToday={props.isToday} />;
}

export function TimeProgressCard(props: { dayKey: string; now: Date }) {
  return useCompact() ? <TimeProgressCardSmall {...props} /> : <TimeProgressCardDesktop {...props} />;
}

export function SeasonCard({ dayKey, lat }: { dayKey: string; lat: number }) {
  const s = seasonInfo(dayKey, lat);
  const band = seasonBand(dayKey, lat, s.northern);
  return (
    <div className="card whimsy season-card" style={{ flex: "1.15 0 149px" }}>
      <Ovl label="Season" d={I_SEASON} />
      <div className="art season-art" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div className="season-head">
          <b>
            {s.season} · day {s.dayIndex} of {s.length}
          </b>
          <span className="kv">{s.daysToNext} days left</span>
        </div>
        <div className="yr-wrap">
          <div className="yr-band">
            {band.segments.map((seg, i) => (
              <i
                key={i}
                style={{
                  flex: seg.days,
                  background: seg.current
                    ? "var(" + seg.monthVar + ")"
                    : "color-mix(in oklch, var(" + seg.monthVar + "), var(--panel-background) var(--quarter-wash-mix))",
                }}
              />
            ))}
          </div>
          <div className="yr-today" style={{ left: band.todayPct.toFixed(1) + "%" }} />
        </div>
        <div className="yr-ticks">
          {band.ticks.map((t) => (
            <span className="yr-tick" key={t.label} style={{ left: t.pct.toFixed(1) + "%" }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** One lunation-strip glyph — the same terminator construction at 20x20. */
function PhaseDot({ f, phase, current }: { f: number; phase: number; current: boolean }) {
  const g = moonDiscPaths(f, phase, 8, 10, 10);
  return (
    <span className="pd">
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill="var(--whimsy-night)" stroke="color-mix(in oklch, var(--whimsy-moon), var(--whimsy-night) 62%)" strokeWidth="0.7" />
        <path d={g.half} fill="var(--whimsy-moon)" />
        <path d={g.terminator} fill={f > 0.5 ? "var(--whimsy-moon)" : "var(--whimsy-night)"} />
        {current && <circle cx="10" cy="10" r="8.6" fill="none" stroke="var(--whimsy-star)" strokeWidth="2.2" />}
      </svg>
    </span>
  );
}

export function MoonCard({ moon }: { moon: MoonInfo }) {
  const g = moonDiscPaths(moon.illumination, moon.phase);
  // 28 nights of the lunation, the current one ringed.
  const dots = Array.from({ length: 28 }, (_, i) => {
    const ph = i / 28;
    return { ph, frac: (1 - Math.cos(2 * Math.PI * ph)) / 2 };
  });
  const currentIdx = Math.round(moon.phase * 28) % 28;
  return (
    <div className="card whimsy moon-card" style={{ flex: "1.9 0 247px" }}>
      <Ovl label="Moon" d={I_MOON} />
      <div className="art">
        <div className="field moon-field">
          <div className="moon-night">
            <svg
              className="moon-disc-fig"
              viewBox="0 0 132 132"
              aria-hidden="true"
              style={moon.mirrored ? { transform: "scaleX(-1)" } : undefined}
            >
              <circle cx="66" cy="66" r="60" fill="var(--whimsy-night)" stroke="color-mix(in oklch, var(--whimsy-moon), var(--whimsy-night) 58%)" strokeWidth="1" />
              <path d={g.half} fill="var(--whimsy-moon)" />
              <path d={g.terminator} fill={moon.illumination > 0.5 ? "var(--whimsy-moon)" : "var(--whimsy-night)"} />
            </svg>
            <div className="moon-facts">
              <div className="il">{Math.round(moon.illumination * 100)}%</div>
              <div className="nx">{moon.name}</div>
              {moon.alwaysUp && <div className="nx">Up all day</div>}
              {moon.alwaysDown && <div className="nx">Below the horizon all day</div>}
            </div>
          </div>
          <div className="pstrip">
            {dots.map((d, i) => (
              <PhaseDot key={i} f={d.frac} phase={d.ph} current={i === currentIdx} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// The bright figure is the FEATURED asterism's, drawn from tonightsFeature's
// table — the frozen face's triangle IS the Summer Triangle, so the art and
// the Featured line move together. The faint dots stay a fixed backfield.
export function TonightSkyCard({ dayKey, lat }: { dayKey: string; lat: number }) {
  const list = tonightsSky(dayKey, lat);
  const feat = tonightsFeature(dayKey, lat);
  return (
    <div className="card whimsy tonight-card" style={{ flex: "1.35 0 230px" }}>
      <Ovl label="Tonight's Sky" d={I_STAR} />
      <div className="field night-field">
        {/* xMax + the right-shifted centre keep the figure clear of the caption,
            which owns the bottom-left; narrow cards crop the empty left instead. */}
        <svg className="stars" viewBox="0 0 480 230" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
          <g transform="translate(340 100) scale(0.62) translate(-200 -100)">
            <g stroke="var(--whimsy-star)" strokeWidth="1.2" opacity="0.65">
              {feat.lines.map(([a, b], i) => (
                <line key={i} x1={feat.stars[a][0]} y1={feat.stars[a][1]} x2={feat.stars[b][0]} y2={feat.stars[b][1]} />
              ))}
            </g>
            <g fill="var(--whimsy-star)">
              {feat.stars.map(([x, y, r], i) => (
                <circle key={i} cx={x} cy={y} r={r} />
              ))}
            </g>
            <g fill="color-mix(in oklch, var(--whimsy-star), var(--whimsy-night) 48%)">
              <circle cx="110" cy="30" r="1.5" />
              <circle cx="242" cy="24" r="1.1" />
              <circle cx="352" cy="118" r="1.7" />
              <circle cx="70" cy="140" r="1.2" />
              <circle cx="252" cy="122" r="1.5" />
              <circle cx="130" cy="96" r="1" />
              <circle cx="330" cy="30" r="1.3" />
              <circle cx="22" cy="98" r="1" />
              <circle cx="214" cy="82" r="1.2" />
              <circle cx="382" cy="172" r="1.3" />
            </g>
          </g>
        </svg>
        <div className="sky-cap">
          <b>{list[0]}</b>
          {list.length > 1 ? " \u00b7 " + list.slice(1).join(" \u00b7 ") : ""}
          <span className="feat">Featured · {feat.name}</span>
        </div>
      </div>
    </div>
  );
}

// -- almanac column: translated from Final/daily-state-1.html -----------------
//
// These cards are `flex:1 0 auto` — content-sized, never shrink, grow into
// surplus. That is what makes the ALMANAC the row's driver ("the almanac sets
// the row's maximum, the sky column its minimum"): its real height decides how
// much the basis-0 sky cards get to divide.

const I_QUOTE = ["M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z", "M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"];
const I_WORD = ["M4 7V4h16v3", "M9 20h6", "M12 4v16"];
const I_FACT = ["M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5", "M9 18h6", "M10 22h4"];
const I_OTD = ["M8 2v4", "M16 2v4", "M3 10h18", "M8 14h.01", "M12 14h.01", "M16 14h.01", "M8 18h.01", "M12 18h.01"];
const I_HOL = ["M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z", "M4 22v-7"];
const I_TIME = ["M5 22h14", "M5 2h14", "M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22", "M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"];

/** The almanac's flex contract, drawn on every card in the column. */
const ALMANAC_FLEX = { flex: "1 0 auto" } as const;

export function QuoteCard({ dayKey }: { dayKey: string }) {
  const q = quoteFor(dayKey);
  return (
    <div className="card whimsy quote-card" style={ALMANAC_FLEX}>
      <Ovl label="Quote" d={I_QUOTE} />
      <div className="art" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {/* `.qbody` is a Build-side wrapper with no counterpart in the FINAL.
            `.qmark` is absolutely positioned against its nearest positioned
            ancestor, which in the frozen file is `.art` \u2014 fine there, because
            that art box hugs its text. Our almanac cards GROW to match the sky
            column while `.art` centres its content, so the mark would stay
            pinned to the top of a much taller box and drift away from the line
            it belongs to. Wrapping the text block gives the mark something that
            hugs the text at any card height. */}
        <div className="qbody">
          <span className="qmark" aria-hidden="true">
            {"\u201C"}
          </span>
          <p className="quote">{q.text}</p>
          <p className="by">{"\u2014 " + q.who}</p>
        </div>
      </div>
    </div>
  );
}

export function WordCard({ dayKey }: { dayKey: string }) {
  const w = wordFor(dayKey);
  return (
    <div className="card whimsy word" style={ALMANAC_FLEX}>
      <Ovl label="Word of the Day" d={I_WORD} />
      <div className="art" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div className="w">{w.word}</div>
        <div className="rule" aria-hidden="true" />
        <div className="pr">
          {w.ipa} · <span className="pos">{w.kind}</span>
        </div>
        <div className="def">{w.meaning}</div>
        <div className="ety">
          <span className="lbl">Etymology</span>
          {w.etymology}
        </div>
      </div>
    </div>
  );
}

export function FactCard({ dayKey }: { dayKey: string }) {
  const f = factFor(dayKey);
  return (
    <div className="card whimsy" style={ALMANAC_FLEX}>
      <Ovl label="Fun Fact" d={I_FACT} />
      <div
        className="art"
        style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", gap: "var(--space-4)" }}
      >
        <span className="chip-cat" style={{ ["--c" as string]: `var(--cat-${f.cat})` }}>
          {f.category}
        </span>
        <p className="fact" style={{ margin: 0 }}>
          {f.text}
        </p>
      </div>
    </div>
  );
}

export function OnThisDayCard({
  dayKey,
  anniversaries = [],
  trackingYears = null,
  appYears = null,
}: {
  dayKey: string;
  anniversaries?: Anniversary[];
  trackingYears?: number | null;
  /** Whole years since the app itself was first used — a DIFFERENT fact from
   *  `trackingYears`, which reads the earliest session (appStart.ts). */
  appYears?: number | null;
}) {
  const events = onThisDay(dayKey);
  const dd = Number(dayKey.slice(8, 10));
  const monLong = MONTHS_LONG[Number(dayKey.slice(5, 7)) - 1];
  const thisYear = dayKey.slice(0, 4);
  const hasPersonal =
    anniversaries.length > 0 || trackingYears != null || appYears != null;
  return (
    <div className="card whimsy otd" style={ALMANAC_FLEX}>
      <div className="ovl">
        <span className="ovl-t">
          <svg className="ico" viewBox="0 0 24 24">
            <rect width="18" height="18" x="3" y="4" rx="2" />
            {I_OTD.map((seg, i) => (
              <path key={i} d={seg} />
            ))}
          </svg>
          On this day
        </span>
        <span className="meta">{dd + " " + monLong}</span>
      </div>
      <div className="art" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {/* The empty state is NOT a timeline row: as an <li> it inherited the
            rail and its marker dot, and the text was forced into the narrow
            column that exists to sit beside a year — one word per line. */}
        {events.length === 0 && !hasPersonal ? (
          <p className="tl-empty">Nothing recorded for this date.</p>
        ) : (
        <ol className="tl">
          {events.map((e) => (
            <li className="tl-ev" key={e.year}>
              <span className="tl-yr kv">{e.year}</span>
              <span className="tl-tx">{e.what}</span>
            </li>
          ))}
          {/* The row about YOU — derived from the store, never stored. */}
          {hasPersonal && (
            <li className="tl-ev now">
              <span className="tl-yr kv">{thisYear}</span>
              <span className="tl-tx">
                {anniversaries.map((a, i) => (
                  <span key={a.habitName}>
                    {i > 0 ? " \u00b7 " : ""}
                    {a.years} {a.years === 1 ? "year" : "years"} since your first {a.habitName}{" "}
                    session
                  </span>
                ))}
                {trackingYears != null &&
                  (anniversaries.length > 0 ? " \u00b7 " : "") +
                    trackingYears +
                    (trackingYears === 1 ? " year" : " years") +
                    " of tracking with Cibo."}
                {appYears != null &&
                  (anniversaries.length > 0 || trackingYears != null ? " \u00b7 " : "") +
                    appYears +
                    (appYears === 1 ? " year" : " years") +
                    " since you started using Cibo."}
              </span>
            </li>
          )}
        </ol>
        )}
      </div>
    </div>
  );
}

/** Absent on most days by design — the caller decides whether to render it. */
export function HolidayCard({ dayKey }: { dayKey: string }) {
  const h = holidayFor(dayKey);
  if (!h) return null;
  const dd = Number(dayKey.slice(8, 10));
  const mi = Number(dayKey.slice(5, 7)) - 1;
  const mon = MONTHS_SHORT[mi];
  return (
    <div className="card whimsy holiday" style={ALMANAC_FLEX}>
      <Ovl label="Holiday" d={I_HOL} />
      <div className="art" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div className="hol">
          {/* Tinted by the holiday's ACTUAL month (user-ruled 2026-07-30) —
              the frozen --month-jul was the FINAL's sample month, not a rule. */}
          <div className="hol-date" style={{ "--c": `var(${MON_VAR[mi]})` } as CSSProperties}>
            <span className="hol-day">{dd}</span>
            <span className="hol-mon">{mon}</span>
          </div>
          <div className="hol-body">
            <div className="hol-name">{h}</div>
            <div className="hol-country">International</div>
          </div>
        </div>
      </div>
    </div>
  );
}


const WEEKDAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const MON_VAR = ["--month-jan", "--month-feb", "--month-mar", "--month-apr", "--month-may", "--month-jun", "--month-jul", "--month-aug", "--month-sep", "--month-oct", "--month-nov", "--month-dec"];

/**
 * PERIOD PROGRESS — five nested arcs on ONE dial, re-minted 2026-08-12.
 *
 * WHAT THE COMPONENT WRITES, and why it is written rather than drawn: five
 * normalised fractions plus the month's ink, as inline custom properties. Every
 * arc is `pathLength="100"`, so the sheet does its dash arithmetic as
 * `calc(var(--tp-…) * 100)` and never needs a circumference — which is what lets
 * the dial be re-sized by one dial (`--tp-dial`) instead of by editing geometry.
 * The precedent is `--wall-cols`: a value the layout owns, published for the
 * other half to read.
 *
 * ⚠ THE PERCENTAGES ARE HTML ON THE CARD'S GROUND, not `<text>` in the svg. The
 * old ring baked `font-size: 15` into a 64 viewBox, so the number scaled with the
 * drawing and a smaller ring set its own label at ~8px — the reason every attempt
 * to shrink the rings was struck. As HTML they take the type ramp and the theme's
 * ink like any other reading.
 *
 * ⚠ AND THE ARITHMETIC MOVED OUT ENTIRELY, to `periodProgress.ts`. The five
 * readings used to run on four different rules; the day's fell back to a whole
 * constant day for anything that was not today, so **every back-dated day drew a
 * finished ring** — a progress ring claiming a finished day is this card's worst
 * possible failure, and it was its ordinary behaviour on the catch-up queue.
 * One rule now: elapsed real time over the period's real length, at one instant,
 * floored for display, with every denominator a real local interval.
 *
 * The note is IDENTITY, not magnitude — "Saturday 1 August · week 31 · Q3". It
 * must never restate a fraction the dial already draws; that was the old note's
 * whole content ("Day 213 of 365" IS the year arc).
 */
function TimeProgressCardSmall({ dayKey, now }: { dayKey: string; now: Date }) {
  const t = periodProgress(dayKey, now, weekStartDow());
  const mi = Number(dayKey.slice(5, 7)) - 1;
  const d = new Date(dayKey + "T12:00:00");
  const isToday = todayLocal() === dayKey;
  const hhmm =
    String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  const ident = WEEKDAY_FMT.format(d) + " " + d.getDate() + " " + MONTHS_LONG[mi];

  const arcs = [
    { cls: "a-d", r: 46, k: "Day", v: t.day, live: true },
    { cls: "a-w", r: 37, k: "Week", v: t.week, live: false },
    { cls: "a-m", r: 28, k: "Month", v: t.month, live: false },
    { cls: "a-q", r: 19, k: "Quarter", v: t.quarter, live: false },
    { cls: "a-y", r: 10, k: "Year", v: t.year, live: false },
  ];

  return (
    <div
      className="card whimsy timeprog"
      style={
        {
          ...ALMANAC_FLEX,
          "--tp-day": t.day.toFixed(4),
          "--tp-week": t.week.toFixed(4),
          "--tp-month": t.month.toFixed(4),
          "--tp-quarter": t.quarter.toFixed(4),
          "--tp-year": t.year.toFixed(4),
          // the month's own registry slot — the dial inks from the period it is
          // inside, so August's arcs are August's colour on every theme.
          "--tp-ink": `var(${MON_VAR[mi]})`,
        } as CSSProperties
      }
    >
      <div className="ovl">
        <span className="ovl-t">
          <svg className="ico" viewBox="0 0 24 24">
            {I_TIME.map((seg, i) => (
              <path key={i} d={seg} />
            ))}
          </svg>
          Period progress
        </span>
        {/* the "elapsed time · not a goal" meta was STRUCK at the re-mint: it
            measured ~315px against a 330 column, and a disclaimer that has to
            wrap twice is louder than the thing it disclaims. */}
      </div>
      <div className="art" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div className="tp-body">
          <svg className="tp-dial" viewBox="0 0 100 100" aria-hidden="true">
            {arcs.map((a) => (
              <circle key={"t" + a.cls} className="tp-trk" cx="50" cy="50" r={a.r} />
            ))}
            {arcs.map((a) => (
              <circle
                key={a.cls}
                className={"tp-arc " + a.cls}
                cx="50"
                cy="50"
                r={a.r}
                pathLength="100"
                transform="rotate(-90 50 50)"
              />
            ))}
            {/* the origin mark — where every arc starts, so a nearly-full ring
                reads as nearly-full rather than as a closed circle. */}
            <line className="tp-orig" x1="50" y1="1" x2="50" y2="38" />
          </svg>
          <div className="tp-keys">
            {arcs.map((a) => (
              <div key={a.cls} className={a.live ? "tp-key is-live" : "tp-key"}>
                <span className="tp-k">{a.k}</span>
                <span className="tp-v">{pct(a.v)}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="tp-note">
          {ident + " \u00b7 week " + t.weekNumber + " \u00b7 Q" + t.quarter1}
        </div>
        {/* the hidden state sentence — generated from the same five numbers as
            the art, so a screen reader gets the picture and not just the labels. */}
        <p className="kit-sr">
          {ident +
            (isToday ? ", " + hhmm : "") +
            ". " +
            pct(t.day) + "% through the day, " +
            pct(t.week) + "% through week " + t.weekNumber + ", " +
            pct(t.month) + "% through " + MONTHS_LONG[mi] + ", " +
            pct(t.quarter) + "% through Q" + t.quarter1 + ", " +
            pct(t.year) + "% through the year."}
        </p>
      </div>
    </div>
  );
}

// -- the mystical shelf: translated from Final/daily-state-1.html -------------

const I_HORO = ["M20.341 6.484A10 10 0 0 1 10.266 21.85", "M3.659 17.516A10 10 0 0 1 13.74 2.152", "circle:3"];
const I_TAROT = ["M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z", "M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12", "M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"];
const I_REDISC = ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5", "M12 7v5l4 2"];
const I_CD = ["M10 2h4", "M12 14l3-3", "circle:8"];
const I_LIFE = ["M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z"];

export function HoroscopeCard({
  config,
  reading,
  isToday,
}: {
  config: WhimsyConfig;
  reading: HoroscopeSnap | null;
  isToday: boolean;
}) {
  const sign = sunSign(config.birthdate);
  return (
    <div className="card whimsy horo">
      <Ovl label="Horoscope" d={I_HORO} />
      <div className="body art">
        {sign && (
          <div className="sign">
            <div className="disc2">
              <span className="gl">{sign.glyph}</span>
            </div>
            <div className="nm">{sign.name}</div>
          </div>
        )}
        {/* The sign is a pure function of the birthdate, so it always renders;
            the reading is ephemeral — snapshot-at-fetch, absent means absent. */}
        {reading != null ? (
          <p>{reading.text}</p>
        ) : (
          <p className="wpending">
            {sign == null
              ? "Set a birthdate to see your sign."
              : isToday
                ? `Waiting on today's reading for ${sign.name}…`
                : "No reading was captured for this day."}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * With a draw in the snapshot the face renders WHOLE — numeral, art, name,
 * keywords. The art is the drawn card's OWN face since 2026-08-06, closing
 * network-tier fork D ("per-card SVGs are authored once the network is
 * confirmed working", user-ruled 2026-07-27); the shared star emblem it
 * replaces survives as card 17. A reversed draw turns the pictorial group
 * upside down — the numeral and name stay readable.
 *
 * Without one the face is DELIBERATELY blank of a named card: inventing
 * "The Star" would fabricate a reading the app has not made.
 */
export function TarotCard({ draw, isToday }: { draw: TarotSnap | null; isToday: boolean }) {
  // Read BEFORE the early return: hooks may not sit under a conditional, the
  // NavCalendar crash of 2026-08-04 being this codebase's own record of it.
  const compact = useCompact();
  if (draw != null) {
    const longName = draw.name.length > 11;
    return (
      <div className="card whimsy tarot">
        <Ovl label="Tarot" d={I_TAROT} />
        <div className="body art">
          <svg className="tarot-card" viewBox="0 0 104 182" aria-hidden="true">
            <rect x="2" y="2" width="100" height="178" rx="7" fill="var(--whimsy-parchment)" stroke="var(--whimsy-ink)" strokeWidth="1.5" />
            <rect x="8" y="8" width="88" height="166" rx="4" fill="none" stroke="var(--whimsy-star)" strokeWidth="1" />
            <text x="52" y="26" textAnchor="middle" fontFamily="var(--font-heading)" fontSize="11" letterSpacing="1.5" fill="var(--whimsy-ink)">
              {draw.numeral}
            </text>
            <TarotArt n={draw.n} reversed={draw.reversed} />
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
              {draw.name.toUpperCase()}
            </text>
          </svg>
          <div>
            <div className="nm">{draw.name}</div>
            {/* THE CAPTION IS TWO LINES, NOT THREE (shelf height ruling,
                2026-08-13). `.up` carried "upright · daily draw", of which
                "daily draw" is what the card IS — said on a card whose overline
                already reads Tarot — and the orientation is the only word in it
                that changes. Folded onto the keyword line it costs a line of
                the shelf band's height and no fact.
                THE ELEMENT IS DELETED, NOT HIDDEN: a card that renders an empty
                element is a card waiting to grow the line back. */}
            {/* TWO LINES ON THE SMALL CANVAS, THREE AT 2K. The fold was the
                tarot's share of the shelf-height cut, and that ruling was
                explicitly about the MacBook band being too tall — at 2560 the
                band has the room, so the FINAL's third line is the right card.
                The element is still absent rather than hidden when folded. */}
            {compact ? (
              <div className="kw">{[...draw.keywords, draw.reversed ? "reversed" : "upright"].join(" · ")}</div>
            ) : (
              <>
                <div className="kw">{draw.keywords.join(" · ")}</div>
                <div className="up">{draw.reversed ? "reversed" : "upright"} · daily draw</div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="card whimsy tarot">
      <Ovl label="Tarot" d={I_TAROT} />
      <div className="body art">
        <svg className="tarot-card" viewBox="0 0 104 182" aria-hidden="true">
          <rect x="2" y="2" width="100" height="178" rx="7" fill="var(--whimsy-parchment)" stroke="var(--whimsy-ink)" strokeWidth="1.5" />
          <rect x="8" y="8" width="88" height="166" rx="4" fill="none" stroke="var(--whimsy-star)" strokeWidth="1" />
          <g fill="var(--whimsy-star)">
            <circle cx="24" cy="34" r="1.6" />
            <circle cx="80" cy="30" r="1.4" />
            <circle cx="52" cy="31" r="1.5" />
            <circle cx="30" cy="58" r="1.2" />
            <circle cx="74" cy="60" r="1.3" />
            <circle cx="20" cy="88" r="1.2" />
            <circle cx="84" cy="90" r="1.4" />
          </g>
          <g fill="none" stroke="var(--whimsy-ink)" strokeWidth="1.3" strokeLinecap="round" opacity="0.35">
            <path d="M14 132 q11 -6 22 0 t22 0 t22 0" />
            <path d="M14 144 q11 -6 22 0 t22 0 t22 0" opacity="0.6" />
          </g>
        </svg>
        <div>
          <p className="wpending">
            {isToday ? "Drawing today's card…" : "No card was drawn on this day."}
          </p>
        </div>
      </div>
    </div>
  );
}

const WEEKDAY_LONG = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });

export function RediscoverCard({
  dayKey,
  pastDays,
  onOpenDay,
}: {
  dayKey: string;
  pastDays: string[];
  onOpenDay?: (day: string) => void;
}) {
  const day = rediscover(pastDays, dayKey);
  if (!day) {
    return (
      <div className="card whimsy redisc">
        <Ovl label="Rediscover" d={I_REDISC} />
        <div className="portal">
          <p className="wpending">Nothing logged yet to revisit.</p>
        </div>
      </div>
    );
  }
  // The mini wall is tinted by the rediscovered day's own month, as drawn: a few
  // tiles carry the month at different mixes, the rest stay neutral.
  const mv = MON_VAR[Number(day.slice(5, 7)) - 1];
  const tint = (mix: number) => ({
    background: "color-mix(in oklch, var(" + mv + "), var(--panel-background) " + mix + "%)",
  });
  const lit: Record<number, number> = { 1: 50, 6: 66, 8: 78 };
  return (
    <div className="card whimsy redisc">
      <Ovl label="Rediscover" d={I_REDISC} />
      <div className="portal">
        <div className="mini">
          {Array.from({ length: 12 }, (_, i) => (
            <i key={i} style={lit[i] ? tint(lit[i]) : undefined} />
          ))}
        </div>
        <div className="plate">
          <div className="dt2">{WEEKDAY_LONG.format(new Date(day + "T12:00:00"))}</div>
          {/* Door to that day's cover wall, via the shell's openDay. */}
          <a
            className="go door"
            role="button"
            tabIndex={0}
            onClick={onOpenDay ? () => onOpenDay(day) : undefined}
            onKeyDown={(e) => {
              if (onOpenDay && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onOpenDay(day);
              }
            }}
          >
            step back into that day
            <svg className="ico sm" viewBox="0 0 24 24">
              <path d="M7 7h10v10" />
              <path d="M7 17 17 7" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}

const CD_DATE = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * Rows per page — TWO since 2026-08-13, superseding the three ruled 2026-07-26.
 *
 * The shelf-height ruling (`Mint - Shelf row.html` § 4): the band is as tall as
 * its tallest card, three of the five wanted ~300 and two ~160, so the two short
 * ones were being stretched ~160px. Countdowns' share of the cut is one event,
 * and it is the cheapest cut on the shelf because the card ALREADY states what
 * it is hiding — the pager exists for exactly this.
 *
 * ⚠ THE PAGE COUNT IS ARITHMETIC, NOT A STRING, which is why this constant is
 * the whole change: `pages` is events ÷ page size, so the same event set repages
 * on its own. Three events read "1 / 2" at a page of three and "1 / 3" at a page
 * of two. Nothing else has to move.
 *
 * ⚠ AND IT DECIDES WHETHER `.dense` FIRES AT ALL. The dense variant kicks in past
 * TWO rows, a threshold deliberately NOT tied to the page size (daily.css: the
 * FINAL's evidence is that two roomy rows fit a shelf card). So the two canvases
 * land on opposite sides of it: at 2K's page of three `.dense` is live and the
 * card steps down, while at the small page of two `list.length > 2` can never
 * hold, the numeral keeps its full size, and the "since" line that dense hides
 * comes back. Both are correct — dense exists because three rows do not fit, and
 * on the small canvas there are never three.
 * ⚠ WORTH MEASURING ON THE SMALL CANVAS: the mint measured this card at 234.5
 * against a binding horoscope at 245.1, on markup that carried `.dense`. The
 * roomy form is taller, so if the band comes out over 245 this is the first
 * place to look.
 */
const CD_PER_PAGE_SMALL = 2;
/** The FINAL's three, kept at 2K — the cut to two was the countdown card's
 *  share of the same MacBook-only shelf-height ruling. */
const CD_PER_PAGE_DESKTOP = 3;

export function CountdownsCard({ config, dayKey }: { config: WhimsyConfig; dayKey: string }) {
  const all = countdowns(config.events, dayKey);
  // ⚠ THE PAGE COUNT IS ARITHMETIC, so the same event set repages on its own
  // when the size changes — three events read "1 / 2" at a page of three and
  // "1 / 3" at a page of two, with nothing else to update.
  const perPage = useCompact() ? CD_PER_PAGE_SMALL : CD_PER_PAGE_DESKTOP;
  const pages = Math.max(1, Math.ceil(all.length / perPage));
  const [wanted, setPage] = useState(0);
  // Clamped rather than reset in an effect: the event list can shrink under us
  // (the dev panel, or a one-shot dropping off once it is past), and a stale
  // index would otherwise render an empty page.
  const page = Math.min(wanted, pages - 1);
  const list = all.slice(page * perPage, page * perPage + perPage);
  // The FINAL draws two roomy rows. Past that the big numeral stops fitting
  // beside its label, so the card steps down to a denser row.
  const dense = list.length > 2;
  return (
    <div className={dense ? "card whimsy cd dense" : "card whimsy cd"}>
      <Ovl label="Countdowns" d={I_CD} />
      <div className="art" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {list.length === 0 && <p className="wpending">No dates set.</p>}
        {list.map((c) => {
          // A recurring event shows its NEXT occurrence, not the year it began.
          const when = c.recurring
            ? new Date(dayKey + "T12:00:00").getTime() + c.days * 86_400_000
            : new Date(c.date + "T12:00:00").getTime();
          return (
            <div className="cdrow" key={c.id}>
              {/* "today" reads as one word, not as a dash beside a unit. */}
              {c.days === 0 ? (
                <span className="cdtoday">today</span>
              ) : (
                <>
                  <span className="cdnum">{c.days}</span>
                  <span className="cdu">{c.days === 1 ? "day" : "days"}</span>
                </>
              )}
              <span className="cdmeta">
                <span className="nm" title={c.label}>
                  {c.label}
                </span>
                <span className="when">{CD_DATE.format(new Date(when))}</span>
                {/* Both directions, user-ruled 2026-07-25 — on its own line, not
                    appended to the date, which pushed the row past the card. */}
                {c.sinceDays != null && c.days > 0 && (
                  <span className="cdsince">{c.sinceDays}d since the last</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {pages > 1 && (
        <div className="cdpager">
          <button
            className="cdpg"
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            aria-label="Previous countdowns"
          >
            <svg className="ico sm" viewBox="0 0 24 24">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <span className="cdpgn">
            {page + 1} / {pages}
          </span>
          <button
            className="cdpg"
            onClick={() => setPage(Math.min(pages - 1, page + 1))}
            disabled={page === pages - 1}
            aria-label="More countdowns"
          >
            <svg className="ico sm" viewBox="0 0 24 24">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * LIFETIME IS THE TRACKING'S LIFETIME, NOT THE USER'S.
 *
 * The FINAL draws "days tracked / sessions / entries" — totals across the whole
 * store. An earlier pass here read the label as a lifespan and rendered days
 * alive from the birthdate, which is a different card entirely. The lifespan
 * figures live on the almanac's own progress tier, not here.
 */
export function LifetimeCard({
  daysTracked,
  sessions,
  entries,
}: {
  daysTracked: number;
  sessions: number;
  entries: number;
}) {
  const rows: Array<[number, string, boolean]> = [
    [daysTracked, "days tracked", true],
    [sessions, "sessions", false],
    [entries, "entries", false],
  ];
  return (
    <div className="card whimsy life">
      <Ovl label="Lifetime" d={I_LIFE} />
      <div className="art" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {rows.map(([n, label, lead]) => (
          <div className={lead ? "r lead" : "r"} key={label}>
            <span className="n">{n.toLocaleString()}</span>
            <span className="l">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Convenience for the chassis: the sky column's computed inputs — pure
 * functions of the date, so the caller memoizes on (dayKey, config) alone;
 * the ticking disc reads `sunArcPoint(sun, now)` at render. */
export const skyInputs = (dayKey: string, config: WhimsyConfig) => ({
  sun: sunInfo(dayKey, config.lat, config.lon),
  moon: moonInfo(dayKey, config.lat, config.lon),
});
