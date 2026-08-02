/**
 * Cover download + storage — the folder-first model ([[Images & Cover
 * Assets]]): files named `<entry-id>.<ext>` under `images/<habit-key>/`, the
 * DB stores only the root-relative REFERENCE, never bytes. Download happens
 * once at import time; failure is NON-FATAL (the entry lands with the
 * lettermark fallback — a legitimate look, never an error).
 *
 * STAND-IN (the 6a doctrine, recorded at the step-8 open): the real home is
 * `<cloud root>/images/`, and the cloud root does not exist until step 14 —
 * until then the images root lives under the app's local data dir
 * (`$APPLOCALDATA/images/`), granted in `capabilities/default.json`. Step 14
 * re-points the root; the refs stay root-relative so nothing else moves.
 *
 * The old TMDB cover-filename collision (movie 500 and TV 500 both wrote
 * `tmdb-500.jpg`) is dead by construction here — the filename is the ENTRY id.
 */
import { importFetch } from "./http";

const extFromUrl = (url: string): string => {
  const m = /\.(jpe?g|png|webp|gif)(?:$|\?)/i.exec(url);
  const raw = m ? m[1].toLowerCase() : "jpg";
  return raw === "jpeg" ? "jpg" : raw;
};

/**
 * Download `coverUrl` and store it as `images/<habitKey>/<entryId>.<ext>`.
 * Returns the root-relative ref to write on the entry, or null on any failure
 * (non-fatal by rule).
 */
export const saveCover = async (
  habitKey: string,
  entryId: string,
  coverUrl: string,
): Promise<string | null> => {
  try {
    // `calibre:<book-path>` — a LOCAL cover crossing the IPC boundary as
    // bytes (the Rust calibre_cover command), not a network fetch. Lazy
    // import keeps the module graph cycle-free.
    let bytes: Uint8Array;
    let ext: string;
    if (coverUrl.startsWith("calibre:")) {
      const { calibreCoverBytes } = await import("./calibre");
      bytes = await calibreCoverBytes(coverUrl.slice("calibre:".length));
      ext = "jpg";
    } else {
      const res = await importFetch(coverUrl);
      bytes = new Uint8Array(await res.arrayBuffer());
      ext = extFromUrl(coverUrl);
    }
    if (bytes.byteLength === 0) return null;
    const fs = await import("@tauri-apps/plugin-fs");
    const dir = `images/${habitKey}`;
    const base = { baseDir: fs.BaseDirectory.AppLocalData };
    if (!(await fs.exists(dir, base))) await fs.mkdir(dir, { ...base, recursive: true });
    const rel = `${dir}/${entryId}.${ext}`;
    await fs.writeFile(rel, bytes, base);
    return rel;
  } catch (e) {
    console.warn("cover download failed (non-fatal)", coverUrl, e);
    return null;
  }
};

// ── Display (blob URLs, the ambienceAssets pattern) ──────────────────────────

const coverCache = new Map<string, Promise<string | null>>();

/** Read a stored cover ref back as a blob URL for display; null = lettermark. */
export const coverBlob = (ref: string): Promise<string | null> => {
  const hit = coverCache.get(ref);
  if (hit) return hit;
  const p = (async () => {
    try {
      const fs = await import("@tauri-apps/plugin-fs");
      const data = await fs.readFile(ref, { baseDir: fs.BaseDirectory.AppLocalData });
      return URL.createObjectURL(new Blob([data]));
    } catch {
      return null;
    }
  })();
  coverCache.set(ref, p);
  return p;
};
