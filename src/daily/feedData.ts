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
 * The frozen face's plot box: viewBox 240×93, `preserveAspectRatio="none"`
 * (the 2026-07-18 re-freeze), curve inset 10px each side, text as HTML
 * overlays positioned in plot-percent.
 */
export const WX_BOX = { w: 240, h: 93, x0: 10, x1: 230, yTop: 16, yBot: 86 } as const;

export interface WxCurve {
  linePath: string;
  areaPath: string;
  /** Marker position in viewBox coordinates, or null when no marker applies. */
  mark: { x: number; y: number } | null;
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
  // A flat day still draws a line — pad the range so it sits mid-box.
  if (max - min < 1) {
    min -= 0.5;
    max += 0.5;
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

  let mark: WxCurve["mark"] = null;
  if (markT != null && Number.isFinite(markT)) {
    const t = Math.max(0, Math.min(24, markT));
    const s = (t / 24) * (n - 1);
    const i = Math.min(n - 2, Math.floor(s));
    const f = s - i;
    mark = {
      x: xs[i] + (xs[i + 1] - xs[i]) * f,
      y: ys[i] + (ys[i + 1] - ys[i]) * f,
    };
  }

  return { linePath: d, areaPath, mark };
};
