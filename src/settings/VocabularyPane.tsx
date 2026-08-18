/**
 * SETTINGS → HABITS → VOCABULARY (Build step 10, slice 4).
 *
 * The 2026-07-12 re-cut, adopted as drawn: this tab holds the ENTRY-GLOBAL
 * tier — the one global `status` list · the fixed Rating and Priority scales
 * as read-only reference · the per-habit ENTRY-LEVEL Mediums (Type / Genre).
 * **Habit-specific SESSION-level subunits live in Manage's disclosures**, which
 * slice 2 built, so they are deliberately absent here.
 *
 * SHAPE — MASTER/DETAIL, user-ruled 2026-08-03. The frozen face lists every
 * vocabulary's values as one flat chip wrap, which was right for a mockup
 * holding six values per list and unusable for the real thing: **Calibre tags
 * and AO3 fandoms auto-add to Reading's genre list** (step 8's `vocabAdd`), so
 * that one list alone can run to hundreds. The roster/detail split is not an
 * invention — it is `kit-viewer-manual`'s own shape, a door-list at
 * `--settings-pane-w` beside a content surface, inside this same settings
 * pane. Reused wholesale, including the class names, so the two stay one
 * anatomy.
 *
 * THE FIVE SEEDED STATUSES ARE IMMUTABLE ANCHORS (user-ruled 2026-07-22):
 * Current · Dropped · Finished · Hiatus · Planned are never renamed or
 * removed, because derived semantics key off those exact strings. They render
 * locked; add/remove applies to user-added statuses only.
 *
 * RENAME IS LIVE (2026-08-06, user-ruled at the Phase-2 completion audit,
 * finding detailed-design-7 — superseding this header's earlier "deliberately
 * NOT offered" call). Rows store the STRING, so rename is the ruled ATOMIC
 * BULK-UPDATE ([[Vocab & Status]] § Storage & edit semantics: "the set value +
 * every referencing row in one transaction — renames never orphan"): the
 * referencing rows are collected and every branded value validated FIRST, then
 * the vocab_options row plus every reference update is issued in ONE
 * synchronous tick, which Evolu batches into a single microtask transaction;
 * every mutation Result is checked (the coding-migration lesson — unchecked
 * Results drop silently). Reference sweep by the definition's level:
 * global status (definition_fk null) → `entries.status` · entry-level →
 * whichever entry column **`db/entryMedium.ts`** names, `genre` decoding and
 * re-encoding the JSON list (only rows carrying the old value) and the rest
 * updating in place · session-level definitions → `subunit_values` (the branch
 * is machinery-complete though this pane rosters only the entry tier).
 * Anchors get NO rename affordance; a case-insensitive collision with a
 * sibling is refused with the pane's error idiom, while re-casing a value
 * onto itself stays legal (a casing fix).
 *
 * THE COLUMN IS ASKED, NEVER GUESSED (bug `vocab-1`, 2026-08-09). This read the
 * column off the definition's KEY SUFFIX until then — a rule that fitted all
 * eleven seeded habits and none of the ones a user makes, since keys are minted
 * `<habitKey>_<label-slug>`: a consumption medium labelled "Format" renamed its
 * picklist and left every entry holding the old string, with nothing to say so.
 * The library and the Data Doctor had both always derived it from `sub_type` +
 * `data_type`; that derivation is now one function all three call, and a column
 * this pane cannot name aborts the rename instead of half-applying it.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@evolu/react";
import { FiniteNumber, NonEmptyString100, NonEmptyString1000 } from "@evolu/common";
import { evolu } from "../db/evolu";
import { stringListFromJson, stringListToJson } from "../db/schema";
import { entryMediumColumn } from "../db/entryMedium";
import { Ico, ICONS } from "../shell/icons";
import { HabitIcon, hasIcon } from "../shell/habitIcons";
import { showErrorToast } from "../shell/toast";

/** The anchors, in their ruled order — matched case-insensitively. */
const ANCHORS = ["Current", "Dropped", "Finished", "Hiatus", "Planned"];
const isAnchor = (v: string) => ANCHORS.some((a) => a.toLowerCase() === v.toLowerCase());

const habitsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("habits")
    // `sub_type` is read by the rename: it is half of what names the entry
    // column a medium's values live in (db/entryMedium.ts).
    .select(["id", "key", "name", "colour_slot", "icon", "archived", "sort_order", "sub_type"])
    .where("isDeleted", "is not", 1)
    .orderBy("sort_order"),
);

const defsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("subunit_definitions")
    .select(["id", "habit_fk", "key", "label", "scope", "data_type"])
    .where("scope", "=", "entry" as never)
    .where("isDeleted", "is not", 1),
);

const vocabQuery = evolu.createQuery((db) =>
  db
    .selectFrom("vocab_options")
    .select(["id", "definition_fk", "value", "sort_order"])
    .where("isDeleted", "is not", 1)
    .orderBy("sort_order"),
);

/** One entry in the roster. `defId` null = the global status list. */
interface VocabList {
  id: string;
  defId: string | null;
  label: string;
  group: string;
  /** Read-only reference scales carry their values inline and no editing. */
  fixed?: string[];
  colourSlot?: string;
  icon?: string | null;
  archived?: boolean;
}

export function VocabularyPane() {
  const habits = useQuery(habitsQuery);
  const defs = useQuery(defsQuery);
  const vocab = useQuery(vocabQuery);
  const [selected, setSelected] = useState<string>("status");
  const [q, setQ] = useState("");
  /** The vocab row currently under inline rename, by option id. */
  const [editing, setEditing] = useState<string | null>(null);

  const lists = useMemo<VocabList[]>(() => {
    const out: VocabList[] = [
      { id: "status", defId: null, label: "Status", group: "Shared" },
      { id: "rating", defId: null, label: "Rating", group: "Shared", fixed: ["★", "★★", "★★★", "★★★★", "★★★★★"] },
      { id: "priority", defId: null, label: "Priority", group: "Shared", fixed: ["0", "1", "2", "3"] },
    ];
    for (const h of habits) {
      for (const d of defs.filter((x) => x.habit_fk === h.id)) {
        out.push({
          id: String(d.id),
          defId: String(d.id),
          label: String(d.label),
          group: String(h.name ?? "—"),
          colourSlot: String(h.colour_slot ?? "habit-1"),
          icon: (h.icon as string | null) ?? null,
          archived: h.archived === 1,
        });
      }
    }
    return out;
  }, [habits, defs]);

  const current = lists.find((l) => l.id === selected) ?? lists[0];

  const values = useMemo(() => {
    if (current == null || current.fixed != null) return [];
    const rows =
      current.id === "status"
        ? vocab.filter((o) => o.definition_fk == null)
        : vocab.filter((o) => String(o.definition_fk) === current.defId);
    // Anchors first for status, as the dashboards render them; everything else
    // in its stored order.
    const ordered =
      current.id === "status"
        ? [
            ...ANCHORS.map((a) => rows.find((s) => String(s.value).toLowerCase() === a.toLowerCase())).filter(
              (x): x is (typeof rows)[number] => x != null,
            ),
            ...rows.filter((s) => !isAnchor(String(s.value))),
          ]
        : rows;
    const needle = q.trim().toLowerCase();
    return needle === "" ? ordered : ordered.filter((o) => String(o.value).toLowerCase().includes(needle));
  }, [current, vocab, q]);

  const total =
    current == null
      ? 0
      : current.fixed != null
        ? current.fixed.length
        : current.id === "status"
          ? vocab.filter((o) => o.definition_fk == null).length
          : vocab.filter((o) => String(o.definition_fk) === current.defId).length;

  const countFor = (l: VocabList): number =>
    l.fixed != null
      ? l.fixed.length
      : l.id === "status"
        ? vocab.filter((o) => o.definition_fk == null).length
        : vocab.filter((o) => String(o.definition_fk) === l.defId).length;

  const add = (value: string) => {
    if (current == null || current.fixed != null) return;
    const v = value.trim();
    if (v === "") return;
    const defId = current.id === "status" ? null : current.defId;
    const siblings = vocab.filter((o) =>
      defId == null ? o.definition_fk == null : String(o.definition_fk) === defId,
    );
    if (siblings.some((o) => String(o.value).toLowerCase() === v.toLowerCase())) return;
    const maxSort = siblings.reduce((a, o) => Math.max(a, (o.sort_order as number) ?? 0), 0);
    const res = evolu.insert("vocab_options", {
      definition_fk: (defId ?? null) as never,
      value: NonEmptyString100.orThrow(v),
      sort_order: FiniteNumber.orThrow(maxSort + 1),
    });
    if (!res.ok) {
      console.error("vocab: insert rejected", res.error);
      showErrorToast("The value could not be added.");
    }
  };

  const remove = (id: unknown) => {
    const res = evolu.update("vocab_options", { id: id as never, isDeleted: 1 });
    if (!res.ok) {
      console.error("vocab: tombstone rejected", res.error);
      showErrorToast("The value could not be removed.");
    }
  };

  /**
   * The ruled atomic bulk-update. Returns true when the editor may close
   * (committed, or a no-op); false keeps it open (refused / failed).
   *
   * PLAN, then FIRE: every referencing row is collected (async) and every
   * branded value validated BEFORE the first mutation goes out, so the updates
   * all issue in one synchronous tick — Evolu batches same-tick mutations into
   * ONE microtask transaction, which is what "renames never orphan" requires.
   * A validation throw during planning aborts with ZERO writes issued.
   */
  const rename = async (
    list: VocabList,
    optId: string,
    oldValue: string,
    nextRaw: string,
  ): Promise<boolean> => {
    const next = nextRaw.trim();
    if (next === "" || next === oldValue) return true; // nothing to do
    // Belt over the UI's braces — anchors never reach here (no affordance).
    if (list.id === "status" && isAnchor(oldValue)) return false;
    const defId = list.id === "status" ? null : list.defId;
    // Case-insensitive sibling collision is refused; the row ITSELF is
    // excluded, so re-casing a value onto itself stays legal (a casing fix).
    const siblings = vocab.filter(
      (o) =>
        (defId == null ? o.definition_fk == null : String(o.definition_fk) === defId) &&
        String(o.id) !== optId,
    );
    if (siblings.some((o) => String(o.value).toLowerCase() === next.toLowerCase())) {
      showErrorToast(`"${next}" is already in this list.`);
      return false;
    }

    try {
      const v100 = NonEmptyString100.orThrow(next);
      const plans: (() => { ok: boolean })[] = [
        () => evolu.update("vocab_options", { id: optId as never, value: v100 }),
      ];

      if (defId == null) {
        // The ONE global status list → entries.status stores the string.
        const rows = await evolu.loadQuery(
          evolu.createQuery((db) =>
            db
              .selectFrom("entries")
              .select(["id"])
              .where("status", "=", oldValue as never)
              .where("isDeleted", "is not", 1),
          ),
        );
        for (const r of rows) plans.push(() => evolu.update("entries", { id: r.id as never, status: v100 }));
      } else {
        const def = defs.find((d) => String(d.id) === defId);
        if (def == null) throw new Error(`definition ${defId} not found`);
        const key = String(def.key);
        // WHICH COLUMN the referencing rows live in — asked of the one owner
        // (db/entryMedium.ts), never guessed from the key. Guessing is what
        // bug `vocab-1` was: it matched every seeded habit and missed every
        // habit the user creates, renaming the picklist and orphaning the rows.
        const habit = habits.find((h) => String(h.id) === String(def.habit_fk));
        const column = entryMediumColumn(
          habit?.sub_type == null ? null : String(habit.sub_type),
          String(def.data_type),
          key,
        );
        if (String(def.scope) === "session") {
          // Session-level → one subunit_values row per answering bout.
          const v1000 = NonEmptyString1000.orThrow(next);
          const rows = await evolu.loadQuery(
            evolu.createQuery((db) =>
              db
                .selectFrom("subunit_values")
                .select(["id"])
                .where("definition_fk", "=", def.id as never)
                .where("value", "=", oldValue as never)
                .where("isDeleted", "is not", 1),
            ),
          );
          for (const r of rows)
            plans.push(() => evolu.update("subunit_values", { id: r.id as never, value: v1000 }));
        } else if (column === "genre") {
          // Entry-level genre → the entries.genre JSON list: decode, swap the
          // element, re-encode — only rows that carry the old value.
          const rows = await evolu.loadQuery(
            evolu.createQuery((db) =>
              db
                .selectFrom("entries")
                .select(["id", "genre"])
                .where("habit_fk", "=", def.habit_fk as never)
                .where("genre", "is not", null)
                .where("isDeleted", "is not", 1),
            ),
          );
          for (const r of rows) {
            let stored: string[];
            try {
              stored = [...(stringListFromJson(r.genre as never) as readonly string[])];
            } catch {
              continue; // a malformed cell is the doctor's finding, not the rename's
            }
            if (!stored.includes(oldValue)) continue;
            // Swap, then dedupe case-insensitively keeping first-seen order —
            // the list may already carry the target value.
            const seen = new Set<string>();
            const swapped: string[] = [];
            for (const g of stored.map((g) => (g === oldValue ? next : g))) {
              const k = g.toLowerCase();
              if (seen.has(k)) continue;
              seen.add(k);
              swapped.push(g);
            }
            const encoded = stringListToJson(swapped.map((g) => NonEmptyString1000.orThrow(g)));
            plans.push(() => evolu.update("entries", { id: r.id as never, genre: encoded }));
          }
        } else {
          // Entry-level single-value mediums live on their own entry columns:
          // type (consumption) · fandom / gamedev_engine (creation).
          //
          // A column we cannot name is a REFUSAL, not a no-op. Falling through
          // silently is precisely the shape of `vocab-1`: the vocab row renames
          // and the rows it governs keep the old string, which no surface
          // reports as a rename failure. Throwing here aborts inside the
          // plan-then-fire contract, so ZERO writes have been issued.
          if (column == null)
            throw new Error(
              `no entry column for definition ${key} (sub_type ${String(habit?.sub_type)}, ` +
                `data_type ${String(def.data_type)}) — refusing a rename that would orphan its rows`,
            );
          const rows = await evolu.loadQuery(
            evolu.createQuery((db) =>
              db
                .selectFrom("entries")
                .select(["id"])
                .where("habit_fk", "=", def.habit_fk as never)
                .where(column, "=", oldValue as never)
                .where("isDeleted", "is not", 1),
            ),
          );
          for (const r of rows) {
            const patch: Record<string, unknown> = { id: r.id, [column]: v100 };
            plans.push(() => evolu.update("entries", patch as never));
          }
        }
      }

      // ONE tick: fire everything, then check EVERY Result — an unchecked
      // Evolu Result drops silently (the coding-migration lesson).
      const results = plans.map((p) => p());
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        console.error(
          `vocab rename "${oldValue}" → "${next}": ${failed.length}/${results.length} updates rejected`,
          failed,
        );
        showErrorToast("The rename could not be applied.");
        return false;
      }
      return true;
    } catch (e) {
      console.error(`vocab rename "${oldValue}" → "${next}" aborted before any write`, e);
      showErrorToast("The rename could not be applied.");
      return false;
    }
  };

  // The roster, grouped — "Shared" first, then one group per habit that owns
  // an entry-level medium.
  const groups: { name: string; rows: VocabList[] }[] = [];
  for (const l of lists) {
    const g = groups.find((x) => x.name === l.group);
    if (g != null) g.rows.push(l);
    else groups.push({ name: l.group, rows: [l] });
  }

  return (
    <div className="manual vocab">
      <aside className="mroster">
        <nav className="mtoc">
          {groups.map((g) => {
            const head = g.rows[0];
            return (
              <div key={g.name}>
                <div className="mgrp">
                  {head.colourSlot != null && (
                    <span className="vsw" style={{ background: `var(--${head.colourSlot})` }}>
                      {hasIcon(head.icon) ? (
                        <HabitIcon icon={head.icon} />
                      ) : (
                        g.name[0]?.toUpperCase()
                      )}
                    </span>
                  )}
                  {g.name}
                  {head.archived === true && <span className="mgtag">archived</span>}
                </div>
                {g.rows.map((l) => (
                  <button
                    key={l.id}
                    className={`mdoc${l.id === selected ? " active" : ""}`}
                    onClick={() => {
                      setSelected(l.id);
                      setQ("");
                      setEditing(null);
                    }}
                  >
                    <span className="mt">{l.label}</span>
                    <span className="vcount">{countFor(l)}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <p className="mtoc-note">
          Values picked per session — boards, stages, languages — live on the habit's row under{" "}
          <strong>Manage</strong>.
        </p>
      </aside>

      <section className="mread vread">
        {current != null && (
          <>
            <div className="vhead">
              <h3 className="vtitle">
                {current.group !== "Shared" && <span className="vowner">{current.group} · </span>}
                {current.label}
              </h3>
              <span className="vtally">
                {total} value{total === 1 ? "" : "s"}
              </span>
              {current.fixed == null && total > 12 && (
                <input
                  className="keyin vsearch"
                  value={q}
                  placeholder="Filter…"
                  spellCheck={false}
                  onChange={(e) => setQ(e.target.value)}
                />
              )}
            </div>

            {current.fixed != null ? (
              <>
                <div className="vlist">
                  {current.fixed.map((v) => (
                    <span className="vrow" key={v}>
                      <span className="vval">{v}</span>
                    </span>
                  ))}
                </div>
                <p className="mtoc-note">A fixed scale — its values never change.</p>
              </>
            ) : (
              <>
                <div className="vlist">
                  {values.map((o) => {
                    const anchor = current.id === "status" && isAnchor(String(o.value));
                    const editingThis = !anchor && editing === String(o.id);
                    return (
                      <span className={`vrow${anchor ? " locked" : ""}`} key={String(o.id)}>
                        {editingThis ? (
                          <RenameValue
                            initial={String(o.value)}
                            onCancel={() => setEditing(null)}
                            onCommit={async (next) => {
                              const ok = await rename(current, String(o.id), String(o.value), next);
                              if (ok) setEditing(null);
                            }}
                          />
                        ) : (
                          <span className="vval">{String(o.value)}</span>
                        )}
                        {anchor ? (
                          <Ico
                            d={[
                              "M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z",
                              "M7 11V7a5 5 0 0 1 10 0v4",
                            ]}
                            size={13}
                          />
                        ) : editingThis ? null : (
                          <>
                            <button
                              className="iconbtn"
                              aria-label="Rename"
                              onClick={() => setEditing(String(o.id))}
                            >
                              <Ico d={ICONS.edit} />
                            </button>
                            <button className="iconbtn danger" aria-label="Remove" onClick={() => remove(o.id)}>
                              <Ico d={ICONS.close} />
                            </button>
                          </>
                        )}
                      </span>
                    );
                  })}
                  {values.length === 0 && (
                    <span className="subnone">
                      {q.trim() === "" ? "No values yet." : `Nothing matches "${q.trim()}".`}
                    </span>
                  )}
                </div>
                <AddValue onAdd={add} />
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/**
 * The inline rename input — mounted in the vval slot of the row it edits.
 * Enter commits, Esc cancels, blur cancels (commit is deliberate-only; the
 * refusal toast keeps the editor open so the collision can be fixed in place).
 */
function RenameValue({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (next: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <input
      className="keyin vedit"
      value={v}
      autoFocus
      maxLength={100}
      spellCheck={false}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          void onCommit(v);
        } else if (e.key === "Escape") {
          // Contained — Settings is a screen, but Esc must not reach any
          // overlay/top-layer handler while it means "cancel this input".
          e.stopPropagation();
          onCancel();
        }
      }}
      onBlur={onCancel}
    />
  );
}

function AddValue({ onAdd }: { onAdd: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="vadd">
      <input
        className="keyin"
        value={v}
        placeholder="Add a value…"
        spellCheck={false}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && v.trim() !== "") {
            onAdd(v);
            setV("");
          }
        }}
      />
      <button
        className="btn-plain btn-sm"
        disabled={v.trim() === ""}
        onClick={() => {
          onAdd(v);
          setV("");
        }}
      >
        Add
      </button>
    </div>
  );
}
