/**
 * Build step 6 catch-up — the BULK-EDIT MODAL (`kit-modal-bulk-edit` on
 * `kit-shell-overlay`), translated from the frozen `Final/bulk-edit-modal.html`.
 *
 * SELECTION LIVES INSIDE — the library's Bulk edit button is the door only;
 * the entry set is built here. The cover-grid picker dominates (~75%, 7
 * columns); its covers are NOT doors (the app's one non-navigating entry
 * surface) — click toggles a check + the heavy accent border. Tier-3 search +
 * quick filters narrow the grid; Select all HONORS the filters; a live count
 * follows the grid (the title, APPLY, the delete button and the confirm all
 * speak it).
 *
 * The six-field rail: every field defaults "no change"; genre is ADD/REMOVE
 * lanes (never blind replace); APPLY carries no confirm and no undo (ruled —
 * non-destructive + re-editable). The danger foot opens the STACKED
 * count-carrying confirm — the one sanctioned overlay-atop-a-modal: a second
 * dim atop the first, Esc/Cancel/dim-click close the TOP overlay only, and the
 * counts follow the live selection (entries · summed sessions · image files).
 * No type-to-confirm, no hold, no armed delay (user-ruled).
 */
import { useMemo, useState } from "react";
import { NonEmptyString100, NonEmptyString1000, NonNegativeInt, PositiveInt } from "@evolu/common";
import { evolu } from "../db/evolu";
import { stringListToJson, type EntryId } from "../db/schema";
import { showErrorToast } from "../shell/toast";
import { DangerConfirm } from "../shell/DangerConfirm";
import type { BulkFieldState, LibEntry, LibraryViewState, PickerSortKey } from "./librarySpec";
import {
  DEFAULT_VIEW_STATE,
  EMPTY_BULK_STATE,
  applyGenreLanes,
  bulkBlastRadius,
  bulkHasChanges,
  filterEntries,
  genreFilterOptions,
  sortPickerRows,
} from "./librarySpec";
import { isFilterActive } from "./librarySpec";
import { stars } from "../metrics/format";
import { useLibraryData, type LibraryData } from "./useLibraryData";
import { useOverlayEsc } from "../shell/overlayHooks";
import { CoverArt, Ico, ICON, Menu, PrioGlyph, StatusPill, type MenuItem } from "./bits";
import { deleteEntriesCascade } from "./entryDelete";

const PICKER_SORT_LABELS: Record<PickerSortKey, string> = {
  title: "Title",
  status: "Status",
  rating: "Rating",
  priority: "Priority",
  type: "Type",
  genre: "Genre",
  own: "Owned",
};

export function BulkEditModal({
  habitKey,
  onClose,
  data: dataProp,
}: {
  habitKey: string;
  onClose: () => void;
  /** The Library passes its hook result down (no second fetch+aggregation
   * beside the screen's); optional so a standalone mount still works. */
  data?: LibraryData;
}) {
  // Hook rules: the fallback hook is called UNCONDITIONALLY and the prop's
  // value wins when present (Evolu dedupes the identical underlying queries).
  // `dataProp != null` skips the derivation, not the subscription — the hook
  // must still be called unconditionally.
  const ownData = useLibraryData(habitKey, dataProp != null);
  const data = dataProp ?? ownData;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  // The picker carries the library toolbar's FULL filter set (user-ruled
  // 2026-07-27 — the FINAL drew Status + Type only). Transient, never
  // persisted — narrowing a pick is not a view choice.
  const [pf, setPf] = useState<LibraryViewState>(DEFAULT_VIEW_STATE);
  // The table's sort (the v3 exhibit ruling): header click sorts, second
  // click flips; status sorts by lifecycle order.
  const [sortKey, setSortKey] = useState<PickerSortKey | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [fields, setFields] = useState<BulkFieldState>(EMPTY_BULK_STATE);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Esc closes the modal via the shared overlay stack. No `!confirmOpen`
  // guard needed anymore: the stacked DangerConfirm registers LATER (it
  // mounts while this modal is up), so it is the top of the stack and one
  // Esc pops the confirm alone; the next Esc reaches this entry.
  useOverlayEsc(onClose);

  const visible = useMemo(
    () => sortPickerRows(filterEntries(data.entries, { search, state: pf }), sortKey, sortDir),
    [data.entries, search, pf, sortKey, sortDir],
  );
  const setSort = (key: PickerSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  };
  const genreOptions = useMemo(
    () => genreFilterOptions(data.entries, data.genreVocab),
    [data.entries, data.genreVocab],
  );
  const hasType = data.typeVocab.length > 0;

  const selectedEntries = useMemo(
    () => data.entries.filter((e) => selected.has(e.id)),
    [data.entries, selected],
  );
  const n = selectedEntries.length;
  const radius = useMemo(() => bulkBlastRadius(selectedEntries), [selectedEntries]);
  const canApply = n > 0 && bulkHasChanges(fields);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const apply = () => {
    let failures = 0;
    for (const e of selectedEntries) {
      try {
        const genreNext =
          fields.genreAdd.length > 0 || fields.genreRemove.length > 0
            ? applyGenreLanes(e.genre, fields.genreAdd, fields.genreRemove)
            : null;
        const patch: Record<string, unknown> = {};
        if (fields.status !== undefined) patch.status = NonEmptyString100.orThrow(fields.status);
        if (fields.priority !== undefined) patch.priority = NonNegativeInt.orThrow(fields.priority);
        if (fields.type !== undefined) patch.type = NonEmptyString100.orThrow(fields.type);
        if (fields.purchased !== undefined) patch.purchased = fields.purchased ? 1 : 0;
        if (fields.rating !== undefined)
          patch.rating = fields.rating == null ? null : PositiveInt.orThrow(fields.rating);
        if (genreNext != null)
          patch.genre = stringListToJson(genreNext.map((x) => NonEmptyString1000.orThrow(x)));
        if (Object.keys(patch).length === 0) continue;
        const r = evolu.update("entries", { id: e.id as EntryId, ...patch } as never);
        if (!r.ok) {
          console.error("Bulk apply rejected", r.error);
          failures++;
        }
      } catch (ex) {
        console.error("Bulk apply failed", ex);
        failures++;
      }
    }
    if (failures > 0) showErrorToast(`Bulk edit: ${failures} of ${n} updates were rejected.`);
    // Re-editable by design: the selection stays, the field rail resets.
    setFields(EMPTY_BULK_STATE);
  };

  const doDelete = async () => {
    const ids = selectedEntries.map((e) => e.id);
    setConfirmOpen(false);
    const res = await deleteEntriesCascade(ids, "permanent");
    if (!res.ok) showErrorToast("Bulk delete: some rows were rejected — check the error log.");
    setSelected(new Set());
  };

  if (!data.ready) return null;

  return (
    <div
      className="dimlayer"
      onMouseDown={() => {
        if (!confirmOpen) onClose();
      }}
      role="presentation"
    >
      <div className="mo mo2" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="mo-head">
          <span className="mo-title">
            Bulk edit — <b>{n} selected</b>
          </span>
          <div className="mo-esc">
            <span className="escnote">Esc closes · confirms may stack</span>
            <button className="mo-close" aria-label="Close" onClick={onClose}>
              <Ico d={ICON.close} />
            </button>
          </div>
        </div>

        {/* body: picker (dominant) + field rail */}
        <div className="mb-body">
          {/* the cover-grid picker */}
          <div className="picker2">
            <div className="ptop">
              <div className="psearch">
                <Ico d={ICON.search} size={14} />
                <input
                  type="text"
                  value={search}
                  placeholder="Search title or creator…"
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {/* the explicit Sort chip (user-asked) — the same state the column
                  headers drive; picking a key sorts ascending, the headers flip */}
              <BfChip
                k="Sort"
                value={
                  sortKey == null
                    ? "—"
                    : `${PICKER_SORT_LABELS[sortKey]}${sortDir === -1 ? " ↑" : ""}`
                }
                active={false}
                items={[
                  {
                    key: "",
                    label: "None (as filtered)",
                    selected: sortKey == null,
                    onPick: () => setSortKey(null),
                  },
                  ...(
                    ["title", "status", "rating", "priority", "type", "genre", "own"] as PickerSortKey[]
                  )
                    .filter((k) => k !== "type" || hasType)
                    .map((k) => ({
                      key: k,
                      label: PICKER_SORT_LABELS[k],
                      selected: sortKey === k,
                      onPick: () => {
                        setSortKey(k);
                        setSortDir(1);
                      },
                    })),
                ]}
              />
              {/* the library toolbar's full filter set (user-ruled 2026-07-27) */}
              <BfChip
                k="Status"
                value={pf.status ?? "All"}
                active={pf.status != null}
                items={[
                  { key: "", label: "All", selected: pf.status == null, onPick: () => setPf((s) => ({ ...s, status: null })) },
                  ...data.statusVocab.map((v) => ({
                    key: v,
                    label: v,
                    selected: pf.status === v,
                    onPick: () => setPf((s) => ({ ...s, status: v })),
                  })),
                ]}
              />
              {/* Type is ABSENT (not dashed) where no type is declared —
                  user-ruled 2026-07-27, overriding the drawn delta face. */}
              {hasType && (
                <BfChip
                  k="Type"
                  value={pf.type ?? "All"}
                  active={pf.type != null}
                  items={[
                    { key: "", label: "All", selected: pf.type == null, onPick: () => setPf((s) => ({ ...s, type: null })) },
                    ...data.typeVocab.map((v) => ({
                      key: v,
                      label: v,
                      selected: pf.type === v,
                      onPick: () => setPf((s) => ({ ...s, type: v })),
                    })),
                  ]}
                />
              )}
              <BfChip
                k="Genre"
                value={pf.genre ?? "All"}
                active={pf.genre != null}
                items={[
                  { key: "", label: "All", selected: pf.genre == null, onPick: () => setPf((s) => ({ ...s, genre: null })) },
                  ...genreOptions.map((g) => ({
                    key: g.value,
                    label: g.label,
                    selected: pf.genre === g.value,
                    onPick: () => setPf((s) => ({ ...s, genre: g.value })),
                  })),
                ]}
              />
              <BfChip
                k="Priority"
                value={pf.priority == null ? "All" : String(pf.priority)}
                active={pf.priority != null}
                items={[
                  { key: "", label: "All", selected: pf.priority == null, onPick: () => setPf((s) => ({ ...s, priority: null })) },
                  ...[0, 1, 2, 3].map((p) => ({
                    key: String(p),
                    label: p === 0 ? "None (0)" : String(p),
                    selected: pf.priority === p,
                    onPick: () => setPf((s) => ({ ...s, priority: p })),
                  })),
                ]}
              />
              <BfChip
                k="Rating"
                value={pf.rating == null ? "All" : pf.rating === "none" ? "Unrated" : stars(pf.rating)}
                active={pf.rating != null}
                items={[
                  { key: "", label: "All", selected: pf.rating == null, onPick: () => setPf((s) => ({ ...s, rating: null })) },
                  ...[5, 4, 3, 2, 1].map((r) => ({
                    key: String(r),
                    label: stars(r),
                    selected: pf.rating === r,
                    onPick: () => setPf((s) => ({ ...s, rating: r })),
                  })),
                  {
                    key: "none",
                    label: "Unrated",
                    selected: pf.rating === "none",
                    onPick: () => setPf((s) => ({ ...s, rating: "none" as const })),
                  },
                ]}
              />
              <button
                className={`bf${pf.owned ? " on" : ""}`}
                onClick={() => setPf((s) => ({ ...s, owned: !s.owned }))}
              >
                <Ico d={ICON.check} size={14} />
                Owned
              </button>
              {(isFilterActive(pf) || search !== "") && (
                <button
                  className="bf"
                  onClick={() => {
                    setSearch("");
                    setPf(DEFAULT_VIEW_STATE);
                  }}
                >
                  <Ico d={ICON.close} size={14} />
                  Clear
                </button>
              )}
            </div>
            {/* THE TABLE (the v3 exhibit ruling): every quality a column,
                aligned; rows toggle selection (never doors); headers sort. */}
            <div className={`listwrap${hasType ? "" : " notype"}`}>
              <div className="plgrid plhead">
                <span className="h" />
                <span className="h" />
                {(
                  [
                    ["title", "Title"],
                    ["status", "Status"],
                    ["rating", "Rating"],
                    ["priority", "Priority"],
                    ...(hasType ? ([["type", "Type"]] as [PickerSortKey, string][]) : []),
                    ["genre", "Genre"],
                    ["own", "Own"],
                  ] as [PickerSortKey, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    className={`h sortable${sortKey === key ? " on" : ""}`}
                    onClick={() => setSort(key)}
                  >
                    {label}
                    <span className="car">{sortKey === key && sortDir === -1 ? "↑" : "↓"}</span>
                  </button>
                ))}
              </div>
              {visible.map((e) => (
                <PickerRow
                  key={e.id}
                  e={e}
                  vocab={data.statusVocab}
                  hasType={hasType}
                  selected={selected.has(e.id)}
                  onToggle={() => toggle(e.id)}
                />
              ))}
              {visible.length === 0 && (
                <div className="plempty">Nothing matches the picker's filters</div>
              )}
            </div>
            <div className="pfoot">
              <button
                className="bf"
                onClick={() =>
                  setSelected((s) => {
                    const next = new Set(s);
                    for (const e of visible) next.add(e.id);
                    return next;
                  })
                }
              >
                <Ico d={ICON.check} size={14} />
                Select all (filtered)
              </button>
              <button className="bf" onClick={() => setSelected(new Set())}>
                <Ico d={ICON.close} size={14} />
                Clear
              </button>
              <span className="live">
                <b>{n}</b> selected
              </span>
            </div>
          </div>

          {/* the compact field rail — every field defaults "no change"; each
              block gates on the habit's entry_attributes bundle, the creation
              modal's pattern (2026-07-30) — a field the habit doesn't carry
              can't be bulk-written either */}
          <div className="rail2">
            {data.bundle.has("status") && (
              <FieldBlock
                name="Status"
                value={fields.status}
                options={data.statusVocab.map((v) => ({ label: v, value: v }))}
                onPick={(v) => setFields((f) => ({ ...f, status: v as string | undefined }))}
              />
            )}
            {data.bundle.has("priority") && (
              <FieldBlock
                name="Priority"
                value={
                  fields.priority === undefined
                    ? undefined
                    : fields.priority === 0
                      ? "None (0)"
                      : String(fields.priority)
                }
                options={[0, 1, 2, 3].map((p) => ({ label: p === 0 ? "None (0)" : String(p), value: p }))}
                onPick={(v) => setFields((f) => ({ ...f, priority: v as number | undefined }))}
              />
            )}
            {/* Type ABSENT (not dashed) where no type is declared — user-ruled 2026-07-27 */}
            {hasType && (
              <FieldBlock
                name="Type"
                value={fields.type}
                options={data.typeVocab.map((v) => ({ label: v, value: v }))}
                onPick={(v) => setFields((f) => ({ ...f, type: v as string | undefined }))}
              />
            )}
            {data.bundle.has("genre") && (
              <GenreLanes
                vocab={data.genreVocab}
                add={fields.genreAdd}
                remove={fields.genreRemove}
                onChange={(add, remove) => setFields((f) => ({ ...f, genreAdd: add, genreRemove: remove }))}
              />
            )}
            {data.bundle.has("purchased") && (
              <FieldBlock
                name="Purchased"
                value={
                  fields.purchased === undefined ? undefined : fields.purchased ? "Owned ✓" : "Not owned"
                }
                options={[
                  { label: "Owned ✓", value: true },
                  { label: "Not owned", value: false },
                ]}
                onPick={(v) => setFields((f) => ({ ...f, purchased: v as boolean | undefined }))}
              />
            )}
            {data.bundle.has("rating") && (
              <FieldBlock
                name="Rating"
                value={
                  fields.rating === undefined
                    ? undefined
                    : fields.rating == null
                      ? "Clear rating"
                      : stars(fields.rating)
                }
                options={[
                  ...[5, 4, 3, 2, 1].map((r) => ({ label: stars(r), value: r })),
                  { label: "Clear rating", value: null },
                ]}
                onPick={(v) => setFields((f) => ({ ...f, rating: v as number | null | undefined }))}
              />
            )}

            <div className="applyrow">
              <button className="btn-accent" disabled={!canApply} onClick={apply}>
                <Ico d={ICON.check} size={14} />
                Apply to {n}
              </button>
              <p className="applynote">No confirm, no undo — non-destructive and re-editable.</p>
            </div>

            <div className="dz">
              <p className="dzh">Danger zone</p>
              <button className="btn-danger" disabled={n === 0} onClick={() => setConfirmOpen(true)}>
                <Ico d={ICON.trash} size={14} />
                Delete {n} entries…
              </button>
            </div>
          </div>
        </div>

        {/* the stacked count-carrying danger confirm */}
        {confirmOpen && (
          <DangerConfirm
            stacked
            title={`Delete ${radius.entries} ${radius.entries === 1 ? "entry" : "entries"}?`}
            body={
              <>
                This permanently deletes <b>{radius.entries} {radius.entries === 1 ? "entry" : "entries"}</b>
                , their <b>{radius.sessions} sessions</b>, and <b>{radius.files} image files</b>. This
                cannot be undone.
              </>
            }
            confirmLabel={`Delete ${radius.entries} ${radius.entries === 1 ? "entry" : "entries"}`}
            onConfirm={() => void doDelete()}
            onCancel={() => setConfirmOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

/** A picker quick-filter chip (the `.bf` face) with a pick menu. */
function BfChip({
  k,
  value,
  active,
  items,
}: {
  k: string;
  value: string;
  active: boolean;
  items: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="tselwrap">
      <button className={`bf${active ? " on" : ""}`} onClick={() => setOpen((o) => !o)}>
        <span className="k">{k}</span>
        {value}
        <Ico d={ICON.chevron} size={14} />
      </button>
      {open && <Menu items={items} onClose={() => setOpen(false)} />}
    </span>
  );
}

/** One picker table row — the whole row toggles selection (rows are never
 * doors: the non-navigating-surface fence carries over from the cover grid).
 * Rating draws the exhibit's five-dot glance, unrated/unset read dim. */
function PickerRow({
  e,
  vocab,
  hasType,
  selected,
  onToggle,
}: {
  e: LibEntry;
  vocab: string[];
  hasType: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button className={`plgrid plrow${selected ? " sel" : ""}`} onClick={onToggle}>
      <span className="lcb">
        <Ico d={ICON.check} size={11} />
      </span>
      <CoverArt title={e.title} cover={e.cover} className="lthumb" />
      <span className="lt">{e.title}</span>
      <span className="cell">
        {e.status != null && <StatusPill status={e.status} vocab={vocab} />}
      </span>
      <span className="cell">
        {e.rating != null ? (
          <span className="starrow" title={`Rated ${e.rating} of 5`}>
            {stars(e.rating)}
          </span>
        ) : (
          <span className="dim">Unrated</span>
        )}
      </span>
      <span className="cell">
        <PrioGlyph p={e.priority ?? 0} />
      </span>
      {hasType && <span className="cell">{e.type ?? ""}</span>}
      <span className="cell">{e.genre.join(", ")}</span>
      {e.purchased ? (
        <span className="ltick">
          <Ico d={ICON.check} size={14} />
        </span>
      ) : (
        <span className="cell dim">—</span>
      )}
    </button>
  );
}



/** One "no change"-defaulting rail block with a pick menu. */
function FieldBlock({
  name,
  value,
  options,
  onPick,
}: {
  name: string;
  value: string | undefined;
  options: { label: string; value: unknown }[];
  onPick: (v: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fblock">
      <p className="fname">{name}</p>
      <span className="tselwrap block">
        <button className="fsel" onClick={() => setOpen((o) => !o)}>
          {value ?? "No change"}
          <Ico d={ICON.chevron} size={14} />
        </button>
        {open && (
          <Menu
            onClose={() => setOpen(false)}
            items={[
              {
                key: " none",
                label: "No change",
                selected: value === undefined,
                onPick: () => onPick(undefined),
              },
              ...options.map((o) => ({
                key: String(o.value),
                label: o.label,
                selected: value === o.label,
                onPick: () => onPick(o.value),
              })),
            ]}
          />
        )}
      </span>
    </div>
  );
}

/** The genre ADD / REMOVE lanes — "add roguelike to these 8", never replace. */
function GenreLanes({
  vocab,
  add,
  remove,
  onChange,
}: {
  vocab: string[];
  add: string[];
  remove: string[];
  onChange: (add: string[], remove: string[]) => void;
}) {
  return (
    <div className="fblock">
      <p className="fname">Genre</p>
      <Lane
        label="ADD"
        picked={add}
        options={vocab.filter((v) => !add.includes(v) && !remove.includes(v))}
        onAdd={(v) => onChange([...add, v], remove)}
        onDrop={(v) => onChange(add.filter((x) => x !== v), remove)}
      />
      <Lane
        label="REMOVE"
        picked={remove}
        options={vocab.filter((v) => !add.includes(v) && !remove.includes(v))}
        onAdd={(v) => onChange(add, [...remove, v])}
        onDrop={(v) => onChange(add, remove.filter((x) => x !== v))}
      />
    </div>
  );
}

function Lane({
  label,
  picked,
  options,
  onAdd,
  onDrop,
}: {
  label: string;
  picked: string[];
  options: string[];
  onAdd: (v: string) => void;
  onDrop: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lane">
      <span className="lk">{label}</span>
      {picked.map((g) => (
        <span key={g} className="gtag">
          {g}
          <span className="x" onClick={() => onDrop(g)}>
            <Ico d={ICON.close} size={12} />
          </span>
        </span>
      ))}
      <span className="tselwrap">
        <button className="addtag" onClick={() => setOpen((o) => !o)}>
          +
        </button>
        {open && (
          <Menu
            onClose={() => setOpen(false)}
            items={options.map((v) => ({ key: v, label: v, onPick: () => onAdd(v) }))}
          />
        )}
      </span>
    </div>
  );
}
