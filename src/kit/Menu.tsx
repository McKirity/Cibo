/**
 * The app's ONE anchored popover menu (the `.libmenu` surface — border ·
 * radius-medium · panel background · shadow-high, opaque under
 * reduce-effects): opens under its trigger, click-out and Esc close. Not a
 * route; one open at a time falls out of each trigger owning its own open
 * state.
 *
 * Library-born; HOISTED to the kit 2026-07-30 (the dedup pass, wave 2) when
 * Comparing Statistics and Advanced Search became its second and third
 * consumers. The class NAME stays `.libmenu` (renames out of scope); the
 * rule family moved to kit.css with it.
 */
import { useRef, type ReactNode } from "react";
import { Ico, ICONS } from "../shell/icons";
import { useDismiss } from "../shell/overlayHooks";

export interface MenuItem {
  key: string;
  label: ReactNode;
  selected?: boolean;
  onPick: () => void;
}

export function Menu({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // CAPTURE phase for both listeners, and the containment root is the trigger
  // WRAPPER (`parentRoot` — e.g. .tselwrap), not the menu alone: the shared
  // useDismiss discipline. Capture matters because the modal chassis stops
  // mousedown propagation (its dim-click guard); the wrapper root keeps the
  // trigger's own click a toggle instead of a close-then-reopen.
  useDismiss(ref, onClose, { parentRoot: true });

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
          {it.selected && <Ico d={ICONS.check} size={14} />}
        </button>
      ))}
    </div>
  );
}
