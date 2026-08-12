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
 * one showing is safe) · the habit selection, written BOTH WAYS · the macOS
 * 90% scale default · the `first_run_complete` flag.
 *
 * THE SELECTION IS THE LIFECYCLE, user-ruled 2026-08-10 (Phase 2 step 4),
 * SUPERSEDING step 15's "activation only — unchecking never archives": ticked
 * habits activate, unticked ACTIVE habits archive. A fresh store is unaffected
 * either way — every seed arrives archived, so there is nothing an untick could
 * reach. The ruling is about the LIVED-IN store, which this screen reaches by
 * Settings → Developer's re-arm door: there the picker pre-fills from what is
 * ACTIVE (see the load effect), so an untick that wrote nothing was a control
 * that presented itself as editable and could only ever add. Found by the user
 * unticking two test habits and finding them still in the rail.
 *
 * Archiving is soft and reversible, so this is NOT the heavy-delete tier — but
 * it ENDS A RUNNING STREAK and a setup screen is a careless place to do that in
 * bulk, so Finish routes through a count-carrying confirm when, and only when,
 * something would actually be archived (user-ruled with the reversal).
 */
import { useEffect, useMemo, useState } from "react";
import { booleanToSqliteBoolean } from "@evolu/common";
import { evolu } from "../db/evolu";
import { winAction } from "../shell/safeWindow";
import { HabitIcon, hasIcon } from "../shell/habitIcons";
import { Ico, ICONS } from "../shell/icons";
import { todayLocal } from "../metrics/clock";
import { DateField } from "../kit/DateField";
import { DangerConfirm } from "../shell/DangerConfirm";
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

export function FirstRunSetup({ onDone }: { onDone: () => void }) {
  const [habits, setHabits] = useState<HabitRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [birthday, setBirthday] = useState("");
  const [events, setEvents] = useState<DatedEvent[]>([]);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);

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

  /**
   * The unticked-but-still-active habits — everything Finish would archive.
   * Empty on a fresh store by construction (nothing is active), which is why
   * the confirm below never appears on the path a real user takes.
   */
  const toArchive = useMemo(
    () => (habits ?? []).filter((h) => !h.archived && !selected.has(String(h.id))),
    [habits, selected],
  );

  const commit = () => {
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

    // The selection IS the lifecycle, both ways (ruled 2026-08-10 — see the
    // header). Anything already in the wanted state is skipped, so a store
    // that needs no change takes no writes.
    for (const h of habits ?? []) {
      const want = selected.has(String(h.id));
      if (want === !h.archived) continue;
      const res = evolu.update("habits", {
        id: h.id as never,
        archived: booleanToSqliteBoolean(!want),
      });
      if (!res.ok) {
        console.error(`firstRun: ${want ? "activating" : "archiving"} "${h.key}" failed`, res.error);
      }
    }

    maybeApplyMacScaleDefault();
    markFirstRunComplete();
    onDone();
  };

  /**
   * Finish's gate: archiving in bulk asks first, activating never does. The
   * confirm is skipped entirely when nothing would be archived, so the fresh
   * store's Finish is unchanged — one click, as drawn.
   */
  const finish = () => {
    if (!coordsOk) return;
    if (toArchive.length > 0) {
      setConfirmArchive(true);
      return;
    }
    commit();
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
                <DateField value={birthday} onChange={setBirthday} />
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
                    <DateField
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
                {/* "archived tier" is only true of a FRESH store. Once the
                    selection writes both ways (2026-08-10) this group is a
                    live two-way toggle, and on a lived-in store it can hold
                    ACTIVE habits — so the tier half is dropped when it would
                    be a lie. */}
                <span className="arch-head">
                  {later.some((h) => !h.archived) ? "Also seeded" : "Also seeded · archived tier"}
                </span>
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

      {confirmArchive && (
        <DangerConfirm
          title="Archive the habits you unticked?"
          body={
            <>
              <strong>{toArchive.length}</strong>
              {toArchive.length === 1 ? " active habit" : " active habits"} will be archived:{" "}
              {toArchive.map((h) => h.name ?? h.key).join(", ")}. Archiving keeps every session
              and entry and can be undone in Settings &rarr; Habits, but it{" "}
              <strong>ends any running streak</strong>.
            </>
          }
          confirmLabel={toArchive.length === 1 ? "Archive 1 habit" : `Archive ${toArchive.length} habits`}
          /* Not the trash — archiving is reversible and the drawn glyph would
             overstate it (see DangerConfirm's `icon` prop). */
          icon={
            <svg className="ico" viewBox="0 0 24 24">
              <rect width="20" height="5" x="2" y="3" rx="1" />
              <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
              <path d="M10 12h4" />
            </svg>
          }
          onConfirm={() => {
            setConfirmArchive(false);
            commit();
          }}
          onCancel={() => setConfirmArchive(false)}
        />
      )}
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
