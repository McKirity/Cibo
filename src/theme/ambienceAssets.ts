/**
 * AMBIENCE ASSET DISCOVERY — Build step 6a ([[Theme Package Format]] owns the
 * folder contract; the loading rules quoted there govern this module).
 *
 * TWO surfaces per theme (the vignette was abandoned 2026-07-26): `backdrop`
 * and `timer`. Per surface:
 *   still  — `<base>.<ext>`, matched down a fixed priority (PNG wins ties);
 *            REQUIRED whenever the surface carries motion — no still means the
 *            surface is silent and any motion is a packaging error, skipped.
 *   motion — `<base>_loop.mp4` (full-scene, opaque H.264) OR `<base>_loop/`
 *            patch folders (zero-padded PNG frames + a three-number manifest
 *            `{x, y, fps}` in 2560×1440 master coordinates; fps clamped ≤24).
 *            MUTUALLY EXCLUSIVE per surface: an .mp4 present means the folder
 *            is ignored and flagged as a packaging error.
 *   soft-fail — a malformed patch is skipped; a broken video falls back to
 *            the still (the renderer's job); nothing here ever throws out.
 *
 * Art travels as blob URLs (bytes read Rust-side via plugin-fs) — no asset
 * protocol, no CSP surface. Re-scanning revokes the previous URLs.
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

export interface AmbienceAssets {
  backdrop: SurfaceAssets | null;
  timer: SurfaceAssets | null;
}

let liveUrls: string[] = [];
const track = (url: string): string => {
  liveUrls.push(url);
  return url;
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

const imageDims = (url: string): Promise<{ w: number; h: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("image failed to decode"));
    img.src = url;
  });

async function scanSurface(themeDir: string, base: string): Promise<SurfaceAssets | null> {
  const fs = await import("@tauri-apps/plugin-fs");
  const { join } = await import("@tauri-apps/api/path");

  // The still — fixed priority, PNG wins ties, one file per base name.
  let still: SurfaceAssets["still"] | null = null;
  for (const ext of EXTS) {
    const p = await join(themeDir, `${base}.${ext}`);
    if (await fs.exists(p)) {
      try {
        const url = await blobUrl(p, ext);
        still = { url, ...(await imageDims(url)) };
      } catch (e) {
        console.warn(`Ambience: ${base} still unreadable, surface silent:`, e);
      }
      break;
    }
  }
  if (!still) return null; // silence is always valid; motion without a still is skipped

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
      return { still, video: await blobUrl(mp4Path, "mp4"), patches: [] };
    } catch (e) {
      console.warn(`Ambience: ${base}_loop.mp4 unreadable — the still stands:`, e);
      return { still, video: null, patches: [] };
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
  return { still, video: null, patches };
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
