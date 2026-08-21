/**
 * Build step 7 — the tracked-set picker (the create flow's "Habits" step,
 * reused by the management window's "Add habit / entry to the set" row).
 *
 * ELIGIBILITY (user-ruled 2026-07-28, over the drawn sample rows): the timer
 * is an accelerator for DURATION sessions only, so the roster is the active
 * habits declaring a time measure.
 *
 * APPEARANCE PASS 2026-07-28 (the Claude Design session — the ruling record
 * rides `Exhibit - Timer modals -flat-.html` and timers.css):
 *  - TWO VERBS, TWO TARGETS: the ROW toggles membership; the chevron is a real
 *    DISCLOSURE button (aria-expanded, tooltip) that opens the entry sub-pick.
 *  - THE SUB-PICK HAS TWO FACES: CREATION habits keep the chip roster;
 *    CONSUMPTION habits (hundreds of entries) get a search field over a short
 *    result list. Same block, same "Select" label, same New-entry door.
 *  - A closed (already-tracked) row carries its state as SHAPE — inert box,
 *    muted name, receded swatch — never a blanket fade, never prose.
 *
 * EXCLUSIVITY still reads through the rows: one clock per simple habit, per
 * ENTRY for project habits (picked here at join).
 *
 * CATEGORICALS ARE PICKED AT JOIN TOO (2026-08-20, user-ruled — Coding's
 * language): a habit declaring session-scope picklists opens the same sub-pick
 * with one chip roster per picklist, and the answers ride the tracked item into
 * the hand-off so the landed bout is complete. Before this the hand-off
 * committed Coding bouts with NO language, silently — the timer rulings predate
 * the categorical flavor (named 2026-07-23) and never saw the gap. The entry's
 * precedent governs: picked here, the log step confirms. Implementation: a
 * habit with picklists is not a valid pick until at least one is answered (the
 * project-entry rule's shape); two or more picklists are ALTERNATIVES, as
 * Daily's Kind switch treats them (Writing's Stage vs Wiki) — picking one
 * clears the other.
 */
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@evolu/react";
import { NonEmptyString100, NonEmptyString1000 } from "@evolu/common";
import { evolu } from "../db/evolu";
import { entryAttributesFromJson } from "../db/schema";
import { takenUnits, type TrackedItem } from "./timerCore";
import { useTimers } from "./timerStore";
import { Ico, ICONS } from "../shell/icons";

const habitsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("habits")
    .select([
      "id",
      "key",
      "name",
      "kind",
      "sub_type",
      "colour_slot",
      "archived",
      "measures_time",
      "entry_attributes",
    ])
    .where("isDeleted", "is not", 1)
    .orderBy("sort_order"),
);

// Entries of duration-declaring PROJECT habits only (2026-07-30 — was a
// whole-store entries subscription): the eligible roster is `measures_time`
// habits and only project rows open an entry sub-pick, so no other entry can
// ever be rendered or titled from here. Archived habits are deliberately NOT
// excluded in SQL — the TS roster filter hides them, and a tracked item may
// still need its title if its habit archives mid-clock.
const entriesQuery = evolu.createQuery((db) =>
  db
    .selectFrom("entries")
    .select(["id", "habit_fk", "title", "status", "updatedAt"])
    .where("isDeleted", "is not", 1)
    .where("habit_fk", "in", (eb) =>
      eb
        .selectFrom("habits")
        .select("habits.id")
        .where("kind", "=", "project")
        .where("measures_time", "=", 1)
        .where("isDeleted", "is not", 1),
    ),
);

// Session-scope picklists of the eligible roster + their vocab — the sub-pick's
// categorical sections. Same ordering discipline as useDayData's definitions
// query (createdAt ties within a seed batch; the key breaks them).
const definitionsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("subunit_definitions")
    .select(["id", "habit_fk", "key", "label", "data_type"])
    .where("scope", "=", "session")
    .where("data_type", "<>", "flag")
    .where("isDeleted", "is not", 1)
    .where("habit_fk", "in", (eb) =>
      eb
        .selectFrom("habits")
        .select("habits.id")
        .where("measures_time", "=", 1)
        .where("isDeleted", "is not", 1),
    )
    .orderBy("createdAt")
    .orderBy("key"),
);

const vocabQuery = evolu.createQuery((db) =>
  db
    .selectFrom("vocab_options")
    .select(["definition_fk", "value", "sort_order"])
    .where("definition_fk", "is not", null)
    .where("isDeleted", "is not", 1)
    .orderBy("sort_order"),
);

export interface PickerDefinition {
  id: string;
  key: string;
  label: string;
  vocab: string[];
}

/** Per-habit session picklists with their vocab, in declaration order. */
export const usePickerDefinitions = (): ReadonlyMap<string, PickerDefinition[]> => {
  const defRows = useQuery(definitionsQuery);
  const vocabRows = useQuery(vocabQuery);
  return useMemo(() => {
    const vocabByDef = new Map<string, string[]>();
    for (const v of vocabRows) {
      if (v.definition_fk == null || v.value == null) continue;
      const list = vocabByDef.get(v.definition_fk) ?? [];
      list.push(v.value);
      vocabByDef.set(v.definition_fk, list);
    }
    const out = new Map<string, PickerDefinition[]>();
    for (const d of defRows) {
      if (d.habit_fk == null || d.key == null) continue;
      const list = out.get(d.habit_fk) ?? [];
      list.push({
        id: d.id,
        key: d.key,
        label: d.label ?? d.key,
        vocab: vocabByDef.get(d.id) ?? [],
      });
      out.set(d.habit_fk, list);
    }
    return out;
  }, [defRows, vocabRows]);
};

/** The consumption search face shows this many rows at once. */
const RESULT_CAP = 8;

export type PickerSelection = Record<
  string,
  { on: boolean; entryId: string | null; cats?: Record<string, string> } | undefined
>;

/** The picked units as ready tracked items (empty until a valid pick exists). */
export const selectionToItems = (
  selection: PickerSelection,
  habits: ReadonlyArray<{
    id: string;
    key: string | null;
    name: string | null;
    kind: string | null;
    colour_slot: string | null;
  }>,
  entryTitles: ReadonlyMap<string, string>,
  defsByHabit: ReadonlyMap<string, PickerDefinition[]>,
): Omit<TrackedItem, "baseMs">[] => {
  const items: Omit<TrackedItem, "baseMs">[] = [];
  for (const h of habits) {
    const sel = selection[h.id];
    if (!sel?.on) continue;
    const isProject = h.kind === "project";
    if (isProject && sel.entryId == null) continue; // the entry is picked at join
    const defs = defsByHabit.get(h.id) ?? [];
    // only answers to picklists the habit still declares, in declaration order
    const cats: Record<string, string> = {};
    for (const d of defs) {
      const v = sel.cats?.[d.key];
      if (v) cats[d.key] = v;
    }
    if (defs.length > 0 && Object.keys(cats).length === 0) continue; // picked at join, like the entry
    items.push({
      habitId: h.id,
      habitKey: h.key ?? "",
      habitName: h.name ?? "",
      habitKind: h.kind ?? "",
      colourSlot: h.colour_slot ?? "habit-1",
      entryId: isProject ? sel.entryId : null,
      entryTitle: isProject ? (entryTitles.get(sel.entryId ?? "") ?? null) : null,
      cats: defs.length > 0 ? cats : undefined,
    });
  }
  return items;
};

// Glyphs from the shell roster (dedup pass 2026-07-30) — paths verified per
// glyph before adopting.
const ICheck = ({ className = "ico" }: { className?: string }) => (
  <Ico d={ICONS.check} className={className} />
);
const IChevron = () => <Ico d={ICONS.chevron} />;
const IPlus = () => <Ico d={ICONS.plus} />;
// DIVERGENT from ICONS.search (r=7 circle + shorter handle — the sub-pick's
// smaller field); kept local rather than forcing the roster glyph.
const ISearch = () => (
  <svg className="ico" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export function TrackedPicker({
  selection,
  onChange,
}: {
  selection: PickerSelection;
  onChange: (next: PickerSelection) => void;
}) {
  const habits = useQuery(habitsQuery);
  const entries = useQuery(entriesQuery);
  const defsByHabit = usePickerDefinitions();
  // which rows have their sub-pick disclosed (independent of membership)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // per-habit search query (the consumption face)
  const [queries, setQueries] = useState<Record<string, string>>({});
  // quick-create input state — which habit row shows the title field
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  // duration-declaring, active — the ruled roster
  const eligible = useMemo(
    () => habits.filter((h) => !h.archived && h.measures_time === 1),
    [habits],
  );

  type EntryRow = (typeof entries)[number];
  const byHabit = useMemo(() => {
    const m = new Map<string, EntryRow[]>();
    for (const e of entries) {
      if (e.habit_fk == null) continue;
      const list = m.get(e.habit_fk);
      if (list) list.push(e);
      else m.set(e.habit_fk, [e]);
    }
    // Current first, then most recently touched — the pick is usually "what
    // I'm playing now".
    for (const list of m.values())
      list.sort((a, b) => {
        const ac = a.status === "Current" ? 0 : 1;
        const bc = b.status === "Current" ? 0 : 1;
        if (ac !== bc) return ac - bc;
        return a.updatedAt < b.updatedAt ? 1 : -1;
      });
    return m;
  }, [entries]);

  // Subscribed, not a snapshot — the rows must re-close when clocks change.
  const { clocks } = useTimers();
  const taken = takenUnits(clocks);

  const toggleRow = (habitId: string, needsPick: boolean) => {
    const cur = selection[habitId];
    const next = !(cur?.on ?? false);
    onChange({
      ...selection,
      [habitId]: {
        on: next,
        entryId: next ? (cur?.entryId ?? null) : null,
        cats: next ? cur?.cats : undefined,
      },
    });
    // joining a habit with something to pick (entry · picklist) opens the
    // sub-pick — the pick happens at join; leaving collapses it
    if (needsPick) setExpanded((x) => ({ ...x, [habitId]: next }));
  };

  const toggleDisclosure = (habitId: string) =>
    setExpanded((x) => ({ ...x, [habitId]: !x[habitId] }));

  const pickEntry = (habitId: string, entryId: string) =>
    onChange({ ...selection, [habitId]: { ...selection[habitId], on: true, entryId } });

  // Two or more picklists are alternatives (Daily's Kind switch) — an answer
  // to one clears the others; a single picklist simply takes the value.
  const pickCat = (habitId: string, defKey: string, value: string) => {
    const cur = selection[habitId];
    onChange({
      ...selection,
      [habitId]: { on: true, entryId: cur?.entryId ?? null, cats: { [defKey]: value } },
    });
  };

  const quickCreate = (habit: (typeof eligible)[number]) => {
    const title = newTitle.trim();
    if (title === "") return;
    let hasStatus = false;
    try {
      hasStatus = habit.entry_attributes
        ? entryAttributesFromJson(habit.entry_attributes).includes("status")
        : false;
    } catch {
      hasStatus = false;
    }
    const res = evolu.insert("entries", {
      habit_fk: habit.id,
      title: NonEmptyString1000.orThrow(title),
      status: hasStatus ? NonEmptyString100.orThrow("Current") : null,
    });
    if (res.ok) {
      pickEntry(habit.id, res.value.id);
      setCreatingFor(null);
      setNewTitle("");
    } else {
      console.error("timer quick-create failed", res.error);
    }
  };

  const newEntryDoor = (h: (typeof eligible)[number]) =>
    creatingFor === h.id ? (
      <span className="minifield">
        <input
          autoFocus
          placeholder="Title…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") quickCreate(h);
            if (e.key === "Escape") {
              setCreatingFor(null);
              setNewTitle("");
            }
          }}
        />
      </span>
    ) : (
      <button
        className="epadd"
        onClick={() => {
          setCreatingFor(h.id);
          setNewTitle("");
        }}
      >
        <IPlus />
        New entry
      </button>
    );

  return (
    <div className="picklist">
      {eligible.map((h) => {
        const isProject = h.kind === "project";
        const defs = defsByHabit.get(h.id) ?? [];
        const needsPick = isProject || defs.length > 0;
        const sel = selection[h.id];
        const habitTaken = !isProject && taken.habitIds.has(h.id);
        const list = byHabit.get(h.id) ?? [];
        const open = needsPick && (expanded[h.id] ?? false);
        const q = (queries[h.id] ?? "").trim().toLowerCase();
        const searchFace = h.sub_type === "consumption"; // hundreds of entries
        const results = searchFace
          ? list.filter((e) => q === "" || (e.title ?? "").toLowerCase().includes(q)).slice(0, RESULT_CAP)
          : list;
        return (
          // a FRAGMENT, deliberately: the `.prow2 + .prow2` / `.entrypick + .prow2`
          // hairlines need the rows to be true DOM siblings
          <Fragment key={h.id}>
            <div
              className={`prow2${sel?.on ? " on" : ""}`}
              aria-disabled={habitTaken ? "true" : undefined}
              onClick={() => {
                if (habitTaken) return;
                toggleRow(h.id, needsPick);
              }}
            >
              <span className="box">
                <ICheck />
              </span>
              {/* a closed row's swatch RECEDES (state as shape, never a fade) */}
              <span
                className="dot"
                style={{
                  background: habitTaken
                    ? `color-mix(in oklch, var(--${h.colour_slot ?? "habit-1"}), var(--panel-background) var(--fade))`
                    : `var(--${h.colour_slot ?? "habit-1"})`,
                }}
              />
              <span className="pnwrap">
                <span className="pn">{h.name}</span>
              </span>
              {needsPick && (
                <button
                  className="pe needs"
                  aria-expanded={open}
                  title={isProject ? "Choose the entry" : `Choose the ${defs[0].label.toLowerCase()}`}
                  onClick={(e) => {
                    e.stopPropagation(); // two verbs, two targets
                    toggleDisclosure(h.id);
                  }}
                >
                  <IChevron />
                </button>
              )}
            </div>
            {open && (
              <div className="entrypick">
                {isProject && (
                <>
                <span className="eplbl">Select</span>
                <span className="epbody">
                  {searchFace ? (
                    <>
                      <span className="epsearch">
                        <ISearch />
                        <input
                          type="text"
                          placeholder={`Search ${list.length} ${h.name} entries`}
                          value={queries[h.id] ?? ""}
                          onChange={(e) =>
                            setQueries((x) => ({ ...x, [h.id]: e.target.value }))
                          }
                        />
                      </span>
                      {results.length > 0 && (
                        <span className="epresults">
                          {results.map((e) => {
                            const entryTaken = taken.entryIds.has(e.id);
                            return (
                              <button
                                key={e.id}
                                className={`epres${sel?.entryId === e.id ? " on" : ""}`}
                                aria-disabled={entryTaken ? "true" : undefined}
                                title={entryTaken ? "On another clock" : undefined}
                                onClick={() => {
                                  if (!entryTaken) pickEntry(h.id, e.id);
                                }}
                              >
                                <ICheck className="ico rk" />
                                {e.title}
                              </button>
                            );
                          })}
                        </span>
                      )}
                      {newEntryDoor(h)}
                    </>
                  ) : (
                    <span className="epopts">
                      {list.map((e) => {
                        const entryTaken = taken.entryIds.has(e.id);
                        return (
                          <button
                            key={e.id}
                            className={`epopt${sel?.entryId === e.id ? " on" : ""}`}
                            aria-disabled={entryTaken ? "true" : undefined}
                            title={entryTaken ? "On another clock" : undefined}
                            onClick={() => {
                              if (!entryTaken) pickEntry(h.id, e.id);
                            }}
                          >
                            {e.title}
                          </button>
                        );
                      })}
                      {newEntryDoor(h)}
                    </span>
                  )}
                </span>
                </>
                )}
                {/* one chip roster per declared session picklist — the same
                    `.epopts` face the creation habits' entry roster wears */}
                {defs.map((d) => (
                  <Fragment key={d.key}>
                    <span className="eplbl">{d.label}</span>
                    <span className="epbody">
                      <span className="epopts">
                        {d.vocab.map((v) => (
                          <button
                            key={v}
                            className={`epopt${sel?.cats?.[d.key] === v ? " on" : ""}`}
                            onClick={() => pickCat(h.id, d.key, v)}
                          >
                            {v}
                          </button>
                        ))}
                        {d.vocab.length === 0 && (
                          <span className="eplbl">No values yet — add them in Settings → Habits → Vocabulary</span>
                        )}
                      </span>
                    </span>
                  </Fragment>
                ))}
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

export { habitsQuery as timerHabitsQuery, entriesQuery as timerEntriesQuery };
