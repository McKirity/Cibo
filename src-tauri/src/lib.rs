// The app's first real custom commands (step 8, the Calibre importer) — the
// scaffold's `greet` demo was removed 2026-07-30; plugins carried all IPC
// until Calibre needed rusqlite, which no plugin provides.
//
// CALIBRE — read-only, always ([[Importer Runtime & External Access]] § the
// Calibre reader): `metadata.db` is a SECOND SQLite entirely separate from
// Evolu, opened SQLITE_OPEN_READ_ONLY; Calibre running concurrently
// (busy/locked) surfaces as a legible error string the probe can show, never
// a crash. The webview never touches the library folder — book covers cross
// the IPC boundary as bytes.

use serde::Serialize;
use std::path::{Component, Path};

#[derive(Serialize)]
pub struct CalibreBook {
    uuid: String,
    title: String,
    authors: Vec<String>,
    tags: Vec<String>,
    comments: Option<String>,
    series: Option<String>,
    series_index: Option<f64>,
    words: Option<f64>,
    has_cover: bool,
    /// Book folder, relative to the library root (Calibre's `books.path`).
    path: String,
}

fn list_query(
    conn: &rusqlite::Connection,
    sql: &str,
    book_id: i64,
) -> Result<Vec<String>, rusqlite::Error> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([book_id], |r| r.get::<_, String>(0))?;
    rows.collect()
}

/// Scan a Calibre library's `metadata.db` — the whole catalog in one call
/// (the "Scan library" preview and the search filter both read this list).
#[tauri::command]
fn calibre_scan(library_path: String) -> Result<Vec<CalibreBook>, String> {
    let db_path = Path::new(&library_path).join("metadata.db");
    if !db_path.is_file() {
        return Err(format!(
            "no metadata.db inside \"{library_path}\" — pick the Calibre library folder itself"
        ));
    }
    let conn = rusqlite::Connection::open_with_flags(
        &db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|e| format!("could not open metadata.db — {e}"))?;
    conn.busy_timeout(std::time::Duration::from_millis(2500))
        .map_err(|e| e.to_string())?;

    // The `#words` custom column lives in a per-column table; find it by label.
    let words_table: Option<String> = conn
        .query_row(
            "SELECT id FROM custom_columns WHERE label = 'words'",
            [],
            |r| r.get::<_, i64>(0),
        )
        .ok()
        .map(|id| format!("custom_column_{id}"));

    let mut stmt = conn
        .prepare("SELECT id, uuid, title, path, has_cover, series_index FROM books")
        .map_err(|e| format!("metadata.db query failed (is Calibre holding the database?) — {e}"))?;
    let base_rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, Option<f64>>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("metadata.db read failed — {e}"))?;

    let mut books = Vec::with_capacity(base_rows.len());
    for (id, uuid, title, path, has_cover, series_index) in base_rows {
        let Some(uuid) = uuid else { continue }; // uuid is the dedup key; no uuid, no import
        let authors = list_query(
            &conn,
            "SELECT a.name FROM authors a JOIN books_authors_link l ON a.id = l.author WHERE l.book = ?1 ORDER BY l.id",
            id,
        )
        .unwrap_or_default();
        let tags = list_query(
            &conn,
            "SELECT t.name FROM tags t JOIN books_tags_link l ON t.id = l.tag WHERE l.book = ?1 ORDER BY t.name",
            id,
        )
        .unwrap_or_default();
        let comments: Option<String> = conn
            .query_row("SELECT text FROM comments WHERE book = ?1", [id], |r| r.get(0))
            .ok();
        let series: Option<String> = conn
            .query_row(
                "SELECT s.name FROM series s JOIN books_series_link l ON s.id = l.series WHERE l.book = ?1",
                [id],
                |r| r.get(0),
            )
            .ok();
        let words: Option<f64> = words_table.as_ref().and_then(|t| {
            conn.query_row(
                // Table name is derived from custom_columns.id (an integer) —
                // not user input, safe to splice.
                &format!("SELECT value FROM {t} WHERE book = ?1"),
                [id],
                |r| r.get(0),
            )
            .ok()
        });
        books.push(CalibreBook {
            uuid,
            title,
            authors,
            tags,
            comments,
            series,
            series_index,
            words,
            has_cover: has_cover != 0,
            path,
        });
    }
    Ok(books)
}

/// Read one book's `cover.jpg` as raw bytes (the book folder is Calibre's
/// relative `books.path`). Traversal outside the library root is rejected.
#[tauri::command]
fn calibre_cover(library_path: String, book_path: String) -> Result<tauri::ipc::Response, String> {
    let rel = Path::new(&book_path);
    if rel.is_absolute()
        || rel
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::Prefix(_)))
    {
        return Err("invalid book path".into());
    }
    let p = Path::new(&library_path).join(rel).join("cover.jpg");
    std::fs::read(&p)
        .map(tauri::ipc::Response::new)
        .map_err(|e| format!("cover read failed — {e}"))
}

mod backup;

/// CREATE THE PER-DEVICE SETTINGS DIRECTORY (Phase 2 step 4, 2026-08-14).
///
/// `deviceStore.ts` writes `settings.json` and `timer-heartbeat.json` into the
/// app's local data dir — and NOTHING HAS EVER CREATED IT. On Windows it exists
/// by accident: the WebView2 runtime makes the same folder for `EBWebView`
/// before the app writes. On macOS the webview stores its data elsewhere, so the
/// folder never appeared and every write threw ENOENT into `warnOnce` — one
/// console line, then settings that hold for the session and vanish on quit.
///
/// ⚠ WHAT WAS ACTUALLY BROKEN ON THE MAC, all of it silent: the theme pick, UI
/// scale, reduce-effects, `cibo.cloudRoot` (so backups/images/themes had no
/// root), the sync relay override, and the timer heartbeat — whose ABSENCE is
/// the clean-quit invariant, so a file that can never be written reads as a
/// clean quit forever and crash recovery can never fire. Found 2026-08-14 when
/// a hand-written relay key failed with ENOENT on the DIRECTORY, which is the
/// only reason any of this surfaced: the app's own failure mode is a warning
/// nobody reads.
///
/// ⚠ AND IT WOULD HAVE CORRUPTED THE FIRST RESTORE. The restore door sets
/// `cibo.restorePending` and restarts immediately; that flag lives in this file,
/// so the next boot would not have seen it, would have seeded a store whose real
/// data was still in flight, and produced the exact doubling `sync-3` exists to
/// prevent — on the very first two-device join.
///
/// Rust, not the fs plugin: this runs before the webview loads, so the directory
/// is there before `initDeviceStore` reads. Failure only restores today's
/// behaviour (localStorage passthrough), so it is logged, never fatal.
fn ensure_app_data_dir(app: &tauri::AppHandle) {
    use tauri::Manager;
    match app.path().app_local_data_dir() {
        Ok(dir) => {
            if let Err(e) = std::fs::create_dir_all(&dir) {
                eprintln!("cibo: could not create app data dir {}: {e}", dir.display());
            }
        }
        Err(e) => eprintln!("cibo: no app local data dir: {e}"),
    }
}

/// FIT THE WINDOW TO THE SCREEN IT OPENS ON (Phase 2 step 4, 2026-08-14).
///
/// `tauri.conf.json` opens at a fixed 1600x1000, which is WIDER AND TALLER THAN
/// A 14" MacBook'S ENTIRE SCREEN (1512x982 logical, less the menu bar). Found on
/// the real hardware the day the Mac joined: every launch opened oversized, and
/// because compact-auto keys off a window width below 1600, the small canvas the
/// whole step was spent building never engaged until the window was maximised by
/// hand. A fixed opening size is a claim about a screen nobody measured.
///
/// So: shrink to the monitor's WORK AREA (the OS's own answer, already less the
/// macOS menu bar and Dock, the Windows taskbar). This only ever SHRINKS — a
/// desktop with room keeps the configured size, so nothing changes on the PC.
///
/// Rust rather than `local.ts`, which owns the app's other geometry: config
/// windows are created before the setup hook runs (verified in tauri 2.11.5's
/// `app.rs`), so this lands BEFORE the window is shown. The JS equivalent would
/// paint the oversized window first and snap it after.
///
/// ⚠ The minimums in `tauri.conf.json` had to come down with it — they were the
/// 1512x982 design floor, i.e. the Mac's whole screen, and a minimum the display
/// cannot satisfy silently clamps this back to oversized.
///
/// Failure is never a gate: every step degrades to the configured size, which is
/// exactly today's behaviour.
fn fit_window_to_screen(app: &tauri::AppHandle) {
    use tauri::{LogicalPosition, LogicalSize, Manager};

    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    let monitor = match win.current_monitor() {
        Ok(Some(m)) => m,
        // No monitor answer (headless, a display asleep mid-launch) - the
        // configured size is the honest fallback.
        _ => return,
    };
    let Ok(size) = win.inner_size() else {
        return;
    };

    // Work area is PHYSICAL; the window is configured and reasoned about in
    // LOGICAL px, and on a HiDPI panel those differ by the scale factor. Mixing
    // them would ask for a 3024-wide window on the Mac.
    let scale = monitor.scale_factor();
    let work = monitor.work_area();
    let area = work.size.to_logical::<f64>(scale);
    let origin = work.position.to_logical::<f64>(scale);
    let current = size.to_logical::<f64>(scale);

    let width = current.width.min(area.width);
    let height = current.height.min(area.height);
    if width >= current.width && height >= current.height {
        return; // It already fits. Leave the user's screen alone.
    }

    let _ = win.set_size(LogicalSize::new(width, height));
    // PLACED BY HAND, not by `center()` (2026-08-14, found on the Mac the day
    // this shipped): center() computes from the size the window HAS, and the
    // resize above has not necessarily landed when it runs — so it centred a
    // 1600-wide box on a 1512 screen and parked the window 44px off the LEFT
    // edge. Doing the arithmetic ourselves cannot race, and centring on the
    // WORK AREA rather than the monitor also respects an origin that sits below
    // a menu bar.
    let _ = win.set_position(LogicalPosition::new(
        origin.x + (area.width - width).max(0.0) / 2.0,
        origin.y + (area.height - height).max(0.0) / 2.0,
    ));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single instance MUST register first (its docs' own rule): a second
        // launch never starts a second process — two writers on one store is
        // never allowed ([[App Lifecycle & OS Integration]]). The second
        // launch's argv lands here in the FIRST process; we just surface the
        // existing window.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            use tauri::Manager;
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        // Auto-update (Phase 2 step 5): the plugin only registers here — the
        // launch check + install-on-quit orchestration is JS-side
        // (src/shell/updater.ts), matching the backup layer's split.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_persisted_scope::init())
        // Restore swap (step 12): setup runs BEFORE the config window is
        // created, which is the only moment the OPFS store is closed — a
        // pending restore marker is applied here or never.
        .setup(|app| {
            // FIRST: the settings dir must exist before the webview reads it.
            ensure_app_data_dir(app.handle());
            // Windows-gated: the PC is the sole backup point (user-ruled
            // 2026-08-16, the cradle-kill refinement) — on macOS no backup
            // code runs at all, restore-marker check included. A marker can
            // never be set there (the JS doors are absent), so this skips a
            // check that could only ever answer "no".
            if cfg!(windows) {
                backup::apply_pending_restore(app.handle());
            }
            fit_window_to_screen(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            calibre_scan,
            calibre_cover,
            backup::bk_store_path,
            backup::bk_mkdirs,
            backup::bk_list,
            backup::bk_remove,
            backup::bk_promote,
            backup::bk_write_db,
            backup::bk_compress_file,
            backup::bk_bundle_texts,
            backup::bk_tar_dir,
            backup::bk_verify_archive,
            backup::bk_db_integrity,
            backup::bk_reveal,
            backup::bk_reveal_item,
            backup::bk_request_restore,
            backup::bk_take_restore_result
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
