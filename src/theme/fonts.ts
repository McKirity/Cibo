/**
 * THEME FONTS — Build step 6b ([[Theme Package Format]] § Fonts, amended
 * 2026-07-31 at the Blame! mint; user-ratified).
 *
 * A theme folder may carry an optional `fonts/` subfolder of ordinary font
 * files. The loader registers each via the FontFace API when the theme
 * applies — an in-memory, app-scoped registration: the OS font registry is
 * never touched, nothing installs, and switching themes unregisters whole.
 * `theme.css` stays values-only: it simply names the family.
 *
 * THE FILENAME IS THE FAMILY NAME (the package's standing convention —
 * the folder name is the theme name): `Anton.woff2` registers as `Anton`.
 *
 * WEIGHT SUFFIX (optional): a trailing `-<n>` or `-<lo>-<hi>` is read as the
 * face's weight and stripped from the family, so one family can carry many
 * faces — `IBMPlexMono-400.woff2` + `IBMPlexMono-500.woff2` both register as
 * `IBMPlexMono`, and a VARIABLE font declares its range once
 * (`IBMPlexSans-100-700.woff2` → family `IBMPlexSans`, weight `100 700`).
 * Without a suffix the face registers at normal weight and the webview
 * synthesizes the rest — right for single-weight display faces, wrong for a
 * variable file, which is exactly what the suffix exists to fix.
 *
 * Bytes travel as blob URLs read Rust-side via plugin-fs — the same
 * no-asset-protocol doctrine as ambienceAssets. Soft-fail throughout: a bad
 * font file is skipped (the sheet's fallback stack stands), a missing
 * `fonts/` folder is silence, and nothing here ever throws out.
 */

const FONT_EXTS = ["woff2", "woff", "ttf", "otf"] as const;

/**
 * Split a filename stem into its family and optional weight descriptor:
 * `Anton` → no weight · `IBMPlexMono-400` → 400 · `IBMPlexSans-100-700` →
 * the variable range "100 700". A hyphen followed by anything non-numeric is
 * part of the family name (`Chakra-Petch` stays `Chakra-Petch`).
 */
export function parseFontStem(stem: string): { family: string; weight?: string } {
  const range = /^(.*?)-(\d{1,4})-(\d{1,4})$/.exec(stem);
  if (range) return { family: range[1], weight: `${range[2]} ${range[3]}` };
  const single = /^(.*?)-(\d{1,4})$/.exec(stem);
  if (single) return { family: single[1], weight: single[2] };
  return { family: stem };
}

const inTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Faces registered by the currently applied theme (for clean unregister). */
let liveFaces: FontFace[] = [];

/** Unregister every face the previous theme brought (called on re-apply). */
export function clearThemeFonts(): void {
  for (const f of liveFaces) document.fonts.delete(f);
  liveFaces = [];
}

/**
 * Register the theme folder's `fonts/` files with the document. Never
 * throws; per-file soft-fail. Safe to call for themes with no fonts.
 */
export async function applyThemeFonts(themeDir: string | null): Promise<void> {
  clearThemeFonts();
  if (!inTauri() || !themeDir) return;
  try {
    const fs = await import("@tauri-apps/plugin-fs");
    const { join } = await import("@tauri-apps/api/path");
    const dir = await join(themeDir, "fonts");
    if (!(await fs.exists(dir))) return;
    for (const e of await fs.readDir(dir)) {
      const dot = e.name.lastIndexOf(".");
      const ext = dot < 0 ? "" : e.name.slice(dot + 1).toLowerCase();
      if (!e.isFile || !(FONT_EXTS as readonly string[]).includes(ext)) continue;
      const { family, weight } = parseFontStem(e.name.slice(0, dot));
      let url: string | null = null;
      try {
        const data = await fs.readFile(await join(dir, e.name));
        url = URL.createObjectURL(new Blob([data]));
        const face = new FontFace(family, `url(${url})`, weight ? { weight } : {});
        await face.load();
        document.fonts.add(face);
        liveFaces.push(face);
      } catch (err) {
        // Soft-fail: the sheet's fallback stack stands for this family.
        console.warn(`Theme fonts: "${e.name}" skipped:`, err);
      } finally {
        if (url) URL.revokeObjectURL(url); // FontFace holds the loaded bytes
      }
    }
  } catch (err) {
    console.warn("Theme fonts: fonts/ scan failed — fallback stacks stand:", err);
  }
}
