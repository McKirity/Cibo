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
 *  · Backups — WAITS for step 12. The row is drawn with its state unknown
 *    rather than omitted, so the shape is not retrofitted later.
 *  · Sync — DORMANT by ruling: "drawn quiet, never omitted — wakes when the
 *    Mac joins".
 *  · The other seven Data Doctor checks — step 13's.
 */
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { Ico } from "../shell/icons";
import { importerServices } from "../importers/sources";
import { threeWayProbe } from "../importers/probes";
import type { ImporterSource } from "../importers/types";
import {
  BACKUP_EVENT,
  backupRunning,
  getBackupsRoot,
  readBackupRecord,
  runBackup,
} from "../backup/backup";
import { causeNote, findDuplicates, type DuplicateReport } from "../db/duplicates";
import { deleteEntriesCascade } from "../library/entryDelete";
import { clearErrors, recentErrors, subscribeErrors, type LoggedError } from "./errorLog";
import { LUCIDE_VERSION } from "../shell/habitIcons";

const PIP_OK = ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "m8.5 12.5 2.5 2.5 4.5-5"];
const PIP_ERR = ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M12 7v6", "M12 17h.01"];
const PIP_IDLE = ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"];

type Tab = "system" | "data";

export function HealthPane() {
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
      <div className="pbody">{tab === "system" ? <SystemTab /> : <DataTab />}</div>
    </>
  );
}

// ── System ───────────────────────────────────────────────────────────────────

const countsQuery = evolu.createQuery((db) =>
  db.selectFrom("habits").select(["id"]).where("isDeleted", "is not", 1),
);
const entryCountQuery = evolu.createQuery((db) =>
  db.selectFrom("entries").select(["id"]).where("isDeleted", "is not", 1),
);
const sessionCountQuery = evolu.createQuery((db) =>
  db.selectFrom("sessions").select(["id"]).where("isDeleted", "is not", 1),
);
const seedVersionQuery = evolu.createQuery((db) =>
  db
    .selectFrom("app_meta")
    .select(["value"])
    .where("key", "=", "seed_version" as never)
    .where("isDeleted", "is not", 1),
);

function SystemTab() {
  const habits = useQuery(countsQuery);
  const entries = useQuery(entryCountQuery);
  const sessions = useQuery(sessionCountQuery);
  const seed = useQuery(seedVersionQuery);
  const [errors, setErrors] = useState<LoggedError[]>(() => recentErrors());
  useEffect(() => subscribeErrors(setErrors), []);

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
            <ImporterRow key={s.name} name={s.name} source={s.probe} />
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
            state={`${habits.length} habits · ${entries.length.toLocaleString()} entries · ${sessions.length.toLocaleString()} sessions`}
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

function ImporterRow({ name, source }: { name: string; source: ImporterSource }) {
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

/** The eight ruled checks. Only `entry-dedupe` has an implementation today. */
const CHECKS: { id: string; label: string; note: string }[] = [
  { id: "entry-dedupe", label: "Duplicate entries", note: "The same title stored twice." },
  { id: "unknown-vocab", label: "Unknown vocabulary", note: "A stored value no longer in its list." },
  { id: "unknown-icon", label: "Unknown icons", note: "An icon name absent from the pinned set." },
  { id: "orphan-session", label: "Orphaned sessions", note: "A session pointing at a missing entry." },
  { id: "orphan-image", label: "Orphaned images", note: "A cover file no entry references." },
  { id: "missing-cover", label: "Missing covers", note: "An entry whose cover file is gone." },
  { id: "impossible-range", label: "Impossible ranges", note: "A range session that ends before it starts." },
  { id: "empty-day", label: "Finalized empty days", note: "A day marked done with nothing in it." },
];

const HABIT_KEYS = ["gaming", "reading", "media", "writing", "gamedev"];

function DataTab() {
  const [report, setReport] = useState<Record<string, DuplicateReport>>({});
  const [busy, setBusy] = useState(false);
  const [ran, setRan] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const out: Record<string, DuplicateReport> = {};
      for (const k of HABIT_KEYS) out[k] = await findDuplicates(k);
      setReport(out);
      setRan(true);
    } catch (e) {
      console.error("health: duplicate scan failed", e);
    } finally {
      setBusy(false);
    }
  };

  const groups = Object.entries(report).flatMap(([habitKey, r]) =>
    r.groups.map((g) => ({ habitKey, g })),
  );

  return (
    <div className="hscroll">
      <div className="hgroup" style={{ marginTop: 0 }}>
        <p className="hglbl">
          Checks
          <span className="runline">{ran ? "run just now" : "not run yet"}</span>
        </p>
        <div className="hlist">
          {CHECKS.map((c) => {
            const live = c.id === "entry-dedupe";
            const found = live && ran ? groups.length : 0;
            return (
              <div className={`srow${live && ran && found > 0 ? " finding" : ""}`} key={c.id}>
                <span className={`pip ${!live ? "idle" : !ran ? "idle" : found > 0 ? "err" : "ok"}`}>
                  <Ico d={!live || !ran ? PIP_IDLE : found > 0 ? PIP_ERR : PIP_OK} />
                </span>
                <span className="sinfo">
                  <span className="slabel">{c.label}</span>
                  <span className="sstate">{live ? c.note : `${c.note} · not built yet`}</span>
                </span>
                <span className="sact">
                  {live && ran && (
                    <span className={`sword ${found > 0 ? "err" : "ok"}`}>
                      {found > 0 ? `${found} found` : "Clean"}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <button
          className="btn-plain"
          style={{ marginTop: "var(--space-6)" }}
          disabled={busy}
          onClick={() => void run()}
        >
          {busy ? "Running…" : "Run checks"}
        </button>
      </div>

      {groups.length > 0 && (
        <div className="hgroup">
          <p className="hglbl">Duplicate entries</p>
          <div className="mlist">
            {groups.map(({ habitKey, g }) => (
              <div className="mitem" key={`${habitKey}-${g.key}`}>
                <div className="mrow">
                  <span className="mid">
                    <span className="mname">{g.displayTitle}</span>
                    <span className="missing soft">
                      <span>
                        {habitKey} · {causeNote(g.cause)}
                      </span>
                    </span>
                  </span>
                  <span className="macts">
                    {g.safeToDelete.length > 0 ? (
                      <button
                        className="btn-danger btn-sm"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await deleteEntriesCascade(g.safeToDelete.map(String));
                            await run();
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Remove {g.safeToDelete.length} empty copy
                      </button>
                    ) : (
                      <span className="mgtag">every copy has history — keep</span>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="vnote foot">
            Only copies with no sessions can be removed. Entries carrying history are never
            touched — merging them is not something the app does.
          </p>
        </div>
      )}
    </div>
  );
}
