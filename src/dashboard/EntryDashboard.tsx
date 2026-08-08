/**
 * Build step 6 · chunk 5 — the entry dashboard, the fourth and last dashboard
 * cut. ONE component renders both templates off the habit row: the consumption
 * base (frozen `entry-dashboard-gaming.html`) and the creation build-out
 * (frozen `entry-dashboard-writing.html`). The app's only two-column screen:
 * a sticky identity rail + a scrolling main column, NO masthead — the eyebrow's
 * habit name is the door back to the habit's stats.
 *
 * The rail IS the edit mode (a field-state delta, never a rearrangement):
 * Done = the app's first user-surface `evolu.update("entries")` — branded
 * values, every Result checked (the batch-4 lesson). The danger foot is INERT
 * (delete deferred with the undo-toast machinery — user-ruled 2026-07-23).
 * Day-log rows are LIVE doors to their cover walls (since 2026-07-27 — the
 * correction note at the day-log renderer; this header predates Daily).
 *
 * (The danger foot went LIVE at the step-6 catch-up — the undo-toast tier
 * exists since the form spine, so the chunk-5 deferral is discharged.)
 *
 * The wave band + growth curve draw box-sized viewBoxes (the step-4 ruling —
 * never a fixed viewBox + stretch); the break width transcribes the
 * --wave-break-w dial (70), the band height rides --wave-band-h via CSS.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  DateOnly,
  stringListToJson,
} from "../db/schema";
import { NonEmptyString100, NonEmptyString1000, NonNegativeInt, PositiveInt } from "@evolu/common";
import { evolu } from "../db/evolu";
import { dayFromIndex, dayGap, dayIndex, heatRowLabels, monthKey } from "../metrics/dates";
import { useEntryData, type EntryData } from "./useEntryData";
import {
  buildEntryDashboard,
  type DayLogSpec,
  type EntryModel,
  type GrowthSpec,
  type WaveBucket,
  type WaveComp,
  type WavesSpec,
  type WaveTableRow,
} from "./entrySpec";
import { heatPoolStyle, Panel, StatGroup } from "./kit";
import { CoverInner } from "../kit/CoverArt";
import { pickAndStoreEntryImage } from "../importers/covers";
import { deleteRefFiles } from "../db/fileDeletion";
import { useBox } from "./useBox";
import { DistPanel } from "./CreationDashboard";
import { deleteEntriesCascade } from "../library/entryDelete";
import { showErrorToast, showUndoToast } from "../shell/toast";
import { todayLocal } from "../metrics/clock";
import { MONTHS_SHORT, stars } from "../metrics/format";
import type { CreationHeatCell, CreationModel } from "./creationSpec";
import "../dashboard.css";
import "./screen.css";
import "./entry.css";

export function EntryDashboard({
  entryId,
  onOpenHabit,
  onOpenEntry,
  onOpenDay,
  onDeleted,
}: {
  entryId: string;
  onOpenHabit: (habitKey: string) => void;
  onOpenEntry: (entryId: string) => void;
  onOpenDay?: (day: string) => void;
  /** After a tier-2 delete: leave the dead route (REPLACE, never push). */
  onDeleted?: () => void;
}) {
  const data = useEntryData(entryId);
  const [today] = useState(todayLocal);
  const [railMode, setRailMode] = useState<"view" | "edit">("view");

  const { model, ms } = useMemo(() => {
    if (!data.ready || data.entry == null || data.subType == null)
      return { model: null as EntryModel | null, ms: 0 };
    const t0 = performance.now();
    const model = buildEntryDashboard({
      habitKey: data.habitKey,
      habitName: data.habitName,
      colourSlot: data.colourSlot,
      subType: data.subType,
      measuresCount: data.measuresCount,
      countUnit: data.countUnit,
      waveGapDays: data.waveGapDays,
      entry: data.entry,
      sessions: data.sessions,
      siblings: data.siblings,
      finalized: data.finalized,
      today,
      defs: data.defs,
      valueBySession: data.valueBySession,
    });
    return { model, ms: performance.now() - t0 };
  }, [data, today]);

  if (!data.ready || model == null) return <div className="gsdash">Loading entry…</div>;
  const m = model;

  return (
    <div className="gsdash" style={{ "--heat-hue": `var(${m.colorVar})` } as CSSProperties}>
      <div className="perf-line">
        derived in {ms.toFixed(1)} ms · {data.sessions.length} sessions · {m.waves.count} waves ·{" "}
        {m.template}
      </div>
      <div className="edash" data-railmode={railMode}>
        <div className="railslot">
          <RailView m={m} data={data} onOpenHabit={onOpenHabit} onEdit={() => setRailMode("edit")} />
          {railMode === "edit" && (
            <RailEdit data={data} m={m} onClose={() => setRailMode("view")} onDeleted={onDeleted} />
          )}
        </div>
        <div className="emain">
          {m.seriesStrip && (
            <div className="series live">
              {m.seriesStrip.prev && (
                <button
                  className="scover"
                  title={`Previous in series — ${m.seriesStrip.prev.title}`}
                  onClick={() => onOpenEntry(m.seriesStrip!.prev!.entryId)}
                >
                  <span className="cinit">‹ prev</span>
                </button>
              )}
              <div className="sctx">
                <div className="stitle">{m.seriesStrip.title}</div>
                <div className="snote">{m.seriesStrip.note}</div>
              </div>
              {m.seriesStrip.next && (
                <button
                  className="scover"
                  title={`Next in series — ${m.seriesStrip.next.title}`}
                  onClick={() => onOpenEntry(m.seriesStrip!.next!.entryId)}
                >
                  <span className="cinit">next ›</span>
                </button>
              )}
            </div>
          )}

          {/* ── Stats strip (measure-grouped rows) ── */}
          <Panel title="At a glance">
            {m.statRows.map((row) => (
              <StatGroup key={row.label} label={row.label} tiles={row.tiles} tall={row.tall} />
            ))}
          </Panel>

          {/* ── Story-vs-wiki split + the distribution pair (creation) ── */}
          {(m.split || m.dist) && (
            <Panel
              title={
                m.split
                  ? `Story vs wiki · ${m.dist ? m.dist.panels.map((p) => p.title.replace(/^By /, "").toLowerCase()).join(" / ") + " distribution" : "words"}`
                  : m.dist!.panelTitle
              }
            >
              {m.split && (
                <div className="splitwrap">
                  <div
                    className="pie"
                    title="Total words · split"
                    style={{
                      background: `conic-gradient(${splitGradient(m.split.slices)})`,
                    }}
                  />
                  <div>
                    <p className="tlabel splitlabel">Story vs wiki words</p>
                    <div className="dleg splitleg">
                      {m.split.slices.map((s) => (
                        <div className="lg" key={s.label}>
                          <i style={{ background: s.color }} />
                          <span className="lgn">{s.label}</span>
                          <span className="lgv">{s.value}</span>
                          <span className="lgp">{s.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {m.dist && (
                <div className="distrow4" style={m.split ? { marginTop: "var(--space-7)" } : undefined}>
                  {m.dist.panels.map((p) => (
                    <DistPanel key={p.title} panel={p} />
                  ))}
                </div>
              )}
            </Panel>
          )}

          {/* ── Activity heatmap (trailing 53 weeks; Words⇄Time when two-measure) ── */}
          <EntryHeatmap heatmap={m.heatmap} />

          {/* ── Word-growth curve (creation two-measure only) — beneath the
               heatmap (user-ruled 2026-07-24) ── */}
          {m.growth && (
            <Panel title={`${cap((data.countUnit ?? "count").replace(/s$/, ""))}-growth curve`}>
              <GrowthCurve g={m.growth} colorVar={m.colorVar} />
            </Panel>
          )}

          {/* ── Wave timeline — the signature zone (band + lane + chapter track +
               the linked wave table; the 2026-07-24 rulings). Sits just above the
               day log (user-ruled 2026-07-24). ── */}
          <WaveZone waves={m.waves} colorVar={m.colorVar} />

          {/* ── Day log ── */}
          <Panel title="Day log">
            <DayLog log={m.daylog} onOpenDay={onOpenDay} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const splitGradient = (slices: { color: string; pct: number }[]): string => {
  let acc = 0;
  return slices
    .map((s) => {
      const from = acc;
      acc += s.pct;
      return `${s.color} ${from}% ${Math.min(100, acc)}%`;
    })
    .join(", ");
};

// ── Identity rail (view face) ─────────────────────────────────────────────────

function RailView({
  m,
  data,
  onOpenHabit,
  onEdit,
}: {
  m: EntryModel;
  data: EntryData;
  onOpenHabit: (key: string) => void;
  onEdit: () => void;
}) {
  const r = m.rail;
  // The rail's banner BAND was removed 2026-08-06 (user-ruled) — the rail opens
  // on the cover, as the consumption face always has. The banner REF lives on:
  // it feeds the Daily cover wall's creation tile and the hero card's
  // background, and it is still set from this rail's edit face.
  return (
    <div className="erail view">
      <div className="cover" title={`${r.title} · cover`}>
        <CoverInner cover={r.cover} label={r.coverLabel} />
      </div>
      <div className="eyebrow">
        <button className="door" onClick={() => onOpenHabit(data.habitKey)}>
          {r.eyebrow.habit}
        </button>
        {r.eyebrow.type && <> · {r.eyebrow.type}</>}
      </div>
      <div className="etitle">{r.title}</div>
      {r.byline && <div className="byline">{r.byline}</div>}
      {r.chips.length > 0 && (
        <div className="chips">
          {r.chips.map((c) => (
            <span className="chip" key={c}>
              {c}
            </span>
          ))}
        </div>
      )}
      {(r.pill || r.rating) && (
        <div className="statusrow">
          {r.pill && (
            <span
              className="pill"
              style={{
                background: `color-mix(in oklch, var(${r.pill.colorVar}), var(--panel-background) var(--tint-mix))`,
                borderColor: `color-mix(in oklch, var(${r.pill.colorVar}), var(--panel-background) var(--tint-border))`,
                color: `color-mix(in oklch, var(${r.pill.colorVar}), var(--text-strong) var(--pill-ink-shift))`,
              }}
            >
              {r.pill.label}
            </span>
          )}
          {r.rating && (
            <span className="rating">
              <span className="stars">{r.rating.stars}</span> {r.rating.value}
            </span>
          )}
        </div>
      )}
      {r.rating?.context && <div className="ratingctx">{r.rating.context}</div>}
      <div className="facts">
        {r.facts.map((f) => (
          <div className="f" key={f.label}>
            <b>{f.label}</b>
            <span>{f.strong ? <strong>{f.value}</strong> : f.value}</span>
          </div>
        ))}
      </div>
      {r.description && <div className="desc">{r.description}</div>}
      <div className="prov">{r.provenance}</div>
      <div className="railactions">
        <button className="btn-plain" onClick={onEdit}>
          ✎ Edit
        </button>
      </div>
    </div>
  );
}

// ── Identity rail (edit face) — the shared edit mode ──────────────────────────
// A field-state delta on the same frame: every editable field flips to an
// inline input in place; provenance stays read-only; Done writes ONE branded
// evolu.update with its Result checked (the batch-4 lesson). Creation edits
// the ruled set (Fandom + arc bookends) beside the shared Title/Status/Desc.

const STATUS_ANCHORS = ["Current", "Finished", "Dropped", "Planned", "Hiatus"];

function RailEdit({
  data,
  m,
  onClose,
  onDeleted,
}: {
  data: EntryData;
  m: EntryModel;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const e = data.entry!;
  const creation = m.template === "creation";
  const [title, setTitle] = useState(e.title);
  const [type, setType] = useState(e.type ?? "");
  const [status, setStatus] = useState(e.status ?? "");
  const [creators, setCreators] = useState(e.creators.join(", "));
  const [studios, setStudios] = useState(e.studios.join(", "));
  const [genre, setGenre] = useState<string[]>(e.genre);
  const [genreAdd, setGenreAdd] = useState("");
  const [rating, setRating] = useState(e.rating != null ? String(e.rating) : "");
  const [priority, setPriority] = useState(e.priority != null ? String(e.priority) : "");
  const [purchased, setPurchased] = useState(e.purchased === true);
  const [series, setSeries] = useState(e.series ?? "");
  const [seriesOrder, setSeriesOrder] = useState(e.seriesOrder != null ? String(e.seriesOrder) : "");
  const [fandom, setFandom] = useState(e.fandom ?? "");
  const [started, setStarted] = useState(e.started ?? "");
  const [completed, setCompleted] = useState(e.completed ?? "");
  const [desc, setDesc] = useState(e.description ?? "");
  const [err, setErr] = useState<string | null>(null);

  const hasBundle = (attr: string) => data.bundle.includes(attr);
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  // Fork J (user-ruled 2026-08-06): the drawn replace-by-file drop, as a
  // dialog pick (the grant rides the pick). The replaced file's old ref is
  // best-effort deleted — a changed extension would otherwise orphan it into
  // the doctor's lap.
  //
  // BOTH KINDS AGAIN since 2026-08-07: the banner door was removed a day
  // earlier as redundant, which left the app with readers and no writer — the
  // cover wall's creation tile and the creation hero card both READ a banner
  // ref, and both fail into a designed gradient, so an unsettable banner looked
  // exactly like a banner nobody had set yet. The user reversed it on sight
  // ("write replace banner back in"). One function, `kind` the only difference.
  const replaceImage = async (kind: "cover" | "banner") => {
    if (data.entryId == null) return;
    const rel = await pickAndStoreEntryImage(data.habitKey, data.entryId, kind);
    if (rel == null) return; // cancel / unset root — never an error
    const old = kind === "cover" ? m.rail.cover : m.rail.bannerRef;
    const res = evolu.update("entries", { id: data.entryId, [kind]: rel } as never);
    if (!res.ok) {
      setErr("Image save failed — see console.");
      console.error("entry image update failed", res.error);
      return;
    }
    // Clean up only the app's OWN canonical copy (<entry-id>.<ext>, and the
    // banner's own `-banner` variant). A curated in-place file (the
    // pick-from-the-habit-folder model, re-ruled 2026-08-06) may be shared by
    // other entries — never deleted on replace.
    const canonical = new RegExp(`/${data.entryId}(-banner)?\\.[a-z0-9]+$`, "i");
    if (typeof old === "string" && old !== "" && old !== rel && canonical.test(old))
      void deleteRefFiles([old]);
  };

  const save = () => {
    setErr(null);
    if (title.trim().length === 0) return setErr("Title can't be empty.");
    if (started !== "" && !DATE_RE.test(started)) return setErr("Started must be YYYY-MM-DD.");
    if (completed !== "" && !DATE_RE.test(completed)) return setErr("Completed must be YYYY-MM-DD.");
    const ord = seriesOrder.trim() === "" ? null : Number(seriesOrder);
    if (ord != null && (!Number.isInteger(ord) || ord < 1)) return setErr("Series order must be a positive integer.");
    try {
      const parseList = (s: string) =>
        s
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
      const res = evolu.update("entries", {
        id: data.entryId!,
        title: NonEmptyString1000.orThrow(title.trim()),
        status: status === "" ? null : NonEmptyString100.orThrow(status),
        description: desc.trim() === "" ? null : desc.trim(),
        ...(creation
          ? {
              fandom: fandom.trim() === "" ? null : NonEmptyString100.orThrow(fandom.trim()),
              started: started === "" ? null : DateOnly.orThrow(started),
              completed: completed === "" ? null : DateOnly.orThrow(completed),
            }
          : {
              type: type === "" ? null : NonEmptyString100.orThrow(type),
              creators:
                parseList(creators).length > 0
                  ? stringListToJson(parseList(creators).map((x) => NonEmptyString1000.orThrow(x)))
                  : null,
              studios:
                parseList(studios).length > 0
                  ? stringListToJson(parseList(studios).map((x) => NonEmptyString1000.orThrow(x)))
                  : null,
              genre:
                genre.length > 0
                  ? stringListToJson(genre.map((x) => NonEmptyString1000.orThrow(x)))
                  : null,
              rating: rating === "" ? null : PositiveInt.orThrow(Number(rating)),
              priority: priority === "" ? null : NonNegativeInt.orThrow(Number(priority)),
              purchased: hasBundle("purchased") ? (purchased ? 1 : 0) : null,
              series: series.trim() === "" ? null : NonEmptyString1000.orThrow(series.trim()),
              series_order: ord != null ? PositiveInt.orThrow(ord) : null,
            }),
      });
      if (!res.ok) {
        setErr("Save failed — see console.");
        console.error("entry update failed", res.error);
        return;
      }
      onClose();
    } catch (ex) {
      setErr(String(ex));
    }
  };

  return (
    <div className="erail edit">
      {/* The replace-by-file half is LIVE (fork J, 2026-08-06): click opens
          the image pick; the file lands as images/<habit-key>/<entry-id>.<ext>
          and the ref writes through.
          The box paints the CURRENT cover exactly as the view face does — a
          replace target that hides what it is replacing is the deficiency this
          face had — with the REPLACE COVER band laid across it. The band sits
          mid-box, not at the foot, because CoverInner's own `.cinit` lettermark
          occupies the foot whenever there is no art yet. */}
      <div
        className="cover"
        role="button"
        tabIndex={0}
        title="Replace cover — pick an image file"
        onClick={() => void replaceImage("cover")}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            void replaceImage("cover");
          }
        }}
      >
        <CoverInner cover={m.rail.cover} label={m.rail.coverLabel} />
        <span className="covband">✎ REPLACE COVER</span>
      </div>
      {/* The banner gets a plain door rather than a click-target of its own:
          the rail stopped DRAWING a banner band on 2026-08-06 (user-ruled), so
          there is no picture here to click. It is still set from this face —
          it displays on the cover wall's creation tile and the hero card. */}
      <button
        className="btn-plain"
        title="Replace banner — pick an image file"
        onClick={() => void replaceImage("banner")}
      >
        ✎ {m.rail.bannerRef ? "Replace banner…" : "Set banner…"}
      </button>
      <div className="finput">
        <span className="flabel">Title</span>
        <input className="fbox" value={title} onChange={(ev) => setTitle(ev.target.value)} />
      </div>
      {!creation && data.typeVocab.length > 0 && (
        <div className="finput">
          <span className="flabel">Type · habit vocab</span>
          <select className="fbox" value={type} onChange={(ev) => setType(ev.target.value)}>
            <option value="">—</option>
            {data.typeVocab.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}
      {!creation && (
        <>
          <div className="frow2">
            <div className="finput">
              <span className="flabel">Creators</span>
              <input className="fbox" value={creators} onChange={(ev) => setCreators(ev.target.value)} />
            </div>
            <div className="finput">
              <span className="flabel">Studios</span>
              <input className="fbox" value={studios} onChange={(ev) => setStudios(ev.target.value)} />
            </div>
          </div>
          {hasBundle("genre") && (
            <div className="finput">
              <span className="flabel">Genre · multi-value</span>
              <div className="chipedit">
                {genre.map((g) => (
                  <span className="chip" key={g}>
                    {g}
                    <span className="x" onClick={() => setGenre(genre.filter((x) => x !== g))}>
                      ✕
                    </span>
                  </span>
                ))}
                <input
                  className="chip addchip"
                  placeholder="+ add"
                  value={genreAdd}
                  onChange={(ev) => setGenreAdd(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" && genreAdd.trim() !== "") {
                      if (!genre.includes(genreAdd.trim())) setGenre([...genre, genreAdd.trim()]);
                      setGenreAdd("");
                    }
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}
      {(hasBundle("status") || e.status != null) && (
        <div className="finput">
          <span className="flabel">Status</span>
          <select className="fbox" value={status} onChange={(ev) => setStatus(ev.target.value)}>
            <option value="">—</option>
            {STATUS_ANCHORS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}
      {!creation && (
        <>
          <div className="frow2">
            {hasBundle("rating") && (
              <div className="finput">
                <span className="flabel">Rating</span>
                <select className="fbox" value={rating} onChange={(ev) => setRating(ev.target.value)}>
                  <option value="">—</option>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {stars(n)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {hasBundle("priority") && (
              <div className="finput">
                <span className="flabel">Priority</span>
                <select className="fbox" value={priority} onChange={(ev) => setPriority(ev.target.value)}>
                  <option value="">—</option>
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="frow2">
            {hasBundle("purchased") && (
              <div className="finput">
                <span className="flabel">Purchased</span>
                <label className="fbox checkrow">
                  <input
                    type="checkbox"
                    checked={purchased}
                    onChange={(ev) => setPurchased(ev.target.checked)}
                  />{" "}
                  owned
                </label>
              </div>
            )}
            <div className="finput">
              <span className="flabel">Series · order</span>
              <div className="frow2 tight">
                <input className="fbox" value={series} onChange={(ev) => setSeries(ev.target.value)} placeholder="—" />
                <input
                  className="fbox"
                  value={seriesOrder}
                  onChange={(ev) => setSeriesOrder(ev.target.value)}
                  placeholder="#"
                />
              </div>
            </div>
          </div>
        </>
      )}
      {creation && (
        <>
          <div className="finput">
            <span className="flabel">Fandom</span>
            <input className="fbox" value={fandom} onChange={(ev) => setFandom(ev.target.value)} />
          </div>
          <div className="frow2">
            <div className="finput">
              <span className="flabel">Started</span>
              <input
                className="fbox"
                value={started}
                onChange={(ev) => setStarted(ev.target.value)}
                placeholder="YYYY-MM-DD"
              />
            </div>
            <div className="finput">
              <span className="flabel">Completed</span>
              <input
                className="fbox"
                value={completed}
                onChange={(ev) => setCompleted(ev.target.value)}
                placeholder="YYYY-MM-DD"
              />
            </div>
          </div>
        </>
      )}
      <div className="finput">
        <span className="flabel">Description</span>
        <textarea className="fbox area" value={desc} onChange={(ev) => setDesc(ev.target.value)} />
      </div>
      <div className="prov">{m.rail.provenance} · read-only (provenance is not an editable field)</div>
      {err && <div className="fieldnote err">{err}</div>}
      <div className="railactions">
        <button className="btn-accent" style={{ flex: 1 }} onClick={save}>
          ✓ Done
        </button>
        <button className="btn-plain" onClick={onClose}>
          Cancel
        </button>
      </div>
      <div className="raildanger">
        {/* LIVE since the step-6 catch-up — tier 2 of [[Delete Safety & Undo]]:
            no confirm, the ~10 s undo toast IS the net; the cascade tombstones
            the entry + its sessions and undo flips them back. The deferred
            image-file half has no work until the cloud root exists (step 14). */}
        <button
          className="btn-danger"
          onClick={() => {
            const label = e.title;
            void deleteEntriesCascade([data.entryId!]).then((res) => {
              if (!res.ok) {
                showErrorToast("The entry could not be deleted — some rows were rejected.");
                return;
              }
              showUndoToast(`Deleted “${label}”`, res.undo);
              onDeleted?.();
            });
          }}
        >
          🗑 Delete entry
        </button>
        <div className="dangernote">No confirm — an undo toast (~10 s) is the way back.</div>
      </div>
    </div>
  );
}

// ── The wave band (kit-timeline-waves) ────────────────────────────────────────
// Box-sized viewBox (the step-4 ruling, via the shared ./useBox hook); waves =
// filled area hills, breaks = washed rects with dashed edges + a rotated
// duration label (the honesty mark), markers = dashed bookend lines. Geometry
// mirrors the FINAL's drawWaves.

// ── The wave zone (the 2026-07-24 rulings) ────────────────────────────────────
// Band (scrolling axis — never crams below --wave-bucket-min) + the wave lane
// (a capsule per wave, floored at --wave-cap-min, every wave numbered) + the
// chapter track (one captioned rule per era, captions degrade when crowded) +
// the wave TABLE (replaces the card row — eras group, interludes collapse).
// Band ↔ table linking: hover lights, click selects both ways; selection is
// view state and survives repaint. The band is built imperatively in a layout
// effect — caption degradation and numeral nudging are measurement-driven.

const arrayEq = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

function rowKey(r: WaveTableRow): string {
  return r.kind === "era" ? `e${r.eraN}` : r.kind === "wave" ? `w${r.n}` : r.groupId;
}
function rowNums(r: WaveTableRow): number[] {
  return r.kind === "wave" ? [r.n] : r.waveNums;
}

function WaveZone({ waves, colorVar }: { waves: WavesSpec; colorVar: string }) {
  const [sel, setSel] = useState<number[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const bandApi = useRef<{ scrollToWave: (n: number) => void } | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);

  const pick = (ids: number[], fromTable = false) => {
    const next = arrayEq(ids, sel) ? [] : ids;
    setSel(next);
    if (next.length === 0) return;
    // a selection must be visible: expand a collapsed interlude group…
    const hidden = waves.table.rows.find(
      (r) => r.kind === "wave" && r.groupId != null && next.includes(r.n),
    );
    if (hidden && hidden.kind === "wave" && hidden.groupId != null)
      setOpen((o) => ({ ...o, [hidden.groupId!]: true }));
    // …and the band scrolls to it when the pick came from the table.
    if (fromTable) bandApi.current?.scrollToWave(next[0]);
  };

  // Scroll the table to the selected row (centered) once it exists.
  useEffect(() => {
    if (sel.length === 0) return;
    const t = tableRef.current;
    if (!t) return;
    const row =
      t.querySelector<HTMLElement>(`tr[data-sel="1"]`) ?? null;
    if (row) {
      const wr = t.getBoundingClientRect();
      const rr = row.getBoundingClientRect();
      t.scrollTop += rr.top - wr.top - (wr.height / 2 - rr.height / 2);
    }
  }, [sel, open]);

  return (
    <Panel title="Wave timeline">
      <div className="waveheadrow">
        <span className="wavecount">
          {waves.countLabel}
          {waves.subLabel && <span className="wsub">{waves.subLabel}</span>}
        </span>
      </div>
      <WaveBand
        waves={waves}
        colorVar={colorVar}
        sel={sel}
        onPick={pick}
        onHover={setHover}
        apiRef={bandApi}
      />
      <WaveTable
        t={waves.table}
        sel={sel}
        hover={hover}
        open={open}
        onToggle={(id) => setOpen((o) => ({ ...o, [id]: !o[id] }))}
        onPick={(ids) => pick(ids, true)}
        wrapRef={tableRef}
      />
    </Panel>
  );
}

// ── The band (imperative builder — ported from the agreed exhibit face) ───────

const SVGNS = "http://www.w3.org/2000/svg";

function WaveBand({
  waves,
  colorVar,
  sel,
  onPick,
  onHover,
  apiRef,
}: {
  waves: WavesSpec;
  colorVar: string;
  sel: number[];
  onPick: (ids: number[]) => void;
  onHover: (n: number | null) => void;
  apiRef: React.MutableRefObject<{ scrollToWave: (n: number) => void } | null>;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const scrolledRef = useRef(false);
  const [tick, setTick] = useState(0);

  // The band is built imperatively in an effect that deliberately does NOT
  // re-run on selection (deps exclude sel/onPick, so a pick doesn't rebuild the
  // whole canvas). Its click handlers must therefore read the LATEST onPick/sel
  // through refs — capturing them in the closure would use stale values.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const selRef = useRef(sel);
  selRef.current = sel;

  // Redraw on resize (the scrollport width drives content width).
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    let ro: ResizeObserver | null = null;
    const bump = () => setTick((t) => t + 1);
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(bump);
      ro.observe(el);
    }
    window.addEventListener("resize", bump);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", bump);
    };
  }, []);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const prevScroll = scrolledRef.current ? host.scrollLeft : null;
    host.innerHTML = "";

    const cs = getComputedStyle(host);
    const dial = (name: string, fb: number) => parseFloat(cs.getPropertyValue(name)) || fb;
    const laneH = dial("--wave-lane-h", 14);
    const capMin = dial("--wave-cap-min", 5);
    const laneGap = dial("--wave-lane-gap", 8);
    const numH = dial("--wave-num-h", 14);
    const eraH = dial("--wave-era-h", 34);
    const minBW = dial("--wave-bucket-min", 26);
    const breakW = dial("--wave-break-w", 70);
    const scrollbarH = dial("--wave-scrollbar-h", 10);

    const avail = host.clientWidth;
    const H = host.clientHeight; // live height — the scrollbar eats into the slot
    const padX = 14;
    // Headroom holds the chapter track: era RULE at eraRuleY with its plain
    // label just above it, and bookend marker labels above THAT. eraH is the
    // whole headroom (was eraH*2 — a vast empty gap that floated the rules
    // disconnected from the curve; the 2026-07-24 coherence pass).
    // Headroom rows (top→down): marker labels · era labels · era rule · curve.
    // Kept as distinct bands so the era caption never sits on its rule line.
    const hasEras = waves.eras.length > 0;
    const padT = hasEras ? eraH + 8 : 24;
    const eraRuleY = hasEras ? padT - 6 : 0; // rule just above the curve
    const eraLabY = hasEras ? padT - 26 : 0; // caption its own row above the rule
    const markLabY = 2; // bookend labels at the very top of the headroom
    // The bottom stack breathes on --wave-lane-gap (the 2026-07-24 spacing
    // pass): baseline → gap → lane → ½gap → numerals → ½gap → month+year axis,
    // then the reserved scrollbar band so the axis clears the (always-visible)
    // horizontal scrollbar — clientHeight doesn't reliably subtract it.
    const labH = 18; // the single month/year axis row
    // stack: gap · lane · gap · numerals · gap · axis · axisGap · scrollbar
    const axisGap = laneGap; // clear space between the axis row and the scrollbar
    const padB = 3 * laneGap + laneH + numH + labH + axisGap + scrollbarH;
    const parts = waves.parts;
    let nB = 0;
    let totB = 0;
    let maxV = 1e-9;
    for (const p of parts) {
      if (p.kind === "break") nB++;
      else {
        totB += p.buckets.length;
        for (const b of p.buckets) if (b.v > maxV) maxV = b.v;
      }
    }
    // The scrolling-axis ruling: a bucket never falls below --wave-bucket-min;
    // past that the band grows wider than its slot and the slot scrolls.
    const W = Math.max(avail, 2 * padX + nB * breakW + totB * minBW);
    const bw = Math.max(minBW, (W - 2 * padX - nB * breakW) / totB);
    const Y0 = H - padB;
    const laneY = Y0 + laneGap;
    const numY = laneY + laneH + laneGap;
    const labY = numY + numH + laneGap;
    const ty = (v: number) => padT + (H - padT - padB) * (1 - v / maxV);

    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    // Force the SVG's rendered box to EXACTLY W×H (px), overriding the CSS
    // width/height:100%. That makes box == viewBox, so viewBox units map 1:1 to
    // px and the SVG curve lands on the px-positioned HTML overlay (capsules,
    // era rules, labels). The mismatch — box ≠ viewBox → aspect-scaling drift —
    // was the real "all over the place" bug, invisible to the pure-math probe.
    svg.setAttribute("preserveAspectRatio", "none");
    svg.style.width = `${W}px`;
    svg.style.height = `${H}px`;
    const ov = document.createElement("div");
    ov.className = "waveoverlay";
    const line = (x1: number, x2: number, y1: number, y2: number, stroke: string, dash?: string, w?: number, cap?: string) => {
      const l = document.createElementNS(SVGNS, "line");
      l.setAttribute("x1", String(x1));
      l.setAttribute("x2", String(x2));
      l.setAttribute("y1", String(y1));
      l.setAttribute("y2", String(y2));
      l.setAttribute("stroke", stroke);
      if (dash) l.setAttribute("stroke-dasharray", dash);
      if (cap) l.setAttribute("stroke-linecap", cap);
      l.setAttribute("stroke-width", String(w ?? 1));
      svg.appendChild(l);
    };
    // Month/year gridlines live in their own group, PREPENDED after the loop so
    // they paint behind the curve (a chart's gridlines sit under the data).
    const grid = document.createElementNS(SVGNS, "g");
    const gridline = (x: number, stroke: string) => {
      const l = document.createElementNS(SVGNS, "line");
      l.setAttribute("x1", String(x));
      l.setAttribute("x2", String(x));
      l.setAttribute("y1", String(padT));
      l.setAttribute("y2", String(Y0));
      l.setAttribute("stroke", stroke);
      l.setAttribute("stroke-width", "1");
      grid.appendChild(l);
    };
    line(padX, W - padX, Y0, Y0, "var(--border)");

    const hue = `var(${colorVar})`;
    let cursor = padX;
    let lastNum = -1e9;
    const eraLabs: { el: HTMLElement; ea: number; eb: number }[] = [];
    // Wave segments accumulate so a GLOBAL day→x exists for markers (which
    // draw after the loop). Edge-pinning drifted them off the data (the
    // 2026-07-24 coherence pass).
    const segs: { x0: number; x1: number; buckets: WaveBucket[] }[] = [];
    const dayToXGlobal = (d: string): number => {
      for (const sg of segs) {
        for (let i = 0; i < sg.buckets.length; i++) {
          const b = sg.buckets[i];
          const off = dayGap(b.s, d);
          if (off >= 0 && off < b.len) return sg.x0 + bw * (i + off / b.len);
        }
      }
      // outside every run (a break gap or the ends) → clamp to the nearest edge
      if (segs.length === 0) return padX;
      if (d < segs[0].buckets[0].s) return padX;
      const lastSeg = segs[segs.length - 1];
      return Math.min(lastSeg.x1, W - padX);
    };

    for (const p of parts) {
      if (p.kind === "break") {
        const b0 = cursor;
        const b1 = cursor + breakW;
        const rect = document.createElementNS(SVGNS, "rect");
        rect.setAttribute("x", String(b0));
        rect.setAttribute("y", String(padT - 8));
        rect.setAttribute("width", String(breakW));
        rect.setAttribute("height", String(Y0 - (padT - 8)));
        rect.setAttribute("fill", "color-mix(in oklch, var(--text-muted), transparent var(--wave-shade-mix))");
        svg.appendChild(rect);
        line(b0, b0, padT - 8, Y0, "var(--text-muted)", "3 3");
        line(b1, b1, padT - 8, Y0, "var(--text-muted)", "3 3");
        const bl = document.createElement("span");
        bl.className = "wbreaklab";
        bl.textContent = p.label;
        bl.style.left = `${(b0 + b1) / 2}px`;
        // vertical center of the break RECT (not the whole band — the era
        // headroom + bottom stack pushed 50% off the box)
        bl.style.top = `${(padT - 8 + Y0) / 2}px`;
        ov.appendChild(bl);
        cursor = b1;
        continue;
      }
      const x0 = cursor;
      const x1 = cursor + p.buckets.length * bw;
      segs.push({ x0, x1, buckets: p.buckets });
      // the curve (area fill KEPT — user-ruled 2026-07-24, the doc line was an accident)
      if (p.buckets.length === 1) {
        const xs = x0 + bw * 0.5;
        line(xs, xs, Y0, Math.min(ty(p.buckets[0].v), Y0 - 3), hue, undefined, 2.5, "round");
      } else {
        const tops = p.buckets.map((b, i) => `${(x0 + bw * (i + 0.5)).toFixed(1)} ${ty(b.v).toFixed(1)}`).join(" L ");
        const area = document.createElementNS(SVGNS, "path");
        area.setAttribute("d", `M ${x0 + bw * 0.5} ${Y0} L ${tops} L ${x1 - bw * 0.5} ${Y0} Z`);
        area.setAttribute("fill", `color-mix(in oklch, ${hue}, transparent var(--chart-area-mix))`);
        svg.appendChild(area);
        const ln = document.createElementNS(SVGNS, "path");
        ln.setAttribute("d", `M ${tops}`);
        ln.setAttribute("fill", "none");
        ln.setAttribute("stroke", hue);
        ln.setAttribute("stroke-width", "2.5");
        ln.setAttribute("stroke-linejoin", "round");
        ln.setAttribute("stroke-linecap", "round");
        svg.appendChild(ln);
      }
      // day → x inside this run (buckets carry calendar anchors)
      const dayToX = (d: string): number => {
        for (let i = 0; i < p.buckets.length; i++) {
          const b = p.buckets[i];
          const off = dayGap(b.s, d);
          if (off >= 0 && off < b.len) return x0 + bw * (i + off / b.len);
        }
        return d < p.buckets[0].s ? x0 : x1;
      };
      // the wave lane
      const track = document.createElement("div");
      track.className = "wlanetrack";
      track.style.left = `${x0}px`;
      track.style.width = `${x1 - x0}px`;
      track.style.top = `${laneY}px`;
      ov.appendChild(track);
      for (const lw of p.waves) {
        const a = dayToX(lw.start);
        const b = dayToX(dayFromIndex(dayIndex(lw.end) + 1));
        const wd = Math.max(b - a, capMin);
        const cap = document.createElement("div");
        cap.className = "wcap";
        cap.style.left = `${a}px`;
        cap.style.width = `${wd}px`;
        cap.style.top = `${laneY}px`;
        cap.dataset.wave = String(lw.n);
        if (wd >= 18) cap.textContent = String(lw.n); // fits-inside threshold (mechanics)
        cap.title = `${lw.tip} — click to open its row`;
        cap.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onPickRef.current([lw.n]);
        });
        cap.addEventListener("mouseenter", () => {
          onHover(lw.n);
          const nm = ov.querySelector(`.wcapnum[data-wave="${lw.n}"]`);
          nm?.classList.add("on");
        });
        cap.addEventListener("mouseleave", () => {
          onHover(null);
          ov.querySelectorAll(".wcapnum.on").forEach((x) => x.classList.remove("on"));
        });
        ov.appendChild(cap);
        // every wave carries its number: inside when it fits, in the numeral
        // row below when it doesn't (nudged apart when neighbours crowd)
        if (wd < 18) {
          const own = a + wd / 2;
          let cx = own;
          const half = (String(lw.n).length * 6) / 2 + 2;
          // nudge apart on collision, but never drift more than ~a capsule's
          // reach from the wave it labels (the 2026-07-24 coherence pass —
          // unbounded nudging strung numbers away from their capsules)
          if (cx - half < lastNum) cx = Math.min(lastNum + half, own + capMin + 4);
          lastNum = cx + half;
          const nm = document.createElement("span");
          nm.className = "wcapnum";
          nm.textContent = String(lw.n);
          nm.dataset.wave = String(lw.n);
          nm.style.left = `${cx}px`;
          nm.style.top = `${numY}px`;
          ov.appendChild(nm);
        }
      }
      // the chapter track — one PLAINLY-labelled rule per era in the headroom
      // (user-ruled 2026-07-24: no span/amount clauses — they threw off the labels)
      if (waves.eras.length > 0) {
        const eY = eraRuleY;
        const rs = p.waves[0]?.start ?? "9999";
        const re = p.waves[p.waves.length - 1]?.end ?? "0000";
        for (const e of waves.eras) {
          if (e.end < rs || e.start > re) continue;
          const ea = dayToX(e.start);
          const eb = dayToX(dayFromIndex(dayIndex(e.end) + 1));
          line(ea, eb, eY, eY, hue, undefined, 1.5, "round");
          line(ea, ea, eY - 4, eY + 4, hue, undefined, 1.5);
          line(eb, eb, eY - 4, eY + 4, hue, undefined, 1.5);
          const doPick = (ev: Event) => {
            ev.stopPropagation();
            onPickRef.current(e.waveNums);
          };
          const hit = document.createElement("div");
          hit.className = "werahit";
          hit.style.left = `${ea}px`;
          hit.style.width = `${Math.max(eb - ea, 10)}px`;
          hit.style.top = `${eY - 9}px`;
          hit.title = `Era ${e.n} — click to open its row`;
          hit.addEventListener("click", doPick);
          ov.appendChild(hit);
          const el = document.createElement("span");
          el.className = "weralab";
          el.textContent = e.label;
          el.style.top = `${eraLabY}px`; // its own row above the rule
          el.addEventListener("click", doPick);
          ov.appendChild(el);
          eraLabs.push({ el, ea, eb });
        }
      }
      // The x-axis: a month tier (3-letter labels) + a year tier below it.
      // Month density adapts to the bucket width so labels never collide; a
      // tick sits under every drawn label. January always draws so the year
      // tier lands on a real boundary.
      {
        const monthPx = bw * (30.4375 / 7);
        const step = monthPx >= 42 ? 1 : monthPx >= 26 ? 2 : monthPx >= 16 ? 3 : 6;
        let prevMk = "";
        let mIdx = 0;
        p.buckets.forEach((b, i) => {
          const mk = monthKey(b.s);
          if (mk === prevMk) return;
          prevMk = mk;
          const mo = Number(mk.slice(5));
          const isJan = mo === 1;
          const x = x0 + bw * i;
          if (x < x0 - 0.5 || x > x1 + 0.5) {
            mIdx++;
            return;
          }
          if (isJan || mIdx % step === 0) {
            // vertical gridline: stronger at years (January), faint at months
            gridline(x, isJan ? "var(--border)" : "var(--divider)");
            line(x, x, Y0, Y0 + 4, "var(--divider)");
            const tk = document.createElement("span");
            // January carries the year inline ("Jan 2024", bold) so the axis
            // shows both months and years on one always-visible row.
            tk.className = `wxlab tick${isJan ? " yrlab" : ""}`;
            tk.textContent = isJan ? `${MONTHS_SHORT[0]} ${mk.slice(0, 4)}` : MONTHS_SHORT[mo - 1];
            tk.style.left = `${x}px`;
            tk.style.top = `${labY}px`;
            ov.appendChild(tk);
          }
          mIdx++;
        });
      }
      cursor = x1;
    }

    // Bookend markers at their TRUE day (2026-07-24 coherence pass — the line
    // and its label were pinned to the band edge, adrift from the data).
    for (const mk of waves.markers) {
      const x = Math.max(padX, Math.min(dayToXGlobal(mk.day), W - padX));
      line(x, x, padT - 8, Y0, `var(${mk.colorVar})`, "4 3", 1.5);
      const lb = document.createElement("span");
      // flip the label to the inner side near a band edge so it stays on-canvas
      const flip = x > W - padX - 90;
      lb.className = `wmarklab${flip ? " end" : ""}`;
      lb.textContent = mk.label;
      lb.style.left = `${x}px`;
      lb.style.top = `${markLabY}px`;
      lb.style.color = `var(${mk.colorVar})`;
      ov.appendChild(lb);
    }

    // gridlines behind the curve (SVG paints in document order)
    svg.insertBefore(grid, svg.firstChild);

    const scroll = document.createElement("div");
    scroll.className = "wavescroll";
    scroll.style.width = `${W}px`;
    scroll.appendChild(svg);
    scroll.appendChild(ov);
    scroll.addEventListener("click", () => onPickRef.current(selRef.current)); // blank click clears
    host.appendChild(scroll);

    // opens pinned to today (right edge); a user scroll survives repaint
    host.scrollLeft = prevScroll == null ? W - host.clientWidth : prevScroll;

    // chapter captions CENTER on their own rule (2026-07-24 coherence pass —
    // left-edge placement scattered them off their rules); eras are chronological,
    // so a light L→R nudge only bites when two rules nearly touch.
    let prevEraR = -1e9;
    for (const L of eraLabs) {
      const w = L.el.offsetWidth;
      let left = (L.ea + L.eb) / 2 - w / 2;
      if (left < prevEraR + 6) left = prevEraR + 6;
      left = Math.max(padX, Math.min(left, W - padX - w));
      L.el.style.left = `${left}px`;
      prevEraR = left + w;
    }

    apiRef.current = {
      scrollToWave: (n: number) => {
        const cap = ov.querySelector<HTMLElement>(`.wcap[data-wave="${n}"]`);
        if (!cap) return;
        const bl = cap.offsetLeft;
        const bw2 = cap.offsetWidth;
        if (bl < host.scrollLeft || bl + bw2 > host.scrollLeft + host.clientWidth)
          host.scrollLeft = Math.max(0, bl + bw2 / 2 - host.clientWidth / 2);
      },
    };
    const markScrolled = () => {
      scrolledRef.current = true;
    };
    host.addEventListener("scroll", markScrolled);
    return () => host.removeEventListener("scroll", markScrolled);
    // sel is intentionally NOT a dep — selection classes apply in the effect
    // below so a pick never rebuilds (and never re-pins) the band.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waves, colorVar, tick]);

  // selection classes survive repaint (view state, applied post-draw)
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.querySelectorAll(".sel").forEach((x) => x.classList.remove("sel"));
    for (const n of sel) {
      host.querySelector(`.wcap[data-wave="${n}"]`)?.classList.add("sel");
      host.querySelector(`.wcapnum[data-wave="${n}"]`)?.classList.add("sel");
    }
  }, [sel, tick, waves]);

  return <div className="waveband lane" ref={hostRef} />;
}

// ── The wave table ────────────────────────────────────────────────────────────

function WaveTable({
  t,
  sel,
  hover,
  open,
  onToggle,
  onPick,
  wrapRef,
}: {
  t: WavesSpec["table"];
  sel: number[];
  hover: number | null;
  open: Record<string, boolean>;
  onToggle: (groupId: string) => void;
  onPick: (ids: number[]) => void;
  wrapRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  const exactSel = (r: WaveTableRow): boolean =>
    sel.length > 0 &&
    (r.kind === "wave"
      ? sel.length === 1 && r.n === sel[0]
      : arrayEq(rowNums(r), sel));
  // fallback: a group row marks when it CONTAINS the selection and no exact row shows
  const anyExact = t.rows.some(exactSel);
  const marks = (r: WaveTableRow): boolean =>
    exactSel(r) || (!anyExact && sel.length > 0 && r.kind !== "wave" && sel.every((n) => rowNums(r).includes(n)));

  const comp = (c: WaveComp | null) =>
    c == null ? null : (
      <div className="ccell">
        <div className="cbar">
          {c.segs.map((s, i) => (
            <span key={i} style={{ width: `${s.pct.toFixed(1)}%`, background: `var(${s.colorVar})` }} />
          ))}
        </div>
        <span className="clbl">{c.label}</span>
      </div>
    );

  return (
    <div className="wtwrap" ref={wrapRef}>
      <table className="wtable">
        <thead>
          <tr>
            <th>Wave</th>
            <th>Span</th>
            <th className="n">Days</th>
            <th className="n">{t.amountHeader}</th>
            <th className="n">Best day</th>
            <th className="n">{t.perDayHeader}</th>
            {t.hasComp && <th>Composition</th>}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r) => {
            if (r.kind === "wave" && r.groupId != null && !open[r.groupId]) return null;
            const selMark = marks(r);
            const hl = !selMark && hover != null && rowNums(r).includes(hover);
            const cls =
              r.kind === "wave"
                ? `wrow${r.groupId != null ? " sub" : ""}`
                : r.kind === "era"
                  ? "grow era"
                  : `grow int${open[r.groupId] ? " open" : ""}`;
            return (
              <tr
                key={rowKey(r)}
                className={`${cls}${selMark ? " sel" : ""}${hl ? " hl" : ""}`}
                data-sel={selMark ? "1" : undefined}
                style={{ cursor: "pointer" }}
                onClick={() => (r.kind === "interludes" ? onToggle(r.groupId) : onPick(rowNums(r)))}
              >
                <td>
                  <span className="wlabel">
                    {r.kind === "interludes" ? (
                      <>
                        <span className="chev">▸</span>
                        {r.count} interlude{r.count === 1 ? "" : "s"}
                      </>
                    ) : (
                      <>
                        <span className="wdot" />
                        {r.kind === "era"
                          ? `Era ${r.eraN}${r.soloWave != null ? ` · Wave ${r.soloWave}` : ""}`
                          : `Wave ${r.n}`}
                      </>
                    )}
                  </span>
                </td>
                <td className="span">{r.span}</td>
                <td className="n">{r.figs.days}</td>
                <td className="n">{r.figs.amount}</td>
                <td className="n">{r.figs.best}</td>
                <td className="n">{r.figs.perDay}</td>
                {t.hasComp && <td>{comp(r.comp)}</td>}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>{t.foot.left}</td>
            <td className="span">{t.foot.span}</td>
            <td className="n">{t.foot.figs.days}</td>
            <td className="n">{t.foot.figs.amount}</td>
            <td className="n">{t.foot.figs.best}</td>
            <td className="n">{t.foot.figs.perDay}</td>
            {t.hasComp && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── The word-growth curve (creation two-measure) ──────────────────────────────

function GrowthCurve({ g, colorVar }: { g: GrowthSpec; colorVar: string }) {
  const { ref, w, h } = useBox<HTMLDivElement>();
  const padL = 56;
  const padR = 16;
  const padT = 20;
  const padB = 20;
  const X = (x: number) => padL + (w - padL - padR) * x;
  const Y = (v: number) => padT + (h - padT - padB) * (1 - v / g.vmax);

  const pts = g.points.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`);
  const dLine = pts.join(" ");
  const last = g.points[g.points.length - 1];

  return (
    <div className="growth" ref={ref}>
      {w > 0 && (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
          {/* wave shading + hiatus hatching */}
          <defs>
            <pattern id="ghatch" width="9" height="9" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="9" stroke="var(--divider)" strokeWidth="2" />
            </pattern>
          </defs>
          {g.shades.map((s, i) => (
            <rect
              key={`s${i}`}
              x={X(s.x0)}
              y={padT}
              width={Math.max(0, X(s.x1) - X(s.x0))}
              height={h - padT - padB}
              fill={`color-mix(in oklch, var(${colorVar}), transparent var(--wave-shade-mix))`}
            />
          ))}
          {g.hatches.map((s, i) => (
            <rect
              key={`h${i}`}
              x={X(s.x0)}
              y={padT}
              width={Math.max(0, X(s.x1) - X(s.x0))}
              height={h - padT - padB}
              fill="url(#ghatch)"
            />
          ))}
          {/* the computed nice-step axis rungs (entrySpec replaced the fixed
              ladder here — the ladder survives only as `crossings`) */}
          <g stroke="var(--divider)" strokeDasharray="4 3" strokeWidth={1}>
            {g.rungs.map((r) => (
              <line key={r.value} x1={padL} x2={w - padR} y1={Y(r.value)} y2={Y(r.value)} />
            ))}
          </g>
          <g fill="var(--text-muted)" textAnchor="end" style={{ font: "var(--size-caption) var(--font-mono)" }}>
            {g.rungs.map((r) => (
              <text key={r.value} x={padL - 8} y={Y(r.value) + 4}>
                {r.label}
              </text>
            ))}
          </g>
          <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="var(--border)" strokeWidth={1} />
          <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="var(--border)" strokeWidth={1} />
          {/* the cumulative curve */}
          <path
            d={`M${dLine.replace(/ /g, " L")} L${X(1).toFixed(1)},${(h - padB).toFixed(1)} L${X(0).toFixed(1)},${(h - padB).toFixed(1)} Z`}
            fill={`color-mix(in oklch, var(${colorVar}), transparent var(--chart-area-mix))`}
          />
          <polyline
            fill="none"
            stroke={`var(${colorVar})`}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={dLine}
          />
          {/* milestone crossings */}
          <g fill="var(--accent)">
            {g.crossings.map((c, i) => (
              <circle key={i} cx={X(c.x)} cy={Y(c.y)} r={4} />
            ))}
          </g>
          {/* the started bookend */}
          {g.startedX != null && (
            <line
              x1={X(g.startedX)}
              x2={X(g.startedX)}
              y1={padT}
              y2={h - padB}
              stroke="var(--verdict-done)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          )}
          {last && <circle cx={X(last.x)} cy={Y(last.y)} r={5} fill={`var(${colorVar})`} />}
          {last && (
            <text
              x={X(last.x) - 9}
              y={Y(last.y) - 9}
              textAnchor="end"
              fill={`var(${colorVar})`}
              fontWeight="var(--weight-bold)"
              style={{ font: "var(--weight-bold) var(--size-small) var(--font-mono)" }}
            >
              {g.total.label}
            </text>
          )}
        </svg>
      )}
    </div>
  );
}

// ── The entry heatmap (no scope faces, no trio; measure toggle when two) ──────

function EntryHeatmap({ heatmap }: { heatmap: Omit<CreationModel["heatmap"], "trio"> }) {
  const [measure, setMeasure] = useState<"count" | "time">(heatmap.measures ? "count" : "time");

  const cellFace = (c: CreationHeatCell) => {
    if (c.day == null) return { style: { visibility: "hidden" } as CSSProperties, cls: "hcell", tip: undefined };
    const lvl = c.levels[measure];
    return { style: {}, cls: `hcell${lvl >= 1 ? ` l${lvl}` : ""}`, tip: `${c.day} · ${c.exact[measure]}` };
  };

  return (
    <Panel title="Activity heatmap">
      {heatmap.measures && (
        <div className="segrow">
          <span className="seglbl">Measure</span>
          <div className="seg5">
            {heatmap.measures.map((mm) => (
              <button key={mm.key} aria-pressed={mm.key === measure} onClick={() => setMeasure(mm.key)}>
                {mm.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="heat" style={heatPoolStyle(heatmap.cells, (c) => c.levels[measure])}>
        <div className="weekdays">
          <span className="wd" />
          {heatRowLabels().map((d, i) => (
            <span className="wd" key={i}>
              {d}
            </span>
          ))}
        </div>
        <div className="cols">
          <div className="months">
            {heatmap.months.map((mo) => (
              <span key={mo.col} style={{ gridColumnStart: mo.col + 1 }}>
                {mo.label}
              </span>
            ))}
          </div>
          <div className="cells">
            {heatmap.cells.map((c, i) => {
              const f = cellFace(c);
              return <div key={i} className={f.cls} style={f.style} title={f.tip} />;
            })}
          </div>
        </div>
      </div>
      <div className="heatfoot">
        <span className="ramp">
          Less{" "}
          {[0, 1, 2, 3, 4].map((k) => (
            <span key={k} className={`sw sw${k}`} />
          ))}{" "}
          More · intensity = {heatmap.measureNoun[measure]}
        </span>
      </div>
    </Panel>
  );
}

// ── The day log (Year › Month tree) ───────────────────────────────────────────
// Day rows are DOORS to their cover walls — LIVE since 2026-07-27, when Daily
// state 2 landed (they were inert on the chunk-4 day-cell precedent).

function DayLog({ log, onOpenDay }: { log: DayLogSpec; onOpenDay?: (day: string) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const y of log.years) {
      o[`y${y.label}`] = y.open;
      for (const mo of y.months) o[`m${y.label}-${mo.label}`] = mo.open;
    }
    return o;
  });
  const flip = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const Chev = () => (
    <svg className="ico chev" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );

  if (log.years.length === 0) return <div className="pcap">No sessions logged yet.</div>;

  return (
    <div className="log">
      {log.years.map((y) => (
        <div className="lyear" key={y.label} data-open={open[`y${y.label}`] ? "1" : "0"}>
          <div className="yr" onClick={() => flip(`y${y.label}`)}>
            <Chev />
            {y.label}
            <span className="ysum">{y.sum}</span>
          </div>
          <div className="lmonths">
            {y.months.map((mo) => (
              <div
                className="lmonth"
                key={mo.label}
                data-open={open[`m${y.label}-${mo.label}`] ? "1" : "0"}
              >
                <div className="mo" onClick={() => flip(`m${y.label}-${mo.label}`)}>
                  <Chev />
                  {mo.label}
                  <span className="msum">{mo.sum}</span>
                </div>
                <div className="ldays">
                  {mo.days.map((d) => (
                    <div
                      className={`day${onOpenDay ? " door" : ""}`}
                      key={d.day}
                      title={onOpenDay ? "Open this day's cover wall" : undefined}
                      role={onOpenDay ? "button" : undefined}
                      tabIndex={onOpenDay ? 0 : undefined}
                      onClick={onOpenDay ? () => onOpenDay(d.day) : undefined}
                      onKeyDown={
                        onOpenDay
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onOpenDay(d.day);
                              }
                            }
                          : undefined
                      }
                    >
                      <span className="dt">{d.label}</span>
                      <span className="dval">{d.val}</span>
                      {d.chips.map((c) => (
                        <span className="dchip" key={c}>
                          {c}
                        </span>
                      ))}
                      {d.best && <span className="best">{d.best}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
