/**
 * The plural helper (born 2026-08-19). Small, but it is the kind of thing that
 * gets "simplified" back into `n + "s"` by a later reader who does not know
 * about `entry/entries` — so the irregular noun is the first assertion.
 */
import { describe, it, expect } from "vitest";
import { nounFor, plural, stars } from "./format";

describe("plural", () => {
  it("agrees in number", () => {
    expect(plural(1, "entry", "entries")).toBe("1 entry");
    expect(plural(2, "entry", "entries")).toBe("2 entries");
  });

  it("takes the plural form rather than appending s — English does not honour that", () => {
    expect(plural(0, "entry", "entries")).toBe("0 entries");
    expect(plural(3, "image file", "image files")).toBe("3 image files");
  });

  it("treats ZERO as plural, which is what every call site wants", () => {
    // "0 files" reads correctly; "0 file" does not.
    expect(plural(0, "file", "files")).toBe("0 files");
  });

  it("nounFor gives the noun alone, for the sites that bold the count", () => {
    expect(nounFor(1, "session", "sessions")).toBe("session");
    expect(nounFor(4, "session", "sessions")).toBe("sessions");
  });
});

describe("stars", () => {
  it("draws N whole glyphs — the corpus law, never '★ 4'", () => {
    expect(stars(5)).toBe("★★★★★");
    expect(stars(1)).toBe("★");
  });
});
