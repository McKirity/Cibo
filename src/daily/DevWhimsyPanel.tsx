/**
 * Dev-only whimsy config panel — sits BELOW the Daily chassis, outside it.
 *
 * User-ruled 2026-07-25: a place to type coordinates and dated events and watch
 * the cards react, plus a randomiser for stress testing. It stands in for
 * first-run setup's steps 1–2 exactly as the dev activation panel stands in for
 * its step 3 — so this panel is throwaway, and when step 15/10 land they replace
 * the INPUT, not the config shape the cards read.
 *
 * DEV-guarded by its caller, like the seed panels, so it never reaches a
 * production bundle.
 */
import { useState } from "react";
import {
  DEFAULT_CONFIG,
  PLACE_PRESETS,
  randomWhimsyConfig,
  type DatedEvent,
  type WhimsyConfig,
} from "./whimsyConfig";
import { devClearTodayFeeds, ensureTodayFeeds } from "./feeds";

export function DevWhimsyPanel({
  config,
  onChange,
}: {
  config: WhimsyConfig;
  onChange: (next: WhimsyConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  // Coordinates are held as text while typing: a controlled number input cannot
  // hold "-" or "51." mid-keystroke without fighting the user.
  const [latText, setLatText] = useState(String(config.lat));
  const [lonText, setLonText] = useState(String(config.lon));

  const sync = (next: WhimsyConfig) => {
    setLatText(String(next.lat));
    setLonText(String(next.lon));
    onChange(next);
  };

  const commitCoords = () => {
    const lat = Number(latText);
    const lon = Number(lonText);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    onChange({
      ...config,
      lat: Math.max(-90, Math.min(90, lat)),
      lon: Math.max(-180, Math.min(180, lon)),
      label: "custom",
    });
  };

  const setEvent = (id: string, patch: Partial<DatedEvent>) =>
    onChange({ ...config, events: config.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) });

  /**
   * Each added event gets a distinct label and a staggered date. Adding several
   * identical "New event / today" rows is degenerate test data — it produced
   * seven rows that all counted down to today, which told us nothing about the
   * layout, and their identical ids/labels are what surfaced the duplicate-key
   * bug in the first place.
   */
  const addEvent = () => {
    const n = config.events.length + 1;
    const date = new Date(Date.now() + n * 11 * 86_400_000).toISOString().slice(0, 10);
    onChange({
      ...config,
      events: [
        ...config.events,
        { id: `e${Date.now()}-${n}`, label: `Event ${n}`, date, recurring: false },
      ],
    });
  };

  return (
    <div className="devwhimsy">
      <button className="dw-head" onClick={() => setOpen((o) => !o)}>
        <span className="dw-chev">{open ? "▾" : "▸"}</span>
        <strong>Whimsy inputs</strong>
        <span className="dw-sub">
          {config.lat.toFixed(2)}, {config.lon.toFixed(2)} · {config.label} · {config.events.length} event
          {config.events.length === 1 ? "" : "s"}
        </span>
        <span className="dw-tag">dev only</span>
      </button>

      {open && (
        <div className="dw-body">
          <div className="dw-row">
            <label className="dw-field">
              <span>Latitude</span>
              <input
                className="inp"
                value={latText}
                onChange={(e) => setLatText(e.target.value)}
                onBlur={commitCoords}
                onKeyDown={(e) => e.key === "Enter" && commitCoords()}
                placeholder="-90 … 90"
              />
            </label>
            <label className="dw-field">
              <span>Longitude</span>
              <input
                className="inp"
                value={lonText}
                onChange={(e) => setLonText(e.target.value)}
                onBlur={commitCoords}
                onKeyDown={(e) => e.key === "Enter" && commitCoords()}
                placeholder="-180 … 180"
              />
            </label>
            <label className="dw-field">
              <span>Birthdate</span>
              <input
                className="inp"
                type="date"
                value={config.birthdate ?? ""}
                onChange={(e) => onChange({ ...config, birthdate: e.target.value || null })}
              />
            </label>
            <label className="dw-field">
              <span>Temp unit</span>
              <button
                className="btn"
                onClick={() => onChange({ ...config, tempUnit: config.tempUnit === "F" ? "C" : "F" })}
              >
                °{config.tempUnit} — switch to °{config.tempUnit === "F" ? "C" : "F"}
              </button>
            </label>
          </div>

          <div className="dw-row dw-actions">
            <button className="btn primary" onClick={() => sync(randomWhimsyConfig())}>
              🎲 Randomize
            </button>
            <button className="btn" onClick={() => sync(DEFAULT_CONFIG)}>
              Reset
            </button>
            <button
              className="btn"
              title="Wipe today's feed_snapshot and re-capture (weather · horoscope · tarot)"
              onClick={() => {
                void devClearTodayFeeds().then(() => ensureTodayFeeds(config));
              }}
            >
              ↻ Re-capture feeds
            </button>
            <span className="dw-note">
              Randomize is weighted toward the cases that break things — polar latitudes, the
              equator, the date line, leap day and the solstices.
            </span>
          </div>

          <div className="dw-presets">
            {PLACE_PRESETS.map((p) => (
              <button
                key={p.label}
                className="dw-preset"
                title={p.why}
                onClick={() => sync({ ...config, lat: p.lat, lon: p.lon, label: `${p.label} — ${p.why}` })}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="dw-events">
            <div className="dw-evhead">
              <strong>Dates &amp; events</strong>
              <button className="btn small" onClick={addEvent}>
                + Add
              </button>
            </div>
            {config.events.length === 0 && <p className="dw-empty">No events — countdowns will be empty.</p>}
            {config.events.map((e) => (
              <div className="dw-ev" key={e.id}>
                <input
                  className="inp"
                  value={e.label}
                  onChange={(ev) => setEvent(e.id, { label: ev.target.value })}
                />
                <input
                  className="inp"
                  type="date"
                  value={e.date}
                  onChange={(ev) => setEvent(e.id, { date: ev.target.value })}
                />
                <label className="dw-rec">
                  <input
                    type="checkbox"
                    checked={e.recurring}
                    onChange={(ev) => setEvent(e.id, { recurring: ev.target.checked })}
                  />
                  <span>yearly</span>
                </label>
                <button
                  className="btn small danger"
                  onClick={() => onChange({ ...config, events: config.events.filter((x) => x.id !== e.id) })}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
