/**
 * SETTINGS → IMPORTERS (Build step 10, slice 4) — the real home of the two
 * API keys and the Calibre path, which step 8 stood in for with a dev panel.
 *
 * The ruled split, and it is why the two rows look different:
 * **keys are SYNCED** (stored plain in `app_meta` — the app's only two, TMDB
 * and YouTube) while the **Calibre path is PER-DEVICE** (a filesystem
 * location, meaningless on the other machine) and so wears the this-device
 * mark. Steam, AniList and AO3 are keyless and say so rather than being
 * omitted — the frozen face lists every importer "for tracking".
 *
 * A key renders MASKED once saved, never echoed back in full: it is a secret
 * sitting in a settings pane on a shared screen. Edit replaces it outright,
 * which is also the only write path the storage has.
 */
import { useEffect, useState } from "react";
import { getImporterKey, setImporterKey, type ImporterKeyName } from "../importers/keys";
import { getCalibrePath, setCalibrePath } from "../importers/calibre";
import { DevMark } from "./SettingsScreen";


/** Last four only — enough to tell two keys apart, never enough to use. */
const mask = (key: string): string => `${"•".repeat(10)}${key.slice(-4)}`;

export function ImportersPane() {
  return (
    <div className="hscroll">
      <div className="hgroup" style={{ marginTop: 0 }}>
        <p className="hglbl">API Keys</p>
        <div className="ctrlstack">
          <div className="crow two">
            <span className="clabel">Steam</span>
            <span className="cright">
              <span className="mgtag">Keyless · no setup</span>
            </span>
          </div>
          <KeyRow name="tmdb" label="TMDB" />
          <KeyRow name="youtube" label="YouTube" />
          <div className="crow two">
            <span className="clabel">AniList</span>
            <span className="cright">
              <span className="mgtag">Keyless · no setup</span>
            </span>
          </div>
          <div className="crow two">
            <span className="clabel">AO3</span>
            <span className="cright">
              <span className="mgtag">Keyless · no setup</span>
            </span>
          </div>
        </div>
      </div>

      <div className="hgroup">
        <p className="hglbl">Calibre</p>
        <div className="ctrlstack">
          <CalibreRow />
        </div>
      </div>
    </div>
  );
}

function KeyRow({ name, label }: { name: ImporterKeyName; label: string }) {
  const [saved, setSaved] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    void getImporterKey(name).then(setSaved);
  }, [name]);

  const save = async () => {
    const ok = await setImporterKey(name, value);
    if (!ok) {
      setStatus("could not save");
      return;
    }
    const v = value.trim();
    setSaved(v === "" ? null : v);
    setValue("");
    setEditing(false);
    setStatus("");
  };

  return (
    <div className="crow two">
      <span className="clabel">{label}</span>
      <span className="cright">
        {editing ? (
          <>
            <input
              className="keyin"
              value={value}
              placeholder="Paste the key…"
              spellCheck={false}
              autoFocus
              onChange={(e) => {
                setValue(e.target.value);
                setStatus("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") {
                  setEditing(false);
                  setValue("");
                }
              }}
            />
            <button className="btn-plain btn-sm" onClick={() => void save()}>
              Save
            </button>
            <button
              className="btn-plain btn-sm"
              onClick={() => {
                setEditing(false);
                setValue("");
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className={`field${saved == null ? " none" : ""}`}>
              {saved != null ? mask(saved) : "Not set"}
            </span>
            <button className="btn-plain btn-sm" onClick={() => setEditing(true)}>
              {saved != null ? "Replace" : "Add"}
            </button>
          </>
        )}
        {status !== "" && <span className="mgtag err">{status}</span>}
      </span>
    </div>
  );
}

function CalibreRow() {
  const [path, setPath] = useState<string | null>(getCalibrePath());
  const pick = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({
        directory: true,
        title: "Pick the Calibre library folder (the one holding metadata.db)",
      });
      if (typeof dir === "string") {
        setCalibrePath(dir);
        setPath(dir);
      }
    } catch (e) {
      console.error("settings: Calibre folder pick failed", e);
    }
  };
  return (
    <div className="crow">
      <span className="clabel">Library path</span>
      <DevMark />
      <span className="cright">
        <span className={`field${path == null ? " none" : ""}`}>{path ?? "Not set"}</span>
        <button className="btn-plain btn-sm" onClick={() => void pick()}>
          Browse…
        </button>
        {path != null && (
          <button
            className="btn-plain btn-sm"
            onClick={() => {
              setCalibrePath(null);
              setPath(null);
            }}
          >
            Clear
          </button>
        )}
      </span>
    </div>
  );
}
