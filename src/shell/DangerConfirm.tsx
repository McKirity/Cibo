/**
 * `kit-dialog-confirm-danger` — the COUNT-CARRYING danger confirm.
 *
 * The heavy half of [[Delete Safety & Undo]]: "a LIGHT delete (one session, one
 * entry from its own dashboard) takes the undo toast — reversible, no ceremony.
 * A HEAVY delete (a bulk selection, a whole habit) takes the count-carrying
 * confirm — irreversible, so it must be deliberate. The toast never carries a
 * count." So there is deliberately no undo here.
 *
 * The anatomy is byte-identical across its three drawn tenants (the 2026-07-14
 * drift survey), and it is quoted verbatim — this file is markup only; the CSS
 * was claimed into kit.css.
 *
 * Build-side, and marked as such: the corpus draws its dim as
 * `position:absolute` inside a bounded stage standing in for the window, never a
 * real overlay, so the app supplies the fixed positioning and the z-tier. The
 * ladder names it `z-dim` (the overlay dim and the modal it carries); `z-confirm`
 * (60) is for the one sanctioned overlay-atop-a-modal, which this is not.
 *
 * Esc closes the top overlay only.
 */
import { useOverlayEsc } from "./overlayHooks";

export function DangerConfirm({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  stacked = false,
}: {
  title: string;
  /** Already-composed prose; `strong` marks the counts. */
  body: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * The one sanctioned overlay-atop-a-modal (bulk delete): a SECOND dim at
   * `z-confirm` (60) over the modal's own, so the modal reads dimmed but
   * present behind the confirm. Esc still pops the top only.
   */
  stacked?: boolean;
}) {
  // The shared overlay stack: mounted last (it stacks over its opener), so it
  // sits on top and one Esc pops this confirm alone.
  useOverlayEsc(onCancel);

  return (
    <div className={`dimlayer${stacked ? " stack" : ""}`} onMouseDown={onCancel} role="presentation">
      <div
        className="confirm"
        role="alertdialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="confirm-body">
          <div className="ch">
            <svg className="ico" viewBox="0 0 24 24">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            {title}
          </div>
          <p>{body}</p>
          <div className="confirm-actions">
            {/* Cancel holds the default focus (2026-07-30): with autoFocus on
                the destructive button, Alt+F4 followed by a reflexive Enter
                discarded every accumulator. Build-side markup, not drawn —
                the convention for irreversible actions is safe-by-default. */}
            <button className="btn-danger filled" onClick={onConfirm}>
              <svg className="ico" viewBox="0 0 24 24">
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              {confirmLabel}
            </button>
            <button className="btn-plain" onClick={onCancel} autoFocus>
              Cancel
            </button>
            <span className="escnote">Esc closes the top overlay only</span>
          </div>
        </div>
      </div>
    </div>
  );
}
