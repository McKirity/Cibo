// The scaffold's `greet` demo command was removed 2026-07-30 (never invoked
// from the webview — the app has no custom commands yet; plugins carry all IPC).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
