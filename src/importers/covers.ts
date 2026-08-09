/**
 * Cover download + storage — the folder-first model ([[Images & Cover
 * Assets]]): files named `<entry-id>.<ext>` under `images/<habit-key>/`, the
 * DB stores only the root-relative REFERENCE, never bytes. Download happens
 * once at import time; failure is NON-FATAL (the entry lands with the
 * lettermark fallback — a legitimate look, never an error).
 *
 * THE HOME (step 14): `<cloud root>/images/`, derived from the one cloud-root
 * setting (settings/cloudRoot — the $APPLOCALDATA stand-in era is over). Refs
 * stay root-RELATIVE (`images/<habit-key>/<file>`) and resolve against this
 * device's root at read time — the synced-data-never-stores-an-absolute-path
 * invariant. An unset root: saves return null (the entry keeps its lettermark,
 * non-fatal by rule) and reads resolve to nothing — never a gate.
 *
 * **NAMING, AMENDED 2026-08-08 (user-ruled).** An imported entry's images are
 * named after the entry's OWN identity — `<source>-<external_id>` — not its
 * database id. Hand-made entries have no external identity and keep the entry
 * id, which is also fine because they are never re-imported.
 *
 * *Why the change.* The entry id is stable for as long as the row lives, and
 * the row is what does not survive a store wipe or a restore. Re-importing the
 * same book then minted a NEW row, a NEW id and therefore a NEW file — a second
 * copy of the same picture, with the first stranded pointing at a row that no
 * longer existed. One restore-and-reimport cycle doubles the folder. That is a
 * development pattern rather than a use pattern, but it happened twice in one
 * day and each time cost a manual cleanup of ~151 files.
 *
 * *Why it is safe now, and was not before.* The header used to record the old
 * TMDB collision — movie 500 and TV 500 both writing `tmdb-500.jpg` — as the
 * reason for entry-id naming. **That reason is spent:** the app splits the
 * sources (`tmdb-movie` / `tmdb-tv`, `anilist-anime` / `anilist-manga`), which
 * is what makes `(source, external_id)` unique together in the schema, and the
 * same split makes it unique as a filename. All eight source keys were checked
 * before this landed.
 *
 * Owning record: [[Images & Cover Assets]], amended with this change.
 */
import { importBytes } from "./http";
import { cloudSub, resolveRef, underRoot } from "../settings/cloudRoot";
import { imageStem } from "./imageStem";

const extFromUrl = (url: string): string => {
  const m = /\.(jpe?g|png|webp|gif)(?:$|\?)/i.exec(url);
  const raw = m ? m[1].toLowerCase() : "jpg";
  return raw === "jpeg" ? "jpg" : raw;
};

/**
 * Download `coverUrl` and store it as `images/<habitKey>/<stem>.<ext>`.
 * Returns the root-relative ref to write on the entry, or null on any failure
 * (non-fatal by rule).
 */
export const saveCover = async (
  habitKey: string,
  entryId: string,
  coverUrl: string,
  /** The entry's external identity, when it has one — see `imageStem`. */
  identity?: { source: string | null; externalId: string | null },
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
      // `importBytes`, not fetch-then-read: the body read belongs inside the
      // retry/timeout (`ao3-1`). This is the image pipeline's WRITE half, so a
      // download cut mid-flight would otherwise land a truncated file on disk.
      bytes = await importBytes(coverUrl);
      ext = extFromUrl(coverUrl);
    }
    if (bytes.byteLength === 0) return null;
    const imagesRoot = cloudSub("images");
    if (imagesRoot == null) return null; // unset root — custom images unavailable, never a gate
    const fs = await import("@tauri-apps/plugin-fs");
    const dirAbs = underRoot(imagesRoot, habitKey);
    if (!(await fs.exists(dirAbs))) await fs.mkdir(dirAbs, { recursive: true });
    // Same book → same filename → an OVERWRITE, never a second copy. This is
    // the whole point of the 2026-08-08 amendment.
    const stem = imageStem(entryId, identity?.source, identity?.externalId);
    const rel = `images/${habitKey}/${stem}.${ext}`;
    await fs.writeFile(resolveRef(rel) as string, bytes);
    return rel;
  } catch (e) {
    console.warn("cover download failed (non-fatal)", coverUrl, e);
    return null;
  }
};

/**
 * The user-dropped half of the pipeline (fork J, user-ruled 2026-08-06;
 * folder model re-ruled the same day): a dialog pick (the grant rides the
 * pick — the app's runtime-fs pattern) that OPENS INSIDE the habit's own
 * `images/<habit-key>/` folder — every project habit gets one, creation
 * included, and covers AND banners both pick from it. A file already living in
 * that folder is referenced IN PLACE (the user curated it there — no copy, no
 * rename); a file from anywhere else copies in under the canonical
 * `<entry-id>[-banner].<ext>` name. Returns the root-relative ref to write, or
 * null on cancel/failure (non-fatal, the lettermark law). The caller owns
 * deleting a replaced file's old ref — but never an in-place curated file
 * another entry may share.
 */
export const pickAndStoreEntryImage = async (
  habitKey: string,
  entryId: string,
  kind: "cover" | "banner",
  /** As `saveCover` — the two halves must agree on the stem for one entry. */
  identity?: { source: string | null; externalId: string | null },
): Promise<string | null> => {
  try {
    const imagesRoot = cloudSub("images");
    if (imagesRoot == null) return null; // unset root — never a gate
    const fs = await import("@tauri-apps/plugin-fs");
    const dirAbs = underRoot(imagesRoot, habitKey);
    if (!(await fs.exists(dirAbs))) await fs.mkdir(dirAbs, { recursive: true });
    const { open } = await import("@tauri-apps/plugin-dialog");
    const sel = await open({
      title: kind === "cover" ? "Pick a cover image" : "Pick a banner image",
      defaultPath: dirAbs,
      multiple: false,
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "gif"] }],
    });
    if (typeof sel !== "string") return null;
    // Already inside this habit's folder → reference in place.
    const norm = (p: string) => p.replace(/[\\/]+/g, "/").toLowerCase();
    const selNorm = norm(sel);
    const dirNorm = norm(dirAbs).replace(/\/+$/, "") + "/";
    if (selNorm.startsWith(dirNorm)) {
      const name = sel.slice(sel.length - (selNorm.length - dirNorm.length));
      if (!name.includes("/") && !name.includes("\\")) {
        const rel = `images/${habitKey}/${name}`;
        coverCache.delete(rel);
        return rel;
      }
    }
    const bytes = await fs.readFile(sel);
    if (bytes.byteLength === 0) return null;
    const m = /\.(jpe?g|png|webp|gif)$/i.exec(sel);
    const raw = m ? m[1].toLowerCase() : "jpg";
    const ext = raw === "jpeg" ? "jpg" : raw;
    const stem = imageStem(entryId, identity?.source, identity?.externalId);
    const rel = `images/${habitKey}/${stem}${kind === "banner" ? "-banner" : ""}.${ext}`;
    await fs.writeFile(resolveRef(rel) as string, bytes);
    coverCache.delete(rel); // a replace must not serve the stale blob
    return rel;
  } catch (e) {
    console.warn("image pick failed (non-fatal)", e);
    return null;
  }
};

// ── Display (blob URLs, the ambienceAssets pattern) ──────────────────────────

const coverCache = new Map<string, Promise<string | null>>();

/** Read a stored cover ref back as a blob URL for display; null = lettermark.
 *  Only SUCCESSES stay cached — a failed read (root unset at first render, a
 *  file the cloud drive hasn't synced yet) retries on the next mount instead
 *  of latching the lettermark for the session. */
export const coverBlob = (ref: string): Promise<string | null> => {
  const hit = coverCache.get(ref);
  if (hit) return hit;
  const p = (async () => {
    try {
      const abs = resolveRef(ref);
      if (abs == null) return null;
      const fs = await import("@tauri-apps/plugin-fs");
      const data = await fs.readFile(abs);
      return URL.createObjectURL(new Blob([data]));
    } catch {
      return null;
    }
  })();
  coverCache.set(ref, p);
  void p.then((v) => {
    if (v == null) coverCache.delete(ref);
  });
  return p;
};
