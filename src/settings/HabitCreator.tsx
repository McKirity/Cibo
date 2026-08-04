/**
 * THE HABIT CREATOR — `kit-modal-habit-creator`, translated from
 * `Final/habit-creator.html` (Build step 10, slice 3).
 *
 * Progressive disclosure, NOT a wizard: one scrolling form that grows as
 * `kind` is picked — no step dots, no Next. Field order is the ruled one:
 * name → kind → sub-type → measures → the minting fields → cosmetics →
 * colour. Gates are **name + kind + unit-when-count**; icon, artwork and
 * colour never gate. Errors report inline, where caused.
 *
 * IT IS ALSO THE EDITOR (`mode="edit"`), and that half is BUILD-SIDE: the
 * corpus froze only the create face, while [[Habit Creator]] § Immutability
 * rules the edit behaviour in prose ("everything is editable until the first
 * session · kind locks once any session exists · sub-type is immutable always
 * · rename is free forever"). So the editor is the same form with locks and a
 * different write path, rather than a second drawn surface — flagged as a
 * translation decision, not a drawing.
 *
 * The model, the gates and the derivations live in habitDraft.ts; this file is
 * the surface.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@evolu/react";
import { NonEmptyString100, NonNegativeInt } from "@evolu/common";
import { evolu } from "../db/evolu";
import {
  derivedRulesToJson,
  entryAttributesToJson,
  type EntryAttribute,
} from "../db/schema";
import { Ico } from "../shell/icons";
import { HabitIcon } from "../shell/habitIcons";
import { useOverlayEsc } from "../shell/overlayHooks";
import { showErrorToast } from "../shell/toast";
import { IconPicker } from "./pickers";
import { LadderEditor } from "./LadderEditor";
import { globalLadders, globalLaddersQuery } from "./ladderStore";
import { milestoneLaddersToJson, type MilestoneLadders } from "../db/schema";
import { customSlotName, isValidHex, writeCustomColour } from "./customColours";
import {
  canCommit,
  definitionKey,
  draftProblems,
  emptyDraft,
  fromDerivedRules,
  habitKeyFrom,
  mediumCap,
  mediumLevel,
  mediumsAllowed,
  simpleFlavor,
  toDerivedRules,
  type DerivedDraft,
  type HabitDraft,
  type HabitKind,
} from "./habitDraft";
import "./creator.css";

const SLOTS = Array.from({ length: 12 }, (_, i) => `habit-${i + 1}`);

const ATTRS: { v: EntryAttribute; label: string }[] = [
  { v: "genre", label: "Genre" },
  { v: "status", label: "Status" },
  { v: "rating", label: "Rating" },
  { v: "purchased", label: "Purchased" },
  { v: "priority", label: "Priority" },
];

const TRASH = ["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"];

/**
 * THE "WHAT YOU'RE MAKING" LINES — the picks' consequences, not their
 * vocabulary (user-ruled 2026-08-02: naming the flavor explained nothing, and
 * project habits had no equivalent line; then ruled CONCISE the same day).
 *
 * Showing the derived flavor back is sanctioned — [[Habit Creator]]: "the
 * modal may SHOW the derived flavor back as plain confirmation". The term is
 * named once, then explained glossary-free per the same note's wording rule.
 * Claims are about what the user will SEE, since dashboards derive from these
 * picks.
 *
 * BOTH LINES NAME THEIR TERM (user-ruled 2026-08-02): the sub-type summary
 * says **Consumption** / **Creation**, not the radio card's own "From
 * importers" / "By hand" — which sits directly above it and so said nothing
 * twice. The stored sub-type is what the rest of the app routes on, and it is
 * immutable, so naming it here is the one place the user meets the word.
 */
const FLAVOR_COPY: Record<"measureless" | "measured" | "categorical", { title: string; body: string }> = {
  measureless: {
    title: "Measureless",
    body: "no number; logging it is the record (e.g. walking). Dashboard shows days, streaks and frequency.",
  },
  measured: {
    title: "Measured",
    body: "a number per session (e.g. embroidery, in minutes). Dashboard totals, averages and charts it.",
  },
  categorical: {
    title: "Categorical",
    body: "a label chosen at log time as well (e.g. coding, by language). Every total splits by that label.",
  },
};

const SUBTYPE_COPY: Record<"consumption" | "creation", { title: string; body: string }> = {
  consumption: {
    title: "Consumption",
    body: "entries import with covers and details (e.g. games, books, films). Gives a browsable library plus stats across it.",
  },
  creation: {
    title: "Creation",
    body: "entries you add yourself (e.g. a novel, a game). Each gets its own card, tracked start to finish.",
  },
};

export interface EditTarget {
  id: string;
  key: string;
  name: string;
  kind: HabitKind;
  subType: "consumption" | "creation" | null;
  colourSlot: string;
  icon: string | null;
  measuresTime: boolean;
  measuresCount: boolean;
  countUnit: string | null;
  maxMidnights: number | null;
  entryAttrs: EntryAttribute[];
  derivedRules: import("../db/schema").DerivedRule[];
  waveGapDays: number | null;
  ladders: import("../daily/milestones").LadderOverrides;
  /** True once ANY session exists — kind locks. */
  hasSessions: boolean;
}

export function HabitCreator({
  edit,
  takenSlots,
  takenNames,
  onClose,
  onCreated,
}: {
  /** Absent = create. */
  edit?: EditTarget;
  takenSlots: ReadonlySet<string>;
  /** Lower-cased habit names already in use, EXCLUDING the edit target's own. */
  takenNames: ReadonlySet<string>;
  onClose: () => void;
  onCreated?: (habitKey: string) => void;
}) {
  useOverlayEsc(onClose);

  // A free slot is SUGGESTED (never a gate) — the first unclaimed one, or the
  // habit's own when editing.
  const suggested = useMemo(
    () => edit?.colourSlot ?? SLOTS.find((s) => !takenSlots.has(s)) ?? SLOTS[0],
    [edit, takenSlots],
  );

  const [draft, setDraft] = useState<HabitDraft>(() =>
    edit == null
      ? emptyDraft(suggested)
      : {
          ...emptyDraft(edit.colourSlot),
          name: edit.name,
          kind: edit.kind,
          subType: edit.subType ?? "consumption",
          measuresTime: edit.measuresTime,
          measuresCount: edit.measuresCount,
          measureless: !edit.measuresTime && !edit.measuresCount && edit.kind === "simple",
          countUnit: edit.countUnit ?? "",
          maxMidnights: edit.maxMidnights ?? 1,
          entryAttrs: edit.entryAttrs,
          derived: fromDerivedRules(edit.derivedRules),
          icon: edit.icon,
          colourSlot: edit.colourSlot,
          waveGapDays: edit.waveGapDays,
          ladders: edit.ladders,
        },
  );
  const ladderRows = useQuery(globalLaddersQuery);
  const set = <K extends keyof HabitDraft>(k: K, v: HabitDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  // Existing session-level definitions, for the editor's medium pre-fill.
  const existingDefs = useQuery(
    useMemo(
      () =>
        evolu.createQuery((db) =>
          db
            .selectFrom("subunit_definitions")
            .select(["id", "habit_fk", "key", "label", "scope", "data_type"])
            .where("isDeleted", "is not", 1),
        ),
      [],
    ),
  );
  const existingVocab = useQuery(
    useMemo(
      () =>
        evolu.createQuery((db) =>
          db
            .selectFrom("vocab_options")
            .select(["id", "definition_fk", "value", "sort_order"])
            .where("isDeleted", "is not", 1)
            .orderBy("sort_order"),
        ),
      [],
    ),
  );

  // Pre-fill the mediums ONCE from the store (the editor's own rows), rather
  // than on every query tick — the user is editing them.
  const filled = useRef(false);
  useEffect(() => {
    if (edit == null || filled.current || existingDefs.length === 0) return;
    filled.current = true;
    const mine = existingDefs.filter(
      (d) => String(d.habit_fk) === edit.id && String(d.data_type) !== "flag",
    );
    if (mine.length === 0) return;
    setDraft((d) => ({
      ...d,
      mediums: mine.map((def) => ({
        id: String(def.id),
        key: String(def.key),
        name: String(def.label),
        values: existingVocab
          .filter((o) => o.definition_fk === def.id)
          .map((o) => String(o.value)),
      })),
    }));
  }, [edit, existingDefs, existingVocab]);

  const [iconAnchor, setIconAnchor] = useState<DOMRect | null>(null);
  const [colExpanded, setColExpanded] = useState(false);
  const [hex, setHex] = useState("");
  const [busy, setBusy] = useState(false);

  const problems = draftProblems(draft, takenNames);
  const ready = canCommit(problems) && !busy;
  const level = mediumLevel(draft);
  const flavor = simpleFlavor(draft);
  const isProject = draft.kind === "project";
  const isRange = draft.kind === "range";
  // Measureless is SIMPLE-ONLY — projects always declare a measure.
  const showMeasureless = draft.kind === "simple";

  // ── the write ──────────────────────────────────────────────────────────────

  const commit = async () => {
    if (!ready || draft.kind == null) return;
    setBusy(true);
    try {
      const name = draft.name.trim();
      const s100 = (v: string) => NonEmptyString100.orThrow(v);
      const rules = toDerivedRules(draft.derived);
      const attrs = isProject ? draft.entryAttrs : [];

      const shared = {
        name: s100(name),
        colour_slot: s100(draft.colourSlot),
        icon: draft.icon != null ? s100(draft.icon) : null,
        measures_time: (draft.measuresTime ? 1 : 0) as never,
        measures_count: (draft.measuresCount ? 1 : 0) as never,
        count_unit: draft.measuresCount && draft.countUnit.trim() !== "" ? s100(draft.countUnit.trim()) : null,
        range_max_midnights: isRange ? NonNegativeInt.orThrow(draft.maxMidnights) : null,
        entry_attributes: attrs.length > 0 ? entryAttributesToJson(attrs) : null,
        derived_rules: rules.length > 0 ? derivedRulesToJson(rules) : null,
        wave_gap_days: draft.waveGapDays != null ? (draft.waveGapDays as never) : null,
        milestone_ladders:
          Object.keys(draft.ladders).length > 0
            ? milestoneLaddersToJson(draft.ladders as unknown as MilestoneLadders)
            : null,
      };

      let habitId: string;
      let habitKey: string;

      if (edit != null) {
        habitKey = edit.key;
        habitId = edit.id;
        const res = evolu.update("habits", { id: edit.id as never, ...shared } as never);
        if (!res.ok) {
          console.error("creator: habit update rejected", res.error);
          showErrorToast("The habit could not be saved.");
          return;
        }
      } else {
        // The key is derived and never shown; collisions get a numeric tail.
        const base = habitKeyFrom(name);
        const used = new Set(
          (
            await evolu.loadQuery(
              evolu.createQuery((db) =>
                db.selectFrom("habits").select(["key"]).where("isDeleted", "is not", 1),
              ),
            )
          ).map((r) => String(r.key)),
        );
        habitKey = base;
        for (let i = 2; used.has(habitKey); i++) habitKey = `${base}-${i}`;

        const res = evolu.insert("habits", {
          key: s100(habitKey),
          kind: draft.kind,
          sub_type: isProject ? draft.subType : null,
          ...shared,
          keepsake_snippet: null,
          // Created habits arrive LIVE — "land on the new habit's dashboard,
          // it's loggable immediately". Only seeds arrive archived.
          archived: 0 as never,
          sort_order: nextSortOrder(draft.kind) as never,
        } as never);
        if (!res.ok) {
          console.error("creator: habit insert rejected", res.error);
          showErrorToast("The habit could not be created.");
          return;
        }
        habitId = String(res.value.id);
      }

      // Mediums → definitions + their vocab. Existing rows update; new ones
      // mint. A removed medium is tombstoned along with its options.
      const keptDefIds = new Set<string>();
      for (const m of draft.mediums) {
        const label = m.name.trim();
        if (label === "") continue;
        let defId = m.id ?? null;
        if (defId == null) {
          const dr = evolu.insert("subunit_definitions", {
            habit_fk: habitId as never,
            key: s100(definitionKey(habitKey, label)),
            label: s100(label),
            scope: level,
            data_type: "picklist",
          });
          if (!dr.ok) {
            console.error("creator: definition insert rejected", dr.error);
            showErrorToast(`"${label}" could not be saved.`);
            continue;
          }
          defId = String(dr.value.id);
        } else {
          const ur = evolu.update("subunit_definitions", {
            id: defId as never,
            label: s100(label),
          });
          if (!ur.ok) console.error("creator: definition update rejected", ur.error);
        }
        keptDefIds.add(defId);

        const already = existingVocab.filter((o) => String(o.definition_fk) === defId);
        const wanted = m.values.map((v) => v.trim()).filter((v) => v !== "");
        wanted.forEach((value, i) => {
          const hit = already.find((o) => String(o.value).toLowerCase() === value.toLowerCase());
          if (hit != null) return;
          const vr = evolu.insert("vocab_options", {
            definition_fk: defId as never,
            value: s100(value),
            sort_order: (i + 1) as never,
          });
          if (!vr.ok) console.error("creator: vocab insert rejected", vr.error);
        });
        for (const o of already) {
          if (!wanted.some((w) => w.toLowerCase() === String(o.value).toLowerCase())) {
            const dr = evolu.update("vocab_options", { id: o.id, isDeleted: 1 });
            if (!dr.ok) console.error("creator: vocab tombstone rejected", dr.error);
          }
        }
      }
      if (edit != null) {
        for (const def of existingDefs) {
          if (String(def.habit_fk) !== habitId) continue;
          if (String(def.data_type) === "flag") continue;
          if (keptDefIds.has(String(def.id))) continue;
          const dr = evolu.update("subunit_definitions", { id: def.id, isDeleted: 1 });
          if (!dr.ok) console.error("creator: definition tombstone rejected", dr.error);
        }
      }

      onCreated?.(habitKey);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  // ── the form ───────────────────────────────────────────────────────────────

  const letter = draft.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="dimlayer" onMouseDown={onClose} role="presentation">
      <div className="mo hc" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="hc-head">
          <span className="hc-title">{edit != null ? `Edit ${edit.name}` : "New habit"}</span>
          <button className="iconbtn hc-close" onClick={onClose} aria-label="Cancel">
            <Ico d={["M18 6 6 18", "m6 6 12 12"]} />
          </button>
        </div>

        <div className="hc-body">
          {/* 1 · Name */}
          <div className="fld">
            <div className="lbl">
              <span className="l">Name</span>
              <span className="req">required</span>
            </div>
            <input
              className={`tin${problems.nameTaken ? " err" : ""}`}
              value={draft.name}
              placeholder="Name your habit"
              spellCheck={false}
              autoFocus
              onChange={(e) => set("name", e.target.value)}
            />
            {problems.nameTaken && (
              <div className="err-line">
                <Ico d={["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M12 8v5", "M12 17h.01"]} />
                <span>A habit named "{draft.name.trim()}" already exists.</span>
              </div>
            )}
          </div>

          {/* 2 · Kind — the gating choice */}
          <div className="fld">
            <div className="lbl">
              <span className="l">Kind</span>
              {edit != null && edit.hasSessions && <span className="opt">locked — it has sessions</span>}
            </div>
            <div className="cardset k3">
              {(
                [
                  ["simple", "Simple", "The flexible default. Just log your sessions — nothing to catalog."],
                  ["project", "Project", "Tracks individual titles, each with its own page — games, books, writing."],
                  ["range", "Range", "A start and an end time, like sleep."],
                ] as const
              ).map(([val, title, desc]) => (
                <button
                  key={val}
                  className={`rcard${draft.kind === val ? " sel" : ""}`}
                  disabled={edit != null && edit.hasSessions && draft.kind !== val}
                  onClick={() => set("kind", val)}
                >
                  <span className="rt">{title}</span>
                  <span className="rd">{desc}</span>
                </button>
              ))}
            </div>
            {flavor != null && (
              <p className="fieldnote kindsum">
                <strong>{FLAVOR_COPY[flavor].title}</strong> — {FLAVOR_COPY[flavor].body}
              </p>
            )}
          </div>

          {/* 3 · Sub-type (project only) */}
          {isProject && (
            <div className="fld">
              <div className="lbl">
                <span className="l">Where do its entries come from?</span>
              </div>
              <div className="cardset k2">
                {(
                  [
                    ["consumption", "From importers", "Games, books, films — pulled in and organized in bulk."],
                    ["creation", "By hand", "Your own projects, entered and detailed yourself."],
                  ] as const
                ).map(([val, title, desc]) => (
                  <button
                    key={val}
                    className={`rcard${draft.subType === val ? " sel" : ""}`}
                    disabled={edit != null}
                    onClick={() => set("subType", val)}
                  >
                    <span className="rt">{title}</span>
                    <span className="rd">{desc}</span>
                  </button>
                ))}
              </div>
              <p className="fieldnote kindsum">
                <strong>{SUBTYPE_COPY[draft.subType].title}</strong> —{" "}
                {SUBTYPE_COPY[draft.subType].body}
              </p>
              <p className="fieldnote">
                <span className="immut">This can't change later.</span>
              </p>
            </div>
          )}

          {/* 4a · Measures */}
          {draft.kind != null && !isRange && (
            <div className="fld">
              <div className="lbl">
                <span className="l">What does a session capture?</span>
              </div>
              <div className="checkset">
                <button
                  className={`chk${draft.measuresTime ? " on" : ""}`}
                  onClick={() => {
                    set("measuresTime", !draft.measuresTime);
                    if (!draft.measuresTime) set("measureless", false);
                  }}
                >
                  <span className="box">{draft.measuresTime && <Ico d={["M20 6 9 17l-5-5"]} />}</span>
                  <span className="ctext">
                    <span className="cn">Time</span>
                    <span className="cs">Minutes per session, rolled up to hours at larger scales.</span>
                  </span>
                </button>
                <button
                  className={`chk${draft.measuresCount ? " on" : ""}`}
                  onClick={() => {
                    set("measuresCount", !draft.measuresCount);
                    if (!draft.measuresCount) set("measureless", false);
                  }}
                >
                  <span className="box">{draft.measuresCount && <Ico d={["M20 6 9 17l-5-5"]} />}</span>
                  <span className="ctext">
                    <span className="cn">Count</span>
                    <span className="cs">A running number — you name its unit.</span>
                  </span>
                </button>
                {draft.measuresCount && (
                  <div className="unitwrap">
                    <span className="ulbl">
                      Unit label <span className="req">required</span>
                    </span>
                    <input
                      className={`tin${problems.unitMissing ? " err" : ""}`}
                      value={draft.countUnit}
                      placeholder="e.g. words, steps, pages"
                      spellCheck={false}
                      onChange={(e) => set("countUnit", e.target.value)}
                    />
                  </div>
                )}
                {showMeasureless && (
                  <button
                    className={`chk${draft.measureless ? " on" : ""}`}
                    onClick={() => {
                      const next = !draft.measureless;
                      setDraft((d) => ({
                        ...d,
                        measureless: next,
                        measuresTime: next ? false : d.measuresTime,
                        measuresCount: next ? false : d.measuresCount,
                      }));
                    }}
                  >
                    <span className="box">{draft.measureless && <Ico d={["M20 6 9 17l-5-5"]} />}</span>
                    <span className="ctext">
                      <span className="cn">Just log it</span>
                      <span className="cs">No number — logging that it happened is the record.</span>
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 4b · Max span (range) */}
          {isRange && (
            <div className="fld">
              <div className="lbl">
                <span className="l">How long can one session run?</span>
              </div>
              <div className="spanrow">
                <span className="stepper">
                  <button
                    className="stepbtn"
                    onClick={() => set("maxMidnights", Math.max(0, draft.maxMidnights - 1))}
                  >
                    <Ico d={["M5 12h14"]} />
                  </button>
                  <span className="stepval">{draft.maxMidnights}</span>
                  <button
                    className="stepbtn"
                    onClick={() => set("maxMidnights", Math.min(7, draft.maxMidnights + 1))}
                  >
                    <Ico d={["M12 5v14", "M5 12h14"]} />
                  </button>
                </span>
                <span className="spanunit">
                  {draft.maxMidnights === 1 ? "midnight" : "midnights"} crossed
                </span>
              </div>
              <p className="fieldnote">
                A session that would cross more midnights than this is split in two. Sleep uses 1.
              </p>
            </div>
          )}

          {/* 4d · Checks & flags (range) */}
          {isRange && (
            <DerivedBuilder
              rules={draft.derived}
              onChange={(next) => set("derived", next)}
            />
          )}

          {/* 4c · Mediums */}
          {mediumsAllowed(draft) && (
            <div className="fld">
              <div className="lbl">
                <span className="l">Mediums</span>
                <span className="opt">
                  {level === "entry" ? "set once on each entry" : "picked each time you log"}
                </span>
              </div>
              <div className="medlist">
                {draft.mediums.map((m, mi) => (
                  <div className="medcard" key={mi}>
                    <div className="medhead">
                      <input
                        className="tin medname"
                        value={m.name}
                        placeholder="Medium name (e.g. Type)"
                        spellCheck={false}
                        onChange={(e) =>
                          set(
                            "mediums",
                            draft.mediums.map((x, i) => (i === mi ? { ...x, name: e.target.value } : x)),
                          )
                        }
                      />
                      <button
                        className="iconbtn danger"
                        aria-label="Remove medium"
                        onClick={() =>
                          set("mediums", draft.mediums.filter((_, i) => i !== mi))
                        }
                      >
                        <Ico d={TRASH} />
                      </button>
                    </div>
                    <div className="medvals">
                      {m.values.map((v, vi) => (
                        <span className="valchip" key={vi}>
                          {v}
                          <button
                            aria-label="Remove"
                            onClick={() =>
                              set(
                                "mediums",
                                draft.mediums.map((x, i) =>
                                  i === mi ? { ...x, values: x.values.filter((_, j) => j !== vi) } : x,
                                ),
                              )
                            }
                          >
                            <Ico d={["M18 6 6 18", "m6 6 12 12"]} />
                          </button>
                        </span>
                      ))}
                      <ValueInput
                        onAdd={(value) =>
                          set(
                            "mediums",
                            draft.mediums.map((x, i) =>
                              i === mi && !x.values.some((y) => y.toLowerCase() === value.toLowerCase())
                                ? { ...x, values: [...x.values, value] }
                                : x,
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
              {draft.mediums.length < mediumCap(draft) && (
                <button
                  className="medadd"
                  onClick={() => set("mediums", [...draft.mediums, { name: "", values: [] }])}
                >
                  <Ico d={["M12 5v14", "M5 12h14"]} /> Add a medium
                </button>
              )}
              {level === "entry" && draft.mediums.length >= 1 && (
                <p className="fieldnote">
                  An importer-fed habit carries one entry-level medium — it is the entry's Type.
                </p>
              )}
            </div>
          )}

          {/* 4c-ii · The entry attribute bundle (project) */}
          {isProject && (
            <div className="fld">
              <div className="lbl">
                <span className="l">Which vocabularies apply?</span>
                <span className="opt">tag its entries with these</span>
              </div>
              <div className="vanchor">
                {ATTRS.map((a) => {
                  const on = draft.entryAttrs.includes(a.v);
                  return (
                    <button
                      key={a.v}
                      className={`vocchip${on ? " on" : ""}`}
                      onClick={() =>
                        set(
                          "entryAttrs",
                          on ? draft.entryAttrs.filter((x) => x !== a.v) : [...draft.entryAttrs, a.v],
                        )
                      }
                    >
                      <span className="vbox">{on && <Ico d={["M20 6 9 17l-5-5"]} />}</span>
                      <span className="vlbl">{a.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="fieldnote">
                Edit each vocabulary's values in <strong>Settings › Habits › Vocabulary</strong>.
              </p>
            </div>
          )}

          {/* 5 · Icon (cosmetics — never a gate) */}
          {draft.kind != null && (
            <div className="fld">
              <div className="lbl">
                <span className="l">Icon</span>
                <span className="opt">optional</span>
              </div>
              <div className="cosrow">
                <button
                  className="cosslot"
                  onClick={(e) => setIconAnchor(e.currentTarget.getBoundingClientRect())}
                >
                  <span className="lettermark" style={{ background: `var(--${draft.colourSlot})` }}>
                    {draft.icon != null ? <HabitIcon icon={draft.icon} /> : letter}
                  </span>
                  <span className="cosmeta">
                    <span className="cosn">Icon</span>
                    <span className="coss">A lettermark stands in until you pick one.</span>
                  </span>
                  <span className="cosact">{draft.icon != null ? "Change" : "Set icon"}</span>
                </button>
              </div>
              {draft.kind !== "project" && (
                <p className="fieldnote">
                  The keepsake tile for the cover wall is added from this habit's row, once it exists.
                </p>
              )}
            </div>
          )}

          {/* 6 · Colour */}
          {draft.kind != null && (
            <div className="fld">
              <div className="lbl">
                <span className="l">Colour</span>
                <span className="opt">a free slot is suggested</span>
              </div>
              <div className="colpick">
                <div className="colsug">
                  <span className="sugsw" style={{ background: `var(--${draft.colourSlot})` }} />
                  <span className="sugmeta">
                    <span className="sn">{edit != null ? "Current" : "Suggested"}</span>
                    <span className="sh">{draft.colourSlot}</span>
                  </span>
                  <button className="btn-plain btn-sm" onClick={() => setColExpanded((v) => !v)}>
                    {colExpanded ? "Close" : "Choose another"}
                  </button>
                </div>
                {colExpanded && (
                  <div className="colgrid">
                    <div className="pk-swatches">
                      {SLOTS.map((slot) => {
                        const isTaken = takenSlots.has(slot) && slot !== draft.colourSlot;
                        return (
                          <button
                            key={slot}
                            className={`pksw${slot === draft.colourSlot ? " sel" : ""}${isTaken ? " taken" : ""}`}
                            style={{ background: `var(--${slot})` }}
                            disabled={isTaken}
                            onClick={() => set("colourSlot", slot)}
                          >
                            {isTaken && (
                              <Ico
                                className="lk"
                                d={[
                                  "M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z",
                                  "M7 11V7a5 5 0 0 1 10 0v4",
                                ]}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <div className="pk-custom">
                      <span
                        className="cs"
                        style={isValidHex(hex.trim()) ? { background: hex.trim(), borderStyle: "solid" } : undefined}
                      >
                        {!isValidHex(hex.trim()) && <Ico d={["M12 5v14", "M5 12h14"]} />}
                      </span>
                      <span className="cl">Custom</span>
                      <input
                        className="hxin"
                        value={hex}
                        placeholder="#RRGGBB"
                        spellCheck={false}
                        onChange={(e) => setHex(e.target.value)}
                      />
                      <button
                        className="btn-plain btn-sm"
                        disabled={!isValidHex(hex.trim()) || edit == null}
                        data-tip={edit == null ? "Available once the habit exists" : undefined}
                        onClick={() => {
                          if (edit == null) return;
                          void writeCustomColour(edit.key, hex.trim()).then((ok) => {
                            if (ok) set("colourSlot", customSlotName(edit.key));
                          });
                        }}
                      >
                        Use
                      </button>
                    </div>
                    <p className="colgridnote">
                      Taken slots belong to your other habits.
                      {edit == null && " A custom hex can be set from the habit's row after it exists."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Milestone ladders — EDITOR-only per-habit overrides (the wave
              gap's own rule: absent = follow the global) */}
          {edit != null && (
            <div className="fld">
              <div className="lbl">
                <span className="l">Milestone ladders</span>
                <span className="opt">overrides — blank follows the global</span>
              </div>
              <LadderEditor
                value={draft.ladders}
                onChange={(next) => set("ladders", next)}
                overrideOf={globalLadders(ladderRows)}
              />
            </div>
          )}

          {/* Wave gap — an EDITOR-only per-habit override */}
          {edit != null && (
            <div className="fld">
              <div className="lbl">
                <span className="l">Wave gap</span>
                <span className="opt">override — blank follows the global setting</span>
              </div>
              <div className="spanrow">
                <span className="stepper">
                  <button
                    className="stepbtn"
                    onClick={() =>
                      set("waveGapDays", Math.max(2, (draft.waveGapDays ?? 30) - 1))
                    }
                  >
                    <Ico d={["M5 12h14"]} />
                  </button>
                  <span className="stepval">{draft.waveGapDays ?? "—"}</span>
                  <button
                    className="stepbtn"
                    onClick={() =>
                      set("waveGapDays", Math.min(365, (draft.waveGapDays ?? 29) + 1))
                    }
                  >
                    <Ico d={["M12 5v14", "M5 12h14"]} />
                  </button>
                </span>
                <span className="spanunit">days</span>
                {draft.waveGapDays != null && (
                  <button className="btn-plain btn-sm" onClick={() => set("waveGapDays", null)}>
                    Follow global
                  </button>
                )}
              </div>
              <p className="fieldnote">
                How long a break splits one wave of activity from the next.
              </p>
            </div>
          )}

          {draft.kind != null && edit == null && (
            <p className="ceilnote">
              This creates a working habit you can log to right away, with its dashboard already
              assembled from what it tracks. Anything still to finish — a keepsake tile, an
              importer — is covered in <strong>Settings › Help</strong>.
            </p>
          )}
        </div>

        <div className="hc-foot">
          <span className="escnote">Esc to cancel</span>
          <div className="foot-actions">
            <button className="btn-plain" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-accent" aria-disabled={!ready} onClick={() => void commit()}>
              <Ico d={["M20 6 9 17l-5-5"]} />
              {edit != null ? "Save changes" : "Create habit"}
            </button>
          </div>
        </div>
      </div>

      {iconAnchor != null && (
        <IconPicker
          current={draft.icon}
          anchor={iconAnchor}
          onPick={(name) => {
            set("icon", name);
            setIconAnchor(null);
          }}
          onClose={() => setIconAnchor(null)}
        />
      )}
    </div>
  );
}

/** New habits sort to the END of their own partition (Projects above Daily). */
function nextSortOrder(_kind: HabitKind): number {
  // The partition is enforced by the rail's own grouping; a large tail value
  // keeps a new habit last within its group without renumbering anything.
  return Date.now() % 100000;
}

function ValueInput({ onAdd }: { onAdd: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <input
      className="valin"
      value={v}
      placeholder="Add value…"
      spellCheck={false}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && v.trim() !== "") {
          onAdd(v.trim());
          setV("");
        }
      }}
    />
  );
}

// ── the checks & flags builder (range) ───────────────────────────────────────

const DTYPE: Record<DerivedDraft["type"], string> = {
  time: "Time-of-day",
  duration: "Duration",
  flag: "Bundled flag",
};

function defaultRule(t: DerivedDraft["type"]): DerivedDraft {
  if (t === "time") return { type: "time", name: "", endpoint: "end", dir: "before", time: "22:00" };
  if (t === "duration") return { type: "duration", name: "", cmp: "atleast", hours: "8" };
  return { type: "flag", name: "", measure: "measureless", unit: "" };
}

function DerivedBuilder({
  rules,
  onChange,
}: {
  rules: DerivedDraft[];
  onChange: (next: DerivedDraft[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const patch = (i: number, p: Partial<DerivedDraft>) =>
    onChange(rules.map((r, j) => (j === i ? ({ ...r, ...p } as DerivedDraft) : r)));

  return (
    <div className="fld">
      <div className="lbl">
        <span className="l">Checks &amp; flags</span>
        <span className="opt">computed from the times — optional</span>
      </div>
      <div className="derlist">
        {rules.map((d, i) => (
          <div className="dercard" key={i}>
            <div className="derhead">
              <span className="dertype">{DTYPE[d.type]}</span>
              <input
                className="tin dername"
                value={d.name}
                placeholder="Name this subunit"
                spellCheck={false}
                onChange={(e) => patch(i, { name: e.target.value })}
              />
              <button
                className="iconbtn danger"
                aria-label="Remove"
                onClick={() => onChange(rules.filter((_, j) => j !== i))}
              >
                <Ico d={TRASH} />
              </button>
            </div>
            {d.type === "time" && (
              <div className="derrule">
                <select
                  className="dsel"
                  value={d.endpoint}
                  onChange={(e) => patch(i, { endpoint: e.target.value as "start" | "end" })}
                >
                  <option value="start">Start time</option>
                  <option value="end">End time</option>
                </select>
                <span className="rword">is</span>
                <select
                  className="dsel"
                  value={d.dir}
                  onChange={(e) => patch(i, { dir: e.target.value as "before" | "after" })}
                >
                  <option value="before">before</option>
                  <option value="after">after</option>
                </select>
                <input
                  className="dval"
                  value={d.time}
                  placeholder="22:00"
                  maxLength={5}
                  onChange={(e) => patch(i, { time: e.target.value })}
                />
                <span className="rword">(24h)</span>
              </div>
            )}
            {d.type === "duration" && (
              <div className="derrule">
                <span className="rword">span is</span>
                <select
                  className="dsel"
                  value={d.cmp}
                  onChange={(e) => patch(i, { cmp: e.target.value as "atleast" | "atmost" })}
                >
                  <option value="atleast">at least</option>
                  <option value="atmost">at most</option>
                </select>
                <input
                  className="dval"
                  type="number"
                  min="0"
                  step="0.5"
                  value={d.hours}
                  onChange={(e) => patch(i, { hours: e.target.value })}
                />
                <span className="rword">hours</span>
              </div>
            )}
            {d.type === "flag" && (
              <div className="derrule">
                <span className="rword">a plain logged flag</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="dermenu">
        <button className="deradd" onClick={() => setOpen((o) => !o)}>
          <Ico d={["M12 5v14", "M5 12h14"]} /> Add a subunit
        </button>
        {open && (
          <div className="pop">
            {(
              [
                ["time", "Time-of-day check", "Was an endpoint before or after a set time — “out of bed before 12pm”."],
                ["duration", "Duration check", "Did the span meet a target — “at least 8 hours of sleep”."],
                ["flag", "Bundled flag", "A plain logged flag riding along, simple-habit style."],
              ] as const
            ).map(([t, title, desc]) => (
              <button
                key={t}
                className="opt"
                onClick={() => {
                  onChange([...rules, defaultRule(t)]);
                  setOpen(false);
                }}
              >
                <span className="ot">{title}</span>
                <span className="od">{desc}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
