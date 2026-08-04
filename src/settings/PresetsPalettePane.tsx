/**
 * SETTINGS → PRESETS and SETTINGS → PALETTE (Build step 10, slice 4).
 *
 * PRESETS — "created/saved inline on each surface; managed here (rename /
 * delete / inspect, rows are doors)". Two rosters over one mechanism:
 * Comparing Statistics (`cs_preset:`) and Advanced Search (`as_preset:`, the
 * ruled mirror). The Manage door those surfaces already draw has been inert
 * since step 6 — this is what it was waiting for.
 *
 * INSPECT is the row's own expansion rather than a trip to the surface: a
 * preset stores a partial config verbatim, so what a user needs is to see
 * WHAT IT PINS before deciding to delete it. It reads the stored keys back in
 * plain words; it does not re-render the query workspace.
 *
 * PALETTE — the per-action enable/disable toggles for the pinned ten-verb
 * inventory. **Disabling HIDES, never deletes** ([[Palette]]), so a re-enabled
 * verb returns unchanged. Verbs whose step has not landed are shown but locked
 * off: curating something that cannot run yet would be a promise the app can't
 * keep. The store is settings/curation.ts (synced — a curation encodes
 * preference).
 */
import { useState } from "react";
import { useQuery } from "@evolu/react";
import { Ico } from "../shell/icons";
import { deletePreset, renamePreset, usePresets, type Preset } from "../compare/presets";
import { PALETTE_VERBS } from "../palette/verbs";
import { hiddenFrom, paletteOffQuery, setVerbEnabled } from "./curation";

// ── Presets ──────────────────────────────────────────────────────────────────

export function PresetsPane() {
  const cs = usePresets("cs_preset:");
  const as = usePresets("as_preset:");
  return (
    <div className="hscroll">
      <PresetGroup title="Comparing Statistics" rows={cs} empty="Saved from the Comparing Statistics workspace." />
      <PresetGroup title="Advanced Search" rows={as} empty="Saved from Advanced Search." />
    </div>
  );
}

function PresetGroup({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: Preset<unknown>[];
  empty: string;
}) {
  return (
    <div className="hgroup">
      <p className="hglbl">
        {title}
        <span className="runline">
          {rows.length} preset{rows.length === 1 ? "" : "s"}
        </span>
      </p>
      {rows.length === 0 ? (
        <p className="vnote">{empty}</p>
      ) : (
        <div className="mlist">
          {rows.map((p) => (
            <PresetRow key={p.id} preset={p} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The stored config in plain words — what this preset actually pins. */
function describe(cfg: unknown): string[] {
  if (cfg == null || typeof cfg !== "object") return [];
  const c = cfg as Record<string, unknown>;
  const out: string[] = [];
  if (Array.isArray(c.scopes) && c.scopes.length > 0) {
    const names = (c.scopes as { habitKey?: string; split?: unknown }[])
      .map((s) => s.habitKey ?? "?")
      .join(" · ");
    const split = (c.scopes as { split?: { field?: string } | null }[]).find((s) => s.split != null);
    out.push(`Habits: ${names}${split?.split?.field != null ? ` (split by ${split.split.field})` : ""}`);
  }
  if (c.measure != null && typeof c.measure === "object") {
    const m = c.measure as Record<string, unknown>;
    out.push(`Measure: ${[m.column, m.family, m.stat].filter(Boolean).join(" · ")}`);
  }
  if (Array.isArray(c.windows) && c.windows.length > 0)
    out.push(`${c.windows.length} time window${c.windows.length === 1 ? "" : "s"}`);
  if (typeof c.chart === "string") out.push(`Chart: ${c.chart}`);
  if (c.tiles === true) out.push("Stat tiles shown");
  // Advanced Search presets carry their own shape; anything unrecognised is
  // still worth reporting as present rather than silently dropped.
  for (const k of Object.keys(c)) {
    if (!["scopes", "measure", "windows", "chart", "tiles"].includes(k)) {
      const v = c[k];
      if (Array.isArray(v) && v.length > 0) out.push(`${k}: ${v.length}`);
      else if (typeof v === "string" && v !== "") out.push(`${k}: ${v}`);
    }
  }
  return out;
}

function PresetRow({ preset }: { preset: Preset<unknown> }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(preset.name);
  const lines = describe(preset.cfg);

  return (
    <div className="mitem">
      <div className="mrow">
        <button className="disc" data-tip="What it pins" onClick={() => setOpen((o) => !o)}>
          <Ico d={["m9 18 6-6-6-6"]} />
        </button>
        <span className="mid">
          {renaming ? (
            <input
              className="subadd-in wide"
              value={name}
              autoFocus
              spellCheck={false}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (name.trim() !== "") renamePreset(preset, name.trim());
                  setRenaming(false);
                } else if (e.key === "Escape") {
                  setName(preset.name);
                  setRenaming(false);
                }
              }}
              onBlur={() => {
                setName(preset.name);
                setRenaming(false);
              }}
            />
          ) : (
            <button className="mname" data-tip="Rename" onClick={() => setRenaming(true)}>
              {preset.name}
            </button>
          )}
        </span>
        <span className="macts">
          <button className="iconbtn danger" data-tip="Delete" onClick={() => deletePreset(preset)}>
            <Ico d={["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"]} />
          </button>
        </span>
      </div>
      {open && (
        <div className="msub">
          {lines.length === 0 ? (
            <span className="subnone">Pins nothing — an empty preset.</span>
          ) : (
            <div className="subchips">
              {lines.map((l, i) => (
                <span className="subchip" key={i}>
                  {l}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Palette ──────────────────────────────────────────────────────────────────

export function PalettePane() {
  const rows = useQuery(paletteOffQuery);
  const hidden = hiddenFrom(rows);
  return (
    <div className="hscroll">
      <div className="ctrlstack">
        {PALETTE_VERBS.map((v) => {
          const on = !hidden.has(v.id);
          return (
            <div className="crow two" key={v.id}>
              <span className="clabel">
                {v.title}
                {!v.live && <span className="mgtag">not built yet</span>}
              </span>
              <span className="cright">
                <div className="segctl">
                  <button
                    aria-pressed={on && v.live}
                    disabled={!v.live}
                    onClick={() => setVerbEnabled(rows, hidden, v.id, true)}
                  >
                    On
                  </button>
                  <button
                    aria-pressed={!on || !v.live}
                    disabled={!v.live}
                    onClick={() => setVerbEnabled(rows, hidden, v.id, false)}
                  >
                    Off
                  </button>
                </div>
              </span>
            </div>
          );
        })}
      </div>
      <p className="vnote foot">
        Turning one off hides it from the command palette. Nothing is deleted, and the actions
        themselves keep working wherever else they live.
      </p>
    </div>
  );
}
