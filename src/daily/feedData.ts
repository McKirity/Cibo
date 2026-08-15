/**
 * The network tier's PURE half — snapshot shapes, parsing, the WMO vocabulary
 * and the weather curve's geometry. No Evolu, no Tauri, no React: `feeds.ts`
 * (the IO half) and `cards.tsx` (the faces) both read from here, and the mock
 * harness exercises this file directly.
 */
import type { TarotDraw } from "./tarotDeck";

// ── The snapshot shape (`Days.feed_snapshot`, JSON keyed by card) ────────────

export interface WeatherSnap {
  /** Current temperature, °C — Celsius is the stored canon, display converts. */
  tempC: number;
  hiC: number;
  loC: number;
  /** WMO weather interpretation code (Open-Meteo `weather_code`). */
  code: number;
  /** 25 hourly temps °C: local midnight → next midnight inclusive. */
  hourlyC: number[];
  /** Local hour (0–23) at fetch — where a past day's "as of" marker sits. */
  hour: number;
  /**
   * Fetch provenance (step 15, 2026-08-06): the coordinates this snapshot was
   * fetched FOR. A location change (first-run setup · Settings → Whimsy) makes
   * today's weather stale — without these there was no way to know, and the
   * card silently wore the old place's weather until midnight. Absent on
   * pre-provenance snapshots, which `ensureTodayFeeds` treats as stale once.
   */
  lat?: number;
  lon?: number;
}

export interface HoroscopeSnap {
  sign: string;
  text: string;
}

export type TarotSnap = TarotDraw;

/** Parsed `feed_snapshot` — a JSON object keyed by card, all optional. */
export interface FeedSnapshot {
  weather?: WeatherSnap;
  horoscope?: HoroscopeSnap;
  tarot?: TarotSnap;
}

/**
 * Defensive by design: the column is schemaless ("shape validation is the
 * writer's job") and a malformed snapshot must degrade to ABSENT — omitted,
 * never faked, never thrown.
 */
export const parseFeedSnapshot = (raw: string | null | undefined): FeedSnapshot => {
  if (raw == null || raw === "") return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o == null || typeof o !== "object") return {};
    const out: FeedSnapshot = {};
    const w = o.weather as WeatherSnap | undefined;
    if (
      w != null &&
      typeof w.tempC === "number" &&
      typeof w.code === "number" &&
      typeof w.hiC === "number" &&
      Number.isFinite(w.hiC) &&
      typeof w.loC === "number" &&
      Number.isFinite(w.loC) &&
      typeof w.hour === "number" &&
      Number.isInteger(w.hour) &&
      w.hour >= 0 &&
      w.hour <= 24 &&
      Array.isArray(w.hourlyC) &&
      w.hourlyC.length >= 2 &&
      w.hourlyC.every((v) => typeof v === "number" && Number.isFinite(v))
    ) {
      out.weather = w;
    }
    const h = o.horoscope as HoroscopeSnap | undefined;
    if (h != null && typeof h.sign === "string" && typeof h.text === "string" && h.text.trim() !== "") {
      out.horoscope = h;
    }
    const t = o.tarot as TarotSnap | undefined;
    if (
      t != null &&
      typeof t.name === "string" &&
      typeof t.numeral === "string" &&
      Array.isArray(t.keywords) &&
      typeof t.reversed === "boolean"
    ) {
      out.tarot = t;
    }
    return out;
  } catch {
    return {};
  }
};

// ── WMO weather codes → the card's vocabulary ────────────────────────────────

export type WeatherGlyph = "sun" | "partly" | "cloud" | "fog" | "rain" | "snow" | "storm";

const WMO: ReadonlyArray<[codes: number[], cond: string, glyph: WeatherGlyph]> = [
  [[0], "Clear", "sun"],
  [[1], "Mostly clear", "sun"],
  [[2], "Partly cloudy", "partly"],
  [[3], "Overcast", "cloud"],
  [[45, 48], "Fog", "fog"],
  [[51, 53, 55], "Drizzle", "rain"],
  [[56, 57], "Freezing drizzle", "rain"],
  [[61], "Light rain", "rain"],
  [[63], "Rain", "rain"],
  [[65], "Heavy rain", "rain"],
  [[66, 67], "Freezing rain", "rain"],
  [[71], "Light snow", "snow"],
  [[73], "Snow", "snow"],
  [[75], "Heavy snow", "snow"],
  [[77], "Snow grains", "snow"],
  [[80, 81], "Showers", "rain"],
  [[82], "Heavy showers", "rain"],
  [[85, 86], "Snow showers", "snow"],
  [[95], "Thunderstorm", "storm"],
  [[96, 99], "Thunderstorm", "storm"],
];

export const weatherWords = (code: number): { cond: string; glyph: WeatherGlyph } => {
  for (const [codes, cond, glyph] of WMO) if (codes.includes(code)) return { cond, glyph };
  return { cond: "—", glyph: "cloud" };
};

/** Display conversion — the snapshot is Celsius, the face wears the config's unit. */
export const displayTemp = (c: number, unit: "C" | "F"): number =>
  Math.round(unit === "F" ? c * (9 / 5) + 32 : c);

// ── The hourly curve's geometry (the drawn 240×93 box, 12a → 12a) ────────────

/**
 * The plot box — RE-CUT EDGE TO EDGE at the 2026-08-12 re-mint.
 *
 * Was `240×93` with the curve inset 10 units each side, because the plot was a
 * 147px panel beside a 78px glyph and needed its own margins. The recomposition
 * gives the plot the card's whole 345px interior and puts the hour axis under
 * it, so the curve now runs 0→240 and the inset is gone: **the axis and the
 * curve must share one x-space to the pixel**, and an inset the axis does not
 * also carry would put every label a fraction of the day off its tick.
 */
export const WX_BOX = { w: 240, h: 92, x0: 0, x1: 240, yTop: 12, yBot: 84 } as const;

/**
 * THE MINIMUM PLOTTED SPAN, in degrees C — the flat day's fix.
 *
 * Normalised to its own range, a 1.4° fog day draws the identical dramatic
 * swing as a 10° one: the picture says "big day" while the masthead above it
 * says 20 / 19, and the field's height means something different on every card.
 * Padding the range to a floor and centring the data in it makes a flat day
 * draw flat.
 *
 * ⚠ DELIBERATELY NOT A DIAL. It is arithmetic in degrees, and CSS never reads
 * it — a custom property nothing consumes would put the app's only copy of the
 * number somewhere the app cannot see it. 6 is the mint's own worked example
 * (a floored day runs about 23 to 17).
 * ⚠ AND THE PADDED SPAN IS NOT PRINTED ANYWHERE. The masthead reports the DAY's
 * high and low, which is what a person means by them; on a floored day the box
 * runs wider than that. Nothing is wrong, but nothing states the box's own
 * bounds either — that is a y-scale's job, and the y-scale was struck.
 */
export const WX_MIN_SPAN_C = 6;

export interface WxCurve {
  linePath: string;
  areaPath: string;
  /**
   * The observation's height IN THE BOX — 0 at the floor, 1 at the ceiling —
   * or null when there is no observation to place.
   *
   * ⚠ MEASURED ON THE BOX, NOT ON THE DATA, and that is the trap it avoids.
   * Handed to CSS as a temperature, or as a fraction of the day's range, the
   * stylesheet would have to reproduce this function's padding and floor to
   * place the marker — a second copy of the arithmetic, in a language that
   * cannot be tested against it. The copies drift the first time the padding
   * moves and the marker slides off its own curve with nothing to catch it. As
   * a fraction of the box, `top: calc(100% - var(--wx-lvl) * 100%)` IS the
   * definition and there is nothing to keep in sync.
   * ⚠ ONE RESIDUAL, HONESTLY: the path is a Catmull-Rom spline through the
   * hourly samples while this interpolates linearly between them, so between
   * two samples the marker can sit a fraction of a pixel off the drawn curve.
   * It vanishes at the nodes and is under a pixel at hourly density — but if
   * the sampling ever coarsens, the level has to come off the same spline.
   */
  lvl: number | null;
}

const pt = (n: number): string => n.toFixed(1);

/**
 * Catmull-Rom through the hourly points, emitted as cubic Béziers — the same
 * visual grammar as the drawn sample curve. `markT` is hours since local
 * midnight (0–24), or null for no marker.
 */
export const buildWxCurve = (hourlyC: number[], markT: number | null): WxCurve | null => {
  const n = hourlyC.length;
  if (n < 2) return null;
  const { x0, x1, yTop, yBot, h } = WX_BOX;
  let min = Infinity;
  let max = -Infinity;
  for (const v of hourlyC) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  // A flat day still draws a line, and draws FLAT — the range is padded to the
  // minimum span and the data centred in it, so the curve's amplitude is a
  // reading rather than an artefact of normalising to whatever happened.
  if (max - min < WX_MIN_SPAN_C) {
    const pad = (WX_MIN_SPAN_C - (max - min)) / 2;
    min -= pad;
    max += pad;
  }
  const X = (i: number) => x0 + (i / (n - 1)) * (x1 - x0);
  const Y = (v: number) => yBot - ((v - min) / (max - min)) * (yBot - yTop);
  const xs = hourlyC.map((_, i) => X(i));
  const ys = hourlyC.map((v) => Y(v));

  let d = `M ${pt(xs[0])} ${pt(ys[0])}`;
  for (let i = 0; i < n - 1; i++) {
    const p0x = xs[Math.max(0, i - 1)], p0y = ys[Math.max(0, i - 1)];
    const p1x = xs[i], p1y = ys[i];
    const p2x = xs[i + 1], p2y = ys[i + 1];
    const p3x = xs[Math.min(n - 1, i + 2)], p3y = ys[Math.min(n - 1, i + 2)];
    const c1x = p1x + (p2x - p0x) / 6, c1y = p1y + (p2y - p0y) / 6;
    const c2x = p2x - (p3x - p1x) / 6, c2y = p2y - (p3y - p1y) / 6;
    d += ` C ${pt(c1x)} ${pt(c1y)}, ${pt(c2x)} ${pt(c2y)}, ${pt(p2x)} ${pt(p2y)}`;
  }

  const areaPath = `${d} L ${x1} ${h} L ${x0} ${h} Z`;

  let lvl: WxCurve["lvl"] = null;
  if (markT != null && Number.isFinite(markT)) {
    const t = Math.max(0, Math.min(24, markT));
    const s = (t / 24) * (n - 1);
    const i = Math.min(n - 2, Math.floor(s));
    const f = s - i;
    const y = ys[i] + (ys[i + 1] - ys[i]) * f;
    lvl = 1 - y / h;
  }

  return { linePath: d, areaPath, lvl };
};

/**
 * THE LEDE — what is about to happen, this card's live fact.
 *
 * The sun card's move (make the headline live) does not transfer: the
 * temperature was ALREADY live. What this card never said is what is COMING —
 * `↗10 by 15:00` — which is the one weather reading worth acting on, and it
 * needs no data the card was not already holding.
 *
 * ⚠ THE CLAUSE NAMES THE CHANGE, NOT THE DESTINATION, AND THAT IS THE WHOLE
 * READING. Written once as "up to 31 by 15:00" — better English — it printed
 * the same eleven characters at 04:40, 08:10 and 13:20, because the day's high
 * and its hour are facts about the CALENDAR DAY and do not change until the
 * high passes. That silently undid the property the card was rebuilt for, and
 * it reprinted the masthead's own 31 besides. The DELTA is what recomputes
 * hourly: 10, then 6, then 1.
 *
 * The target is the next TURNING POINT after `fromT`, or the end of the window
 * if the curve never turns again.
 * ⚠ WHICH MEANS THE WINDOW BOUNDS THE ANSWER, and that is the open ruling this
 * card ships with (mint § 11): plotting midnight-to-midnight, an evening card
 * names 00:00 where the real overnight low is at 04:00 — off the right edge.
 * A rolling now−6h→now+18h window fixes it and costs the fixed hour axis and
 * the meaning of "today's high". Ruled: ship the current window.
 */
export interface WxLede {
  /** Signed change in DISPLAY degrees, already rounded. */
  delta: number;
  /** Hour of the turning point, 0–24, for formatting as a clock time. */
  atHour: number;
}

export const wxLede = (hourlyC: number[], fromT: number, unit: "C" | "F"): WxLede | null => {
  const n = hourlyC.length;
  if (n < 2) return null;
  const perHour = (n - 1) / 24;
  const from = Math.max(0, Math.min(24, fromT));
  const i0 = Math.min(n - 1, Math.ceil(from * perHour));
  if (i0 >= n - 1) return null; // the window is spent; there is nothing ahead
  // Walk to the next turning point: the first sample where the direction the
  // curve is currently travelling reverses. Ties keep walking, so a flat stretch
  // is not mistaken for a turn.
  const dir = Math.sign(hourlyC[i0 + 1] - hourlyC[i0]);
  let j = i0 + 1;
  if (dir !== 0) {
    while (j < n - 1 && Math.sign(hourlyC[j + 1] - hourlyC[j]) !== -dir) j++;
  } else {
    j = n - 1;
  }
  const nowC = hourlyC[i0];
  const delta = displayTemp(hourlyC[j], unit) - displayTemp(nowC, unit);
  if (delta === 0) return null; // nothing worth saying
  return { delta, atHour: j / perHour };
};
