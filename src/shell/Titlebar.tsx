/** The custom titlebar + its window-action wiring. Split out of Shell.tsx 2026-07-30 (dedup pass wave 4). */
import { Ico } from "./icons";
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
}: {
  title: string;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
}) {
  return (
    <div className="tb">
      <div className="cluster">
        <button
          className={`tb-btn${canBack ? "" : " disabled"}`}
          title="Back (Alt+←)"
          disabled={!canBack}
          onClick={onBack}
        >
          <Ico d={["m12 19-7-7 7-7", "M19 12H5"]} />
        </button>
        <button
          className={`tb-btn${canForward ? "" : " disabled"}`}
          title="Forward (Alt+→)"
          disabled={!canForward}
          onClick={onForward}
        >
          <Ico d={["M5 12h14", "m12 5 7 7-7 7"]} />
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
          <Ico d={["M18 6 6 18", "m6 6 12 12"]} />
        </button>
      </div>
    </div>
  );
}
