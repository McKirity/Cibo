/**
 * kit-state-error — failure tier ② : inline, WHERE the user caused it
 * ([[Failure & Error UX]] owns the content policy). The shared box a panel
 * wears when it can't render its content: a danger-tinted well, the message
 * naming WHOSE problem it is (your connection · your settings · their
 * server), and the fix in place. Retry is DANGER-GHOST — outlined, not
 * filled: it destroys nothing. No auto-retry — the door is the user's.
 *
 * Built with the step-6 failure batch so the vocabulary exists app-wide; its
 * drawn tenants arrive with their steps — the importer's failed rows (8) and
 * the health home's probe verdicts (10/13). Form validation stays the
 * fieldnote idiom, not this box.
 */
export function ErrorState({
  title,
  message,
  onRetry,
  retryLabel,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="errstate">
      <span className="epip">!</span>
      <div>
        <p className="et2">{title}</p>
        <p className="em">{message}</p>
        {onRetry != null && (
          <button className="btn-danger" onClick={onRetry}>
            <svg className="ico" viewBox="0 0 24 24">
              <path d="M23 4v6h-6" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            {retryLabel ?? "Retry"}
          </button>
        )}
      </div>
    </div>
  );
}
