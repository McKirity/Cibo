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
 * Three cards are network-fed (horoscope · tarot · weather) and render a
 * waiting state until the fetch layer lands.
 */
import type { ReactNode } from "react";
import {
  atLocation,
  moonDiscPaths,
  moonInfo,
  seasonBand,
  seasonInfo,
  sunArcPoint,
  sunInfo,
  tonightsSky,
  type MoonInfo,
  type SunInfo,
} from "./sky";
import {
  countdowns,
  dayOfYear,
  factFor,
  holidayFor,
  lifetime,
  onThisDay,
  quoteFor,
  rediscover,
  timeProgress,
  wordFor,
} from "./almanac";
import type { WhimsyConfig } from "./whimsyConfig";

const hm = (min: number): string => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`;

export function Card({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`wcard ${className}`}>
      <h3 className="wtitle">{title}</h3>
      <div className="wbody">{children}</div>
    </section>
  );
}

/** The waiting state for the three ephemeral cards, until the fetch lands. */
function Pending({ what }: { what: string }) {
  return <p className="wpending">{what} arrives with the network tier.</p>;
}

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

export function SunCard({ sun, lon, now }: { sun: SunInfo; lon: number; now: Date }) {
  // Evaluated ON the drawn Bézier, parameterised by daylight elapsed at THIS
  // location — so moving the coordinates actually moves the disc.
  const p = sunArcPoint(sun, now);
  const len =
    sun.state === "midnight-sun" ? "24h 00m" : sun.state === "polar-night" ? "0h 00m" : hm(sun.dayLengthMin);
  return (
    <div className="card whimsy sun-card" style={{ flex: "2.2 0 229px" }}>
      <Ovl label="Sun" d={I_SUN} />
      <div className="sun-len">
        <span className="whead">{len}</span>
        <span className="delta">
          {sun.deltaMin === 0
            ? "same as yesterday"
            : (sun.deltaMin > 0 ? "\u25B2 " : "\u25BC ") + hm(Math.abs(sun.deltaMin)) + " vs yesterday"}
        </span>
      </div>
      <div className="field sun-field">
        <svg className="arc" viewBox="0 0 400 168" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" y1="150" x2="400" y2="150" stroke="color-mix(in oklch, var(--whimsy-dusk), var(--whimsy-day) 46%)" strokeWidth="1.5" />
          <path d="M6 150 Q200 -90 394 150" fill="none" stroke="var(--whimsy-sun)" strokeWidth="2" strokeDasharray="3 7" strokeLinecap="round" />
        </svg>
        {p.visible && <div className="sun-disc" style={{ left: p.xPct + "%", top: p.yPct + "%" }} />}
        {sun.state === "normal" ? (
          <>
            <span className="sun-end rise">
              rise<b className="kv">{sun.sunrise ? atLocation(sun.sunrise, lon) : "\u2014"}</b>
            </span>
            <span className="sun-end set">
              set<b className="kv">{sun.sunset ? atLocation(sun.sunset, lon) : "\u2014"}</b>
            </span>
          </>
        ) : (
          <span className="sun-end rise">{sun.state === "midnight-sun" ? "does not set" : "does not rise"}</span>
        )}
      </div>
    </div>
  );
}

export function WeatherCard() {
  return (
    <div className="card whimsy" style={{ flex: "1.2 0 125px" }}>
      <Ovl label="Weather" d={I_WX} />
      <div className="art wx">
        <div className="wx-nowblock">
          <span className="whead">{"\u2014"}</span>
          <div className="cond">Arrives with the network tier</div>
        </div>
      </div>
    </div>
  );
}

export function SeasonCard({ dayKey, lat }: { dayKey: string; lat: number }) {
  const s = seasonInfo(dayKey, lat);
  const band = seasonBand(dayKey, lat);
  return (
    <div className="card whimsy season-card" style={{ flex: "1.15 0 120px" }}>
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
                    : "color-mix(in oklch, var(" + seg.monthVar + "), var(--panel-background) 45%)",
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
    <div className="card whimsy moon-card" style={{ flex: "1.9 0 198px" }}>
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

export function TonightSkyCard({ dayKey, lat }: { dayKey: string; lat: number }) {
  const list = tonightsSky(dayKey, lat);
  return (
    <div className="card whimsy tonight-card" style={{ flex: "1.35 0 140px" }}>
      <Ovl label="Tonight's sky" d={I_STAR} />
      <div className="field night-field">
        <svg className="stars" viewBox="0 0 480 230" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g transform="translate(240 115) scale(0.62) translate(-200 -100)">
            <g stroke="var(--whimsy-star)" strokeWidth="1.2" opacity="0.65">
              <line x1="46" y1="52" x2="300" y2="60" />
              <line x1="300" y1="60" x2="182" y2="158" />
              <line x1="182" y1="158" x2="46" y2="52" />
            </g>
            <g fill="var(--whimsy-star)">
              <circle cx="46" cy="52" r="3.4" />
              <circle cx="300" cy="60" r="3" />
              <circle cx="182" cy="158" r="3.2" />
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
          <span className="feat">Featured · {list[0]}</span>
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
        <span className="qmark" aria-hidden="true">
          {"\u201C"}
        </span>
        <p className="quote">{q.text}</p>
        <p className="by">{"\u2014 " + q.who}</p>
      </div>
    </div>
  );
}

export function WordCard({ dayKey }: { dayKey: string }) {
  const w = wordFor(dayKey);
  return (
    <div className="card whimsy word" style={ALMANAC_FLEX}>
      <Ovl label="Word of the day" d={I_WORD} />
      <div className="art" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div className="w">{w.word}</div>
        <div className="rule" aria-hidden="true" />
        <div className="pr">
          <span className="pos">{w.kind}</span>
        </div>
        <div className="def">{w.meaning}</div>
      </div>
    </div>
  );
}

export function FactCard({ dayKey }: { dayKey: string }) {
  return (
    <div className="card whimsy" style={ALMANAC_FLEX}>
      <Ovl label="Fun fact" d={I_FACT} />
      <div
        className="art"
        style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", gap: "var(--space-4)" }}
      >
        <p className="fact" style={{ margin: 0 }}>
          {factFor(dayKey)}
        </p>
      </div>
    </div>
  );
}

const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function OnThisDayCard({ dayKey }: { dayKey: string }) {
  const h = onThisDay(dayKey);
  const dd = Number(dayKey.slice(8, 10));
  const mon = MON_SHORT[Number(dayKey.slice(5, 7)) - 1];
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
        <span className="meta">{dd + " " + mon}</span>
      </div>
      <div className="art" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <ol className="tl">
          {h ? (
            <li className="tl-ev">
              <span className="tl-yr kv">{h.year}</span>
              <span className="tl-tx">{h.what}</span>
            </li>
          ) : (
            <li className="tl-ev">
              <span className="tl-tx">Nothing recorded for this date.</span>
            </li>
          )}
        </ol>
      </div>
    </div>
  );
}

/** Absent on most days by design — the caller decides whether to render it. */
export function HolidayCard({ dayKey }: { dayKey: string }) {
  const h = holidayFor(dayKey);
  if (!h) return null;
  const dd = Number(dayKey.slice(8, 10));
  const mon = MON_SHORT[Number(dayKey.slice(5, 7)) - 1];
  return (
    <div className="card whimsy holiday" style={ALMANAC_FLEX}>
      <Ovl label="Holiday" d={I_HOL} />
      <div className="art" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div className="hol">
          <div className="hol-date">
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

/** One progress ring. r=28.5 so the circumference is 179.07 — the FINAL's number. */
const RING_C = 179.07;
function Ring({ pct, stroke, label }: { pct: number; stroke: string; label: string }) {
  const on = Math.max(0, Math.min(1, pct)) * RING_C;
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
        />
        <text
          x="32"
          y="32"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="var(--font-mono)"
          fontSize="15"
          fontWeight="700"
          fill="var(--text-strong)"
        >
          {Math.round(pct * 100) + "%"}
        </text>
      </svg>
      <span className="tp-lbl">{label}</span>
    </div>
  );
}

const MON_VAR = ["--month-jan", "--month-feb", "--month-mar", "--month-apr", "--month-may", "--month-jun", "--month-jul", "--month-aug", "--month-sep", "--month-oct", "--month-nov", "--month-dec"];

export function TimeProgressCard({ dayKey, now }: { dayKey: string; now: Date }) {
  const t = timeProgress(dayKey, now);
  const mi = Number(dayKey.slice(5, 7)) - 1;
  const monthVar = "var(" + MON_VAR[mi] + ")";
  // Quarter takes the quarter's MIDDLE month, week a shaded month — the derived
  // period colours the registry calls for; the year is the theme accent.
  const qMid = "var(" + MON_VAR[Math.floor(mi / 3) * 3 + 1] + ")";
  const weekVar = "color-mix(in oklch, " + monthVar + ", var(--window-background) var(--week-shade-mix))";
  const doy = dayOfYear(dayKey);
  const d = new Date(dayKey + "T12:00:00");
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.floor((doy + ((jan1.getDay() + 6) % 7) - 1) / 7) + 1;
  const daysInYear = (new Date(d.getFullYear() + 1, 0, 1).getTime() - jan1.getTime()) / 86400000;
  const qPct = (() => {
    const qStart = new Date(d.getFullYear(), Math.floor(mi / 3) * 3, 1);
    const qEnd = new Date(d.getFullYear(), Math.floor(mi / 3) * 3 + 3, 1);
    return (d.getTime() - qStart.getTime()) / (qEnd.getTime() - qStart.getTime());
  })();
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
          <Ring pct={t.dayPct} stroke={monthVar} label="Day" />
          <Ring pct={t.weekPct} stroke={weekVar} label="Week" />
          <Ring pct={t.monthPct} stroke={monthVar} label="Month" />
          <Ring pct={qPct} stroke={qMid} label="Quarter" />
          <Ring pct={t.yearPct} stroke="var(--accent)" label="Year" />
        </div>
        <div className="tp-note">
          {"Day " + doy + " of " + daysInYear + " \u00b7 week " + week + " \u00b7 Q" + (Math.floor(mi / 3) + 1)}
        </div>
      </div>
    </div>
  );
}

// ── the mystical shelf ────────────────────────────────────────────────────────

export function HoroscopeCard() {
  return (
    <Card title="Horoscope" className="w-horoscope">
      <Pending what="The daily horoscope" />
    </Card>
  );
}

export function TarotCard() {
  return (
    <Card title="Tarot" className="w-tarot">
      <Pending what="The daily draw" />
    </Card>
  );
}

export function RediscoverCard({ dayKey, pastDays }: { dayKey: string; pastDays: string[] }) {
  const day = rediscover(pastDays, dayKey);
  return (
    <Card title="Rediscover" className="w-rediscover">
      {day ? (
        <>
          <p className="wbig sm">{day}</p>
          {/* A door to that day's cover wall — inert until the wall exists. */}
          <p className="wnote">Revisit this day</p>
        </>
      ) : (
        <p className="wnote">Nothing logged yet to revisit.</p>
      )}
    </Card>
  );
}

export function CountdownsCard({ config, dayKey }: { config: WhimsyConfig; dayKey: string }) {
  const list = countdowns(config.events, dayKey).slice(0, 4);
  return (
    <Card title="Countdowns" className="w-countdown">
      {list.length === 0 && <p className="wnote">No dates set.</p>}
      {list.map((c) => (
        <div className="wrow" key={`${c.label}-${c.date}`}>
          <span>{c.label}</span>
          <strong>
            {c.days === 0 ? "today" : c.days > 0 ? `${c.days}d` : `${Math.abs(c.days)}d ago`}
            {/* Both directions, user-ruled: the countdown AND how long since the
                last time round. Suppressed when they would say the same thing —
                on the day itself, and for a one-shot that has already passed. */}
            {c.sinceDays != null && c.days > 0 && (
              <span className="wsince"> · {c.sinceDays}d since</span>
            )}
          </strong>
        </div>
      ))}
    </Card>
  );
}

export function LifetimeCard({ config, dayKey }: { config: WhimsyConfig; dayKey: string }) {
  const lt = lifetime(config.birthdate, dayKey);
  return (
    <Card title="Lifetime" className="w-lifetime">
      {lt ? (
        <>
          <p className="wbig">{lt.days.toLocaleString()}</p>
          <p className="wnote">days · {lt.years} years</p>
          <div className="wmeter">
            <span style={{ width: `${Math.round(lt.yearProgress * 100)}%` }} />
          </div>
          <p className="wnote">
            {lt.nextBirthdayDays === 0 ? "Today!" : `${lt.nextBirthdayDays} days to the next`}
          </p>
        </>
      ) : (
        <p className="wnote">No birthdate set.</p>
      )}
    </Card>
  );
}

/** Convenience for the chassis: the sky column's computed inputs. */
export const skyInputs = (dayKey: string, config: WhimsyConfig, now: Date) => ({
  sun: sunInfo(dayKey, config.lat, config.lon, now),
  moon: moonInfo(dayKey, config.lat, config.lon),
});
