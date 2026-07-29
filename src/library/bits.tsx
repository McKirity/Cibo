/**
 * Shared atoms for the Library screen + its two modals — the cover-card
 * vocabulary (capsule fallback, status pill, stars, priority glyph), the
 * lucide-path icon helper, and the small popover menu the toolbar chips and
 * modal selects summon.
 *
 * The status pill is PARAMETRIZED on a `--pill-cat` custom property (the
 * frozen file wrote five fixed `s-*` classes; a data-driven vocab cannot be
 * enumerated at build time, so the tint rule reads the dial through the
 * property — the `--cell-ink`/`--rail-hue` precedent).
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { stars } from "../metrics/format";
import { coverAbbr, statusCatVar } from "./librarySpec";

export function Ico({ d, size }: { d: string[]; size?: number }) {
  return (
    <svg
      className="ico"
      viewBox="0 0 24 24"
      style={size != null ? { width: size, height: size } : undefined}
      aria-hidden="true"
    >
      {d.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

export const ICON = {
  search: ["M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z", "m21 21-4.3-4.3"],
  chevron: ["m6 9 6 6 6-6"],
  close: ["M18 6 6 18", "m6 6 12 12"],
  check: ["M20 6 9 17l-5-5"],
  plus: ["M5 12h14", "M12 5v14"],
  back: ["m12 19-7-7 7-7", "M19 12H5"],
  edit: ["M12 20h9", "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"],
  download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
  trash: [
    "M3 6h18",
    "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
    "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  ],
  image: [
    "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    "M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    "m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21",
  ],
  info: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 16v-4", "M12 8h.01"],
  calendar: ["M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M16 2v4", "M8 2v4", "M3 10h18"],
  grid: ["M3 4a1 1 0 0 1 1-1h6v7H3z", "M14 3h6a1 1 0 0 1 1 1v6h-7z", "M3 14h7v7H4a1 1 0 0 1-1-1z", "M14 14h7v6a1 1 0 0 1-1 1h-6z"],
  list: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
};

/** The no-cover face: the fallback hatch + mono lettermark. Real cover files
 * arrive with the importers/cloud root (steps 8 · 14) — until then every cover
 * wears this, which is the app's legitimate fallback look, never an error. */
export function Capsule({ title, className }: { title: string; className?: string }) {
  return (
    <div className={`capsule${className != null ? ` ${className}` : ""}`}>
      <span className="cwm">{coverAbbr(title)}</span>
    </div>
  );
}

export function StatusPill({ status, vocab }: { status: string; vocab: string[] }) {
  return (
    <span
      className="pill"
      style={{ "--pill-cat": `var(${statusCatVar(status, vocab)})` } as CSSProperties}
    >
      {status}
    </span>
  );
}

/** Rating glance: N WHOLE stars (user-ruled 2026-07-27 — ★★★★, never "★ 4";
 * the app-wide format, `metrics/format.stars`) or the none dash. */
export function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="rating none">—</span>;
  return (
    <span className="rating" title={`Rated ${rating} of 5`}>
      <span className="st">{stars(rating)}</span>
    </span>
  );
}

/** The read-only priority chevrons (0–3), list-view glance — never a control. */
export function PrioGlyph({ p }: { p: number }) {
  return (
    <span className="prio">
      {[0, 1, 2].map((i) => (
        <svg key={i} className={`ar${i < p ? " on" : ""}`} viewBox="0 0 12 7">
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
  );
}

export function Owned({ on }: { on: boolean }) {
  if (!on) return <span className="ownnone">—</span>;
  return (
    <span className="lown">
      <Ico d={ICON.check} />
    </span>
  );
}

// ── The popover menu (toolbar chips + modal selects) ─────────────────────────

export interface MenuItem {
  key: string;
  label: ReactNode;
  selected?: boolean;
  onPick: () => void;
}

/**
 * A minimal anchored menu wearing the app's shared popover surface (the
 * `.calpop`/`.timepop` recipe — border · radius-medium · raised + blur ·
 * shadow-high, opaque under reduce-effects): opens under its trigger,
 * click-out and Esc close. Not a route; one open at a time falls out of each
 * trigger owning its own open state.
 */
export function Menu({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // CAPTURE phase for both listeners, and the containment root is the
    // trigger WRAPPER (.tselwrap), not the menu alone. Capture matters: the
    // modal chassis stops mousedown propagation (its dim-click guard), so a
    // bubble-phase window listener never hears clicks inside a modal — the
    // "menu won't close until I pick something" bug. The wrapper root keeps
    // the trigger's own click a toggle instead of a close-then-reopen.
    const onDown = (e: MouseEvent) => {
      const root = ref.current?.parentElement ?? ref.current;
      if (root != null && !root.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  return (
    <div className="libmenu" ref={ref} role="menu">
      {items.map((it) => (
        <button
          key={it.key}
          className={`libmenu-item${it.selected ? " on" : ""}`}
          role="menuitem"
          onClick={() => {
            it.onPick();
            onClose();
          }}
        >
          {it.label}
          {it.selected && <Ico d={ICON.check} size={14} />}
        </button>
      ))}
    </div>
  );
}

/** A trigger + menu pairing for the drawn `.tsel` filter chip. */
export function FilterChip({
  k,
  value,
  active,
  delta,
  deltaTitle,
  items,
}: {
  k: string;
  value: string;
  active: boolean;
  /** The Medium delta — dashed + inert where the habit declares no type. */
  delta?: boolean;
  deltaTitle?: string;
  items: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  if (delta) {
    return (
      <span className="tsel delta" title={deltaTitle}>
        <span className="k">{k}</span>
        <b>—</b>
        <Ico d={ICON.chevron} size={14} />
      </span>
    );
  }
  return (
    <span className="tselwrap">
      <button className={`tsel${active ? " on" : ""}`} onClick={() => setOpen((o) => !o)}>
        <span className="k">{k}</span>
        <b>{value}</b>
        <Ico d={ICON.chevron} size={14} />
      </button>
      {open && <Menu items={items} onClose={() => setOpen(false)} />}
    </span>
  );
}
