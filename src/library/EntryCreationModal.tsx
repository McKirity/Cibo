/**
 * Build step 6 catch-up — the ENTRY CREATION MODAL (`kit-modal-entry-creation`
 * on `kit-shell-overlay`), translated from the frozen
 * `Final/entry-creation-modal.html` (2026-07-14).
 *
 * The library's door of entry creation (the other door — inline quick-create —
 * lives in the Daily form's picker). One chassis, door-keyed: THE HABIT COMES
 * FROM THE DOOR (no habit picker), title is the only required field, status
 * defaults to **Planned** (cataloguing intent). Field rows gate on the habit's
 * `entry_attributes` bundle (status · genre · rating · purchased · priority)
 * and on sub_type (consumption: cover · type-where-declared · creators ·
 * series/order/words; creation: banner · Fandom/Engine · arc bookends) —
 * definition-driven, no habit-key branch.
 *
 * Rulings honored: synopsis = a single-line input (the no-textarea law
 * stands) · ONE landing door — "Create entry", stay in the library (the
 * "Create & open" second door was STRUCK at the pull) · the duplicate nudge is
 * soft and never blocks · manual entries carry the null (source, external_id)
 * pair — provenance reads "manual".
 *
 * Deferred seam, recorded: the cover/banner REFERENCE inputs draw their hatch
 * faces but the drop is inert — there is no cloud root until step 14, so a
 * dropped file has nowhere to live. Entries wear the lettermark fallback.
 */
import { useEffect, useMemo, useState } from "react";
import { NonEmptyString100, NonEmptyString1000, NonNegativeInt, PositiveInt } from "@evolu/common";
import { evolu } from "../db/evolu";
import { DateOnly, stringListToJson } from "../db/schema";
import { findDuplicate } from "./librarySpec";
import { useLibraryData } from "./useLibraryData";
import { Ico, ICON, Menu, StatusPill } from "./bits";

export function EntryCreationModal({
  habitKey,
  onClose,
  onOpenEntry,
}: {
  habitKey: string;
  onClose: () => void;
  /** The nudge's "Open existing ↗" door. */
  onOpenEntry: (id: string) => void;
}) {
  // (An `initialTitle` pre-fill prop lived here for two days for the palette's
  // quick-create handoff; it left 2026-07-29 when that flow was struck —
  // "it's not the search's job to make it".)
  const data = useLibraryData(habitKey);
  const creation = data.subType === "creation";

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("Planned");
  const [statusOpen, setStatusOpen] = useState(false);
  const [type, setType] = useState<string | null>(null);
  const [typeOpen, setTypeOpen] = useState(false);
  const [creatorsRaw, setCreatorsRaw] = useState("");
  const [creationValue, setCreationValue] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [genreOpen, setGenreOpen] = useState(false);
  const [genreNew, setGenreNew] = useState<string | null>(null);
  const [priority, setPriority] = useState(0);
  const [rating, setRating] = useState<number | null>(null);
  const [purchased, setPurchased] = useState(false);
  const [series, setSeries] = useState("");
  const [seriesOrder, setSeriesOrder] = useState("");
  const [words, setWords] = useState("");
  const [started, setStarted] = useState("");
  const [completed, setCompleted] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const duplicate = useMemo(() => findDuplicate(title, data.entries), [title, data.entries]);
  const showNudge = duplicate != null && !nudgeDismissed;

  // Esc closes (the ✕ and a dim-click too). The Menu's own Esc runs in the
  // capture phase and stops propagation, so an open menu closes first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const create = () => {
    setErr(null);
    const t = title.trim();
    if (t === "") return setErr("A title is required — it is the only required field.");
    if (data.habitId == null) return setErr("The habit could not be resolved.");
    const ord = seriesOrder.trim() === "" ? null : Number(seriesOrder);
    if (ord != null && (!Number.isInteger(ord) || ord < 1))
      return setErr("Series order must be a positive integer.");
    const w = words.trim() === "" ? null : Number(words);
    if (w != null && (!Number.isInteger(w) || w < 0))
      return setErr("Words must be a non-negative integer.");
    for (const [label, v] of [
      ["Started", started],
      ["Completed", completed],
    ] as const) {
      if (v !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(v))
        return setErr(`${label} must be a date (YYYY-MM-DD).`);
    }
    try {
      const creators = creatorsRaw
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const res = evolu.insert("entries", {
        habit_fk: data.habitId,
        title: NonEmptyString1000.orThrow(t),
        // Null (source, external_id) — provenance reads "manual".
        status: data.bundle.has("status") ? NonEmptyString100.orThrow(status) : null,
        description: synopsis.trim() === "" ? null : synopsis.trim(),
        ...(creation
          ? {
              ...(data.creationField != null && creationValue.trim() !== ""
                ? { [data.creationField.column]: NonEmptyString100.orThrow(creationValue.trim()) }
                : {}),
              started: started === "" ? null : DateOnly.orThrow(started),
              completed: completed === "" ? null : DateOnly.orThrow(completed),
            }
          : {
              type: type != null ? NonEmptyString100.orThrow(type) : null,
              creators:
                creators.length > 0
                  ? stringListToJson(creators.map((x) => NonEmptyString1000.orThrow(x)))
                  : null,
              series: series.trim() === "" ? null : NonEmptyString1000.orThrow(series.trim()),
              series_order: ord != null ? PositiveInt.orThrow(ord) : null,
              words: w != null ? NonNegativeInt.orThrow(w) : null,
            }),
        ...(data.bundle.has("genre") && genres.length > 0
          ? { genre: stringListToJson(genres.map((x) => NonEmptyString1000.orThrow(x))) }
          : {}),
        ...(data.bundle.has("priority") ? { priority: NonNegativeInt.orThrow(priority) } : {}),
        ...(data.bundle.has("rating") && rating != null
          ? { rating: PositiveInt.orThrow(rating) }
          : {}),
        ...(data.bundle.has("purchased") ? { purchased: purchased ? 1 : 0 } : {}),
      });
      if (!res.ok) {
        console.error("Entry create rejected", res.error);
        return setErr("The entry could not be created — the write was rejected.");
      }
      // Quick-add: a fandom/engine value the vocab does not carry yet joins it
      // (the seeder's addVocab behavior — the picklists stay honest).
      if (creation && data.creationField != null && creationValue.trim() !== "") {
        quickAddVocab(data.creationField.definitionId, data.creationField.vocab, creationValue.trim());
      }
      onClose();
    } catch (ex) {
      console.error("Entry create failed", ex);
      setErr("The entry could not be created — a value did not validate.");
    }
  };

  const addGenre = (value: string) => {
    const v = value.trim();
    if (v === "" || genres.includes(v)) return;
    setGenres((g) => [...g, v]);
    if (!data.genreVocab.includes(v) && data.genreDefinitionId != null) {
      quickAddVocab(data.genreDefinitionId, data.genreVocab, v);
    }
  };

  if (!data.ready) return null;

  return (
    <div className="dimlayer" onMouseDown={onClose} role="presentation">
      <div
        className="mo ecmodal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="mo-head">
          <div className="mo-titlewrap">
            <span className="mo-title">New entry — {data.name}</span>
          </div>
          <div className="mo-esc">
            <span className="escnote">Esc to close</span>
            <button className="mo-close" aria-label="Close" onClick={onClose}>
              <Ico d={ICON.close} />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="mo-body">
          {/* top zone: cover reference (consumption) + title / status */}
          <div className="ec-top">
            {!creation && (
              <div
                className="ec-cover ec-hatch"
                title="Cover reference — the drop arrives with the cloud root (step 14)"
              >
                <Ico d={ICON.image} size={26} />
                <span className="ecn">Drop cover</span>
                <span className="ecsub">reference · optional</span>
              </div>
            )}
            <div className="ec-primary">
              <div className="ec-titrow">
                <span className="ec-caplbl">
                  Title <span className="ec-req">· required</span>
                </span>
                <input
                  className="ec-input big"
                  type="text"
                  value={title}
                  placeholder="Name this entry…"
                  autoFocus
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setNudgeDismissed(false);
                  }}
                />
              </div>
              {showNudge && (
                <div className="ec-nudge">
                  <Ico d={ICON.info} size={18} />
                  <span>
                    You already have <b>{duplicate.title}</b> in this habit — did you mean that
                    one?{" "}
                    <span className="nlink" onClick={() => onOpenEntry(duplicate.id)}>
                      Open existing ↗
                    </span>
                    <span className="nsep">·</span>
                    <span className="nlink" onClick={() => setNudgeDismissed(true)}>
                      Create anyway
                    </span>
                  </span>
                </div>
              )}
              {data.bundle.has("status") && (
                <div className="ec-field center">
                  <span className="ec-lbl">Status</span>
                  <span className="ec-ctrl">
                    <span className="tselwrap">
                      <button className="ec-select" onClick={() => setStatusOpen((o) => !o)}>
                        <StatusPill status={status} vocab={data.statusVocab} />
                        <Ico d={ICON.chevron} size={15} />
                      </button>
                      {statusOpen && (
                        <Menu
                          onClose={() => setStatusOpen(false)}
                          items={data.statusVocab.map((v) => ({
                            key: v,
                            label: v,
                            selected: status === v,
                            onPick: () => setStatus(v),
                          }))}
                        />
                      )}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* banner (creation) */}
          {creation && (
            <div className="ec-field">
              <span className="ec-lbl">
                Banner<span className="opt">reference · optional</span>
              </span>
              <span className="ec-ctrl block">
                <span
                  className="ec-banner ec-hatch"
                  title="Banner reference — the drop arrives with the cloud root (step 14)"
                >
                  <span className="ecn">Drop banner</span>
                </span>
              </span>
            </div>
          )}

          {/* attributes */}
          <div className="ec-fields">
            <div className="ec-secl">Attributes</div>

            {/* type — Medium-bearing consumption habits only */}
            {data.typeVocab.length > 0 && (
              <div className="ec-field center">
                <span className="ec-lbl">Type</span>
                <span className="ec-ctrl">
                  <span className="tselwrap">
                    <button className="ec-select" onClick={() => setTypeOpen((o) => !o)}>
                      {type ?? "—"}
                      <Ico d={ICON.chevron} size={15} />
                    </button>
                    {typeOpen && (
                      <Menu
                        onClose={() => setTypeOpen(false)}
                        items={[
                          { key: "", label: "—", selected: type == null, onPick: () => setType(null) },
                          ...data.typeVocab.map((v) => ({
                            key: v,
                            label: v,
                            selected: type === v,
                            onPick: () => setType(v),
                          })),
                        ]}
                      />
                    )}
                  </span>
                </span>
              </div>
            )}

            {/* creators / studios (consumption) */}
            {!creation && (
              <div className="ec-field center">
                <span className="ec-lbl">
                  Creators<span className="opt">/ studios</span>
                </span>
                <span className="ec-ctrl">
                  <input
                    className="ec-input mini wide"
                    type="text"
                    value={creatorsRaw}
                    placeholder="People or studios, comma-separated…"
                    onChange={(e) => setCreatorsRaw(e.target.value)}
                  />
                </span>
              </div>
            )}

            {/* fandom / engine (creation, definition-driven label) */}
            {creation && data.creationField != null && (
              <div className="ec-field center">
                <span className="ec-lbl">{data.creationField.label}</span>
                <span className="ec-ctrl">
                  <input
                    className="ec-input mini wide"
                    type="text"
                    value={creationValue}
                    placeholder="Start typing…"
                    list="ec-creation-vocab"
                    onChange={(e) => setCreationValue(e.target.value)}
                  />
                  <datalist id="ec-creation-vocab">
                    {data.creationField.vocab.map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                </span>
              </div>
            )}

            {/* genre (bundle-gated — consumption + gamedev's opt-in) */}
            {data.bundle.has("genre") && (
              <div className="ec-field">
                <span className="ec-lbl">
                  Genre<span className="opt">multi-value</span>
                </span>
                <span className="ec-ctrl">
                  {genres.map((g) => (
                    <span key={g} className="ec-chip">
                      {g}
                      <span className="x" onClick={() => setGenres((gs) => gs.filter((x) => x !== g))}>
                        <Ico d={ICON.close} size={13} />
                      </span>
                    </span>
                  ))}
                  {genreNew != null ? (
                    <input
                      className="ec-input mini"
                      type="text"
                      value={genreNew}
                      placeholder="New genre…"
                      autoFocus
                      onChange={(e) => setGenreNew(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          addGenre(genreNew);
                          setGenreNew(null);
                        } else if (e.key === "Escape") {
                          e.stopPropagation();
                          setGenreNew(null);
                        }
                      }}
                      onBlur={() => {
                        addGenre(genreNew);
                        setGenreNew(null);
                      }}
                    />
                  ) : (
                    <span className="tselwrap">
                      <button className="ec-add" onClick={() => setGenreOpen((o) => !o)}>
                        <Ico d={ICON.plus} size={13} />
                        Add genre
                      </button>
                      {genreOpen && (
                        <Menu
                          onClose={() => setGenreOpen(false)}
                          items={[
                            ...data.genreVocab
                              .filter((v) => !genres.includes(v))
                              .map((v) => ({ key: v, label: v, onPick: () => addGenre(v) })),
                            {
                              key: " new",
                              label: "＋ New genre…",
                              onPick: () => setGenreNew(""),
                            },
                          ]}
                        />
                      )}
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* priority (bundle-gated) */}
            {data.bundle.has("priority") && (
              <div className="ec-field center">
                <span className="ec-lbl">
                  Priority<span className="opt">fixed 0–3</span>
                </span>
                <span className="ec-ctrl">
                  <span className="ec-prio">
                    {[0, 1, 2, 3].map((p) => (
                      <button
                        key={p}
                        className={`po${priority === p ? " on" : ""}`}
                        onClick={() => setPriority(p)}
                      >
                        {p === 0 ? (
                          <span className="dash">—</span>
                        ) : (
                          <span className="prio">
                            {Array.from({ length: p }, (_, i) => (
                              <svg key={i} className="ar on" viewBox="0 0 12 7">
                                <path
                                  d="M1 6 6 1l5 5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            ))}
                          </span>
                        )}
                        <span className="pl">{p === 0 ? "None" : p}</span>
                      </button>
                    ))}
                  </span>
                </span>
              </div>
            )}

            {/* rating (bundle-gated, optional 1–5; re-click clears) */}
            {data.bundle.has("rating") && (
              <div className="ec-field center">
                <span className="ec-lbl">
                  Rating<span className="opt">optional 1–5</span>
                </span>
                <span className="ec-ctrl">
                  <span className="ec-stars">
                    {[1, 2, 3, 4, 5].map((r) => (
                      <button
                        key={r}
                        className={`str${rating != null && r <= rating ? " on" : ""}`}
                        title={rating === r ? "Clear rating" : `${r} star${r > 1 ? "s" : ""}`}
                        onClick={() => setRating(rating === r ? null : r)}
                      >
                        ★
                      </button>
                    ))}
                  </span>
                </span>
              </div>
            )}

            {/* purchased (bundle-gated) */}
            {data.bundle.has("purchased") && (
              <div className="ec-field center">
                <span className="ec-lbl">Purchased</span>
                <span className="ec-ctrl">
                  <button
                    className={`ec-check${purchased ? " on" : ""}`}
                    role="checkbox"
                    aria-checked={purchased}
                    onClick={() => setPurchased((p) => !p)}
                  >
                    <span className="box">
                      <Ico d={ICON.check} size={13} />
                    </span>
                  </button>
                </span>
              </div>
            )}

            {/* series / order / words (consumption) */}
            {!creation && (
              <div className="ec-field center">
                <span className="ec-lbl">
                  Series<span className="opt">order · words</span>
                </span>
                <span className="ec-ctrl">
                  <input
                    className="ec-input mini series"
                    type="text"
                    value={series}
                    placeholder="Series title…"
                    onChange={(e) => setSeries(e.target.value)}
                  />
                  <span className="ec-inline">
                    <span className="k">#</span>
                    <input
                      className="ec-input mini order"
                      type="text"
                      value={seriesOrder}
                      placeholder="—"
                      onChange={(e) => setSeriesOrder(e.target.value)}
                    />
                  </span>
                  <span className="ec-inline">
                    <input
                      className="ec-input mini words"
                      type="text"
                      value={words}
                      placeholder="words"
                      onChange={(e) => setWords(e.target.value)}
                    />
                    <span className="k">count</span>
                  </span>
                </span>
              </div>
            )}

            {/* arc bookends (creation) */}
            {creation && (
              <div className="ec-field center">
                <span className="ec-lbl">
                  Arc<span className="opt">started · completed</span>
                </span>
                <span className="ec-ctrl">
                  <span className="ec-inline">
                    <Ico d={ICON.calendar} size={15} />
                    <input
                      className="ec-input mini date"
                      type="text"
                      value={started}
                      placeholder="Started YYYY-MM-DD"
                      onChange={(e) => setStarted(e.target.value)}
                    />
                  </span>
                  <span className="ec-inline">
                    <Ico d={ICON.calendar} size={15} />
                    <input
                      className="ec-input mini date"
                      type="text"
                      value={completed}
                      placeholder="Completed YYYY-MM-DD"
                      onChange={(e) => setCompleted(e.target.value)}
                    />
                  </span>
                </span>
              </div>
            )}

            {/* synopsis — single-line by ruling (the no-textarea law) */}
            <div className="ec-field">
              <span className="ec-lbl">
                Synopsis<span className="opt">optional</span>
              </span>
              <span className="ec-ctrl block">
                <input
                  className="ec-input"
                  type="text"
                  value={synopsis}
                  placeholder="Start typing…"
                  onChange={(e) => setSynopsis(e.target.value)}
                />
              </span>
            </div>
          </div>

          {err != null && <div className="ec-err">{err}</div>}
        </div>

        {/* foot — ONE landing door (ruled 2026-07-14): create, stay in the library */}
        <div className="mo-foot">
          <span className="ec-provenance">
            <Ico d={ICON.info} size={14} />
            Manual entry · source reads “manual”
          </span>
          <button className="btn-accent create" onClick={create}>
            <Ico d={ICON.plus} />
            Create entry
          </button>
        </div>
      </div>
    </div>
  );
}

/** Insert a vocab_options row when the value is new (ordering = append). */
function quickAddVocab(
  definitionId: import("../db/schema").SubunitDefinitionId,
  existing: string[],
  value: string,
) {
  if (existing.some((v) => v.toLowerCase() === value.toLowerCase())) return;
  const res = evolu.insert("vocab_options", {
    definition_fk: definitionId,
    value: NonEmptyString100.orThrow(value),
    sort_order: existing.length + 1,
  });
  if (!res.ok) console.error("Vocab quick-add rejected", res.error);
}
