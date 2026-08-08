/**
 * THE CLOUD ROOT (Build step 14) — the ONE user-picked folder inside the cloud
 * drive ([[Storage & Filesystem Layout]]). The app owns the layout inside it:
 * `backups/` · `images/` · `themes/`, created on first use; backups, cover
 * storage and the theme drop-in root all DERIVE from this one setting — the
 * per-feature stand-in roots of the 6a/12 era (`cibo.dev.themesRoot` ·
 * `cibo.dev.backupsRoot`) are retired the moment a real pick lands.
 *
 * An UNSET root is never a gate (the ruled model): backups pause, imported
 * cover art has nowhere to land (entries keep their lettermark), drop-in
 * themes are absent — the bundled pair stands. The health machinery is the
 * nag path, never a blocker.
 *
 * THE INVARIANT this module is the keeper of: synced data never contains an
 * absolute path. Every file reference in the store (covers, banners) is
 * root-RELATIVE (`images/<habit-key>/<file>`) and resolves against THIS
 * device's root at runtime — `resolveRef` is the one place refs meet the
 * device. The root itself is a per-device machine fact (deviceStore).
 *
 * FS ACCESS: the Storage pane's folder pick (dialog, `recursive: true` —
 * load-bearing, the 6a lesson) extends the fs scope over the whole tree and
 * `tauri-plugin-persisted-scope` carries the grant across launches — the same
 * mechanism the themes-root stand-in proved. Static capabilities only carry
 * the app-local files; the cloud root's grant is runtime by construction.
 */
import { deviceGet, deviceSet } from "./deviceStore";

export const CLOUD_ROOT_KEY = "cibo.cloudRoot";
/** Fired on every root change; panes deriving from the root re-read on it. */
export const CLOUD_ROOT_EVENT = "cibo:cloud-root";

/** The stand-in era's per-feature roots — cleared when the real pick lands. */
const STAND_IN_KEYS = ["cibo.dev.backupsRoot", "cibo.dev.themesRoot"];

export const getCloudRoot = (): string | null => deviceGet(CLOUD_ROOT_KEY);

/** The root's own separator style wins (backup.ts's rule, hoisted). */
const sep = (root: string): string =>
  root.includes("/") && !root.includes("\\") ? "/" : "\\";

/** Join a root-relative ref/subpath under an absolute root, separator-matched. */
export const underRoot = (root: string, rel: string): string =>
  `${root}${sep(root)}${rel.replace(/\//g, sep(root))}`;

/** `<cloud root>/<sub>` for the three app-owned subfolders; null while unset. */
export const cloudSub = (sub: "backups" | "images" | "themes"): string | null => {
  const root = getCloudRoot();
  return root == null ? null : underRoot(root, sub);
};

/** A stored root-relative ref → an absolute path on THIS device (null = unset
 *  root, the caller's cue for its designed fallback). */
export const resolveRef = (ref: string): string | null => {
  const root = getCloudRoot();
  return root == null ? null : underRoot(root, ref);
};

export const setCloudRoot = (path: string | null): void => {
  deviceSet(CLOUD_ROOT_KEY, path);
  if (path != null) for (const k of STAND_IN_KEYS) deviceSet(k, null);
  try {
    window.dispatchEvent(new CustomEvent(CLOUD_ROOT_EVENT));
  } catch {
    /* non-DOM context */
  }
};
