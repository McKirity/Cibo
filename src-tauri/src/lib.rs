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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_persisted_scope::init())
        // Restore swap (step 12): setup runs BEFORE the config window is
        // created, which is the only moment the OPFS store is closed — a
        // pending restore marker is applied here or never.
        .setup(|app| {
            backup::apply_pending_restore(app.handle());
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
            backup::bk_request_restore,
            backup::bk_take_restore_result
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
