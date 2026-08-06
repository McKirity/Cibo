/**
 * SETTINGS → WHIMSY (Build step 10, slice 4) — the real home of what a dev
 * panel has been writing since step 6: location, birthdate, country, the
 * countdown list, and the per-card toggles.
 *
 * Tagged **SYNCED** at the 2026-07-05 close, and it was "the one genuinely
 * untagged item" then: same person, same birthday, same house on both
 * machines, so it is preference rather than a machine fact. The STORE rides
 * the per-device settings file since 2026-08-04 (deviceStore — the localStorage
 * era's mechanical successor); the move to SYNCED storage it is tagged for is
 * PARKED ON STEP 15 (recorded at the completeness audit), which owns filling
 * this config at first-run anyway. What changed here at step 10 was the
 * SOURCE (a real surface instead of a dev panel), exactly as that module's own
 * header predicted: "when those land they replace the SOURCE and nothing else".
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
              <input
                className="keyin"
                type="date"
                value={cfg.birthdate ?? ""}
                onChange={(e) => write({ ...cfg, birthdate: e.target.value === "" ? null : e.target.value })}
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
          Dates &amp; countdowns
          <span className="runline">
            {cfg.events.length} date{cfg.events.length === 1 ? "" : "s"}
          </span>
        </p>
        <div className="mlist">
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
                <input
                  className="keyin"
                  type="date"
                  value={ev.date}
                  onChange={(e) =>
                    write({
                      ...cfg,
                      events: cfg.events.map((x) => (x.id === ev.id ? { ...x, date: e.target.value } : x)),
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
          const n = Number(text);
          // An unparseable or out-of-range edit reverts rather than writing a
          // NaN the sky maths would render as garbage.
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
          else setText(String(value));
        }}
      />
    </span>
  );
}
