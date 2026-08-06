/**
 * THE DECORATION CHANNEL — Build step 6a, job 2 of the 2026-07-20 split
 * ([[Decoration Layer]] § Remaining work item 4: the role → kit-target wiring
 * + reading `decoration/manifest.json`; job 3 — asset production — is
 * post-release). Inert over the art-free bundled pair by design: the wiring
 * is proven to load and the manifest proven to parse, so the first asset
 * drops onto live plumbing.
 *
 * THE MANIFEST SCHEMA IS DEFINED HERE (the owning note assigns it to this
 * step; per-slot switches and tint overrides are MANIFEST-side, never dials —
 * user-ruled 2026-07-19; `theme.css` stays values-only):
 *
 *   {
 *     "slots": {
 *       "<slot-id>": {
 *         "off": true,                // the per-slot switch — slot stays token-only
 *         "tint": "--finalize-mark",  // tint override — the dial a tintable stamp pours through
 *         "asset": "frame-panel.png", // Phase-2: art file, relative to decoration/
 *         "slice": [12,12,12,12],     // Phase-2: 9-slice insets (t r b l), authored px
 *         "scale": 2                  // Phase-2: raster authoring scale (default 2)
 *       }
 *     }
 *   }
 *
 * Slot ids are the decoration template sheet's `data-slot` roster (the
 * 25-slot catalog; numbered/state variants ride suffixes). Unknown ids warn
 * and are ignored; `_`-prefixed keys are comments. Soft-fail everywhere — a
 * malformed manifest leaves the theme fully token-only, never a crash.
 *
 * RUNTIME MECHANISM: parsed slots publish per-slot custom properties on the
 * root element —
 *   --deco-<slot>:       url(<blob>)   (asset present)
 *   --deco-<slot>-tint:  var(<dial>)   (tint override)
 * and decoration.css pre-wires every kit target to consume its role's
 * property with a `none` fallback (frames via border-image, fills/patterns
 * via background-image, stamps via mask/content images). `off: true`
 * publishes nothing for that slot even when an asset exists.
 */

import { currentTheme } from "./loader";

/** The 25-slot catalog's base ids (variants ride suffixes off these). */
const SLOT_BASES = [
  // frames (11)
  "frame-seam",
  "frame-panel",
  "frame-headliner",
  "frame-tile",
  "frame-habit-card",
  "frame-tool-card",
  "frame-daily-log",
  "frame-whimsy",
  "frame-modal",
  "frame-dialog",
  "frame-palette",
  // strips (3)
  "strip-titlebar",
  "strip-divider",
  "strip-flourish",
  // data (6)
  "fill-bar",
  "fill-timer",
  "fill-daily-log",
  "stamp-bartip",
  "pattern-heatcell",
  "stamp-cadence",
  "stamp-row",
  // stamps & accents (5)
  "stamp-finalize-day",
  "stamp-bullet",
  "stamp-empty",
  "stamp-milestone",
  "button-finalize",
] as const;

const isKnownSlot = (id: string): boolean =>
  SLOT_BASES.some((base) => id === base || id.startsWith(`${base}-`));

export interface DecorationSummary {
  /** absent = no manifest file · stub = parsed, zero live slots · live = slots active */
  state: "absent" | "stub" | "live" | "malformed";
  active: string[];
  off: string[];
  tints: Record<string, string>;
  warnings: string[];
}

let published: string[] = [];
let lastSummary: DecorationSummary = { state: "absent", active: [], off: [], tints: {}, warnings: [] };
export const decorationSummary = (): DecorationSummary => lastSummary;

import { inTauri } from "../settings/deviceStore";

let liveUrls: string[] = [];

function clear(): void {
  const root = document.documentElement.style;
  for (const name of published) root.removeProperty(name);
  published = [];
  for (const u of liveUrls) URL.revokeObjectURL(u);
  liveUrls = [];
}

function publish(name: string, value: string): void {
  document.documentElement.style.setProperty(name, value);
  published.push(name);
}

/** Read + apply a theme's decoration manifest. Soft-fail: token-only on any error. */
export async function applyDecoration(themeDir: string | null): Promise<void> {
  clear();
  const summary: DecorationSummary = { state: "absent", active: [], off: [], tints: {}, warnings: [] };
  lastSummary = summary;
  if (!inTauri() || !themeDir) return done(summary);
  try {
    const fs = await import("@tauri-apps/plugin-fs");
    const { join } = await import("@tauri-apps/api/path");
    const decoDir = await join(themeDir, "decoration");
    const manifestPath = await join(decoDir, "manifest.json");
    if (!(await fs.exists(manifestPath))) return done(summary);

    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readTextFile(manifestPath));
    } catch (e) {
      summary.state = "malformed";
      summary.warnings.push(`manifest.json did not parse (${String(e)}) — theme is token-only`);
      return done(summary);
    }
    summary.state = "stub";
    const slots = (parsed as { slots?: Record<string, unknown> }).slots ?? {};

    for (const [id, raw] of Object.entries(slots)) {
      if (id.startsWith("_")) continue;
      if (!isKnownSlot(id)) {
        summary.warnings.push(`unknown slot "${id}" ignored`);
        continue;
      }
      const cfg = (raw ?? {}) as { off?: unknown; tint?: unknown; asset?: unknown };
      if (cfg.off === true) {
        summary.off.push(id); // the per-slot switch: nothing publishes
        continue;
      }
      if (typeof cfg.tint === "string" && cfg.tint.startsWith("--")) {
        publish(`--deco-${id}-tint`, `var(${cfg.tint})`);
        summary.tints[id] = cfg.tint;
      }
      if (typeof cfg.asset === "string" && cfg.asset.length > 0) {
        const assetPath = await join(decoDir, cfg.asset);
        if (await fs.exists(assetPath)) {
          const data = await fs.readFile(assetPath);
          const ext = cfg.asset.split(".").pop()?.toLowerCase() ?? "";
          const mime =
            ext === "svg" ? "image/svg+xml" : ext === "webp" ? "image/webp" : "image/png";
          const url = URL.createObjectURL(new Blob([data], { type: mime }));
          liveUrls.push(url);
          publish(`--deco-${id}`, `url(${url})`);
          summary.active.push(id);
        } else {
          summary.warnings.push(`slot "${id}": asset "${cfg.asset}" missing — skipped`);
        }
      }
    }
    if (summary.active.length || Object.keys(summary.tints).length) summary.state = "live";
  } catch (e) {
    summary.state = "malformed";
    summary.warnings.push(String(e));
  }
  return done(summary);
}

function done(summary: DecorationSummary): void {
  lastSummary = summary;
  for (const w of summary.warnings) console.warn(`Decoration: ${w}`);
  window.dispatchEvent(new CustomEvent("cibo:decoration-applied"));
}

/** Launch wiring: apply for the boot theme and re-apply on every theme apply. */
export function initDecoration(): void {
  const run = () => {
    void applyDecoration(currentTheme()?.dir ?? null);
  };
  window.addEventListener("cibo:theme-applied", run);
  run();
}
