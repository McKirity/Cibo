/**
 * `kit-toast` — the app's ONE slide-in slot, one toast at a time.
 *
 * Two variants (Overlays sheet, movement 07): **undo** — a light delete's ~10 s
 * window with an action button; **error** — a background failure's report, the
 * four-tier failure model's tier 3, a `--danger` dot leading (the second signal;
 * the word carries the meaning, never colour alone).
 *
 * Built here at Daily's form spine because session remove was ruled to ship with
 * its undo rather than repeat chunk 5's inert-danger-foot deferral (screen note
 * § Amended 2026-07-26 (2nd), ruling 4). Tier 2 of [[Delete Safety & Undo]] gets
 * its first built tenant.
 *
 * A heavy delete (a bulk selection, a whole habit) is NOT this — that takes the
 * count-carrying danger confirm. The toast never carries a count.
 */
import { useEffect, useState } from "react";
import { logError } from "../settings/errorLog";

export interface ToastMessage {
  /** Monotonic — a new toast replaces the one on screen (one slot). */
  id: number;
  kind: "undo" | "error";
  message: string;
  /** Undo only; running it dismisses the toast. */
  onUndo?: () => void;
  /** Milliseconds the slot stays up. */
  ms: number;
}

type Listener = (t: ToastMessage | null) => void;

let current: ToastMessage | null = null;
let nextId = 1;
const listeners = new Set<Listener>();

const publish = (t: ToastMessage | null) => {
  current = t;
  for (const l of listeners) l(t);
};

/** The ~10 s undo window ([[Delete Safety & Undo]] tier 2). */
export const showUndoToast = (message: string, onUndo: () => void, ms = 10_000): number => {
  const id = nextId++;
  publish({ id, kind: "undo", message, onUndo, ms });
  return id;
};

/**
 * Tier 3 — a failure with no inline home. No action, no retry.
 *
 * Every one also ACCUMULATES in the health home's recent-errors list (step 10,
 * slice 5): the toast is the moment, that list is the standing record, and it
 * is what the rail's health dot summarizes.
 */
export const showErrorToast = (message: string, source = "App", ms = 6_000): number => {
  const id = nextId++;
  logError(message, source);
  publish({ id, kind: "error", message, ms });
  return id;
};

/** The slot itself — mounted once, by the shell. */
export function ToastSlot() {
  const [toast, setToast] = useState<ToastMessage | null>(current);

  useEffect(() => {
    listeners.add(setToast);
    return () => {
      listeners.delete(setToast);
    };
  }, []);

  // Self-dismiss. Keyed on the id so a replacing toast restarts the window
  // rather than inheriting the previous one's remaining time.
  useEffect(() => {
    if (toast == null) return;
    const t = setTimeout(() => {
      if (current?.id === toast.id) publish(null);
    }, toast.ms);
    return () => clearTimeout(t);
  }, [toast?.id, toast?.ms]);

  if (toast == null) return null;
  return (
    <div className="toastslot" role="status" aria-live="polite">
      <div className="toast">
        {toast.kind === "error" && <span className="errdot" />}
        <span className="tmsg">{toast.message}</span>
        {toast.kind === "undo" && toast.onUndo != null && (
          <button
            className="undo"
            onClick={() => {
              toast.onUndo?.();
              publish(null);
            }}
          >
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
