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
 *     "override": true,             // optional — see THE OVERRIDE LAYER below
 *     "slots": {
 *       "<slot-id>": {
 *         "off": true,                // the per-slot switch — slot stays token-only
 *         "tint": "--finalize-mark",  // tint override — the dial a tintable stamp pours through
 *         "asset": "frame-panel.svg", // art file, relative to decoration/
 *         "slice": 16,                // 9-slice inset in the IMAGE's own px — one number,
 *                                     //   or [t, r, b, l]. REQUIRED on a frame slot.
 *         "fill": true,               // also paint the middle region (default: leave it clear)
 *         "repeat": "round",          // stretch (default) | repeat | round | space
 *         "outset": 8                 // optional px — paint OUTSIDE the box; reflows nothing
 *       }
 *     }
 *   }
 *
 * THICKNESS IS NOT IN THE MANIFEST — user-ruled 2026-08-08 (Phase 2 step 3,
 * finding `deco-1`, option B). A frame paints at its role's own
 * FRAME-CLEARANCE DIAL (--frame-clear-modal · -palette · -grand · -strip ·
 * -tile · -tool · -whimsy · -hcard), which is the room the layouts already
 * reserve for exactly this. So `slice` says which part of the image is the
 * border and the dial says how thick it lands — the art may be authored at
 * any resolution and still fills its designed room. `outset` is the one way
 * out of that box, and it costs no reflow.
 *
 * ⚠ `scale` IS RETIRED from this schema by the same ruling. It existed to map
 * a @2× raster onto a thickness computed from the slice; thickness now comes
 * from the dial, so the number had no job left and was one more thing an
 * artist could get wrong. A `scale` key is ignored (a warning names it).
 *
 * THE OVERRIDE LAYER — user-ruled 2026-08-08 (Phase 2 step 3). A theme SHIPS
 * a default ornament set as part of what it is; the override lets that set be
 * replaced without rewriting the theme's own manifest.
 *
 *   decoration/manifest.json    the theme's DEFAULT set + `"override": true|false`
 *   decoration/override.json    `{ "slots": { … } }`, same schema, read only
 *                               when the manifest turns it on
 *
 * Three properties, each ruled rather than inferred:
 *   · IT LIVES IN THE THEME FOLDER. Not a separate root, not the cloud root —
 *     the theme folder stays decoration's only home, as originally designed.
 *     ⚠ CONSEQUENCE, taken knowingly: re-dropping or updating a theme folder
 *     overwrites both files, so an override does not survive a theme update.
 *   · THE MANIFEST DECIDES. The override file's mere presence does nothing;
 *     `"override": true` in manifest.json is the switch. So a theme can ship
 *     an override alongside its default and leave it dormant.
 *   · IT REPLACES, IT DOES NOT MERGE. The override's `slots` become the whole
 *     set. **A slot the override does not name is simply undecorated** — which
 *     is the point: with merge there is no way to suppress a slot the theme
 *     ships short of a transparent stand-in asset. Cost of the choice, stated
 *     plainly: changing one slot means restating the ones you want to keep.
 *
 * Soft-fail here is deliberately ASYMMETRIC. A missing or malformed override
 * falls back to the theme's OWN set, not to nothing — the theme's set is the
 * known-good state, and silence would read as "decoration is broken" when what
 * is broken is the override. The warning names which.
 *
 * Slot ids are the decoration template sheet's `data-slot` roster (the
 * 25-slot catalog; numbered/state variants ride suffixes). Unknown ids warn
 * and are ignored; `_`-prefixed keys are comments. Soft-fail everywhere — a
 * malformed manifest leaves the theme fully token-only, never a crash.
 *
 * RUNTIME MECHANISM: parsed slots publish per-slot custom properties on the
 * root element —
 *   --deco-<slot>:         url(<blob>)   (asset present)
 *   --deco-<slot>-tint:    var(<dial>)   (tint override)
 *   --deco-<slot>-slice:   <n>[ fill]    (frame slots)
 *   --deco-<slot>-repeat:  <keyword>     (frame slots)
 *   --deco-<slot>-outset:  <n>px         (frame slots)
 * and decoration.css pre-wires every kit target to consume its role's
 * property with an inert fallback (frames via border-image, fills/patterns
 * via background-image, stamps via mask/content images). Every fallback is
 * the CSS initial value, so an unpublished slot is a no-op. `off: true`
 * publishes nothing for that slot even when an asset exists.
 */

import { currentTheme } from "./loader";

/**
 * The 25-slot catalog's base ids (variants ride suffixes off these).
 *
 * ⚠ THERE ARE 26 IDS FOR 25 SLOTS, AND THAT IS CORRECT. The catalog's frame
 * group names one slot **"daily-log card+fill"** — a card frame *and* its
 * optional 2D tile fill — which needs two ids here because they attach to two
 * different CSS properties on the same element (`frame-daily-log` is a
 * border-image, `fill-daily-log` a background-image; decoration.css § the
 * daily-log card). Do not "reconcile" the count by deleting one: both are
 * live and both are attached. Counted 2026-08-08 at Phase 2 step 3.
 */
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
  // data (6 slots, 7 ids — "fill-daily-log" is the second half of the frame
  // group's "daily-log card+fill" slot, homed here because it is a fill)
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

/**
 * The FRAME roles — the slots whose authoring form is the 9-slice border, and
 * so the only ones that read `slice`/`fill`/`repeat`/`outset`.
 *
 * `frame-seam` is deliberately absent: the rail seam band is a repeat-y
 * BACKGROUND, not a border-image (decoration.css § the rail seam band), and
 * the strips are backgrounds too.
 */
const FRAME_BASES = [
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
] as const;

const isFrameSlot = (id: string): boolean =>
  FRAME_BASES.some((base) => id === base || id.startsWith(`${base}-`));

const REPEATS = new Set(["stretch", "repeat", "round", "space"]);

/**
 * `16` or `[t, r, b, l]` → a border-image-slice value in the image's own px.
 * Unitless by construction — border-image-slice numbers ARE image pixels.
 */
function parseSlice(raw: unknown): string | null {
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length !== 1 && list.length !== 4) return null;
  const out: number[] = [];
  for (const n of list) {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 0) return null;
    out.push(v);
  }
  return out.join(" ");
}

export interface DecorationSummary {
  /** absent = no manifest file · stub = parsed, zero live slots · live = slots active */
  state: "absent" | "stub" | "live" | "malformed";
  /** which set actually painted — the theme's shipped default, or its override. */
  source: "theme" | "override";
  active: string[];
  off: string[];
  tints: Record<string, string>;
  warnings: string[];
}

let published: string[] = [];
let lastSummary: DecorationSummary = { state: "absent", source: "theme", active: [], off: [], tints: {}, warnings: [] };
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
  const summary: DecorationSummary = { state: "absent", source: "theme", active: [], off: [], tints: {}, warnings: [] };
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
    let slots = (parsed as { slots?: Record<string, unknown> }).slots ?? {};

    // ---- THE OVERRIDE LAYER (user-ruled 2026-08-08) -----------------------
    // A theme SHIPS a default ornament set; `"override": true` in manifest.json
    // hands the whole set over to decoration/override.json instead. REPLACE,
    // not merge: whatever the override does not name is simply undecorated,
    // which is what makes suppressing a shipped slot possible at all.
    // Soft-fail is deliberately asymmetric — a missing or broken override falls
    // back to the theme's OWN set rather than to nothing, because the theme's
    // set is the known-good state and silence would read as "decoration is
    // broken" rather than "your override is".
    if ((parsed as { override?: unknown }).override === true) {
      const overridePath = await join(decoDir, "override.json");
      if (!(await fs.exists(overridePath))) {
        summary.warnings.push(
          `manifest.json sets "override": true but decoration/override.json is missing — the theme's own set stands`,
        );
      } else {
        try {
          const ov = JSON.parse(await fs.readTextFile(overridePath)) as { slots?: Record<string, unknown> };
          if (ov.slots && typeof ov.slots === "object") {
            slots = ov.slots;
            summary.source = "override";
          } else {
            summary.warnings.push(`override.json has no "slots" object — the theme's own set stands`);
          }
        } catch (e) {
          summary.warnings.push(
            `override.json did not parse (${String(e)}) — the theme's own set stands`,
          );
        }
      }
    }

    for (const [id, raw] of Object.entries(slots)) {
      if (id.startsWith("_")) continue;
      if (!isKnownSlot(id)) {
        summary.warnings.push(`unknown slot "${id}" ignored`);
        continue;
      }
      const cfg = (raw ?? {}) as {
        off?: unknown;
        tint?: unknown;
        asset?: unknown;
        slice?: unknown;
        fill?: unknown;
        repeat?: unknown;
        outset?: unknown;
        scale?: unknown;
      };
      if (cfg.off === true) {
        summary.off.push(id); // the per-slot switch: nothing publishes
        continue;
      }
      if (typeof cfg.tint === "string" && cfg.tint.startsWith("--")) {
        publish(`--deco-${id}-tint`, `var(${cfg.tint})`);
        summary.tints[id] = cfg.tint;
      }
      let assetPublished = false;
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
          assetPublished = true;
        } else {
          summary.warnings.push(`slot "${id}": asset "${cfg.asset}" missing — skipped`);
        }
      }

      if (cfg.scale !== undefined)
        summary.warnings.push(
          `slot "${id}": "scale" is retired (thickness comes from the frame-clearance dial) — ignored`,
        );

      // ---- frame geometry (the 9-slice half) --------------------------------
      // Thickness is NOT here: decoration.css takes it from the role's own
      // --frame-clear-* dial (user-ruled 2026-08-08). These three say which
      // part of the image is the border and how it behaves along the edges.
      if (!isFrameSlot(id)) {
        for (const key of ["slice", "fill", "repeat", "outset"] as const)
          if (cfg[key] !== undefined)
            summary.warnings.push(`slot "${id}": "${key}" is a frame-only key — ignored`);
        continue;
      }

      if (cfg.slice !== undefined) {
        const slice = parseSlice(cfg.slice);
        if (slice === null) {
          summary.warnings.push(
            `slot "${id}": "slice" must be a number or [t,r,b,l] of non-negative numbers — the frame will not paint`,
          );
        } else {
          publish(`--deco-${id}-slice`, cfg.fill === true ? `${slice} fill` : slice);
        }
      } else if (assetPublished) {
        // The `deco-1` signature: border-image-slice's initial 100% crushes the
        // whole image into the corners and paints nothing legible. Silence here
        // would look exactly like "the theme drew nothing", so say it.
        summary.warnings.push(
          `slot "${id}": asset published with no "slice" — a 9-slice frame needs one, so nothing will paint`,
        );
      }

      if (cfg.repeat !== undefined) {
        if (typeof cfg.repeat === "string" && REPEATS.has(cfg.repeat))
          publish(`--deco-${id}-repeat`, cfg.repeat);
        else
          summary.warnings.push(
            `slot "${id}": "repeat" must be one of ${[...REPEATS].join(" | ")} — ignored`,
          );
      }

      if (cfg.outset !== undefined) {
        const v = Number(cfg.outset);
        if (Number.isFinite(v) && v >= 0) publish(`--deco-${id}-outset`, `${v}px`);
        else summary.warnings.push(`slot "${id}": "outset" must be a non-negative number — ignored`);
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
