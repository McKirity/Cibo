// BACKUPS (Build step 12) — the Rust primitives under src/backup/'s TS
// orchestrator. The division follows the app's law: ALL logic (slot naming,
// retention, verify ordering, the record) lives in TypeScript; these commands
// are dumb file machinery — compress, tar, list, rename, verify — plus the
// two things only the shell can do: read the OPFS store directory and swap it
// while the webview is closed (the restore-at-launch hook in lib.rs).
//
// The store is Evolu's OPFS SAHPool DIRECTORY, not a SQLite file
// ([[Spike Findings]]): backup copies the directory, restore swaps it. The
// swap can only happen before the webview opens the pool, so restore is a
// marker file + relaunch — `apply_pending_restore` runs in setup(), before
// any window exists.
//
// Compression is zstd everywhere (the 2026-07-21 sizing amendment); a
// directory rides as .tar.zst, single files as .zst. Verify has its own
// command because the ruled ordering is verify-uncompressed → compress →
// RE-OPEN THE ARCHIVE — "verified" must describe a file someone proved
// readable.

use serde::Deserialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::Manager;

const ZSTD_LEVEL: i32 = 3; // speed matters — this runs inside the close sequence

// ── paths ────────────────────────────────────────────────────────────────────

/// Evolu's OPFS SAHPool directory. Windows/WebView2 layout; the MacBook path
/// lands with Phase 2's fidelity pass, and until then this is a legible error
/// rather than a wrong guess.
fn store_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if !cfg!(windows) {
        return Err("the store path is Windows-only until Phase 2's MacBook pass".into());
    }
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?;
    Ok(base.join("EBWebView").join("Default").join("File System"))
}

fn marker_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("restore-pending.json"))
}

fn result_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("restore-result.json"))
}

/// The raw-.db staging file (exportDatabase()'s bytes land here before
/// integrity-check + compression). Fixed path so the raw-body IPC write needs
/// no argument channel.
fn db_tmp_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("backup-tmp");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("export.db"))
}

#[tauri::command]
pub fn bk_store_path(app: tauri::AppHandle) -> Result<String, String> {
    let p = store_root(&app)?;
    if p.is_dir() {
        Ok(p.to_string_lossy().into_owned())
    } else {
        Err(format!("store directory not found at {}", p.display()))
    }
}

// ── plain file machinery ─────────────────────────────────────────────────────

#[tauri::command]
pub fn bk_mkdirs(dir: String) -> Result<(), String> {
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir {dir} failed — {e}"))
}

#[tauri::command]
pub fn bk_list(dir: String) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    let rd = match fs::read_dir(&dir) {
        Ok(rd) => rd,
        Err(_) => return Ok(out), // an absent root lists empty — the pane says "paused"
    };
    for e in rd.flatten() {
        if e.path().is_file() {
            out.push(e.file_name().to_string_lossy().into_owned());
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn bk_remove(path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(|e| format!("remove {path} failed — {e}"))
}

/// Rename, replacing any existing destination (Windows rename refuses an
/// occupied dest; same-day re-backups overwrite their slot by ruling).
#[tauri::command]
pub fn bk_promote(from: String, to: String) -> Result<(), String> {
    if Path::new(&to).exists() {
        fs::remove_file(&to).map_err(|e| format!("clear {to} failed — {e}"))?;
    }
    fs::rename(&from, &to).map_err(|e| format!("rename {from} → {to} failed — {e}"))
}

/// exportDatabase()'s bytes arrive as the raw IPC body and land in the fixed
/// staging file; returns that path.
#[tauri::command]
pub fn bk_write_db(app: tauri::AppHandle, request: tauri::ipc::Request) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected a raw byte body".into());
    };
    let p = db_tmp_path(&app)?;
    fs::write(&p, bytes).map_err(|e| format!("staging write failed — {e}"))?;
    Ok(p.to_string_lossy().into_owned())
}

// ── compression + verify ─────────────────────────────────────────────────────

#[tauri::command]
pub fn bk_compress_file(src: String, dest: String) -> Result<u64, String> {
    let input = fs::File::open(&src).map_err(|e| format!("open {src} failed — {e}"))?;
    let output = fs::File::create(&dest).map_err(|e| format!("create {dest} failed — {e}"))?;
    zstd::stream::copy_encode(input, &output, ZSTD_LEVEL).map_err(|e| format!("zstd failed — {e}"))?;
    output.sync_all().map_err(|e| e.to_string())?;
    fs::metadata(&dest).map(|m| m.len()).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct BundleFile {
    name: String,
    content: String,
}

/// The plain-readable export — ONE artifact, both formats: the canonical JSON
/// + the two CSVs, tar'd together and zstd'd.
#[tauri::command]
pub fn bk_bundle_texts(dest: String, files: Vec<BundleFile>) -> Result<u64, String> {
    let output = fs::File::create(&dest).map_err(|e| format!("create {dest} failed — {e}"))?;
    let enc = zstd::stream::Encoder::new(&output, ZSTD_LEVEL).map_err(|e| e.to_string())?;
    let mut tarb = tar::Builder::new(enc.auto_finish());
    for f in &files {
        let bytes = f.content.as_bytes();
        let mut h = tar::Header::new_gnu();
        h.set_size(bytes.len() as u64);
        h.set_mode(0o644);
        h.set_cksum();
        tarb.append_data(&mut h, &f.name, bytes)
            .map_err(|e| format!("tar {} failed — {e}", f.name))?;
    }
    tarb.finish().map_err(|e| e.to_string())?;
    drop(tarb);
    output.sync_all().map_err(|e| e.to_string())?;
    fs::metadata(&dest).map(|m| m.len()).map_err(|e| e.to_string())
}

/// Read a pool file, riding out SQLite's transient byte-range locks. The
/// store is copied from the RUNNING app (the close sequence backs up before
/// the window dies), so a read can land mid-write: Windows answers with
/// ERROR_LOCK_VIOLATION (33) — or ERROR_SHARING_VIOLATION (32) — for exactly
/// the milliseconds the write holds the range. Found live 2026-08-03 (the
/// step note's watch item): one failed close-write, os error 33. A short
/// backoff outlasts any single write burst; a file still locked after ~2 s is
/// a real failure and errors the verify rather than shipping a torn archive.
fn read_with_retry(p: &Path) -> Result<Vec<u8>, String> {
    let mut wait = 150u64;
    for attempt in 0..5 {
        match fs::read(p) {
            Ok(v) => return Ok(v),
            Err(e) => {
                let lockish = matches!(e.raw_os_error(), Some(32) | Some(33));
                if !lockish || attempt == 4 {
                    return Err(format!("{} — {e}", p.display()));
                }
                std::thread::sleep(std::time::Duration::from_millis(wait));
                wait *= 2; // 150 · 300 · 600 · 1200 ms
            }
        }
    }
    unreachable!()
}

fn tar_dir_into<W: Write>(
    tarb: &mut tar::Builder<W>,
    base: &Path,
    dir: &Path,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| format!("read {} failed — {e}", dir.display()))? {
        let p = entry.map_err(|e| e.to_string())?.path();
        if p.is_dir() {
            tar_dir_into(tarb, base, &p)?;
        } else {
            // The LevelDB exclusivity lock (`…/Paths/LOCK`), skipped by name.
            //
            // This is NOT the transient byte-range lock read_with_retry rides
            // out: Chromium takes it when the profile opens and holds it for
            // the LIFETIME OF THE PROCESS, and the store copy runs from the
            // running app by design. So the retry ladder could never win it —
            // it just spent ~2.25 s losing before failing the whole backup
            // (reported live 2026-08-07, os error 33).
            //
            // Safe to omit: LOCK carries no data. It is a zero-length marker
            // LevelDB recreates on open, so a restored store makes its own.
            // Everything that DOES carry data here — CURRENT, MANIFEST-*,
            // *.ldb, *.log — still rides the retry path below.
            if p.file_name().is_some_and(|n| n == "LOCK") {
                continue;
            }
            let rel = Path::new("File System").join(
                p.strip_prefix(base).map_err(|e| e.to_string())?,
            );
            let bytes = read_with_retry(&p)?;
            let mut h = tar::Header::new_gnu();
            h.set_size(bytes.len() as u64);
            h.set_mode(0o644);
            h.set_cksum();
            tarb.append_data(&mut h, &rel, &bytes[..])
                .map_err(|e| format!("tar {} failed — {e}", rel.display()))?;
        }
    }
    Ok(())
}

/// The store-directory copy — the whole SAHPool directory as one .tar.zst,
/// entries rooted at "File System/" so the restore swap unpacks in place.
/// Walked file-by-file (not `append_dir_all`) so each read gets the lock
/// retry above; empty directories are not preserved — tar unpack recreates
/// parents from file paths, and the pool has no meaningful empty dirs.
#[tauri::command]
pub fn bk_tar_dir(src_dir: String, dest: String) -> Result<u64, String> {
    let output = fs::File::create(&dest).map_err(|e| format!("create {dest} failed — {e}"))?;
    let enc = zstd::stream::Encoder::new(&output, ZSTD_LEVEL).map_err(|e| e.to_string())?;
    let mut tarb = tar::Builder::new(enc.auto_finish());
    let base = Path::new(&src_dir);
    tar_dir_into(&mut tarb, base, base).map_err(|e| format!("store copy failed — {e}"))?;
    tarb.finish().map_err(|e| e.to_string())?;
    drop(tarb);
    output.sync_all().map_err(|e| e.to_string())?;
    fs::metadata(&dest).map(|m| m.len()).map_err(|e| e.to_string())
}

/// The re-open check: decompress the whole stream and count bytes. Corruption
/// anywhere in the archive errors; a zero count for a non-empty source would
/// be caught TS-side.
#[tauri::command]
pub fn bk_verify_archive(path: String) -> Result<u64, String> {
    struct Counter(u64);
    impl Write for Counter {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            self.0 += buf.len() as u64;
            Ok(buf.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let input = fs::File::open(&path).map_err(|e| format!("open {path} failed — {e}"))?;
    let mut sink = Counter(0);
    zstd::stream::copy_decode(input, &mut sink).map_err(|e| format!("archive unreadable — {e}"))?;
    Ok(sink.0)
}

/// PRAGMA integrity_check against the staged .db — the verify-uncompressed
/// half of the pinned ordering.
#[tauri::command]
pub fn bk_db_integrity(path: String) -> Result<(), String> {
    let conn = rusqlite::Connection::open_with_flags(
        &path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|e| format!("could not open export — {e}"))?;
    let verdict: String = conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|e| format!("integrity check failed — {e}"))?;
    if verdict == "ok" {
        Ok(())
    } else {
        Err(format!("integrity check: {verdict}"))
    }
}

/// Opens the backups folder ITSELF in the file manager. `reveal_item_in_dir`
/// is the wrong call here — it opens the PARENT with the folder merely
/// selected (found live 2026-08-03: a Desktop test folder "opened to Desktop").
#[tauri::command]
pub fn bk_reveal(path: String) -> Result<(), String> {
    tauri_plugin_opener::open_path(path, None::<&str>).map_err(|e| e.to_string())
}

// ── restore — marker + relaunch, swap at next launch ─────────────────────────

#[tauri::command]
pub fn bk_request_restore(app: tauri::AppHandle, archive: String) -> Result<(), String> {
    if !Path::new(&archive).is_file() {
        return Err("that backup's store copy is missing".into());
    }
    let marker = marker_path(&app)?;
    fs::write(&marker, serde_json::json!({ "archive": archive }).to_string())
        .map_err(|e| format!("could not arm the restore — {e}"))?;
    // Production: the ruled restart — the swap applies in the new process's
    // setup(). DEV: restart() is a trap — when this process exits, the `tauri
    // dev` CLI tears down and kills Vite, so the relaunched instance has no
    // frontend and dies looking like a crash (found live 2026-08-03, first
    // rehearsal). A clean exit instead; the next `tauri dev` applies the swap.
    #[cfg(debug_assertions)]
    app.exit(0);
    #[cfg(not(debug_assertions))]
    app.restart();
    #[allow(unreachable_code)]
    Ok(())
}

/// The launch's one-shot outcome read (the toast's source). Consumes the file.
#[tauri::command]
pub fn bk_take_restore_result(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let p = result_path(&app)?;
    match fs::read_to_string(&p) {
        Ok(s) => {
            let _ = fs::remove_file(&p);
            Ok(Some(s))
        }
        Err(_) => Ok(None),
    }
}

/// Runs in setup(), BEFORE any window exists — the only moment the store is
/// closed. Safety-copy first (an instant same-volume rename, so a restore is
/// itself undoable), then unpack the chosen archive into place. Never panics:
/// a failed restore leaves the safety copy as the live store again and
/// records the error for the toast.
pub fn apply_pending_restore(app: &tauri::AppHandle) {
    let Ok(marker) = marker_path(app) else { return };
    let Ok(raw) = fs::read_to_string(&marker) else { return };
    let _ = fs::remove_file(&marker); // one-shot, even on failure
    let archive = serde_json::from_str::<serde_json::Value>(&raw)
        .ok()
        .and_then(|v| v.get("archive").and_then(|a| a.as_str()).map(String::from));
    let Some(archive) = archive else { return };

    let outcome = (|| -> Result<String, String> {
        let store = store_root(app)?;
        let parent = store
            .parent()
            .ok_or_else(|| "store has no parent directory".to_string())?
            .to_path_buf();
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let safety = parent.join(format!("File System.safety-{stamp}"));

        // safety-copy the live store aside (may be absent on a fresh install)
        if store.is_dir() {
            fs::rename(&store, &safety).map_err(|e| format!("safety copy failed — {e}"))?;
        }

        // unpack — entries are rooted "File System/", so the parent is the target
        let unpack = (|| -> Result<(), String> {
            let input =
                fs::File::open(&archive).map_err(|e| format!("open archive failed — {e}"))?;
            let dec = zstd::stream::Decoder::new(input).map_err(|e| e.to_string())?;
            let mut ar = tar::Archive::new(dec);
            ar.unpack(&parent).map_err(|e| format!("unpack failed — {e}"))
        })();

        if let Err(e) = unpack {
            // roll back: the safety copy becomes the live store again
            let _ = fs::remove_dir_all(&store);
            if safety.is_dir() {
                let _ = fs::rename(&safety, &store);
            }
            return Err(e);
        }

        // keep only the newest safety copy — older ones are disk, not safety
        if let Ok(rd) = fs::read_dir(&parent) {
            let mut copies: Vec<PathBuf> = rd
                .flatten()
                .map(|e| e.path())
                .filter(|p| {
                    p.is_dir()
                        && p.file_name()
                            .map(|n| n.to_string_lossy().starts_with("File System.safety-"))
                            .unwrap_or(false)
                })
                .collect();
            copies.sort();
            for old in copies.iter().rev().skip(1) {
                let _ = fs::remove_dir_all(old);
            }
        }

        Ok(safety.to_string_lossy().into_owned())
    })();

    let (ok, detail) = match &outcome {
        Ok(safety) => (true, safety.clone()),
        Err(e) => (false, e.clone()),
    };
    if let Ok(rp) = result_path(app) {
        let _ = fs::write(
            &rp,
            serde_json::json!({ "ok": ok, "detail": detail }).to_string(),
        );
    }
}

// `_read_probe` was DELETED 2026-08-04 (the third audit). Its comment claimed
// it was "kept to silence the unused-import lint" — the reverse was true: it
// was the ONLY consumer of `Read`, so it created the import it claimed to
// justify. The import narrowed to `Write` with it (`Counter` + `tar_dir_into`).
