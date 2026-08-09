/**
 * SETTINGS — the configuration home (Build step 10, slice 1: the frame + the
 * four control-stack panes). Translation of `Final/settings.html` +
 * [[Settings (configuration home)]]; inventory + sync tags owned by
 * [[Settings & Configuration]].
 *
 * The frame: left-pane majors (all 13 sections, ruled order) + top tabs
 * (kit-tabs-modal's underline strip) + the this-device mark exactly where a
 * setting does not travel. Sections are ROUTES (`settings/<section>` —
 * [[Shell Mechanics]] § 2), so the left pane navigates; tabs inside a pane are
 * local state, never routes.
 *
 * ALL 13 SECTIONS LIVE since 2026-08-04 (built in five slices, Tracking ·
 * Appearance · Timers · Developer first). Storage, the last pending face,
 * went REAL at step 14 (2026-08-05) — the cloud-root picker lives in
 * StoragePane, and the pending-pane machinery left with its only tenant.
 *
 * Tracking's tabs are Periods · Metrics · LOGGING — the third is the
 * 2026-07-27 autosave ruling's home ([[Settings & Configuration]] § Tracking),
 * absent from the frozen face because it post-dates the freeze.
 */
import { useEffect, useState } from "react";
import { PREVIEW_MS, previewSignal } from "../timers/signal";
import { MIN_INTERVALS } from "../timers/timerCore";
import { useQuery } from "@evolu/react";
import { Ico, ICONS } from "../shell/icons";
import { Menu } from "../kit/Menu";
import {
  clampDayCutoff,
  clampListCap,
  clampWaveGap,
  DAY_CUTOFF_KEY,
  LIST_CAP_KEY,
  syncedSettingsQuery,
  WAVE_GAP_KEY,
  WEEK_START_KEY,
  writeSyncedSetting,
} from "./store";
import {
  clampUiScale,
  getForceOpaque,
  getMacBookPreview,
  getParityZoom,
  getPomoBreak,
  getPomoIntervals,
  getPomoWork,
  getReduceEffects,
  getSignalStyle,
  getUiScale,
  setForceOpaque,
  setMacBookPreview,
  setParityZoom,
  setPomoBreak,
  setPomoIntervals,
  setPomoWork,
  setReduceEffects,
  setSignalStyle,
  setUiScale,
  UI_SCALE_STEP,
  type SignalStyle,
} from "./local";
import { getPick, openThemesFolder, scanThemes, setTheme, type ThemeEntry } from "../theme/loader";
import { getCompactMode, setCompactMode, type CompactMode } from "../theme/compact";
import { cloudSub } from "./cloudRoot";
import {
  autosaveQuery,
  clampInterval,
  setAutosaveMinutes,
  AUTOSAVE_DEFAULT_MINUTES,
} from "../daily/autosave";
import { ManagePane } from "./ManagePane";
import { VocabularyPane } from "./VocabularyPane";
import { ImportersPane } from "./ImportersPane";
import { PresetsPane, PalettePane } from "./PresetsPalettePane";
import { WhimsyPane } from "./WhimsyPane";
import { HealthPane } from "./HealthPane";
import { HelpPane } from "./HelpPane";
import { BackupsPane } from "./BackupsPane";
import { StoragePane } from "./StoragePane";
import { LadderEditor } from "./LadderEditor";
import { globalLaddersQuery, laddersFrom, writeGlobalLadders } from "./ladderStore";
import { iconStats, LUCIDE_VERSION } from "../shell/habitIcons";
import { getLucideSeen } from "./local";
import { hasErrors, subscribeErrors } from "./errorLog";
import type { SettingsSection } from "../shell/views";
import "./settings.css";

// ── the section roster (ruled order — [[Settings & Configuration]]) ──────────

export const SECTIONS: { key: SettingsSection; name: string; icon: string[] }[] = [
  { key: "habits", name: "Habits", icon: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"] },
  { key: "tracking", name: "Tracking", icon: ICONS.calendar },
  { key: "appearance", name: "Appearance", icon: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M12 2v2", "M12 20v2", "m4.9 4.9 1.4 1.4", "m17.7 17.7 1.4 1.4", "M2 12h2", "M20 12h2", "m6.3 17.7-1.4 1.4", "m19.1 4.9-1.4 1.4"] },
  { key: "timers", name: "Timers", icon: ICONS.timer },
  { key: "whimsy", name: "Whimsy", icon: ["M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"] },
  { key: "importers", name: "Importers", icon: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m7 10 5 5 5-5", "M12 15V3"] },
  { key: "backups", name: "Backups", icon: ["M2 5a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z", "M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9", "M10 13h4"] },
  { key: "storage", name: "Storage", icon: ["M22 12H2", "M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z", "M6 16h.01", "M10 16h.01"] },
  { key: "presets", name: "Presets", icon: ["M4 21v-7", "M4 10V3", "M12 21v-9", "M12 8V3", "M20 21v-5", "M20 12V3", "M1 14h6", "M9 8h6", "M17 16h6"] },
  { key: "palette", name: "Palette", icon: ["M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"] },
  { key: "health", name: "Health", icon: ["M22 12h-4l-3 9L9 3l-3 9H2"] },
  { key: "developer", name: "Developer", icon: ["m16 18 6-6-6-6", "m8 6-6 6 6 6"] },
  { key: "help", name: "Help", icon: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3", "M12 17h.01"] },
];

export function SettingsScreen({
  section,
  onSection,
  onOpenHabit,
  onOpenDay,
  onOpenEntry,
  openCreator = false,
  onCreatorOpened,
}: {
  section: SettingsSection;
  onSection: (s: SettingsSection) => void;
  /** Post-creation flow: "land on the new habit's dashboard" (ruled). */
  onOpenHabit?: (habitKey: string) => void;
  /** Health → Data: a finding's deep link to the row's edit surface (step 13). */
  onOpenDay?: (date: string) => void;
  onOpenEntry?: (id: string, habitKey: string) => void;
  /** Arrived from the palette's "New habit" verb — open the creator on mount. */
  openCreator?: boolean;
  onCreatorOpened?: () => void;
}) {
  // The left pane's own copy of the glance dot — same rule as the rail's.
  const [healthWarn, setHealthWarn] = useState(() => hasErrors());
  useEffect(() => subscribeErrors((rows) => setHealthWarn(rows.length > 0)), []);
  return (
    <div className="setscreen">
      <div className="setgrid">
        <div className="slist">
          <p className="overline">Settings</p>
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              className={`snav${s.key === section ? " active" : ""}`}
              onClick={() => onSection(s.key)}
            >
              <Ico d={s.icon} />
              <span className="name">{s.name}</span>
              {s.key === "health" && healthWarn && <span className="hdot" />}
            </button>
          ))}
        </div>
        {section === "habits" ? (
          <HabitsPane
            onOpenHabit={onOpenHabit}
            openCreator={openCreator}
            onCreatorOpened={onCreatorOpened}
          />
        ) : section === "tracking" ? (
          <TrackingPane />
        ) : section === "appearance" ? (
          <AppearancePane />
        ) : section === "timers" ? (
          <TimersPane />
        ) : section === "developer" ? (
          <DeveloperPane />
        ) : section === "importers" ? (
          <Pane title="Importers">
            <div className="pbody">
              <ImportersPane />
            </div>
          </Pane>
        ) : section === "presets" ? (
          <Pane title="Presets">
            <div className="pbody">
              <PresetsPane />
            </div>
          </Pane>
        ) : section === "palette" ? (
          <Pane title="Palette">
            <div className="pbody">
              <PalettePane />
            </div>
          </Pane>
        ) : section === "whimsy" ? (
          <Pane title="Whimsy">
            <div className="pbody">
              <WhimsyPane />
            </div>
          </Pane>
        ) : section === "health" ? (
          <Pane title="Health">
            <HealthPane
              onOpenDay={onOpenDay}
              onOpenEntry={onOpenEntry}
              // The habit editor and the vocabulary lists are both tabs of the
              // Habits section, so both fix targets land there.
              onOpenHabits={() => onSection("habits")}
            />
          </Pane>
        ) : section === "help" ? (
          <Pane title="Help">
            <HelpPane />
          </Pane>
        ) : section === "backups" ? (
          <Pane title="Backups">
            <div className="pbody">
              <BackupsPane />
            </div>
          </Pane>
        ) : (
          <Pane title="Storage">
            <div className="pbody">
              <StoragePane />
            </div>
          </Pane>
        )}
      </div>
    </div>
  );
}

// ── shared control anatomy ───────────────────────────────────────────────────

const DEVMARK_ICON = [
  "M4 4h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  "M8 20h8",
  "M12 16v4",
];

/** kit-mark-device — synced is the unmarked default; this marks what stays.
 *  EXPORTED 2026-08-04: ImportersPane had its own byte-identical copy. */
export function DevMark() {
  return (
    <span className="devmark">
      <Ico d={DEVMARK_ICON} />
      This device
    </span>
  );
}

function Stepper({
  value,
  onStep,
}: {
  value: string;
  onStep: (dir: -1 | 1) => void;
}) {
  return (
    <span className="stepper">
      <button className="stepbtn" data-tip="Decrease" onClick={() => onStep(-1)}>
        <Ico d={["M5 12h14"]} />
      </button>
      <span className="stepval">{value}</span>
      <button className="stepbtn" data-tip="Increase" onClick={() => onStep(1)}>
        <Ico d={ICONS.plus} />
      </button>
    </span>
  );
}

function Seg<T extends string>({
  value,
  options,
  onPick,
}: {
  value: T;
  options: readonly { v: T; label: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <div className="segctl">
      {options.map((o) => (
        <button key={o.v} aria-pressed={o.v === value} onClick={() => onPick(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The drawn slider anatomy (.track/.fill/.handle) over pointer drag. */
function Slider({
  value,
  min,
  max,
  format,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const fromPointer = (e: React.PointerEvent<HTMLSpanElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onChange(Math.round(min + t * (max - min)));
  };
  return (
    <span className="slider">
      <span
        className="track"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
        }}
      >
        <span className="fill" style={{ width: `${pct}%` }} />
        <span className="handle" style={{ left: `${pct}%` }} />
      </span>
      <span className="sval">{format(value)}</span>
    </span>
  );
}

/** A selectbtn + the kit Menu, wrapped so useDismiss keeps the trigger a toggle. */
function Select({
  label,
  items,
  onPick,
}: {
  label: string;
  items: { key: string; label: string; selected: boolean }[];
  onPick: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="selwrap">
      <button className="selectbtn" onClick={() => setOpen((o) => !o)}>
        {label}
        <Ico d={ICONS.chevron} />
      </button>
      {open && (
        <Menu
          items={items.map((it) => ({
            key: it.key,
            label: it.label,
            selected: it.selected,
            onPick: () => onPick(it.key),
          }))}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}

function Pane({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pane">
      <div className="phead">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

// ── Habits — Manage · Vocabulary ─────────────────────────────────────────────

function HabitsPane({
  onOpenHabit,
  openCreator = false,
  onCreatorOpened,
}: {
  onOpenHabit?: (habitKey: string) => void;
  openCreator?: boolean;
  onCreatorOpened?: () => void;
}) {
  const [tab, setTab] = useState<"manage" | "vocab" | "icons">("manage");
  const [creating, setCreating] = useState(openCreator);
  useEffect(() => {
    if (!openCreator) return;
    setTab("manage");
    setCreating(true);
    onCreatorOpened?.();
  }, [openCreator, onCreatorOpened]);
  return (
    <section className="pane">
      <div className="phead">
        <h2>Habits</h2>
        <div className="pact">
          <button
            className="btn-accent"
            data-tip="New habit"
            onClick={() => {
              setTab("manage");
              setCreating(true);
            }}
          >
            <Ico d={ICONS.plus} />
            New habit
          </button>
        </div>
      </div>
      <div className="ttabs">
        <button className={`ttab${tab === "manage" ? " active" : ""}`} onClick={() => setTab("manage")}>
          Manage
        </button>
        <button className={`ttab${tab === "vocab" ? " active" : ""}`} onClick={() => setTab("vocab")}>
          Vocabulary
        </button>
        {/* Third tab, user-ruled 2026-08-02 (the frozen face draws two) — the
            icon set is a per-habit identity input, so it reads under Habits. */}
        <button className={`ttab${tab === "icons" ? " active" : ""}`} onClick={() => setTab("icons")}>
          Icons
        </button>
      </div>
      <div className="pbody">
        {tab === "manage" ? (
          <ManagePane
            creating={creating}
            onCloseCreator={() => setCreating(false)}
            onOpenHabit={onOpenHabit}
          />
        ) : tab === "icons" ? (
          <IconsTab />
        ) : (
          <VocabularyPane />
        )}
      </div>
    </section>
  );
}

/**
 * Habits → ICONS (user-asked 2026-08-02, at the slice-2 GUI pass that found the
 * roster was eleven stand-in paths). Three facts about the pinned set:
 * which version, since when, and how much it contains.
 *
 * READ-ONLY BY CONSTRUCTION, and the copy says so. The set is compiled into the
 * app at build time, so nothing here could install an update even in principle
 * — updating lucide is a rebuild, and the auto-updater is what delivers it.
 * Being TOLD a new version exists is Dependabot's job (`.github/dependabot.yml`
 * — it opens a pull request, which beats a settings row that can only nag).
 */
function IconsTab() {
  const seen = getLucideSeen();
  const { icons } = iconStats();
  const since = seen?.since ?? null;
  return (
    <div className="hscroll">
      <div className="ctrlstack">
        <div className="crow two">
          <span className="clabel">Icon set</span>
          <span className="cright">
            <span className="field">lucide {LUCIDE_VERSION}</span>
          </span>
        </div>
        <div className="crow">
          <span className="clabel">Installed</span>
          <DevMark />
          <span className="cright">
            <span className="field">
              {since ?? "—"}
            </span>
          </span>
        </div>
        <div className="crow two">
          <span className="clabel">Icons available</span>
          <span className="cright">
            <span className="field">{icons.toLocaleString()}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Tracking — Periods · Metrics · Logging ───────────────────────────────────

function TrackingPane() {
  const rows = useQuery(syncedSettingsQuery);
  const autosaveRows = useQuery(autosaveQuery);
  const ladderRows = useQuery(globalLaddersQuery);
  const [tab, setTab] = useState<"periods" | "metrics" | "logging">("periods");

  const get = (key: string): string | null => {
    const r = rows.find((x) => String(x.key) === key);
    return r != null ? String(r.value) : null;
  };
  const write = (key: string, value: string) => writeSyncedSetting(rows, key, value);

  const weekStart = get(WEEK_START_KEY) === "sunday" ? "sunday" : "monday";
  // Raw values straight into the clamps — the clamps own the parse, and a
  // `Number()` here turns a blank row into 0 before the blank-is-unreadable
  // guard can see it (`settings-2`; Spine.tsx has carried the raw-pass form
  // for the autosave interval since the guard landed).
  const cutoff = clampDayCutoff(get(DAY_CUTOFF_KEY));
  const waveGap = clampWaveGap(get(WAVE_GAP_KEY));
  const listCap = clampListCap(get(LIST_CAP_KEY));
  const autosaveRow = autosaveRows[0] != null ? { id: String(autosaveRows[0].id) } : null;
  const autosave = clampInterval(autosaveRows[0]?.value ?? AUTOSAVE_DEFAULT_MINUTES);

  return (
    <Pane title="Tracking">
      <div className="ttabs">
        {(["periods", "metrics", "logging"] as const).map((t) => (
          <button key={t} className={`ttab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {t === "periods" ? "Periods" : t === "metrics" ? "Metrics" : "Logging"}
          </button>
        ))}
      </div>
      <div className="pbody">
        <div className="hscroll">
          {tab === "periods" ? (
            <div className="ctrlstack">
              <div className="crow two">
                <span className="clabel">Week start</span>
                <span className="cright">
                  <Seg
                    value={weekStart}
                    options={[
                      { v: "monday", label: "Monday" },
                      { v: "sunday", label: "Sunday" },
                    ]}
                    onPick={(v) => write(WEEK_START_KEY, v)}
                  />
                </span>
              </div>
              {/* The Quarters row is STRUCK (user-ruled 2026-08-04, the
                  completeness audit): quarters are calendar, fixed — the
                  control offered exactly one option and nothing read it. */}
              <div className="crow two">
                <span className="clabel">Day cutoff</span>
                <span className="cright">
                  <Stepper
                    value={`${String(cutoff).padStart(2, "0")}:00`}
                    onStep={(d) => write(DAY_CUTOFF_KEY, String(clampDayCutoff(cutoff + d)))}
                  />
                </span>
              </div>
            </div>
          ) : tab === "metrics" ? (
            <div className="ctrlstack">
              <div className="crow two">
                <span className="clabel">Wave gap</span>
                <span className="cright">
                  <Stepper
                    value={`${waveGap} days`}
                    onStep={(d) => write(WAVE_GAP_KEY, String(clampWaveGap(waveGap + d)))}
                  />
                </span>
              </div>
              <div className="crow two">
                <span className="clabel">Dashboard list cap</span>
                <span className="cright">
                  <Stepper
                    value={`${listCap} rows`}
                    onStep={(d) => write(LIST_CAP_KEY, String(clampListCap(listCap + d)))}
                  />
                </span>
              </div>
              <div className="ladderblock">
                <p className="hglbl">Milestone ladders</p>
                <p className="vnote">
                  When a threshold milestone fires. Habits can override any of these on their own
                  row.
                </p>
                <LadderEditor
                  value={laddersFrom(ladderRows)}
                  onChange={(next) => writeGlobalLadders(ladderRows, next)}
                />
              </div>
            </div>
          ) : (
            <div className="ctrlstack">
              <div className="crow two">
                <span className="clabel">Auto-save interval</span>
                <span className="cright">
                  <Stepper
                    value={`${autosave} min`}
                    onStep={(d) => setAutosaveMinutes(autosaveRow, autosave + d)}
                  />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Pane>
  );
}

// ── Appearance — the seven per-device levers ─────────────────────────────────

function AppearancePane() {
  const [themes, setThemes] = useState<ThemeEntry[]>([]);
  const [pick, setPick] = useState(getPick());
  const [scale, setScale] = useState(getUiScale());
  const [compact, setCompact] = useState<CompactMode>(getCompactMode());
  const [reduce, setReduce] = useState(getReduceEffects());
  const [opaque, setOpaque] = useState(getForceOpaque());

  /**
   * Scan on mount, and RE-SCAN whenever the window regains focus.
   *
   * The re-scan exists because of the Themes-folder door below it: the natural
   * flow is now open the folder → drop a theme in → alt-tab back → pick it, and
   * a list built once at mount cannot contain something created after it. You
   * would drop a theme in and find the picker still doesn't know about it, with
   * nothing on screen explaining why. Focus is the right trigger precisely
   * because the folder is opened in ANOTHER application — coming back IS the
   * signal that something may have changed out there.
   *
   * Cheap enough to run unconditionally: one directory listing per return to
   * the window, against a folder holding a handful of entries. `cancelled`
   * guards the pane being closed mid-scan.
   */
  useEffect(() => {
    let cancelled = false;
    const scan = () =>
      scanThemes().then(
        (s) => {
          if (!cancelled) setThemes(s.themes);
        },
        (e) => console.error("Settings: theme scan failed", e),
      );
    void scan();
    const onFocus = () => void scan();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return (
    <Pane title="Appearance">
      <div className="pbody">
        <div className="hscroll">
          <div className="ctrlstack">
            <div className="crow">
              <span className="clabel">Theme</span>
              <DevMark />
              <span className="cright">
                <Select
                  label={pick}
                  items={themes.map((t) => ({ key: t.name, label: t.name, selected: t.name === pick }))}
                  onPick={(name) => {
                    const t = themes.find((x) => x.name === name);
                    if (!t) return;
                    setTheme(t).then(
                      () => setPick(t.name),
                      (e) => console.error("Settings: theme apply failed", e),
                    );
                  }}
                />
              </span>
            </div>
            {/* The drop-in themes root is `<cloud root>/themes` since step 14
                — Settings → Storage owns the pick; the stand-in picker this
                row carried (the last dev-panel survivor) is retired.

                HIDDEN, NOT DISABLED, when no cloud root is set: the ruled shape
                for an unset root is "paused, never a gate", and with no root
                there is no themes folder to open. Same guard the per-habit
                image-folder door uses. */}
            {cloudSub("themes") != null && (
              <div className="crow">
                <span className="clabel">Themes folder</span>
                {/* NO <DevMark/> HERE, deliberately. Every other row in this pane
                    is a per-device lever and says so; this one is not. The theme
                    PICK is per-device (its row is marked), but the FOLDER is on
                    the cloud drive and is shared with the other machine — a drop
                    made here shows up on both. Marking it "This device" would
                    say the opposite of what is true. */}
                <span className="cright">
                  <button className="btn-plain btn-sm" onClick={() => void openThemesFolder()}>
                    {/* the lucide folder glyph, inlined exactly as the per-habit
                        image-folder door does — ICONS carries doors/actions only
                        and has no folder key. ⚠ Second inline copy of this path;
                        a third should promote it into ICONS instead. */}
                    <Ico d={["M4 4h5l2 3h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"]} />
                    Open
                  </button>
                </span>
              </div>
            )}
            <div className="crow">
              <span className="clabel">UI scale</span>
              <DevMark />
              <span className="cright">
                <Stepper
                  value={`${scale}%`}
                  onStep={(d) => {
                    const next = clampUiScale(scale + d * UI_SCALE_STEP);
                    setUiScale(next);
                    setScale(next);
                  }}
                />
              </span>
            </div>
            <div className="crow">
              <span className="clabel">Compact mode</span>
              <DevMark />
              <span className="cright">
                <Seg
                  value={compact}
                  options={[
                    { v: "auto", label: "Auto" },
                    { v: "on", label: "On" },
                    { v: "off", label: "Off" },
                  ]}
                  onPick={(v) => {
                    setCompactMode(v);
                    setCompact(v);
                  }}
                />
              </span>
            </div>
            <div className="crow">
              <span className="clabel">Reduce effects</span>
              <DevMark />
              <span className="cright">
                <Seg
                  value={reduce ? "on" : "off"}
                  options={[
                    { v: "on", label: "On" },
                    { v: "off", label: "Off" },
                  ]}
                  onPick={(v) => {
                    setReduceEffects(v === "on");
                    setReduce(v === "on");
                  }}
                />
              </span>
            </div>
            <div className="crow">
              <span className="clabel">Force-opaque panels</span>
              <DevMark />
              <span className="cright">
                <Seg
                  value={opaque ? "on" : "off"}
                  options={[
                    { v: "on", label: "On" },
                    { v: "off", label: "Off" },
                  ]}
                  onPick={(v) => {
                    setForceOpaque(v === "on");
                    setOpaque(v === "on");
                  }}
                />
              </span>
            </div>
          </div>
        </div>
      </div>
    </Pane>
  );
}

// ── Timers — signal style · default pomodoro ─────────────────────────────────

function TimersPane() {
  const [signal, setSignal] = useState<SignalStyle>(getSignalStyle());
  const [work, setWork] = useState(getPomoWork());
  const [brk, setBrk] = useState(getPomoBreak());
  const [ivals, setIvals] = useState(getPomoIntervals());
  // Disabled while it plays, so a second press cannot stack a second run of
  // oscillators on top of the first.
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => {
    if (!previewing) return;
    const t = setTimeout(() => setPreviewing(false), PREVIEW_MS);
    return () => clearTimeout(t);
  }, [previewing]);
  return (
    <Pane title="Timers">
      <div className="pbody">
        <div className="ctrlstack">
          <div className="crow">
            <span className="clabel">Signal style</span>
            <DevMark />
            <span className="cright">
              <Select
                label={signal === "chime" ? "Chime" : "Silent"}
                items={[
                  { key: "chime", label: "Chime", selected: signal === "chime" },
                  { key: "silent", label: "Silent", selected: signal === "silent" },
                ]}
                onPick={(k) => {
                  setSignalStyle(k as SignalStyle);
                  setSignal(k as SignalStyle);
                }}
              />
            </span>
          </div>
          {/* TEST SOUND (user-ruled 2026-08-08, 3 s). Two jobs: hear the chime
              without waiting for a pomodoro boundary, and — the reason it is
              seconds rather than instant — give Windows a window in which to
              LIST Cibo in its Volume mixer, since it only shows apps that are
              actively producing audio. Per-app output-device selection is
              otherwise unreachable for an app whose only sound is a one-second
              chime. No `DevMark`: this is an action, not a stored setting. */}
          <div className="crow">
            <span className="clabel">Test sound</span>
            <span className="cright">
              <button
                className="btn-plain btn-sm"
                disabled={previewing}
                onClick={() => {
                  setPreviewing(true);
                  previewSignal();
                }}
              >
                {previewing ? "Playing…" : "Play test sound"}
              </button>
            </span>
          </div>
          <p className="fieldnote" style={{ marginTop: "calc(-1 * var(--space-4))" }}>
            Plays the chime for 3 seconds, whatever the signal style is set to. Windows only lists
            an app in its Volume mixer while that app is making sound — use this to catch Cibo there
            and give it its own output device.
          </p>
          <div className="crow">
            <span className="clabel">Default pomodoro</span>
            <DevMark />
            <span className="cright">
              <span className="pomopair">
                <span className="pomoside">
                  <span className="sglbl">Work</span>
                  <Stepper
                    value={`${work} min`}
                    onStep={(d) => {
                      const next = Math.min(180, Math.max(1, work + d * 5));
                      setPomoWork(next);
                      setWork(next);
                    }}
                  />
                </span>
                <span className="pomoside">
                  <span className="sglbl">Break</span>
                  <Stepper
                    value={`${brk} min`}
                    onStep={(d) => {
                      const next = Math.min(60, Math.max(1, brk + d));
                      setPomoBreak(next);
                      setBrk(next);
                    }}
                  />
                </span>
                {/* the third leg, with the interval-plan amendment (user-ruled
                    2026-08-08). Floors at 2, not 1: breaks sit BETWEEN
                    intervals, so a single-interval pomodoro is a countdown
                    wearing the wrong face. */}
                <span className="pomoside">
                  <span className="sglbl">Intervals</span>
                  <Stepper
                    value={`${ivals}`}
                    onStep={(d) => {
                      const next = Math.min(24, Math.max(MIN_INTERVALS, ivals + d));
                      setPomoIntervals(next);
                      setIvals(next);
                    }}
                  />
                </span>
              </span>
            </span>
          </div>
        </div>
      </div>
    </Pane>
  );
}

// ── Developer — MacBook preview · parity zoom ────────────────────────────────

// The rich seeder and the feed re-capture moved here when the hidden dev-panel
// surface was DELETED (2026-08-04, user-ruled "no longer need the dev panel at
// all"): the seeder survives because Hardening's full-scope seeding pass is
// user-ruled work; re-capture because changing the whimsy location otherwise
// only applies at the next day's fetch. Seeding stays DEV-gated - a release
// build must not offer a control that floods a real store with fixture rows -
// and the seeder module loads on click, so it stays out of the launch graph.
function DeveloperPane() {
  const [preview, setPreview] = useState(getMacBookPreview());
  const [parity, setParity] = useState(getParityZoom());
  const [seedStatus, setSeedStatus] = useState("");
  const [seedBusy, setSeedBusy] = useState(false);
  const runSeed = (clear: boolean) => {
    void (async () => {
      setSeedBusy(true);
      setSeedStatus("working… (this touches thousands of rows)");
      try {
        const { evolu } = await import("../db/evolu");
        const mod = await import("../db/seedRich");
        if (clear) {
          const r = await mod.clearRichSeed(evolu);
          setSeedStatus(`Cleared ${r.removed} rows.`);
        } else {
          const r = await mod.seedRich(evolu);
          setSeedStatus(
            `Seeded ${r.entries} entries · ${r.sessions} sessions · ${r.subunits} categoricals · ${r.days} finalized days (cleared ${r.clearedFirst} first).`,
          );
        }
      } catch (e) {
        setSeedStatus(`error: ${String(e)}`);
        console.error(e);
      } finally {
        setSeedBusy(false);
      }
    })();
  };
  const [rearmStatus, setRearmStatus] = useState("");
  const rearmSetup = () => {
    void (async () => {
      try {
        const { rearmFirstRun } = await import("../firstrun/firstRun");
        const ok = await rearmFirstRun();
        setRearmStatus(ok ? "armed — setup shows at next launch" : "failed (see console)");
      } catch (e) {
        setRearmStatus(`error: ${String(e)}`);
        console.error(e);
      }
    })();
  };
  // A TEST INSTRUMENT, not the un-finalize feature — see daily/devUnfinalize.ts
  // for why it exists at all. It puts days back into the catch-up queue so the
  // rail's lit-flag state can be reached on a fully-finalized store.
  const [unfinStatus, setUnfinStatus] = useState("");
  const [unfinBusy, setUnfinBusy] = useState(false);
  const unfinalize = (count: number) => {
    void (async () => {
      setUnfinBusy(true);
      setUnfinStatus("working…");
      try {
        const { evolu } = await import("../db/evolu");
        const { unfinalizeRecentDays } = await import("../daily/devUnfinalize");
        const { cleared } = await unfinalizeRecentDays(evolu, count);
        setUnfinStatus(
          cleared.length === 0
            ? "nothing to un-finalize"
            : `un-finalized ${cleared.length}: ${cleared.join(", ")}`,
        );
      } catch (e) {
        setUnfinStatus(`error: ${String(e)}`);
        console.error(e);
      } finally {
        setUnfinBusy(false);
      }
    })();
  };
  const [feedStatus, setFeedStatus] = useState("");
  const recaptureFeeds = () => {
    void (async () => {
      setFeedStatus("re-fetching…");
      try {
        const feeds = await import("../daily/feeds");
        const { loadWhimsyConfig } = await import("../daily/whimsyConfig");
        await feeds.devClearTodayFeeds();
        await feeds.ensureTodayFeeds(loadWhimsyConfig());
        setFeedStatus("done - today's snapshot re-captured");
      } catch (e) {
        setFeedStatus(`error: ${String(e)}`);
        console.error(e);
      }
    })();
  };
  return (
    <Pane title="Developer">
      <div className="pbody">
        <div className="ctrlstack">
          <div className="crow">
            <span className="clabel">MacBook preview</span>
            <DevMark />
            <span className="cright">
              <Seg
                value={preview ? "on" : "off"}
                options={[
                  { v: "on", label: "On" },
                  { v: "off", label: "Off" },
                ]}
                onPick={(v) => {
                  void setMacBookPreview(v === "on");
                  setPreview(v === "on");
                }}
              />
            </span>
          </div>
          <div className="crow">
            <span className="clabel">Parity zoom</span>
            <DevMark />
            <span className="cright">
              <Slider
                value={parity}
                min={80}
                max={120}
                format={(v) => `${v}%`}
                onChange={(v) => {
                  setParityZoom(v);
                  setParity(v);
                }}
              />
            </span>
          </div>
          <div className="crow">
            <span className="clabel">First-run setup</span>
            <DevMark />
            <span className="cright">
              {rearmStatus !== "" && <span className="mgtag">{rearmStatus}</span>}
              <button className="btn-plain btn-sm" onClick={rearmSetup}>
                Show again at next launch
              </button>
            </span>
          </div>
          <div className="crow">
            <span className="clabel">Re-capture feeds</span>
            <DevMark />
            <span className="cright">
              {feedStatus !== "" && <span className="mgtag">{feedStatus}</span>}
              <button className="btn-plain btn-sm" onClick={recaptureFeeds}>
                ↻ Re-capture
              </button>
            </span>
          </div>
          {import.meta.env.DEV && (
            <div className="crow">
              <span className="clabel">Rich seeder</span>
              <DevMark />
              <span className="cright">
                {seedStatus !== "" && <span className="mgtag">{seedStatus}</span>}
                <button className="btn-plain btn-sm" disabled={seedBusy} onClick={() => runSeed(false)}>
                  Seed
                </button>
                <button className="btn-plain btn-sm" disabled={seedBusy} onClick={() => runSeed(true)}>
                  Clear
                </button>
              </span>
            </div>
          )}
          {import.meta.env.DEV && (
            <div className="crow">
              <span className="clabel">Un-finalize recent days</span>
              <DevMark />
              <span className="cright">
                {unfinStatus !== "" && <span className="mgtag">{unfinStatus}</span>}
                <button className="btn-plain btn-sm" disabled={unfinBusy} onClick={() => unfinalize(3)}>
                  Last 3
                </button>
                <button className="btn-plain btn-sm" disabled={unfinBusy} onClick={() => unfinalize(7)}>
                  Last 7
                </button>
              </span>
            </div>
          )}
        </div>
      </div>
    </Pane>
  );
}
