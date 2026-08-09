/**
 * The two shared dismissal disciplines.
 *
 * `useDismiss` — popover/menu dismissal on the CAPTURE phase for both
 * listeners: the modal chassis stops mousedown propagation (its dim-click
 * guard), so a bubble-phase window listener goes deaf inside any modal — the
 * "menu won't close until I pick something" bug. Escape closes AND
 * `stopImmediatePropagation()`s, so a popover's Escape never also reaches the
 * overlay under it.
 *
 * `useOverlayEsc` — overlay-tier Escape on the bubble phase with a module-
 * level stack: handlers register in mount order and only the LAST enabled one
 * fires. "Esc closes the top overlay only" (the ruled behavior) holds by
 * construction, however many overlays are mounted.
 */
import { useEffect, useRef, type RefObject } from "react";

/**
 * Close a popover on mousedown outside its subtree or on Escape (capture
 * phase, pre-empting stack handlers — the bits/PresetMenu discipline).
 * - `enabled` — attach only while open (default true).
 * - `escInInputs` — leave an Escape targeted at an <input> inside the root to
 *   the input's own handler (PresetMenu's rename-cancel exemption).
 * - `parentRoot` — contain against the ref's PARENT element (bits' Menu: the
 *   trigger wrapper, so the trigger's own click stays a toggle rather than a
 *   close-then-reopen). ⚠ Only meaningful when the wrapper is SMALL — a
 *   popover mounted at a pane root makes the whole pane the containment zone
 *   and the popover undismissable (`pickers-1`, 2026-08-09: the Manage
 *   pickers' header claimed "wrapper-contained" while mounting at the pane).
 * - `ignore` — a subtree whose mousedown is left alone: a DETACHED trigger
 *   (one that cannot share a wrapper with its popover) whose own click
 *   handler toggles. Without it the capture-phase close races that handler
 *   and every toggle becomes close-then-reopen. Pass a STABLE ref (useRef)
 *   holding the trigger element; prefer `parentRoot` when a wrapper exists.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  opts?: {
    enabled?: boolean;
    escInInputs?: boolean;
    parentRoot?: boolean;
    ignore?: RefObject<Element | null>;
  },
): void {
  const enabled = opts?.enabled ?? true;
  const escInInputs = opts?.escInInputs ?? false;
  const parentRoot = opts?.parentRoot ?? false;
  const ignore = opts?.ignore;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    const rootOf = (): HTMLElement | null => {
      const el = ref.current;
      if (el == null) return null;
      return parentRoot ? (el.parentElement ?? el) : el;
    };
    const onDown = (e: MouseEvent) => {
      const ig = ignore?.current;
      if (ig != null && ig.contains(e.target as Node)) return;
      const root = rootOf();
      if (root != null && !root.contains(e.target as Node)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (escInInputs) {
        const root = rootOf();
        const t = e.target;
        if (root != null && t instanceof HTMLInputElement && root.contains(t)) return;
      }
      e.stopImmediatePropagation();
      closeRef.current();
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [enabled, escInInputs, parentRoot, ignore, ref]);
}

type EscEntry = { enabled: boolean; close: () => void };

const escStack: EscEntry[] = [];
let escListening = false;

const onEscKey = (e: KeyboardEvent) => {
  if (e.key !== "Escape") return;
  for (let i = escStack.length - 1; i >= 0; i--) {
    if (escStack[i].enabled) {
      e.preventDefault();
      escStack[i].close();
      return;
    }
  }
};

/**
 * Overlay-tier Escape: bubble-phase, one window listener, closing the TOP
 * enabled overlay only (mount order = stack order). A capture-phase popover
 * (`useDismiss`) still pre-empts this whole tier — its
 * `stopImmediatePropagation` fires before the bubble.
 */
export function useOverlayEsc(onClose: () => void, enabled = true): void {
  const entryRef = useRef<EscEntry | null>(null);
  entryRef.current ??= { enabled, close: onClose };
  entryRef.current.enabled = enabled;
  entryRef.current.close = onClose;

  useEffect(() => {
    const entry = entryRef.current!;
    escStack.push(entry);
    if (!escListening) {
      window.addEventListener("keydown", onEscKey);
      escListening = true;
    }
    return () => {
      const i = escStack.indexOf(entry);
      if (i >= 0) escStack.splice(i, 1);
      if (escStack.length === 0 && escListening) {
        window.removeEventListener("keydown", onEscKey);
        escListening = false;
      }
    };
  }, []);
}
