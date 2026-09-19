/**
 * The bout-identity helpers behind ONE BLOCK PER IDENTITY PER DAY (user-ruled
 * 2026-09-18). The claims that matter: a draft and a stored bout describing the
 * same bout hash the same even though they hold their answers in different
 * shapes; a different title or a different picklist answer never merges; and
 * the reach test admits exactly the habits whose blocks carry summable
 * measures.
 */
import { describe, expect, it } from "vitest";
import {
  boutSignature,
  findMergeTarget,
  identityCats,
  mergesBouts,
  type SpineDefinition,
} from "./spineSpec";

const def = (key: string, data_type: SpineDefinition["data_type"]): SpineDefinition => ({
  id: `def-${key}`,
  key,
  label: key,
  data_type,
  vocab: [],
});

const coding = { categoricals: [def("language", "picklist")], flags: [] };
const flagged = { categoricals: [def("stage", "picklist")], flags: [def("late", "flag")] };

describe("identityCats + boutSignature", () => {
  it("a draft and a stored bout of the same bout hash the same", () => {
    // The draft holds its flag apart and an unanswered picklist as ""; the
    // stored bout has every flag written and no key for the blank picklist.
    const draft = boutSignature("e1", identityCats(flagged, { stage: "" }, { late: true }));
    const stored = boutSignature("e1", identityCats(flagged, { late: "true" }));
    expect(draft).toBe(stored);
  });

  it("a legacy bout missing its flag row reads as the flag unset", () => {
    const legacy = boutSignature("e1", identityCats(flagged, { stage: "draft" }));
    const explicit = boutSignature("e1", identityCats(flagged, { stage: "draft", late: "false" }));
    expect(legacy).toBe(explicit);
  });

  it("a different title or a different answer is a different identity", () => {
    const a = boutSignature("e1", identityCats(coding, { language: "rust" }));
    expect(boutSignature("e2", identityCats(coding, { language: "rust" }))).not.toBe(a);
    expect(boutSignature("e1", identityCats(coding, { language: "ts" }))).not.toBe(a);
  });

  it("answers outside the habit's declarations never count", () => {
    const a = boutSignature(null, identityCats(coding, { language: "rust" }));
    const b = boutSignature(null, identityCats(coding, { language: "rust", stray: "x" }));
    expect(a).toBe(b);
  });

  it("an entry-less, answer-less habit has ONE identity a day", () => {
    const drawing = { categoricals: [], flags: [] };
    expect(boutSignature(null, identityCats(drawing, {}))).toBe(
      boutSignature(null, identityCats(drawing, { anything: "at all" })),
    );
  });
});

describe("findMergeTarget", () => {
  it("returns the FIRST match — the oldest block absorbs, never a later twin", () => {
    const blocks = [
      { key: "a", sig: "x" },
      { key: "b", sig: "y" },
      { key: "c", sig: "x" },
    ];
    expect(findMergeTarget(blocks, (b) => b.sig, "x")?.key).toBe("a");
    expect(findMergeTarget(blocks, (b) => b.sig, "y")?.key).toBe("b");
  });

  it("is null for an identity new to the day", () => {
    expect(findMergeTarget([{ sig: "x" }], (b) => b.sig, "z")).toBeNull();
    expect(findMergeTarget([], (b: { sig: string }) => b.sig, "x")).toBeNull();
  });
});

describe("mergesBouts — the rule's reach", () => {
  const spec = (p: Partial<{ isRange: boolean; isMeasureless: boolean; derivesCount: boolean }>) => ({
    isRange: false,
    isMeasureless: false,
    derivesCount: false,
    ...p,
  });
  it("reaches project habits and every measured simple habit", () => {
    expect(mergesBouts(spec({}))).toBe(true);
  });
  it("leaves range, measureless and the derived board alone", () => {
    expect(mergesBouts(spec({ isRange: true }))).toBe(false);
    expect(mergesBouts(spec({ isMeasureless: true }))).toBe(false);
    expect(mergesBouts(spec({ derivesCount: true }))).toBe(false);
  });
});
