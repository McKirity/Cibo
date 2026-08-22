# Theme authoring

The developer-side companion to the template's own README
(`src-tauri/resources/themes/_theme-template/README.md`), which is the full *package* spec —
files, ambience surfaces, the slideshow, motion, fonts, the dial sheet, rules, and the override
layer. **Read that first; this page carries what it does not:** the slot catalog, the full
manifest key set, how the loader treats a theme, and the laws a theme's CSS is held to. Written
at the v1.0.0 docs pass (2026-08-21).

## How a theme reaches the app

- **Two roots, one code path** (`src/theme/loader.ts`): the bundled directory
  (`src-tauri/resources/themes/` — Default, Void, and the `_theme-template`) and
  `<cloud root>/themes/`. A bundled name shadows a drop-in of the same name. Folders starting
  with `_` are skipped.
- **The pick is per device** (`cibo.theme`). A missing pick falls back to the Default with a
  one-time notice; **the Default is the ultimate fallback** — its sheet is statically imported
  in `bootstrap.tsx` as the lowest cascade layer, so a partial or broken theme degrades dial by
  dial rather than failing.
- **The sheet is injected as inline text, after every bundled stylesheet.** Two consequences:
  only the active theme's rules ever load (cross-theme leaking is impossible), and **a relative
  `url()` in `theme.css` resolves against the document, not the theme folder** — it silently
  404s. Fonts go through `fonts/`, ornament through `decoration/` (the channel hands out
  `blob:` URLs); an inline `data:` URI is the only in-sheet transport for a small mark.
- The Appearance pane scans the roots once per mount; a theme dropped in while the pane is
  open needs a step out and back. Ambience sets are scanned at theme apply.

## The dial sheet

`theme.css` is a `:root {}` block of **255 custom properties** — the roster — optionally
followed by the theme's own rules. The template carries every dial with the Default's values,
grouped: chrome · type · space · shape · effects · icons · the colour registry (12 habit slots,
12 month slots, heat ramp, categorical ramp, verdict and finalize colours, the attention dot) ·
motion · frame dims · frame clearances · the per-screen structural sizes · the rail's own
register · the whimsy interior palette.

- **Parity is checked as a set, not a count** — a sheet may carry private extra dials (prefix
  them; several shipped themes carry dozens).
- **Two derived families are published by the app at apply time**, never transcribed by hand:
  `--heat-bg-1..4` and `--cat-bg-1..4` from the two ramps.
- **The hue handoff**: surfaces whose colour is data (a habit's swatch, a chart series) receive
  it as a custom property (`--habit-hue`, `--series`, `--pal-hue`, `--trend-hue`) rather than an
  inline background, precisely so a theme rule can reach them. If a theme rule "does nothing" on
  a coloured surface, check for an inline background first.
- **Type is a bounded lever**: ~±12% per step and comparable-width families. Beyond that, layouts
  need structural re-accommodation, which a theme cannot do.
- **`--font-mono` may not be dead**: a theme without a mono face points the dial at its body
  face and gets tabular figures from the app.

## The surface ladder and the two reduce-effects laws

Three surface tiers, separated by a *value step* and never by an effect: shell
(`--raised-background`, opaque) · content (`--panel-background`) · well (`--inset-background`).
No surface may be derived by fading another toward transparent. **The test is the
reduce-effects toggle on and off**: under `.reduce-effects`, pure decoration disappears and
anything carrying meaning must flatten to a solid. A theme that makes panels translucent owes an
opaque twin under reduce-effects, and must honour the user's *Force-opaque panels* switch.

## The layout law

*Nothing in a theme may move or resize an element in the app's layout flow.* Legal: backgrounds,
borders, shadows, ink, opacity, text treatment, out-of-flow pseudo-elements positioned anywhere,
non-reflowing transforms, and declared self-cancelling pairs (a padding with an equal negative
margin). Illegal: in-flow padding/margin/width/height/display changes, and **any override of a
size that carries data** (a chart bar's minimum width changes what the chart says). The app's
class names are its own and may change between versions; a rule keyed on one can stop painting
after an update — the stylesheets under `src/` are the hook list.

## Ambience

Two surfaces, `backdrop` and `timer`, each either a single still, a still + motion (a
`_loop.mp4` *or* a `_loop/` folder of patch loops — never both), or a **set** (`backdrops/`,
`timers/`) played as a shuffled slideshow. Crop law: the main backdrop pins its right corners to
the window's right corners; the timer backdrop is dead centre to dead centre — computed in
`Ambience.tsx`, never CSS percentages. The set wins over a loose file. Accepted still formats:
png · jpg · jpeg · webp · avif · svg. Only the showing picture and the preloaded next are ever
decoded. The template README has the user-facing detail and the per-device settings.

## Decoration — the slot catalog

`decoration/manifest.json` names which of the **25 slots** the theme's assets fill. Slot ids:

| Family | Slot ids |
|---|---|
| Frames (9-slice) | `frame-seam` (the rail's seam band — consumed as a `repeat-y` background, not a border) · `frame-panel` · `frame-headliner` · `frame-tile` · `frame-habit-card` · `frame-tool-card` · `frame-daily-log` · `frame-whimsy` · `frame-modal` · `frame-dialog` · `frame-palette` |
| Strips | `strip-titlebar` · `strip-divider` · `strip-flourish` |
| Data slots | `fill-daily-log` · `fill-bar` · `fill-timer` · `stamp-bartip` · `pattern-heatcell` · `stamp-cadence` · `stamp-row` |
| Stamps / accents | `stamp-finalize-day` · `stamp-bullet` · `stamp-empty` · `stamp-milestone` · `button-finalize` |

Three are declared but **not yet wired to a surface** (`strip-divider`, `fill-timer`,
`stamp-bartip`) — a manifest naming one gets a console warning. Two are **tint-only**
(`stamp-finalize-day`, `stamp-bullet`) — an asset on them is ignored with a warning.

### Manifest keys, per slot

```jsonc
{
  "override": true,                 // optional — hand the whole set to override.json
  "slots": {
    "<slot-id>": {
      "off": true,                  // leave the slot bare
      "tint": "--finalize-mark",    // the dial a tintable stamp pours through
      "asset": "frame-panel.svg",   // file relative to decoration/
      "slice": 16,                  // frames only, REQUIRED: 9-slice inset in image px, or [t,r,b,l]
      "fill": true,                 // frames: also paint the middle (default: clear)
      "repeat": "round",            // frames: stretch (default) | repeat | round | space
      "outset": 8,                  // frames: paint this many px OUTSIDE the box; reflows nothing
      "replace": true               // stamp-milestone ONLY: the asset IS the icon
    }
  }
}
```

- **A frame's thickness is never in the manifest.** It is the role's own `--frame-clear-*` dial
  — the clearance the layouts already reserve (modal/palette 28px · panel/headliner/dialog 24 ·
  strip 20 · tile 16 · tool card + whimsy 12 · habit card 8 · the seam band 72). `slice` says
  which part of the image is border; the art may be any resolution. (`scale` was retired.)
- **`replace: true`** publishes `--deco-stamp-milestone-replace: none`, which hides the
  code-drawn medal/landmark glyph so the stamp is the icon; the stamp paints `contain`. Without
  it a stamp sits *behind* the glyph (a bezel).
- **Assets are authored 1× logical, vector-first, raster at 2×**; stamps ride the UI-scale lever.
- **The override layer** (`override.json`) replaces the set wholesale — an unnamed slot goes
  bare; a broken override falls back to the theme's own set.
- **Roles are spelled in class names, and class names are not roles**: the cover wall's tiles
  and every dropdown/popover are deliberately un-claimed, so no slot reaches them.

## Checking a theme

There is no validator. What the shipped themes were checked with:

1. Load it; the console reports missing dials, set-vs-loose-file slips, unknown slots.
2. Walk the app with **reduce-effects on and off** and with **Force-opaque panels on**.
3. Walk it at the narrow canvas (Settings → Developer → Screen [MacBook]) — `small.css`
   re-composes several screens and a theme's rules meet different boxes there.
4. A contrast probe cannot see a stroked glyph or an inline fill; classify residues by eye.
5. On a Mac, set UI scale to 85 before judging anything — it is the platform default.
