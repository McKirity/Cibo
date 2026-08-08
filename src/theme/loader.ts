/**
 * THE THEME LOADER — Build step 6a ([[Theme Layer]] · [[Theme Package Format]]).
 *
 * Two roots, one code path (ruled 2026-07-19): the app's bundled resource
 * directory and the drop-in folder — `<cloud root>/themes/`, DERIVED from
 * step 14's one cloud-root setting (settings/cloudRoot; the dev stand-in key
 * is retired; the pick persists on the per-device file, settings/deviceStore).
 * The folder name IS the theme
 * name · `_`-prefixed folders are skipped · theme.css is the only required
 * file · a malformed folder is skipped, never a crash (its health-row entry
 * lives in the health home — recorded in the scan meanwhile).
 *
 * CASCADE MODEL: bootstrap.tsx keeps the static import of the bundled Default's
 * theme.css (it moved there from main.tsx at the 2026-08-04 shim split — main.tsx
 * is now the device-store shim) — since 6a that compiled-in copy is the
 * ULTIMATE FALLBACK, not a
 * stand-in (the Default never retires). Applying a theme injects its sheet as
 * a <style> appended to <head>, which follows every bundled stylesheet and so
 * wins the cascade at equal (:root) specificity; applying the Default simply
 * removes the injection. A partial drop-in theme.css therefore falls back
 * dial-by-dial to the Default's values — free and correct.
 *
 * FONTS (step 6b, 2026-07-31): a theme's optional `fonts/` folder registers
 * app-scoped via the FontFace API at apply time — see fonts.ts. Nothing is
 * installed OS-side; `theme.css` only names the family.
 *
 * Name shadowing (ruled 2026-07-31): BUNDLED WINS — a drop-in folder that
 * shadows a bundled name is dropped and flagged (the Default must never be
 * shadowable by a broken copy).
 *
 * A picked theme that no longer exists falls back to the Default with a
 * ONE-TIME notice (the notice latches per missing name; the pick itself is
 * kept, so a cloud folder that syncs in later simply loads next launch).
 *
 * Outside a Tauri webview (plain `npm run dev` in a browser) everything here
 * no-ops and the static Default stands — the safeWindow doctrine.
 */

import { showErrorToast } from "../shell/toast";
import { applyDerivedDials } from "./derived";
import { applyThemeFonts } from "./fonts";
import { deviceGet as lsGet, deviceSet as lsSet, inTauri } from "../settings/deviceStore";
import { cloudSub } from "../settings/cloudRoot";

export const DEFAULT_THEME = "Default (neutral light)";
/** The per-device theme pick (Settings → Appearance owns the control). */
export const THEME_PICK_KEY = "cibo.themePick";
const MISSING_NOTICED_KEY = "cibo.themeMissingNoticed";
const STYLE_ID = "cibo-theme-css";

export interface ThemeEntry {
  /** Folder name = theme name (shown in the picker). */
  name: string;
  /** Absolute path of the theme folder. */
  dir: string;
  source: "bundled" | "cloud";
}

export interface ThemeScan {
  themes: ThemeEntry[];
  /** Drop-in names dropped because a bundled theme owns the name (flagged). */
  shadowed: string[];
  /** Folders skipped as malformed (no theme.css) — future health-row tenants. */
  skipped: string[];
}

// inTauri is imported from settings/deviceStore (the one declaration; it lives
// there because the boot shim needs a dependency-free module). Was a local copy.

/** `<cloud root>/themes` — the drop-in root; null while the root is unset. */
export const getThemesRoot = (): string | null => cloudSub("themes");
export const getPick = (): string => lsGet(THEME_PICK_KEY) ?? DEFAULT_THEME;

/** The applied theme (the Default until a pick lands). Ambience reads this. */
let current: ThemeEntry | null = null;
export const currentTheme = (): ThemeEntry | null => current;

async function scanRoot(
  root: string,
  source: ThemeEntry["source"],
  out: ThemeScan,
): Promise<void> {
  const fs = await import("@tauri-apps/plugin-fs");
  const { join } = await import("@tauri-apps/api/path");
  if (!(await fs.exists(root))) return;
  const entries = await fs.readDir(root);
  for (const e of entries) {
    if (!e.isDirectory || e.name.startsWith("_")) continue;
    const dir = await join(root, e.name);
    if (await fs.exists(await join(dir, "theme.css"))) {
      if (out.themes.some((t) => t.name === e.name)) out.shadowed.push(e.name);
      else out.themes.push({ name: e.name, dir, source });
    } else {
      out.skipped.push(`${e.name} (${source})`);
    }
  }
}

/** Enumerate both roots. Bundled scans first, so bundled wins collisions. */
export async function scanThemes(): Promise<ThemeScan> {
  const out: ThemeScan = { themes: [], shadowed: [], skipped: [] };
  if (!inTauri()) return out;
  const { resolveResource } = await import("@tauri-apps/api/path");
  await scanRoot(await resolveResource("resources/themes"), "bundled", out);
  const cloudRoot = getThemesRoot();
  if (cloudRoot) {
    try {
      await scanRoot(cloudRoot, "cloud", out);
    } catch (e) {
      // An unreadable drop-in root is never a gate — the bundled pair stands.
      console.warn("Theme loader: drop-in root unreadable:", e);
    }
  }
  if (out.shadowed.length)
    console.warn(`Theme loader: drop-in folder(s) shadow bundled names, dropped: ${out.shadowed.join(", ")}`);
  return out;
}

function announce(name: string): void {
  document.documentElement.dataset.theme = name;
  applyDerivedDials(); // ramp complements re-derive from the newly applied sheet
  window.dispatchEvent(new CustomEvent("cibo:theme-applied", { detail: { name } }));
}

/** Inject a theme's sheet (or remove the injection for the bundled Default). */
async function inject(entry: ThemeEntry): Promise<void> {
  // The fonts channel (6b): register the folder's fonts/ files, unregister
  // the previous theme's. Soft-fail by construction — never gates the apply.
  await applyThemeFonts(entry.dir);
  if (entry.source === "bundled" && entry.name === DEFAULT_THEME) {
    document.getElementById(STYLE_ID)?.remove();
    current = entry;
    announce(entry.name);
    return;
  }
  const fs = await import("@tauri-apps/plugin-fs");
  const { join } = await import("@tauri-apps/api/path");
  const css = await fs.readTextFile(await join(entry.dir, "theme.css"));
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
  current = entry;
  announce(entry.name);
}

/** Apply + persist a pick — Settings → Appearance's door (the dev panel's until step 10). */
export async function setTheme(entry: ThemeEntry): Promise<void> {
  await inject(entry);
  lsSet(THEME_PICK_KEY, entry.name);
  lsSet(MISSING_NOTICED_KEY, null);
}

/** Launch path: scan, resolve the pick, fall back to the Default if missing. */
export async function initTheme(): Promise<void> {
  if (!inTauri()) return;
  try {
    const scan = await scanThemes();
    const pick = getPick();
    const entry = scan.themes.find((t) => t.name === pick);
    if (entry) {
      lsSet(MISSING_NOTICED_KEY, null);
      await inject(entry);
      return;
    }
    if (pick !== DEFAULT_THEME && lsGet(MISSING_NOTICED_KEY) !== pick) {
      lsSet(MISSING_NOTICED_KEY, pick);
      showErrorToast(`Theme "${pick}" wasn't found — using ${DEFAULT_THEME}.`);
    }
    const fallback = scan.themes.find((t) => t.name === DEFAULT_THEME);
    if (fallback) await inject(fallback);
    else document.getElementById(STYLE_ID)?.remove(); // static Default stands
  } catch (e) {
    // Loader failure is never a gate — the compiled-in Default stands whole.
    console.error("Theme loader failed; the static Default stands:", e);
  }
}
