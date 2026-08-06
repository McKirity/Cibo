/** The custom titlebar + its window-action wiring. Split out of Shell.tsx 2026-07-30 (dedup pass wave 4). */
import { Ico, ICONS } from "./icons";
import { winAction } from "./safeWindow";

// Custom titlebar (native decorations are off in tauri.conf.json). The drag
// region moves the window; the right cluster drives the OS window via the Tauri
// window API (`winAction` — shell/safeWindow's shared stanza). Back/forward
// drive the app's own session history (useHistory) — pulled ahead from step 9
// on 2026-07-25; they are NOT the webview's history.
export function Titlebar({
  title,
  canBack,
  canForward,
  onBack,
  onForward,
  railCollapsed,
  onToggleRail,
  attention,
}: {
  title: string;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  railCollapsed: boolean;
  onToggleRail: () => void;
  /** Something the hidden rail would have been signalling — unfinalized days
   *  OR'd with the health dot (the step-10 join, live since 2026-08-04). */
  attention: boolean;
}) {
  return (
    <div className="tb">
      <div className="cluster">
        {/* THE RAIL TOGGLE — 2026-08-01, step 9.
            The frozen frame draws this button as RESTORE-ONLY (`display:none`
            until collapsed), and draws no collapse control anywhere; the
            palette's nine verbs are a closed set that doesn't include one
            either. So "what collapses the rail" was never ruled — a gap, not a
            conflict. Filled the minimal way: ONE always-visible toggle, whose
            drawn icon is already a sidebar glyph. Flagged for ratification;
            the alternatives were undrawn rail chrome (on a rail that already
            overflows the 14") or a fifth hotkey (the four-hotkey set is
            closed).
            The DOT is not merely "collapsed" — it means the hidden rail is
            holding a signal you can no longer see ([[Nav Rail]]: the ambient
            glances "stay signalled in collapse"), so it needs both. */}
        <button
          className={`tb-btn restore${railCollapsed ? " on" : ""}`}
          title={railCollapsed ? "Show nav rail" : "Hide nav rail"}
          aria-label={railCollapsed ? "Show nav rail" : "Hide nav rail"}
          aria-pressed={railCollapsed}
          onClick={onToggleRail}
        >
          <Ico d={["M3 3h18v18H3z", "M9 3v18"]} />
          {railCollapsed && attention && <span className="dot" />}
        </button>
        <button
          className={`tb-btn${canBack ? "" : " disabled"}`}
          title="Back (Alt+←)"
          disabled={!canBack}
          onClick={onBack}
        >
          <Ico d={ICONS.back} />
        </button>
        <button
          className={`tb-btn${canForward ? "" : " disabled"}`}
          title="Forward (Alt+→)"
          disabled={!canForward}
          onClick={onForward}
        >
          <Ico d={ICONS.forward} />
        </button>
      </div>
      <div className="drag" data-tauri-drag-region>
        <span className="title">{title}</span>
      </div>
      <div className="cluster winbtns">
        <button className="tb-btn" title="Minimize" onClick={winAction((w) => w.minimize())}>
          <Ico d={["M5 12h14"]} />
        </button>
        <button className="tb-btn" title="Maximize" onClick={winAction((w) => w.toggleMaximize())}>
          <Ico d={["M4 4h16v16H4z"]} />
        </button>
        <button className="tb-btn close" title="Close" onClick={winAction((w) => w.close())}>
          <Ico d={ICONS.close} />
        </button>
      </div>
    </div>
  );
}
