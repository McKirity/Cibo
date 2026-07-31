/**
 * Failure tier ④ — THE FATAL LAUNCH SCREEN ([[Failure & Error UX]]; drawn for
 * the first time on the empty-and-failure-states sheet, movement 05). The one
 * failure with no app to render in: the Evolu store won't open at launch.
 *
 * A pre-shell full-window SCREEN SPECIES (the first-run canvas-A kin), not a
 * kit block: no rail, no titlebar content — Default-only by rule (it precedes
 * any theme preference; the static theme import serves until step 6a's loader,
 * which must keep this screen on the Default). Calm, not alarm: one small
 * danger glyph, plain words, and the only honest doors.
 *
 * Doors, today: RETRY LAUNCH only. The drawn "Open the data folder" and
 * "Restore from a backup" doors wait on their machinery — the cloud root
 * (step 14) and backups (step 12); a door the app cannot honour is not drawn
 * (the honest-doors law). They join here when those steps land.
 *
 * Build adaptation, flagged: the app runs with native decorations OFF, so a
 * bare pre-shell screen would leave the window undraggable and mouse-
 * unclosable. A quiet drag strip + close button ride the top edge — the
 * minimum OS affordance, not titlebar content.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./fatal.css";

function FatalLaunch({ detail }: { detail: string }) {
  const close = () => {
    try {
      void getCurrentWindow().close().catch(() => {});
    } catch {
      /* plain-browser dev — no window API */
    }
  };
  return (
    <div className="launch">
      {/* the minimum OS affordance (decorations are off) — not titlebar content */}
      <div className="ldrag" data-tauri-drag-region />
      <button className="lclose" title="Close" onClick={close}>
        <svg className="ico" viewBox="0 0 24 24">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>

      <div className="lwm">
        <span className="lmk" />
        Cibo
      </div>
      <div className="lcard">
        <div className="lglyph">
          <svg className="ico" viewBox="0 0 24 24">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        </div>
        <h3 className="lh">Cibo couldn't open your library</h3>
        <p className="lp">
          The data store didn't respond when the app started.{" "}
          <b>Nothing has been changed or deleted</b> — Cibo simply won't run until it can
          reach your records.
        </p>
        <div className="lpath">{detail}</div>
        <div className="ldoors">
          <button className="btn-accent" onClick={() => window.location.reload()}>
            <svg className="ico" viewBox="0 0 24 24">
              <path d="M23 4v6h-6" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Retry launch
          </button>
        </div>
        <p className="lfoot">Cibo will not retry on its own. Choose a door.</p>
      </div>
    </div>
  );
}

/**
 * Raise the fatal screen OVER whatever the boot managed to paint (the app
 * cannot run, so covering it is the honest state). Idempotent — the first
 * fatal wins; later errors during the same doomed launch add nothing.
 */
export function mountFatalLaunch(detail: unknown): void {
  if (document.getElementById("fatal-launch") != null) return;
  const host = document.createElement("div");
  host.id = "fatal-launch";
  document.body.appendChild(host);
  const text =
    detail instanceof Error
      ? detail.message
      : typeof detail === "string"
        ? detail
        : JSON.stringify(detail ?? "unknown store error");
  ReactDOM.createRoot(host).render(
    <React.StrictMode>
      <FatalLaunch detail={text} />
    </React.StrictMode>,
  );
}
