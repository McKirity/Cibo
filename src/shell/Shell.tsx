/**
 * Build step 6 — the minimal real shell (option A): the custom titlebar + nav
 * rail + content pane from the frozen `Final/frame.html`, with the Habits
 * section WIRED to the seeded active habits (click a habit → its dashboard).
 *
 * Deliberately partial — this is the container step 6's dashboards live in.
 * Still placeheld: **the month grid** (step 9, in progress) and **Settings**
 * (step 10). The Tools destinations all landed; the rail's ambience band is now
 * a bare flex absorber — **the vignette clock was retired 2026-08-01** at step
 * 9's open (user-ruled), taking `VignetteClock.tsx` and `--clock-max` with it.
 *
 * The dev seed/activation panels ride the Log view — the working loop that
 * turns seeds into rail habits: seed rich → activate → click → dashboard.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
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
import { MapScreen } from "../map/MapScreen";
import { TooltipLayer } from "./tooltip";
import { TimerOverlays } from "../timers/TimerOverlays";
import { GlobalTimerTray } from "../timers/GlobalTimerTray";
import { focusClock } from "../timers/timerStore";
import { armCloseGuard, proceedQuit, registerQuitWarning } from "../timers/closeGuard";
import { registerTrayNavigate } from "../timers/tray";
import { DangerConfirm } from "./DangerConfirm";
import type { CadenceScale } from "../metrics/cadence";
import { useHistory } from "./useHistory";
import { HabitIcon, hasIcon } from "./habitIcons";
import { Ico } from "./icons";
import { Titlebar } from "./Titlebar";
import { NavCalendar } from "./NavCalendar";
import { Ambience } from "../theme/Ambience";
import { NotYetDashboard } from "./NotYetDashboard";
import { LogView } from "./DevPanels";
import { SettingsScreen } from "../settings/SettingsScreen";
import { defaultLogDay } from "../settings/store";
import { viewTitle, type View } from "./views";
import { catchUpDays, unfinalizedQuery } from "../daily/catchUp";
import { todayLocal } from "../metrics/clock";
import "./shell.css";
// Routing reads the habit row's kind/sub_type (chunk 3) — the key sets are
// gone, so a habit can never be routed by name: consumption/creation off
// sub_type, simple/range off kind, exactly the derived-template rule. Coding's
// 2026-07-22 downgrade lands it on the simple template beside Keyboard.

export const activeHabitsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("habits")
    .select(["id", "key", "name", "kind", "sub_type", "colour_slot", "icon", "archived"])
    .where("isDeleted", "is not", 1)
    .orderBy("sort_order"),
);

export function Shell() {
  const habits = useQuery(activeHabitsQuery);
  // Memoized: `active` feeds the archived-habit bail-out effect below, and a
  // fresh array every render would re-fire that correctness-bearing effect.
  const active = useMemo(() => habits.filter((h) => !h.archived), [habits]);
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

  // If the selected habit gets archived out from under us, fall back to Daily.
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
  // Rail collapse is SESSION-ONLY by ruling ([[Nav Rail]] 2026-07-04): plain
  // state, deliberately not localStorage — the app always launches expanded,
  // consistent with always-opening-to-Daily.
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // The palette's "New habit" verb navigates to Settings AND asks it to open
  // the creator; the flag is consumed on arrival so a later visit is clean.
  const [creatorPending, setCreatorPending] = useState(false);
  useEffect(() => {
    const onHome = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Home") {
        e.preventDefault();
        // The day cutoff "sets logging DEFAULTS only" — before the cutoff
        // hour, home is still yesterday's working day, DATE-ADDRESSED so the
        // titlebar says which day it is (step 10; settings/store.ts).
        const home = defaultLogDay();
        setView(home === todayLocal() ? { kind: "daily" } : { kind: "daily", day: home });
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((open) => {
          // The .dimlayer probe guards BOTH directions (fixed 2026-07-30):
          // opening over a modal was always refused, but closing while a
          // palette-launched modal is up (the New-entry creation modal mounts
          // .dimlayer above the palette) would unmount it with the user's
          // half-typed form inside.
          const modalOpen = document.querySelector(".dimlayer") != null;
          if (open) return modalOpen ? open : false;
          return !modalOpen;
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

  const today = todayLocal();

  // What the hidden rail would still be signalling. Today that is the catch-up
  // queue; the health dot joins it at step 10, and this is the one place to
  // OR it in when it does.
  const unfinalized = useQuery(unfinalizedQuery);
  const catchUpWaiting = catchUpDays(unfinalized, today).length > 0;

  /**
   * The one day door every surface routes through. The FUTURE is a dead route
   * (no target until the date arrives), so it is refused here rather than in
   * each caller — the cadence cells, the entry day log, Rediscover and the
   * catch-up card all come through this.
   */
  const openDay = useCallback(
    (day: string) => {
      // todayLocal() at CLICK time, never the render-captured `today`: a Shell
      // that hasn't re-rendered since midnight would otherwise refuse the new
      // day's door — silently, and without triggering the re-render that
      // would fix it (2026-07-30).
      if (day > todayLocal()) return;
      setView({ kind: "daily", day });
    },
    [setView],
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

  // Memoized: the palette's rows memo depends on `nav`, so a fresh object
  // literal every Shell render would rebuild its rows per keystroke.
  const paletteNav = useMemo(
    () => ({
      openDay,
      openHabit: (key: string) => setView({ kind: "habit", key }),
      openLibrary: (habitKey: string) => setView({ kind: "library", habitKey }),
      openEntry: (id: string, habitKey: string) => setView({ kind: "entry", id, habitKey }),
      openCadence: (scale: CadenceScale, anchor: string) =>
        setView({ kind: "cadence", scale, anchor }),
      openCompare: () => setView({ kind: "compare" }),
      openTimers: () => setView({ kind: "timers" }),
      openMap: () => setView({ kind: "map" }),
      openHabitCreator: () => {
        setCreatorPending(true);
        setView({ kind: "settings", section: "habits" });
      },
    }),
    [openDay, setView],
  );

  // (The reduce-effects launch re-apply moved to settings/local.ts's
  // initLocalSettings, main.tsx — the DEV gate died with the real control.)

  // The day-cutoff home shift, launch half: the initial view is built before
  // the settings cache can load, so a pre-cutoff launch lands on today and is
  // REPLACED (never pushed — the archived-habit precedent) once the cache
  // resolves. After the cutoff hour this effect never fires, and it never
  // touches a view the user has already navigated away to.
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const t = window.setTimeout(() => {
      const v = viewRef.current;
      if (v.kind !== "daily" || v.day != null) return;
      const home = defaultLogDay();
      if (home !== todayLocal()) replaceView({ kind: "daily", day: home });
    }, 400);
    return () => window.clearTimeout(t);
    // Once, at mount — the launch correction only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = viewTitle(view, active, today);
  // (the month-name table moved into NavCalendar with the grid, 2026-08-01)

  return (
    <div className={`app-frame${railCollapsed ? " rail-collapsed" : ""}`}>
      {/* step 6a — the whole-window ambience layer (backdrop · timer backdrop);
          silent (null) for the art-free bundled pair */}
      <Ambience timers={view.kind === "timers"} />
      <Titlebar
        title={title}
        canBack={canBack}
        canForward={canForward}
        onBack={back}
        onForward={forward}
        railCollapsed={railCollapsed}
        onToggleRail={() => setRailCollapsed((c) => !c)}
        attention={catchUpWaiting}
      />

      <nav className="rail">
        {/* 1 · THE NAV CALENDAR — live since 2026-08-01 (step 9). It owns its
            own header now (chain · Jump · month), so the chunk-4 stand-in
            header went with the placeholder. No "Today" door: the highlighted
            cell IS the way home, and a separate button was ruled redundant
            ([[Calendar & Whimsy]] § the month grid). */}
        <div className="sec">
          <NavCalendar
            today={today}
            openDay={openDay}
            onCadence={(scale, anchor) => setView({ kind: "cadence", scale, anchor })}
          />
          {/* The dev tooling's only door until step 15's first-run setup
              replaces it — never drawn, and it compiles out of a release. */}
          {import.meta.env.DEV && (
            <button className="cal-placeholder" onClick={() => setView({ kind: "log" })}>
              dev log view
            </button>
          )}
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
            <button
              className={`tool${view.kind === "map" ? " active" : ""}`}
              onClick={() => setView({ kind: "map" })}
            >
              <Ico d={["M14 5.6a2 2 0 0 0 1.8 0l3.6-1.8A1 1 0 0 1 21 4.6v12.8a1 1 0 0 1-.6.9l-4.5 2.3a2 2 0 0 1-1.8 0l-4.2-2.1a2 2 0 0 0-1.8 0L4.4 20.4A1 1 0 0 1 3 19.4V6.6a1 1 0 0 1 .6-.9L8 3.4a2 2 0 0 1 1.8 0z"]} />
              Map
            </button>
          </div>
        </div>

        {/* the flex absorber that pushes Settings to the foot — the vignette
            clock it used to host was RETIRED 2026-08-01 (step 9's open) */}
        <div className="ambience" />

        {/* 4 · Settings — live since step 10; the health dot joins with the
            health home (it ORs into the titlebar attention dot then too) */}
        <div className="sec settings">
          <button
            className={`settings-row${view.kind === "settings" ? " active" : ""}`}
            onClick={() => setView({ kind: "settings", section: "habits" })}
          >
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
            onOpenEntry={(id, habitKey) => setView({ kind: "entry", id, habitKey })}
            onOpenDay={openDay}
          />
        ) : view.kind === "compare" ? (
          <CompareDashboard />
        ) : view.kind === "timers" ? (
          <TimersScreen
            onOpenHabit={(key) => setView({ kind: "habit", key })}
            onOpenEntry={(id, habitKey) => setView({ kind: "entry", id, habitKey })}
          />
        ) : view.kind === "map" ? (
          <MapScreen
            nav={{
              openCadence: (scale, anchor) => setView({ kind: "cadence", scale, anchor }),
              openDay,
              openHabit: (key) => setView({ kind: "habit", key }),
              openEntry: (id, habitKey) => setView({ kind: "entry", id, habitKey }),
            }}
          />
        ) : view.kind === "settings" ? (
          <SettingsScreen
            section={view.section}
            onSection={(section) => setView({ kind: "settings", section })}
            // "Land on the new habit's dashboard — it's live and loggable
            // immediately" ([[Habit Creator]] § Post-creation flow).
            onOpenHabit={(key) => setView({ kind: "habit", key })}
            openCreator={creatorPending}
            onCreatorOpened={() => setCreatorPending(false)}
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
          nav={paletteNav}
        />
      )}

      {/* kit-toast — the app's ONE slide-in slot, mounted once by the shell so
          any surface can raise it. First tenant: the form spine's session-remove
          undo. */}
      <ToastSlot />

      {/* kit-tooltip — the hover whisper, mounted once; any element opts in
          via data-tip / data-tip-long. First tenant: the Map's doors. */}
      <TooltipLayer />

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

