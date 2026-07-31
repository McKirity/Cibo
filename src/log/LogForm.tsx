/**
 * Build step 3 — the Core Logging Loop. The daily entry form: the ONLY
 * logging path (quick-log dropped), form-first / manual-primary.
 *
 * One session per save: habit_fk · owning day · exactly one measure (or
 * measureless) · source = "manual". entry_fk required for project habits,
 * satisfiable by the inline quick-create (title-only stub, status "Current"
 * when the habit's bundle carries status — Entry Creator (Manual Entry)).
 *
 * Rules enforced here are validate.ts calls — the form never re-invents a
 * check. Back-dating is first-class: the date field is editable and always
 * wins; until the cutoff Setting exists (step 10), logical today = calendar
 * today (midnight default).
 *
 * Deliberately bare — chrome, rail, and theming are step 6's problem.
 * Styling = claimed kit rules (kit.css) + scaffold glue (App.css).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { DateOnly, type EntryId, type HabitId, type MeasureKind } from "../db/schema";
import { insertSession, quickCreateEntry } from "../daily/spineWrites";
import type { SpineHabit } from "../daily/spineSpec";
import { syncDerivedKeyboardForDay, WRITING_KEY } from "../db/derivedKeyboard";
import { todayLocal } from "../metrics/clock";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

// Near-twin of metrics/format.hoursMinutes, deliberately NOT adopted: this
// dev-era face writes "1h 3m" where the shared one zero-pads ("1h 03m").
const fmtMinutes = (m: number): string =>
  m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`;

const activeHabitsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("habits")
    .selectAll()
    .where("isDeleted", "is not", 1)
    .where("archived", "=", 0)
    .orderBy("sort_order"),
);

/** The habit's default measure for the form (its only one, or time when both). */
const defaultMeasure = (h: {
  kind: string | null;
  measures_time: number | null;
  measures_count: number | null;
}): MeasureKind =>
  h.kind === "range" ? "range" : h.measures_time ? "time" : h.measures_count ? "count" : "none";

/**
 * Adapt a habits row to the spine's habit shape — since the 2026-07-30 fold
 * the write assembly (validate + brand + insert) lives ONLY in
 * daily/spineWrites; this form keeps its own UI and one-measure-per-save
 * behavior and just borrows the writes. `derived_rules` is not read by any
 * write path, so the empty list is safe.
 */
const toSpineHabit = (h: {
  id: string;
  key: unknown;
  name: unknown;
  kind: unknown;
  sub_type: unknown;
  colour_slot: unknown;
  icon: unknown;
  measures_time: unknown;
  measures_count: unknown;
  count_unit: unknown;
  range_max_midnights: unknown;
  entry_attributes: unknown;
  sort_order: unknown;
}): SpineHabit => ({
  id: h.id,
  key: (h.key as string | null) ?? null,
  name: (h.name as string | null) ?? "—",
  kind: h.kind as SpineHabit["kind"],
  sub_type: h.sub_type as SpineHabit["sub_type"],
  colour_slot: (h.colour_slot as string | null) ?? "habit-1",
  icon: (h.icon as string | null) ?? null,
  measures_time: h.measures_time === 1,
  measures_count: h.measures_count === 1,
  count_unit: (h.count_unit as string | null) ?? null,
  range_max_midnights: (h.range_max_midnights as number | null) ?? null,
  entry_attributes: (h.entry_attributes as string | null) ?? null,
  derived_rules: [],
  sort_order: (h.sort_order as number | null) ?? null,
});

export function LogForm() {
  const habits = useQuery(activeHabitsQuery);

  const [habitId, setHabitId] = useState<string>("");
  const [day, setDay] = useState<string>(todayLocal());
  const [measurePick, setMeasurePick] = useState<MeasureKind | null>(null);
  const [minutes, setMinutes] = useState<string>("");
  const [countValue, setCountValue] = useState<string>("");
  const [rangeStart, setRangeStart] = useState<string>("");
  const [rangeEnd, setRangeEnd] = useState<string>("");
  const [entrySearch, setEntrySearch] = useState<string>("");
  const [entryId, setEntryId] = useState<EntryId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const habit = habits.find((h) => h.id === habitId) ?? null;

  // Effective measure: the picked one when the habit declares it, else the default.
  const measureKind: MeasureKind | null = habit
    ? measurePick != null &&
      ((measurePick === "time" && habit.measures_time) ||
        (measurePick === "count" && habit.measures_count))
      ? measurePick
      : defaultMeasure(habit)
    : null;

  // Entries of the selected habit, for the picker (project habits only).
  const entriesQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("entries")
          .select(["id", "title", "status"])
          .where("isDeleted", "is not", 1)
          .where("habit_fk", "=", (habitId || "-") as HabitId)
          .orderBy("title"),
      ),
    [habitId],
  );
  const entries = useQuery(entriesQuery);

  const search = entrySearch.trim().toLowerCase();
  const matches = search
    ? entries.filter((e) => (e.title ?? "").toLowerCase().includes(search))
    : entries;
  const exactMatch = entries.some(
    (e) => (e.title ?? "").trim().toLowerCase() === search,
  );
  const selectedEntry = entries.find((e) => e.id === entryId) ?? null;

  const pickHabit = (id: string) => {
    setHabitId(id);
    setMeasurePick(null);
    setEntryId(null);
    setEntrySearch("");
    setError(null);
    setFlash(null);
  };

  /** Inline quick-create — the spine's shared write (title-only stub; status
   * "Current" iff the habit's bundle has status). */
  const quickCreate = () => {
    if (!habit) return;
    if (entrySearch.trim().length === 0) return; // silent, as before the fold
    const res = quickCreateEntry(
      toSpineHabit(habit),
      (habit.entry_attributes as string | null) ?? null,
      entrySearch,
    );
    if (res.ok) {
      setEntryId(res.id);
      setError(null);
    } else {
      setError(res.reason);
    }
  };

  const save = () => {
    setFlash(null);
    if (!habit || habit.kind == null || measureKind == null) {
      setError("Pick a habit first.");
      return;
    }

    // Range sessions: the owning day is the END date (keystone).
    const owningDay =
      measureKind === "range" && DATETIME_RE.test(rangeEnd)
        ? rangeEnd.slice(0, 10)
        : day;
    if (!DATE_RE.test(owningDay)) {
      setError("Pick a date.");
      return;
    }

    const value =
      measureKind === "time"
        ? Number(minutes)
        : measureKind === "count"
          ? Number(countValue)
          : null;
    if ((measureKind === "time" || measureKind === "count") && (value == null || !Number.isFinite(value) || (measureKind === "time" ? minutes : countValue).trim() === "")) {
      setError(measureKind === "time" ? "Enter the minutes." : `Enter the ${habit.count_unit ?? "count"}.`);
      return;
    }
    const start = measureKind === "range" ? rangeStart : null;
    const end = measureKind === "range" ? rangeEnd : null;
    if (measureKind === "range" && (!DATETIME_RE.test(start ?? "") || !DATETIME_RE.test(end ?? ""))) {
      setError("A range needs both start and end.");
      return;
    }

    // The spine's shared write assembly (validate.ts checks + brands + insert)
    // — folded onto daily/spineWrites.insertSession 2026-07-30; behavior
    // unchanged: one session, exactly one measure, source "manual".
    const res = insertSession({
      habit: toSpineHabit(habit),
      day: owningDay,
      entryId,
      measure: measureKind,
      value,
      start,
      end,
      source: "manual",
    });
    if (!res.ok) {
      setError(res.reason);
      return;
    }

    // Auto-follow: logging Writing's words re-syncs that day's derived Keyboard
    // words (derivedKeyboard.ts). Deferred a tick — Evolu batches mutations in a
    // microtask, so a query fired synchronously here reads Writing's total
    // BEFORE this insert reaches the worker (the Spine's stale-read lesson).
    if (habit.key === WRITING_KEY && measureKind === "count") {
      setTimeout(() => void syncDerivedKeyboardForDay(evolu, owningDay), 0);
    }

    setError(null);
    setFlash(
      `Logged ${habit.name}${selectedEntry ? ` — ${selectedEntry.title}` : ""} ✓`,
    );
    setMinutes("");
    setCountValue("");
    setRangeStart("");
    setRangeEnd("");
    // Habit, day, and entry stay — a second bout follows in one step.
  };

  return (
    <div className="card">
      <div>
        <div className="kicker">Log a session</div>
        {habits.length === 0 && (
          <p className="fieldnote">
            No active habits — activate one in the dev panel below (temporary;
            first-run setup owns activation later).
          </p>
        )}
      </div>

      <div className="fld">
        <div className="lbl">
          <span className="l">Habit</span>
        </div>
        <div className="row">
          {habits.map((h) => (
            <button
              key={h.id}
              type="button"
              className={h.id === habitId ? "btn-accent btn-sm" : "btn-plain btn-sm"}
              onClick={() => pickHabit(h.id)}
            >
              {h.name}
            </button>
          ))}
        </div>
      </div>

      <div className="fld">
        <div className="lbl">
          <span className="l">Day</span>
          <span className="opt">editable — the form always wins</span>
        </div>
        <div className="row">
          <input
            type="date"
            className="inp"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            disabled={measureKind === "range"}
          />
          {measureKind === "range" && (
            <span className="fieldnote">a range session's owning day = its end date</span>
          )}
        </div>
      </div>

      {habit && !!habit.measures_time && !!habit.measures_count && (
        <div className="fld">
          <div className="lbl">
            <span className="l">Measure</span>
            <span className="opt">exactly one per session</span>
          </div>
          <div className="segctl">
            <button
              type="button"
              aria-pressed={measureKind === "time"}
              onClick={() => setMeasurePick("time")}
            >
              time
            </button>
            <button
              type="button"
              aria-pressed={measureKind === "count"}
              onClick={() => setMeasurePick("count")}
            >
              {habit.count_unit ?? "count"}
            </button>
          </div>
        </div>
      )}

      {habit && measureKind === "time" && (
        <div className="fld">
          <div className="lbl">
            <span className="l">Duration</span>
          </div>
          <div className="row">
            <input
              type="number"
              className="inp num"
              min={0}
              step={1}
              placeholder="minutes"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
            <span className="fieldnote">minutes</span>
          </div>
        </div>
      )}

      {habit && measureKind === "count" && (
        <div className="fld">
          <div className="lbl">
            <span className="l">{habit.count_unit ?? "Count"}</span>
          </div>
          <div className="row">
            <input
              type="number"
              className="inp num"
              min={0}
              step={1}
              placeholder="0"
              value={countValue}
              onChange={(e) => setCountValue(e.target.value)}
            />
            <span className="fieldnote">{habit.count_unit ?? ""} — multiples per day sum</span>
          </div>
        </div>
      )}

      {habit && measureKind === "range" && (
        <div className="fld">
          <div className="lbl">
            <span className="l">Range</span>
          </div>
          <div className="row">
            <input
              type="datetime-local"
              className="inp"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
            />
            <span className="fieldnote">→</span>
            <input
              type="datetime-local"
              className="inp"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
            />
          </div>
        </div>
      )}

      {habit && measureKind === "none" && (
        <p className="fieldnote">
          Measureless — existence is the datum; saving records the bout.
        </p>
      )}

      {habit && habit.kind === "project" && (
        <div className="fld">
          <div className="lbl">
            <span className="l">Entry</span>
            <span className="req">required</span>
          </div>
          <input
            type="text"
            className="inp"
            placeholder="type to search — or to create"
            value={entrySearch}
            onChange={(e) => setEntrySearch(e.target.value)}
          />
          <div className="entry-list">
            {matches.map((e) => (
              <button
                key={e.id}
                type="button"
                className="entry-row"
                aria-pressed={e.id === entryId}
                onClick={() => setEntryId(e.id === entryId ? null : e.id)}
              >
                {e.title}
                {e.status != null && <span className="status">{e.status}</span>}
              </button>
            ))}
            {search.length > 0 && !exactMatch && (
              <button type="button" className="btn-ghost btn-sm" onClick={quickCreate}>
                ＋ Create "{entrySearch.trim()}"
              </button>
            )}
            {entries.length === 0 && search.length === 0 && (
              <p className="fieldnote">No entries yet — type a title to create one.</p>
            )}
          </div>
        </div>
      )}

      <div className="row">
        <button type="button" className="btn-accent" onClick={save}>
          Log session
        </button>
        {error != null && <span className="form-error">{error}</span>}
        {flash != null && <span className="form-flash">{flash}</span>}
      </div>

      <DayLog day={DATE_RE.test(day) ? day : todayLocal()} />
    </div>
  );
}

/** The selected day's sessions, live — the write must appear with no refresh. */
function DayLog({ day }: { day: string }) {
  const dayLogQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("sessions")
          .leftJoin("habits", "habits.id", "sessions.habit_fk")
          .leftJoin("entries", "entries.id", "sessions.entry_fk")
          .select([
            "sessions.id as id",
            "sessions.measure_kind as measure_kind",
            "sessions.value as value",
            "sessions.start as start",
            "sessions.end as end",
            "sessions.source as source",
            "habits.name as habit_name",
            "habits.count_unit as count_unit",
            "entries.title as entry_title",
          ])
          .where("sessions.isDeleted", "is not", 1)
          .where("sessions.day", "=", DateOnly.orThrow(day))
          .orderBy("sessions.createdAt"),
      ),
    [day],
  );
  const rows = useQuery(dayLogQuery);

  // Per-habit day totals — multiples per day SUM (never overwrite).
  const totals = new Map<
    string,
    { time: number; count: number; unit: string | null; sessions: number }
  >();
  for (const r of rows) {
    const key = r.habit_name ?? "?";
    const t =
      totals.get(key) ?? { time: 0, count: 0, unit: r.count_unit, sessions: 0 };
    t.sessions += 1;
    if (r.measure_kind === "time") t.time += r.value ?? 0;
    if (r.measure_kind === "count") t.count += r.value ?? 0;
    totals.set(key, t);
  }

  return (
    <div className="fld">
      <div className="lbl">
        <span className="l">{day}</span>
        <span className="opt">
          {rows.length === 0 ? "nothing logged yet" : `${rows.length} session${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>
      {rows.length > 0 && (
        <>
          <table className="day-table">
            <thead>
              <tr>
                <th>habit</th>
                <th>entry</th>
                <th>measure</th>
                <th>source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.habit_name}</td>
                  <td>{r.entry_title ?? "—"}</td>
                  <td className="mono">
                    {r.measure_kind === "time" && fmtMinutes(r.value ?? 0)}
                    {r.measure_kind === "count" && `${r.value} ${r.count_unit ?? ""}`}
                    {r.measure_kind === "range" && `${r.start} → ${r.end}`}
                    {r.measure_kind === "none" && "done"}
                  </td>
                  <td>{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            {[...totals.entries()].map(([name, t]) => (
              <span key={name} className="day-sum">
                <b>{name}</b>
                {t.time > 0 && ` ${fmtMinutes(t.time)}`}
                {t.count > 0 && ` ${t.count} ${t.unit ?? ""}`}
                {` · ${t.sessions}×`}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
