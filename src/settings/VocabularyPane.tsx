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
 * Rename is deliberately NOT offered on any vocab row. Rows store the STRING,
 * so a rename is an atomic bulk-update across every entry and session that
 * carries it ([[Vocab & Status]]) — real machinery that belongs with the
 * bulk-edit tier, not a text field that would silently orphan rows.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@evolu/react";
import { NonEmptyString100 } from "@evolu/common";
import { evolu } from "../db/evolu";
import { Ico } from "../shell/icons";
import { HabitIcon, hasIcon } from "../shell/habitIcons";
import { showErrorToast } from "../shell/toast";

/** The anchors, in their ruled order — matched case-insensitively. */
const ANCHORS = ["Current", "Dropped", "Finished", "Hiatus", "Planned"];
const isAnchor = (v: string) => ANCHORS.some((a) => a.toLowerCase() === v.toLowerCase());

const habitsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("habits")
    .select(["id", "key", "name", "colour_slot", "icon", "archived", "sort_order"])
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
      sort_order: (maxSort + 1) as never,
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
                    return (
                      <span className={`vrow${anchor ? " locked" : ""}`} key={String(o.id)}>
                        <span className="vval">{String(o.value)}</span>
                        {anchor ? (
                          <Ico
                            d={[
                              "M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z",
                              "M7 11V7a5 5 0 0 1 10 0v4",
                            ]}
                            size={13}
                          />
                        ) : (
                          <button className="iconbtn danger" aria-label="Remove" onClick={() => remove(o.id)}>
                            <Ico d={["M18 6 6 18", "m6 6 12 12"]} />
                          </button>
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
