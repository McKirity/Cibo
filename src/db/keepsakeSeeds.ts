/**
 * THE SIX PRE-SEEDED KEEPSAKE SNIPPETS.
 *
 * Owning ruling: [[Habit Artwork & Assets]] § Amended 2026-07-26 —
 * "the canonical habits' tiles ship as PRE-SEEDED SNIPPET ROWS, which honours
 * the pasted-snippet ruling exactly (the definition *is* a snippet, synced,
 * editable) while giving a fresh install a real wall years before the paste
 * door is built" (the door is step 10).
 *
 * THESE ARE TRANSCRIBED, NOT AUTHORED. The master is the design project's
 * `Exhibit - Keepsake tile art.html` (group "Exhibits") — six arts at true wall
 * spans on the real dials, iterated and verified by the user 2026-07-26. It is
 * an authoring artifact and never freezes into `Final/`. The extraction recipe
 * is the handoff's, and it is mechanical:
 *
 *   · each art's own "SNIPPET N" CSS block moves INSIDE its root element as a
 *     `<style>`; every selector was already prefixed by the root class.
 *   · the baked sample data becomes the placeholder named in the adjacent
 *     comment.
 *   · the exhibit's page chrome (`:root` dials, `.wall`, `.tile`, `.legend`,
 *     the theme-toggle script) is NOT part of any snippet and dies there.
 *   · `@keyframes ks-walk-pulse` travels INSIDE Walking's own `<style>` (it is
 *     page-level in the exhibit, and a shadow root does not reach page scope).
 *
 * TWO EXTRACTION CALLS, recorded as implementation because the recipe did not
 * cover them:
 *
 *  1 · SLEEP'S SPAN BAR. The exhibit draws `.seg` with `left` + `width`, and
 *      width is the distance BETWEEN the two ends — which text-only
 *      substitution cannot compute. Drawn here as `left` + `right` instead, so
 *      it reads the two ruled placeholders directly and mints nothing:
 *      `left:{{range-start-pct}}%; right:calc(100% - {{range-end-pct}}%)`.
 *  2 · THE CAPS take `{{habit-name}}` rather than the baked word. A literal
 *      would go stale the moment a habit is renamed, and the token exists.
 *
 * The snippet never draws the tile shell — radius, shadow and border belong to
 * `kit-tile-keepsake`'s host. Each root is `position:absolute; inset:0`.
 */

export interface KeepsakeSeed {
  /** The habit `key` this tile belongs to. */
  key: string;
  snippet: string;
}

// ── 1 · SLEEP — range · habit-6 · 4×2 ────────────────────────────────────────
// The constellation night. The whimsy palette is night-coloured under EVERY
// theme, which is why this tile alone keeps its dark world on a light theme.
const SLEEP = `<div class="ks-sleep" data-flags="{{flags}}">
<style>
.ks-sleep {
  position: absolute; inset: 0; overflow: hidden;
  background: linear-gradient(180deg,
              var(--whimsy-ink) 0%,
              var(--whimsy-night) 52%,
              color-mix(in oklch, var(--whimsy-night), var(--habit-6) 46%) 100%);
  font-family: var(--font-ui);
}
.ks-sleep .field { position: absolute; inset: 0; }
.ks-sleep .star { position: absolute; border-radius: 50%; background: var(--whimsy-moon); }
.ks-sleep .con { position: absolute; inset: 0; width: 100%; height: 100%; }
.ks-sleep .con line { stroke: var(--whimsy-star); stroke-width: .32; opacity: .5; }
.ks-sleep .con circle { fill: var(--whimsy-star); }
.ks-sleep .moon {
  position: absolute; left: 78%; top: 24%; width: 46px; height: 46px;
  transform: translate(-50%, -50%);
}
.ks-sleep .moon i {
  position: absolute; inset: 0; border-radius: 50%; background: var(--whimsy-moon);
  box-shadow: 0 0 22px color-mix(in oklch, var(--whimsy-moon), transparent 55%),
              0 0 52px color-mix(in oklch, var(--habit-6), transparent 40%);
}
.ks-sleep .moon i + i {
  left: 26%; top: -14%; right: auto; bottom: auto; width: 100%; height: 100%;
  background: var(--whimsy-night); box-shadow: none;
}
.ks-sleep .body {
  position: absolute; inset: 0; z-index: 2;
  padding: var(--space-6) var(--space-7);
  display: flex; flex-direction: column; justify-content: space-between;
}
.ks-sleep .cap {
  font-family: var(--font-mono); font-size: var(--whimsy-size-caption);
  text-transform: uppercase; letter-spacing: .08em;
  color: color-mix(in oklch, var(--whimsy-moon), var(--whimsy-night) 42%);
}
.ks-sleep .flags { display: flex; gap: var(--space-3); }
.ks-sleep .flag {
  display: none;
  font-family: var(--font-mono); font-size: var(--whimsy-size-caption);
  padding: var(--space-1) var(--space-4); border-radius: var(--radius-full);
  background: color-mix(in oklch, var(--habit-6), var(--whimsy-night) 34%);
  color: var(--whimsy-moon);
}
.ks-sleep[data-flags~="8h"]   .flag-8h   { display: inline-block; }
.ks-sleep[data-flags~="noon"] .flag-noon { display: inline-block; }
.ks-sleep[data-flags~="med"]  .flag-med  { display: inline-block; }
.ks-sleep .top { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-6); }
.ks-sleep .dur {
  font-family: var(--font-heading); font-size: var(--whimsy-size-stat);
  font-weight: var(--weight-bold); letter-spacing: -.02em; line-height: 1;
  color: var(--whimsy-moon);
  text-shadow: 0 0 26px color-mix(in oklch, var(--habit-6), transparent 45%);
}
.ks-sleep .ends {
  display: flex; justify-content: space-between; align-items: flex-end;
  font-family: var(--font-mono); font-size: var(--whimsy-size-caption);
  color: color-mix(in oklch, var(--whimsy-moon), var(--whimsy-night) 46%);
  margin-bottom: var(--space-5);
}
.ks-sleep .ends b {
  display: block; font-size: var(--whimsy-size-subheading);
  font-weight: var(--weight-medium); color: var(--whimsy-moon); margin-top: var(--space-1);
}
.ks-sleep .span {
  position: relative; height: 5px; border-radius: var(--radius-full);
  background: color-mix(in oklch, var(--whimsy-moon), transparent 84%);
}
.ks-sleep .seg {
  position: absolute; top: 0; bottom: 0; border-radius: var(--radius-full);
  background: linear-gradient(90deg, var(--habit-6), var(--whimsy-moon));
  box-shadow: 0 0 14px color-mix(in oklch, var(--habit-6), transparent 30%);
}
.ks-sleep .pip {
  position: absolute; top: 50%; width: 8px; height: 8px; border-radius: 50%;
  background: var(--whimsy-moon); transform: translate(-50%, -50%);
}
</style>
<div class="field">
  <span class="star" style="left:7%;  top:17%; width:2px;   height:2px;   opacity:.55;"></span>
  <span class="star" style="left:14%; top:39%; width:2.4px; height:2.4px; opacity:.5;"></span>
  <span class="star" style="left:21%; top:25%; width:3px;   height:3px;   opacity:.7;"></span>
  <span class="star" style="left:29%; top:12%; width:2px;   height:2px;   opacity:.45;"></span>
  <span class="star" style="left:34%; top:45%; width:2px;   height:2px;   opacity:.5;"></span>
  <span class="star" style="left:41%; top:15%; width:2.6px; height:2.6px; opacity:.62;"></span>
  <span class="star" style="left:47%; top:37%; width:1.8px; height:1.8px; opacity:.42;"></span>
  <span class="star" style="left:54%; top:21%; width:2px;   height:2px;   opacity:.5;"></span>
  <span class="star" style="left:62%; top:33%; width:3px;   height:3px;   opacity:.72;"></span>
  <span class="star" style="left:68%; top:15%; width:2.4px; height:2.4px; opacity:.55;"></span>
  <span class="star" style="left:74%; top:44%; width:1.8px; height:1.8px; opacity:.4;"></span>
  <span class="star" style="left:86%; top:41%; width:2.4px; height:2.4px; opacity:.58;"></span>
  <span class="star" style="left:92%; top:29%; width:2px;   height:2px;   opacity:.48;"></span>
  <span class="star" style="left:4%;  top:51%; width:1.8px; height:1.8px; opacity:.4;"></span>
  <span class="star" style="left:17%; top:57%; width:2px;   height:2px;   opacity:.44;"></span>
  <span class="star" style="left:95%; top:12%; width:2px;   height:2px;   opacity:.5;"></span>
</div>
<svg class="con" viewBox="0 0 200 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <line x1="22" y1="70" x2="36" y2="60" /><line x1="36" y1="60" x2="50" y2="73" />
  <line x1="50" y1="73" x2="64" y2="58" /><line x1="64" y1="58" x2="78" y2="69" />
  <line x1="126" y1="69" x2="142" y2="72" /><line x1="142" y1="72" x2="158" y2="66" />
  <line x1="158" y1="66" x2="176" y2="71" /><line x1="176" y1="71" x2="176" y2="58" />
  <line x1="176" y1="58" x2="158" y2="53" />
  <circle cx="22" cy="70" r=".8" /><circle cx="36" cy="60" r=".8" />
  <circle cx="50" cy="73" r=".8" /><circle cx="64" cy="58" r=".8" />
  <circle cx="78" cy="69" r=".8" /><circle cx="126" cy="69" r=".8" />
  <circle cx="142" cy="72" r=".8" /><circle cx="158" cy="66" r=".8" />
  <circle cx="176" cy="71" r=".8" /><circle cx="176" cy="58" r=".8" />
  <circle cx="158" cy="53" r=".8" />
</svg>
<div class="moon"><i></i><i></i></div>
<div class="body">
  <div class="top">
    <span class="cap">{{habit-name}}</span>
    <div class="flags">
      <span class="flag flag-8h">8h+</span>
      <span class="flag flag-noon">before noon</span>
      <span class="flag flag-med">meds</span>
    </div>
  </div>
  <div>
    <div class="dur">{{duration}}</div>
    <div class="ends">
      <span>asleep<b>{{range-start}}</b></span>
      <span style="text-align:right;">woke<b>{{range-end}}</b></span>
    </div>
    <div class="span">
      <span class="seg" style="left:{{range-start-pct}}%; right:calc(100% - {{range-end-pct}}%);"></span>
      <span class="pip" style="left:{{range-start-pct}}%;"></span>
      <span class="pip" style="left:{{range-end-pct}}%;"></span>
    </div>
  </div>
</div>
</div>`;

// ── 2 · KEYBOARD — simple · categorical · habit-5 · 2×2 ──────────────────────
// The per-board COLOURWAY, which is the payload; the nine-board table lives in
// the snippet's own CSS, so a board is added by editing the snippet.
const KEYBOARD = `<div class="ks-keyboard" data-board="{{cat:keyboard_board}}">
<style>
.ks-keyboard {
  position: absolute; inset: 0; overflow: hidden;
  padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-4);
  font-family: var(--font-ui);
  background: linear-gradient(160deg,
              color-mix(in oklch, var(--habit-5), var(--panel-background) 82%),
              var(--panel-background) 68%);
  --kb-base: color-mix(in oklch, var(--habit-5), var(--text-strong) 55%);
  --kb-cap:  color-mix(in oklch, var(--habit-5), var(--panel-background) 74%);
  --kb-acc:  var(--habit-5);
}
.ks-keyboard[data-board="QK65 Classic"]     { --kb-base:#2b2b30; --kb-cap:#d8d2c4; --kb-acc:#c0392b; }
.ks-keyboard[data-board="Pavlov65"]         { --kb-base:#21303f; --kb-cap:#e7e1d2; --kb-acc:#e0a23c; }
.ks-keyboard[data-board="Neo65 CU"]         { --kb-base:#2a2732; --kb-cap:#cdd4de; --kb-acc:#6f9ec7; }
.ks-keyboard[data-board="Neo60 Cu"]         { --kb-base:#26242c; --kb-cap:#d7d1c6; --kb-acc:#7d9e6f; }
.ks-keyboard[data-board="Neo65 Core Plus"]  { --kb-base:#241f2b; --kb-cap:#ded7e6; --kb-acc:#9b6fc7; }
.ks-keyboard[data-board="Dashing Run"]      { --kb-base:#2c2622; --kb-cap:#e3d8c8; --kb-acc:#d4843c; }
.ks-keyboard[data-board="Tofu60 2.0"]       { --kb-base:#2a2a2e; --kb-cap:#cfcac0; --kb-acc:#4aa0a0; }
.ks-keyboard[data-board="Mode65"]           { --kb-base:#23272c; --kb-cap:#d2d6d8; --kb-acc:#c0506a; }
.ks-keyboard[data-board="Gingko65"]         { --kb-base:#1f2a24; --kb-cap:#d6ddd2; --kb-acc:#5fae74; }
.ks-keyboard .cap {
  font-family: var(--font-mono); font-size: var(--size-caption);
  text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted);
}
.ks-keyboard .rig {
  position: absolute; left: 7%; bottom: -7%; width: 168%;
  padding: 7px 7px 0 7px; border-radius: 9px 9px 0 0;
  display: flex; flex-direction: column; gap: 3px;
  transform: rotate(-4deg); transform-origin: 0 0;
  background: linear-gradient(150deg,
    color-mix(in oklch, var(--kb-base), var(--whimsy-moon) 16%),
    var(--kb-base) 46%,
    color-mix(in oklch, var(--kb-base), #000 18%));
  box-shadow: 0 -1px 0 color-mix(in oklch, var(--kb-base), var(--whimsy-moon) 34%) inset,
              0 10px 26px color-mix(in oklch, var(--kb-base), transparent 58%);
}
.ks-keyboard .krow { display: flex; gap: 3px; }
.ks-keyboard .k {
  flex: var(--u, 1) 1 0; height: 19px; border-radius: 3px 3px 4px 4px;
  background: linear-gradient(180deg,
    color-mix(in oklch, var(--kb-cap), var(--whimsy-moon) 34%) 0 34%,
    var(--kb-cap) 78%,
    color-mix(in oklch, var(--kb-cap), var(--kb-base) 30%));
  box-shadow: 0 1px 2px color-mix(in oklch, #000, transparent 74%);
}
.ks-keyboard .k.mod {
  background: linear-gradient(180deg,
    color-mix(in oklch, var(--kb-base), var(--whimsy-moon) 30%) 0 34%,
    color-mix(in oklch, var(--kb-base), var(--whimsy-moon) 16%) 78%,
    color-mix(in oklch, var(--kb-base), #000 12%));
}
.ks-keyboard .k.acc {
  background: linear-gradient(180deg,
    color-mix(in oklch, var(--kb-acc), var(--whimsy-moon) 26%) 0 34%,
    var(--kb-acc) 78%,
    color-mix(in oklch, var(--kb-acc), #000 22%));
}
.ks-keyboard .u125 { --u: 1.25; } .ks-keyboard .u15 { --u: 1.5; }
.ks-keyboard .u175 { --u: 1.75; } .ks-keyboard .u2 { --u: 2; }
.ks-keyboard .u225 { --u: 2.25; } .ks-keyboard .u625 { --u: 6.25; }
.ks-keyboard .board {
  font-family: var(--font-heading); font-size: var(--size-subheading);
  font-weight: var(--weight-bold); line-height: var(--line-tight); color: var(--text-strong);
}
.ks-keyboard .foot {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: var(--space-4); margin-top: var(--space-2);
}
.ks-keyboard .words {
  font-family: var(--font-mono); font-size: var(--size-small);
  font-weight: var(--weight-bold); color: var(--habit-5); white-space: nowrap;
}
</style>
<span class="cap">{{habit-name}}</span>
<div>
  <div class="board">{{cat:keyboard_board}}</div>
  <div class="foot">
    <span class="words">{{value}} {{unit}}</span>
  </div>
</div>
<div class="rig">
  <div class="krow">
    <i class="k acc"></i><i class="k"></i><i class="k"></i><i class="k"></i><i class="k"></i>
    <i class="k"></i><i class="k"></i><i class="k"></i><i class="k"></i><i class="k"></i>
    <i class="k"></i><i class="k"></i><i class="k"></i><i class="k mod u2"></i><i class="k mod"></i>
  </div>
  <div class="krow">
    <i class="k mod u15"></i><i class="k"></i><i class="k"></i><i class="k"></i><i class="k"></i>
    <i class="k"></i><i class="k"></i><i class="k"></i><i class="k"></i><i class="k"></i>
    <i class="k"></i><i class="k"></i><i class="k"></i><i class="k mod u15"></i><i class="k mod"></i>
  </div>
  <div class="krow">
    <i class="k mod u175"></i><i class="k"></i><i class="k"></i><i class="k"></i><i class="k"></i>
    <i class="k"></i><i class="k"></i><i class="k"></i><i class="k"></i><i class="k"></i>
    <i class="k"></i><i class="k"></i><i class="k mod u225"></i><i class="k mod"></i>
  </div>
  <div class="krow">
    <i class="k mod u225"></i><i class="k"></i><i class="k"></i><i class="k"></i><i class="k"></i>
    <i class="k"></i><i class="k"></i><i class="k"></i><i class="k"></i><i class="k"></i>
    <i class="k"></i><i class="k mod u175"></i><i class="k mod"></i><i class="k mod"></i>
  </div>
  <div class="krow">
    <i class="k mod u125"></i><i class="k mod u125"></i><i class="k mod u125"></i>
    <i class="k u625"></i><i class="k mod u125"></i><i class="k mod u125"></i>
    <i class="k mod"></i><i class="k mod"></i><i class="k mod"></i><i class="k mod"></i>
  </div>
</div>
</div>`;

// ── 3 · WALKING — simple · measureless · habit-7 · 2×2 ───────────────────────
// The one art the ruling lets carry no number: measureless, so the walk itself
// is the record and {{habit-name}} satisfies the data-placeholder rule.
const WALKING = `<div class="ks-walking">
<style>
.ks-walking {
  position: absolute; inset: 0; overflow: hidden;
  padding: var(--space-6); display: flex; flex-direction: column; justify-content: space-between;
  font-family: var(--font-ui);
  background: radial-gradient(120% 100% at 15% 100%,
              color-mix(in oklch, var(--habit-7), var(--panel-background) 72%),
              var(--panel-background) 72%);
}
.ks-walking .foot {
  position: absolute; width: 9px; height: 21px;
  transform-origin: center; opacity: .5;
}
.ks-walking .foot i {
  position: absolute; border-radius: 50%;
  background: color-mix(in oklch, var(--habit-7), var(--text-strong) 12%);
}
.ks-walking .foot i:first-child { top: 0; left: 0; width: 9px; height: 13.5px; }
.ks-walking .foot i:last-child  { top: 16px; left: 2px; width: 5.4px; height: 6px; }
.ks-walking .f1 { left: 16%; top: 78%; transform: rotate(41deg) scale(1);    opacity: .34; }
.ks-walking .f2 { left: 33%; top: 66%; transform: rotate(59deg) scale(1.1);  opacity: .48; }
.ks-walking .f3 { left: 50%; top: 54%; transform: rotate(41deg) scale(1.2);  opacity: .62; }
.ks-walking .f4 { left: 66%; top: 42%; transform: rotate(59deg) scale(1.3);  opacity: .76; }
.ks-walking .end {
  position: absolute; left: 80%; top: 30%; width: 40px; height: 40px;
  transform: translate(-50%, -50%); border-radius: 50%;
  background: var(--habit-7);
  box-shadow: 0 0 0 8px color-mix(in oklch, var(--habit-7), transparent 84%),
              0 4px 14px color-mix(in oklch, var(--habit-7), transparent 55%);
  display: flex; align-items: center; justify-content: center;
  animation: ks-walk-pulse 2.4s ease-in-out infinite;
}
@keyframes ks-walk-pulse {
  0%, 100% { box-shadow: 0 0 0 8px  color-mix(in oklch, var(--habit-7), transparent 84%),
                         0 4px 14px color-mix(in oklch, var(--habit-7), transparent 55%); }
  50%      { box-shadow: 0 0 0 15px color-mix(in oklch, var(--habit-7), transparent 92%),
                         0 4px 14px color-mix(in oklch, var(--habit-7), transparent 45%); }
}
@media (prefers-reduced-motion: reduce) { .ks-walking .end { animation: none; } }
.ks-walking .end svg { width: 20px; height: 20px; }
.ks-walking .cap {
  position: relative; z-index: 2;
  font-family: var(--font-mono); font-size: var(--size-caption);
  text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted);
}
.ks-walking .verb {
  position: relative; z-index: 2;
  font-family: var(--font-heading); font-size: var(--size-display);
  font-weight: var(--weight-bold); letter-spacing: -.02em; color: var(--text-strong);
}
</style>
<span class="foot f1"><i></i><i></i></span>
<span class="foot f2"><i></i><i></i></span>
<span class="foot f3"><i></i><i></i></span>
<span class="foot f4"><i></i><i></i></span>
<span class="end">
  <svg viewBox="0 0 24 24" fill="none" style="stroke: var(--text-on-filled);"
       stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
</span>
<span class="cap">{{habit-name}}</span>
<span class="verb">Walked</span>
</div>`;

// ── 4 · EMBROIDERY — simple · measured (time) · habit-8 · 2×2 ────────────────
// Aida cloth derived from the habit slot over the panel, so it is pale linen on
// the Default and dusky on Void — in register with the theme, never inverted.
const EMBROIDERY = `<div class="ks-embroidery">
<style>
.ks-embroidery {
  position: absolute; inset: 0; overflow: hidden;
  padding: var(--space-7); display: flex; flex-direction: column;
  font-family: var(--font-ui);
  background:
    repeating-linear-gradient(0deg,
      color-mix(in oklch, var(--habit-8), transparent 88%) 0 1px, transparent 1px 11px),
    repeating-linear-gradient(90deg,
      color-mix(in oklch, var(--habit-8), transparent 88%) 0 1px, transparent 1px 11px),
    linear-gradient(155deg,
      color-mix(in oklch, var(--habit-8), var(--panel-background) 84%),
      var(--panel-background) 76%);
}
.ks-embroidery .hoop, .ks-embroidery .hoop-in {
  position: absolute; border-radius: 50%; pointer-events: none;
}
.ks-embroidery .hoop {
  right: -62px; top: -62px; width: 196px; height: 196px;
  border: 10px solid color-mix(in oklch, var(--habit-8), transparent 62%);
  box-shadow: 0 0 46px color-mix(in oklch, var(--habit-8), transparent 78%);
}
.ks-embroidery .hoop-in {
  right: -52px; top: -52px; width: 176px; height: 176px;
  border: 3px solid color-mix(in oklch, var(--habit-8), transparent 78%);
}
.ks-embroidery .frame {
  position: absolute; inset: 10px; border-radius: 8px; pointer-events: none;
  border: 2px dashed color-mix(in oklch, var(--habit-8), transparent 66%);
}
.ks-embroidery .cap {
  position: relative; z-index: 2;
  font-family: var(--font-mono); font-size: var(--size-caption);
  text-transform: uppercase; letter-spacing: .06em;
  color: color-mix(in oklch, var(--habit-8), var(--text-muted) 40%);
}
.ks-embroidery .mid {
  position: relative; z-index: 2; flex: 1;
  display: flex; flex-direction: column; justify-content: center;
}
.ks-embroidery .num {
  font-family: var(--font-heading); font-size: 58px; line-height: .86;
  font-weight: var(--weight-bold); letter-spacing: -.03em; color: var(--text-strong);
}
.ks-embroidery .num span {
  font-size: var(--size-subheading); font-weight: var(--weight-medium);
  color: color-mix(in oklch, var(--habit-8), var(--text-secondary) 30%); margin-left: var(--space-3);
}
.ks-embroidery .rule {
  width: 110px; height: 0; margin-top: var(--space-4);
  border-bottom: 3px dashed color-mix(in oklch, var(--habit-8), transparent 22%);
}
.ks-embroidery .sub {
  font-family: var(--font-mono); font-size: var(--size-caption);
  color: var(--text-muted); margin-top: var(--space-5);
}
.ks-embroidery .stitches {
  position: relative; z-index: 2; display: flex; gap: var(--space-4); margin-top: var(--space-5);
}
.ks-embroidery .x { position: relative; display: block; width: 13px; height: 13px; }
.ks-embroidery .x::before, .ks-embroidery .x::after {
  content: ""; position: absolute; top: 50%; left: 0; width: 100%; height: 2.4px;
  border-radius: 2px; background: color-mix(in oklch, var(--habit-8), transparent 18%);
}
.ks-embroidery .x::before { transform: translateY(-50%) rotate(45deg); }
.ks-embroidery .x::after  { transform: translateY(-50%) rotate(-45deg); }
</style>
<span class="hoop"></span><span class="hoop-in"></span><span class="frame"></span>
<span class="cap">&#10005; {{habit-name}}</span>
<div class="mid">
  <div class="num">{{value}}<span>{{unit}}</span></div>
  <div class="rule"></div>
  <div class="sub">stitched today</div>
</div>
<div class="stitches">
  <span class="x"></span><span class="x"></span><span class="x"></span>
  <span class="x"></span><span class="x"></span><span class="x"></span>
</div>
</div>`;

// ── 5 · DRAWING — simple · measured (time) · habit-9 · 2×2 ───────────────────
// A ruled sketchbook page: margin line, corner cross-hatch, a drawn pencil, and
// the minutes with the old tile's signature ghost copy behind them.
const DRAWING = `<div class="ks-drawing">
<style>
.ks-drawing {
  position: absolute; inset: 0; overflow: hidden;
  padding: var(--space-7) var(--space-7) var(--space-7) 44px;
  display: flex; flex-direction: column; font-family: var(--font-ui);
  background:
    repeating-linear-gradient(0deg, transparent 0 27px,
      color-mix(in oklch, var(--habit-9), transparent 86%) 27px 28px),
    linear-gradient(155deg,
      color-mix(in oklch, var(--habit-9), var(--panel-background) 88%),
      var(--panel-background) 74%);
}
.ks-drawing .hatch {
  position: absolute; right: 0; bottom: 0; width: 190px; height: 190px; pointer-events: none;
  background:
    repeating-linear-gradient(45deg,
      color-mix(in oklch, var(--habit-9), transparent 72%) 0 1.5px, transparent 1.5px 8px),
    repeating-linear-gradient(-45deg,
      color-mix(in oklch, var(--habit-9), transparent 82%) 0 1.5px, transparent 1.5px 11px);
  -webkit-mask-image: radial-gradient(150% 130% at 100% 100%, #000, transparent 70%);
          mask-image: radial-gradient(150% 130% at 100% 100%, #000, transparent 70%);
}
.ks-drawing .margin {
  position: absolute; left: 30px; top: 0; bottom: 0; width: 1.5px;
  background: color-mix(in oklch, var(--habit-9), var(--text-strong) 22%); opacity: .55;
}
.ks-drawing .pencil {
  position: absolute; right: 4px; top: 18px; width: 150px; height: 16px;
  transform: rotate(40deg); transform-origin: right center; pointer-events: none;
}
.ks-drawing .pencil .barrel {
  position: absolute; left: 16px; right: 20px; top: 0; bottom: 0; border-radius: 2px;
  background: linear-gradient(180deg,
              color-mix(in oklch, var(--habit-9), var(--whimsy-moon) 34%), var(--habit-9));
  box-shadow: 0 3px 7px rgba(0,0,0,.28);
}
.ks-drawing .pencil .wood {
  position: absolute; left: 0; top: 0; width: 0; height: 0;
  border-top: 8px solid transparent; border-bottom: 8px solid transparent;
  border-right: 16px solid var(--whimsy-parchment);
}
.ks-drawing .pencil .lead {
  position: absolute; left: 9px; top: 4px; width: 0; height: 0;
  border-top: 4px solid transparent; border-bottom: 4px solid transparent;
  border-right: 7px solid var(--text-strong);
}
.ks-drawing .pencil .eraser {
  position: absolute; right: 0; top: -1px; width: 18px; height: 18px; border-radius: 3px;
  background: color-mix(in oklch, var(--habit-9), var(--habit-7) 62%);
}
.ks-drawing .cap {
  position: relative; z-index: 2;
  font-family: var(--font-mono); font-size: var(--size-caption);
  text-transform: uppercase; letter-spacing: .06em;
  color: color-mix(in oklch, var(--habit-9), var(--text-muted) 40%);
}
.ks-drawing .mid {
  position: relative; z-index: 2; flex: 1;
  display: flex; flex-direction: column; justify-content: center;
}
.ks-drawing .num {
  position: relative; font-family: var(--font-heading); font-size: 62px;
  line-height: .84; font-weight: var(--weight-bold); letter-spacing: -.03em; height: 54px;
}
.ks-drawing .num .ghost {
  position: absolute; left: 3px; top: 4px;
  color: color-mix(in oklch, var(--habit-9), transparent 52%);
}
.ks-drawing .num .real { position: relative; color: var(--text-strong); }
.ks-drawing .num span {
  font-size: var(--size-subheading); font-weight: var(--weight-medium);
  color: color-mix(in oklch, var(--habit-9), var(--text-secondary) 30%); margin-left: var(--space-3);
}
.ks-drawing .swipe {
  width: 128px; height: 7px; margin-top: var(--space-4); border-radius: 6px;
  background: color-mix(in oklch, var(--habit-9), transparent 34%);
  transform: skewX(-12deg);
}
.ks-drawing .sub {
  font-family: var(--font-mono); font-size: var(--size-caption);
  color: var(--text-muted); margin-top: var(--space-5);
}
</style>
<span class="hatch"></span><span class="margin"></span>
<span class="pencil">
  <i class="wood"></i><i class="lead"></i><i class="barrel"></i><i class="eraser"></i>
</span>
<span class="cap">&#9998; {{habit-name}}</span>
<div class="mid">
  <div class="num"><span class="ghost">{{value}}</span><span class="real">{{value}}</span><span>{{unit}}</span></div>
  <div class="swipe"></div>
  <div class="sub">sketched today</div>
</div>
</div>`;

// ── 6 · CODING — simple · categorical · habit-10 · 2×2 ───────────────────────
// An editor window that writes the session out as source. The window dots and
// syntax read the MEANING-FREE `--cat-*` series, never other habits' identity
// slots (fixed 2026-07-26 — do not "restore" them); `--habit-10` stays because
// it is Coding's own.
const CODING = `<div class="ks-coding">
<style>
.ks-coding {
  position: absolute; inset: 0; overflow: hidden;
  display: flex; flex-direction: column; font-family: var(--font-ui);
  background: linear-gradient(160deg,
              color-mix(in oklch, var(--habit-10), var(--panel-background) 88%),
              var(--panel-background) 72%);
}
.ks-coding .chrome {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-5) var(--space-6);
  border-bottom: var(--border-hairline) solid color-mix(in oklch, var(--habit-10), transparent 82%);
  background: color-mix(in oklch, var(--habit-10), var(--panel-background) 92%);
}
.ks-coding .dot { width: 10px; height: 10px; border-radius: 50%; }
.ks-coding .d1 { background: color-mix(in oklch, var(--cat-6), transparent 20%); }
.ks-coding .d2 { background: color-mix(in oklch, var(--cat-3), transparent 20%); }
.ks-coding .d3 { background: var(--habit-10); }
.ks-coding .file {
  margin-left: var(--space-3); font-family: var(--font-mono);
  font-size: var(--size-caption); color: var(--text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ks-coding .src {
  flex: 1; padding: var(--space-6);
  font-family: var(--font-mono); font-size: 13px; line-height: 1.85;
}
.ks-coding .ln { display: flex; min-width: 0; }
.ks-coding .ln > b {
  width: 20px; flex-shrink: 0; text-align: right; padding-right: 10px;
  font-weight: var(--weight-regular); color: color-mix(in oklch, var(--text-muted), transparent 45%);
}
.ks-coding .ln > span {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--text-secondary);
}
.ks-coding .cmt { color: color-mix(in oklch, var(--text-muted), transparent 20%); }
.ks-coding .kw  { color: var(--habit-10); }
.ks-coding .key { color: var(--text-secondary); }
.ks-coding .str { color: var(--cat-2); }
.ks-coding .val { color: var(--cat-4); }
.ks-coding .caret {
  display: inline-block; width: 7px; height: 14px; vertical-align: -2px;
  margin-left: 3px; background: var(--habit-10);
  box-shadow: 0 0 8px color-mix(in oklch, var(--habit-10), transparent 40%);
}
.ks-coding .foot {
  display: flex; align-items: baseline; gap: var(--space-4);
  padding: 0 var(--space-6) var(--space-6); min-width: 0;
}
.ks-coding .dur {
  font-family: var(--font-heading); font-size: var(--size-heading);
  font-weight: var(--weight-bold); color: var(--text-strong); white-space: nowrap;
}
.ks-coding .note {
  font-family: var(--font-mono); font-size: var(--size-caption);
  color: color-mix(in oklch, var(--habit-10), var(--text-muted) 40%);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
}
</style>
<div class="chrome">
  <span class="dot d1"></span><span class="dot d2"></span><span class="dot d3"></span>
  <span class="file">{{date}}.ts</span>
</div>
<div class="src">
  <div class="ln"><b>1</b><span class="cmt">// daily note</span></div>
  <div class="ln"><b>2</b><span><span class="kw">const</span> session = {</span></div>
  <div class="ln"><b>3</b><span>&nbsp;&nbsp;<span class="key">language</span>: <span class="str">"{{cat:coding_language}}"</span>,</span></div>
  <div class="ln"><b>4</b><span>&nbsp;&nbsp;<span class="key">minutes</span>: <span class="val">{{value}}</span>,</span></div>
  <div class="ln"><b>5</b><span>}<i class="caret"></i></span></div>
</div>
<div class="foot">
  <span class="dur">{{duration}}</span>
  <span class="note">// {{cat:coding_language}}</span>
</div>
</div>`;

/** Keyed by habit `key`; batch 6 plants exactly these. */
export const KEEPSAKE_SEEDS: KeepsakeSeed[] = [
  { key: "sleep", snippet: SLEEP },
  { key: "keyboard", snippet: KEYBOARD },
  { key: "walking", snippet: WALKING },
  { key: "embroidery", snippet: EMBROIDERY },
  { key: "drawing", snippet: DRAWING },
  { key: "coding", snippet: CODING },
];
