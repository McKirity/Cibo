/**
 * FIRST-RUN SETUP — canvas A of the frozen `Final/first-run-setup.html`
 * (Build step 15; [[Onboarding & Empty States]] ·
 * [[First-run setup (pre-shell + zero-active Daily)]] own the behavior).
 *
 * A PRE-SHELL full-window screen (the FatalLaunch species, not a route): no
 * rail, a titlebar carrying window controls only, one centered card at
 * `--modal-manage-w`. Default theme only — the boot gate applies the picked
 * theme at the HANDOFF, never before, so this screen always renders on the
 * static Default import (user-ruled 2026-08-06: "just default, since you
 * can't exactly pick a theme").
 *
 * ALL THREE STEPS RENDER STACKED — user-ruled at the GUI pass (2026-08-06:
 * "have EVERYTHING on the screen. Don't hide it in tabs"), overriding the
 * FINAL's "runtime = one at a time" annotation; the drawn EXPANDED exhibit is
 * the runtime face. The stepper pills stay as scroll anchors. THE SKIP
 * AFFORDANCES STAY STRUCK (ruled 2026-07-13): no per-step skip, no skip-all —
 * Finish → Daily is the only way out.
 *
 * ONE AMENDMENT to never-a-gate, user-ruled 2026-08-06 at the step's open:
 * LOCATION IS REQUIRED ("Force them to pick. Simpler that way") — the sky
 * cards need coordinates and the silent London stand-in dies here. Finish
 * stays disabled until both coordinates are valid; every other field may
 * stay empty. THE COORDINATE FIELDS ARE NEVER PREFILLED (the GUI pass's
 * catch: the dev store's migrated config prefilled London, so Finish was
 * live with coordinates the user never picked — prefill defeats the ruling).
 *
 * What Finish writes (every Evolu Result checked): the whimsy config
 * (birthday → `birthdate` + a recurring Birthday countdown — the fixture's
 * lived-in shape; added dates → `events`; coordinates → `lat`/`lon` — all
 * MERGED over any existing config, appended never wiped, so the dev store's
 * one showing is safe) · the chosen seeds `archived → 0` (activation only —
 * unchecking never archives) · the macOS 90% scale default · the
 * `first_run_complete` flag.
 */
import { useEffect, useMemo, useState } from "react";
import { evolu } from "../db/evolu";
import { winAction } from "../shell/safeWindow";
import { HabitIcon, hasIcon } from "../shell/habitIcons";
import { Ico, ICONS } from "../shell/icons";
import { pad2, todayLocal } from "../metrics/clock";
import { monthGridCells, weekDayLetters } from "../metrics/dates";
import { MONTHS_LONG } from "../metrics/format";
import {
  DEFAULT_CONFIG,
  flushWhimsyConfig,
  hasStoredWhimsyConfig,
  loadWhimsyConfig,
  saveWhimsyConfig,
  type DatedEvent,
  type WhimsyConfig,
} from "../daily/whimsyConfig";
import { markFirstRunComplete, maybeApplyMacScaleDefault } from "./firstRun";
import "./firstrun.css";

interface HabitRow {
  id: unknown;
  key: string | null;
  name: string | null;
  kind: string | null;
  sub_type: string | null;
  colour_slot: string | null;
  icon: string | null;
  measures_time: number | null;
  archived: number | null;
  sort_order: number | null;
}

const habitsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("habits")
    .select([
      "id", "key", "name", "kind", "sub_type", "colour_slot", "icon",
      "measures_time", "archived", "sort_order",
    ])
    .where("isDeleted", "is not", 1)
    .orderBy("sort_order"),
);

/** The drawn card sub-label: "creation · project" · "simple · duration" · … */
const kindLabel = (h: HabitRow): string => {
  if (h.kind === "project") return `${h.sub_type ?? ""} · project`;
  if (h.kind === "range") return "range";
  return h.measures_time ? "simple · duration" : "simple";
};

const STEPS = ["Important dates", "Location", "Starting habits"] as const;

/** "YYYY-M-D" (typed) → canonical "YYYY-MM-DD", or null if not a real date. */
const parseDay = (raw: string): string | null => {
  const m = raw.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
};

/**
 * The date chip — typed date primary, calendar popover fallback (the
 * DateTimePicker discipline: focus-within opens, `.shut` is a state not a
 * blur; the popover surface is kit.css's shared `.calpop`, this component
 * only anchors it). Built after the first GUI pass: the native
 * `<input type="date">` stalled ~2s per row in WebView2 while the identical
 * React path measured 6 ms in Chromium — and the app's idiom was never the
 * native control anyway (the FINAL draws `.datefield` as an app chip).
 *
 * FUTURE DATES ARE LEGAL HERE, deliberately: events are countdowns, and the
 * "future = dead route" law governs day DOORS (logging surfaces), not an
 * event's date. Year chevrons join the month pair because a birthday lives
 * decades back — typing stays the fast path.
 */
function FuDateField({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const [typed, setTyped] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null);
  const [shut, setShut] = useState(false);
  const today = todayLocal();
  const anchor = value !== "" ? value : today;
  const view = cursor ?? { y: Number(anchor.slice(0, 4)), m: Number(anchor.slice(5, 7)) - 1 };
  const cells = monthGridCells(view.y, view.m);
  const shown = typed ?? value;

  const stepMonth = (delta: number) => {
    const m = view.m + delta;
    setCursor({ y: view.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 });
  };
  const stepYear = (dy: number) => setCursor({ y: view.y + dy, m: view.m });

  const commit = () => {
    if (typed == null) return;
    if (typed.trim() === "") onChange("");
    else {
      const d = parseDay(typed);
      if (d != null) onChange(d);
    }
    setTyped(null);
  };

  return (
    <span
      className={`fudate${shut ? " shut" : ""}`}
      onMouseDown={(e) => {
        setShut(false);
        // The chip is bigger than the field inside it — clicking the glyph or
        // padding must still focus the input (the DateTimePicker fix).
        if (e.target instanceof HTMLInputElement) return;
        const input = e.currentTarget.querySelector<HTMLInputElement>(".fudate-in");
        if (input == null) return;
        e.preventDefault();
        input.focus();
      }}
    >
      <svg className="fud-ico" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />
      </svg>
      <input
        className="fudate-in"
        placeholder="YYYY-MM-DD"
        maxLength={10}
        value={shown}
        spellCheck={false}
        onFocus={() => setShut(false)}
        onChange={(e) => {
          setTyped(e.target.value);
          setShut(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            setShut(true);
          }
          if (e.key === "Escape") {
            setTyped(null);
            setShut(true);
          }
        }}
      />
      <div className="calpop">
        <div className="caltop">
          <span className="m">
            {MONTHS_LONG[view.m]} {view.y}
          </span>
          <span className="nav">
            <span className="b" title="Previous year" onMouseDown={(e) => (e.preventDefault(), stepYear(-1))}>
              <svg className="fud-ico" viewBox="0 0 24 24"><path d="m11 17-5-5 5-5" /><path d="m18 17-5-5 5-5" /></svg>
            </span>
            <span className="b" title="Previous month" onMouseDown={(e) => (e.preventDefault(), stepMonth(-1))}>
              <svg className="fud-ico" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>
            </span>
            <span className="b" title="Next month" onMouseDown={(e) => (e.preventDefault(), stepMonth(1))}>
              <svg className="fud-ico" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
            </span>
            <span className="b" title="Next year" onMouseDown={(e) => (e.preventDefault(), stepYear(1))}>
              <svg className="fud-ico" viewBox="0 0 24 24"><path d="m13 17 5-5-5-5" /><path d="m6 17 5-5-5-5" /></svg>
            </span>
          </span>
        </div>
        <div className="cgrid">
          {weekDayLetters().map((d, i) => (
            <div className="cdow" key={i}>{d}</div>
          ))}
          {cells.map((c) => {
            const cls = [
              "cd",
              c.out ? "out" : "",
              c.day === today ? "today" : "",
              c.day === value ? "sel" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div
                className={cls}
                key={c.day}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation(); // the wrapper's mousedown would re-open
                  if (c.out) return;
                  onChange(c.day);
                  setTyped(null);
                  setShut(true);
                }}
              >
                {Number(c.day.slice(8))}
              </div>
            );
          })}
        </div>
      </div>
    </span>
  );
}

export function FirstRunSetup({ onDone }: { onDone: () => void }) {
  const [habits, setHabits] = useState<HabitRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [birthday, setBirthday] = useState("");
  const [events, setEvents] = useState<DatedEvent[]>([]);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");

  // Prefill the birthday from a stored config (the dev store's one showing); a
  // truly fresh store has no rows and every field starts empty. Coordinates
  // are DELIBERATELY not prefilled — location is the one required pick, and a
  // prefilled value satisfies the gate with a choice the user never made.
  useEffect(() => {
    if (!hasStoredWhimsyConfig()) return;
    const cfg = loadWhimsyConfig();
    setBirthday(cfg.birthdate ?? "");
  }, []);

  useEffect(() => {
    let live = true;
    evolu.loadQuery(habitsQuery).then(
      (rows) => {
        if (!live) return;
        setHabits(rows as unknown as HabitRow[]);
        const r = rows as unknown as HabitRow[];
        const active = r.filter((h) => !h.archived);
        // The drawn default: the 7 core seeds pre-selected on a fresh store;
        // an already-lived-in store just reflects what is active.
        const pre = active.length > 0 ? active : r.filter((h) => Number(h.sort_order) <= 7);
        setSelected(new Set(pre.map((h) => String(h.id))));
      },
      (e) => console.error("firstRun: habit load failed", e),
    );
    return () => { live = false; };
  }, []);

  const latN = Number(lat);
  const lonN = Number(lon);
  const coordsOk =
    lat.trim() !== "" && lon.trim() !== "" &&
    Number.isFinite(latN) && Math.abs(latN) <= 90 &&
    Number.isFinite(lonN) && Math.abs(lonN) <= 180;

  const core = useMemo(() => (habits ?? []).filter((h) => Number(h.sort_order) <= 7), [habits]);
  const later = useMemo(() => (habits ?? []).filter((h) => Number(h.sort_order) > 7), [habits]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const finish = () => {
    if (!coordsOk) return;
    // The whimsy config — merge, never wipe (an existing store keeps its list).
    const base: WhimsyConfig = hasStoredWhimsyConfig()
      ? loadWhimsyConfig()
      : { ...DEFAULT_CONFIG, label: "", birthdate: null, events: [] };
    const merged: WhimsyConfig = {
      ...base,
      lat: latN,
      lon: lonN,
      birthdate: birthday !== "" ? birthday : base.birthdate,
      events: [...base.events],
    };
    if (
      birthday !== "" &&
      !merged.events.some((e) => e.label.trim().toLowerCase() === "birthday")
    ) {
      merged.events.unshift({ id: "bday", label: "Birthday", date: birthday, recurring: true });
    }
    for (const ev of events) {
      if (ev.label.trim() !== "" && ev.date !== "") merged.events.push(ev);
    }
    saveWhimsyConfig(merged);
    flushWhimsyConfig();

    // Activation — the chosen seeds flip archived → 0. Activation ONLY: an
    // unchecked active habit is left untouched (the ruled scope).
    for (const h of habits ?? []) {
      if (!selected.has(String(h.id)) || !h.archived) continue;
      const res = evolu.update("habits", { id: h.id as never, archived: 0 });
      if (!res.ok) console.error(`firstRun: activating "${h.key}" failed`, res.error);
    }

    maybeApplyMacScaleDefault();
    markFirstRunComplete();
    onDone();
  };

  return (
    <div className="setupscreen">
      {/* pre-shell titlebar: window controls only — no nav cluster, not a route */}
      <div className="tb">
        <div className="drag" data-tauri-drag-region>
          <span className="title">Cibo</span>
        </div>
        <div className="cluster">
          <button className="tb-btn" title="Minimize" onClick={winAction((w) => w.minimize())}>
            <svg className="ico" viewBox="0 0 24 24"><path d="M5 12h14" /></svg>
          </button>
          <button className="tb-btn" title="Maximize" onClick={winAction((w) => w.toggleMaximize())}>
            <svg className="ico" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1.5" /></svg>
          </button>
          <button className="tb-btn close" title="Close (quit)" onClick={winAction((w) => w.close())}>
            <svg className="ico" viewBox="0 0 24 24"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>
      </div>

      <div className="setup-body">
        <div className="setup-card">
          <div>
            <h2 className="welcome">Welcome to Cibo</h2>
            <p className="welcomesub">
              All of this except your location is optional, but it is recommended you
              fill out as much as possible in order to enhance your experience.
            </p>
          </div>

          <div className="setup-stepper">
            {STEPS.map((label, i) => (
              <span key={label} style={{ display: "contents" }}>
                {i > 0 && (
                  <svg className="ico arr" viewBox="0 0 24 24">
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                  </svg>
                )}
                <button
                  className="sstep"
                  onClick={() =>
                    document.getElementById(`fu-step-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                >
                  <span className="num">{i + 1}</span>
                  {label}
                </button>
              </span>
            ))}
          </div>

          <div className="steppanel" id="fu-step-0">
              <div className="stephdr">
                <span className="st"><span className="num">1</span><span className="lbl">Important dates</span></span>
              </div>
              <div className="frow">
                <span className="flabel">Your birthday</span>
                <FuDateField value={birthday} onChange={setBirthday} />
              </div>
              {events.map((ev) => (
                <div className="frow evrow" key={ev.id}>
                  <input
                    className="fu-in"
                    placeholder="What is it? (anniversary, trip, deadline…)"
                    value={ev.label}
                    spellCheck={false}
                    onChange={(e) =>
                      setEvents((xs) => xs.map((x) => (x.id === ev.id ? { ...x, label: e.target.value } : x)))
                    }
                  />
                  <span className="evacts">
                    <FuDateField
                      value={ev.date}
                      onChange={(d) =>
                        setEvents((xs) => xs.map((x) => (x.id === ev.id ? { ...x, date: d } : x)))
                      }
                    />
                    <button
                      className={`fu-chip${ev.recurring ? " on" : ""}`}
                      title={ev.recurring ? "Repeats every year" : "A one-off"}
                      onClick={() =>
                        setEvents((xs) => xs.map((x) => (x.id === ev.id ? { ...x, recurring: !x.recurring } : x)))
                      }
                    >
                      {ev.recurring ? "Yearly" : "One-off"}
                    </button>
                    <button
                      className="fu-x"
                      title="Remove"
                      onClick={() => setEvents((xs) => xs.filter((x) => x.id !== ev.id))}
                    >
                      <Ico d={ICONS.trash} />
                    </button>
                  </span>
                </div>
              ))}
              <button
                className="adddate"
                onClick={() =>
                  setEvents((xs) => [
                    ...xs,
                    { id: `e${Date.now()}`, label: "", date: todayLocal(), recurring: false },
                  ])
                }
              >
                <Ico d={ICONS.plus} />
                Add a date or event
              </button>
              <p className="fnote">
                Dates feed the countdown and anniversary cards; your birthday also hands the
                horoscope its sun sign. All editable later in Settings → Whimsy.
              </p>
          </div>

          <div className="steppanel" id="fu-step-1">
              <div className="stephdr">
                <span className="st"><span className="num">2</span><span className="lbl">Location</span></span>
              </div>
              <div className="coordgrid">
                <div className="coordcell">
                  <span className="coordlbl">Latitude</span>
                  <input
                    className="coordval"
                    inputMode="decimal"
                    placeholder="47.6062"
                    value={lat}
                    spellCheck={false}
                    onChange={(e) => setLat(e.target.value)}
                  />
                </div>
                <div className="coordcell">
                  <span className="coordlbl">Longitude</span>
                  <input
                    className="coordval"
                    inputMode="decimal"
                    placeholder="-122.3321"
                    value={lon}
                    spellCheck={false}
                    onChange={(e) => setLon(e.target.value)}
                  />
                </div>
              </div>
              <p className="fnote">
                Coordinates outright — no lookup, nothing leaves the app. They power the
                sun, weather and tonight&apos;s-sky cards, <b>so this one is needed</b>.
                (Searching your city&apos;s coordinates online works fine.)
              </p>
          </div>

          <div className="steppanel" id="fu-step-2">
              <div className="stephdr">
                <span className="st"><span className="num">3</span><span className="lbl">Pick your starting habits</span></span>
              </div>
              <div className="pickmeta">
                <span className="arch-head">Core habits</span>
                <span className="selcount">
                  {selected.size} of {(habits ?? []).length} selected
                </span>
              </div>
              <div className="hpickgrid">
                {core.map((h) => <HabitPick key={String(h.id)} h={h} on={selected.has(String(h.id))} toggle={toggle} />)}
              </div>
              <div className="pickmeta latertier">
                <span className="arch-head">Also seeded · archived tier</span>
              </div>
              <div className="hpickgrid">
                {later.map((h) => <HabitPick key={String(h.id)} h={h} on={selected.has(String(h.id))} toggle={toggle} />)}
              </div>
          </div>

          <div className="setup-foot">
            {!coordsOk && (
              <span className="fnote footnote">Enter your coordinates (step 2) to finish.</span>
            )}
            <button
              className="btn-accent b-primary"
              aria-disabled={!coordsOk}
              onClick={finish}
            >
              Finish
              <svg className="ico" viewBox="0 0 24 24"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
              Daily
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HabitPick({ h, on, toggle }: { h: HabitRow; on: boolean; toggle: (id: string) => void }) {
  return (
    <button className={`hpick${on ? " on" : ""}`} onClick={() => toggle(String(h.id))}>
      <span className="hsw" style={{ background: `var(--${h.colour_slot ?? "habit-1"})` }}>
        {hasIcon(h.icon) ? <HabitIcon icon={h.icon} /> : (h.name ?? "?").slice(0, 1)}
      </span>
      <span className="hmeta">
        <span className="hn">{h.name}</span>
        <span className="hk">{kindLabel(h)}</span>
      </span>
      <span className="hbox">
        <Ico d={ICONS.check} />
      </span>
    </button>
  );
}
