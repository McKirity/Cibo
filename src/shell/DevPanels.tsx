/** Dev tooling on the Log view (temporary — first-run setup replaces it). Split out of Shell.tsx 2026-07-30 (dedup pass wave 4). */
import { useEffect, useState } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { clearRichSeed, seedRich } from "../db/seedRich";
import { backfillGamingCovers } from "../importers/coverBackfill";
import { causeNote, findDuplicates, type DuplicateReport } from "../db/duplicates";
import { deleteEntriesCascade } from "../library/entryDelete";
import { LogForm } from "../log/LogForm";
import { activeHabitsQuery } from "./Shell";
import {
  getPick,
  getThemesRoot,
  scanThemes,
  setTheme,
  setThemesRoot,
  type ThemeEntry,
  type ThemeScan,
} from "../theme/loader";
import { compactApplied, getCompactMode, setCompactMode, type CompactMode } from "../theme/compact";
import { decorationSummary } from "../theme/decoration";
import { getImporterKey, setImporterKey, type ImporterKeyName } from "../importers/keys";
import { getCalibrePath, setCalibrePath } from "../importers/calibre";

// ── Dev tooling on the Log view (temporary — first-run setup replaces it) ──────

export function LogView() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  useEffect(() => {
    evolu.appOwner.then((owner) => setOwnerId(owner.id));
  }, []);
  return (
    <div style={{ maxWidth: 900 }}>
      <div className="perf-line">{ownerId ? `Evolu ready — owner ${ownerId}` : "Evolu starting…"}</div>
      <LogForm />
      {/* Dev-only tooling — `import.meta.env.DEV` is statically false in a
          production build, so these panels compile out. Whether seedRich
          itself is then tree-shaken out of the bundle has NOT been verified
          — don't rely on it being absent. */}
      {import.meta.env.DEV && (
        <>
          <DevReduceEffectsToggle />
          <DevCompactToggle />
          <DevThemePanel />
          <DevHabitPanel />
          <DevRichSeedPanel />
          <DevCoverBackfillPanel />
          <DevDuplicatePanel />
          <DevImporterConfigPanel />
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
export const REDUCE_KEY = "cibo.dev.reduceEffects";
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

/** Dev host for compact's tri-state (step 6a) — the real control is
 *  Settings → Appearance (step 10); auto keys off window width live. */
function DevCompactToggle() {
  const [mode, setMode] = useState<CompactMode>(getCompactMode());
  const cycle = () => {
    const next: CompactMode = mode === "auto" ? "on" : mode === "on" ? "off" : "auto";
    setCompactMode(next);
    setMode(next);
  };
  return (
    <div style={{ marginTop: 8 }}>
      <button className="btn-plain" onClick={cycle}>
        Compact: {mode}
        {mode === "auto" ? ` (resolved ${compactApplied() ? "on" : "off"})` : ""}
      </button>
    </div>
  );
}

/**
 * Dev host for the per-device theme pick (step 6a) — the real control is
 * Settings → Appearance (step 10). The loader itself is real machinery
 * (src/theme/loader.ts); only this picker surface is the stand-in, like the
 * reduce-effects toggle above. The drop-in root chooser stands in for
 * step 10's Settings → Storage cloud-root picker.
 */
function DevThemePanel() {
  const [scan, setScan] = useState<ThemeScan | null>(null);
  const [pick, setPick] = useState(getPick());
  const [root, setRoot] = useState(getThemesRoot());
  const refresh = () => {
    scanThemes().then(setScan, (e) => console.error("Dev: theme scan failed", e));
  };
  useEffect(refresh, []);
  const choose = async (t: ThemeEntry) => {
    try {
      await setTheme(t);
      setPick(t.name);
    } catch (e) {
      console.error("Dev: theme apply failed", e);
    }
  };
  const chooseRoot = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      // recursive: true — the scope grant must cover the theme SUBFOLDERS
      // (without it the scan can list the root but not read inside a theme,
      // which silently skips every folder — found at the 6a decoration test).
      const dir = await open({ directory: true, recursive: true, title: "Pick the drop-in themes folder" });
      if (typeof dir === "string") {
        setThemesRoot(dir);
        setRoot(dir);
        refresh();
      }
    } catch (e) {
      console.error("Dev: folder pick failed", e);
    }
  };
  const clearRoot = () => {
    setThemesRoot(null);
    setRoot(null);
    refresh();
  };
  // Decoration readout — re-render when a manifest (re)applies.
  const [, bumpDeco] = useState(0);
  useEffect(() => {
    const h = () => bumpDeco((n) => n + 1);
    window.addEventListener("cibo:decoration-applied", h);
    return () => window.removeEventListener("cibo:decoration-applied", h);
  }, []);
  const deco = decorationSummary();
  return (
    <details className="dev-panel">
      <summary>
        Dev: theme pick ({pick}) — picker is temporary, the loader is real (step 6a)
      </summary>
      {!scan ? (
        <div className="fieldnote">scanning…</div>
      ) : (
        <>
          <table className="day-table">
            <tbody>
              {scan.themes.map((t) => (
                <tr key={t.name}>
                  <td>{t.name}</td>
                  <td>{t.source}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-plain btn-sm"
                      disabled={t.name === pick}
                      onClick={() => choose(t)}
                    >
                      {t.name === pick ? "Current" : "Apply"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {scan.shadowed.length > 0 && (
            <div className="fieldnote">Shadowed by bundled names (dropped): {scan.shadowed.join(", ")}</div>
          )}
          {scan.skipped.length > 0 && (
            <div className="fieldnote">Skipped (no theme.css): {scan.skipped.join(", ")}</div>
          )}
        </>
      )}
      <div className="fieldnote" style={{ marginTop: 8 }}>
        Decoration manifest: {deco.state}
        {deco.active.length > 0 && ` · assets: ${deco.active.join(", ")}`}
        {deco.off.length > 0 && ` · off: ${deco.off.join(", ")}`}
        {Object.keys(deco.tints).length > 0 &&
          ` · tints: ${Object.entries(deco.tints)
            .map(([k, v]) => `${k}→${v}`)
            .join(", ")}`}
        {deco.warnings.length > 0 && ` · ⚠ ${deco.warnings.join(" · ")}`}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn-plain btn-sm" onClick={chooseRoot}>
          Set drop-in themes folder…
        </button>
        {root && (
          <>
            <span className="fieldnote">{root}</span>
            <button type="button" className="btn-plain btn-sm" onClick={clearRoot}>
              Clear
            </button>
          </>
        )}
      </div>
    </details>
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

/**
 * Step 8 throwaway: pull real Steam covers onto the SEEDED Gaming entries so the
 * library's cover face can be judged without importing and finalizing days
 * (user-asked 2026-07-31). Exact-title matches only — anything ambiguous is
 * skipped and named, never guessed. See importers/coverBackfill.ts.
 */
function DevCoverBackfillPanel() {
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  return (
    <details className="dev-panel">
      <summary>Dev: Steam cover backfill (step 8) — real covers onto seeded Gaming entries</summary>
      <div className="row">
        <button
          type="button"
          className="btn-accent btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setStatus("matching against the Steam catalog…");
            try {
              const r = await backfillGamingCovers((done, total, title) =>
                setStatus(`${done}/${total} — ${title}`),
              );
              const bits = [
                `${r.filled} covers written`,
                `${r.identityRepaired} seed ids repaired`,
                `${r.skippedHasCover} already done`,
                `${r.noMatch.length} no exact match`,
                `${r.failed.length} failed`,
              ];
              setStatus(
                bits.join(" · ") +
                  (r.noMatch.length > 0 ? ` — unmatched: ${r.noMatch.join(", ")}` : ""),
              );
            } catch (e) {
              setStatus(`error: ${String(e)}`);
              console.error(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          Backfill Gaming covers
        </button>
        {status && <span className="fieldnote">{status}</span>}
      </div>
    </details>
  );
}

/**
 * Duplicate-entry detection (user-asked 2026-07-31, after an import produced a
 * second "Dark Souls III"). Detection + MANUAL repair only — entry merge is a
 * dropped feature, so nothing here combines rows. Step 13's Data Doctor check,
 * surfaced early through a dev door; the logic is src/db/duplicates.ts.
 */
function DevDuplicatePanel() {
  const [report, setReport] = useState<DuplicateReport | null>(null);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [habitKey, setHabitKey] = useState("gaming");

  const scan = async () => {
    setBusy(true);
    setStatus("scanning…");
    try {
      const r = await findDuplicates(habitKey);
      setReport(r);
      setStatus(
        r.groups.length === 0
          ? `No duplicates among ${r.scanned} entries.`
          : `${r.groups.length} duplicate title${r.groups.length === 1 ? "" : "s"} in ${r.scanned} entries.`,
      );
    } catch (e) {
      setStatus(`error: ${String(e)}`);
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="dev-panel">
      <summary>Dev: duplicate entries (step 13 preview) — detect + manual repair</summary>
      <div className="row">
        {["gaming", "reading", "media", "writing", "gamedev"].map((k) => (
          <button
            key={k}
            type="button"
            className={k === habitKey ? "btn-accent btn-sm" : "btn-plain btn-sm"}
            onClick={() => {
              setHabitKey(k);
              setReport(null);
              setStatus("");
            }}
          >
            {k}
          </button>
        ))}
        <button type="button" className="btn-plain btn-sm" disabled={busy} onClick={() => void scan()}>
          Scan
        </button>
        {status && <span className="fieldnote">{status}</span>}
      </div>
      {report?.groups.map((g) => (
        <div className="row" key={g.key} style={{ display: "block" }}>
          <div className="fieldnote">
            <b>{g.displayTitle}</b> — {causeNote(g.cause)}
          </div>
          {g.rows.map((r) => (
            <div className="fieldnote" key={String(r.id)}>
              · {r.source ?? "manual"}
              {r.externalId != null ? ` ${r.externalId}` : ""} · {r.sessions} sessions ·{" "}
              {r.hasCover ? "cover" : "no cover"}
              {r.sessions === 0 ? " · safe to remove" : " · HAS HISTORY — keep"}
            </div>
          ))}
          {g.safeToDelete.length > 0 && (
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const n = g.safeToDelete.length;
                  const res = await deleteEntriesCascade(g.safeToDelete.map(String));
                  setStatus(
                    res.ok
                      ? `Removed ${n} empty duplicate(s) of "${g.displayTitle}".`
                      : `Delete failed for "${g.displayTitle}" — nothing was removed.`,
                  );
                  await scan();
                } catch (e) {
                  setStatus(`error: ${String(e)}`);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove {g.safeToDelete.length} empty copy
            </button>
          )}
        </div>
      ))}
    </details>
  );
}

/**
 * Step 8 stand-in: the importer config rows whose real home is Settings →
 * Importers (step 10) — the TMDB + YouTube API keys (synced plain in
 * `app_meta`, [[Sync & Per-Device Settings]]) and the Calibre library path
 * (per-device → localStorage, the established stand-in doctrine). NOTE: the
 * old vault's data.json carried both keys EMPTY (checked 2026-08-01), so
 * they arrive by hand here.
 */
function DevImporterKeyRow({ name, label }: { name: ImporterKeyName; label: string }) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    void getImporterKey(name).then((k) => {
      setSaved(k);
      setValue(k ?? "");
    });
  }, [name]);
  const save = async () => {
    const ok = await setImporterKey(name, value);
    if (ok) {
      const v = value.trim();
      setSaved(v === "" ? null : v);
      setStatus(v === "" ? "cleared" : "saved");
    } else setStatus("write rejected — see console");
  };
  return (
    <div className="row">
      <span className="fieldnote" style={{ minWidth: 110 }}>
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setStatus("");
        }}
        placeholder="paste API key…"
        spellCheck={false}
        style={{ width: 340 }}
      />
      <button type="button" className="btn-plain btn-sm" onClick={() => void save()}>
        Save
      </button>
      <span className="fieldnote">
        {status !== "" ? status : saved != null ? "key set" : "not set"}
      </span>
    </div>
  );
}

function DevImporterConfigPanel() {
  const [calibre, setCalibre] = useState<string | null>(getCalibrePath());
  const pickCalibre = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({
        directory: true,
        title: "Pick the Calibre library folder (the one holding metadata.db)",
      });
      if (typeof dir === "string") {
        setCalibrePath(dir);
        setCalibre(dir);
      }
    } catch (e) {
      console.error("Dev: Calibre folder pick failed", e);
    }
  };
  return (
    <details className="dev-panel">
      <summary>
        Dev: importer config (step 8) — keys + Calibre path, real home is Settings → Importers
      </summary>
      <DevImporterKeyRow name="tmdb" label="TMDB key" />
      <DevImporterKeyRow name="youtube" label="YouTube key" />
      <div className="row" style={{ marginTop: 8 }}>
        <span className="fieldnote" style={{ minWidth: 110 }}>
          Calibre library
        </span>
        <button type="button" className="btn-plain btn-sm" onClick={() => void pickCalibre()}>
          Pick folder…
        </button>
        {calibre != null ? (
          <>
            <span className="fieldnote">{calibre}</span>
            <button
              type="button"
              className="btn-plain btn-sm"
              onClick={() => {
                setCalibrePath(null);
                setCalibre(null);
              }}
            >
              Clear
            </button>
          </>
        ) : (
          <span className="fieldnote">not set</span>
        )}
      </div>
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
