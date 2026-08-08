/**
 * SETTINGS → HEALTH — the health home (Build step 10, slice 5).
 *
 * [[App Health & Diagnostics]]: "the app tells you it's healthy is the whole
 * safety story". One surface shared by the system half (this note) and the
 * DATA half ([[Data Doctor (Reduced)]]), because "neither justifies a nav slot
 * alone, and two separate maintenance destinations would be strange".
 *
 * THE DISPLAY CONTRACT, and it is the load-bearing idea: "every row DISPLAYS
 * state whose mechanics are owned elsewhere — this surface is the display
 * contract, never the machinery". So nothing here computes anything a real
 * owner will later own; a row whose owner does not exist yet says so plainly
 * instead of inventing a number.
 *
 * Run model, as ruled: evaluated at launch (feeding the rail dot) and
 * **re-checked when this surface opens** — "cheap at personal scale; no
 * background polling".
 *
 * WHAT IS LIVE vs WHAT WAITS:
 *  · Importers — LIVE. `threeWayProbe` is step 8's, three-way diagnosis and
 *    all; this adds the button the ruling always wanted.
 *  · Database + App identity — LIVE. Trivial counts, "cheap trust-building
 *    numbers".
 *  · Recent errors — LIVE, over `settings/errorLog` (built with this slice;
 *    the accumulation home the 2026-07-03 ruling named and nothing provided).
 *  · Entry duplicates — LIVE. Step 13's `entry-dedupe` check, built early at
 *    step 8 and user-ruled to get a real Settings door: this is that door.
 *  · Backups — LIVE since step 12.
 *  · Sync — DORMANT by ruling: "drawn quiet, never omitted — wakes when the
 *    Mac joins".
 *  · The Data half — LIVE since step 13: all TEN ruled checks over
 *    `src/db/doctor.ts`, with per-finding mute and the restorable Ignored list.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { Ico, ICONS } from "../shell/icons";
import { importerServices } from "../importers/sources";
import { threeWayProbe } from "../importers/probes";
import { consumeProbeAll, PROBE_ALL_EVENT } from "../shell/navRequest";
import type { ImporterSource } from "../importers/types";
import {
  BACKUP_EVENT,
  backupRunning,
  getBackupsRoot,
  readBackupRecord,
  runBackup,
} from "../backup/backup";
import { deleteEntriesCascade } from "../library/entryDelete";
import { resolveRef } from "./cloudRoot";
import { clearErrors, recentErrors, subscribeErrors, type LoggedError } from "./errorLog";
import { LUCIDE_VERSION } from "../shell/habitIcons";
import {
  publishDoctor,
  runDoctor,
  type CheckReport,
  type DoctorReport,
  type Finding,
  type Severity,
} from "../db/doctor";
import {
  decodeMutes,
  doctorMutesQuery,
  muteFinding,
  unmuteFinding,
} from "../db/doctorMutes";

const PIP_OK = ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "m8.5 12.5 2.5 2.5 4.5-5"];
const PIP_ERR = ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M12 7v6", "M12 17h.01"];
const PIP_IDLE = ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"];

type Tab = "system" | "data";

/** Where a finding's fix action sends you — Shell's doors, threaded down. */
export interface HealthNav {
  onOpenDay?: (date: string) => void;
  onOpenEntry?: (id: string, habitKey: string) => void;
  /** The habit editor + the vocabulary lists both live in Settings → Habits. */
  onOpenHabits?: () => void;
}

export function HealthPane(nav: HealthNav) {
  const [tab, setTab] = useState<Tab>("system");
  return (
    <>
      <div className="ttabs">
        <button className={`ttab${tab === "system" ? " active" : ""}`} onClick={() => setTab("system")}>
          System
        </button>
        <button className={`ttab${tab === "data" ? " active" : ""}`} onClick={() => setTab("data")}>
          Data
        </button>
      </div>
      <div className="pbody">{tab === "system" ? <SystemTab /> : <DataTab {...nav} />}</div>
    </>
  );
}

// ── System ───────────────────────────────────────────────────────────────────

/* COUNT SQL-SIDE, never `rows.length` (2026-08-04). These three selected every
   id in `habits`, `entries` and `sessions` and rendered the array lengths —
   tens of thousands of ids materialised into JS on every store change while
   this tab is mounted, to draw one line of text. The projected 15-year store
   makes that the pane's dominant cost. `countAll` is the app's established
   answer (daily/Daily.tsx's Lifetime card). */
const countsQuery = evolu.createQuery((db) =>
  db.selectFrom("habits").select((eb) => eb.fn.countAll<number>().as("n")).where("isDeleted", "is not", 1),
);
const entryCountQuery = evolu.createQuery((db) =>
  db.selectFrom("entries").select((eb) => eb.fn.countAll<number>().as("n")).where("isDeleted", "is not", 1),
);
const sessionCountQuery = evolu.createQuery((db) =>
  db.selectFrom("sessions").select((eb) => eb.fn.countAll<number>().as("n")).where("isDeleted", "is not", 1),
);
const seedVersionQuery = evolu.createQuery((db) =>
  db
    .selectFrom("app_meta")
    .select(["value"])
    .where("key", "=", "seed_version" as never)
    .where("isDeleted", "is not", 1),
);

function SystemTab() {
  const habitCount = useQuery(countsQuery)[0]?.n ?? 0;
  const entryCount = useQuery(entryCountQuery)[0]?.n ?? 0;
  const sessionCount = useQuery(sessionCountQuery)[0]?.n ?? 0;
  const seed = useQuery(seedVersionQuery);
  const [errors, setErrors] = useState<LoggedError[]>(() => recentErrors());
  useEffect(() => subscribeErrors(setErrors), []);
  // "Test connection" (palette verb, 2026-08-04): consume the one-shot on
  // mount, hear the event while mounted — a bumped signal makes every
  // importer row run its probe.
  const [probeSignal, setProbeSignal] = useState(() => (consumeProbeAll() ? 1 : 0));
  useEffect(() => {
    // A mounted tab handles the event directly — consume the parked one-shot
    // too, so it cannot re-fire on some later mount.
    const h = () => {
      consumeProbeAll();
      setProbeSignal((n) => n + 1);
    };
    window.addEventListener(PROBE_ALL_EVENT, h);
    return () => window.removeEventListener(PROBE_ALL_EVENT, h);
  }, []);

  return (
    <div className="hscroll">
      <div className="hgroup" style={{ marginTop: 0 }}>
        <p className="hglbl">Backups</p>
        <div className="hlist">
          <BackupRow />
        </div>
      </div>

      <div className="hgroup">
        <p className="hglbl">Importers</p>
        <div className="hlist">
          {importerServices().map((s) => (
            <ImporterRow key={s.name} name={s.name} source={s.probe} runSignal={probeSignal} />
          ))}
        </div>
      </div>

      <div className="hgroup">
        <p className="hglbl">Sync</p>
        <div className="hlist">
          <Row
            dormant
            pip="idle"
            label="Sync"
            state="Off — this is the only device. It wakes when a second one joins."
          />
        </div>
      </div>

      <div className="hgroup">
        <p className="hglbl">Database</p>
        <div className="hlist">
          <Row
            pip="ok"
            label="Contents"
            state={`${habitCount} habits · ${entryCount.toLocaleString()} entries · ${sessionCount.toLocaleString()} sessions`}
          />
        </div>
      </div>

      <div className="hgroup">
        <p className="hglbl">App</p>
        <div className="hlist">
          <Row
            pip="ok"
            label="Version"
            state={`Cibo ${__APP_VERSION__} · icon set lucide ${LUCIDE_VERSION}`}
          />
          <Row
            pip="ok"
            label="Data version"
            state={`Seed batch ${seed[0] != null ? String(seed[0].value) : "—"} applied`}
          />
        </div>
      </div>

      <div className="hgroup">
        <p className="hglbl">
          Recent errors
          <span className="runline">{errors.length === 0 ? "none" : `last ${errors.length}`}</span>
        </p>
        {errors.length === 0 ? (
          <p className="vnote">Nothing has failed since this list was last cleared.</p>
        ) : (
          <>
            <div className="hlist">
              {errors.map((e, i) => (
                <Row key={i} pip="err" label={e.message} state={`${e.source} · ${e.at}`} />
              ))}
            </div>
            <button className="btn-plain btn-sm" style={{ marginTop: "var(--space-5)" }} onClick={clearErrors}>
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The backups health row (step 12) — reads the same record the stale-check
 * reads; "Back up now" runs the one pipeline. A failed backup is an ERROR pip
 * (and the error log already lit the rail dot); paused/stale are quiet — the
 * nag, not an alarm.
 */
function BackupRow() {
  const [record, setRecord] = useState(readBackupRecord());
  const [busy, setBusy] = useState(backupRunning());
  useEffect(() => {
    const h = () => {
      setRecord(readBackupRecord());
      setBusy(backupRunning());
    };
    window.addEventListener(BACKUP_EVENT, h);
    return () => window.removeEventListener(BACKUP_EVENT, h);
  }, []);
  const root = getBackupsRoot();
  const staleMs = 7 * 86_400_000;
  const pip =
    root == null ? "idle" : record == null ? "idle" : !record.ok ? "err" : "ok";
  const state =
    root == null
      ? "Paused — no backups folder set. Pick one in Settings → Backups."
      : busy
        ? "Backing up…"
        : record == null
          ? "No backup yet — the first writes on the next close."
          : !record.ok
            ? `Last backup failed — ${record.error ?? "unknown"}`
            : Date.now() - new Date(record.at).getTime() > staleMs
              ? `Last good backup ${new Date(record.at).toISOString().slice(0, 10)} — stale; the next launch or close catches up.`
              : `Last backup ${new Date(record.at).toISOString().slice(0, 10)} · verified · on ${record.reason}`;
  return (
    <Row
      pip={pip}
      label="Automatic backups"
      state={state}
      action={
        <button
          className="btn-plain btn-sm"
          disabled={root == null || busy}
          onClick={() => {
            setBusy(true);
            void runBackup("manual");
          }}
        >
          Back up now
        </button>
      }
    />
  );
}

function Row({
  pip,
  label,
  state,
  action,
  dormant,
}: {
  pip: "ok" | "err" | "idle";
  label: string;
  state: string;
  action?: React.ReactNode;
  dormant?: boolean;
}) {
  return (
    <div className={`srow${dormant === true ? " dormant" : ""}`}>
      <span className={`pip ${pip}`}>
        <Ico d={pip === "ok" ? PIP_OK : pip === "err" ? PIP_ERR : PIP_IDLE} />
      </span>
      <span className="sinfo">
        <span className="slabel">{label}</span>
        <span className={`sstate${pip === "err" ? " err" : ""}`}>{state}</span>
      </span>
      {action != null && <span className="sact">{action}</span>}
    </div>
  );
}

function ImporterRow({
  name,
  source,
  runSignal = 0,
}: {
  name: string;
  source: ImporterSource;
  /** Bumped by the palette's test-all — each bump runs this row's probe. */
  runSignal?: number;
}) {
  const [verdict, setVerdict] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const test = useCallback(async () => {
    setBusy(true);
    setVerdict(null);
    try {
      setVerdict(await threeWayProbe(source));
    } catch (e) {
      setVerdict({ ok: false, message: String(e) });
    } finally {
      setBusy(false);
    }
  }, [source]);

  useEffect(() => {
    if (runSignal > 0) void test();
  }, [runSignal, test]);

  return (
    <div className="srow">
      <span className={`pip ${verdict == null ? "idle" : verdict.ok ? "ok" : "err"}`}>
        <Ico d={verdict == null ? PIP_IDLE : verdict.ok ? PIP_OK : PIP_ERR} />
      </span>
      <span className="sinfo">
        <span className="slabel">{name}</span>
        <span className={`sstate${verdict != null && !verdict.ok ? " err" : ""}`}>
          {busy ? "Testing…" : (verdict?.message ?? "Not tested this session")}
        </span>
      </span>
      <span className="sact">
        <button className="btn-plain btn-sm" disabled={busy} onClick={() => void test()}>
          Test connection
        </button>
      </span>
    </div>
  );
}


// ── Data ─────────────────────────────────────────────────────────────────────
//
// THE DATA DOCTOR (step 13) — the ruled TEN checks over `src/db/doctor.ts`.
// This is the display half only: the engine computes, the surface shows the
// findings, offers each one's fix, and lets one be ignored on purpose.
//
// Ruled run model: the surface opens → a full pass INCLUDING the filesystem
// tier (the launch pass, which feeds the rail dot, runs the DB tier only).
//
// SEVERITY IS THE WHOLE GRAMMAR: errors tint the row and light the rail dot,
// warnings are quiet colour, info is not an alarm at all. Never colour alone —
// the pip, the state word and the finding lines all carry it.

const PIP_WARN = ICONS.warning;
const ICO_MUTE = ["M11 5 6 9H2v6h4l5 4z", "M23 9l-6 6", "M17 9l6 6"];
const ICO_RERUN = ["M21 12a9 9 0 1 1-9-9c2.5 0 4.8 1 6.4 2.6L21 8", "M21 3v5h-5"];
const ICO_DISC = ICONS.chevronRight;

/** The severity tier's class suffix — one word, used by pip, word and row. */
const tierClass = (severity: Severity): string =>
  severity === "error" ? "err" : severity === "warning" ? "warn" : "info";

const pipPath = (severity: Severity): string[] =>
  severity === "error" ? PIP_ERR : severity === "warning" ? PIP_WARN : PIP_IDLE;

function DataTab({ onOpenDay, onOpenEntry, onOpenHabits }: HealthNav) {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  /** Muted this session — the store is the truth, this keeps the list honest
   *  between a mute and the next run without re-scanning the filesystem. */
  const [justMuted, setJustMuted] = useState<ReadonlySet<string>>(new Set());

  const muteRows = useQuery(doctorMutesQuery);
  const ignored = useMemo(() => decodeMutes(muteRows), [muteRows]);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const r = await runDoctor({ withFs: true });
      setReport(r);
      setJustMuted(new Set());
      // The dot follows the freshest verdict, whoever produced it.
      publishDoctor(r);
    } catch (e) {
      console.error("doctor: run failed", e);
    } finally {
      setBusy(false);
    }
  }, []);

  // "Re-checked when the surface opens" — the ruled half of the run model.
  useEffect(() => {
    void run();
  }, [run]);

  const visible = useCallback(
    (c: CheckReport): Finding[] => c.findings.filter((f) => !justMuted.has(f.muteKey)),
    [justMuted],
  );

  const mute = (f: Finding) => {
    if (!muteFinding(f.muteKey)) return;
    setJustMuted((prev) => new Set(prev).add(f.muteKey));
  };

  const act = async (action: NonNullable<Finding["action"]>) => {
    setBusy(true);
    try {
      if (action.kind === "delete-session") {
        // Uniform cascade (user-ruled 2026-08-06, audit fork B): the
        // session's value rows die with it, same as every other delete path.
        const vals = await evolu.loadQuery(
          evolu.createQuery((db) =>
            db.selectFrom("subunit_values").select(["id"]).where("session_fk", "=", action.id as never).where("isDeleted", "is not", 1),
          ),
        );
        for (const v of vals) {
          const vr = evolu.update("subunit_values", { id: v.id as never, isDeleted: 1 });
          if (!vr.ok) console.error("doctor: value delete rejected", vr.error);
        }
        const res = evolu.update("sessions", { id: action.id as never, isDeleted: 1 });
        if (!res.ok) console.error("doctor: session delete rejected", res.error);
      } else if (action.kind === "delete-entries") {
        await deleteEntriesCascade(action.ids, "permanent");
      } else {
        // The finding's path is root-relative (stable mute keys); it meets
        // this device's cloud root only here, at the moment of the delete.
        const abs = resolveRef(action.path);
        if (abs == null) throw new Error("no cloud root set");
        const fs = await import("@tauri-apps/plugin-fs");
        await fs.remove(abs);
      }
      await run();
    } catch (e) {
      console.error("doctor: fix action failed", e);
    } finally {
      setBusy(false);
    }
  };

  const goto = (t: NonNullable<Finding["target"]>) => {
    if (t.kind === "day") onOpenDay?.(t.date);
    else if (t.kind === "entry") onOpenEntry?.(t.id, t.habitKey);
    else onOpenHabits?.();
  };

  const checks = report?.checks ?? [];
  const totalFindings = checks.reduce((n, c) => n + visible(c).length, 0);

  return (
    <div className="hscroll">
      <div className="hgroup" style={{ marginTop: 0 }}>
        <p className="hglbl">
          Data Doctor
          <span className="runline">
            {report == null
              ? busy
                ? "checking…"
                : "not run yet"
              : `${checks.length} checks · ${totalFindings === 0 ? "all clear" : `${totalFindings} to look at`}`}
          </span>
        </p>
        <div className="hlist">
          {checks.map((c) => {
            const found = visible(c);
            const lit = c.ran && found.length > 0;
            const tier = tierClass(c.severity);
            return (
              <div className="ddcheck" key={c.id}>
                <div className={`srow${lit && c.severity !== "info" ? ` finding ${tier}` : ""}`}>
                  <span className={`pip ${!c.ran ? "idle" : lit ? tier : "ok"}`}>
                    <Ico d={!c.ran ? PIP_IDLE : lit ? pipPath(c.severity) : PIP_OK} />
                  </span>
                  <span className="sinfo">
                    <span className="slabel">{c.label}</span>
                    <span className="sstate">
                      {c.note}
                      {c.muted > 0 && ` · ${c.muted} ignored`}
                    </span>
                  </span>
                  <span className="sact">
                    {!c.ran ? (
                      <span className="sword idle">Not checked</span>
                    ) : c.error != null ? (
                      // "Looked and failed" is its own face. Drawing `Clean`
                      // over a scan that threw is what let a broken filesystem
                      // check read as a healthy one (bug `doctor-1`).
                      <span className="sword err" title={c.error}>
                        Couldn’t check
                      </span>
                    ) : lit ? (
                      <>
                        <span className={`sword ${tier}`}>{found.length} found</span>
                        <button
                          className={`disc${open === c.id ? " on" : ""}`}
                          title={open === c.id ? "Hide" : "Show"}
                          onClick={() => setOpen(open === c.id ? null : c.id)}
                        >
                          <Ico d={ICO_DISC} />
                        </button>
                      </>
                    ) : (
                      <span className="sword ok">Clean</span>
                    )}
                  </span>
                </div>
                {open === c.id &&
                  found.map((f) => (
                    <div className={`dfind ${tier}`} key={f.muteKey}>
                      <span className="dfid">
                        <span className="dfline">{f.line}</span>
                        <span className="dfctx">{f.context}</span>
                      </span>
                      <span className="dfacts">
                        {f.target != null && (
                          <button className="btn-plain btn-sm" onClick={() => goto(f.target!)}>
                            {f.target.kind === "day"
                              ? "Open the day"
                              : f.target.kind === "entry"
                                ? "Open the entry"
                                : f.target.kind === "habit"
                                  ? "Open the habit"
                                  : "Open the lists"}
                          </button>
                        )}
                        {f.action != null && (
                          <button
                            className="btn-danger btn-sm"
                            disabled={busy}
                            onClick={() => void act(f.action!)}
                          >
                            {f.actionLabel ?? "Fix"}
                          </button>
                        )}
                        <button className="iconbtn" title="Ignore this finding" onClick={() => mute(f)}>
                          <Ico d={ICO_MUTE} />
                        </button>
                      </span>
                    </div>
                  ))}
              </div>
            );
          })}
          {checks.length === 0 && (
            <p className="vnote">{busy ? "Running the checks…" : "The checks have not run yet."}</p>
          )}
        </div>
        <button
          className="btn-plain"
          style={{ marginTop: "var(--space-6)" }}
          disabled={busy}
          onClick={() => void run()}
        >
          <Ico d={ICO_RERUN} />
          {busy ? "Running…" : "Run checks"}
        </button>
      </div>

      {/* The restorable Ignored list — the ruled other half of muting. A mute
          you cannot find again is a bug you hid from yourself. */}
      {ignored.length > 0 && (
        <div className="hgroup">
          <p className="hglbl">
            Ignored
            <span className="runline">{ignored.length}</span>
          </p>
          <div className="hlist">
            {ignored.map((m) => {
              const spec = checks.find((c) => c.id === m.check);
              return (
                <div className="srow" key={m.id}>
                  <span className="pip idle">
                    <Ico d={ICO_MUTE} />
                  </span>
                  <span className="sinfo">
                    <span className="slabel">{spec?.label ?? m.check}</span>
                    <span className="sstate">Ignored since {m.since}</span>
                  </span>
                  <span className="sact">
                    <button
                      className="btn-plain btn-sm"
                      disabled={busy}
                      onClick={() => {
                        if (unmuteFinding(m.id)) void run();
                      }}
                    >
                      Stop ignoring
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
