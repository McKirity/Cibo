/**
 * THE KEEPSAKE PASTE SLOT (Build step 10, slice 2) — the ONE talkative surface
 * in the keepsake pipeline ([[Habit Artwork & Assets]] § Amended 2026-07-26:
 * "fail-to-fallback is scoped to RENDERING, so the paste slot can preview and
 * name reasons"; [[Habit Creator]] § Amended carries the slot anatomy).
 *
 * Ruled behaviour, all three: PRE-FILLED with the stored snippet (copy-and-
 * modify is the real authoring route) · a LIVE PREVIEW off the habit's real
 * data · NAMED rejection reasons. The renderer is the wall's own
 * (daily/keepsake.ts + KeepsakeTile) — same substitute → sanitize → shadow
 * root path, so the preview IS the wall's verdict, not an approximation.
 *
 * Preview data: the habit's most recent logged day (sessions + categoricals +
 * stored true flags), queried one-shot at open. Derived-rule flags are NOT
 * evaluated here — the wall computes them in wallSpec and the preview's job
 * is the snippet, not the rule engine; a snippet keyed on a derived flag
 * previews as that flag unset. Format contract: [[Dev Manual Content]]
 * § Keepsake tile format (ships in § Help, slice 6).
 */
import { useEffect, useMemo, useState } from "react";
import { evolu } from "../db/evolu";
import { KEEPSAKE_SEEDS } from "../db/keepsakeSeeds";
import { keepsakeValues, renderSnippet, type KeepsakeInput } from "../daily/keepsake";
import { KeepsakeTile } from "../daily/KeepsakeTile";
import { todayLocal } from "../metrics/clock";
import { useOverlayEsc } from "../shell/overlayHooks";
import { showErrorToast } from "../shell/toast";

interface PreviewData {
  day: string;
  rows: KeepsakeInput["rows"];
  cats: Record<string, string>;
  flags: string[];
}

export function KeepsakeEditor({
  habitId,
  habitKey,
  habitName,
  colourSlot,
  measuresTime,
  measuresCount,
  countUnit,
  stored,
  onClose,
}: {
  habitId: string;
  /** The habit `key` — how a canonical habit finds its supplied tile. */
  habitKey: string | null;
  habitName: string;
  colourSlot: string;
  measuresTime: boolean;
  measuresCount: boolean;
  countUnit: string | null;
  stored: string | null;
  onClose: () => void;
}) {
  useOverlayEsc(onClose);
  const [text, setText] = useState(stored ?? "");
  const [data, setData] = useState<PreviewData | null>(null);

  // "Restore original tile" (user-ruled 2026-08-04, closing the 2026-07-26
  // "still unruled — the revert control" flag): the six canonical habits'
  // supplied tiles are baked into the app (keepsakeSeeds), so restore is a
  // copy back into the TEXTAREA — previewable, and only Save commits it.
  const original = useMemo(
    () => (habitKey != null ? (KEEPSAKE_SEEDS.find((s) => s.key === habitKey)?.snippet ?? null) : null),
    [habitKey],
  );

  // One-shot: the habit's most recent logged day, with its categoricals and
  // stored true flags. Not a live query — the editor is a paste surface.
  useEffect(() => {
    let dead = false;
    void (async () => {
      const sessions = await evolu.loadQuery(
        evolu.createQuery((db) =>
          db
            .selectFrom("sessions")
            .select(["id", "day", "measure_kind", "value", "start", "end"])
            .where("habit_fk", "=", habitId as never)
            .where("isDeleted", "is not", 1)
            .orderBy("day", "desc")
            .limit(30),
        ),
      );
      const lastDay = sessions[0]?.day != null ? String(sessions[0].day) : null;
      const dayRows = sessions.filter((s) => s.day === lastDay);
      const ids = dayRows.map((s) => s.id);

      const cats: Record<string, string> = {};
      const flags: string[] = [];
      if (ids.length > 0) {
        const defs = await evolu.loadQuery(
          evolu.createQuery((db) =>
            db
              .selectFrom("subunit_definitions")
              .select(["id", "key", "label", "data_type"])
              .where("habit_fk", "=", habitId as never)
              .where("isDeleted", "is not", 1),
          ),
        );
        const values = await evolu.loadQuery(
          evolu.createQuery((db) =>
            db
              .selectFrom("subunit_values")
              .select(["session_fk", "definition_fk", "value"])
              .where("session_fk", "in", ids as never)
              .where("isDeleted", "is not", 1),
          ),
        );
        for (const v of values) {
          const def = defs.find((d) => d.id === v.definition_fk);
          if (def == null) continue;
          if (String(def.data_type) === "flag") {
            if (String(v.value) === "true") flags.push(String(def.label));
          } else {
            cats[String(def.key)] = String(v.value); // later bouts win — insertion order
          }
        }
      }
      if (!dead && lastDay != null) {
        setData({
          day: lastDay,
          rows: dayRows.map((r) => ({
            measure_kind: r.measure_kind as "time" | "count" | "range" | "none",
            value: r.value as number | null,
            start: r.start as string | null,
            end: r.end as string | null,
          })),
          cats,
          flags,
        });
      } else if (!dead) {
        setData({ day: todayLocal(), rows: [], cats: {}, flags: [] });
      }
    })();
    return () => {
      dead = true;
    };
  }, [habitId]);

  const values = useMemo(() => {
    if (data == null) return null;
    return keepsakeValues({
      name: habitName,
      colourSlot,
      day: data.day,
      measuresTime,
      measuresCount,
      countUnit,
      rows: data.rows,
      cats: data.cats,
      flags: data.flags,
    });
  }, [data, habitName, colourSlot, measuresTime, measuresCount, countUnit]);

  // The named reasons — the renderer's own verdict, re-run on every keystroke.
  const verdict = useMemo(() => {
    if (values == null) return null;
    const t = text.trim();
    if (t === "") return { ok: false as const, reasons: ["The snippet is empty — the lettermark fallback will stand."] };
    const rendered = renderSnippet(text, values, document);
    if (rendered == null)
      return {
        ok: false as const,
        reasons: [
          "Nothing drawable survives — the snippet is unparseable, or sanitization removed everything. The wall will show the lettermark fallback.",
        ],
      };
    return {
      ok: true as const,
      reasons: rendered.removed.map((r) => `Removed by sanitization: ${r}`),
    };
  }, [text, values]);

  const save = () => {
    const t = text.trim();
    // The column is Evolu's unbranded String (unbounded by ruling — a 2 KB+
    // tile is legal); the seed writes it plain the same way.
    const res = evolu.update("habits", {
      id: habitId as never,
      keepsake_snippet: t === "" ? null : (t as never),
    });
    if (!res.ok) {
      console.error("keepsake: snippet write failed", res.error);
      showErrorToast("The snippet could not be saved.");
      return;
    }
    onClose();
  };

  return (
    <div className="dimlayer" onMouseDown={onClose} role="presentation">
      <div className="mo kseditor" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="mo-head">
          <div>
            <h3 className="mtitle">Keepsake Tile — {habitName}</h3>
            <p className="mo-sub">
              Code-drawn art for the cover wall. Paste an HTML/SVG tile snippet; placeholders like{" "}
              <span className="mono">{"{{value}}"}</span> · <span className="mono">{"{{duration}}"}</span> ·{" "}
              <span className="mono">{"{{cat:key}}"}</span> fill from the day. The format contract is the
              manual's "Keepsake tile format" article.
            </p>
          </div>
        </div>
        <div className="mo-body">
          <div className="ksed">
            <textarea
              className="kspaste"
              value={text}
              spellCheck={false}
              placeholder="Paste the tile snippet…"
              onChange={(e) => setText(e.target.value)}
            />
            <div className="ksside">
              <p className="sglbl">Live Preview{data != null && data.rows.length > 0 ? ` · ${data.day}` : " · no logged data yet"}</p>
              <div className="kprev">
                {values != null && (
                  <KeepsakeTile snippet={text.trim() === "" ? null : text} values={values} colourSlot={colourSlot} />
                )}
              </div>
              {verdict != null && (
                <div className={`ksreasons${verdict.ok && verdict.reasons.length === 0 ? " ok" : ""}`}>
                  {verdict.ok && verdict.reasons.length === 0 ? (
                    <span>Draws clean — nothing removed.</span>
                  ) : (
                    verdict.reasons.map((r, i) => <span key={i}>{r}</span>)
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mo-foot">
          <button className="btn-accent" onClick={save}>
            Save snippet
          </button>
          <button
            className="btn-plain"
            onClick={() => setText("")}
            disabled={text.trim() === ""}
            data-tip="Clear — the fallback tile stands"
          >
            Clear
          </button>
          {original != null && (
            <button
              className="btn-plain"
              onClick={() => setText(original)}
              disabled={text === original}
              data-tip="Fills the editor with the app's supplied tile — Save commits it"
            >
              Restore original tile
            </button>
          )}
          <button className="btn-plain" onClick={onClose} style={{ marginLeft: "auto" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
