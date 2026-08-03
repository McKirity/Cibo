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
 * SLICE 1 PANES: Tracking · Appearance · Timers · Developer (the pure
 * control stacks — every stand-in control the dashboards deferred here).
 * The other nine sections render their door + a quiet pending note; they land
 * in the later slices (Manage/creator · vocab/presets/palette/importers/
 * whimsy · health · help). The note is build glue, not a drawn state.
 *
 * Tracking's tabs are Periods · Metrics · LOGGING — the third is the
 * 2026-07-27 autosave ruling's home ([[Settings & Configuration]] § Tracking),
 * absent from the frozen face because it post-dates the freeze.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@evolu/react";
import { Ico } from "../shell/icons";
import { Menu } from "../kit/Menu";
import {
  clampDayCutoff,
  clampListCap,
  clampWaveGap,
  DAY_CUTOFF_DEFAULT,
  DAY_CUTOFF_KEY,
  LIST_CAP_DEFAULT,
  LIST_CAP_KEY,
  QUARTER_SCHEME_KEY,
  syncedSettingsQuery,
  WAVE_GAP_DEFAULT,
  WAVE_GAP_KEY,
  WEEK_START_KEY,
  writeSyncedSetting,
} from "./store";
import {
  clampUiScale,
  getBannerFade,
  getForceOpaque,
  getMacBookPreview,
  getParityZoom,
  getPomoBreak,
  getPomoWork,
  getReduceEffects,
  getSignalStyle,
  getUiScale,
  setBannerFade,
  setForceOpaque,
  setMacBookPreview,
  setParityZoom,
  setPomoBreak,
  setPomoWork,
  setReduceEffects,
  setSignalStyle,
  setUiScale,
  themeBannerFade,
  UI_SCALE_STEP,
  type SignalStyle,
} from "./local";
import { getPick, scanThemes, setTheme, type ThemeEntry } from "../theme/loader";
import { getCompactMode, setCompactMode, type CompactMode } from "../theme/compact";
import {
  autosaveQuery,
  clampInterval,
  setAutosaveMinutes,
  AUTOSAVE_DEFAULT_MINUTES,
} from "../daily/autosave";
import { ManagePane } from "./ManagePane";
import { iconStats, LUCIDE_VERSION } from "../shell/habitIcons";
import { getLucideSeen } from "./local";
import type { SettingsSection } from "../shell/views";
import "./settings.css";

// ── the section roster (ruled order — [[Settings & Configuration]]) ──────────

const SECTIONS: { key: SettingsSection; name: string; icon: string[] }[] = [
  { key: "habits", name: "Habits", icon: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"] },
  { key: "tracking", name: "Tracking", icon: ["M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M16 2v4", "M8 2v4", "M3 10h18"] },
  { key: "appearance", name: "Appearance", icon: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M12 2v2", "M12 20v2", "m4.9 4.9 1.4 1.4", "m17.7 17.7 1.4 1.4", "M2 12h2", "M20 12h2", "m6.3 17.7-1.4 1.4", "m19.1 4.9-1.4 1.4"] },
  { key: "timers", name: "Timers", icon: ["M10 2h4", "M12 14l3-3", "M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"] },
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

/** What each pending section will hold — the door's one honest line. */
const PENDING: Partial<Record<SettingsSection, string>> = {
  whimsy: "Location · birthdate · sun sign · country · countdowns · per-card toggles.",
  importers: "API keys (TMDB · YouTube) and the Calibre library path.",
  backups: "Restore from backup… and the retention dials (arrives with step 12).",
  storage: "The cloud root picker (arrives with step 14's readiness checkpoint).",
  presets: "Comparing Statistics · Advanced Search — rename, delete, inspect.",
  palette: "Enable/disable toggles for the pinned ten-action inventory.",
  health: "System · Data — status rows, per-importer Test connection, the data checks.",
  help: "Manual (the 22 articles) · Hotkeys · About.",
};

export function SettingsScreen({
  section,
  onSection,
  onOpenHabit,
}: {
  section: SettingsSection;
  onSection: (s: SettingsSection) => void;
  /** Post-creation flow: "land on the new habit's dashboard" (ruled). */
  onOpenHabit?: (habitKey: string) => void;
}) {
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
              {/* the health dot joins the Health row with the health home */}
            </button>
          ))}
        </div>
        {section === "habits" ? (
          <HabitsPane onOpenHabit={onOpenHabit} />
        ) : section === "tracking" ? (
          <TrackingPane />
        ) : section === "appearance" ? (
          <AppearancePane />
        ) : section === "timers" ? (
          <TimersPane />
        ) : section === "developer" ? (
          <DeveloperPane />
        ) : (
          <PendingPane section={section} />
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

/** kit-mark-device — synced is the unmarked default; this marks what stays. */
function DevMark() {
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
        <Ico d={["M12 5v14", "M5 12h14"]} />
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
        <Ico d={["m6 9 6 6 6-6"]} />
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

function PendingPane({ section }: { section: SettingsSection }) {
  const meta = SECTIONS.find((s) => s.key === section);
  return (
    <Pane title={meta?.name ?? "Settings"}>
      <p className="pending">
        Not built yet — this pane arrives later in step 10.
        {PENDING[section] != null && (
          <>
            {" "}
            It will hold: {PENDING[section]}
          </>
        )}
      </p>
    </Pane>
  );
}

// ── Habits — Manage · Vocabulary ─────────────────────────────────────────────

function HabitsPane({ onOpenHabit }: { onOpenHabit?: (habitKey: string) => void }) {
  const [tab, setTab] = useState<"manage" | "vocab" | "icons">("manage");
  const [creating, setCreating] = useState(false);
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
            <Ico d={["M12 5v14", "M5 12h14"]} />
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
          <p className="pending">
            Not built yet — the Vocabulary tab arrives with a later slice. It will hold: the
            global status list · the fixed Rating/Priority scales (read-only) · the per-habit
            entry-level Mediums (Type / Genre).
          </p>
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
  const [tab, setTab] = useState<"periods" | "metrics" | "logging">("periods");

  const get = (key: string): string | null => {
    const r = rows.find((x) => String(x.key) === key);
    return r != null ? String(r.value) : null;
  };
  const write = (key: string, value: string) => writeSyncedSetting(rows, key, value);

  const weekStart = get(WEEK_START_KEY) === "sunday" ? "sunday" : "monday";
  const cutoff = clampDayCutoff(Number(get(DAY_CUTOFF_KEY) ?? DAY_CUTOFF_DEFAULT));
  const waveGap = clampWaveGap(Number(get(WAVE_GAP_KEY) ?? WAVE_GAP_DEFAULT));
  const listCap = clampListCap(Number(get(LIST_CAP_KEY) ?? LIST_CAP_DEFAULT));
  const autosaveRow = autosaveRows[0] != null ? { id: String(autosaveRows[0].id) } : null;
  const autosave = clampInterval(Number(autosaveRows[0]?.value ?? AUTOSAVE_DEFAULT_MINUTES));

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
              <div className="crow two">
                <span className="clabel">Quarters</span>
                <span className="cright">
                  <Select
                    label="Calendar · Jan · Apr · Jul · Oct"
                    items={[{ key: "calendar", label: "Calendar · Jan · Apr · Jul · Oct", selected: true }]}
                    onPick={(k) => write(QUARTER_SCHEME_KEY, k)}
                  />
                </span>
              </div>
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
              {/* Milestone threshold ladders (global) land with the Manage
                  slice — the editor is shared with the per-habit overrides. */}
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

// ── Appearance — the six per-device levers ───────────────────────────────────

function AppearancePane() {
  const [themes, setThemes] = useState<ThemeEntry[]>([]);
  const [pick, setPick] = useState(getPick());
  const [scale, setScale] = useState(getUiScale());
  const [compact, setCompact] = useState<CompactMode>(getCompactMode());
  const [reduce, setReduce] = useState(getReduceEffects());
  const [opaque, setOpaque] = useState(getForceOpaque());
  const [fade, setFade] = useState<number>(() => getBannerFade() ?? themeBannerFade());

  useEffect(() => {
    scanThemes().then(
      (s) => setThemes(s.themes),
      (e) => console.error("Settings: theme scan failed", e),
    );
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
            <div className="crow">
              <span className="clabel">Banner fade amount</span>
              <DevMark />
              <span className="cright">
                <Slider
                  value={fade}
                  min={0}
                  max={100}
                  format={(v) => `${v}%`}
                  onChange={(v) => {
                    setBannerFade(v);
                    setFade(v);
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
              </span>
            </span>
          </div>
        </div>
      </div>
    </Pane>
  );
}

// ── Developer — MacBook preview · parity zoom ────────────────────────────────

function DeveloperPane() {
  const [preview, setPreview] = useState(getMacBookPreview());
  const [parity, setParity] = useState(getParityZoom());
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
        </div>
      </div>
    </Pane>
  );
}
