/**
 * SETTINGS → WHIMSY (Build step 10, slice 4) — the real home of what a dev
 * panel has been writing since step 6: location, birthdate, country, the
 * countdown list, and the per-card toggles.
 *
 * Tagged **SYNCED** at the 2026-07-05 close, and it was "the one genuinely
 * untagged item" then: same person, same birthday, same house on both
 * machines, so it is preference rather than a machine fact. **SYNCED FOR REAL
 * since step 15 (2026-08-06)** — whimsyConfig.ts stores app_meta rows (one
 * scalars row + one per event) behind the same load/save API, so nothing here
 * changed but the truth of the tag; writes it makes are debounced there.
 * What changed here at step 10 was the SOURCE (a real surface instead of a
 * dev panel), exactly as that module's own header predicted.
 *
 * Location is COORDINATES outright — no place names, no geocoding
 * ([[Calendar & Whimsy]] § config). The label is kept as a plain nickname for
 * the row, never resolved from the numbers.
 *
 * The SUN SIGN is derived from the birthdate and shown read-only: it is the
 * horoscope card's input and asking for it twice invites disagreement.
 */
import { useState } from "react";
import { Ico, ICONS } from "../shell/icons";
import { todayLocal } from "../metrics/clock";
import { DateField } from "../kit/DateField";
import { sunSign } from "../daily/almanac";
import {
  loadWhimsyConfig,
  saveWhimsyConfig,
  type DatedEvent,
  type WhimsyConfig,
} from "../daily/whimsyConfig";

/* The sun sign comes from `daily/almanac.sunSign` — the same derivation the
   horoscope card and the feed fetch read. This pane carried its own 12-row
   cutoff table with the same answers but no glyphs (2026-08-04): two tables
   that agreed today and had nothing keeping them agreeing. */

const CARDS: { key: string; label: string }[] = [
  { key: "sky", label: "Sky" },
  { key: "almanac", label: "Almanac" },
  { key: "moon", label: "Moon phase" },
  { key: "tarot", label: "Tarot" },
  { key: "horoscope", label: "Horoscope" },
  { key: "otd", label: "On this day" },
  { key: "quote", label: "Quote" },
  { key: "word", label: "Word of the day" },
  // ADDED 2026-08-11, user-ruled ("I want to include the rediscover, countdowns,
  // and lifetime cards in that roster as well"). All three shipped rendering
  // UNCONDITIONALLY on the shelf — the roster had eight entries and the shelf
  // had five cards, three of which no switch could reach. Turning "all the daily
  // cards" off therefore still left three on screen.
  { key: "rediscover", label: "Rediscover" },
  { key: "countdowns", label: "Countdowns" },
  { key: "lifetime", label: "Lifetime" },
];

export function WhimsyPane() {
  const [cfg, setCfg] = useState<WhimsyConfig>(() => loadWhimsyConfig());
  const write = (next: WhimsyConfig) => {
    saveWhimsyConfig(next);
    setCfg(next);
  };
  const sign = sunSign(cfg.birthdate)?.name ?? null;
  const cards = cfg.cards ?? {};
  const setCard = (key: string, on: boolean) => write({ ...cfg, cards: { ...cards, [key]: on } });

  return (
    <div className="hscroll">
      <div className="hgroup" style={{ marginTop: 0 }}>
        <p className="hglbl">You</p>
        <div className="ctrlstack">
          <div className="crow two">
            <span className="clabel">Location</span>
            <span className="cright">
              <NumField
                label="Lat"
                value={cfg.lat}
                min={-90}
                max={90}
                onChange={(v) => write({ ...cfg, lat: v })}
              />
              <NumField
                label="Long"
                value={cfg.lon}
                min={-180}
                max={180}
                onChange={(v) => write({ ...cfg, lon: v })}
              />
            </span>
          </div>
          <div className="crow two">
            <span className="clabel">Nickname</span>
            <span className="cright">
              <input
                className="keyin"
                value={cfg.label}
                spellCheck={false}
                placeholder="e.g. Home"
                onChange={(e) => write({ ...cfg, label: e.target.value })}
              />
            </span>
          </div>
          <div className="crow two">
            <span className="clabel">Birthdate</span>
            <span className="cright">
              <DateField
                value={cfg.birthdate ?? ""}
                onChange={(d) => write({ ...cfg, birthdate: d === "" ? null : d })}
              />
            </span>
          </div>
          <div className="crow two">
            <span className="clabel">Sun sign</span>
            <span className="cright">
              <span className="subchip">{sign != null ? `${sign} · derived` : "set a birthdate"}</span>
            </span>
          </div>
          <div className="crow two">
            <span className="clabel">Temperature</span>
            <span className="cright">
              <div className="segctl">
                <button
                  aria-pressed={cfg.tempUnit === "F"}
                  onClick={() => write({ ...cfg, tempUnit: "F" })}
                >
                  °F
                </button>
                <button
                  aria-pressed={cfg.tempUnit === "C"}
                  onClick={() => write({ ...cfg, tempUnit: "C" })}
                >
                  °C
                </button>
              </div>
            </span>
          </div>
        </div>
      </div>

      <div className="hgroup">
        <p className="hglbl">
          Dates &amp; Countdowns
          <span className="runline">
            {cfg.events.length} date{cfg.events.length === 1 ? "" : "s"}
          </span>
        </p>
        <div className="mlist capped">
          {cfg.events.map((ev) => (
            <div className="mrow" key={ev.id}>
              <span className="mid">
                <input
                  className="subadd-in wide"
                  value={ev.label}
                  spellCheck={false}
                  onChange={(e) =>
                    write({
                      ...cfg,
                      events: cfg.events.map((x) => (x.id === ev.id ? { ...x, label: e.target.value } : x)),
                    })
                  }
                />
              </span>
              <span className="macts">
                <DateField
                  value={ev.date}
                  onChange={(d) =>
                    write({
                      ...cfg,
                      events: cfg.events.map((x) => (x.id === ev.id ? { ...x, date: d } : x)),
                    })
                  }
                />
                <button
                  className={`subchip${ev.recurring ? " on" : ""}`}
                  data-tip={ev.recurring ? "Every year" : "One-off"}
                  onClick={() =>
                    write({
                      ...cfg,
                      events: cfg.events.map((x) =>
                        x.id === ev.id ? { ...x, recurring: !x.recurring } : x,
                      ),
                    })
                  }
                >
                  {ev.recurring ? "Yearly" : "One-off"}
                </button>
                <button
                  className="iconbtn danger"
                  data-tip="Remove"
                  onClick={() => write({ ...cfg, events: cfg.events.filter((x) => x.id !== ev.id) })}
                >
                  <Ico d={ICONS.trash} />
                </button>
              </span>
            </div>
          ))}
        </div>
        <button
          className="medadd"
          style={{ marginTop: "var(--space-5)" }}
          onClick={() => {
            const ev: DatedEvent = {
              id: `e${Date.now()}`,
              label: "",
              date: todayLocal(),
              recurring: false,
            };
            write({ ...cfg, events: [...cfg.events, ev] });
          }}
        >
          <Ico d={ICONS.plus} /> Add a date
        </button>
      </div>

      <div className="hgroup">
        <p className="hglbl">Cards</p>
        <div className="ctrlstack">
          {CARDS.map((c) => {
            const on = cards[c.key] !== false;
            return (
              <div className="crow two" key={c.key}>
                <span className="clabel">{c.label}</span>
                <span className="cright">
                  <div className="segctl">
                    <button aria-pressed={on} onClick={() => setCard(c.key, true)}>
                      On
                    </button>
                    <button aria-pressed={!on} onClick={() => setCard(c.key, false)}>
                      Off
                    </button>
                  </div>
                </span>
              </div>
            );
          })}
        </div>
        <p className="vnote foot">
          A card turned off is left out of the day's whimsy strip. Cards already snapshotted
          into a finalized day stay as they were — the day's record does not change.
        </p>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  return (
    <span className="numfield">
      <span className="nflbl">{label}</span>
      <input
        className="keyin num"
        value={text}
        spellCheck={false}
        inputMode="decimal"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          // A blank must revert, never write: `Number("")` is 0 — finite and
          // inside BOTH fields' ranges — so a cleared Lat silently became the
          // equator (`whimsy-1`, the `creator-2` shape). An unparseable or
          // out-of-range edit reverts for the same reason: never write a value
          // the user did not type.
          const n = text.trim() === "" ? NaN : Number(text);
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
          else setText(String(value));
        }}
      />
    </span>
  );
}
