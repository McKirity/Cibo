/**
 * AMBIENCE ASSET DISCOVERY — Build step 6a ([[Theme Package Format]] owns the
 * folder contract; the loading rules quoted there govern this module).
 *
 * TWO surfaces per theme (the vignette was abandoned 2026-07-26): `backdrop`
 * and `timer`. Each surface takes ONE of two forms:
 *
 *   THE SINGLE-FILE FORM (step 6a)
 *   still  — `<base>.<ext>`, matched down a fixed priority (PNG wins ties);
 *            REQUIRED whenever the surface carries motion — no still means the
 *            surface is silent and any motion is a packaging error, skipped.
 *   motion — `<base>_loop.mp4` (full-scene, opaque H.264) OR `<base>_loop/`
 *            patch folders (zero-padded PNG frames + a three-number manifest
 *            `{x, y, fps}` in 2560×1440 master coordinates; fps clamped ≤24).
 *            MUTUALLY EXCLUSIVE per surface: an .mp4 present means the folder
 *            is ignored and flagged as a packaging error.
 *
 *   THE SET FORM (ruled 2026-08-20 — [[Ambience Slideshow]])
 *   `backdrops/` · `timers/` — any number of stills, SORTED BY FILENAME
 *            (numeric-aware, so `2.jpg` precedes `10.jpg`), mixed sizes legal
 *            (the crop law is computed per image), STILLS ONLY — motion stays
 *            bound to the single-file form. The scan LISTS the folder and
 *            loads nothing; the slideshow (Ambience.tsx) loads ONE member at a
 *            time through `loadStill` and releases it after the swap, so a
 *            forty-picture set costs the memory of two pictures.
 *            If both forms are present THE SET WINS and the loose file is
 *            warned as a packaging slip (the mp4-vs-folder exclusivity shape).
 *
 *   soft-fail — a malformed patch is skipped; a broken video falls back to
 *            the still (the renderer's job); nothing here ever throws out.
 *
 * Art travels as blob URLs (bytes read Rust-side via plugin-fs) — no asset
 * protocol, no CSP surface. Re-scanning revokes the previous URLs; a set
 * member's URL is revoked by its own `release()` when the slideshow is done
 * with it.
 */

const EXTS = ["png", "jpg", "jpeg", "webp", "avif", "svg"] as const;
const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
};

/** The set folder per surface base name. */
const SET_DIR: Record<"backdrop" | "timer", string> = { backdrop: "backdrops", timer: "timers" };

export interface PatchLoop {
  /** Crop top-left in master (still-image) pixel coordinates. */
  x: number;
  y: number;
  /** Clamped ≤ 24 by the loader (the contract's ceiling). */
  fps: number;
  /** Frame pixel size (from the first frame). */
  w: number;
  h: number;
  /** Frame blob URLs in filename-sort order; the loop wraps implicitly. */
  frames: string[];
}

export interface SurfaceAssets {
  still: { url: string; w: number; h: number };
  video: string | null;
  patches: PatchLoop[];
}

/** One member of a set — a PATH, not a loaded picture. */
export interface SetFile {
  path: string;
  ext: string;
  name: string;
}

/** A set member once loaded; `release()` revokes its blob URL (idempotent). */
export interface LoadedStill {
  url: string;
  w: number;
  h: number;
  release: () => void;
}

export type Surface = { kind: "single"; assets: SurfaceAssets } | { kind: "set"; files: SetFile[] };

export interface AmbienceAssets {
  backdrop: Surface | null;
  timer: Surface | null;
}

let liveUrls: string[] = [];
const track = (url: string): string => {
  liveUrls.push(url);
  return url;
};
const untrack = (url: string): void => {
  const i = liveUrls.indexOf(url);
  if (i >= 0) {
    liveUrls.splice(i, 1);
    URL.revokeObjectURL(url);
  }
};
/** Revoke every blob URL of the previous scan (called on re-scan). */
export function revokeAmbience(): void {
  for (const u of liveUrls) URL.revokeObjectURL(u);
  liveUrls = [];
}

import { inTauri } from "../settings/deviceStore";

async function blobUrl(path: string, ext: string): Promise<string> {
  const fs = await import("@tauri-apps/plugin-fs");
  const data = await fs.readFile(path);
  return track(URL.createObjectURL(new Blob([data], { type: MIME[ext] ?? "" })));
}

/**
 * Load AND DECODE — `decode()` is what makes a crossfade's first frame free:
 * an image that has only loaded still owes its decode to the first paint, and
 * a 2560×1440 decode on the main thread at the fade's first frame is a visible
 * hitch. Falls back to the bare load where decode() is unsupported.
 */
const imageDims = (url: string): Promise<{ w: number; h: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const done = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      if (typeof img.decode === "function") img.decode().then(done, done);
      else done();
    };
    img.onerror = () => reject(new Error("image failed to decode"));
    img.src = url;
  });

const extOf = (name: string): string | null => {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return (EXTS as readonly string[]).includes(ext) ? ext : null;
};

/** Numeric-aware filename sort, so an author's `1, 2, …, 10` numbering holds. */
const byName = (a: SetFile, b: SetFile): number =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/** List a set folder's stills (paths only — nothing is read). Absent/empty → []. */
async function listSet(themeDir: string, dirName: string): Promise<SetFile[]> {
  const fs = await import("@tauri-apps/plugin-fs");
  const { join } = await import("@tauri-apps/api/path");
  const dir = await join(themeDir, dirName);
  if (!(await fs.exists(dir))) return [];
  let entries: Awaited<ReturnType<typeof fs.readDir>> = [];
  try {
    entries = await fs.readDir(dir);
  } catch (e) {
    console.warn(`Ambience: ${dirName}/ unreadable — treated as absent:`, e);
    return [];
  }
  const files: SetFile[] = [];
  for (const e of entries) {
    if (!e.isFile) continue;
    const ext = extOf(e.name);
    if (!ext) continue;
    files.push({ path: await join(dir, e.name), ext, name: e.name });
  }
  return files.sort(byName);
}

/** Load one set member. Rejects on an unreadable file (the caller skips it). */
export async function loadStill(file: SetFile): Promise<LoadedStill> {
  const url = await blobUrl(file.path, file.ext);
  try {
    const { w, h } = await imageDims(url);
    return { url, w, h, release: () => untrack(url) };
  } catch (e) {
    untrack(url);
    throw e;
  }
}

/** The single-file still's path, down the fixed priority; null when none. */
async function findStill(themeDir: string, base: string): Promise<{ path: string; ext: string } | null> {
  const fs = await import("@tauri-apps/plugin-fs");
  const { join } = await import("@tauri-apps/api/path");
  for (const ext of EXTS) {
    const p = await join(themeDir, `${base}.${ext}`);
    if (await fs.exists(p)) return { path: p, ext };
  }
  return null;
}

async function scanSurface(themeDir: string, base: "backdrop" | "timer"): Promise<Surface | null> {
  const fs = await import("@tauri-apps/plugin-fs");
  const { join } = await import("@tauri-apps/api/path");

  const single = await findStill(themeDir, base);

  // The set form wins over the loose file; motion beside a set is ignored too.
  const set = await listSet(themeDir, SET_DIR[base]);
  if (set.length) {
    if (single)
      console.warn(`Ambience: ${SET_DIR[base]}/ present — ${base}.${single.ext} ignored (packaging slip: the set wins).`);
    const mp4 = await fs.exists(await join(themeDir, `${base}_loop.mp4`));
    const dir = await fs.exists(await join(themeDir, `${base}_loop`));
    if (mp4 || dir) console.warn(`Ambience: ${base}_loop motion ignored — a set carries stills only.`);
    return { kind: "set", files: set };
  }

  // The still — fixed priority, PNG wins ties, one file per base name.
  if (!single) return null; // silence is always valid; motion without a still is skipped
  let still: SurfaceAssets["still"];
  try {
    const url = await blobUrl(single.path, single.ext);
    still = { url, ...(await imageDims(url)) };
  } catch (e) {
    console.warn(`Ambience: ${base} still unreadable, surface silent:`, e);
    return null;
  }

  // Motion — mutually exclusive per surface; the .mp4 wins, the folder flags.
  const mp4Path = await join(themeDir, `${base}_loop.mp4`);
  const loopDir = await join(themeDir, `${base}_loop`);
  const hasMp4 = await fs.exists(mp4Path);
  const hasDir = await fs.exists(loopDir);
  if (hasMp4) {
    if (hasDir) {
      try {
        if ((await fs.readDir(loopDir)).some((e) => e.isDirectory))
          console.warn(`Ambience: ${base}_loop.mp4 present — ${base}_loop/ ignored (packaging error).`);
      } catch {
        /* the flag is best-effort */
      }
    }
    try {
      return { kind: "single", assets: { still, video: await blobUrl(mp4Path, "mp4"), patches: [] } };
    } catch (e) {
      console.warn(`Ambience: ${base}_loop.mp4 unreadable — the still stands:`, e);
      return { kind: "single", assets: { still, video: null, patches: [] } };
    }
  }

  const patches: PatchLoop[] = [];
  if (hasDir) {
    let subs: Awaited<ReturnType<typeof fs.readDir>> = [];
    try {
      subs = await fs.readDir(loopDir);
    } catch {
      /* no patches */
    }
    for (const sub of subs) {
      if (!sub.isDirectory) continue;
      const dir = await join(loopDir, sub.name);
      try {
        const manifest = JSON.parse(await fs.readTextFile(await join(dir, "manifest.json"))) as {
          x?: unknown;
          y?: unknown;
          fps?: unknown;
        };
        const x = Number(manifest.x);
        const y = Number(manifest.y);
        const fps = Math.min(24, Number(manifest.fps)); // the contract clamps
        if (!Number.isFinite(x) || !Number.isFinite(y) || !(fps > 0)) throw new Error("bad manifest");
        const names = (await fs.readDir(dir))
          .filter((f) => f.isFile && f.name.toLowerCase().endsWith(".png"))
          .map((f) => f.name)
          .sort();
        if (names.length < 2) throw new Error("fewer than 2 frames");
        const frames: string[] = [];
        for (const n of names) frames.push(await blobUrl(await join(dir, n), "png"));
        const { w, h } = await imageDims(frames[0]);
        patches.push({ x, y, fps, w, h, frames });
      } catch (e) {
        // Soft-fail: a malformed patch is skipped; the still underneath is complete.
        console.warn(`Ambience: patch "${sub.name}" skipped:`, e);
      }
    }
  }
  return { kind: "single", assets: { still, video: null, patches } };
}

/** Scan both surfaces of a theme folder. Never throws; silence on failure. */
export async function scanAmbience(themeDir: string | null): Promise<AmbienceAssets> {
  revokeAmbience();
  if (!inTauri() || !themeDir) return { backdrop: null, timer: null };
  try {
    return {
      backdrop: await scanSurface(themeDir, "backdrop"),
      timer: await scanSurface(themeDir, "timer"),
    };
  } catch (e) {
    console.warn("Ambience scan failed — surfaces silent:", e);
    return { backdrop: null, timer: null };
  }
}

/**
 * Settings → Appearance → Ambience's question: how many pictures does the
 * active theme's each surface carry? A LIST-ONLY probe — reads no bytes, loads
 * no blobs, never touches the live scan. A single-file surface counts as 1.
 */
export async function probeAmbienceSets(themeDir: string | null): Promise<{ backdrop: number; timer: number }> {
  if (!inTauri() || !themeDir) return { backdrop: 0, timer: 0 };
  const count = async (base: "backdrop" | "timer"): Promise<number> => {
    try {
      const set = await listSet(themeDir, SET_DIR[base]);
      if (set.length) return set.length;
      return (await findStill(themeDir, base)) ? 1 : 0;
    } catch {
      return 0;
    }
  };
  return { backdrop: await count("backdrop"), timer: await count("timer") };
}
