/**
 * Shared atoms for the Library screen + its two modals — the cover-card
 * vocabulary (capsule fallback, status pill, stars, priority glyph) and the
 * lucide-path icon helper. The small popover menu the toolbar chips and modal
 * selects summon lives in kit/Menu.tsx (hoisted 2026-07-30), re-exported below.
 *
 * The status pill is PARAMETRIZED on a `--pill-cat` custom property (the
 * frozen file wrote five fixed `s-*` classes; a data-driven vocab cannot be
 * enumerated at build time, so the tint rule reads the dial through the
 * property — the `--cell-ink`/`--rail-hue` precedent).
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { stars } from "../metrics/format";
import { Menu, type MenuItem } from "../kit/Menu";
import { Ico, ICONS } from "../shell/icons";
import { coverAbbr, statusCatVar } from "./librarySpec";

// The popover menu HOISTED to the kit 2026-07-30 (the dedup pass — CS and
// Advanced Search made it three consumers); re-exported so library-internal
// import paths keep working.
export { Menu, type MenuItem };

// The icon wrapper + shared glyphs HOISTED to shell/icons 2026-07-30 (the
// dedup pass) — every path below was verified byte-identical against the
// shell roster before adopting. Re-exported (with the library's ICON name)
// so library consumers don't churn; the three glyphs the shell roster does
// not carry (download · image · info) stay local.
export { Ico };

export const ICON = {
  search: ICONS.search,
  chevron: ICONS.chevron,
  close: ICONS.close,
  check: ICONS.check,
  plus: ICONS.plus,
  back: ICONS.back,
  edit: ICONS.edit,
  trash: ICONS.trash,
  calendar: ICONS.calendar,
  download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
  image: [
    "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    "M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    "m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21",
  ],
  info: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 16v-4", "M12 8h.01"],
};

/** The no-cover face: the fallback hatch + mono lettermark — the app's
 * legitimate fallback look, never an error. Real covers land via the importers
 * (step 8, live); the remaining tenant is the import modal's pre-blob thumb
 * placeholder. */
export function Capsule({ title, className }: { title: string; className?: string }) {
  return (
    <div className={`capsule${className != null ? ` ${className}` : ""}`}>
      <span className="cwm">{coverAbbr(title)}</span>
    </div>
  );
}

// The cover FACE hoisted to kit/CoverArt.tsx 2026-07-31 (the same day it was
// born) — the entry rail, the 5★ hall and the bulk picker all needed it within
// the hour, which is exactly the second-reader trigger its watch note named.
// Re-exported so library-internal import paths keep working.
export { CoverArt, CoverInner, useCoverUrl } from "../kit/CoverArt";

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

/** The priority count's hover caption — the chevrons carry the reading, the
 *  title keeps the number reachable (the Advanced Search precedent, 08-15). */
export const prioTitle = (p: number): string => (p === 0 ? "Priority 0 — none" : `Priority ${p}`);

/** The read-only priority chevrons (0–3), a glance — never a control. */
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

/**
 * The 0–3 priority CHOOSER — the creation modal's `.ec-prio` face, hoisted
 * 2026-08-20 so the entry dashboard's edit face stops offering a native
 * `<select>` of numerals (user-ruled: chevrons, never numbers, everywhere a
 * priority shows). `value` null = nothing chosen yet (an imported entry that
 * never had one); None writes 0, which is what every filter already reads null
 * as (`e.priority ?? 0`).
 */
export function PrioPicker({
  value,
  onPick,
}: {
  value: number | null;
  onPick: (p: number) => void;
}) {
  return (
    <span className="ec-prio">
      {[0, 1, 2, 3].map((p) => (
        <button
          key={p}
          type="button"
          className={`po${value === p ? " on" : ""}`}
          title={prioTitle(p)}
          onClick={() => onPick(p)}
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
  );
}

/** A trigger + menu pairing for the drawn `.tsel` filter chip. */
export function FilterChip({
  k,
  value,
  active,
  items,
}: {
  k: string;
  /** A string, or a glyph — the priority chip shows its chevrons (2026-08-20). */
  value: ReactNode;
  active: boolean;
  items: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
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
