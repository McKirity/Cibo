/**
 * Build step 6 — the minimal real shell (option A): the custom titlebar + nav
 * rail + content pane from the frozen `Final/frame.html`, with the Habits
 * section WIRED to the seeded active habits (click a habit → its dashboard).
 *
 * Deliberately partial — this is the container step 6's dashboards live in, not
 * step 9 (nav calendar + whimsy) or step 6a (theme/ambience). Placeheld here:
 * the month grid, the Tools destinations (Timers/Statistics/Search/Map),
 * Settings, and the live vignette (a static face stands in). Window controls
 * are visual only until the custom-titlebar/decorations pass.
 *
 * The dev seed/activation panels ride the Log view — the working loop that
 * turns seeds into rail habits: seed rich → activate → click → dashboard.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@evolu/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { evolu } from "../db/evolu";
import { clearRichSeed, seedRich } from "../db/seedRich";
import { LogForm } from "../log/LogForm";
import { Daily } from "../daily/Daily";
import { ToastSlot } from "./toast";
import { ConsumptionDashboard } from "../dashboard/ConsumptionDashboard";
import { CreationDashboard } from "../dashboard/CreationDashboard";
import { SimpleDashboard } from "../dashboard/SimpleDashboard";
import { RangeDashboard } from "../dashboard/RangeDashboard";
import { CadenceDashboard } from "../dashboard/CadenceDashboard";
import { EntryDashboard } from "../dashboard/EntryDashboard";
import { Library } from "../library/Library";
import { CompareDashboard } from "../compare/CompareDashboard";
import "../compare/compare.css";
import { PaletteOverlay } from "../palette/Palette";
import { recordRecent } from "../palette/recents";
import { TimersScreen } from "../timers/TimersScreen";
import { GlobalTimerTray, TimerOverlays } from "../timers/TimerOverlays";
import { focusClock } from "../timers/timerStore";
import { armCloseGuard, proceedQuit, registerQuitWarning } from "../timers/closeGuard";
import { registerTrayNavigate } from "../timers/tray";
import { DangerConfirm } from "./DangerConfirm";
import type { CadenceScale } from "../metrics/cadence";
import { useHistory } from "./useHistory";
import { HabitIcon, hasIcon } from "./habitIcons";
import "./shell.css";
// Routing reads the habit row's kind/sub_type (chunk 3) — the key sets are
// gone, so a habit can never be routed by name: consumption/creation off
// sub_type, simple/range off kind, exactly the derived-template rule. Coding's
// 2026-07-22 downgrade lands it on the simple template beside Keyboard.

const activeHabitsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("habits")
    .select(["id", "key", "name", "kind", "sub_type", "colour_slot", "icon", "archived"])
    .where("isDeleted", "is not", 1)
    .orderBy("sort_order"),
);

type View =
  /**
   * The front door. "Launch opens to Daily — there is NO homepage."
   * `day` addresses ANY date: a past unfinalized day is the same working state,
   * date-addressed, and a finalized one is its cover wall. Absent = today.
   */
  | { kind: "daily"; day?: string }
  /** The dev logging view — hosts the seed/activation panels until step 15. */
  | { kind: "log" }
  | { kind: "habit"; key: string }
  /** The consumption catalog — the stats-vs-library split's second screen. */
  | { kind: "library"; habitKey: string }
  | { kind: "cadence"; scale: CadenceScale; anchor: string }
  | { kind: "entry"; id: string; habitKey: string }
  /** Comparing Statistics — the Tools-rail query workspace (step 6 catch-up). */
  | { kind: "compare" }
  /** Timers — the Tools-rail board of independent clocks (step 7). */
  | { kind: "timers" };

const todayStr = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function Shell() {
  const habits = useQuery(activeHabitsQuery);
  const active = habits.filter((h) => !h.archived);
  // Browser-style session history (Shell Mechanics § 1). `setView` keeps its
  // name and signature so every door below is unchanged — it just pushes now.
  const {
    current: view,
    navigate: setView,
    replace: replaceView,
    back,
    forward,
    canBack,
    canForward,
  } = useHistory<View>({ kind: "daily" });

  const projects = active.filter((h) => h.kind === "project");
  const daily = active.filter((h) => h.kind !== "project");

  // Every navigation opens at the top of the content pane (user-ruled 2026-07-24).
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, left: 0 });
  }, [view]);

  // If the selected habit gets archived out from under us, fall back to Log.
  // REPLACE, not navigate: the user did not ask to go here, so it must not
  // become a history entry you can press "back" into (and bail out of again).
  useEffect(() => {
    const key =
      view.kind === "habit"
        ? view.key
        : view.kind === "entry" || view.kind === "library"
          ? view.habitKey
          : null;
    if (key != null && !active.some((h) => h.key === key)) {
      replaceView({ kind: "daily" });
    }
  }, [view, active, replaceView]);

  // Back/forward bindings: Alt+←/→ and mouse buttons 4/5 (the ruled set, minus
  // the chrome arrows below). `Ctrl+Home` went live 2026-07-27 — its target is
  // Daily, and Daily now exists in both states. `Ctrl+K` went live 2026-07-29
  // with the palette — the four-hotkey set ([[Shell Mechanics]] § 7) is whole.
  // The palette is NEVER summoned over a modal holding input (the overlay
  // policy) — the `.dimlayer` probe is the pragmatic gate: every modal tenant
  // mounts on that chassis.
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onHome = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Home") {
        e.preventDefault();
        setView({ kind: "daily" });
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((open) => {
          if (open) return false;
          return document.querySelector(".dimlayer") == null;
        });
      }
    };
    window.addEventListener("keydown", onHome);
    return () => window.removeEventListener("keydown", onHome);
  }, [setView]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        forward();
      }
    };
    // WebView2 runs its own page-history navigation on the side buttons unless
    // the mousedown is cancelled; auxclick then carries the intent to us.
    const onDown = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) e.preventDefault();
    };
    const onAux = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        back();
      } else if (e.button === 4) {
        e.preventDefault();
        forward();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("auxclick", onAux);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("auxclick", onAux);
    };
  }, [back, forward]);

  // ── step 7: timers × the app lifecycle ─────────────────────────────────────
  // Tray click = "reopen the app to the timer" (minimized-only tray, ruled).
  useEffect(() => {
    registerTrayNavigate(() => setView({ kind: "timers" }));
  }, [setView]);

  // Close = quit, ALWAYS — but a running clock gets the warning modal first:
  // Stop aborts the close, Proceed discards the in-flight unlogged values
  // ([[App Lifecycle & OS Integration]]). The intercept is a PAGE-LIFETIME
  // SINGLETON (closeGuard.ts) — a per-mount listener trapped the window under
  // HMR (the 2026-07-28 unclosable-window bug); the shell only registers the
  // warning UI. The DangerConfirm chassis stands in for the (never-drawn)
  // quit warning face.
  const [quitWarn, setQuitWarn] = useState(false);
  useEffect(() => {
    armCloseGuard();
    registerQuitWarning(() => setQuitWarn(true));
    return () => registerQuitWarning(null);
  }, []);
  const onProceedQuit = () => {
    setQuitWarn(false);
    proceedQuit();
  };

  const today = todayStr();
  /**
   * The one day door every surface routes through. The FUTURE is a dead route
   * (no target until the date arrives), so it is refused here rather than in
   * each caller — the cadence cells, the entry day log, Rediscover and the
   * catch-up card all come through this.
   */
  const openDay = useCallback(
    (day: string) => {
      if (day > today) return;
      setView({ kind: "daily", day });
    },
    [setView, today],
  );

  // The palette's Recent group leads the at-rest face (user-ruled 2026-07-29):
  // place-shaped navigations feed the per-device ledger. Today's Daily is the
  // front door, not a "recent place"; dev/tool screens aren't nouns.
  useEffect(() => {
    if (view.kind === "habit") recordRecent({ kind: "habit", key: view.key });
    else if (view.kind === "library") recordRecent({ kind: "library", habitKey: view.habitKey });
    else if (view.kind === "entry") recordRecent({ kind: "entry", id: view.id, habitKey: view.habitKey });
    else if (view.kind === "cadence") recordRecent({ kind: "period", scale: view.scale, anchor: view.anchor });
    else if (view.kind === "daily" && view.day != null && view.day !== today)
      recordRecent({ kind: "day", day: view.day });
  }, [view, today]);

  // Dev stand-in (step 10 owns the real switch): re-apply the persisted
  // reduce-effects choice at launch. DEV-gated on purpose — a stale flag in a
  // production build would degrade effects with no control to undo it.
  useEffect(() => {
    try {
      if (import.meta.env.DEV && localStorage.getItem(REDUCE_KEY) === "1")
        document.documentElement.classList.add("reduce-effects");
    } catch {
      /* per-device sugar */
    }
  }, []);

  const title =
    view.kind === "habit"
      ? active.find((h) => h.key === view.key)?.name ?? "Cibo"
      : view.kind === "library"
        ? `${active.find((h) => h.key === view.habitKey)?.name ?? "Cibo"} — Library`
        : view.kind === "entry"
        ? active.find((h) => h.key === view.habitKey)?.name ?? "Cibo"
        : view.kind === "compare"
          ? "Comparing Statistics"
        : view.kind === "timers"
          ? "Timers"
          : view.kind === "cadence"
          ? { week: "Weekly", month: "Monthly", quarter: "Quarterly", year: "Yearly" }[view.scale]
          : view.kind === "daily" && view.day != null && view.day !== today
            ? // The FINAL's titlebar carries the viewed day, not the word
              // "Today", the moment the screen is date-addressed.
              new Intl.DateTimeFormat(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(new Date(`${view.day}T12:00:00`))
            : "Today";
  const monthName = ["January","February","March","April","May","June","July","August","September","October","November","December"][Number(today.slice(5, 7)) - 1];

  return (
    <div className="app-frame">
      <Titlebar
        title={title}
        canBack={canBack}
        canForward={canForward}
        onBack={back}
        onForward={forward}
      />

      <nav className="rail">
        {/* 1 · nav calendar (header only — the grid is step 9; the chain +
            month label are LIVE cadence doors since chunk 4) */}
        <div className="sec">
          <div className="calhead">
            <div className="chain">
              <button className="doorlink" onClick={() => setView({ kind: "cadence", scale: "year", anchor: today })}>
                {today.slice(0, 4)}
              </button>
              <button className="doorlink" onClick={() => setView({ kind: "cadence", scale: "quarter", anchor: today })}>
                Q{Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1}
              </button>
            </div>
            <button className="month doorlink" onClick={() => setView({ kind: "cadence", scale: "month", anchor: today })}>
              {monthName}
            </button>
          </div>
          <button className="cal-placeholder" onClick={() => setView({ kind: "cadence", scale: "week", anchor: today })}>
            month grid · step 9 — click for this week
          </button>
          <button className="cal-placeholder" onClick={() => setView({ kind: "daily" })}>
            Today
          </button>
          <button className="cal-placeholder" onClick={() => setView({ kind: "log" })}>
            dev log view
          </button>
        </div>

        {/* 2 · Habits */}
        <div className="sec">
          <p className="overline">Habits</p>
          {projects.length > 0 && (
            <>
              <p className="subgroup">Projects</p>
              <div className="habitgrid">
                {projects.map((h) => (
                  <HabitButton
                    key={h.id}
                    name={h.name ?? "—"}
                    colour={h.colour_slot ?? "habit-1"}
                    icon={(h.icon as string | null) ?? null}
                    active={
                      (view.kind === "habit" && view.key === h.key) ||
                      ((view.kind === "entry" || view.kind === "library") && view.habitKey === h.key)
                    }
                    onClick={() => h.key && setView({ kind: "habit", key: h.key })}
                  />
                ))}
              </div>
            </>
          )}
          {daily.length > 0 && (
            <>
              <p className="subgroup">Daily</p>
              <div className="habitgrid">
                {daily.map((h) => (
                  <HabitButton
                    key={h.id}
                    name={h.name ?? "—"}
                    colour={h.colour_slot ?? "habit-1"}
                    icon={(h.icon as string | null) ?? null}
                    active={
                      (view.kind === "habit" && view.key === h.key) ||
                      ((view.kind === "entry" || view.kind === "library") && view.habitKey === h.key)
                    }
                    onClick={() => h.key && setView({ kind: "habit", key: h.key })}
                  />
                ))}
              </div>
            </>
          )}
          {active.length === 0 && (
            <p className="cal-placeholder">
              no active habits — seed + activate on the Log view
            </p>
          )}
        </div>

        {/* 3 · Tools (destinations are step 7/8/9) */}
        <div className="sec">
          <p className="overline">Tools</p>
          <div className="tools">
            <button
              className={`tool${view.kind === "timers" ? " active" : ""}`}
              onClick={() => setView({ kind: "timers" })}
            >
              <Ico d={["M10 2h4", "M12 14l3-3", "M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"]} />
              Timers
            </button>
            {/* "Statistics" is the drawn display label; "Comparing Statistics"
                stays the canonical name (the 2026-07-17 corpus-sweep rider). */}
            <button
              className={`tool${view.kind === "compare" ? " active" : ""}`}
              onClick={() => setView({ kind: "compare" })}
            >
              <Ico d={["M3 3v16a2 2 0 0 0 2 2h16", "M18 17V9", "M13 17V5", "M8 17v-3"]} />
              Statistics
            </button>
            {/* The ONE rail entry that opens an overlay, not a screen — the
                recorded exception ([[Nav Rail]] · [[Search & Quick-Find]]). */}
            <button className="tool" onClick={() => setPaletteOpen(true)}>
              <Ico d={["M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z", "m21 21-4.3-4.3"]} />
              Search
            </button>
            <button className="tool" disabled title="Later">
              <Ico d={["M14 5.6a2 2 0 0 0 1.8 0l3.6-1.8A1 1 0 0 1 21 4.6v12.8a1 1 0 0 1-.6.9l-4.5 2.3a2 2 0 0 1-1.8 0l-4.2-2.1a2 2 0 0 0-1.8 0L4.4 20.4A1 1 0 0 1 3 19.4V6.6a1 1 0 0 1 .6-.9L8 3.4a2 2 0 0 1 1.8 0z"]} />
              Map
            </button>
          </div>
        </div>

        {/* flex band · vignette clock (static — the live face is step 6a) */}
        <div className="ambience">
          <VignetteClock />
        </div>

        {/* 4 · Settings (step 10) */}
        <div className="sec settings">
          <button className="settings-row" disabled title="Step 10">
            <Ico d={["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 6 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H2a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 3.3 6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 3.3V2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9z"]} />
            <span className="name">Settings</span>
          </button>
        </div>
      </nav>

      <div className="content" ref={contentRef}>
        {view.kind === "habit" ? (
          (() => {
            const h = active.find((x) => x.key === view.key);
            // key by habit → a fresh mount per habit, so scope + type + heatmap
            // mode reset to All Time / All types on every swap.
            const openEntry = (id: string) => setView({ kind: "entry", id, habitKey: view.key });
            if (h?.sub_type === "consumption")
              return (
                <ConsumptionDashboard
                  key={view.key}
                  habitKey={view.key}
                  onOpenEntry={openEntry}
                  onOpenLibrary={() => setView({ kind: "library", habitKey: view.key })}
                />
              );
            if (h?.sub_type === "creation")
              return <CreationDashboard key={view.key} habitKey={view.key} onOpenEntry={openEntry} />;
            if (h?.kind === "simple") return <SimpleDashboard key={view.key} habitKey={view.key} />;
            if (h?.kind === "range") return <RangeDashboard key={view.key} habitKey={view.key} />;
            return <NotYetDashboard habitKey={view.key} />;
          })()
        ) : view.kind === "library" ? (
          <Library
            key={view.habitKey}
            habitKey={view.habitKey}
            onBackToStats={() => setView({ kind: "habit", key: view.habitKey })}
            onOpenEntry={(id) => setView({ kind: "entry", id, habitKey: view.habitKey })}
          />
        ) : view.kind === "entry" ? (
          <EntryDashboard
            key={view.id}
            entryId={view.id}
            onOpenHabit={(key) => setView({ kind: "habit", key })}
            onOpenEntry={(id) => setView({ kind: "entry", id, habitKey: view.habitKey })}
            onOpenDay={openDay}
            // A deleted entry is a dead route — leave with REPLACE, never push
            // (the archived-habit precedent), so back can't return to it.
            onDeleted={() => replaceView({ kind: "habit", key: view.habitKey })}
          />
        ) : view.kind === "cadence" ? (
          <CadenceDashboard
            key={`${view.scale}-${view.anchor}`}
            scale={view.scale}
            anchor={view.anchor}
            onNavigate={(nav) => setView({ kind: "cadence", scale: nav.scale, anchor: nav.anchor })}
            onOpenHabit={(key) => setView({ kind: "habit", key })}
            onOpenDay={openDay}
          />
        ) : view.kind === "compare" ? (
          <CompareDashboard />
        ) : view.kind === "timers" ? (
          <TimersScreen
            onOpenHabit={(key) => setView({ kind: "habit", key })}
            onOpenEntry={(id, habitKey) => setView({ kind: "entry", id, habitKey })}
          />
        ) : view.kind === "daily" ? (
          <Daily
            key={view.day ?? today}
            dayKey={view.day}
            onOpenDay={openDay}
            onOpenEntry={(id, habitKey) => {
              if (habitKey != null) setView({ kind: "entry", id, habitKey });
            }}
          />
        ) : (
          <LogView />
        )}
      </div>

      {/* kit-palette — the Ctrl+K command layer (step 6 catch-up). NEVER a
          route: overlay state lives beside the history stack, so Back can't
          reopen it. Summoned here + by the rail's Search entry above. */}
      {paletteOpen && (
        <PaletteOverlay
          today={today}
          onClose={() => setPaletteOpen(false)}
          nav={{
            openDay,
            openHabit: (key) => setView({ kind: "habit", key }),
            openLibrary: (habitKey) => setView({ kind: "library", habitKey }),
            openEntry: (id, habitKey) => setView({ kind: "entry", id, habitKey }),
            openCadence: (scale, anchor) => setView({ kind: "cadence", scale, anchor }),
            openCompare: () => setView({ kind: "compare" }),
            openTimers: () => setView({ kind: "timers" }),
          }}
        />
      )}

      {/* kit-toast — the app's ONE slide-in slot, mounted once by the shell so
          any surface can raise it. First tenant: the form spine's session-remove
          undo. */}
      <ToastSlot />

      {/* step 7 — the machinery-invoked timer overlays (a pomodoro interval-end
          opens the management window from ANY screen; recovery is launch-moment).
          "Log all → form" lands on Daily, where the spine consumes the hand-off. */}
      <TimerOverlays onGoToForm={() => setView({ kind: "daily" })} />
      {/* the running-clock reminder tray (user-ruled 2026-07-28) — every screen
          but the board, which draws its own switcher */}
      {view.kind !== "timers" && (
        <GlobalTimerTray
          onOpen={(id) => {
            focusClock(id);
            setView({ kind: "timers" });
          }}
        />
      )}
      {quitWarn && (
        <DangerConfirm
          title="A clock is still running"
          body={
            <>
              Closing quits Cibo. The running clocks' <strong>unlogged accumulators are
              discarded</strong> — stop the close and log them from the board if you want to
              keep them.
            </>
          }
          confirmLabel="Proceed · discard"
          onConfirm={onProceedQuit}
          onCancel={() => setQuitWarn(false)}
        />
      )}
    </div>
  );
}

function HabitButton({
  name,
  colour,
  icon,
  active,
  onClick,
}: {
  name: string;
  colour: string;
  icon: string | null;
  active: boolean;
  onClick: () => void;
}) {
  // Icon-in-swatch = the drawn frame face (seed batch 7 planted the names);
  // the lettermark stays the ruled fallback for icon-less habits.
  return (
    <button className={`entry${active ? " active" : ""}`} onClick={onClick}>
      <span className="swatch" style={{ background: `var(--${colour})` }}>
        {hasIcon(icon) ? <HabitIcon icon={icon} /> : name[0]?.toUpperCase()}
      </span>
      <span className="name">{name}</span>
    </button>
  );
}

// Custom titlebar (native decorations are off in tauri.conf.json). The drag
// region moves the window; the right cluster drives the OS window via the Tauri
// window API. Back/forward drive the app's own session history (useHistory) —
// pulled ahead from step 9 on 2026-07-25; they are NOT the webview's history.
const winAction = (fn: (w: ReturnType<typeof getCurrentWindow>) => Promise<unknown>) => () => {
  try {
    void fn(getCurrentWindow()).catch(() => {});
  } catch {
    /* not in a Tauri webview (plain browser dev) — no-op */
  }
};

function Titlebar({
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

/** The numberless analog vignette face, faithful to the frozen `frame.html`:
 *  60 minute ticks (skipping the 12 hour positions) + 12 longer hour ticks near
 *  the rim, minute/hour hands repainted each second, and the accent second hand
 *  sweeping via CSS (a 60s linear loop, delayed to the current second so it's in
 *  phase with real time). The live-data vignette proper is step 6a. */
function VignetteClock() {
  const [now, setNow] = useState(() => new Date());
  // The second hand sweeps via a continuous 60s CSS loop — its start is aligned
  // to real time ONCE (a stable negative delay). Recomputing the delay on every
  // render would restart the animation each tick (the "skip"). The minute/hour
  // hands are discrete transforms, so re-rendering them each second is fine.
  const [sweepDelay] = useState(() => {
    const d = new Date();
    return `-${d.getSeconds() + d.getMilliseconds() / 1000}s`;
  });
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const mins = now.getMinutes();
  const secs = now.getSeconds();
  const mAngle = (mins + secs / 60) * 6;
  const hAngle = ((now.getHours() % 12) + mins / 60) * 30;

  const minTicks = Array.from({ length: 60 }, (_, i) => i).filter((i) => i % 5 !== 0);
  const hourTicks = Array.from({ length: 12 }, (_, h) => h);

  // TWO stacked svgs (2026-07-29 hover-lag fix): the face, and a sweep layer
  // that rotates as a WHOLE element — Chromium composites element transforms
  // but not SVG-child ones, so the old in-svg animated line repainted the
  // clock every frame. The hub dots ride the rotating layer (centered circles
  // are rotation-invariant), keeping the draw order: hand under hubs.
  return (
    <div className="clockwrap">
      <svg className="clock" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="56" fill="var(--window-background)" stroke="var(--divider)" strokeWidth="1" />
        <g stroke="var(--text-muted)" strokeWidth="1">
          {minTicks.map((i) => (
            <line key={i} x1="60" y1="6" x2="60" y2="10" transform={`rotate(${i * 6} 60 60)`} />
          ))}
        </g>
        <g stroke="var(--text-secondary)" strokeWidth="2">
          {hourTicks.map((h) => (
            <line key={h} x1="60" y1="6" x2="60" y2="14" transform={`rotate(${h * 30} 60 60)`} />
          ))}
        </g>
        <line x1="60" y1="60" x2="60" y2="34" stroke="var(--text-strong)" strokeWidth="3.5" strokeLinecap="round" transform={`rotate(${hAngle} 60 60)`} />
        <line x1="60" y1="60" x2="60" y2="22" stroke="var(--text-strong)" strokeWidth="2.5" strokeLinecap="round" transform={`rotate(${mAngle} 60 60)`} />
      </svg>
      <svg className="clock clock-sweep-layer" viewBox="0 0 120 120" style={{ animationDelay: sweepDelay }}>
        <line className="sweep" x1="60" y1="68" x2="60" y2="18" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="60" cy="60" r="3" fill="var(--text-strong)" />
        <circle cx="60" cy="60" r="1.6" fill="var(--accent)" />
      </svg>
    </div>
  );
}

/** Inline lucide-style icon from a list of path `d` strings. */
function Ico({ d }: { d: string[] }) {
  return (
    <svg className="ico" viewBox="0 0 24 24">
      {d.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

function NotYetDashboard({ habitKey }: { habitKey: string }) {
  return (
    <div className="gsdash">
      <div className="emptybox gen" style={{ maxWidth: 640 }}>
        <div className="eh">{habitKey} dashboard — not built yet</div>
        <div className="es">
          This habit's template (creation · simple · range) lands in a later step-6 chunk.
          Consumption habits (Gaming · Reading · Media) render today.
        </div>
      </div>
    </div>
  );
}

// ── Dev tooling on the Log view (temporary — first-run setup replaces it) ──────

function LogView() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  useEffect(() => {
    evolu.appOwner.then((owner) => setOwnerId(owner.id));
  }, []);
  return (
    <div style={{ maxWidth: 900 }}>
      <div className="perf-line">{ownerId ? `Evolu ready — owner ${ownerId}` : "Evolu starting…"}</div>
      <LogForm />
      {/* Dev-only tooling — `import.meta.env.DEV` is statically false in a
          production build, so these panels (and seedRich) are tree-shaken out. */}
      {import.meta.env.DEV && (
        <>
          <DevReduceEffectsToggle />
          <DevHabitPanel />
          <DevRichSeedPanel />
        </>
      )}
    </div>
  );
}

/**
 * Dev stand-in for the reduce-effects switch — the real control is
 * Settings → Appearance (step 10; a per-device lever, [[Cross-device]]'s
 * 3-lever model). The class on the root element IS the mechanism the whole
 * corpus keys on; localStorage persistence = the established per-device
 * stand-in. First use: the 2026-07-29 hover-lag A/B (reduce-effects sheds
 * the vignette clock sweep).
 */
const REDUCE_KEY = "cibo.dev.reduceEffects";
function DevReduceEffectsToggle() {
  const [on, setOn] = useState(() => document.documentElement.classList.contains("reduce-effects"));
  const toggle = () => {
    const next = !on;
    document.documentElement.classList.toggle("reduce-effects", next);
    try {
      localStorage.setItem(REDUCE_KEY, next ? "1" : "0");
    } catch {
      /* per-device sugar */
    }
    setOn(next);
  };
  return (
    <div style={{ marginTop: 16 }}>
      <button className="btn-plain" onClick={toggle}>
        Reduce effects: {on ? "ON" : "off"}
      </button>
    </div>
  );
}

function DevHabitPanel() {
  const habits = useQuery(activeHabitsQuery);
  return (
    <details className="dev-panel">
      <summary>
        Dev: habit activation ({habits.filter((h) => !h.archived).length} active) — temporary,
        replaced by first-run setup
      </summary>
      <table className="day-table">
        <tbody>
          {habits.map((h) => (
            <tr key={h.id}>
              <td>{h.name}</td>
              <td>{h.kind}</td>
              <td>{h.archived ? "archived" : "active"}</td>
              <td>
                <button
                  type="button"
                  className="btn-plain btn-sm"
                  onClick={() => {
                    const r = evolu.update("habits", { id: h.id, archived: h.archived ? 0 : 1 });
                    if (!r.ok) console.error("Dev: habit toggle rejected", r.error);
                  }}
                >
                  {h.archived ? "Activate" : "Archive"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function DevRichSeedPanel() {
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setStatus("working… (this seeds thousands of rows)");
    try {
      setStatus(await fn());
    } catch (e) {
      setStatus(`error: ${String(e)}`);
      console.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="dev-panel">
      <summary>Dev: rich seeder (step 5) — faithful ~5-year dataset, all 11 habits</summary>
      <div className="row">
        <button
          type="button"
          className="btn-accent btn-sm"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await seedRich(evolu);
              return `Seeded ${r.entries} entries · ${r.sessions} sessions · ${r.subunits} categoricals · ${r.days} finalized days (cleared ${r.clearedFirst} first).`;
            })
          }
        >
          Seed rich data
        </button>
        <button
          type="button"
          className="btn-plain btn-sm"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await clearRichSeed(evolu);
              return `Cleared ${r.removed} rows.`;
            })
          }
        >
          Clear
        </button>
        {status && <span className="fieldnote">{status}</span>}
      </div>
    </details>
  );
}
