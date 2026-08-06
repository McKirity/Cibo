/**
 * The Manage rows' quick-action pickers (Build step 10, slice 2) — kit-popover
 * tenants off a management row, translated from `Final/settings.html`
 * § QUICK-ACTION PICKERS:
 *
 *  - RECOLOUR — the 12-slot habit palette: hard-unique (taken swatches washed
 *    + locked), selected ring, custom-hex overflow (customColours.ts's
 *    mechanism; the input accepts #RRGGBB).
 *  - RE-ICON  — `kit-picker-icon`, the searchable lucide grid; the inventory
 *    is habitIcons.tsx's roster (the picker "inherits it" — CLAUDE.md's
 *    shell entry), searched by name. Since 2026-08-02 that roster is the real
 *    pinned lucide set (2003 names), so this is the drawn "searchable browser
 *    over ~1,500 names" rather than the eleven transcribed stand-ins it first
 *    shipped with.
 *
 * Both are `position: fixed` off the trigger's measured rect — the mscroll
 * pane scrolls, the NavCalendar popovers' lesson — and dismiss on click-out /
 * Esc via the shared useDismiss (wrapper-contained so the trigger stays a
 * toggle).
 */
import { useMemo, useRef, useState } from "react";
import { Ico, ICONS } from "../shell/icons";
import { HabitIcon, iconNames } from "../shell/habitIcons";
import { useDismiss, useOverlayEsc } from "../shell/overlayHooks";
import { customSlotName, isValidHex, writeCustomColour } from "./customColours";

const SLOTS = Array.from({ length: 12 }, (_, i) => `habit-${i + 1}`);

export function ColourPicker({
  habitKey,
  current,
  taken,
  anchor,
  onPick,
  onClose,
}: {
  habitKey: string;
  current: string;
  /** Slots owned by OTHER live habits — hard-unique, so they lock. */
  taken: ReadonlySet<string>;
  anchor: DOMRect;
  onPick: (slot: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose, { parentRoot: true });
  useOverlayEsc(onClose);
  const [hex, setHex] = useState("");

  const applyHex = () => {
    const v = hex.trim();
    if (!isValidHex(v)) return;
    void writeCustomColour(habitKey, v).then((ok) => {
      if (ok) onPick(customSlotName(habitKey));
    });
  };

  return (
    <div
      className="picker open"
      ref={ref}
      style={{ left: Math.max(8, anchor.right - 280), top: anchor.bottom + 6 }}
    >
      <p className="pk-title">Habit colour</p>
      <div className="pk-swatches">
        {SLOTS.map((slot) => {
          const isTaken = taken.has(slot) && slot !== current;
          const sel = slot === current;
          return (
            <button
              key={slot}
              className={`pksw${sel ? " sel" : ""}${isTaken ? " taken" : ""}`}
              style={{ background: `var(--${slot})` }}
              disabled={isTaken}
              data-tip={isTaken ? "Taken — colours are unique" : undefined}
              onClick={() => onPick(slot)}
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
        <span className="cs" style={isValidHex(hex.trim()) ? { background: hex.trim(), borderStyle: "solid" } : undefined}>
          {!isValidHex(hex.trim()) && <Ico d={ICONS.plus} />}
        </span>
        <span className="cl">Custom</span>
        <input
          className="hxin"
          value={hex}
          placeholder="#RRGGBB"
          spellCheck={false}
          onChange={(e) => setHex(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyHex();
          }}
        />
        <button className="btn-plain btn-sm" disabled={!isValidHex(hex.trim())} onClick={applyHex}>
          Use
        </button>
      </div>
    </div>
  );
}

export function IconPicker({
  current,
  anchor,
  onPick,
  onClose,
}: {
  current: string | null;
  anchor: DOMRect;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose, { parentRoot: true });
  useOverlayEsc(onClose);
  const [q, setQ] = useState("");

  /**
   * A SAMPLE grid, narrowed by search — which is the drawn face ("the
   * searchable lucide sample grid") and also the only sane way to show 2003
   * icons: rendering every match would mount two thousand live SVGs into a
   * 15rem scroller on each keystroke. The cap is generous enough that a real
   * search lands inside it, and the foot says plainly when it is hiding some.
   * Matching strips hyphens on both sides, so "gamepad2" and "gamepad-2" find
   * the same icon (habitIcons resolves names the same way).
   */
  const { shown, total } = useMemo(() => {
    const needle = q.trim().replace(/-/g, "").toLowerCase();
    // iconNames() builds the kebab roster on FIRST ASK — this picker is its
    // only reader, and it used to be built at launch (see habitIcons).
    const all = iconNames();
    const hits = needle === "" ? all : all.filter((n) => n.replace(/-/g, "").includes(needle));
    return { shown: hits.slice(0, SAMPLE_CAP), total: hits.length };
  }, [q]);

  return (
    <div
      className="picker open"
      ref={ref}
      style={{ left: Math.max(8, anchor.right - 280), top: anchor.bottom + 6 }}
    >
      <p className="pk-title">Habit icon</p>
      <div className="pk-search">
        <Ico d={ICONS.search} />
        <input
          value={q}
          placeholder="Search 2,000 icons…"
          spellCheck={false}
          autoFocus
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="pk-grid">
        {shown.map((name) => (
          <button
            key={name}
            className={`pkic${name === current ? " sel" : ""}`}
            data-tip={name}
            onClick={() => onPick(name)}
          >
            <HabitIcon icon={name} />
          </button>
        ))}
        {total === 0 && <span className="pk-none">No icon matches "{q.trim()}"</span>}
      </div>
      {total > shown.length && (
        <p className="pk-foot">
          {shown.length} of {total} — keep typing to narrow
        </p>
      )}
    </div>
  );
}

/** How many glyphs the grid mounts at once. */
const SAMPLE_CAP = 120;
