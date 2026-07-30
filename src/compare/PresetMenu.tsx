/**
 * kit-menu-preset — the surface-anchored preset menu on kit-popover anatomy
 * (spec'd SHARED; Advanced Search is the second consumer). Three regions:
 * "This comparison" (Save current — names a PARTIAL config) · "Saved · synced"
 * (a row populates the saved fields, blanks stay manual; inline rename +
 * delete on hover) · the Manage door (Settings → Presets — built at step 10,
 * INERT until then, the placeheld-by-design pattern).
 */
import { useEffect, useRef, useState } from "react";
import { deletePreset, renamePreset, savePreset, usePresets, type Preset, type PresetCfg } from "./presets";

const IBookmark = () => (
  <svg className="ico" viewBox="0 0 24 24">
    <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);
const IChart = () => (
  <svg className="ico" viewBox="0 0 24 24">
    <path d="M3 3v18h18" />
    <path d="m7 12 3-3 4 4 5-6" />
  </svg>
);
const IPen = () => (
  <svg className="ico" viewBox="0 0 24 24">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);
const ITrash = () => (
  <svg className="ico" viewBox="0 0 24 24">
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
const IPlus = () => (
  <svg className="ico" viewBox="0 0 24 24">
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);
const IGear = () => (
  <svg className="ico" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
const ICaret = () => (
  <svg className="ico" viewBox="0 0 24 24">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export function PresetControl<C = PresetCfg>({
  currentCfg,
  hasCurrent,
  onApply,
  prefix,
}: {
  /** The live configuration in its stored (partial, verbatim) form. */
  currentCfg: C;
  /** Whether there is a comparison worth saving (the region hides when blank). */
  hasCurrent: boolean;
  onApply: (cfg: C) => void;
  /**
   * The app_meta key prefix — absent = CS's own roster. Advanced Search (the
   * spec'd second consumer) passes its mirror prefix so the two rosters never
   * mix in one menu.
   */
  prefix?: string;
}) {
  const presets = usePresets<C>(prefix);
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const shut = () => {
      setOpen(false);
      setNaming(false);
      setRenaming(null);
    };
    // Capture phase, the shared Menu's discipline — a bubble listener goes
    // deaf inside any surface that stops propagation.
    const onDown = (e: MouseEvent) => {
      if (boxRef.current != null && !boxRef.current.contains(e.target as Node)) shut();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // An Escape inside the naming/rename input cancels the INPUT (its own
      // handler), not the whole menu.
      const t = e.target;
      if (boxRef.current != null && t instanceof HTMLInputElement && boxRef.current.contains(t)) return;
      e.stopImmediatePropagation();
      shut();
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const commitSave = () => {
    const name = draft.trim();
    if (name.length > 0 && savePreset(name, currentCfg, prefix)) {
      setNaming(false);
      setDraft("");
    }
  };
  const commitRename = (p: Preset<C>) => {
    const name = draft.trim();
    if (name.length > 0 && renamePreset(p, name)) {
      setRenaming(null);
      setDraft("");
    }
  };

  return (
    <div className="presetwrap" ref={boxRef}>
      <button className="presetbtn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <IBookmark />
        Presets
        <span className="caret">
          <ICaret />
        </span>
      </button>
      <div className={`preset-menu${open ? " open" : ""}`}>
        {hasCurrent && (
          <>
            <div className="mh">This comparison</div>
            {naming ? (
              <div className="prow namer">
                <IPlus />
                <input
                  className="pnamein"
                  autoFocus
                  placeholder="Preset name…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitSave();
                    if (e.key === "Escape") {
                      setNaming(false);
                      setDraft("");
                    }
                  }}
                />
              </div>
            ) : (
              <button
                className="prow save"
                onClick={() => {
                  setNaming(true);
                  setRenaming(null);
                  setDraft("");
                }}
              >
                <IPlus />
                <span className="pn">Save current as preset…</span>
              </button>
            )}
          </>
        )}
        <div className="mh">Saved · synced</div>
        {presets.length === 0 && <div className="pempty">No presets yet.</div>}
        {presets.map((p) =>
          renaming === p.id ? (
            <div className="prow namer" key={p.id}>
              <IChart />
              <input
                className="pnamein"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(p);
                  if (e.key === "Escape") {
                    setRenaming(null);
                    setDraft("");
                  }
                }}
              />
            </div>
          ) : (
            <button
              className="prow"
              key={p.id}
              onClick={() => {
                onApply(p.cfg);
                setOpen(false);
              }}
            >
              <IChart />
              <span className="pn">{p.name}</span>
              <span className="pacts">
                <span
                  className="pact"
                  title="Rename"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenaming(p.id);
                    setNaming(false);
                    setDraft(p.name);
                  }}
                >
                  <IPen />
                </span>
                <span
                  className="pact del"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePreset(p);
                  }}
                >
                  <ITrash />
                </span>
              </span>
            </button>
          ),
        )}
        <div className="mdiv" />
        <button className="prow manage" title="Settings → Presets lands at Build step 10" disabled>
          <IGear />
          <span className="pn">Manage in Settings → Presets</span>
        </button>
      </div>
    </div>
  );
}
