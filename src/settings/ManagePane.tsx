/**
 * SETTINGS → HABITS → MANAGE (Build step 10, slice 2) — `kit-list-management`,
 * translated from `Final/settings.html` § PANE · Habits.
 *
 * The rows: disc (sub-units disclosure) · grip (drag-reorder) · swatch
 * (icon/lettermark) · name · quick actions (Colour · Icon · Archive · Delete).
 * Drag-reorder writes the ONE global `sort_order`, partitioned Projects above
 * Daily — a drag reassigns the group's own sort values in the new order, so
 * the partition can never interleave. The ARCHIVE SHELF is the archived
 * habits' only home ("archived habits never appear in the nav rail"); restore
 * = Activate. Delete = the count-carrying danger confirm (habit → sessions +
 * entries cascade, [[Delete Safety & Undo]] — no undo, backup the only
 * recovery).
 *
 * The disclosure: the habit's measures + session-level definitions read from
 * the definition rows (vocab chips + quick-add), derived rules read-only, and
 * — simple/range only — the KEEPSAKE SNIPPET SLOT (the creator's cosmetics
 * anatomy; the editor is KeepsakeEditor.tsx). Count-unit / wave-gap / ladder
 * OVERRIDES live in the habit EDITOR, opened by the row's name (the mname
 * door, live since slice 3).
 *
 * Unfinished-habit marks (`missing soft` — informational, never the attention
 * dot): the one live condition is a simple/range habit on the fallback tile.
 * The drawn "importer not built yet" case was demonstrative (all eight
 * sources shipped at step 8) and has no live tenant.
 */
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@evolu/react";
import { FiniteNumber, NonEmptyString100 } from "@evolu/common";
import { evolu } from "../db/evolu";
import { Ico, ICONS } from "../shell/icons";
import { HabitIcon, hasIcon } from "../shell/habitIcons";
import { DangerConfirm } from "../shell/DangerConfirm";
import { showErrorToast } from "../shell/toast";
import { deleteRefFiles } from "../db/fileDeletion";
import { deviceSet } from "./deviceStore";
import { clearCustomColour } from "./customColours";
import { libraryViewKey } from "../library/Library";
import { cloudSub, underRoot } from "./cloudRoot";
import { parseDerivedRules, parseMilestoneLadders, type EntryAttribute } from "../db/schema";
import type { LadderOverrides } from "../daily/milestones";

/** The schema's never-throwing decode, mapped to this pane's empty default
 *  (the editor treats "no overrides" and "unreadable" the same way). */
const laddersOf = (raw: unknown): LadderOverrides =>
  (parseMilestoneLadders(raw) as unknown as LadderOverrides | null) ?? {};
import { ColourPicker, IconPicker } from "./pickers";
import { KeepsakeEditor } from "./KeepsakeEditor";
import { HabitCreator, type EditTarget } from "./HabitCreator";
import { entryAttributesFromJson } from "../db/schema";
import { nounFor } from "../metrics/format";

// ── queries ──────────────────────────────────────────────────────────────────

const manageHabitsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("habits")
    .select([
      "id", "key", "name", "kind", "sub_type", "colour_slot", "icon",
      "archived", "sort_order", "measures_time", "measures_count",
      "count_unit", "keepsake_snippet", "derived_rules",
      // the editor's own columns (slice 3)
      "range_max_midnights", "entry_attributes", "wave_gap_days", "milestone_ladders",
    ])
    .where("isDeleted", "is not", 1)
    .orderBy("sort_order"),
);

const defsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("subunit_definitions")
    .select(["id", "habit_fk", "key", "label", "scope", "data_type"])
    .where("isDeleted", "is not", 1),
);

const vocabQuery = evolu.createQuery((db) =>
  db
    .selectFrom("vocab_options")
    .select(["id", "definition_fk", "value", "sort_order"])
    .where("isDeleted", "is not", 1)
    .orderBy("sort_order"),
);

type HabitRow = (typeof manageHabitsQuery)["Row"];

// ── the pane ─────────────────────────────────────────────────────────────────

export function ManagePane({
  creating,
  onCloseCreator,
  onOpenHabit,
}: {
  /** The pane header's "+ New habit" owns the flag; the modal lives here. */
  creating: boolean;
  onCloseCreator: () => void;
  onOpenHabit?: (habitKey: string) => void;
}) {
  const habits = useQuery(manageHabitsQuery);
  const defs = useQuery(defsQuery);
  const vocab = useQuery(vocabQuery);

  // Memoized so `takenSlots` below can actually hit: `live` was a fresh array
  // every render, so its dep changed identity every time and the Set was
  // rebuilt regardless (2026-08-04).
  const live = useMemo(() => habits.filter((h) => !h.archived), [habits]);
  const projects = useMemo(() => live.filter((h) => h.kind === "project"), [live]);
  const daily = useMemo(() => live.filter((h) => h.kind !== "project"), [live]);
  const shelf = useMemo(() => habits.filter((h) => h.archived === 1), [habits]);

  // Hard-unique: slots owned by any OTHER live habit lock in the picker.
  const takenSlots = useMemo(
    () => new Set(live.map((h) => String(h.colour_slot ?? ""))),
    [live],
  );

  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const toggleOpen = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // One picker open at a time, anchored to its trigger's rect. The trigger
  // element rides in a ref so useDismiss can leave its mousedown alone
  // (`ignore`) and the toggle below can own the close — without this, the
  // capture-phase dismiss races the trigger's click and every second press
  // reopens instead of closing (`pickers-1`).
  const [picker, setPicker] = useState<
    | { kind: "colour" | "icon"; habitId: string; anchor: DOMRect }
    | null
  >(null);
  const pickerTrigger = useRef<Element | null>(null);
  const openPicker = (p: { kind: "colour" | "icon"; habitId: string; anchor: DOMRect; el: Element }) => {
    setPicker((prev) => {
      if (prev != null && prev.kind === p.kind && prev.habitId === p.habitId) {
        pickerTrigger.current = null;
        return null;
      }
      pickerTrigger.current = p.el;
      return { kind: p.kind, habitId: p.habitId, anchor: p.anchor };
    });
  };
  const [keepsakeFor, setKeepsakeFor] = useState<HabitRow | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [deleting, setDeleting] = useState<{
    habit: HabitRow;
    entries: number;
    sessions: number;
    covers: number;
  } | null>(null);

  // ── writes (every mutation Result-checked — Evolu fails silently) ──────────

  const update = (id: unknown, patch: Record<string, unknown>): boolean => {
    const res = evolu.update("habits", { id: id as never, ...(patch as object) } as never);
    if (!res.ok) {
      console.error("manage: habit update rejected", res.error);
      showErrorToast("The change could not be saved.");
    }
    return res.ok;
  };

  /** Reassign the GROUP's own sort values in the new order (partition-safe). */
  const reorder = (group: HabitRow[], fromId: string, toId: string) => {
    if (fromId === toId) return;
    const ids = group.map((h) => String(h.id));
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    const next = [...group];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const slots = group
      .map((h) => (h.sort_order as number | null) ?? 0)
      .sort((a, b) => a - b);
    next.forEach((h, i) => {
      if (((h.sort_order as number | null) ?? 0) !== slots[i]) update(h.id, { sort_order: slots[i] });
    });
  };

  const askDelete = async (habit: HabitRow) => {
    // Count the cascade FIRST — the confirm carries real numbers, internally
    // consistent at the moment it opens (the drawn face's contract).
    const entries = await evolu.loadQuery(
      evolu.createQuery((db) =>
        db
          .selectFrom("entries")
          .select(["id", "cover"])
          .where("habit_fk", "=", habit.id as never)
          .where("isDeleted", "is not", 1),
      ),
    );
    const sessions = await evolu.loadQuery(
      evolu.createQuery((db) =>
        db
          .selectFrom("sessions")
          .select(["id"])
          .where("habit_fk", "=", habit.id as never)
          .where("isDeleted", "is not", 1),
      ),
    );
    setDeleting({
      habit,
      entries: entries.length,
      sessions: sessions.length,
      covers: entries.filter((e) => e.cover != null).length,
    });
  };

  const runDelete = async () => {
    if (deleting == null) return;
    const { habit } = deleting;
    setDeleting(null);
    // Tombstone the cascade: sessions + entries + the habit row itself
    // ("delete = hard, cascades to the habit's sessions and entries"). Cover
    // FILES delete immediately behind the danger confirm — tier 1 offers no
    // undo (db/fileDeletion.ts, the deferred-file pipeline; docked at the
    // Phase-2 completion audit, 2026-08-06).
    const [entries, sessions] = await Promise.all([
      evolu.loadQuery(
        evolu.createQuery((db) =>
          db.selectFrom("entries").select(["id", "cover", "banner"]).where("habit_fk", "=", habit.id as never).where("isDeleted", "is not", 1),
        ),
      ),
      evolu.loadQuery(
        evolu.createQuery((db) =>
          db.selectFrom("sessions").select(["id"]).where("habit_fk", "=", habit.id as never).where("isDeleted", "is not", 1),
        ),
      ),
    ]);
    // The definition tail dies with the habit — uniform cascade since
    // 2026-08-06 (user-ruled, audit fork B): the sessions' value rows, the
    // habit's subunit definitions, and their vocab all tombstone with it
    // (a live definition on a dead habit would only ever feed doctor lints).
    const sessionIdSet = sessions.map((s) => s.id as never);
    const [defs, values] = await Promise.all([
      evolu.loadQuery(
        evolu.createQuery((db) =>
          db.selectFrom("subunit_definitions").select(["id"]).where("habit_fk", "=", habit.id as never).where("isDeleted", "is not", 1),
        ),
      ),
      sessionIdSet.length > 0
        ? evolu.loadQuery(
            evolu.createQuery((db) =>
              db.selectFrom("subunit_values").select(["id"]).where("session_fk", "in", sessionIdSet).where("isDeleted", "is not", 1),
            ),
          )
        : Promise.resolve([] as { id: unknown }[]),
    ]);
    const defIdSet = defs.map((d) => d.id as never);
    const vocabRows =
      defIdSet.length > 0
        ? await evolu.loadQuery(
            evolu.createQuery((db) =>
              db.selectFrom("vocab_options").select(["id"]).where("definition_fk", "in", defIdSet).where("isDeleted", "is not", 1),
            ),
          )
        : [];
    let ok = true;
    for (const v of values) {
      const r = evolu.update("subunit_values", { id: v.id as never, isDeleted: 1 });
      if (!r.ok) ok = false;
    }
    for (const s of sessions) {
      const r = evolu.update("sessions", { id: s.id, isDeleted: 1 });
      if (!r.ok) ok = false;
    }
    for (const e of entries) {
      const r = evolu.update("entries", { id: e.id, isDeleted: 1 });
      if (!r.ok) ok = false;
    }
    for (const o of vocabRows) {
      const r = evolu.update("vocab_options", { id: o.id as never, isDeleted: 1 });
      if (!r.ok) ok = false;
    }
    for (const d of defs) {
      const r = evolu.update("subunit_definitions", { id: d.id as never, isDeleted: 1 });
      if (!r.ok) ok = false;
    }
    const hr = evolu.update("habits", { id: habit.id, isDeleted: 1 });
    if (!hr.ok) ok = false;
    if (!ok) showErrorToast(`Deleting ${habit.name} did not fully apply — see the console.`);
    if (ok) {
      const refs = entries.flatMap((e) => {
        const out: string[] = [];
        if (e.cover != null) out.push(String(e.cover));
        if (e.banner != null) out.push(String(e.banner));
        return out;
      });
      void deleteRefFiles(refs);
      // The PER-DEVICE leftover, cleared 2026-08-09: a habit's saved library
      // sort + filters live in settings.json, outside Evolu, so the cascade —
      // which only knows about store tables — left them behind for good. Inert
      // (nothing reads them once the habit is gone) but unbounded: every habit
      // ever deleted kept a row in a file that is never otherwise pruned.
      //
      // ⚠ IT IS ONLY EVER PER-DEVICE. This clears THIS machine's copy; the Mac
      // will keep its own until the same habit is deleted there, which cannot
      // happen because the habit is already gone from the synced store. That is
      // a real limit of the per-device tier, not an oversight — recorded rather
      // than papered over.
      if (habit.key != null) deviceSet(libraryViewKey(String(habit.key)), null);
      // The SYNCED leftover, cleared the same day (`colours-1`): the cascade
      // covered every store table the habit touches but not its
      // `custom_colour:<key>` app_meta row, so a deleted habit that ever wore
      // a custom hex kept publishing its root var forever.
      if (habit.key != null) void clearCustomColour(String(habit.key));
    }
  };

  const addVocab = (defId: unknown, value: string) => {
    const v = value.trim();
    if (v === "") return;
    const existing = vocab.filter((o) => o.definition_fk === defId);
    // Case-insensitive dedup — canonical casing wins (the importers' vocab law).
    if (existing.some((o) => String(o.value).toLowerCase() === v.toLowerCase())) return;
    const maxSort = existing.reduce((a, o) => Math.max(a, (o.sort_order as number) ?? 0), 0);
    const res = evolu.insert("vocab_options", {
      definition_fk: defId as never,
      value: NonEmptyString100.orThrow(v),
      sort_order: FiniteNumber.orThrow(maxSort + 1),
    });
    if (!res.ok) {
      console.error("manage: vocab add rejected", res.error);
      showErrorToast("The value could not be added.");
    }
  };

  const pickerHabit = picker != null ? habits.find((h) => String(h.id) === picker.habitId) : null;

  /**
   * The "Edit habit" door. `hasSessions` is resolved HERE rather than in the
   * modal because it decides a LOCK — kind cannot change once any session
   * exists ("conversion changes what a session is") — and a lock resolved
   * after the form paints would let the user pick a kind and then have it
   * taken away.
   */
  const openEditor = async (h: HabitRow) => {
    const sessions = await evolu.loadQuery(
      evolu.createQuery((db) =>
        db
          .selectFrom("sessions")
          .select(["id"])
          .where("habit_fk", "=", h.id as never)
          .where("isDeleted", "is not", 1)
          .limit(1),
      ),
    );
    let attrs: EntryAttribute[] = [];
    try {
      if (h.entry_attributes != null)
        attrs = entryAttributesFromJson(h.entry_attributes as never) as unknown as EntryAttribute[];
    } catch {
      attrs = [];
    }
    setEditing({
      id: String(h.id),
      key: String(h.key),
      name: String(h.name ?? ""),
      kind: h.kind as "simple" | "project" | "range",
      subType: (h.sub_type as "consumption" | "creation" | null) ?? null,
      colourSlot: String(h.colour_slot ?? "habit-1"),
      icon: (h.icon as string | null) ?? null,
      measuresTime: h.measures_time === 1,
      measuresCount: h.measures_count === 1,
      countUnit: (h.count_unit as string | null) ?? null,
      maxMidnights: (h.range_max_midnights as number | null) ?? null,
      entryAttrs: attrs,
      derivedRules: parseDerivedRules(h.derived_rules),
      waveGapDays: (h.wave_gap_days as number | null) ?? null,
      ladders: laddersOf(h.milestone_ladders),
      hasSessions: sessions.length > 0,
    });
  };

  // Names are hard-unique case-insensitively; the edit target's own name must
  // not count against itself.
  const namesExcept = (id: string | null): Set<string> =>
    new Set(
      habits
        .filter((h) => String(h.id) !== id)
        .map((h) => String(h.name ?? "").trim().toLowerCase())
        .filter((n) => n !== ""),
    );

  return (
    <>
      <div className="mscroll">
        <p className="mgroup-lbl">Projects</p>
        <Group
          rows={projects}
          openIds={openIds}
          defs={defs}
          vocab={vocab}
          onToggle={toggleOpen}
          onReorder={reorder}
          onPicker={openPicker}
          onArchive={(h) => update(h.id, { archived: 1 })}
          onDelete={(h) => void askDelete(h)}
          onKeepsake={setKeepsakeFor}
          onAddVocab={addVocab}
          onEdit={(h) => void openEditor(h)}
        />

        <p className="mgroup-lbl">Daily</p>
        <Group
          rows={daily}
          openIds={openIds}
          defs={defs}
          vocab={vocab}
          onToggle={toggleOpen}
          onReorder={reorder}
          onPicker={openPicker}
          onArchive={(h) => update(h.id, { archived: 1 })}
          onDelete={(h) => void askDelete(h)}
          onKeepsake={setKeepsakeFor}
          onAddVocab={addVocab}
          onEdit={(h) => void openEditor(h)}
        />

        {shelf.length > 0 && (
          <div className="shelf">
            <p className="mgroup-lbl">Archive</p>
            <div className="mlist">
              {shelf.map((h) => (
                <div className="mrow arch" key={String(h.id)} style={{ ["--msw-c" as string]: `var(--${h.colour_slot})` }}>
                  <span className="grip" style={{ visibility: "hidden" }}>
                    <Ico d={["M8 7h8", "M8 12h8", "M8 17h8"]} size={18} />
                  </span>
                  <span className="msw">
                    {hasIcon(h.icon as string | null) ? (
                      <HabitIcon icon={h.icon as string} />
                    ) : (
                      String(h.name ?? "?")[0]?.toUpperCase()
                    )}
                  </span>
                  <span className="mid">
                    <span className="mname arch">{h.name}</span>
                  </span>
                  <span className="macts">
                    <button className="btn-plain btn-sm" onClick={() => update(h.id, { archived: 0 })}>
                      Activate
                    </button>
                    <button className="iconbtn danger" data-tip="Delete" onClick={() => void askDelete(h)}>
                      <Ico d={ICONS.trash} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {picker?.kind === "colour" && pickerHabit != null && (
        <ColourPicker
          habitKey={String(pickerHabit.key)}
          current={String(pickerHabit.colour_slot ?? "")}
          taken={takenSlots}
          anchor={picker.anchor}
          onPick={(slot) => {
            update(pickerHabit.id, { colour_slot: NonEmptyString100.orThrow(slot) });
            // Moving OFF a custom colour tombstones its hex row — otherwise
            // the synced row outlives the pick and re-publishes a dead
            // `--custom-<key>` root var at every launch (`colours-1`).
            if (!slot.startsWith("custom-") && pickerHabit.key != null)
              void clearCustomColour(String(pickerHabit.key));
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
          ignore={pickerTrigger}
        />
      )}
      {picker?.kind === "icon" && pickerHabit != null && (
        <IconPicker
          current={(pickerHabit.icon as string | null) ?? null}
          anchor={picker.anchor}
          onPick={(name) => {
            update(pickerHabit.id, { icon: NonEmptyString100.orThrow(name) });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
          ignore={pickerTrigger}
        />
      )}

      {(creating || editing != null) && (
        <HabitCreator
          edit={editing ?? undefined}
          takenSlots={takenSlots}
          takenNames={namesExcept(editing?.id ?? null)}
          onClose={() => {
            setEditing(null);
            onCloseCreator();
          }}
          onCreated={(key) => onOpenHabit?.(key)}
        />
      )}

      {keepsakeFor != null && (
        <KeepsakeEditor
          habitId={String(keepsakeFor.id)}
          habitKey={(keepsakeFor.key as string | null) ?? null}
          habitName={String(keepsakeFor.name ?? "")}
          colourSlot={String(keepsakeFor.colour_slot ?? "habit-1")}
          measuresTime={keepsakeFor.measures_time === 1}
          measuresCount={keepsakeFor.measures_count === 1}
          countUnit={(keepsakeFor.count_unit as string | null) ?? null}
          stored={(keepsakeFor.keepsake_snippet as string | null) ?? null}
          onClose={() => setKeepsakeFor(null)}
        />
      )}

      {deleting != null && (
        <DangerConfirm
          title={`Delete ${deleting.habit.name}?`}
          body={
            <>
              This deletes the habit and everything it owns — <strong>{deleting.entries}</strong>{" "}
              {nounFor(deleting.entries, "entry", "entries")} ·{" "}
              <strong>{deleting.sessions}</strong> {nounFor(deleting.sessions, "session", "sessions")}
              {deleting.covers > 0 && (
                <>
                  {" "}
                  · <strong>{deleting.covers}</strong>{" "}
                  {nounFor(deleting.covers, "cover image", "cover images")}
                </>
              )}
              . There is no undo; a backup is the only recovery.
            </>
          }
          confirmLabel={`Delete ${deleting.habit.name}`}
          onConfirm={() => void runDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}

// ── one group (Projects / Daily) ─────────────────────────────────────────────

function Group({
  rows,
  openIds,
  defs,
  vocab,
  onToggle,
  onReorder,
  onPicker,
  onArchive,
  onDelete,
  onKeepsake,
  onAddVocab,
  onEdit,
}: {
  rows: HabitRow[];
  openIds: Set<string>;
  defs: readonly { id: unknown; habit_fk: unknown; key: unknown; label: unknown; scope: unknown; data_type: unknown }[];
  vocab: readonly { id: unknown; definition_fk: unknown; value: unknown; sort_order: unknown }[];
  onToggle: (id: string) => void;
  onReorder: (group: HabitRow[], fromId: string, toId: string) => void;
  onPicker: (p: { kind: "colour" | "icon"; habitId: string; anchor: DOMRect; el: Element }) => void;
  onArchive: (h: HabitRow) => void;
  onDelete: (h: HabitRow) => void;
  onKeepsake: (h: HabitRow) => void;
  onAddVocab: (defId: unknown, value: string) => void;
  onEdit: (h: HabitRow) => void;
}) {
  const dragId = useRef<string | null>(null);
  return (
    <div className="mlist">
      {rows.map((h) => {
        const id = String(h.id);
        const open = openIds.has(id);
        const fallbackTile =
          h.kind !== "project" &&
          ((h.keepsake_snippet as string | null) == null ||
            String(h.keepsake_snippet ?? "").trim() === "");
        return (
          <div className={`mitem${open ? " open" : ""}`} key={id}>
            <div
              className="mrow"
              draggable
              onDragStart={(e) => {
                dragId.current = id;
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragId.current != null && dragId.current !== id) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId.current != null) onReorder(rows, dragId.current, id);
                dragId.current = null;
              }}
            >
              <button className="disc" data-tip="Sub-units" onClick={() => onToggle(id)}>
                <Ico d={ICONS.chevronRight} />
              </button>
              <span className="grip" data-tip="Drag to reorder">
                <Ico d={["M8 7h8", "M8 12h8", "M8 17h8"]} size={18} />
              </span>
              <span className="msw" style={{ background: `var(--${h.colour_slot})` }}>
                {hasIcon(h.icon as string | null) ? (
                  <HabitIcon icon={h.icon as string} />
                ) : (
                  String(h.name ?? "?")[0]?.toUpperCase()
                )}
              </span>
              <span className="mid">
                {/* The "Edit habit" door — the creator in edit mode (slice 3). */}
                <button className="mname door" data-tip="Edit habit" onClick={() => onEdit(h)}>
                  {h.name}
                </button>
                {fallbackTile && (
                  <span className="missing soft">
                    <Ico d={["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M12 16v-4", "M12 8h.01"]} />
                    <span>Using the fallback tile — open to add a keepsake snippet</span>
                  </span>
                )}
              </span>
              <span className="macts">
                <button
                  className="iconbtn"
                  data-tip="Colour"
                  onClick={(e) =>
                    onPicker({ kind: "colour", habitId: id, anchor: e.currentTarget.getBoundingClientRect(), el: e.currentTarget })
                  }
                >
                  <Ico d={["M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z", "M13.5 6.5h.01", "M17.5 10.5h.01", "M8.5 7.5h.01", "M6.5 12.5h.01"]} />
                </button>
                <button
                  className="iconbtn"
                  data-tip="Icon"
                  onClick={(e) =>
                    onPicker({ kind: "icon", habitId: id, anchor: e.currentTarget.getBoundingClientRect(), el: e.currentTarget })
                  }
                >
                  <Ico d={["M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"]} />
                </button>
                <button className="iconbtn" data-tip="Archive" onClick={() => onArchive(h)}>
                  <Ico d={["M2 5a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z", "M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9", "M10 13h4"]} />
                </button>
                <button className="iconbtn danger" data-tip="Delete" onClick={() => onDelete(h)}>
                  <Ico d={ICONS.trash} />
                </button>
              </span>
            </div>
            {open && (
              <Disclosure habit={h} defs={defs} vocab={vocab} onKeepsake={onKeepsake} onAddVocab={onAddVocab} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── the sub-units disclosure ─────────────────────────────────────────────────

/**
 * Open a habit's image folder in the OS file manager.
 *
 * Creates it first when it does not exist yet — a habit with no covers imported
 * has no folder, and greying the door out to say so would be a worse answer
 * than opening an empty folder. `mkdir` is recursive because the images root
 * itself may be missing on a freshly-picked cloud root.
 *
 * `bk_reveal` despite the name: it is `open_path` on the Rust side and opens
 * the folder ITSELF, which is the whole reason it exists — `reveal_item_in_dir`
 * opens the PARENT with the folder merely selected (found live 2026-08-03).
 */
async function openImageFolder(habitKey: string): Promise<void> {
  try {
    const imagesRoot = cloudSub("images");
    if (imagesRoot == null) {
      showErrorToast("No cloud root set — pick one in Settings → Storage.", "Habits");
      return;
    }
    const dir = underRoot(imagesRoot, habitKey);
    const fs = await import("@tauri-apps/plugin-fs");
    if (!(await fs.exists(dir))) await fs.mkdir(dir, { recursive: true });
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("bk_reveal", { path: dir });
  } catch (e) {
    // Never silent: a folder that does not open is the kind of failure that
    // reads as a dead button (the standing lesson).
    console.error("open image folder failed", e);
    showErrorToast(`Could not open the image folder — ${String(e)}`, "Habits");
  }
}

function Disclosure({
  habit,
  defs,
  vocab,
  onKeepsake,
  onAddVocab,
}: {
  habit: HabitRow;
  defs: readonly { id: unknown; habit_fk: unknown; key: unknown; label: unknown; scope: unknown; data_type: unknown }[];
  vocab: readonly { id: unknown; definition_fk: unknown; value: unknown; sort_order: unknown }[];
  onKeepsake: (h: HabitRow) => void;
  onAddVocab: (defId: unknown, value: string) => void;
}) {
  const own = defs.filter((d) => d.habit_fk === habit.id);
  const rules = parseDerivedRules(habit.derived_rules);
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const measureChips: string[] = [];
  if (habit.kind === "range") {
    measureChips.push("Start · datetime", "End · datetime");
  } else {
    if (habit.measures_time === 1) measureChips.push("Duration · minutes");
    if (habit.measures_count === 1)
      measureChips.push(`${habit.count_unit ?? "Count"} · count`);
  }

  return (
    <div className="msub">
      {measureChips.length > 0 && (
        <div className="subgrp">
          <span className="sglbl">{habit.kind === "range" ? "Range" : "Measures"}</span>
          <div className="subchips">
            {measureChips.map((c) => (
              <span className="subchip" key={c}>{c}</span>
            ))}
          </div>
        </div>
      )}
      {measureChips.length === 0 && own.length === 0 && rules.length === 0 && (
        <span className="subnone">Measureless — a logged day is the whole datum.</span>
      )}

      {own.map((d) => {
        const defId = String(d.id);
        const options = vocab.filter((o) => o.definition_fk === d.id);
        const isFlag = String(d.data_type) === "flag";
        return (
          <div className="subgrp" key={defId}>
            <span className="sglbl">
              {String(d.label)}
              {String(d.scope) === "entry" ? " · entry-level" : ""}
            </span>
            <div className="subchips">
              {isFlag ? (
                <span className="subchip">{String(d.label)} · flag</span>
              ) : (
                <>
                  {options.map((o) => (
                    <span className="subchip" key={String(o.id)}>{String(o.value)}</span>
                  ))}
                  {adding === defId ? (
                    <input
                      className="subchip subadd-in"
                      value={draft}
                      autoFocus
                      spellCheck={false}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onAddVocab(d.id, draft);
                          setAdding(null);
                          setDraft("");
                        } else if (e.key === "Escape") {
                          setAdding(null);
                          setDraft("");
                        }
                      }}
                      onBlur={() => {
                        setAdding(null);
                        setDraft("");
                      }}
                    />
                  ) : (
                    <button
                      className="subchip add"
                      data-tip="Add value"
                      onClick={() => {
                        setAdding(defId);
                        setDraft("");
                      }}
                    >
                      <Ico d={ICONS.plus} size={12} /> add
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}

      {rules.length > 0 && (
        <div className="subgrp">
          <span className="sglbl">Derived · read-only</span>
          <div className="subchips">
            {rules.map((r) => (
              <span className="subchip" key={r.label}>{r.label}</span>
            ))}
          </div>
        </div>
      )}

      {/* THE IMAGE FOLDER DOOR (user-ruled 2026-08-08, placed in Settings).
          Project habits only, and that is not a policy choice — `images/<key>/`
          is written ONLY by cover downloads and entry image picks, both of
          which are entry-scoped, so a simple or range habit has no folder to
          open and never will. It takes the keepsake slot's place by the
          complementary condition, which keeps the disclosure to one slot per
          habit: art you AUTHOR (keepsake) or art you COLLECT (covers).

          Hidden, not disabled, when no cloud root is set — the ruled shape for
          an unset root is "paused, never a gate". */}
      {habit.kind === "project" && cloudSub("images") != null && (
        <button className="snipslot" onClick={() => void openImageFolder(String(habit.key))}>
          <span className="artph">
            <Ico d={["M4 4h5l2 3h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"]} />
          </span>
          <span className="cosmeta">
            <span className="cosn">Image folder</span>
            <span className="coss">
              Where this habit's cover art lives on disk. Opens the folder itself, so you can add,
              replace or tidy the files by hand.
            </span>
          </span>
          <span className="cosact">Open folder</span>
        </button>
      )}

      {habit.kind !== "project" && (
        <button className="snipslot" onClick={() => onKeepsake(habit)}>
          <span className="artph">
            <Ico d={["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M9 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4z", "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"]} />
          </span>
          <span className="cosmeta">
            <span className="cosn">Keepsake tile</span>
            <span className="coss">
              Code-drawn art for the cover wall — paste a tile snippet; the fallback tile stands in
              until then.
            </span>
          </span>
          <span className="cosact">
            {(habit.keepsake_snippet as string | null) != null &&
            String(habit.keepsake_snippet).trim() !== ""
              ? "Edit snippet"
              : "Add snippet"}
          </span>
        </button>
      )}
    </div>
  );
}
