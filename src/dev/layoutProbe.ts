/**
 * THE LAYOUT PROBE — a DEV-ONLY measuring tool (born 2026-08-18, the Mac
 * visual pass).
 *
 * WHY IT EXISTS. This app is drawn once and rendered by two engines, and the
 * sitting that produced it is the evidence that the differences are *findable
 * by measurement and almost impossible to find by reading*: a `5ch` box holding
 * five characters, a minute column 7px narrow because `border-box` ate its
 * padding, calendar cells pinned to a `min-height` floor because WebKit and
 * Blink resolve `aspect-ratio` inside a stretched grid row in opposite
 * directions. Every one was invisible in the CSS and obvious in the boxes. The
 * codebase's own standing lesson says as much — *when a layout prediction is
 * wrong twice, instrument it* — and this is that instrument, made permanent
 * rather than rebuilt ad hoc each time.
 *
 * WHAT IT IS NOT. It reports mechanical facts about boxes. It has no opinion on
 * whether a screen looks good, and it cannot see what is not currently rendered.
 *
 * ⚠ DEV ONLY, BY CONSTRUCTION. bootstrap.tsx imports it behind
 * `import.meta.env.DEV` and dynamically, so it is verifiably absent from a
 * production bundle — the shape `seedRich` uses, for the same reason: a dev tool
 * that CAN ship is a dev tool that WILL.
 */

/** One thing worth a human's attention. */
export interface Finding {
  rule: "CLIP" | "OVERFLOW" | "TIGHT" | "WRAP" | "FLOOR" | "VIEWPORT" | "INPUT";
  where: string;
  detail: string;
  /** Sort key — bigger is worse, in CSS px of wrongness. */
  amount: number;
  /**
   * Where it is on screen, in CSS px. Carried so a reader can go straight to
   * the pixels — the whole loop this tool serves is report → look → fix, and
   * hunting for a named element in a screenshot was costing more than the
   * measurement saved.
   */
  rect: { x: number; y: number; w: number; h: number };
}

/** A short, readable path: enough to find the element, not a full ancestry. */
function pathOf(el: Element): string {
  const step = (e: Element): string => {
    const cls = (e.getAttribute("class") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((c) => `.${c}`)
      .join("");
    return e.tagName.toLowerCase() + cls;
  };
  const parts: string[] = [step(el)];
  let p = el.parentElement;
  for (let i = 0; i < 3 && p != null && p !== document.body; i++) {
    parts.unshift(step(p));
    p = p.parentElement;
  }
  return parts.join(" > ");
}

const px = (n: number): number => Math.round(n * 10) / 10;

/**
 * Is this element's overflow CONTAINED by something above it?
 *
 * ⚠ THE PROBE'S THIRD CALIBRATION (2026-08-18, from its first full sweep):
 * the loudest findings in that run were a span "spilling 1655px" and a cover
 * "1661px past the viewport" — both sitting inside horizontally scrolling
 * containers, where spilling is the entire point and nothing is visible. A rule
 * that only consults the IMMEDIATE parent cannot see that, and a report whose
 * top entries are all false is a report nobody will read twice.
 */
function containedAbove(el: Element): boolean {
  let p = el.parentElement;
  while (p != null && p !== document.body) {
    // ⚠ X AXIS ONLY. The first cut tested both and silently deleted every
    // TIGHT finding in the app: `.rail` is `overflow: hidden auto`, so a
    // vertical scroller was suppressing horizontal reports beneath it.
    if (getComputedStyle(p).overflowX !== "visible") return true;
    p = p.parentElement;
  }
  return false;
}

/** The element's box in CSS px, rounded — enough to crop a screenshot by. */
const rectOf = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { x: px(r.left), y: px(r.top), w: px(r.width), h: px(r.height) };
};

/**
 * Text being cut off. `scrollWidth > clientWidth` is the honest test — it is
 * what "the time gets cut off" looked like from the DOM's side, and it catches
 * the ellipsis case and the hard-clip case alike.
 *
 * ⚠ Only for elements that actually clip: a scroll container legitimately holds
 * more than its box, so `overflow: auto` is EXCLUDED or the report is nothing
 * but false positives.
 */
function clipRule(el: HTMLElement, cs: CSSStyleDeclaration, out: Finding[]): void {
  const clips =
    cs.overflowX === "hidden" || cs.overflowX === "clip" || cs.textOverflow === "ellipsis";
  if (!clips) return;
  const over = el.scrollWidth - el.clientWidth;
  // ⚠ `text-overflow: ellipsis` is a DECISION, not a defect — the author chose
  // truncation. Only report it when the cut is severe enough that the reading
  // is destroyed rather than shortened (the countdown name showing "B.." is
  // 70% gone; a creator line losing 9px of 163 is working as designed).
  // ⚠ CLIP IS ABOUT A TEXT BOX, NOT A COMPOSED ONE (2026-08-18, fourth
  // calibration). It fired on the weather plot — `overflow: hidden`, 20px of
  // scrollWidth over — and the picture was CORRECT: an svg, a veil, a marker
  // and a label all drawn to the field's edge, with the clip doing its job of
  // holding them inside the rounded corners. Nothing was cut that should not
  // be. A container full of positioned children is the OVERFLOW rules' business;
  // this rule only speaks for elements whose own text is the thing overflowing.
  if (el.children.length > 0 && cs.textOverflow !== "ellipsis" && cs.whiteSpace !== "nowrap") return;
  const designed = cs.textOverflow === "ellipsis";
  const ratio = el.clientWidth > 0 ? el.scrollWidth / el.clientWidth : 1;
  // ⚠ EIGHTH CALIBRATION (2026-08-19): A REPEATED-GLYPH QUANTITY IS NOT PROSE,
  // AND THE SEVERITY RATIO ABOVE IS A PROSE TEST. It suppresses a designed
  // ellipsis until the cut "destroys the reading" — right for a creator line,
  // which merely gets shorter, and WRONG for a run of identical glyphs, where
  // every glyph IS the datum. Found in the bulk-edit picker: a FIVE-star rating
  // rendering `★★★★…`, i.e. reading as FOUR. Ratio 1.1, so the rule threw it
  // away. Nothing was shortened there — the value was changed.
  //
  // The tell is the alphabet: a star run, a pip row, a dot meter all draw from
  // one or two distinct characters, where prose never does. Such a run is
  // reported at ANY overflow, and the app's own law is the reason
  // ("whole-star ratings app-wide — ★★★★, never '★ 4'": if the stars are the
  // number, a missing star is a wrong number).
  const glyphs = (el.textContent ?? "").replace(/\s|…/g, "");
  const isQuantityRun = glyphs.length >= 3 && new Set(glyphs).size <= 2;
  if (designed && ratio < 1.6 && !isQuantityRun) return;
  if (over > 1 && (el.textContent ?? "").trim() !== "") {
    out.push({
      rule: "CLIP",
      where: pathOf(el),
      // ⚠ NAME THE CULPRIT. `scrollWidth` says a box is overflowing; it does not
      // say BY WHAT, and on a composed card (the weather plot: svg, veil, dot,
      // label, axis) the difference between those is the difference between a
      // five-minute fix and an afternoon of reading CSS. Added 2026-08-18 after
      // exactly that afternoon started.
      detail:
        `text needs ${el.scrollWidth}px in a ${el.clientWidth}px box — ${px(over)}px cut off` +
        (worstChild(el) ?? ""),
      amount: over,
      rect: rectOf(el),
    });
  }
}

/**
 * A child escaping its parent, in TWO grades — and the distinction is the
 * probe's first calibration lesson (2026-08-18, its very first real report).
 *
 * The initial rule measured against the parent's CONTENT box and duly flagged
 * the rail's habit names as spilling 12.3px. They were not: `.entry`'s padding
 * is 16px, so the name was eating its padding and still sitting 3.7px inside
 * the visible card. Reported as breakage, it was a false positive.
 *
 * ⚠ BUT IT IS NOT NOTHING, and in THIS app it is specifically not nothing: that
 * padding is `calc(var(--frame-clear-hcard) + var(--space-4))`, and the frame
 * clearance half is **space reserved for a theme's decoration frame to paint
 * in**. Text intruding into it means a themed frame would collide with the
 * words — a latent defect that only appears once a decoration set ships, i.e.
 * exactly the kind that gets found far too late.
 *
 * So: OVERFLOW = past the visible edge, a defect now. TIGHT = inside the edge
 * but deep into reserved padding, a defect waiting for a theme.
 */
function overflowRule(el: HTMLElement, cs: CSSStyleDeclaration, out: Finding[]): void {
  const parent = el.parentElement;
  if (parent == null || parent === document.body) return;
  const pcs = getComputedStyle(parent);
  if (pcs.overflowX !== "visible" || pcs.overflowY !== "visible") return;
  if (cs.position === "absolute" || cs.position === "fixed") return; // out of flow by design
  const r = el.getBoundingClientRect();
  const pr = parent.getBoundingClientRect();
  if (r.width === 0) return;

  const past = r.right - pr.right;
  // ⚠ Containment gates OVERFLOW only. TIGHT is about a RESERVED gutter being
  // eaten — the decoration frame's clearance — which stays true whether or not
  // something above happens to clip the spill.
  if (past > 1.5 && !containedAbove(el)) {
    out.push({
      rule: "OVERFLOW",
      where: pathOf(el),
      detail: `spills ${px(past)}px past its parent's VISIBLE edge`,
      amount: past + 100, // outranks every tightness report
      rect: rectOf(el),
    });
    return;
  }
  // ⚠ ≥8px, BECAUSE THAT IS THE SMALLEST FRAME CLEARANCE IN THE CORPUS (habit
   // card 8 · tile 16 · panel 24 · modal 28). Below it, padding is just padding:
   // the Map's twist is a 16px chevron centred in a 22px button, and "eats 3px
   // of 6" describes an icon in a button, not a gutter being spent. The rule
   // exists to protect the room a decoration frame paints in, so it should only
   // speak where that room plausibly is.
  const pad = parseFloat(pcs.paddingRight);
  if (pad >= 8) {
    const intrusion = r.right - (pr.right - pad);
    // over half the reserved gutter eaten — below that it is just a snug fit
    if (intrusion > pad * 0.5) {
      out.push({
        rule: "TIGHT",
        where: pathOf(el),
        detail: `eats ${px(intrusion)}px of its parent's ${px(pad)}px right padding`,
        amount: intrusion,
        rect: rectOf(el),
      });
    }
  }
}

/**
 * THE WIDOW TEST. A wrapping flex row is usually intentional, so reporting every
 * wrap is noise. What is almost never intentional is ONE item alone on a second
 * line — the shape the KIND row and the CS refine labels both took.
 */
function wrapRule(el: HTMLElement, cs: CSSStyleDeclaration, out: Finding[]): void {
  if (cs.display !== "flex" || cs.flexWrap !== "wrap") return;
  const kids = Array.from(el.children) as HTMLElement[];
  if (kids.length < 3) return;
  // ⚠ LINES ARE FOUND BY CENTRE, NOT BY `top` (2026-08-18, fifth calibration).
  // The first cut bucketed on `top` and reported the library toolbar as wrapped
  // when all seven filters sat on one line: a checkbox is shorter than a select
  // chip, `align-items: center` gives them different tops, and every mixed-height
  // row in the app read as a wrap. Centres cluster correctly under any
  // alignment; the tolerance absorbs sub-pixel and baseline jitter.
  const centres = kids.map((k) => {
    const r = k.getBoundingClientRect();
    return r.top + r.height / 2;
  });
  const lines: number[] = [];
  for (const c of centres) {
    if (!lines.some((l) => Math.abs(l - c) < 12)) lines.push(c);
  }
  lines.sort((a, b) => a - b);
  if (lines.length !== 2) return;
  const onSecond = centres.filter((c) => Math.abs(c - lines[1]) < 12).length;
  // ⚠ A FULL-WIDTH ITEM ON ITS OWN LINE IS A DESIGN, NOT A WIDOW (sixth
  // calibration, 2026-08-18 — caught flagging a fix made the same hour). The
  // countdown card deliberately gives `.cdmeta` its own row (`flex: 1 0 100%`),
  // and "one item alone on line two" describes that perfectly. The tell is
  // width: a stranded chip is narrow, a deliberate row fills the container.
  const lone = kids[centres.findIndex((c) => Math.abs(c - lines[1]) < 12)];
  const fills = lone != null &&
    lone.getBoundingClientRect().width > el.getBoundingClientRect().width * 0.9;
  // ⚠ TENTH CALIBRATION (2026-08-19): TWO CLUSTERS OF CENTRES ARE NOT TWO LINES
  // IF THEY OVERLAP VERTICALLY. Reported `.cp-month` — the custom month window
  // — as wrapped when nothing had: its three children are two label-over-chip
  // COLUMNS and a bare `→` glyph, and the glyph sits centred on the chip row
  // while the columns' centres include their labels, so the two centres fall
  // ~14px apart on ONE line. The fifth calibration moved line-finding from
  // `top` to CENTRE to survive `align-items: center`; this is the case centres
  // alone cannot judge, and the honest test is geometric: real lines do not
  // occupy the same vertical band. Cheap, and it cannot suppress a true wrap —
  // wrapped lines are disjoint by construction.
  const bandOf = (line: number) => {
    const members = kids.filter((_, i) => Math.abs(centres[i] - line) < 12).map((k) => k.getBoundingClientRect());
    return { top: Math.min(...members.map((r) => r.top)), bottom: Math.max(...members.map((r) => r.bottom)) };
  };
  const a = bandOf(lines[0]);
  const b = bandOf(lines[1]);
  if (a.bottom > b.top + 1 && b.bottom > a.top + 1) return; // same band — one line
  if (onSecond === 1 && !fills) {
    out.push({
      rule: "WRAP",
      where: pathOf(el),
      detail: `${kids.length} items wrapped to 2 lines, 1 alone on the second`,
      amount: 20,
      rect: rectOf(el),
    });
  }
}

/**
 * An item sitting exactly on its own declared minimum inside a flex or grid
 * parent — the tier-2 defect family in its usual costume (`.subadd-in` at 183px
 * in a 54px track; `.inp.sel`'s 190; the calendar cell's 34). A floor is not a
 * width, and an item resting on one is an item whose track ran out.
 */
function floorRule(el: HTMLElement, cs: CSSStyleDeclaration, out: Finding[]): void {
  const parent = el.parentElement;
  if (parent == null) return;
  const pd = getComputedStyle(parent).display;
  if (!pd.includes("flex") && !pd.includes("grid")) return;
  const min = parseFloat(cs.minWidth);
  if (!Number.isFinite(min) || min <= 0) return;
  // ⚠ Resting on a min-width is only NEWS if the content is also being
  // squeezed. A pager button sized 34px with a 34px floor is simply a button;
  // the tier-2 defect is a floor that a track could not honour, and the tell is
  // content that no longer fits inside it.
  if (el.scrollWidth <= el.clientWidth + 1) return;
  if (Math.abs(el.getBoundingClientRect().width - min) < 0.75) {
    out.push({
      rule: "FLOOR",
      where: pathOf(el),
      detail: `resting on its min-width (${px(min)}px) — the track gave it nothing more`,
      amount: 15,
      rect: rectOf(el),
    });
  }
}

/**
 * TEXT INSIDE A FORM CONTROL — the rule the first twelve-pane sweep proved was
 * missing (2026-08-19, its seventh calibration and the first that adds a rule
 * rather than tuning one).
 *
 * ⚠ WHY THE OTHER RULES CANNOT SEE THIS. Every rule above reasons from
 * `scrollWidth > clientWidth`, and **an `<input>` does not report its overflow
 * that way in WebKit** — it scrolls its own text internally and answers
 * `scrollWidth === clientWidth` however much is hidden. So the app's entire
 * population of form fields was invisible to a tool built to find clipped text,
 * and it stayed invisible across a clean twelve-pane run: Settings reported
 * ZERO findings on the same pass where the Whimsy pane was rendering a
 * `-121.4944` longitude as `-121.` and the colour picker was spelling its own
 * `#RRGGBB` placeholder `#RRGGB`. Both were found by eye afterwards.
 *
 * That is the exact defect family this whole Mac pass exists for — a `ch`-sized
 * box that fits on Windows and does not fit here — so the instrument being
 * blind to it made every "0 findings" on a form-bearing screen worthless.
 *
 * HOW IT MEASURES: the text is drawn into a canvas with the element's own
 * resolved font and compared against the content box. No DOM is touched, so it
 * cannot disturb what it is measuring.
 *
 * ⚠ TWO GRADES, AND THE DISTINCTION IS THE CALIBRATION:
 *
 *   A PLACEHOLDER THAT DOES NOT FIT IS ALWAYS A DEFECT. It is the author's own
 *   instruction, written to fit the box they drew. When it clips, the box is
 *   too small — and worse, it now instructs wrongly: `#RRGGB` tells the user a
 *   hex is six digits. Reported loudly.
 *
 *   A VALUE THAT DOES NOT FIT IS ORDINARY UNLESS THE BOX IS FIXED. A long API
 *   key in a wide field scrolls by design and is nobody's bug. So a value is
 *   only reported when the field's width is a hard declaration (`ch`/`px`/`rem`
 *   — never a percentage or a flex-grown auto), which is precisely the shape
 *   that fits on one platform and clips on the other.
 *
 * ⚠ A FOCUSED FIELD IS EXCLUDED. It is being typed into, it has scrolled to the
 * caret on purpose, and reporting that is reporting the user.
 */
const textMetric = (() => {
  let ctx: CanvasRenderingContext2D | null = null;
  return (text: string, cs: CSSStyleDeclaration): number => {
    if (ctx == null) ctx = document.createElement("canvas").getContext("2d");
    if (ctx == null) return 0;
    // `cs.font` is empty in WebKit for elements whose font came from longhands,
    // so it is rebuilt rather than trusted.
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} / ${cs.lineHeight} ${cs.fontFamily}`;
    return ctx.measureText(text).width;
  };
})();

function inputRule(el: HTMLElement, cs: CSSStyleDeclaration, out: Finding[]): void {
  const tag = el.tagName.toLowerCase();
  // ⚠ NINTH CALIBRATION (2026-08-19) — TEXTAREAS ARE NOT SINGLE-LINE, AND THIS
  // RULE MEASURES ONE LINE. The first version accepted `<textarea>` and duly
  // reported the keepsake editor's snippet box as overflowing by hundreds of
  // pixels: `measureText` lays the whole multi-line snippet out as ONE run, so
  // the comparison is meaningless. The box wraps its code correctly and the
  // editor's own preview drew clean. A wrapping control cannot clip its text
  // horizontally by construction, so it has nothing to say here.
  if (tag !== "input") return;
  if (el === document.activeElement) return; // being typed into — scrolled on purpose
  const type = (el.getAttribute("type") ?? "text").toLowerCase();
  // Only controls that render a text run. A checkbox has no text; a password is
  // bullets whose width says nothing about the value.
  if (!["", "text", "search", "tel", "url", "email", "number"].includes(type)) return;

  const value = (el as HTMLInputElement).value ?? "";
  const placeholder = el.getAttribute("placeholder") ?? "";
  const showingValue = value !== "";
  const text = showingValue ? value : placeholder;
  if (text.trim() === "") return;

  const room =
    el.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0");
  if (!Number.isFinite(room) || room <= 0) return;
  const ink = textMetric(text, cs);
  // 1px of grace for the caret column WebKit keeps at the trailing edge.
  const over = ink - room - 1;
  if (over <= 0) return;

  // ⚠ THE DISCRIMINATOR HAD TO BE MEASURED, NOT READ. The first cut tested
  // `/ch|px|rem/.test(cs.width)` for a "hard-declared" width — worthless, since
  // a COMPUTED width is always in px, so the test was true for every field and
  // silently disabled the calibration it was written to perform.
  //
  // What actually separates the two cases is whether the box was SIZED or
  // HANDED ITS SPACE: a field sized to its content sits well inside its parent
  // (the 8ch coordinate box in a wide row), while a field given what was left
  // fills it (the Nickname input). Measured, so it cannot lie.
  const parent = el.parentElement;
  const room_of_parent = parent == null ? 0 : parent.getBoundingClientRect().width;
  const sized = room_of_parent > 0 && el.getBoundingClientRect().width < room_of_parent * 0.9;
  if (showingValue && !sized) return;

  // How much is actually lost, in the unit a reader thinks in.
  const per = ink / text.length;
  const lost = Math.round(over / per);
  const shown = Math.max(0, text.length - lost);
  out.push({
    rule: "INPUT",
    where: pathOf(el),
    detail: showingValue
      ? `value "${text}" needs ${px(ink)}px in a ${px(room)}px content box — about ${lost} of ${text.length} characters hidden (showing "${text.slice(0, shown)}")`
      : `PLACEHOLDER "${text}" does not fit its own box — ${px(ink)}px of text in ${px(room)}px, reading "${text.slice(0, shown)}"`,
    // A clipped placeholder outranks every tightness report but stays below a
    // visible spill, the same ordering OVERFLOW already uses.
    amount: showingValue ? over : over + 60,
    rect: rectOf(el),
  });
}

/** Anything reaching past the window — the horizontal-scrollbar hunt. */
function viewportRule(el: HTMLElement, out: Finding[]): void {
  if (containedAbove(el)) return; // inside a scroller — reaching past is normal
  const r = el.getBoundingClientRect();
  if (r.width > 0 && r.right > window.innerWidth + 1) {
    out.push({
      rule: "VIEWPORT",
      where: pathOf(el),
      detail: `right edge at ${px(r.right)} against a ${window.innerWidth}px viewport`,
      amount: r.right - window.innerWidth,
      rect: rectOf(el),
    });
  }
}

/**
 * Which descendant reaches furthest past this element's content box — the
 * "by what" that `scrollWidth` alone withholds. Cheap because it only runs for
 * elements already known to be overflowing.
 */
function worstChild(el: HTMLElement): string | null {
  const r = el.getBoundingClientRect();
  const right = r.left + el.clientWidth;
  let worst: { el: Element; past: number } | null = null;
  for (const d of el.querySelectorAll("*")) {
    const dr = d.getBoundingClientRect();
    if (dr.width === 0) continue;
    const past = dr.right - right;
    if (past > 0.5 && (worst == null || past > worst.past)) worst = { el: d, past };
  }
  return worst == null ? null : ` — worst: ${pathOf(worst.el)} (+${px(worst.past)}px)`;
}

/** Walk what is on screen right now and classify it. */
export function runProbe(): Finding[] {
  const out: Finding[] = [];
  for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue; // not rendered — nothing to say
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden") continue;
    // ⚠ SCREEN-READER-ONLY TEXT IS A CLIPPED 1px BOX ON PURPOSE (`.kit-sr`,
    // kit.css) — a sighted-layout probe reads that as catastrophic clipping and
    // reported three of them in its very first pass. Tested by SHAPE rather
    // than by class name, so any future sr-only utility is excluded for free
    // and a genuinely 1px-wide visible box is still caught by other rules.
    if (r.width <= 1 || r.height <= 1) continue;
    clipRule(el, cs, out);
    overflowRule(el, cs, out);
    wrapRule(el, cs, out);
    floorRule(el, cs, out);
    inputRule(el, cs, out);
    viewportRule(el, out);
  }
  const seen = new Set<string>();
  return out
    .filter((f) => {
      const k = `${f.rule}|${f.where}|${f.detail}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Ship the report out of the webview. The Vite dev server owns `/__probe`
 * (vite.config.ts) and writes it to `.probe/latest.json`.
 *
 * ⚠ THE CHANNEL NEEDS NO PERMISSION CHANGE, which is why it is this one: in dev
 * the app IS `localhost:1420`, so `connect-src 'self'` already allows the POST.
 * A Tauri fs write would have needed a capability entry and a full Rust rebuild
 * (the standing capability lesson) for a strictly worse result.
 */
export async function sendProbe(label: string): Promise<void> {
  const findings = runProbe();
  console.info(`probe: ${findings.length} findings on "${label}"`, findings);
  try {
    await fetch("/__probe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label,
        at: new Date().toISOString(),
        canvas: { w: window.innerWidth, h: window.innerHeight },
        root: document.documentElement.className,
        findings,
      }),
    });
  } catch (e) {
    console.warn("probe: could not reach the dev server", e);
  }
}

/**
 * Ctrl/Cmd+Shift+L runs a pass — free on both platforms and outside the app's
 * ruled four-hotkey set, which this must not disturb.
 */
export function installProbe(): void {
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "L" || e.key === "l")) {
      e.preventDefault();
      // The document title is the scaffold's ("Tauri + React + Typescript") —
      // the app draws its own titlebar, so the useful name is in the DOM.
      const t = document.querySelector(".tb .title")?.textContent?.trim();
      void sendProbe(t != null && t !== "" ? t : "screen");
    }
  });
  console.info("probe: installed — Ctrl/Cmd+Shift+L runs a pass");
}
