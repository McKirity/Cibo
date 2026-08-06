/**
 * THE MILESTONE THRESHOLD LADDERS (Build step 10, slice 4) — the editor the
 * 2026-07-26 amendment promised: "**Global here; per-habit overrides live on
 * the habit row**, exactly like the wave gap", editable "at step 10".
 *
 * It is deliberately ONE component with two mounts, because the two are the
 * same form: Settings → Tracking → Metrics edits the GLOBAL default, and the
 * habit editor edits an OVERRIDE of it. The override's own rule is the wave
 * gap's exactly — **absent means inherit**, so a subject the habit does not
 * override simply follows the global and shows it greyed.
 *
 * The shape is rules-as-data and is left as it was dictated: an optional
 * leading **steps** list, then **bands** of *every N until M*, a band with no
 * `until` running forever ("2/5/10, then intervals of 10, and from 100
 * intervals of 25"). Steps are edited as a comma list because that is how they
 * were spoken and how they read back; bands get a row each, since `every` and
 * `until` are two numbers with different jobs and a comma list would hide that.
 *
 * MILESTONES STAY DERIVED — only the RULES are data. Nothing here writes a
 * milestone; changing a ladder changes what re-derives from that moment on.
 */
import { useState } from "react";
import { Ico, ICONS } from "../shell/icons";
import { DEFAULT_LADDERS, type Ladder, type LadderOverrides, type LadderSubject } from "../daily/milestones";

const SUBJECTS: { key: LadderSubject; label: string; hint: string }[] = [
  { key: "days", label: "Days done", hint: "how many days you have logged this habit" },
  { key: "hours", label: "Habit hours", hint: "total hours across the habit" },
  { key: "entryHours", label: "Entry hours", hint: "hours on one game, book or project" },
  { key: "words", label: "Words", hint: "for habits that count words" },
  { key: "sessions", label: "Sessions", hint: "one running count across every habit" },
];

const num = (n: number): string => n.toLocaleString();

/** The ladder in the words it was dictated in — the row's read-only summary. */
export function ladderSummary(l: Ladder): string {
  const parts: string[] = [];
  if (l.steps != null && l.steps.length > 0) parts.push(l.steps.map(num).join(" · "));
  for (const b of l.bands) {
    parts.push(b.until != null ? `every ${num(b.every)} to ${num(b.until)}` : `every ${num(b.every)} after`);
  }
  return parts.join(" · ");
}

export function LadderEditor({
  value,
  onChange,
  /** Absent = the global editor; present = a habit's overrides of it. */
  overrideOf,
}: {
  value: LadderOverrides;
  onChange: (next: LadderOverrides) => void;
  overrideOf?: Record<LadderSubject, Ladder>;
}) {
  const base = overrideOf ?? DEFAULT_LADDERS;
  const [open, setOpen] = useState<LadderSubject | null>(null);

  const patch = (subject: LadderSubject, ladder: Ladder | null) => {
    const next = { ...value };
    if (ladder == null) delete next[subject];
    else next[subject] = ladder;
    onChange(next);
  };

  return (
    <div className="ladders">
      {SUBJECTS.map((s) => {
        const own = value[s.key];
        const effective = own ?? base[s.key];
        const inherited = own == null;
        const isOpen = open === s.key;
        return (
          <div className={`ladrow${isOpen ? " open" : ""}`} key={s.key}>
            <div className="ladhead">
              <button className="disc" onClick={() => setOpen(isOpen ? null : s.key)}>
                <Ico d={ICONS.chevronRight} />
              </button>
              <span className="ladmeta">
                <span className="ladname">{s.label}</span>
                <span className={`ladsum${inherited ? " inherit" : ""}`}>{ladderSummary(effective)}</span>
              </span>
              {overrideOf != null && (
                <span className="ladtag">
                  {inherited ? (
                    <button
                      className="btn-plain btn-sm"
                      onClick={() => patch(s.key, { ...effective, bands: [...effective.bands] })}
                    >
                      Override
                    </button>
                  ) : (
                    <button className="btn-plain btn-sm" onClick={() => patch(s.key, null)}>
                      Follow global
                    </button>
                  )}
                </span>
              )}
            </div>
            {isOpen && (!inherited || overrideOf == null) && (
              <OneLadder ladder={effective} onChange={(l) => patch(s.key, l)} hint={s.hint} />
            )}
            {isOpen && inherited && overrideOf != null && (
              <p className="vnote ladnote">
                Following the global ladder. Press <strong>Override</strong> to give this habit its
                own.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OneLadder({
  ladder,
  onChange,
  hint,
}: {
  ladder: Ladder;
  onChange: (l: Ladder) => void;
  hint: string;
}) {
  const [stepText, setStepText] = useState((ladder.steps ?? []).join(", "));

  const commitSteps = () => {
    const steps = stepText
      .split(",")
      .map((s) => Number(s.trim().replace(/[, ]/g, "")))
      .filter((n) => Number.isFinite(n) && n > 0);
    onChange({ ...ladder, steps: steps.length > 0 ? steps : undefined });
    setStepText(steps.join(", "));
  };

  const setBand = (i: number, p: Partial<{ every: number; until?: number }>) =>
    onChange({ ...ladder, bands: ladder.bands.map((b, j) => (j === i ? { ...b, ...p } : b)) });

  return (
    <div className="ladbody">
      <p className="vnote">{hint}</p>
      <div className="ladfield">
        <span className="sglbl">First milestones</span>
        <input
          className="keyin wide"
          value={stepText}
          spellCheck={false}
          placeholder="e.g. 2, 5, 10 — leave blank for none"
          onChange={(e) => setStepText(e.target.value)}
          onBlur={commitSteps}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitSteps();
          }}
        />
      </div>
      <div className="ladfield">
        <span className="sglbl">Then</span>
        {ladder.bands.map((b, i) => (
          <div className="ladband" key={i}>
            <span className="rword">every</span>
            <input
              className="keyin num"
              value={String(b.every)}
              inputMode="numeric"
              onChange={(e) => {
                const n = Number(e.target.value.replace(/[, ]/g, ""));
                if (Number.isFinite(n)) setBand(i, { every: n });
              }}
            />
            {b.until != null ? (
              <>
                <span className="rword">until</span>
                <input
                  className="keyin num"
                  value={String(b.until)}
                  inputMode="numeric"
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[, ]/g, ""));
                    if (Number.isFinite(n)) setBand(i, { until: n });
                  }}
                />
                <button
                  className="iconbtn"
                  data-tip="Run forever"
                  onClick={() => setBand(i, { until: undefined })}
                >
                  <Ico d={["M5 12h14"]} />
                </button>
              </>
            ) : (
              <>
                <span className="rword">from then on</span>
                <button
                  className="iconbtn"
                  data-tip="Stop at a number"
                  onClick={() => setBand(i, { until: b.every * 10 })}
                >
                  <Ico d={ICONS.plus} />
                </button>
              </>
            )}
            {ladder.bands.length > 1 && (
              <button
                className="iconbtn danger"
                data-tip="Remove"
                onClick={() => onChange({ ...ladder, bands: ladder.bands.filter((_, j) => j !== i) })}
              >
                <Ico d={ICONS.trash} />
              </button>
            )}
          </div>
        ))}
        <button
          className="medadd"
          onClick={() => {
            // A new band continues where the last bounded one stopped; the
            // previous unbounded band has to gain an `until` or the new one
            // could never be reached.
            const last = ladder.bands[ladder.bands.length - 1];
            const bands = [...ladder.bands];
            if (last != null && last.until == null)
              bands[bands.length - 1] = { ...last, until: last.every * 10 };
            bands.push({ every: (last?.every ?? 10) * 2 });
            onChange({ ...ladder, bands });
          }}
        >
          <Ico d={ICONS.plus} /> Add a band
        </button>
      </div>
    </div>
  );
}
